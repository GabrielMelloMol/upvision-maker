import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { endTour, startTour, tourFor, tourSeen, useOpenTour, type Tour, type TourStep } from "../help/tours";

/** Espera a abertura e os modais saírem antes de começar (nunca abre sobre um modal). */
const POLL_MS = 400;
/** Tela carregada sob demanda pode demorar: espera até ~20 s o 1º alvo aparecer. */
const MAX_POLLS = 50;
const PAD = 6;
const GAP = 12;
const POP_W = 300;
/** Altura que o balão precisa para caber embaixo ou em cima do alvo. */
const POP_SPACE = 170;
/** Passo "digite aqui": avança sozinho um pouco depois de a pessoa parar de digitar. */
const TYPED_MS = 900;

const nameOf = (el: Element) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();

/** Acha o alvo do passo na tela (visível), ou null para pular o passo. */
function findTarget(s: TourStep): HTMLElement | null {
  let el: HTMLElement | null = null;
  if (s.sel) el = document.querySelector<HTMLElement>(s.sel);
  else if (s.button) el = [...document.querySelectorAll<HTMLElement>("main button, main a, .toolbar button, .sidebar button")].find((b) => nameOf(b).startsWith(s.button!)) ?? null;
  else if (s.field) {
    el = document.querySelector<HTMLElement>(`main [aria-label="${CSS.escape(s.field)}"]`);
    const label = el ? null : [...document.querySelectorAll("main label")].find((l) => (l.textContent ?? "").trim().startsWith(s.field!));
    if (label) el = (label as HTMLLabelElement).control ?? label.querySelector<HTMLElement>("input, select, textarea, button");
  }
  return el && el.getClientRects().length ? el : null;
}

