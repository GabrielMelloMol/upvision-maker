import { Clock, Cylinder, Package, Plus, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { filaments, loadSettings, materials, printers } from "../db/repo";
import type { Db } from "../db/types";
import { calculate } from "../domain/calc";
import { money, parseDecimal } from "../domain/format";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { useData } from "../ui/useData";

type Option = { id: number; label: string; price: number };
type Line = { ref: string; price: string; qty: string };

const load = async (db: Db) => ({
  settings: await loadSettings(db),
  printers: await printers.list(db),
  filaments: (await filaments.list(db)).map((f) => ({ id: f.id, label: [f.material, f.color, f.brand].filter(Boolean).join(" · "), price: f.pricePerKg })),
  materials: (await materials.list(db)).map((m) => ({ id: m.id, label: `${m.name} (${m.unit})`, price: m.unitPrice })),
});

const num = (s: string) => parseDecimal(s) || 0;
const newLine = (): Line => ({ ref: "", price: "", qty: "" });

export default function Calculator() {
  const [data] = useData(load, { settings: DEFAULT_SETTINGS, printers: [], filaments: [], materials: [] });
  const [fil, setFil] = useState<Line[]>([newLine()]);
  const [ext, setExt] = useState<Line[]>([]);
  const [printerId, setPrinterId] = useState("");
  const [f, setF] = useState({ watts: "", hours: "", minutes: "", laborMin: "", quantity: "1", freight: "", margin: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const r = useMemo(
    () =>
      calculate(
        {
          filaments: fil.map((l) => ({ pricePerKg: num(l.price), grams: num(l.qty) })),
          extras: ext.map((l) => ({ unitPrice: num(l.price), qty: num(l.qty) })),
          printerWatts: num(f.watts),
          printHours: num(f.hours) + num(f.minutes) / 60,
          laborHours: num(f.laborMin) / 60,
          quantity: num(f.quantity),
          freight: num(f.freight),
          marketplaceMarginPct: f.margin === "" ? data.settings.marketplaceMarginPct : num(f.margin),
        },
        data.settings,
      ),
    [fil, ext, f, data.settings],
  );

  function pickPrinter(id: string) {
    setPrinterId(id);
    const p = data.printers.find((x) => String(x.id) === id);
    if (p) setF({ ...f, watts: String(p.watts).replace(".", ",") });
  }

  return (
    <div className="page">
      <h1>Calculadora de preço</h1>
      <p className="lead">Informe os valores da mesa inteira. O custo é dividido pela quantidade de peças na mesa.</p>
      <div className="calc-layout">
        <div>
          <section className="card">
            <h2 className="card-title">
              <Cylinder aria-hidden /> Filamentos
            </h2>
            <Lines lines={fil} setLines={setFil} options={data.filaments} priceLabel="Preço por kg (R$)" qtyLabel="Gramas" addLabel="Adicionar filamento" />
          </section>

          <section className="card">
            <h2 className="card-title">
              <Clock aria-hidden /> Impressão e mão de obra
            </h2>
            <div className="grid">
              <label>
                Impressora
                <select value={printerId} onChange={(e) => pickPrinter(e.target.value)}>
                  <option value="">Digitar potência</option>
                  {data.printers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Potência (W)
                <input
                  inputMode="decimal"
                  value={f.watts}
                  onChange={(e) => {
                    setPrinterId(""); // potência digitada à mão não é mais a da impressora escolhida
                    set("watts")(e);
                  }}
                />
              </label>
              <label>Tempo de impressão (h)<input inputMode="decimal" value={f.hours} onChange={set("hours")} /></label>
              <label>+ minutos<input inputMode="decimal" value={f.minutes} onChange={set("minutes")} /></label>
              <label>Mão de obra (min)<input inputMode="decimal" value={f.laborMin} onChange={set("laborMin")} /></label>
              <label>Peças na mesa<input inputMode="numeric" value={f.quantity} onChange={set("quantity")} /></label>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">
              <Package aria-hidden /> Materiais extras
            </h2>
            <Lines lines={ext} setLines={setExt} options={data.materials} priceLabel="Preço unitário (R$)" qtyLabel="Quantidade" addLabel="Adicionar material" />
          </section>

          <section className="card">
            <h2 className="card-title">
              <Store aria-hidden /> Venda
            </h2>
            <div className="grid">
              <label>Frete absorvido por peça (R$)<input inputMode="decimal" value={f.freight} onChange={set("freight")} /></label>
              <label>Margem em marketplace (%)<input inputMode="decimal" placeholder={String(data.settings.marketplaceMarginPct)} value={f.margin} onChange={set("margin")} /></label>
            </div>
          </section>
        </div>

        <aside className="calc-summary" aria-live="polite">
          <section className="card hero">
            <span className="hint">Custo por peça</span>
            <strong className="big" key={r.unitCost}>{money(r.unitCost)}</strong>
            <div className="prices">
              <div>
                <span className="hint">Revenda ×{data.settings.multResale}</span>
                <b>{money(r.resale)}</b>
              </div>
              <div>
                <span className="hint">Consumidor ×{data.settings.multConsumer}</span>
                <b>{money(r.consumer)}</b>
              </div>
            </div>
          </section>
          <section className="card">
            <h2 className="card-title">Resultado por peça</h2>
            <table>
              <tbody>
                <tr><td>Filamento</td><td className="num">{money(r.filament)}</td></tr>
                <tr><td>Materiais extras</td><td className="num">{money(r.extras)}</td></tr>
                <tr><td>Energia</td><td className="num">{money(r.energy)}</td></tr>
                <tr><td>Mão de obra</td><td className="num">{money(r.labor)}</td></tr>
                <tr><td>Manutenção ({data.settings.maintenancePct}%)</td><td className="num">{money(r.maintenance)}</td></tr>
                <tr><th>Custo da mesa</th><th className="num">{money(r.batchCost)}</th></tr>
                <tr><th>Custo por peça</th><th className="num">{money(r.unitCost)}</th></tr>
              </tbody>
            </table>
          </section>
        </aside>
      </div>

      <h2>Preço por canal</h2>
      <table>
        <thead>
          <tr><th>Canal</th><th className="num">Preço</th><th className="num">Taxas</th><th className="num">Lucro</th><th className="num">Margem</th></tr>
        </thead>
        <tbody>
          <tr><td>Revenda (×{data.settings.multResale})</td><td className="num">{money(r.resale)}</td><td className="num">—</td><td className="num">{money(r.resaleProfit)}</td><td className="num">—</td></tr>
          <tr><td>Consumidor final (×{data.settings.multConsumer})</td><td className="num">{money(r.consumer)}</td><td className="num">—</td><td className="num">{money(r.consumerProfit)}</td><td className="num">—</td></tr>
          {r.channels.map((c) => (
            <tr key={c.name}>
              <td>{c.name}</td>
              {c.price === null ? (
                <td className="num" colSpan={4}>Taxa + margem passam de 100%</td>
              ) : (
                <>
                  <td className="num">{money(c.price)}</td>
                  <td className="num">{money(c.fees)}</td>
                  <td className="num">{money(c.profit)}</td>
                  <td className="num">{c.marginPct.toLocaleString("pt-BR")}%</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Lines(props: { lines: Line[]; setLines: (l: Line[]) => void; options: Option[]; priceLabel: string; qtyLabel: string; addLabel: string }) {
  const { lines, setLines, options } = props;
  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i: number, ref: string) => {
    const o = options.find((x) => String(x.id) === ref);
    update(i, { ref, price: o ? String(o.price).replace(".", ",") : lines[i].price });
  };
  return (
    <>
      {lines.map((l, i) => (
        <div className="row line" key={i}>
          <label>
            Cadastrado
            <select value={l.ref} onChange={(e) => pick(i, e.target.value)}>
              <option value="">Digitar preço</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label>{props.priceLabel}<input inputMode="decimal" value={l.price} onChange={(e) => update(i, { price: e.target.value, ref: "" })} /></label>
          <label>{props.qtyLabel}<input inputMode="decimal" value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} /></label>
          <button className="link danger" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remover</button>
        </div>
      ))}
      <button className="sm" onClick={() => setLines([...lines, newLine()])}>
        <Plus aria-hidden /> {props.addLabel}
      </button>
    </>
  );
}
