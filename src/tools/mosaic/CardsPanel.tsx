import { useState } from "react";
import { DESIGNS } from "../../geometry/mosaic/designs";
import { countCells } from "../../geometry/mosaic/grid";
import { kitColors } from "../../geometry/mosaic/kit";
import { pieceSide, pocketSide } from "../../geometry/mosaic/params";
import { loadPdfFonts } from "../../pdf/fonts";
import { mosaicCardsPdf } from "../../pdf/mosaicCards";
import Alert from "../../ui/Alert";
import { saveFile } from "../../ui/saveFile";
import { errorText, useToast } from "../../ui/Toast";
import type { Tool } from "./tool";

/** Aba Cartões: escolhe os desenhos e salva o PDF em escala 1:1 com a lista de peças. */
export default function CardsPanel({ tool }: { tool: Tool }) {
  const s = tool.state;
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const mine = countCells(s.grid) > 0;
  const picked = DESIGNS.filter((d) => s.cardIds.includes(d.id));
  const cards = [...picked.map((d) => ({ name: d.name, grid: d.grid })), ...(s.withMine && mine ? [{ name: s.designName || "Meu desenho", grid: s.grid }] : [])];
  const toggle = (id: string) => tool.set((cur) => ({ ...cur, cardIds: cur.cardIds.includes(id) ? cur.cardIds.filter((x) => x !== id) : [...cur.cardIds, id] }), "cards");

  async function save() {
    setSaving(true);
    try {
      const { bytes } = await mosaicCardsPdf(await loadPdfFonts(), cards, kitColors(s), { cell: s.board.cell, piece: pieceSide(s.board), pocket: pocketSide(s.board) });
      const p = await saveFile("cartoes-de-inspiracao.pdf", bytes, "pdf", "PDF");
      if (p) {
        toast(`Cartões salvos em ${p}`);
        void tool.exported("cartoes-de-inspiracao");
      }
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card stack">
      <h3>Cartões de inspiração</h3>
      <span className="hint">Um cartão por página A4, com o desenho em tamanho real (1:1 com o seu tabuleiro, casa de {s.board.cell} mm) e a lista de peças. Imprima a 100%, sem ajustar à página.</span>
      <ul className="mosaic-cards" aria-label="Desenhos para os cartões">
        {DESIGNS.map((d) => (
          <li key={d.id}>
            <label className="check">
              <input type="checkbox" checked={s.cardIds.includes(d.id)} onChange={() => toggle(d.id)} /> {d.name}
            </label>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" className="ghost" onClick={() => tool.set((cur) => ({ ...cur, cardIds: DESIGNS.map((d) => d.id) }), "cards")}>
          Marcar todos
        </button>
        <button type="button" className="ghost" onClick={() => tool.set((cur) => ({ ...cur, cardIds: [] }), "cards")}>
          Limpar
        </button>
      </div>
      {mine && (
        <label className="check">
          <input type="checkbox" checked={s.withMine} onChange={(e) => tool.set((cur) => ({ ...cur, withMine: e.target.checked }), "withMine")} /> Incluir o meu desenho{s.designName ? ` (${s.designName})` : ""}
        </label>
      )}
      {cards.length === 0 && <Alert kind="info">Marque pelo menos um desenho.</Alert>}
      <button type="button" className="action" disabled={saving || cards.length === 0} onClick={() => void save()}>
        {saving ? "Montando o PDF…" : `Salvar PDF (${cards.length} ${cards.length === 1 ? "cartão" : "cartões"})`}
      </button>
    </div>
  );
}
