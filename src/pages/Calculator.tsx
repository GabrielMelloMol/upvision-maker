import { Clock, Cylinder, Package, Plus, Save, Store, TriangleAlert, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { filaments, loadSettings, materials, printers } from "../db/repo";
import type { Db } from "../db/types";
import { calculate } from "../domain/calc";
import { money, parseDecimal } from "../domain/format";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { compareChannels, competitorHint, roundPrice, ROUNDINGS, type ChannelRow, type Rounding } from "../domain/pricing";
import Segmented from "../ui/Segmented";
import { useData } from "../ui/useData";
import MoneyField from "../ui/MoneyField";
import { formatDuration, formatMoneyInput, parseDuration, parseMoney } from "../ui/parse";
import TimeField from "../ui/TimeField";
import SlicerImport, { type SlicerApply } from "./SlicerImport";
import type { Go } from "../pages";
import { setProductDraft } from "./products/draft";
import { useToast } from "../ui/Toast";

type Option = { id: number; label: string; price: number };
type Line = { ref: string; price: string; qty: string };

const load = async (db: Db) => ({
  settings: await loadSettings(db),
  printers: await printers.list(db),
  stock: await filaments.list(db),
  filaments: (await filaments.list(db)).map((f) => ({ id: f.id, label: [f.material, f.color, f.brand].filter(Boolean).join(" · "), price: f.pricePerKg })),
  materials: (await materials.list(db)).map((m) => ({ id: m.id, label: `${m.name} (${m.unit})`, price: m.unitPrice })),
});

const num = (s: string) => parseDecimal(s) || 0;
/** Preço digitado ("R$ 1.234,56", "15,9") → número; vazio conta como 0. */
const price = (s: string) => parseMoney(s) || 0;
const newLine = (): Line => ({ ref: "", price: "", qty: "" });

export default function Calculator({ go }: { go: Go }) {
  const [data, reloadData] = useData(load, { settings: DEFAULT_SETTINGS, printers: [], stock: [], filaments: [], materials: [] });
  const [fil, setFil] = useState<Line[]>([newLine()]);
  const [ext, setExt] = useState<Line[]>([]);
  const [printerId, setPrinterId] = useState("");
  const [f, setF] = useState({ watts: "", time: "", labor: "", quantity: "1", freight: "", margin: "" });
  const [rounding, setRounding] = useState<Rounding>("none");
  const [competitor, setCompetitor] = useState("");
  const printMin = parseDuration(f.time) || 0;
  const laborMin = parseDuration(f.labor, "min") || 0;
  const setText = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const r = useMemo(
    () =>
      calculate(
        {
          filaments: fil.map((l) => ({ pricePerKg: price(l.price), grams: num(l.qty) })),
          extras: ext.map((l) => ({ unitPrice: price(l.price), qty: num(l.qty) })),
          printerWatts: num(f.watts),
          printHours: printMin / 60,
          laborHours: laborMin / 60,
          quantity: num(f.quantity),
          freight: price(f.freight),
          marketplaceMarginPct: f.margin === "" ? data.settings.marketplaceMarginPct : num(f.margin),
        },
        data.settings,
      ),
    [fil, ext, f, printMin, laborMin, data.settings],
  );

  /** Preenche a calculadora com o que o arquivo do fatiador informou. */
  function applySlicer(a: SlicerApply) {
    const str = (n: number) => String(n).replace(".", ",");
    const brl = (n: number) => formatMoneyInput(String(n));
    setFil(
      a.filaments.map((x) => ({ ref: x.filamentId ? String(x.filamentId) : "", price: x.pricePerKg !== null ? brl(x.pricePerKg) : "", qty: str(x.grams) })),
    );
    setPrinterId(a.printerId ? String(a.printerId) : "");
    setF((cur) => ({
      ...cur,
      watts: a.printerWatts !== null ? str(a.printerWatts) : cur.watts,
      time: a.seconds !== undefined ? formatDuration(Math.round(a.seconds / 60)) : cur.time,
      quantity: a.pieces ? String(a.pieces) : cur.quantity,
    }));
  }

  const toast = useToast();

  /** Leva a composição atual para um produto novo (só linhas com filamento/material cadastrado). */
  function saveAsProduct() {
    const reg = (ls: Line[]) => ls.filter((l) => l.ref && num(l.qty) > 0);
    const skipped = fil.length + ext.length - reg(fil).length - reg(ext).length;
    if (skipped > 0) toast(`${skipped} linha(s) sem item cadastrado ficaram de fora do produto.`, "error");
    setProductDraft({
      composition: {
        filaments: reg(fil).map((l) => ({ filamentId: Number(l.ref), grams: num(l.qty) })),
        materials: reg(ext).map((l) => ({ materialId: Number(l.ref), qty: num(l.qty) })),
        items: [],
      },
      printerId: printerId ? Number(printerId) : null,
      printMinutes: printMin,
      laborMinutes: laborMin,
      piecesPerPlate: Math.max(1, Math.floor(num(f.quantity)) || 1),
      freight: price(f.freight),
    });
    go("products");
  }

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
          <SlicerImport stock={data.stock} printers={data.printers} onApply={applySlicer} onStockAdded={reloadData} />
          <section className="card">
            <h2 className="card-title">
              <Cylinder aria-hidden /> Filamentos
            </h2>
            <Lines lines={fil} setLines={setFil} options={data.filaments} priceLabel="Preço por kg" qtyLabel="Gramas" addLabel="Adicionar filamento" />
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
              <TimeField label="Tempo de impressão" value={f.time} onChange={setText("time")} />
              <TimeField label="Mão de obra" bare="min" value={f.labor} onChange={setText("labor")} placeholder="15 min" hint="Ex.: 15 (minutos), 1h10" />
              <label>Peças na mesa<input inputMode="numeric" value={f.quantity} onChange={set("quantity")} /></label>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">
              <Package aria-hidden /> Materiais extras
            </h2>
            <Lines lines={ext} setLines={setExt} options={data.materials} priceLabel="Preço unitário" qtyLabel="Quantidade" addLabel="Adicionar material" />
          </section>

          <section className="card">
            <h2 className="card-title">
              <Store aria-hidden /> Venda
            </h2>
            <div className="grid">
              <MoneyField label="Frete absorvido por peça" value={f.freight} onChange={setText("freight")} />
              <label>Margem em marketplace (%)<input inputMode="decimal" placeholder={String(data.settings.marketplaceMarginPct)} value={f.margin} onChange={set("margin")} /></label>
            </div>
          </section>
        </div>

        <aside className="calc-summary" aria-live="polite">
          <section className="card hero">
            <span className="hint">Custo por peça</span>
            <strong className="big" key={r.unitCost}>{money(r.unitCost)}</strong>
            <button className="primary sm" onClick={saveAsProduct}>
              <Save aria-hidden /> Salvar como produto
            </button>
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

      <ChannelTable rows={compareChannels(r, data.settings, price(f.freight), { rounding, competitor: price(competitor) })} minMarginPct={data.settings.minMarginPct}>
        <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-4)", marginBottom: "var(--space-3)" }}>
          <div className="stack" style={{ gap: 6 }}>
            <span className="field-label">Arredondar preços</span>
            <Segmented label="Arredondar preços" value={rounding} onChange={setRounding} options={ROUNDINGS} />
          </div>
          <div style={{ flex: "1 1 240px", maxWidth: 360 }}>
          <MoneyField
            label="Preço do concorrente"
            value={competitor}
            onChange={setCompetitor}
            hint={<CompetitorHint ours={roundPrice(r.consumer, rounding)} competitor={price(competitor)} />}
          />
          </div>
        </div>
      </ChannelTable>
    </div>
  );
}

