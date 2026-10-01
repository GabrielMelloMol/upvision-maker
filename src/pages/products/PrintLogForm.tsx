import { useState } from "react";
import { getDb } from "../../db";
import { printLogsRepo } from "../../db/printLogsRepo";
import type { Printer } from "../../domain/entities";
import { parseDecimal } from "../../domain/format";
import { todayIso } from "../../domain/orders";
import { PrintLogInput, SUPPORTS, type PrintLog } from "../../domain/printLogs";
import { fieldErrors } from "../../ui/fieldErrors";
import { formatDuration, parseDuration } from "../../ui/parse";
import Segmented from "../../ui/Segmented";
import { errorText, useToast } from "../../ui/Toast";
import Toggle from "../../ui/Toggle";

const optNum = (s: string) => (s.trim() ? parseDecimal(s) : null);
const str = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

/**
 * Registrar uma impressão na ficha (#163). `base` preenche a partir da última que deu certo (fazer de novo) ou do
 * pedido; o resultado começa em "deu certo".
 */
export default function PrintLogForm({ productId, orderId = null, base, printers, onSaved, onCancel }: { productId: number; orderId?: number | null; base?: Partial<PrintLog> | null; printers: Printer[]; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    at: todayIso(),
    printerId: base?.printerId ? String(base.printerId) : printers[0] ? String(printers[0].id) : "",
    filaments: base?.filaments ?? "",
    layer: str(base?.layerHeight),
    infill: str(base?.infillPct),
    supports: base?.supports ?? ("nenhum" as (typeof SUPPORTS)[number]),
    brim: base?.brim ?? false,
    orientation: base?.orientation ?? "",
    time: base?.minutes ? formatDuration(base.minutes) : "",
    grams: str(base?.grams),
    result: "ok" as "ok" | "falhou",
    reason: "",
    notes: base?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((c) => ({ ...c, [k]: v }));

  async function save() {
    const input = {
      productId,
      orderId,
      at: f.at,
      printerId: f.printerId ? Number(f.printerId) : null,
      filaments: f.filaments,
      layerHeight: optNum(f.layer),
      infillPct: optNum(f.infill),
      supports: f.supports,
      brim: f.brim,
      orientation: f.orientation,
      minutes: f.time.trim() ? parseDuration(f.time) || null : null,
      grams: optNum(f.grams),
      result: f.result,
      reason: f.result === "falhou" ? f.reason : "",
      notes: f.notes,
    };
    const v = PrintLogInput.safeParse(input);
    if (!v.success) {
      setErrors(fieldErrors(v.error));
      return;
    }
    setSaving(true);
    try {
      await printLogsRepo.insert(await getDb(), v.data);
      toast(f.result === "ok" ? "Impressão registrada na ficha." : "Falha registrada na ficha: entra na taxa de falha do produto.");
      onSaved();
    } catch (err) {
      toast(`Não foi possível registrar: ${errorText(err)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    // sem <form>: fica dentro do editor do produto (que já é um formulário)
    <div className="stack print-log-form" role="group" aria-label="Registrar impressão">
      <Segmented
        label="Resultado"
        value={f.result}
        options={[
          ["ok", "Deu certo"],
          ["falhou", "Falhou"],
        ]}
        onChange={(v) => set("result")(v)}
      />
      {f.result === "falhou" && (
        <label>
          Por que falhou?
          <input value={f.reason} maxLength={300} onChange={(e) => set("reason")(e.target.value)} placeholder="Ex.: soltou da mesa, fio puxou, camada deslocada" />
        </label>
      )}
      <div className="grid two">
        <label>
          Data
          <input type="date" value={f.at} aria-invalid={!!errors.at} onChange={(e) => set("at")(e.target.value)} />
        </label>
        <label>
          Impressora
          <select value={f.printerId} onChange={(e) => set("printerId")(e.target.value)}>
            <option value="">—</option>
            {printers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Filamentos e slots
        <input value={f.filaments} maxLength={300} onChange={(e) => set("filaments")(e.target.value)} placeholder="Ex.: PLA Azul no slot 1, Branco no 2" />
      </label>
      <div className="grid two">
        <label>
          Camada (mm)
          <input inputMode="decimal" value={f.layer} aria-invalid={!!errors.layerHeight} onChange={(e) => set("layer")(e.target.value)} placeholder="0,2" />
          {errors.layerHeight && <span className="error">{errors.layerHeight}</span>}
        </label>
        <label>
          Preenchimento (%)
          <input inputMode="decimal" value={f.infill} onChange={(e) => set("infill")(e.target.value)} placeholder="15" />
        </label>
        <label>
          Tempo real da mesa
          <input value={f.time} onChange={(e) => set("time")(e.target.value)} placeholder="Ex.: 1h20" />
        </label>
        <label>
          Gramas reais da mesa
          <input inputMode="decimal" value={f.grams} onChange={(e) => set("grams")(e.target.value)} placeholder="Do fatiador ou da balança" />
        </label>
      </div>
      <Segmented
        label="Suporte"
        value={f.supports}
        options={SUPPORTS.map((s) => [s, s === "nenhum" ? "Sem suporte" : s === "normal" ? "Suporte" : "Árvore"] as [(typeof SUPPORTS)[number], string])}
        onChange={(v) => set("supports")(v)}
      />
      <Toggle label="Com brim" checked={f.brim} onChange={(v) => set("brim")(v)} />
      <label>
        Orientação
        <input value={f.orientation} maxLength={120} onChange={(e) => set("orientation")(e.target.value)} placeholder="Ex.: deitado, de pé, de cabeça para baixo" />
      </label>
      <label>
        Anotações
        <textarea value={f.notes} maxLength={1000} rows={2} onChange={(e) => set("notes")(e.target.value)} placeholder="Ex.: PETG a 240 °C, imprimir com brim, cola na mesa" />
      </label>
      <div className="row">
        <button type="button" className="primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Registrando…" : "Registrar na ficha"}
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
