import { useMemo, useState } from "react";
import { loadFont } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import { planSummary } from "../geometry/models/gridDrawer";
import { textToCrossSection } from "../geometry/text";
import type { Model } from "../geometry/types";
import { moveModel } from "../geometry/models/common";
import Alert from "../ui/Alert";
import ExportButtons from "../ui/ExportButtons";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import Toggle from "../ui/Toggle";
import { useModelBuilder } from "../ui/useModelBuilder";
import ColorPick from "./ColorPick";
import { buildDrawer, cutleryBlocked, planOf, TRAY_COLOR, type DrawerProject } from "./drawer/assemble";
import DrawerEditor from "./drawer/DrawerEditor";
import DrawerView from "./drawer/DrawerView";
import type { Dim } from "./drawer/drawerShape";
import RulerCard from "./drawer/RulerCard";
import { duplicate, pasteModules, removeModules, resizeGrid, resizeModule, setFree, updateModules, type DrawerModule } from "./drawer/layout";
import ModulePanel from "./drawer/ModulePanel";
import PrintPlanCard from "./drawer/PrintPlanCard";
import { drawerPrint, type DrawerPrint } from "./drawer/printPlan";
import { applyPreset, DRAWER_PRESETS, type DrawerPreset } from "./drawer/presets";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";
import { modKey } from "../ui/shortcuts";
import GeneratorHelp from "./models/guide/GeneratorHelp";
import { TOOL_HELP } from "./models/help/toolHelp";

const ALIGNS = [
  ["center", "Centralizar"],
  ["corner", "Encostar no canto"],
] as const;
const VIEWS = [
  ["drawer", "Gaveta"],
  ["grid", "Grade"],
  ["3d", "Peças"],
] as const;
type View = (typeof VIEWS)[number][0];
const FONT = "hanken";
const NO_MODELS: Model[] = [];

function initialState(): DrawerProject {
  const p: DrawerProject = { width: 500, depth: 420, height: 80, align: "center", baseMagnets: false, baseColor: "#1c1c1e", bedMargin: 4, layout: { cols: 0, rows: 0, modules: [] } };
  const plan = planOf(p);
  return { ...p, layout: { cols: plan.nx, rows: plan.ny, modules: [] } };
}

