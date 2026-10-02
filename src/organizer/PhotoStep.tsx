import { Camera } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import Alert from "../ui/Alert";
import Card from "../ui/Card";
import Dropzone from "../ui/Dropzone";
import NumField from "../ui/NumField";
import Segmented from "../ui/Segmented";
import { errorText } from "../ui/Toast";
import { IMAGE_ACCEPT } from "../vectorize/client";
import { loadToolPhoto, type ToolPhoto } from "./photoFile";
import { A4, findSheetCorners, LETTER, lightness, measureTools, rescale, sizeMm, type PhotoResult, type Pt } from "./photo";
import type { Sheet, ToolOutline } from "./types";

const SHEETS = { a4: A4, carta: LETTER } as const;
type SheetKind = keyof typeof SHEETS;
/** Espera depois da última mudança antes de medir de novo (medir leva ~1 s). */
const REMEASURE_MS = 250;
const KEY_STEP_PX = 2;

const num = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const size = (o: ToolOutline) => {
  const s = sizeMm(o);
  return `${num(s.length)} × ${num(s.width)} mm`;
};

/** Cantos padrão quando a folha não é achada: um retângulo um pouco para dentro da foto, para a pessoa arrastar. */
const insetCorners = (w: number, h: number): Pt[] => [[w * 0.15, h * 0.15], [w * 0.85, h * 0.15], [w * 0.85, h * 0.85], [w * 0.15, h * 0.85]];

const path = (loops: [number, number][][], sheet: Sheet) => loops.map((l) => `M${l.map(([x, y]) => `${x},${sheet.heightMm - y}`).join("L")}Z`).join("");

/**
 * Passo "Foto" do Organizador pela foto (#169): escolher a foto das ferramentas em cima de uma folha A4/Carta,
 * conferir (e arrastar) os 4 cantos da folha, informar a altura das ferramentas e receber os contornos em mm.
 */
export default function PhotoStep({ onOutlines }: { onOutlines: (outlines: ToolOutline[], sheet: Sheet) => void }) {
  const [photo, setPhoto] = useState<ToolPhoto | null>(null);
  const [corners, setCorners] = useState<Pt[]>([]);
  const [found, setFound] = useState(true);
  const [drag, setDrag] = useState<{ i: number; p: Pt } | null>(null);
  const [kind, setKind] = useState<SheetKind>("a4");
  const [height, setHeight] = useState(0);
  const [ruler, setRuler] = useState("");
  // resultado e a combinação (foto, folha, altura, cantos) para a qual ele foi medido
  const [measured, setMeasured] = useState<{ key: string; r: PhotoResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const gray = useMemo(() => (photo ? lightness(photo.img) : null), [photo]);

  async function open(file: File) {
    setError(null);
    try {
      const p = await loadToolPhoto(file);
      const g = lightness(p.img);
      const c = findSheetCorners(g);
      setFound(c !== null);
      setCorners(c ?? insetCorners(p.img.width, p.img.height));
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
        setMeasured({ key, r: measureTools(gray, { sheet: SHEETS[kind], corners, heightMm: height, focalPx: photo.focalPx }) });
        setError(null);
      } catch (e) {
        setError(errorText(e));
      }
    }, REMEASURE_MS);
    return () => clearTimeout(t);
  }, [gray, photo, corners, kind, height, key]);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  // sem EXIF e com altura: o comprimento real da ferramenta 1 (régua) acerta a escala de todas
  const realLength = Number(ruler.replace(",", "."));
  const outlines = useMemo(() => {
    if (!result) return [];
    const first = result.outlines[0];
    if (!result.needsRuler || !first || !(realLength > 0)) return result.outlines;
    const factor = realLength / sizeMm(first).length;
    return result.outlines.map((o) => rescale(o, factor));
  }, [result, realLength]);

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
  const handle = Math.max(w, h) / 70;
  const sheet = result?.sheet ?? SHEETS[kind];

  return (
    <Card title="Foto das ferramentas" icon={Camera} className="photo-step">
      <Dropzone
        accept={IMAGE_ACCEPT}
        label={photo ? "Trocar a foto" : "Escolha a foto das ferramentas"}
        hint="Ferramentas em cima de uma folha branca, foto de cima com os 4 cantos do papel e um pouco de mesa em volta."
        onFile={open}
      />
      {error && <Alert kind="error">{error}</Alert>}
      {photo && (
        <>
          <Segmented label="Folha" value={kind} onChange={setKind} options={[["a4", "A4"], ["carta", "Carta"]]} />
          {!found && <Alert kind="warn">Não achei a folha sozinho: arraste os 4 pontos para os cantos do papel.</Alert>}
          <svg ref={svg} className="photo-corners" viewBox={`0 0 ${w} ${h}`} role="group" aria-label="Cantos da folha na foto">
            <image href={photo.url} width={w} height={h} />
            <polygon points={shown.map((p) => p.join(",")).join(" ")} />
            {shown.map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={handle}
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
              />
            ))}
          </svg>
          <NumField
            label="Altura das ferramentas"
            value={height}
            onChange={setHeight}
            min={0}
            max={100}
            step={1}
            hint="Da mesa até a parte mais larga da ferramenta deitada. Corrige o efeito de perspectiva (quanto mais alta, maior ela parece na foto)."
          />
          {result?.needsRuler && result.outlines[0] && (
            <label>
              Comprimento real da Ferramenta 1 (mm)
              <input inputMode="decimal" value={ruler} onChange={(e) => setRuler(e.target.value)} placeholder={sizeMm(result.outlines[0]).length.toFixed(1).replace(".", ",")} />
              <span className="hint">A foto não diz a que distância a câmera estava. Meça a ferramenta 1 de ponta a ponta com uma régua e o app acerta a escala de todas.</span>
            </label>
          )}
          {busy && <p className="hint" role="status">Medindo…</p>}
          {result?.warnings.map((m) => (
            <Alert key={m} kind="warn">
              {m}
            </Alert>
          ))}
          {result && outlines.length > 0 && (
            <>
              <svg className="photo-outlines" viewBox={`0 0 ${sheet.widthMm} ${sheet.heightMm}`} role="img" aria-label={`Contornos medidos na folha de ${sheet.widthMm} × ${sheet.heightMm} mm`}>
                <rect width={sheet.widthMm} height={sheet.heightMm} />
                {outlines.map((o) => (
                  <path key={o.id} d={path([o.points, ...(o.holes ?? [])], sheet)} fillRule="evenodd" />
                ))}
              </svg>
              <ul className="photo-list">
                {outlines.map((o) => (
                  <li key={o.id}>
                    <b>{o.label}</b> · {size(o)}
                    {o.holes?.length ? ` · ${o.holes.length} ${o.holes.length === 1 ? "furo" : "furos"}` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Card>
  );
}
