import { Download } from "lucide-react";
import { writeStl } from "../geometry/stl";
import { write3mf } from "../geometry/threemf";
import type { Model } from "../geometry/types";
import { saveFile, slug } from "./saveFile";
import { errorText, useToast } from "./Toast";

/** Botões padrão de exportação: 3MF com cores (principal) e STL por objeto. */
export default function ExportButtons({ models, name, busy }: { models: Model[]; name: string; busy?: boolean }) {
  const toast = useToast();
  const disabled = busy || models.length === 0;

  async function save(file: string, data: Uint8Array, ext: string, label: string) {
    try {
      const p = await saveFile(file, data, ext, label);
      if (p) toast(`Arquivo salvo em ${p}`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  return (
    <div className="card stack">
      <button className="action" disabled={disabled} onClick={() => save(`${slug(name)}.3mf`, write3mf(models), "3mf", "3MF")}>
        <Download aria-hidden /> Salvar 3MF (Bambu / Orca)
      </button>
      {models.length === 1 ? (
        <button disabled={disabled} onClick={() => save(`${slug(name)}.stl`, writeStl(models), "stl", "STL")}>
          <Download aria-hidden /> Salvar STL
        </button>
      ) : (
        <div className="grid two">
          {models.map((m) => (
            <button key={m.name} disabled={disabled} onClick={() => save(`${slug(`${name}-${m.name}`)}.stl`, writeStl([m]), "stl", "STL")}>
              <Download aria-hidden /> STL {m.name.toLowerCase()}
            </button>
          ))}
        </div>
      )}
      <span className="hint">O 3MF já separa as cores em partes: no Bambu Studio/OrcaSlicer é só escolher o filamento de cada uma.</span>
    </div>
  );
}
