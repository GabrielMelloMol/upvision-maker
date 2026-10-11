import type { CutoutInfo } from "../designInput";
import KitImageGuide from "./KitImageGuide";
import KitSilhouette from "./KitSilhouette";
import { KIT_EXAMPLES, type KitExample } from "./kitExamples";

type Props = { art: { svg: string; name: string } | null; cut: CutoutInfo | null; onExample: (ex: KitExample) => void };

/** Tudo o que explica qual imagem usar no Kit card: o quadro, os exemplos prontos e, depois do envio, a silhueta entendida. */
export default function KitArtHelp({ art, cut, onExample }: Props) {
  return (
    <div className="kit-help span-2">
      <KitImageGuide />
      <div className="chips kit-examples" role="group" aria-label="Sem imagem? Experimente um exemplo">
        <span className="kit-examples-label">Sem imagem? Experimente:</span>
        {KIT_EXAMPLES.map((ex) => (
          <button key={ex.id} type="button" onClick={() => onExample(ex)}>
            {ex.label}
          </button>
        ))}
      </div>
      {art && <KitSilhouette svg={art.svg} cut={cut} />}
    </div>
  );
}
