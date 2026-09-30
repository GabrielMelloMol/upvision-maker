import { loadFont } from "../../geometry/fonts";
import { getManifold } from "../../geometry/manifold";
import { buildRuler3d, DEFAULT_RULER } from "../../geometry/models/ruler3d";
import { textToCrossSection } from "../../geometry/text";
import { write3mf } from "../../geometry/threemf";
import { loadPdfFonts } from "../../pdf/fonts";
import { rulerPdf } from "../../pdf/ruler";
import { saveFile } from "../../ui/saveFile";
import { errorText, useToast } from "../../ui/Toast";

const FONT = "hanken";

/** "Sem régua em casa?" (#140): régua 1:1 em PDF para o papel e régua 3D rápida para imprimir. */
export default function RulerCard() {
  const toast = useToast();
  async function save(name: string, make: () => Promise<Uint8Array>, ext: string, label: string) {
    try {
      const path = await saveFile(name, await make(), ext, label);
      if (path) toast(`Arquivo salvo em ${path}`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }
  const pdf = async () => (await rulerPdf(await loadPdfFonts())).bytes;
  const ruler3mf = async () => {
    const M = await getManifold();
    const font = await loadFont(FONT);
    const out = buildRuler3d({ M, art: null, text: (s, h) => (s.trim() ? textToCrossSection(M, font, s, h) : null) }, DEFAULT_RULER);
    return write3mf(out.models);
  };
  return (
    <div className="card stack">
      <h3>Sem régua em casa?</h3>
      <div className="row">
        <button type="button" className="ghost" onClick={() => void save("regua-1-1.pdf", pdf, "pdf", "PDF")}>
          Régua em papel (PDF)
        </button>
        <button type="button" className="ghost" onClick={() => void save("regua-25cm.3mf", ruler3mf, "3mf", "3MF")}>
          Régua 3D (25 cm)
        </button>
      </div>
      <span className="hint">
        Imprima o PDF em tamanho real (100%) e confira com um cartão de crédito. A régua 3D sai em poucos minutos na A1. O app de medida do celular pode errar mais de 1 cm: confira antes de imprimir a base.
      </span>
    </div>
  );
}
