import { Columns2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getDb } from "../db";
import { costsRepo } from "../db/costsRepo";
import { filaments, loadSettings, materials, printers, saveSettings } from "../db/repo";
import type { Db } from "../db/types";
import { calculate, failureFor, machineHourCost } from "../domain/calc";
import { findCatalogPrinter, printerLabel } from "../domain/catalog/printers";
import { staleChannelText } from "../domain/channels";
import { looksLikePsuWatts } from "../domain/energy";
import { sanityWarnings } from "../domain/sanity";
import { fixedCostPerHour } from "../domain/finance";
import { money, parseDecimal } from "../domain/format";
import { todayIso } from "../domain/orders";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { compareChannels, roundPrice, type Rounding } from "../domain/pricing";
import Segmented from "../ui/Segmented";
import { useData } from "../ui/useData";
import { bareHoursNote, formatDuration, formatMoneyInput, parseDuration, parseMoney } from "../ui/parse";
import SmartField from "../ui/SmartField";
import TimeField from "../ui/TimeField";
import { takePendingEstimate } from "./calculator/pendingFile";
import { type SlicerApply } from "./SlicerImport";
import type { Go } from "../pages";
import { setProductDraft } from "./products/draft";
import { draftComposition, equivalentWatts, hasTyped, kwhPrinterId, registerTyped, typedItems, withPurge, type Registered, type Typed } from "./calculator/productDraft";
import TypedItemsSheet from "./calculator/TypedItemsSheet";
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
  // o arredondamento é do app inteiro (Preferências): a escolha aqui fica guardada e vale também nos pedidos (B2, M4)
  const [roundingPick, setRoundingPick] = useState<Rounding | null>(null);
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
    applySlicer(a, false); // estimativa da ferramenta 3D: não é arquivo do fatiador
    toast(
      a.filaments.some((x) => x.estimated)
        ? "Estimativa trazida da ferramenta 3D. Cores sem filamento cadastrado usam o preço médio do seu estoque (ou R$ 100/kg): confira. Pode errar ±20%."
        : "Estimativa trazida da ferramenta 3D. Pode errar ±20%: se fatiar, importe o arquivo para o valor certo.",
    );
  });
  useEffect(() => takeEstimate.current(), []);

  // Embalagem padrão (Preferências): a calculadora nova já abre com ela, 1 por peça na mesa.
  // (ajuste de estado durante o render, sem efeito: roda uma vez quando os dados chegam)
  const [packed, setPacked] = useState(saved !== null);
  if (!loading && !packed) {
    setPacked(true);
    const m = data.materials.find((x) => x.id === data.settings.packagingMaterialId);
    if (m) setExt([{ ref: String(m.id), price: formatMoneyInput(String(m.price)), qty: f.quantity || "1", perPiece: true }]); // acompanha as peças na mesa (A4)
  }

  // a embalagem padrão acompanha "Peças na mesa" (A4): a quantidade da linha é derivada, até a pessoa digitar outra
  const pieces = Math.max(1, Math.floor(parseDecimal(f.quantity) || 1));
  const extLines = ext.map((l) => (l.perPiece ? { ...l, qty: String(pieces) } : l));
  const failure = failureFor(
    fil.flatMap((l) => data.stock.find((x) => String(x.id) === l.ref)?.material ?? []),
    data.settings,
  );
  // margem em branco ou que não deu para ler (M2): vale a das Preferências, e o campo avisa
  const marginRead = parseDecimal(f.margin);
  const marginPct = f.margin.trim() === "" || !Number.isFinite(marginRead) ? data.settings.marketplaceMarginPct : marginRead;
  const r = calculate(
    {
      filaments: fil.map((l) => ({ pricePerKg: price(l.price), grams: num(l.qty) })),
      purgeGrams: num(f.swaps) * num(f.perSwap),
      extras: extLines.map((l) => ({ unitPrice: price(l.price), qty: num(l.qty) })),
      printerWatts: num(f.watts),
      printHours: printMin / 60,
      laborHours: laborMin / 60,
      quantity: num(f.quantity),
      freight: price(f.freight),
      marketplaceMarginPct: marginPct,
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
  const dateBr = (iso: string) => iso.split("-").reverse().join("/");
  const ruleNotes = Object.fromEntries(data.settings.channels.filter((c) => c.tiers?.length).map((c) => [c.name, `Taxas por faixa de preço${c.checkedAt ? `, conferidas em ${dateBr(c.checkedAt)}` : ""}: confira em Preferências.`]));
  const snapshot: Saved = { mode, fil, ext: extLines, printerId, f };
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
  const rounding: Rounding = roundingPick ?? data.settings.rounding;
  async function chooseRounding(m: Rounding) {
    setRoundingPick(m);
    try {
      const db = await getDb();
      await saveSettings(db, { ...(await loadSettings(db)), rounding: m });
    } catch (e) {
      toast(`Não consegui guardar o arredondamento: ${errorText(e)}`, "error");
    }
  }
  const rows = compareChannels(r, data.settings, price(f.freight), { rounding, competitor: price(competitor), hours: printMin / 60, qty: num(f.quantity) });
  const current = scenarioSummary(f.name.trim(), r, rows, grams, printMin / 60);

  /** Preenche a calculadora com o que o arquivo do fatiador informou. */
  // nome que veio do último arquivo: um arquivo novo só troca o nome se a pessoa não digitou outro
  const autoName = useRef("");
  function applySlicer(a: SlicerApply, fromFile = true) {
    const brl = (n: number) => formatMoneyInput(String(n));
    setFil(
      a.filaments.map((x) => ({ ref: x.filamentId ? String(x.filamentId) : "", price: x.pricePerKg !== null ? brl(x.pricePerKg) : "", qty: str(x.grams), ...(x.estimated ? { estimated: true } : {}) })),
    );
    if (a.printerId !== undefined) setPrinterId(a.printerId ? String(a.printerId) : "");
    setF((cur) => ({
      ...cur,
      watts: a.printerWatts !== null ? str(a.printerWatts) : cur.watts,
      time: a.seconds !== undefined ? formatDuration(Math.round(a.seconds / 60)) : cur.time,
      quantity: a.pieces !== undefined && a.pieces > 0 ? String(a.pieces) : cur.quantity, // a estimativa da ferramenta é da peça desenhada: o "Peças na mesa" da conta anterior não vale (C4)
      name: a.name && (!cur.name.trim() || cur.name === autoName.current) ? a.name : cur.name,
    }));
    if (a.name) autoName.current = a.name;
    // a purga já vem somada nas gramas do arquivo: as trocas de cor digitadas antes contariam duas vezes (M9)
    if (fromFile && num(f.swaps) > 0) {
      setF((cur) => ({ ...cur, swaps: "" }));
      toast("As trocas de cor digitadas foram zeradas: a purga já vem nas gramas do arquivo do fatiador.");
    }
  }

  /** Leva a composição atual para um produto novo. Itens digitados sem cadastro: pergunta antes de cadastrar (C1). */
  const [typedAsk, setTypedAsk] = useState<Typed | null>(null);
  function saveAsProduct() {
    const t = typedItems(fil, ext, printerId, f.watts, num, num);
    if (hasTyped(t)) return setTypedAsk(t);
    void finishProduct(null);
  }
  async function registerAndSave(t: Typed) {
    try {
      const ids = await registerTyped(await getDb(), t, f.name.trim());
      setTypedAsk(null);
      await finishProduct(ids);
    } catch (e) {
      toast(errorText(e), "error");
    }
  }
  async function finishProduct(ids: Registered | null) {
    setTypedAsk(null);
    // a purga digitada vira gramas nas linhas e o kWh medido vira uma impressora de mesma potência (C3): nada some em silêncio
    const composition = withPurge(draftComposition(fil, ext, num, num, ids), num(f.swaps) * num(f.perSwap));
    const skipped = [...fil, ...ext].filter((l) => num(l.qty) > 0).length - composition.filaments.length - composition.materials.length;
    if (skipped > 0) toast(`${skipped} linha(s) sem item cadastrado ficaram de fora do produto.`, "error");
    let productPrinter: number | null = ids?.printerId ?? (printerId ? Number(printerId) : null);
    const kwh = num(f.kwh);
    if (kwh > 0) {
      const watts = equivalentWatts(kwh, printMin / 60);
      if (watts === null) toast("O kWh medido ficou de fora do produto: informe o tempo de impressão para converter em potência.", "error");
      else {
        try {
          const base = data.printers.find((p) => p.id === productPrinter);
          productPrinter = await kwhPrinterId(await getDb(), base, watts);
          toast(`O kWh medido foi gravado como a impressora "${base?.name ?? "Impressora da calculadora"} (kWh medido)", de ${watts.toLocaleString("pt-BR")} W.`);
        } catch (e) {
          toast(`Não consegui gravar o kWh medido: ${errorText(e)}`, "error");
        }
      }
    }
    setProductDraft({
      composition,
      printerId: productPrinter,
      printMinutes: printMin,
      laborMinutes: laborMin,
      piecesPerPlate: Math.max(1, Math.floor(num(f.quantity)) || 1),
      freight: price(f.freight),
      ...(price(competitor) > 0 && { manualPrice: price(competitor) }), // "Vou vender por" vira o preço do produto
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
  // "90" solto são 90 horas (M3): avisa quando passa de 24 h
  /** O que o modo Completo guardou e continua valendo no Rápido, sem aparecer (A3). */
  const hiddenInQuick = [
    price(f.freight) > 0 && `frete de ${money(price(f.freight))} por peça`,
    laborMin > 0 && `mão de obra de ${formatDuration(laborMin)}`,
    extLines.filter((l) => num(l.qty) > 0 && price(l.price) > 0).length > 0 && `${extLines.filter((l) => num(l.qty) > 0 && price(l.price) > 0).length} material(is) extra(s)`,
    num(f.swaps) > 0 && `${num(f.swaps)} trocas de cor`,
    num(f.kwh) > 0 && `kWh medido de ${num(f.kwh)}`,
    f.margin.trim() !== "" && Number.isFinite(parseDecimal(f.margin)) && `margem de ${f.margin}%`,
  ].filter((x): x is string => !!x);
  const timeField = <TimeField label="Tempo de impressão" value={f.time} onChange={setText("time")} warn={bareHoursNote(f.time)} />;
  const piecesField = (
    <SmartField label="Peças na mesa" inputMode="numeric" parse={(t: string) => { const n = parseDecimal(t); return Number.isInteger(n) && n >= 1 ? n : NaN; }} invalidText="Digite um número inteiro de peças, ex.: 4." value={f.quantity} onChange={setText("quantity")} />
  );
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
      {typedAsk && <TypedItemsSheet typed={typedAsk} onRegister={() => void registerAndSave(typedAsk)} onSkip={() => finishProduct(null)} onClose={() => setTypedAsk(null)} />}
      {plugOpen && <PlugSheet catalogWatts={catalog?.watts} onUse={applyWatts} onClose={() => setPlugOpen(false)} />}
      {/* redesign (#139): título com os controles da tela na mesma linha; subtítulo de 1 linha (#143) */}
      <div className="title-row">
        <h1>Calculadora de preço</h1>
        <Segmented label="Modo da calculadora" value={mode} onChange={setMode} options={MODES} />
        <button type="button" className="link" onClick={clear}>
          Limpar
        </button>
      </div>
      <p className="lead">{mode === "quick" ? "Digite o filamento e o tempo para ver quanto custa e quanto cobrar." : "Valores da mesa inteira, divididos pelas peças."}</p>
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
                {/* sem impressora escolhida a energia seria R$ 0 sem aviso (A3): pede a potência aqui */}
                {!printerId && <SmartField label="Potência (W)" inputMode="decimal" parse={parseDecimal} invalidText="Digite os watts, ex.: 95." value={f.watts} placeholder="Ex.: 95" hint="Sem ela a energia não entra na conta." onChange={setText("watts")} />}
                {timeField}
                {piecesField}
              </div>
              {hiddenInQuick.length > 0 && <p className="hint">Também entram na conta (modo Completo): {hiddenInQuick.join(", ")}.</p>}
            </section>
          ) : (
            <FullForm
              data={data}
              fil={fil}
              setFil={setFil}
              ext={extLines}
              setExt={setExt}
              f={f}
              setText={setText}
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
          {mode === "full" && <CostBreakdown pieces={pieces} r={r} s={data.settings} machinePerHour={machinePerHour} fixedPerHour={data.fixedPerHour} failure={failure} purge={{ swaps: num(f.swaps), grams: num(f.swaps) * num(f.perSwap), filamentGrams: grams }} />}
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
        <ChannelTable rows={rows} minMarginPct={data.settings.minMarginPct} target={data.settings.targetProfitPerHour} stale={staleFees} notes={ruleNotes}>
          <PriceControls rounding={rounding} onRounding={chooseRounding} competitor={competitor} onCompetitor={setCompetitor} ours={roundPrice(r.consumer, rounding)} />
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
