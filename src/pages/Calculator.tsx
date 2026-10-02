import { Columns2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getDb } from "../db";
import { costsRepo } from "../db/costsRepo";
import { filaments, loadSettings, materials, printers } from "../db/repo";
import type { Db } from "../db/types";
import { calculate, failureFor, machineHourCost } from "../domain/calc";
import { findCatalogPrinter, printerLabel } from "../domain/catalog/printers";
import { staleChannelText } from "../domain/channels";
import { looksLikePsuWatts } from "../domain/energy";
import { sanityWarnings } from "../domain/sanity";
import { fixedCostPerHour } from "../domain/finance";
import { parseDecimal } from "../domain/format";
import { todayIso } from "../domain/orders";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { compareChannels, roundPrice, type Rounding } from "../domain/pricing";
import Segmented from "../ui/Segmented";
import { useData } from "../ui/useData";
import { formatDuration, formatMoneyInput, parseDuration, parseMoney } from "../ui/parse";
import TimeField from "../ui/TimeField";
import { takePendingEstimate } from "./calculator/pendingFile";
import { type SlicerApply } from "./SlicerImport";
import type { Go } from "../pages";
import { setProductDraft } from "./products/draft";
import { errorText, useToast } from "../ui/Toast";
import ChannelTable from "./calculator/ChannelTable";
import PlugSheet from "./calculator/PlugSheet";
import CalcWarnings from "./calculator/CalcWarnings";
import FullForm from "./calculator/FullForm";
import PriceControls from "./calculator/PriceControls";
import PrinterSelect from "./calculator/PrinterSelect";
import AddToQuote from "./calculator/AddToQuote";
import HistoryCard, { useCalcHistory } from "./calculator/History";
import Compare from "./calculator/Compare";
import Lines, { newLine } from "./calculator/Lines";
import { scenarioSummary, type ScenarioSummary } from "../domain/scenario";
import type { Saved } from "./calculator/saved";
import PriceSplit from "./calculator/PriceSplit";
import PriceDiffLink from "./calculator/PriceDiffSheet";
import TestPrice from "./calculator/TestPrice";
import QuantityTable from "./calculator/QuantityTable";
import AdsCard from "./calculator/AdsCard";
import { peekQuoteDraft } from "./quotes/draft";
import { CostBreakdown, PriceHero } from "./calculator/Result";
import { useExample } from "../help/helpStore";
import { EMPTY_FORM, loadSaved, storeSaved, type CalcForm, type Line } from "./calculator/saved";

type Mode = "quick" | "full";
const MODES = [
  ["quick", "Rápido"],
  ["full", "Completo"],
] as const;

async function load(db: Db) {
  const settings = await loadSettings(db);
  const stock = await filaments.list(db);
  return {
    settings,
    fixedPerHour: fixedCostPerHour(await costsRepo.list(db), settings, todayIso()),
    printers: await printers.list(db),
    stock,
    filaments: stock.map((f) => ({ id: f.id, label: [f.material, f.color, f.brand].filter(Boolean).join(" · "), price: f.pricePerKg })),
    materials: (await materials.list(db)).map((m) => ({ id: m.id, label: `${m.name} (${m.unit})`, price: m.unitPrice })),
  };
}

const num = (s: string) => parseDecimal(s) || 0;
/** Preço digitado ("R$ 1.234,56", "15,9") → número; vazio conta como 0. */
const price = (s: string) => parseMoney(s) || 0;
const str = (n: number) => String(n).replace(".", ",");
const REFERENCE = "Ex.: Bambu A1 95 W · Ender-3 110 W";