/** Organizador de gaveta (#140): medir a gaveta, desenhar as caixinhas na grade e sair com a base e os módulos. */
export default function DrawerOrganizer({ embedded = false }: { embedded?: boolean } = {}) {
  const tool = useToolState("drawer", initialState, { label: "Organizador de gaveta" });
  const p = tool.state;
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<View>("drawer");
  const [focus, setFocus] = useState<Dim | null>(null);
  // campo de medida em foco: mostra a gaveta e acende a cota dele
  const measuring = (k: Dim) => ({
    onFocusCapture: () => {
      setFocus(k);
      setView("drawer");
    },
    onBlurCapture: () => setFocus(null),
  });
  const plan = useMemo(() => planOf(p), [p]);
  const setLayout = tool.field("layout");
  // o que muda a grade (medidas, 2 andares, obstáculo) refaz a grade junto, no mesmo passo de desfazer
  const setGrid = <K extends "width" | "depth" | "height" | "cutlery" | "sideObstacle">(k: K) => (v: DrawerProject[K]) => {
    const after = planOf({ ...p, [k]: v });
    const lost = p.layout.modules.length - resizeGrid(p.layout, after.nx, after.ny).modules.length;
    setNotice(lost > 0 ? `${lost} caixinha(s) saíram do mapa porque não cabem mais na gaveta nova. Desfaça (⌘Z) para trazê-las de volta.` : "");
    tool.set((s) => {
      const next = { ...s, [k]: v };
      const pl = planOf(next);
      return { ...next, layout: resizeGrid(s.layout, pl.nx, pl.ny) };
    }, k);
  };
  const [skipExamples, setSkipExamples] = useState(false);
  const pickExample = (preset: DrawerPreset) => {
    setLayout(applyPreset(p.layout, preset, plan.uMax));
    setSelected([]);
    setView("grid");
    setNotice(`Exemplo "${preset.label}" colocado: arraste, mude de tamanho ou apague as caixinhas até ficar do seu jeito (${modKey()}Z desfaz).`);
  };
  const [clipboard, setClipboard] = useState<DrawerModule[]>([]);
  const [notice, setNotice] = useState("");
  const copy = (ids: string[]) => {
    const copies = p.layout.modules.filter((m) => ids.includes(m.id));
    setClipboard(copies);
    setNotice(copies.length ? `${copies.length} caixinha(s) copiada(s): use Colar (⌘V).` : "");
  };
  const paste = () => {
    const r = pasteModules(p.layout, clipboard);
    if (r.placed) setLayout(r.layout);
    setNotice(r.skipped ? `Só ${r.placed} de ${clipboard.length} couberam: faltou lugar no mapa.` : `${r.placed} caixinha(s) colada(s).`);
  };
  const [trays, setTrays] = useState<Model[]>([]);
  const [slide, setSlide] = useState(false);
  const setAlign = (align: DrawerProject["align"]) => tool.set((s) => ({ ...s, align }), "align");
  const set = <K extends "baseMagnets" | "baseColor" | "bedMargin" | "trayColor">(k: K) => tool.field(k);
  const valid = inRange(p.width, 50, 1500) && inRange(p.depth, 50, 1500) && inRange(p.height, 15, 400) && inRange(p.bedMargin, 0, 20) && inRange(p.sideObstacle ?? 0, 0, 40);
  const chosen = p.layout.modules.filter((m) => selected.includes(m.id));

  const [exportModels, setExportModels] = useState<Model[]>([]);
  const [print, setPrint] = useState<DrawerPrint | null>(null);
  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!valid || !plan.nx || !plan.ny) return null;
    const M = await getManifold();
    const labels = p.layout.modules.some((m) => m.labelTab && m.label.trim());
    const font = labels ? await loadFont(FONT) : null;
    const out = buildDrawer({ M, art: null, text: (s, h) => (font && s.trim() ? textToCrossSection(M, font, s, h) : null) }, p);
    const pp = drawerPrint([...out.basePieces, ...out.extras], out.groups);
    setTrays(out.trays);
    setSlide(out.cutlery?.slide === "depth");
    // um 3MF com tudo (mesas lado a lado); cada mesa sozinha sai pela lista de impressão
    setExportModels(pp.plates.flatMap((plate, i) => plate.models.map((m) => moveModel(m, i * (256 + 20), 0))));
    setPrint(pp);
    return { models: [...out.preview, ...out.trays], warnings: out.warnings };
  }, [p, valid]);

  // a cena só remonta quando as peças mudam (não a cada tecla nas medidas)
  const organizer = useMemo(() => models.filter((m) => !trays.includes(m)), [models, trays]);

  return (
    <div className={embedded ? "stack" : "page"}>
      {!embedded && <h1>Organizador de gaveta</h1>}
      {!embedded && <p className="lead">Meça a gaveta, desenhe as caixinhas e imprima.</p>}
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Gaveta</h3>
            <div className="grid two">
              <div {...measuring("width")}>
                <NumField label="Largura" value={p.width} onChange={setGrid("width")} min={50} max={1500} step={1} cm hint="Largura da gaveta por dentro, da esquerda para a direita. Meça com régua: o app calcula as casas." />
              </div>
              <div {...measuring("depth")}>
                <NumField label="Profundidade" value={p.depth} onChange={setGrid("depth")} min={50} max={1500} step={1} cm hint="Profundidade da gaveta por dentro, da frente ao fundo." />
              </div>
              <div {...measuring("height")}>
                <NumField label="Altura livre" value={p.height} onChange={setGrid("height")} min={15} max={400} step={1} cm hint="Com a gaveta fechada, do fundo até o tampo ou a gaveta de cima." />
              </div>
            </div>
            <Segmented label="Sobra" value={p.align} options={ALIGNS} onChange={setAlign} full />
            <Toggle label="Dois andares: talheres em cima" checked={!!p.cutlery} onChange={setGrid("cutlery")} />
            {cutleryBlocked(p) && <Alert kind="warn">{cutleryBlocked(p)}</Alert>}
            {p.cutlery && !cutleryBlocked(p) && <span className="hint">Bandeja dos talheres nos trilhos; embaixo, a base e as caixinhas. Imprima em PETG: aguenta água quente e detergente.</span>}
            {plan.nx > 0 && plan.ny > 0 && <span className="hint" aria-live="polite">{planSummary(plan, true, p.baseMagnets ? 3.2 : 0)}</span>}
          </div>
          {notice && <Alert kind="info">{notice}</Alert>}
          {chosen.length ? (
            <ModulePanel
              modules={chosen}
              uMax={plan.uMax}
              onChange={(patch) => setLayout(updateModules(p.layout, selected, patch))}
              onResize={(w, h) => setLayout(resizeModule(p.layout, chosen[0].id, w, h))}
              onFree={(size) => setLayout(setFree(p.layout, chosen[0].id, size))}
              onCopy={() => copy(selected)}
              onPaste={paste}
              canPaste={clipboard.length > 0}
              onDuplicate={() => setLayout(duplicate(p.layout, selected))}
              onRemove={() => {
                setLayout(removeModules(p.layout, selected));
                setSelected([]);
              }}
            />
          ) : (
            <div className="card stack">
              <h3>Caixinhas</h3>
              {p.layout.modules.length === 0 && !skipExamples && plan.nx > 0 && plan.ny > 0 ? (
                <>
                  <span className="hint">Comece por um exemplo: ele enche a sua gaveta e você ajusta depois.</span>
                  <div className="chips" role="group" aria-label="Exemplos de gaveta">
                    {DRAWER_PRESETS.map((x) => (
                      <button key={x.id} type="button" title={x.blurb} onClick={() => pickExample(x)}>
                        {x.label}
                      </button>
                    ))}
                    <button type="button" onClick={() => { setSkipExamples(true); setView("grid"); }}>
                      Começar vazio
                    </button>
                  </div>
                </>
              ) : (
                <span className="hint">Arraste na grade para criar uma caixinha. Toque numa para ajustar; Shift ou {modKey()} junta várias.</span>
              )}
            </div>
          )}
          <RulerCard />
          <details className="advanced">
            <summary>Opções avançadas</summary>
            <div className="stack">
              <Toggle label="Base com fundo e furos de ímã" checked={p.baseMagnets} onChange={set("baseMagnets")} />
              <NumField label="Margem da mesa" value={p.bedMargin} onChange={set("bedMargin")} min={0} max={20} step={1} hint="4 mm: 6 casas por pedaço na A1. Aumente se usar brim." />
              <NumField label="Obstáculo em cada lateral" value={p.sideObstacle ?? 0} onChange={setGrid("sideObstacle")} min={0} max={40} step={1} hint="Trilho metálico ou parafuso saindo da lateral da gaveta." />
              {p.cutlery && <ColorPick label="Cor da bandeja" value={p.trayColor ?? TRAY_COLOR} onChange={set("trayColor")} />}
              <ColorPick label="Cor da base" value={p.baseColor} onChange={set("baseColor")} />
            </div>
          </details>
          <ExportButtons models={models.length ? exportModels : []} name="gaveta" busy={busy} onSaved={tool.exported} tips={TOOL_HELP.organizers.tips} />
          <GeneratorHelp help={TOOL_HELP.organizers} />
          {print && models.length > 0 && !busy && <PrintPlanCard plan={print} name="gaveta" onSaved={() => tool.exported("gaveta")} />}
        </div>
        <div className="preview-col">
          <Segmented label="Prévia" value={view} options={VIEWS} onChange={setView} />
          {view === "drawer" ? (
            <DrawerView width={p.width} depth={p.depth} height={p.height} focus={focus} organizer={valid ? organizer : NO_MODELS} trays={valid ? trays : NO_MODELS} slide={slide} />
          ) : view === "grid" ? (
            <div className="card">
              {plan.nx > 0 && plan.ny > 0 ? (
                <DrawerEditor layout={p.layout} plan={plan} selected={selected} onChange={setLayout} onSelect={setSelected} onCopy={copy} onPaste={paste} onNotice={setNotice} />
              ) : (
                <span className="muted">A gaveta precisa ter pelo menos 43 × 43 mm.</span>
              )}
            </div>
          ) : (
            <Preview3D models={models.length ? exportModels : models} busy={busy} busyText="Montando a gaveta…" error={error} emptyText={!valid ? "Corrija os campos em vermelho." : "Meça a gaveta para ver a base."} />
          )}
          {warnings.filter((w) => w !== cutleryBlocked(p)).map((w) => (
            <Alert key={w} kind="warn">
              {w}
            </Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
