import { Camera, Contrast, Download, FileText, Smartphone, Sun, ZoomIn, type LucideIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import Alert from "../ui/Alert";
import Card from "../ui/Card";
import Dropzone from "../ui/Dropzone";
import NumField from "../ui/NumField";
import Segmented from "../ui/Segmented";
import { saveFile } from "../ui/saveFile";
import { errorText, useToast } from "../ui/Toast";
import { PHOTO_ACCEPT } from "./heic";
import { measureSheetPdf } from "./measureSheetPdf";
import { loadToolPhoto, type ToolPhoto } from "./photoFile";
import { A4, LETTER, lightness, locateSheet, LOW_CONFIDENCE, measureTools, rescale, sizeMm, type PhotoResult, type Pt, type SheetLocation } from "./photo";
import { apply, homography } from "./photo/homography";
import { order } from "./photo/sheet";
import type { Sheet, ToolOutline } from "./types";

const SHEETS = { a4: A4, carta: LETTER } as const;
const SHEET_NAMES = { a4: "A4", carta: "Carta" } as const;
type SheetKind = keyof typeof SHEETS;
/** Espera depois da última mudança antes de medir de novo (medir leva ~1 s). */
const REMEASURE_MS = 250;
const KEY_STEP_PX = 2;
/** Tamanhos na tela (px), qualquer que seja a resolução da foto: ponto do canto, área de toque dele e número. */
const HANDLE_PX = 9;
const HANDLE_HIT_PX = 16;
const BADGE_PX = 11;
/** Antes de medir o tamanho do quadro na tela: supõe a foto com ~600 px de largura. */
const FALLBACK_VIEW_PX = 600;
/** Lupa ao arrastar um canto: raio na tela (px) e aumento. */
const LENS_PX = 56;
const LENS_ZOOM = 4;

/** Como fotografar (#169): o que mais muda a medida, na ordem em que a pessoa monta a foto. */
const TIPS: [LucideIcon, string, string][] = [
  [FileText, "Folha A4 branca", "Ferramentas deitadas em cima, sem encostar na borda do papel."],
  [Smartphone, "De cima", "Celular paralelo à mesa, bem em cima da folha."],
  [ZoomIn, "De longe, com zoom 2x", "Afaste o celular e aproxime com o zoom: a folha inteira, com um pouco de mesa em volta."],
  [Sun, "Boa luz, sem sombra", "Luz do dia ou do teto, sem flash e sem sol direto: a sombra entra no contorno."],
  [Contrast, "Mesa clara?", "Ponha um fundo escuro embaixo da folha (pano, cartolina), ou imprima a folha de medição: os 4 quadrados dos cantos aparecem em qualquer fundo."],
];

const num = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const size = (o: ToolOutline) => {
  const s = sizeMm(o);
  return `${num(s.length)} × ${num(s.width)} mm`;
};

/** Margem da foto (fração) em que um canto de palpite inseguro fica difícil de pegar e quase sempre está errado. */
const EDGE_SHARE = 0.03;

/**
 * Palpite que vale mostrar: marcadores ou confiança boa; com confiança baixa, só se nenhum canto estiver colado na borda
 * da foto (na mesa branca o palpite ruim costuma ser a foto inteira).
 */
const usable = (where: NonNullable<SheetLocation>, w: number, h: number) =>
  where.printed ||
  where.confidence >= LOW_CONFIDENCE ||
  where.corners.every(([x, y]) => x > w * EDGE_SHARE && y > h * EDGE_SHARE && x < w * (1 - EDGE_SHARE) && y < h * (1 - EDGE_SHARE));

/** Cantos padrão quando a folha não é achada: um retângulo um pouco para dentro da foto, para a pessoa arrastar. */
const insetCorners = (w: number, h: number): Pt[] => [[w * 0.15, h * 0.15], [w * 0.85, h * 0.15], [w * 0.85, h * 0.85], [w * 0.15, h * 0.85]];

/**
 * Contornos medidos (mm, y para cima, origem no canto 1) de volta na foto, pela mesma homografia da medição: a pessoa vê
 * em cima das ferramentas o que foi medido (sombra que entrou, ferramenta que faltou) e qual é a de cada número.
 */
function onPhoto(r: PhotoResult, corners: Pt[]) {
  const { widthMm: W, heightMm: H } = r.sheet;
  const toPhoto = homography([[0, 0], [W, 0], [W, H], [0, H]], order(corners));
  if (!toPhoto) return [];
  const map = (loop: Pt[]) => loop.map(([x, y]) => apply(toPhoto, [x, H - y]));
  return r.outlines.map((o) => {
    const outer = map(o.points);
    const c: Pt = [outer.reduce((s, p) => s + p[0], 0) / outer.length, outer.reduce((s, p) => s + p[1], 0) / outer.length];
    return { id: o.id, d: [outer, ...(o.holes ?? []).map(map)].map((l) => `M${l.map((p) => p.join(",")).join("L")}Z`).join(""), c };
  });
}

/**
 * Passo "Foto" do Organizador pela foto (#169): escolher a foto das ferramentas em cima de uma folha A4/Carta,
 * conferir (e arrastar) os 4 cantos da folha, informar a altura das ferramentas e receber os contornos em mm.
 */
export default function PhotoStep({ onOutlines, firstNumber = 1 }: { onOutlines: (outlines: ToolOutline[], sheet: Sheet) => void; /** Número mostrado da 1ª ferramenta (várias fotos numa lista). */ firstNumber?: number }) {
  const [photo, setPhoto] = useState<ToolPhoto | null>(null);
  const [corners, setCorners] = useState<Pt[]>([]);
  // onde a folha foi achada: confiança 0–1 e se foi pelos marcadores da folha de medição (null = não achou)
  const [located, setLocated] = useState<SheetLocation>(null);
  const [drag, setDrag] = useState<{ i: number; p: Pt } | null>(null);
  const [kind, setKind] = useState<SheetKind>("a4");
  const [height, setHeight] = useState(0);
  const [ruler, setRuler] = useState("");
  // resultado e a combinação (foto, folha, altura, cantos) para a qual ele foi medido
  const [measured, setMeasured] = useState<{ key: string; r: PhotoResult; corners: Pt[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [viewPx, setViewPx] = useState(FALLBACK_VIEW_PX);
  const gray = useMemo(() => (photo ? lightness(photo.img) : null), [photo]);

  async function open(file: File) {
    setError(null);
    try {
      const p = await loadToolPhoto(file);
      const where = locateSheet(lightness(p.img), SHEETS[kind], p.focalPx);
      setLocated(where);
      setCorners(where && usable(where, p.img.width, p.img.height) ? where.corners : insetCorners(p.img.width, p.img.height));
      setPhoto(p);
    } catch (e) {
      setError(errorText(e));
    }
  }

  // mede de novo quando muda a folha, os cantos (ao soltar) ou a altura
  const key = photo ? [photo.url, kind, height, corners.flat().join(",")].join("|") : "";
  const result = measured?.r ?? null;
  const busy = !!photo && measured?.key !== key;
  useEffect(() => {
    if (!gray || !photo || corners.length !== 4 || !(height >= 0)) return;
    const t = setTimeout(() => {
      try {
        const r = measureTools(gray, { sheet: SHEETS[kind], corners, heightMm: height, focalPx: photo.focalPx, printed: located?.printed, firstNumber });
        setMeasured({ key, r, corners });
        setError(null);
      } catch (e) {
        setError(errorText(e));
      }
    }, REMEASURE_MS);
    return () => clearTimeout(t);
  }, [gray, photo, corners, kind, height, key, located, firstNumber]);

  /** A4 ↔ Carta: com a folha de medição, os cantos saem dos marcadores e mudam com o tamanho do papel. */
  function pickKind(k: SheetKind) {
    setKind(k);
    if (!gray || !photo || !located?.printed) return;
    const where = locateSheet(gray, SHEETS[k], photo.focalPx);
    if (where?.printed) setCorners(where.corners);
  }

  const toast = useToast();
  async function downloadSheet(k: SheetKind) {
    try {
      const path = await saveFile(`folha-de-medicao-${k}.pdf`, await measureSheetPdf(SHEETS[k], SHEET_NAMES[k]), "pdf", "PDF");
      if (path) toast(`Folha salva em ${path}. Imprima em tamanho real (100%) e confira a régua de 100 mm.`);
    } catch (e) {
      setError(errorText(e));
    }
  }

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  // largura do quadro na tela: pontos, área de toque e números do mesmo tamanho em qualquer foto
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => el.clientWidth > 0 && setViewPx(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [photo]);

  // sem EXIF e com altura: o comprimento real da ferramenta 1 (régua) acerta a escala de todas
  const realLength = Number(ruler.replace(",", "."));
  const outlines = useMemo(() => {
    if (!result) return [];
    const first = result.outlines[0];
    if (!result.needsRuler || !first || !(realLength > 0)) return result.outlines;
    const factor = realLength / sizeMm(first).length;
    return result.outlines.map((o) => rescale(o, factor));
  }, [result, realLength]);
  const drawn = useMemo(() => (measured ? onPhoto(measured.r, measured.corners) : []), [measured]);

  const report = useRef(onOutlines);
  useEffect(() => {
    report.current = onOutlines;
  }, [onOutlines]);
  useEffect(() => {
    if (result) report.current(outlines, result.sheet);
  }, [outlines, result]);

  const toSvg = (e: PointerEvent): Pt => {
    const m = svg.current!.getScreenCTM()!.inverse();
    return [m.a * e.clientX + m.c * e.clientY + m.e, m.b * e.clientX + m.d * e.clientY + m.f];
  };
  const shown = corners.map((c, i) => (drag?.i === i ? drag.p : c));
  const nudge = (i: number, e: KeyboardEvent) => {
    const step = KEY_STEP_PX * (e.shiftKey ? 10 : 1);
    const d: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!d[e.key]) return;
    e.preventDefault();
    setCorners(corners.map((c, j) => (j === i ? [c[0] + d[e.key][0], c[1] + d[e.key][1]] : c)));
  };

  const w = photo?.img.width ?? 0;
  const h = photo?.img.height ?? 0;
  const px = w / viewPx; // 1 px da tela em px da foto
  const sheet = result?.sheet ?? SHEETS[kind];
  const lowConfidence = !located || (!located.printed && located.confidence < LOW_CONFIDENCE);

  if (!photo)
    return (
      <Card title="Foto das ferramentas" icon={Camera} className="photo-step">
        <PhotoTips onDownload={downloadSheet} />
        <Dropzone accept={PHOTO_ACCEPT} label="Escolha a foto das ferramentas" hint="Arraste a foto aqui ou clique para escolher." onFile={open} />
        {error && <Alert kind="error">{error}</Alert>}
      </Card>
    );

  return (
    <Card title="Foto das ferramentas" icon={Camera} className="photo-step">
      <div className="photo-bar">
        <Segmented label="Folha" value={kind} onChange={pickKind} options={[["a4", "A4"], ["carta", "Carta"]]} />
        <Dropzone accept={PHOTO_ACCEPT} label="Trocar foto" onFile={open} compact />
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {located?.printed ? (
        <p className="hint">Achei a folha de medição pelos 4 quadrados dos cantos. O contorno destacado é o que foi medido.</p>
      ) : !lowConfidence ? (
        <p className="hint">Confira os 4 pontos nos cantos do papel; se algum estiver fora, arraste-o (ou use as setas). O contorno destacado é o que foi medido.</p>
      ) : (
        <Alert kind="warn">
          {located ? "Não tenho certeza dos cantos da folha" : "Não achei a folha sozinho"} (mesa clara?): arraste cada um dos 4 pontos destacados para um canto do papel; ao arrastar, a lupa mostra o canto de perto. Da próxima vez, ponha um fundo escuro embaixo da folha ou use a folha de medição.
        </Alert>
      )}
      <svg ref={svg} className={`photo-corners ${drag ? "dragging" : ""}`} viewBox={`0 0 ${w} ${h}`} role="group" aria-label="Cantos da folha na foto">
        <image href={photo.url} width={w} height={h} />
        <polygon points={shown.map((p) => p.join(",")).join(" ")} />
        {!busy && outlines.length > 0 && (
          <g className="photo-found" role="img" aria-label={`Contornos medidos na folha de ${sheet.widthMm} × ${sheet.heightMm} mm`}>
            {drawn.map((o) => (
              <path key={o.id} d={o.d} fillRule="evenodd" />
            ))}
            {drawn.map((o, i) => (
              <g key={o.id} className="tool-num" transform={`translate(${o.c[0]} ${o.c[1]})`}>
                <circle r={BADGE_PX * px} />
                <text fontSize={BADGE_PX * 1.1 * px} dy="0.35em">
                  {firstNumber + i}
                </text>
              </g>
            ))}
          </g>
        )}
        {shown.map(([x, y], i) => (
          <g
            key={i}
            className={`corner ${lowConfidence ? "low" : ""}`}
            tabIndex={0}
            role="button"
            aria-label={`Canto ${i + 1} da folha (setas movem)`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ i, p: toSvg(e) });
            }}
            onPointerMove={(e) => drag?.i === i && setDrag({ i, p: toSvg(e) })}
            onPointerUp={() => {
              if (drag?.i !== i) return;
              setCorners(corners.map((c, j) => (j === i ? drag.p : c)));
              setDrag(null);
            }}
            onKeyDown={(e) => nudge(i, e)}
          >
            <circle className="corner-hit" cx={x} cy={y} r={HANDLE_HIT_PX * px} />
            <circle className="corner-dot" cx={x} cy={y} r={HANDLE_PX * px} />
          </g>
        ))}
        {drag && <CornerLens url={photo.url} size={[w, h]} at={drag.p} px={px} />}
      </svg>
      <NumField
        label="Altura das ferramentas"
        value={height}
        onChange={setHeight}
        min={0}
        max={100}
        step={1}
        hint="Da mesa até o ponto mais alto da ferramenta deitada (a mais alta, se forem várias), por exemplo alicate ~15 mm, óculos dobrados ~40 mm. Corrige a perspectiva: quanto mais alta, maior ela parece na foto."
      />
      {photo && !(height > 0) && (
        <Alert kind="warn">Falta a altura das ferramentas: sem ela a medida sai maior (a ferramenta parece maior na foto) e o encaixe pode ficar raso. Meça a ferramenta deitada, da mesa ao ponto mais alto: alicate ~15 mm, óculos dobrados ~40 mm.</Alert>
      )}
      {result?.needsRuler && result.outlines[0] && (
        <label>
          Comprimento real da Ferramenta {firstNumber} (mm)
          <input inputMode="decimal" value={ruler} onChange={(e) => setRuler(e.target.value)} placeholder={sizeMm(result.outlines[0]).length.toFixed(1).replace(".", ",")} />
          <span className="hint">A foto não diz a que distância a câmera estava. Meça com uma régua, de ponta a ponta, a ferramenta marcada com {firstNumber} na foto: o app acerta a escala de todas.</span>
        </label>
      )}
      {busy && (
        <p className="hint" role="status">
          Medindo…
        </p>
      )}
      {result?.warnings.map((m) => (
        <Alert key={m} kind="warn">
          {m}
        </Alert>
      ))}
      {result && outlines.length > 0 && (
        <ol className="photo-list" aria-label="Medidas">
          {outlines.map((o, i) => (
            <li key={o.id}>
              <span className="tool-num" aria-hidden>
                {firstNumber + i}
              </span>
              <span>
                <b>Ferramenta {firstNumber + i}</b> · {size(o)}
                {o.holes?.length ? ` · ${o.holes.length} ${o.holes.length === 1 ? "furo" : "furos"}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
      <details className="advanced">
        <summary>Como fotografar</summary>
        <PhotoTips onDownload={downloadSheet} />
      </details>
    </Card>
  );
}

function PhotoTips({ onDownload }: { onDownload: (k: SheetKind) => void }) {
  return (
    <>
      <ul className="photo-tips" aria-label="Como fotografar">
        {TIPS.map(([Icon, title, text]) => (
          <li key={title}>
            <Icon aria-hidden />
            <span>
              <b>{title}</b> {text}
            </span>
          </li>
        ))}
      </ul>
      <div className="photo-sheet-pdf">
        {(Object.keys(SHEETS) as SheetKind[]).map((k) => (
          <button key={k} type="button" className="sm" onClick={() => onDownload(k)}>
            <Download aria-hidden /> Folha de medição {SHEET_NAMES[k]} (PDF)
          </button>
        ))}
      </div>
    </>
  );
}

/** Lupa ao arrastar um canto: a foto ampliada em volta do ponto, num círculo acima dele (ou abaixo, perto do topo). */
function CornerLens({ url, size, at, px }: { url: string; size: [number, number]; at: Pt; px: number }) {
  const clip = useId();
  const r = LENS_PX * px;
  const cx = Math.min(Math.max(at[0], r), size[0] - r);
  const cy = at[1] - 2.2 * r >= r ? at[1] - 2.2 * r : at[1] + 2.2 * r;
  return (
    <g className="corner-lens" aria-hidden>
      <clipPath id={clip}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <image href={url} width={size[0]} height={size[1]} transform={`translate(${cx} ${cy}) scale(${LENS_ZOOM}) translate(${-at[0]} ${-at[1]})`} />
        <path d={`M${cx - r} ${cy}H${cx + r}M${cx} ${cy - r}V${cy + r}`} />
      </g>
      <circle className="lens-ring" cx={cx} cy={cy} r={r} />
    </g>
  );
}