export default function Calculator({ go }: { go: Go }) {
  const [saved] = useState(loadSaved);
  const [data, reloadData, loading] = useData(load, { settings: DEFAULT_SETTINGS, fixedPerHour: 0, printers: [], stock: [], filaments: [], materials: [] });
  const [mode, setMode] = useState<Mode>(saved?.mode ?? "quick");
  const [fil, setFil] = useState<Line[]>(saved?.fil ?? [newLine()]);
  const [ext, setExt] = useState<Line[]>(saved?.ext ?? []);
  const [printerId, setPrinterId] = useState(saved?.printerId ?? "");
  const [f, setF] = useState<CalcForm>(saved?.f ?? EMPTY_FORM);
  // "Usar exemplo" da ajuda (#84): chaveiro de 12 g em PLA a R$ 120/kg, 45 min, 4 na mesa
  useExample("calculator", () => {
    setFil([{ ref: "", price: "120,00", qty: "48" }]);
    setF({ ...EMPTY_FORM, name: "Chaveiro de exemplo", time: "3h", quantity: "4", watts: "95" });
  });
  const [rounding, setRounding] = useState<Rounding>("none");
  const [competitor, setCompetitor] = useState("");
  const [plugOpen, setPlugOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]); // avisos de valor fora do normal marcados "está certo"
  const [scenarioA, setScenarioA] = useState<{ snap: Saved; sum: ScenarioSummary } | null>(null); // #44
  const [draftCount, setDraftCount] = useState(() => peekQuoteDraft()?.items.length ?? 0);
  const toast = useToast();
  const printMin = parseDuration(f.time) || 0;
  const laborMin = parseDuration(f.labor, "min") || 0;
  const setText = (k: keyof CalcForm) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const set = (k: keyof CalcForm) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const printer = data.printers.find((p) => String(p.id) === printerId);
  const machinePerHour = printer ? machineHourCost(printer) : 0;
  const catalog = printer ? findCatalogPrinter(printer.name) : undefined;

  useEffect(() => storeSaved({ mode, fil, ext, printerId, f }), [mode, fil, ext, printerId, f]);
  // estimativa trazida de uma ferramenta 3D (#99): gramas por filamento e tempo, na calculadora completa (uma vez, ao abrir)
  const takeEstimate = useRef(() => {
    const a = takePendingEstimate();
    if (!a) return;
    setMode("full");
    applySlicer(a);
    toast("Estimativa trazida da ferramenta 3D. Pode errar ±20%: se fatiar, importe o arquivo para o valor certo.");
  });
  useEffect(() => takeEstimate.current(), []);

  // Embalagem padrão (Preferências): a calculadora nova já abre com ela, 1 por peça na mesa.
  // (ajuste de estado durante o render, sem efeito: roda uma vez quando os dados chegam)
  const [packed, setPacked] = useState(saved !== null);
  if (!loading && !packed) {
    setPacked(true);
    const m = data.materials.find((x) => x.id === data.settings.packagingMaterialId);
    if (m) setExt([{ ref: String(m.id), price: formatMoneyInput(String(m.price)), qty: f.quantity || "1" }]);
  }

  const failure = failureFor(
    fil.flatMap((l) => data.stock.find((x) => String(x.id) === l.ref)?.material ?? []),
    data.settings,
  );
  const r = calculate(
    {
      filaments: fil.map((l) => ({ pricePerKg: price(l.price), grams: num(l.qty) })),
      purgeGrams: num(f.swaps) * num(f.perSwap),
      extras: ext.map((l) => ({ unitPrice: price(l.price), qty: num(l.qty) })),
      printerWatts: num(f.watts),
      printHours: printMin / 60,
      laborHours: laborMin / 60,
      quantity: num(f.quantity),
      freight: price(f.freight),
      marketplaceMarginPct: f.margin === "" ? data.settings.marketplaceMarginPct : num(f.margin),
      machinePerHour,
      fixedPerHour: data.fixedPerHour,
      energyKwh: num(f.kwh),
      failurePct: failure.pct,
    },
    data.settings,
  );

  const warnings = sanityWarnings({
    filaments: fil.map((l) => ({ pricePerKg: price(l.price), grams: num(l.qty) })),
    printHours: printMin / 60,
    watts: num(f.watts),
    failurePct: failure.pct,
    channelFees: data.settings.channels,
    consumer: r.consumer,
    unitCost: r.unitCost,
  }).filter((w) => !dismissed.includes(w.key));
  // potência da fonte (etiqueta) no lugar do consumo: com o catálogo dá para sugerir o valor certo (#40)
  const psuFix = looksLikePsuWatts(num(f.watts), catalog?.watts) ? catalog : undefined;
  const shownWarnings = psuFix ? warnings.filter((w) => !w.key.startsWith("w:")) : warnings;
  const staleFees = Object.fromEntries(data.settings.channels.flatMap((c) => {
    const t = staleChannelText(c, todayIso());
    return t ? [[c.name, t]] : [];
  }));
  const snapshot: Saved = { mode, fil, ext, printerId, f };
  const grams = fil.reduce((t, l) => t + num(l.qty), 0);
  const history = useCalcHistory(snapshot, { name: f.name.trim(), grams, hours: printMin / 60, price: r.consumer }, r.unitCost > 0);
  function loadSnapshot(s: Saved) {
    setFil(s.fil.length ? s.fil : [newLine()]);
    setExt(s.ext);
    setPrinterId(s.printerId);
    setF(s.f);
    setMode(s.mode);
  }
  function reopen(e: Parameters<typeof history.reopen>[0]) {
    const s = history.reopen(e);
    if (!s) return;
    loadSnapshot(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const rows = compareChannels(r, data.settings, price(f.freight), { rounding, competitor: price(competitor), hours: printMin / 60, qty: num(f.quantity) });
  const marginPct = f.margin === "" ? data.settings.marketplaceMarginPct : num(f.margin);
  const current = scenarioSummary(f.name.trim(), r, rows, grams, printMin / 60);

  /** Preenche a calculadora com o que o arquivo do fatiador informou. */
  // nome que veio do último arquivo: um arquivo novo só troca o nome se a pessoa não digitou outro
  const autoName = useRef("");
  function applySlicer(a: SlicerApply) {
    const brl = (n: number) => formatMoneyInput(String(n));
    setFil(
      a.filaments.map((x) => ({ ref: x.filamentId ? String(x.filamentId) : "", price: x.pricePerKg !== null ? brl(x.pricePerKg) : "", qty: str(x.grams) })),
    );
    if (a.printerId !== undefined) setPrinterId(a.printerId ? String(a.printerId) : "");
    setF((cur) => ({
      ...cur,
      watts: a.printerWatts !== null ? str(a.printerWatts) : cur.watts,
      time: a.seconds !== undefined ? formatDuration(Math.round(a.seconds / 60)) : cur.time,
      quantity: a.pieces ? String(a.pieces) : cur.quantity,
      name: a.name && (!cur.name.trim() || cur.name === autoName.current) ? a.name : cur.name,
    }));
    if (a.name) autoName.current = a.name;
  }

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
      ...(f.name.trim() && { name: f.name.trim() }),
    });
    go("products");
  }

  function pickPrinter(id: string) {
    setPrinterId(id);
    const p = data.printers.find((x) => String(x.id) === id);
    if (p) setF({ ...f, watts: str(p.watts) });
  }

  function clear() {
    setFil([newLine()]);
    setExt([]);
    setPrinterId("");
    setF(EMPTY_FORM);
    setCompetitor("");
    history.startNew();
  }

  /** W medido na tomada: vale para esta conta e, com impressora escolhida, fica gravado nela. */
  async function applyWatts(watts: number) {
    setPlugOpen(false);
    setF((cur) => ({ ...cur, watts: String(watts) }));
    if (!printer) return;
    try {
      await printers.update(await getDb(), printer.id, { ...printer, watts });
      reloadData();
      toast(`Potência da ${printer.name} atualizada: ${watts} W.`);
    } catch (err) {
      toast(`Não foi possível salvar na impressora: ${errorText(err)}`, "error");
    }
  }

  const printerSelect = (
    <PrinterSelect
      printers={data.printers}
      value={printerId}
      onPick={pickPrinter}
      onCatalog={(p) => {
        setPrinterId(String(p.id));
        setF((cur) => ({ ...cur, watts: str(p.watts) }));
        reloadData();
      }}
    />
  );
  const timeField = <TimeField label="Tempo de impressão" value={f.time} onChange={setText("time")} />;
  const piecesField = <label>Peças na mesa<input inputMode="numeric" value={f.quantity} onChange={set("quantity")} /></label>;
  const fillLine = (
    <Lines
      single
      lines={fil.length ? fil.slice(0, 1) : [newLine()]}
      setLines={(l) => setFil([...l, ...fil.slice(1)])}
      options={data.filaments}
      priceLabel="Preço por kg"
      qtyLabel="Gramas"
      addLabel=""
    />
  );

  return (
    <div className="page">
      {plugOpen && <PlugSheet catalogWatts={catalog?.watts} onUse={applyWatts} onClose={() => setPlugOpen(false)} />}
      {/* redesign (#139): título com os controles da tela na mesma linha; subtítulo de 1 linha (#143) */}
      <div className="title-row">
        <h1>Calculadora de preço</h1>
        <Segmented label="Modo da calculadora" value={mode} onChange={setMode} options={MODES} />
        <button type="button" className="link" onClick={clear}>
          Limpar
        </button>
      </div>
      <p className="lead">{mode === "quick" ? "O resto (energia, desgaste, margem) vem das Preferências." : "Valores da mesa inteira, divididos pelas peças."}</p>
      <div className="calc-layout">
        <div>
          <label className="piece-name">
            Nome da peça
            <input value={f.name} maxLength={200} placeholder="Ex.: Chaveiro coração" onChange={set("name")} />
          </label>
          {mode === "quick" ? (
            <section className="card">
              <h2 className="card-title">Cálculo rápido</h2>
              {fillLine}
              {fil.length > 1 && <p className="hint">+{fil.length - 1} filamento(s) no modo Completo.</p>}
              <div className="grid">
                {printerSelect}
                {timeField}
                {piecesField}
              </div>
            </section>
          ) : (
            <FullForm
              data={data}
              fil={fil}
              setFil={setFil}
              ext={ext}
              setExt={setExt}
              f={f}
              setText={setText}
              set={set}
              printerSelect={printerSelect}
              timeField={timeField}
              piecesField={piecesField}
              wattsHint={catalog ? `${printerLabel(catalog)}: ${catalog.watts} W (${catalog.source === "oficial" ? "oficial" : "estimativa"})` : REFERENCE}
              onWatts={(v) => {
                setPrinterId(""); // potência digitada à mão não é mais a da impressora escolhida
                setText("watts")(v);
              }}
              onApplySlicer={applySlicer}
              onStockAdded={reloadData}
              onOpenPlug={() => setPlugOpen(true)}
            />
          )}
        </div>

        <aside className="calc-summary" aria-live="polite">
          <CalcWarnings psuFix={psuFix} watts={num(f.watts)} onUseWatts={(w) => void applyWatts(w)} warnings={shownWarnings} onDismiss={(k) => setDismissed([...dismissed, k])} />
          <PriceHero r={r} s={data.settings} onSave={saveAsProduct} onPreferences={() => go("preferences")}>
            {mode === "quick" && (
              <>
                <TestPrice rows={rows} value={competitor} onChange={setCompetitor} minMarginPct={data.settings.minMarginPct} target={data.settings.targetProfitPerHour} />
                <button type="button" className="sm" onClick={() => setMode("full")}>
                  Ver detalhes
                </button>
              </>
            )}
          </PriceHero>
          <PriceDiffLink r={r} s={data.settings} failurePct={failure.pct} watts={num(f.watts)} />
          {!scenarioA && r.unitCost > 0 && (
            <button type="button" className="link" style={{ textAlign: "left" }} onClick={() => setScenarioA({ snap: snapshot, sum: current })}>
              <Columns2 aria-hidden size={14} /> Comparar com outro cenário (guarda este como A)
            </button>
          )}
          <AddToQuote
            rows={rows}
            unitCost={r.unitCost}
            pieces={num(f.quantity)}
            printMinutes={printMin}
            name={f.name}
            count={draftCount}
            onAdded={setDraftCount}
            onOpen={() => go("quotes")}
          />
          {mode === "full" && <CostBreakdown r={r} s={data.settings} machinePerHour={machinePerHour} fixedPerHour={data.fixedPerHour} failure={failure} purge={{ swaps: num(f.swaps), grams: num(f.swaps) * num(f.perSwap), filamentGrams: grams }} />}
          {mode === "full" && <PriceSplit r={r} rows={rows} freight={price(f.freight)} />}
        </aside>
      </div>
      {scenarioA && (
        <Compare
          a={scenarioA.sum}
          b={current}
          onSwap={() => {
            setScenarioA({ snap: snapshot, sum: current });
            loadSnapshot(scenarioA.snap);
          }}
          onClose={() => setScenarioA(null)}
        />
      )}
      {mode === "full" && (
        <ChannelTable rows={rows} minMarginPct={data.settings.minMarginPct} target={data.settings.targetProfitPerHour} stale={staleFees}>
          <PriceControls rounding={rounding} onRounding={setRounding} competitor={competitor} onCompetitor={setCompetitor} ours={roundPrice(r.consumer, rounding)} />
        </ChannelTable>
      )}
      {mode === "full" && <AdsCard r={r} s={data.settings} rows={rows} freight={price(f.freight)} marginPct={marginPct} />}
      {mode === "full" && (
        <QuantityTable
          r={r}
          s={data.settings}
          rows={rows}
          freight={price(f.freight)}
          rounding={rounding}
          marginPct={marginPct}
          minutesPerPiece={printMin / Math.max(1, Math.floor(num(f.quantity)) || 1)}
          name={f.name}
          prepTime={f.prepTime}
          prepFixed={f.prepFixed}
          onPrep={(patch) => setF((cur) => ({ ...cur, ...patch }))}
          onAdded={setDraftCount}
        />
      )}
      <HistoryCard list={history.list} onReopen={reopen} onRemove={(id) => void history.remove(id)} />
    </div>
  );
}
