import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { endTour, startTour, tourFor, tourSeen, useOpenTour, type Tour, type TourStep } from "../help/tours";

/** Espera a abertura e os modais saírem antes de começar (nunca abre sobre um modal). */
const POLL_MS = 400;
const MAX_POLLS = 25;
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
      clearInterval(t);
      startTour(pageId);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [pageId]);
  const tour = open ? tourFor(open) : undefined;
  return tour ? <TourRun key={tour.id} tour={tour} /> : null;
}

type Spot = { x: number; y: number; w: number; h: number };

function TourRun({ tour }: { tour: Tour }) {
  // só os passos cujo alvo está na tela agora
  const [steps] = useState(() => tour.steps.map((s) => ({ s, el: findTarget(s) })).filter((x): x is { s: TourStep; el: HTMLElement } => !!x.el));
  const [i, setI] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const cur = steps[i];
  const last = i === steps.length - 1;
  const next = () => (last ? endTour() : setI(i + 1));

  useEffect(() => {
    if (!steps.length) endTour();
  }, [steps.length]);

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
