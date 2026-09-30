import { Box, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { modelsBounds } from "../geometry/bounds";
import type { Model } from "../geometry/types";
import { createViewer } from "./viewerScene";

type Props = {
  models: Model[];
  busy?: boolean;
  busyText?: string;
  error?: string | null;
  emptyText?: string;
};

// prévia na tela agora (uma por ferramenta): dá a miniatura dos "Últimos projetos" (#85)
let active: ReturnType<typeof createViewer> | null = null;
/** Miniatura WebP da prévia 3D aberta, ou null (sem prévia ou vazia). */
export const snapshotPreview = (max?: number) => {
  try {
    return active?.snapshot(max) ?? null;
  } catch {
    return null; // sem WebGL (testes) ou canvas indisponível: sem miniatura
  }
};

/** Prévia 3D padrão de todas as ferramentas: Z para cima, mesa 256 mm, girar/zoom com o mouse. */
export default function Preview3D({ models, busy, busyText = "Gerando modelo…", error, emptyText = "A prévia aparece aqui." }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ReturnType<typeof createViewer> | null>(null);

  useEffect(() => {
    const v = createViewer(host.current!);
    viewer.current = v;
    active = v;
    return () => {
      if (active === v) active = null;
      v.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    viewer.current?.setModels(models);
  }, [models]);

  const legend = [...new Map(models.flatMap((m) => m.parts).map((p) => [p.color + p.name, p])).values()].slice(0, 6);
  const b = modelsBounds(models);
  const size = b && { x: b.max[0] - b.min[0], y: b.max[1] - b.min[1], z: b.max[2] - b.min[2] };

  return (
    <div className="viewer" ref={host} role="img" aria-label="Prévia 3D do modelo" aria-busy={busy || undefined}>
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
