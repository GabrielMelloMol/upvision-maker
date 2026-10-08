import { Box, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { modelsBounds } from "../geometry/bounds";
import type { Model } from "../geometry/types";
import { createViewer } from "./viewerScene";

type Props = {
  models: Model[];
  busy?: boolean;
  busyText?: string;
  error?: string | null;
  emptyText?: string;
  /** Clique (sem arrastar) numa face da peça: ponto e normal no sistema do modelo (#113). */
  onPick?: (hit: { point: [number, number, number]; normal: [number, number, number] }) => void;
};

const CLICK_SLOP_PX = 5;

const TURN = Math.PI / 12; // 15° por toque de seta
const TILT = Math.PI / 18; // 10°
const ZOOM_STEP = 0.85;
const mm = (n: number) => n.toFixed(1).replace(".", ",");

/** O que o leitor de tela ouve (#144): medidas e partes, porque o desenho em si não é lido. */
export function previewLabel(size: { x: number; y: number; z: number } | null, parts: string[], state: string | null): string {
  if (state) return `Prévia 3D: ${state}`;
  if (!size) return "Prévia 3D vazia";
  const names = parts.length > 1 ? `; partes ${parts.join(", ")}` : "";
  return `Prévia 3D: ${mm(size.x)} × ${mm(size.y)} × ${mm(size.z)} mm${names}`;
}

// prévia na tela agora (uma por ferramenta): dá a miniatura dos "Últimos projetos" (#85)
let active: ReturnType<typeof createViewer> | null = null;
let activeModels: Model[] = [];
const THUMB_W = 320, THUMB_H = 240;

/**
 * Miniatura do projeto (#161) no padrão das miniaturas da galeria (#149): render à parte, fundo transparente,
 * sem a grade da mesa e com a câmera padrão. O renderizador só carrega na hora de salvar; se falhar, usa a prévia.
 */
export async function previewThumb(): Promise<string | null> {
  if (!activeModels.length) return null;
  try {
    const { renderModels } = await import("../thumbs/renderThumb");
    return renderModels(activeModels, THUMB_W, THUMB_H);
  } catch (e) {
    console.warn("Miniatura no padrão da galeria indisponível, usando a prévia:", e);
    return snapshotPreview();
  }
}
/** Miniatura WebP da prévia 3D aberta, ou null (sem prévia ou vazia). */
export const snapshotPreview = (max?: number) => {
  try {
    return active?.snapshot(max) ?? null;
  } catch {
    return null; // sem WebGL (testes) ou canvas indisponível: sem miniatura
  }
};

/** Prévia 3D padrão de todas as ferramentas: Z para cima, mesa da impressora escolhida, girar/zoom com o mouse. */
export default function Preview3D({ models, busy, busyText = "Gerando modelo…", error, emptyText = "A prévia aparece aqui.", onPick }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ReturnType<typeof createViewer> | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const v = createViewer(host.current!);
    viewer.current = v;
    active = v;
    return () => {
      if (active === v) {
        active = null;
        activeModels = [];
      }
      v.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    viewer.current?.setModels(models);
    if (active === viewer.current) activeModels = models;
  }, [models]);

  const legend = [...new Map(models.flatMap((m) => m.parts).map((p) => [p.color + p.name, p])).values()].slice(0, 6);
  const hintId = useId();
  const b = modelsBounds(models);
  const size = b && { x: b.max[0] - b.min[0], y: b.max[1] - b.min[1], z: b.max[2] - b.min[2] };

  return (
    <div
      className="viewer"
      ref={host}
      role="img"
      tabIndex={0}
      aria-roledescription="prévia 3D"
      aria-label={previewLabel(size || null, legend.map((p) => p.name), busy ? busyText : error ? error : models.length ? null : emptyText)}
      aria-describedby={hintId}
      aria-busy={busy || undefined}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0"
      style={onPick ? { cursor: "crosshair" } : undefined}
      onPointerDown={onPick ? (e) => (down.current = { x: e.clientX, y: e.clientY }) : undefined}
      onPointerUp={
        onPick
          ? (e) => {
              const d = down.current;
              down.current = null;
              if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP_PX) return; // arrastar é girar a câmera
              const hit = viewer.current?.pick(e.clientX, e.clientY);
              if (hit) onPick(hit);
            }
          : undefined
      }
      onKeyDown={(e) => {
        // teclado (#144): setas giram e inclinam, + e − aproximam, 0 volta ao enquadramento
        const v = viewer.current;
        if (!v) return;
        const act: Record<string, () => void> = {
          ArrowLeft: () => v.nudge(-TURN, 0),
          ArrowRight: () => v.nudge(TURN, 0),
          ArrowUp: () => v.nudge(0, -TILT),
          ArrowDown: () => v.nudge(0, TILT),
          "+": () => v.nudge(0, 0, ZOOM_STEP),
          "=": () => v.nudge(0, 0, ZOOM_STEP),
          "-": () => v.nudge(0, 0, 1 / ZOOM_STEP),
          "0": () => v.reset(),
        };
        const fn = act[e.key];
        if (!fn || e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        fn();
      }}
    >
      <span id={hintId} className="sr-only">
        Setas giram e inclinam, mais e menos aproximam, zero volta ao começo.
      </span>
      {size && (
        <div className="hud">
          {size.x.toFixed(1)} × {size.y.toFixed(1)} × {size.z.toFixed(1)} mm
        </div>
      )}
      {legend.length > 1 && (
        <div className="legend">
          {legend.map((p) => (
            <span key={p.color + p.name}>
              <i style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
        </div>
      )}
      {(busy || error || models.length === 0) && (
        <div className={`overlay ${busy ? "busy" : ""}`} aria-live="polite">
          <div className="inner">
            {busy ? (
              <>
                <div className="spinner" />
                <span>{busyText}</span>
              </>
            ) : error ? (
              <div className="alert error" role="alert">
                <TriangleAlert />
                <span>{error}</span>
              </div>
            ) : (
              <>
                <Box />
                <span>{emptyText}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
