import { Plus } from "lucide-react";
import SeeAlso from "../ui/SeeAlso";
import { useCallback, useMemo, useState } from "react";
import { getManifold } from "../geometry/manifold";
import { binCells, buildToolFit, CLEARANCES, fullTray, DEFAULT_TOOL_FIT, DEPTH_RANGE, suggestedDepth, type ToolFitMode, type ToolFitParams } from "../geometry/models/toolFit";
import { buildModularDrawer, modularPlan, moveBin, placeBins, type BinPlace } from "../geometry/models/toolFitDrawer";
import { A4, EXAMPLE_OUTLINES } from "../organizer/examples";
import PhotoStep from "../organizer/PhotoStep";
import type { Sheet, ToolOutline } from "../organizer/types";
import Alert from "../ui/Alert";
import ExportButtons from "../ui/ExportButtons";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import Toggle from "../ui/Toggle";
import { useModelBuilder } from "../ui/useModelBuilder";
import { estimateModels } from "../domain/estimate";
import { formatDuration } from "../ui/parse";
import { bedMm } from "../geometry/bed";
import { BED_MARGIN } from "../geometry/models/gridDrawer";
import PrintPlanCard from "./drawer/PrintPlanCard";
import { drawerPrint, type DrawerPrint } from "./drawer/printPlan";
import { bedWarnings } from "./models/bedCheck";
import DrawerMap from "./toolfit/DrawerMap";
import SheetPreview from "./toolfit/SheetPreview";
import ToolList, { type ProjectTool } from "./toolfit/ToolList";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

const br = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const LIMITS = {
  clearance: [0, 2],
  depth: DEPTH_RANGE,
  floor: [1, 10],
  wall: [1.2, 10],
  drawerW: [60, 1000],
  drawerD: [60, 1000],
  drawerH: [20, 400],
} as const;

const MODES: [ToolFitMode, string][] = [
  ["block", "Bloco"],
  ["gridfinity", "Gridfinity"],
  ["drawer", "Gaveta"],
  ["test", "Teste"], // "Peça de teste" quebrava em 3 linhas no seletor; a dica embaixo explica
];
const BIN_HEIGHTS: [ToolFitParams["binHeight"], string][] = [
  ["tallest", "Mais alta"],
  ["drawer", "Gaveta"],
  ["each", "Individual"],
];
const BIN_HEIGHT_HINT: Record<ToolFitParams["binHeight"], string> = {
  tallest: "Todas com a altura da que precisa mais: ficam niveladas e trocam de lugar entre si.",
  drawer: "Todas com a maior altura que cabe na gaveta (Altura útil): niveladas e no máximo.",
  each: "Cada caixinha só com a altura do encaixe dela: gasta menos, mas ficam desniveladas.",
};
const g = (n: number) => `${Math.round(n).toLocaleString("pt-BR")} g`;
const DRAWER_KINDS: [ToolFitParams["drawerKind"], string][] = [
  ["trays", "Bandejas"],
  ["bins", "Caixinhas"],
];
const MODE_HINT: Record<ToolFitMode | "bins", string> = {
  block: "Um bloco com o encaixe de cada ferramenta, do tamanho que precisar (até a mesa).",
  gridfinity: "Caixa na grade de 42 mm, com o pé padrão: encaixa nas bases Gridfinity.",
  drawer: "Bandejas que enchem a gaveta, cada uma do tamanho da mesa; as ferramentas são arrumadas sozinhas.",
  bins: "Uma caixinha Gridfinity por ferramenta sobre a base pela gaveta: dá para trocar as caixinhas de lugar.",
  test: "Peça de teste: só o contorno, com 2 mm de altura: imprime em minutos e confere a folga antes do organizador.",
};

/** Uma foto do projeto: as ferramentas que ela achou, numeradas a partir de `first` (o número não muda depois). */
type PhotoSlot = { id: string; first: number; outlines: ToolOutline[]; sheet: Sheet };
type State = { photos: PhotoSlot[]; names: Record<string, string>; removed: string[]; places: Record<string, BinPlace>; p: ToolFitParams };
/** Rascunho de antes da gaveta modular (uma foto só). */
type OldState = Partial<State> & { outlines?: ToolOutline[]; sheet?: Sheet; fromPhoto?: boolean };

