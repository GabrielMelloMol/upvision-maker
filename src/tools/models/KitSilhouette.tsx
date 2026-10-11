import { useEffect, useState } from "react";
import { nozzleMm, nozzleText } from "../../geometry/bed";
import { checkSilhouette, type SilhouetteReport } from "../../vectorize/silhouetteCheck";
import { svgToMask, type SvgMask } from "../../vectorize/svgMask";
import Alert from "../../ui/Alert";
import type { CutoutInfo } from "../designInput";

type Props = { svg: string; cut: CutoutInfo | null; rasterize?: (svg: string) => Promise<SvgMask> };
type Result = { url: string; report: SilhouetteReport } | "failed";
type Keyed = { key: string; result: Result };

/**
 * "O que o app entendeu": a silhueta que vai virar o kit (desenhada da máscara) e avisos específicos: vista de frente, várias
 * figuras, contorno fino para o bico e recorte incerto. Os avisos orientam; nenhum bloqueia a montagem.
 */
export default function KitSilhouette({ svg, cut, rasterize = svgToMask }: Props) {
  const [done, setDone] = useState<Keyed | null>(null);
  const nozzle = nozzleMm();
  const key = `${nozzle}|${svg}`;
  const view = done?.key === key ? done.result : null; // resultado de outra imagem não vale
  useEffect(() => {
    let live = true;
    rasterize(svg)
      .then((m) => live && setDone({ key, result: { url: m.url, report: checkSilhouette(m.mask, m.w, m.h, nozzle) } }))
      .catch(() => live && setDone({ key, result: "failed" }));
    return () => {
      live = false;
    };
  }, [svg, nozzle, key, rasterize]);

  const notes = view && view !== "failed" ? view.report.notes : [];
  const pieces = view && view !== "failed" ? view.report.pieces : 0;
  const uncertain = cut?.uncertain && cut.warning;
  const clean = view && view !== "failed" && !notes.length && !uncertain;
  return (
    <section className="kit-sil" aria-label="O que o app entendeu">
      <h3 className="kit-sil-title">O que o app entendeu</h3>
      {view === null && <p className="hint" role="status">Lendo a silhueta…</p>}
      {view === "failed" && <p className="hint">Não consegui mostrar a silhueta, mas o kit continua sendo montado com o desenho enviado.</p>}
      {view && view !== "failed" && (
        <div className="kit-sil-view">
          <img src={view.url} alt={`Silhueta entendida: ${pieces} ${pieces === 1 ? "figura" : "figuras"}`} />
        </div>
      )}
      {clean && <Alert kind="ok">Uma figura inteira, com traços grossos o bastante para o bico de {nozzleText(nozzle)} mm.</Alert>}
      {notes.map((n) => (
        <Alert key={n.kind} kind="warn">{n.text}</Alert>
      ))}
      {uncertain && <Alert kind="warn">{`Recorte incerto: ${cut.warning}`}</Alert>}
    </section>
  );
}