function Lines(props: { lines: Line[]; setLines: (l: Line[]) => void; options: Option[]; priceLabel: string; qtyLabel: string; addLabel: string }) {
  const { lines, setLines, options } = props;
  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i: number, ref: string) => {
    const o = options.find((x) => String(x.id) === ref);
    update(i, { ref, price: o ? formatMoneyInput(String(o.price)) : lines[i].price });
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
          <MoneyField label={props.priceLabel} value={l.price} onChange={(v) => update(i, { price: v, ref: "" })} />
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

function CompetitorHint({ ours, competitor }: { ours: number; competitor: number }) {
  const h = competitorHint(ours, competitor);
  if (!h) return <>Opcional: veja se o seu preço está longe do mercado.</>;
  return h.ok ? <span className="hint ok">{h.text}</span> : <span className="error">{h.text}</span>;
}

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Preço em cada canal lado a lado, com lucro líquido depois das taxas e alertas (nunca só por cor). */
function ChannelTable({ rows, minMarginPct, children }: { rows: ChannelRow[]; minMarginPct: number; children: React.ReactNode }) {
  const comp = rows.some((x) => x.atCompetitor);
  return (
    <section className="card">
      <h2 className="card-title">
        <Store aria-hidden /> Preço por canal
      </h2>
      {children}
      <table>
        <thead>
          <tr>
            <th>Canal</th>
            <th className="num">Preço</th>
            <th className="num">Taxas</th>
            <th className="num">Lucro líquido</th>
            <th className="num">Margem</th>
            {comp && (
              <th className="num" title="Lucro líquido em cada canal vendendo pelo preço do concorrente, já descontadas as taxas">
                Lucro no preço do concorrente
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.name}>
              <td>
                {c.name} {c.best && <span className="badge ok"><Trophy aria-hidden size={12} /> melhor lucro</span>}
                {c.belowMin && <span className="badge warn" title={`Margem mínima: ${pct(minMarginPct)} (Preferências)`}><TriangleAlert aria-hidden size={12} /> abaixo da margem mínima</span>}
              </td>
              {c.price === null ? (
                <td className="num" colSpan={4}>Taxa + margem passam de 100%</td>
              ) : (
                <>
                  <td className="num">{money(c.price)}</td>
                  <td className="num">{money(c.fees)}</td>
                  <td className="num"><Profit value={c.profit} loss={c.loss} /></td>
                  <td className="num">{pct(c.marginPct)}</td>
                </>
              )}
              {comp && <td className="num">{c.atCompetitor && <Profit value={c.atCompetitor.profit} loss={c.atCompetitor.loss} />}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Profit({ value, loss }: { value: number; loss: boolean }) {
  if (!loss) return <>{money(value)}</>;
  return (
    <>
      <span style={{ color: "var(--danger)" }}>{money(value)}</span>{" "}
      <span className="badge"><TriangleAlert aria-hidden size={12} /> prejuízo</span>
    </>
  );
}