const initial = (): State => ({ photos: [], names: {}, removed: [], places: {}, p: DEFAULT_TOOL_FIT });
function migrate(s: OldState): State {
  const p = { ...DEFAULT_TOOL_FIT, ...s.p };
  if (s.photos) return { ...initial(), ...s, photos: s.photos, p };
  const photos = s.fromPhoto && s.outlines ? [{ id: "f1", first: 1, outlines: s.outlines, sheet: s.sheet ?? A4 }] : [];
  return { ...initial(), p, photos };
}
const nextNumber = (photos: PhotoSlot[]) => Math.max(1, ...photos.map((ph) => ph.first + ph.outlines.length));

/** Organizador pela foto (#169): as fotos (PhotoStep, da Forja) dão os contornos em mm; aqui eles viram encaixe exato. */
export default function ToolFit() {
  const tool = useToolState<State>("toolfit", initial, { label: "Organizador pela foto" });
  // migrar uma vez por estado: um `p` novo a cada render refazia a peça sem parar
  const { photos, names, removed, places, p } = useMemo(() => migrate(tool.state), [tool.state]);
  const setState = tool.set;
  const update = useCallback((fn: (s: State) => State, key?: string) => setState((cur) => fn(migrate(cur)), key), [setState]);
  // foto aberta no PhotoStep; uma id que ainda não está em `photos` é a foto nova de "Adicionar outra foto"
  const [active, setActive] = useState<string | null>(null);
  const activeId = active ?? photos[photos.length - 1]?.id ?? "f1";
  const activeSlot = photos.find((ph) => ph.id === activeId) ?? null;

  // o PhotoStep guarda a versão mais nova deste callback e só chama quando a medida muda: não precisa de memo
  const onOutlines = (found: ToolOutline[], sheet: Sheet) =>
    update((s) => {
      const exists = s.photos.some((ph) => ph.id === activeId);
      const next = exists ? s.photos.map((ph) => (ph.id === activeId ? { ...ph, outlines: found, sheet } : ph)) : [...s.photos, { id: activeId, first: nextNumber(s.photos), outlines: found, sheet }];
      return { ...s, photos: next };
    }, `photo.${activeId}`);
  const addPhoto = () => setActive(`f${Date.now().toString(36)}`);
  const rename = (id: string, name: string) => update((s) => ({ ...s, names: { ...s.names, [id]: name } }), `name.${id}`);
  const remove = (id: string) => update((s) => ({ ...s, removed: [...s.removed, id] }));
  const set = <K extends keyof ToolFitParams>(key: K) => (v: ToolFitParams[K]) => update((s) => ({ ...s, p: { ...s.p, [key]: v } }), `p.${String(key)}`);

  const fromPhoto = photos.some((ph) => ph.outlines.length);
  const tools: ProjectTool[] = useMemo(() => {
    if (!fromPhoto) return EXAMPLE_OUTLINES.map((o, i) => ({ ...o, num: i + 1, label: o.label ?? o.id }));
    return photos
      .flatMap((ph) => ph.outlines.map((o, i) => ({ ...o, id: `${ph.id}/${o.id}`, num: ph.first + i })))
      .filter((t) => !removed.includes(t.id))
      .map((t) => ({ ...t, name: names[t.id], label: names[t.id]?.trim() || `Ferramenta ${t.num}` }));
  }, [fromPhoto, photos, removed, names]);
  const sheetTools = fromPhoto && activeSlot ? tools.filter((t) => t.id.startsWith(`${activeSlot.id}/`)) : tools;

  const suggested = suggestedDepth(tools);
  const tallest = Math.max(0, ...tools.map((o) => o.heightMm ?? 0));
  const preset = CLEARANCES.find(([, , mm]) => mm === p.clearance)?.[0] ?? "custom";
  const modular = p.mode === "drawer" && p.drawerKind === "bins";

  // mapa da gaveta modular: arrumação sem geometria, na hora (o 3D vem depois, com as mesmas posições)
  const plan = useMemo(() => modularPlan(p), [p]);
  const sizes = useMemo(() => (modular ? tools.map((t) => ({ id: t.id, ...binCells(t, p) })) : []), [modular, tools, p]);
  const layout = useMemo(() => (plan.nx && plan.ny ? placeBins(plan.nx, plan.ny, sizes, places) : { places: {}, missing: sizes.map((s) => s.id) }), [plan, sizes, places]);
  const moveOne = (id: string, dx: number, dy: number) => update((s) => ({ ...s, places: moveBin(plan.nx, plan.ny, sizes, layout.places, id, dx, dy) }), `place.${id}`);
  const rearrange = () => update((s) => ({ ...s, places: {} }));

  const valid = (Object.entries(LIMITS) as [keyof typeof LIMITS, readonly [number, number]][]).every(([k, [lo, hi]]) => inRange(p[k], lo, hi));
  const [print, setPrint] = useState<DrawerPrint | null>(null);
  const [compare, setCompare] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]); // informação da peça (azul); `warnings` fica para o que pede ação
  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!valid || !tools.length) return null;
    const M = await getManifold();
    if (modular) {
      const out = buildModularDrawer(M, tools, p, layout.places);
      setPrint(drawerPrint(out.basePieces, out.groups));
      setNotes(out.notes);
      return { models: out.preview, warnings: out.warnings };
    }
    setPrint(null);
    const out = buildToolFit(M, tools, p);
    setNotes(out.notes);
    const w = out.warnings ?? [];
    // bandejas: gramas e tempo comparados com uma bandeja do tamanho da mesa (o que saía antes, #169)
    const mine = p.mode === "drawer" ? estimateModels(out.models) : null;
    const full = mine ? estimateModels([fullTray(M, p)]) : null;
    const side = Math.round(bedMm() - 2 * BED_MARGIN);
    setCompare(mine && full ? `Bandejas do tamanho das ferramentas: ≈ ${g(mine.grams)} e ${formatDuration(mine.seconds / 60)}. Uma bandeja do tamanho da mesa (${side} × ${side} mm) gastaria ≈ ${g(full.grams)} e ${formatDuration(full.seconds / 60)}.` : null);
    return { models: out.models, warnings: [...w, ...bedWarnings(out.models, w)] };
  }, [tools, p, valid, modular, layout]);
  const mapNames = useMemo(() => Object.fromEntries(tools.map((t) => [t.id, { num: t.num, label: t.label }])), [tools]);

  return (
    <div className="page">
      <h1>Organizador pela foto</h1>
      <p className="lead">Fotografe na folha A4 e imprima o encaixe exato.</p>
      <SeeAlso items={[{ label: "Organizador de gaveta (caixinhas sob medida)", page: "drawer" }, { label: "Gridfinity: caixinha", model: "gridBin" }]} />
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          {/* a foto numera as ferramentas a partir do número dela na lista do projeto (o mesmo no mapa e na folha) */}
          <PhotoStep key={activeId} firstNumber={activeSlot?.first ?? nextNumber(photos)} onOutlines={onOutlines} />
          {!fromPhoto && <Alert kind="info">Sem foto ainda: a prévia usa 3 ferramentas de exemplo.</Alert>}
          {activeSlot && !activeSlot.outlines.length && <Alert kind="warn">Nenhuma ferramenta achada na foto: confira os 4 cantos da folha e se as ferramentas contrastam com o papel.</Alert>}
          <div className="card stack">
            <h3>Ferramentas</h3>
            <ToolList tools={tools} onRename={fromPhoto ? rename : undefined} onRemove={fromPhoto ? remove : undefined} />
            {fromPhoto && (
              <button type="button" className="ghost" onClick={addPhoto} disabled={!activeSlot}>
                <Plus aria-hidden size={16} /> Adicionar outra foto
              </button>
            )}
            {photos.length > 1 && <p className="hint">{photos.length} fotos somadas. Cada ferramenta guarda a altura da foto dela.</p>}
          </div>
          <div className="card stack">
            <h3>Encaixe</h3>
            <Segmented
              label="Folga"
              value={preset}
              options={CLEARANCES.map(([id, text]) => [id, text] as const)}
              onChange={(id) => set("clearance")(CLEARANCES.find(([x]) => x === id)![2])}
              full
            />
            <NumField label="Folga" value={p.clearance} onChange={set("clearance")} min={LIMITS.clearance[0]} max={LIMITS.clearance[1]} step={0.05} hint="Por lado. Pequena (0,3 mm) fica justa na A1; imprima a peça de teste para conferir." />
            <NumField
              label="Profundidade"
              value={p.depth}
              onChange={set("depth")}
              min={LIMITS.depth[0]}
              max={LIMITS.depth[1]}
              step={1}
              hint={`A peça fica com ${br(p.floor + p.depth)} mm de altura (fundo + profundidade)${p.mode === "gridfinity" || modular ? ", arredondada para cima em unidades de 7 mm" : ""}.`}
            />
            {tallest > p.depth && suggested !== null && (
              <Alert kind="info">
                A ferramenta mais alta tem {br(tallest)} mm e o encaixe {br(p.depth)} mm: {br(tallest - p.depth)} mm ficam para fora da peça.
                {suggested !== p.depth && <> Sugestão: {br(suggested)} mm (60% da altura): segura firme e o resto fica para fora, para pegar. </>}
                {suggested !== p.depth && (
                  <button type="button" className="sm" onClick={() => set("depth")(suggested)}>
                    Usar {br(suggested)} mm
                  </button>
                )}
              </Alert>
            )}
            <Toggle label="Recorte para o dedo" checked={p.finger} onChange={set("finger")} hint="Um semicírculo no meio de cada ferramenta para tirá-la do encaixe." />
          </div>
          <div className="card stack">
            <h3>Saída</h3>
            <Segmented label="Saída" value={p.mode} options={MODES} onChange={set("mode")} full />
            {p.mode === "drawer" && <Segmented label="Tipo de gaveta" value={p.drawerKind} options={DRAWER_KINDS} onChange={set("drawerKind")} full />}
            <p className="hint">{MODE_HINT[modular ? "bins" : p.mode]}</p>
            {p.mode === "drawer" && (
              <div role="group" aria-label="Gaveta">
                <span className="field-label">Gaveta</span>
                {/* rótulos curtos: "Profundidade da gaveta" quebrava em 2 linhas e desalinhava os campos */}
                <div className="grid two">
                  <NumField label="Largura" value={p.drawerW} onChange={set("drawerW")} min={LIMITS.drawerW[0]} max={LIMITS.drawerW[1]} step={1} cm />
                  <NumField label="Profundidade" value={p.drawerD} onChange={set("drawerD")} min={LIMITS.drawerD[0]} max={LIMITS.drawerD[1]} step={1} cm />
                  {modular && <NumField label="Altura útil" value={p.drawerH} onChange={set("drawerH")} min={LIMITS.drawerH[0]} max={LIMITS.drawerH[1]} step={1} cm />}
                </div>
              </div>
            )}
            {modular && (
              <>
                <div>
                  <span className="field-label">Altura das caixinhas</span>
                  <Segmented label="Altura das caixinhas" value={p.binHeight} options={BIN_HEIGHTS} onChange={set("binHeight")} full />
                </div>
                <p className="hint">{BIN_HEIGHT_HINT[p.binHeight]}</p>
                <Toggle label="Borda de empilhar" checked={p.lip} onChange={set("lip")} hint="A borda padrão Gridfinity em cima de cada caixinha: é ela que deixa empilhar outra caixinha por cima. Soma 4,4 mm na altura." />
              </>
            )}
          </div>
          <details className="advanced">
            <summary>Opções avançadas</summary>
            <div className="grid two">
              <NumField label="Fundo" value={p.floor} onChange={set("floor")} min={LIMITS.floor[0]} max={LIMITS.floor[1]} step={0.2} />
              <NumField label="Parede" value={p.wall} onChange={set("wall")} min={LIMITS.wall[0]} max={LIMITS.wall[1]} step={0.2} />
            </div>
          </details>
          {modular ? (
            print && models.length > 0 && !busy && <PrintPlanCard plan={print} name="organizador-gaveta" onSaved={() => tool.exported("organizador-gaveta")} />
          ) : (
            <ExportButtons models={models} name={`organizador-${p.mode}`} busy={busy} onSaved={tool.exported} />
          )}
        </div>
        <div className="preview-col">
          {/* o 3D (o resultado) primeiro, à vista; mapa e folha numerada embaixo */}
          <Preview3D models={models} busy={busy} busyText="Gerando os encaixes…" error={error} emptyText={valid ? "Sem ferramentas para encaixar." : "Corrija os campos em vermelho para ver a peça."} />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
          {notes.map((n) => (
            <Alert key={n} kind="info">{n}</Alert>
          ))}
          {!modular && compare && <Alert kind="info">{compare}</Alert>}
          {modular && plan.nx > 0 && plan.ny > 0 && (
            <>
              <DrawerMap plan={plan} sizes={sizes} places={layout.places} names={mapNames} onMove={moveOne} />
              {Object.keys(places).length > 0 && (
                <button type="button" className="ghost" onClick={rearrange}>
                  Arrumar de novo sozinho
                </button>
              )}
            </>
          )}
          <SheetPreview outlines={sheetTools} sheet={fromPhoto && activeSlot ? activeSlot.sheet : A4} />
        </div>
      </div>
    </div>
  );
}