/** Na 1ª visita à tela: começa o tour dela quando não há abertura nem modal na frente. */
export default function TourHost({ pageId }: { pageId: string }) {
  const open = useOpenTour();
  useEffect(() => {
    if (!tourFor(pageId) || tourSeen(pageId)) return;
    let polls = 0;
    const t = setInterval(() => {
      if (++polls > MAX_POLLS) return clearInterval(t);
      if (document.getElementById("splash") || document.querySelector("dialog[open]")) return;
      if (!tourFor(pageId)!.steps.some((s) => !s.optional && findTarget(s))) return; // a tela ainda não montou
      clearInterval(t);
      startTour(pageId);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [pageId]);
  const tour = open ? tourFor(open) : undefined;
  return tour ? <TourRun key={tour.id} tour={tour} /> : null;
}

type Spot = { x: number; y: number; w: number; h: number };

/** Um passo cujo alvo ainda não está na tela (abriu depois de um clique, por exemplo) espera até aqui; depois é pulado e registrado. */
const RESOLVE_POLLS = 30;
const RESOLVE_MS = 100;

/** Registro dos passos pulados, lido pelo teste que percorre todos os tours (um alvo que sumiu da tela é bug). */
function reportSkipped(tour: Tour, i: number): void {
  const root = document.documentElement.dataset;
  const key = tour.steps[i].optional ? "tourSkippedOptional" : "tourSkipped";
  root[key] = `${root[key] ?? ""}${tour.id}:${i + 1};`;
  if (!tour.steps[i].optional) console.warn(`Tour "${tour.id}": o passo ${i + 1} (“${tour.steps[i].text}”) não achou o alvo na tela.`);
}

function TourRun({ tour }: { tour: Tour }) {
  const steps = tour.steps;
  const [i, setI] = useState(0);
  const [found, setFound] = useState<{ i: number; el: HTMLElement } | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const cur = useMemo(() => (found && found.i === i ? { s: steps[i], el: found.el } : null), [found, i, steps]); // estável: os efeitos abaixo dependem dele
  const last = i === steps.length - 1;
  const next = () => (last ? endTour() : setI(i + 1));

  // sinal para os testes: enquanto o tour roda (mesmo entre dois balões), <html data-tour-open> traz o id
  useEffect(() => {
    document.documentElement.dataset.tourOpen = tour.id;
    return () => void delete document.documentElement.dataset.tourOpen;
  }, [tour.id]);

  // acha o alvo do passo atual (ele pode aparecer depois do clique no passo anterior); se não vier, pula e registra
  useEffect(() => {
    let polls = 0;
    const t = setInterval(() => {
      const el = findTarget(steps[i]);
      if (el) {
        clearInterval(t);
        setFound({ i, el });
      } else if (++polls > RESOLVE_POLLS) {
        clearInterval(t);
        reportSkipped(tour, i);
        if (i === steps.length - 1) endTour();
        else setI(i + 1);
      }
    }, RESOLVE_MS);
    return () => clearInterval(t);
  }, [i, steps, tour]);

  // acompanha o alvo (rolagem, janela mudando de tamanho)
  useLayoutEffect(() => {
    if (!cur) return;
    cur.el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    let raf = 0;
    const measure = () => {
      const r = cur.el.getBoundingClientRect();
      setSpot((p) => (p && p.x === r.left && p.y === r.top && p.w === r.width && p.h === r.height ? p : { x: r.left, y: r.top, w: r.width, h: r.height }));
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [cur]);

  // passo interativo: espera o clique ou a digitação de verdade
  useEffect(() => {
    if (!cur?.s.wait) {
      pop.current?.querySelector<HTMLElement>("[data-next]")?.focus();
      return;
    }
    let t = 0;
    const onClick = () => next();
    const onInput = () => {
      clearTimeout(t);
      t = window.setTimeout(next, TYPED_MS);
    };
    if (cur.s.wait === "input") cur.el.focus();
    cur.el.addEventListener(cur.s.wait === "click" ? "click" : "input", cur.s.wait === "click" ? onClick : onInput);
    return () => {
      clearTimeout(t);
      cur.el.removeEventListener("click", onClick);
      cur.el.removeEventListener("input", onInput);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

  // teclado: Esc sai, Enter/→ avança, ← volta; Tab fica no balão (e no alvo do passo interativo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inTarget = !!cur && cur.el.contains(e.target as Node);
      if (e.key === "Escape") {
        e.preventDefault();
        endTour();
      } else if ((e.key === "Enter" || e.key === "ArrowRight") && !inTarget && !(e.target as HTMLElement).closest?.("button")) {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" && !inTarget && i > 0) {
        setI(i - 1);
      } else if (e.key === "Tab" && pop.current) {
        const items = [...(cur?.s.wait ? [cur.el] : []), ...pop.current.querySelectorAll<HTMLElement>("button")];
        const at = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!cur || !spot) return null;
  const hole = { x: spot.x - PAD, y: spot.y - PAD, w: spot.w + PAD * 2, h: spot.h + PAD * 2 };
  const W = window.innerWidth;
  const H = window.innerHeight;
  // embaixo, em cima ou (alvo alto, como a barra lateral) à direita
  const side = H - (hole.y + hole.h) > POP_SPACE ? "below" : hole.y > POP_SPACE ? "above" : "right";
  const left = side === "right" ? Math.min(hole.x + hole.w + GAP, W - POP_W - 12) : Math.min(Math.max(12, hole.x + hole.w / 2 - POP_W / 2), W - POP_W - 12);
  const top = side === "right" ? Math.min(Math.max(12, hole.y + 24), H - POP_SPACE) : hole.y + hole.h + GAP;
  const arrow = side === "right" ? 28 : Math.min(Math.max(16, hole.x + hole.w / 2 - left), POP_W - 16);
  const block = `path(evenodd, "M0 0H${W}V${H}H0Z M${hole.x} ${hole.y}h${hole.w}v${hole.h}h${-hole.w}Z")`;
  return createPortal(
    <div className="tour">
      {/* fora do recorte, os cliques não passam; dentro, a pessoa usa o app de verdade */}
      <div className="tour-block" style={{ clipPath: block }} onMouseDown={(e) => e.preventDefault()} />
      <div className="tour-spot" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />
      <div
        ref={pop}
        className="tour-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-text"
        data-side={side}
        style={{ left, top: side === "above" ? undefined : top, bottom: side === "above" ? H - hole.y + GAP : undefined, width: POP_W, ["--arrow" as string]: `${arrow}px` }}
      >
        <button type="button" className="ghost icon-only sm tour-close" aria-label="Fechar o tour" onClick={endTour}>
          <X aria-hidden />
        </button>
        <p id="tour-text" aria-live="polite">
          {cur.s.text}
        </p>
        <div className="tour-actions">
          <span className="muted">
            {i + 1} de {steps.length}
          </span>
          <button type="button" className="link" onClick={endTour}>
            Pular
          </button>
          {i > 0 && (
            <button type="button" onClick={() => setI(i - 1)}>
              Voltar
            </button>
          )}
          <button type="button" className="primary" data-next onClick={next}>
            {last ? "Concluir" : "Próximo"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
