import { useEffect, useState } from "react";
import { getDb } from "../../db";
import { loadSettings, printers as printersRepo, saveSettings } from "../../db/repo";
import { findCatalogPrinter } from "../../domain/catalog/printers";
import type { Printer } from "../../domain/entities";
import { bedFor, FALLBACK_NOZZLE_MM, nozzleText, type Bed } from "../../geometry/bed";
import { refreshBed } from "../../tools/bedPrinter";
import { errorText, useToast } from "../../ui/Toast";

const volumeOf = (name: string) => findCatalogPrinter(name)?.volume;
const size = (b: Bed) => `${b.x} × ${b.y} × ${b.z} mm`;

/**
 * Impressora das ferramentas (#119): o tamanho da mesa que as ferramentas usam para avisar, dividir e arrumar o
 * lote. Vem do catálogo pelo nome cadastrado; fora do catálogo, 256 mm.
 */
export default function BedPrinterCard() {
  const [list, setList] = useState<Printer[] | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const toast = useToast();

  useEffect(() => {
    getDb()
      .then(async (db) => {
        const [p, s] = await Promise.all([printersRepo.list(db), loadSettings(db)]);
        setList(p);
        setChosen(s.bedPrinterId);
      })
      .catch((e) => toast(`Erro ao ler as impressoras: ${errorText(e)}`, "error"));
  }, [toast]);

  if (!list) return null;
  const bed = bedFor(list, chosen, volumeOf);
  const known = !bed.name || !!volumeOf(bed.name);

  async function choose(id: number | null) {
    setChosen(id);
    try {
      const db = await getDb();
      await saveSettings(db, { ...(await loadSettings(db)), bedPrinterId: id });
      const b = await refreshBed(db);
      toast(`As ferramentas agora usam a mesa de ${b.x} × ${b.y} mm.`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  const used = list.length === 0 || !known ? "256 × 256 × 256 mm" : `${size(bed)} (${bed.name})`;
  return (
    <section className="group" aria-labelledby="bed-title">
      <h2 className="group-title" id="bed-title">
        Mesa das ferramentas
      </h2>
      <div className="rows">
        {list.length > 1 && (
          <label>
            Tamanho da mesa pela impressora
            <select value={chosen ?? ""} onChange={(e) => choose(e.target.value ? Number(e.target.value) : null)}>
              <option value="">A primeira cadastrada ({list[0].name})</option>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="row-control">
          <span className="row-label">Mesa usada</span>
          <span className="muted">{used}</span>
        </div>
        <div className="row-control">
          <span className="row-label">Bico usado</span>
          <span className="muted">{nozzleText(bed.nozzle ?? FALLBACK_NOZZLE_MM)} mm</span>
        </div>
      </div>
      <p className="hint group-note">
        {list.length === 0
          ? "Sem impressora cadastrada: as ferramentas usam a mesa da Bambu A1/P1/X1."
          : known
            ? "Peça maior que a mesa avisa, ou sai dividida onde a ferramenta divide. O bico (cadastrado em Impressoras) vale para o mapa estelar e para os avisos de parte fina."
            : `"${bed.name}" não está no catálogo: as ferramentas usam 256 mm. Cadastre a impressora pelo catálogo para usar o tamanho certo.`}
      </p>
    </section>
  );
}
