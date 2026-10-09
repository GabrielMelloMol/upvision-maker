import { ask } from "@tauri-apps/plugin-dialog";
import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { getDb } from "../../db";
import { productsRepo } from "../../db/productsRepo";
import { filaments as filamentsRepo, printers as printersRepo } from "../../db/repo";
import { applyStock } from "../../db/stock";
import { wasteRunsRepo } from "../../db/wasteRunsRepo";
import type { Db } from "../../db/types";
import { money, parseDecimal } from "../../domain/format";
import { todayIso } from "../../domain/orders";
import { WASTE_KINDS, WASTE_LABEL, wasteCost, type WasteKind, type WasteRun } from "../../domain/wasteRuns";
import Button from "../../ui/Button";
import Sheet from "../../ui/Sheet";
import SmartField from "../../ui/SmartField";
import { errorText, useToast } from "../../ui/Toast";
import { useData } from "../../ui/useData";

const load = async (db: Db) => ({ filaments: await filamentsRepo.list(db), products: await productsRepo.list(db), printers: await printersRepo.list(db), runs: await wasteRunsRepo.list(db) });
const EMPTY = { filaments: [] as Awaited<ReturnType<typeof filamentsRepo.list>>, products: [] as Awaited<ReturnType<typeof productsRepo.list>>, printers: [] as Awaited<ReturnType<typeof printersRepo.list>>, runs: [] as WasteRun[] };
const RECENT = 8;
const dateBr = (iso: string) => iso.split("-").reverse().join("/");
type Line = { filamentId: string; grams: string };
const filamentName = (f: { material: string; color: string; brand: string }) => [f.material, f.color, f.brand].filter(Boolean).join(" · ");

/**
 * Registro de amostra, teste e erro de impressão (#189): dá baixa nos filamentos e o custo do material entra no
 * Financeiro como perda, separado das vendas. Escolhendo o produto, as gramas vêm da composição dele (editáveis).
 */
export default function WasteSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [data, reload] = useData(load, EMPTY);
  const [kind, setKind] = useState<WasteKind>("failure");
  const [at, setAt] = useState(todayIso());
  const [productId, setProductId] = useState("");
  const [printerId, setPrinterId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const parsed = lines.map((l) => ({ filamentId: Number(l.filamentId), grams: parseDecimal(l.grams) }));
  const valid = parsed.length > 0 && parsed.every((l) => l.filamentId > 0 && Number.isFinite(l.grams) && l.grams > 0);
  const cost = valid ? wasteCost(parsed, data.filaments) : 0;

  function pickProduct(id: string) {
    setProductId(id);
    const p = data.products.find((x) => String(x.id) === id);
    if (p && lines.length === 0) setLines(p.composition.filaments.map((f) => ({ filamentId: String(f.filamentId), grams: String(f.grams).replace(".", ",") })));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await wasteRunsRepo.create(await getDb(), { kind, at, productId: productId ? Number(productId) : null, printerId: printerId ? Number(printerId) : null, lines: parsed, notes }, data.filaments, applyStock);
      toast(`${WASTE_LABEL[kind]} registrado: ${money(cost)} em material, já baixado do estoque.`);
      setLines([]);
      setNotes("");
      setProductId("");
      reload();
      onChanged();
    } catch (err) {
      toast(`Não foi possível registrar: ${errorText(err)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: WasteRun) {
    if (!(await ask("Excluir este registro? O filamento volta para o estoque.", { title: "Excluir registro", kind: "warning", okLabel: "Excluir", cancelLabel: "Voltar" }))) return;
    try {
      await wasteRunsRepo.remove(await getDb(), r, applyStock);
      reload();
      onChanged();
    } catch (err) {
      toast(errorText(err), "error");
    }
  }

  const upd = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <Sheet
      wide
      title="Amostra ou erro de impressão"
      icon={FlaskConical}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Fechar</Button>
          <Button variant="action" type="submit" disabled={busy || !valid}>
            Registrar e dar baixa
          </Button>
        </>
      }
    >
      <div className="grid">
        <label>
          O que foi
          <select data-autofocus value={kind} onChange={(e) => setKind(e.target.value as WasteKind)}>
            {WASTE_KINDS.map((k) => (
              <option key={k} value={k}>
                {WASTE_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data
          <input type="date" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <label>
          Produto (opcional)
          <select value={productId} onChange={(e) => pickProduct(e.target.value)}>
            <option value="">Nenhum</option>
            {data.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {data.printers.length > 0 && (
          <label>
            Impressora (opcional)
            <select value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
              <option value="">Nenhuma</option>
              {data.printers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <fieldset className="plain">
        <legend>Filamento gasto</legend>
        <div className="stack">
          {lines.map((l, i) => (
            <div className="row line" key={i}>
              <label className="grow">
                Filamento
                <select value={l.filamentId} onChange={(e) => upd(i, { filamentId: e.target.value })}>
                  <option value="">Escolha…</option>
                  {data.filaments.map((f) => (
                    <option key={f.id} value={f.id}>
                      {filamentName(f)}
                    </option>
                  ))}
                </select>
              </label>
              <SmartField label="Gramas" inputMode="decimal" parse={parseDecimal} invalidText="Digite as gramas, ex.: 12,5." value={l.grams} onChange={(v) => upd(i, { grams: v })} />
              <button type="button" className="link danger" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                Remover
              </button>
            </div>
          ))}
          <Button type="button" size="sm" onClick={() => setLines([...lines, { filamentId: "", grams: "" }])}>
            Adicionar filamento
          </Button>
          {valid && <span className="hint">Custo do material: {money(cost)}. Entra no Financeiro como perda, separado das vendas.</span>}
        </div>
      </fieldset>
      <label>
        Observações
        <textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: descolou da mesa na 3ª camada" />
      </label>
      {data.runs.length > 0 && (
        <>
          <h3>Últimos registros</h3>
          <table>
            <thead>
              <tr><th>Data</th><th>Tipo</th><th>Produto</th><th className="num">Custo</th><th /></tr>
            </thead>
            <tbody>
              {data.runs.slice(0, RECENT).map((r) => (
                <tr key={r.id}>
                  <td>{dateBr(r.at)}</td>
                  <td>{WASTE_LABEL[r.kind]}</td>
                  <td>{data.products.find((p) => p.id === r.productId)?.name ?? "—"}{r.notes && <span className="hint order-custom">{r.notes}</span>}</td>
                  <td className="num">{money(r.cost)}</td>
                  <td className="num">
                    <button type="button" className="link danger" aria-label={`Excluir registro de ${dateBr(r.at)}`} onClick={() => void remove(r)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Sheet>
  );
}
