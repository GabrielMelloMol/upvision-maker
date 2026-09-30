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
import { buildDrawer, planOf, type DrawerProject } from "./drawer/assemble";
import DrawerEditor from "./drawer/DrawerEditor";
import DrawerView from "./drawer/DrawerView";
import type { Dim } from "./drawer/drawerShape";
import RulerCard from "./drawer/RulerCard";
import { duplicate, removeModules, resizeGrid, updateModules } from "./drawer/layout";
import ModulePanel from "./drawer/ModulePanel";
import PrintPlanCard from "./drawer/PrintPlanCard";
import { drawerPrint, type DrawerPrint } from "./drawer/printPlan";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

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

function initialState(): DrawerProject {
  const p: DrawerProject = { width: 500, depth: 420, height: 80, align: "center", baseMagnets: false, baseColor: "#1c1c1e", bedMargin: 4, layout: { cols: 0, rows: 0, modules: [] } };
  const plan = planOf(p);
  return { ...p, layout: { cols: plan.nx, rows: plan.ny, modules: [] } };
}

/** Organizador de gaveta (#140): medir a gaveta, desenhar as caixinhas na grade e sair com a base e os módulos. */
export default function DrawerOrganizer() {
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
  const setDim = (k: "width" | "depth" | "height") => (v: number) =>
    tool.set((s) => {
      const next = { ...s, [k]: v };
      const pl = planOf(next);
      return { ...next, layout: resizeGrid(s.layout, pl.nx, pl.ny) };
    }, k);
  const setAlign = (align: DrawerProject["align"]) => tool.set((s) => ({ ...s, align }), "align");
  const set = <K extends "baseMagnets" | "baseColor" | "bedMargin">(k: K) => tool.field(k);
  const valid = inRange(p.width, 50, 1500) && inRange(p.depth, 50, 1500) && inRange(p.height, 15, 400) && inRange(p.bedMargin, 0, 20);
  const chosen = p.layout.modules.filter((m) => selected.includes(m.id));

  const [exportModels, setExportModels] = useState<Model[]>([]);
  const [print, setPrint] = useState<DrawerPrint | null>(null);
  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!valid || !plan.nx || !plan.ny) return null;
    const M = await getManifold();
    const labels = p.layout.modules.some((m) => m.labelTab && m.label.trim());
    const font = labels ? await loadFont(FONT) : null;
    const out = buildDrawer({ M, art: null, text: (s, h) => (font && s.trim() ? textToCrossSection(M, font, s, h) : null) }, p);
    const pp = drawerPrint(out.basePieces, out.groups);
    // um 3MF com tudo (mesas lado a lado); cada mesa sozinha sai pela lista de impressão
    setExportModels(pp.plates.flatMap((plate, i) => plate.models.map((m) => moveModel(m, i * (256 + 20), 0))));
    setPrint(pp);
    return { models: out.preview, warnings: out.warnings };
  }, [p, valid]);

  return (
    <div className="page">
      <h1>Organizador de gaveta</h1>
      <p className="lead">Meça a gaveta, desenhe as caixinhas e imprima a base e os módulos.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Gaveta</h3>
            <div className="grid two">
              <div {...measuring("width")}>
                <NumField label="Largura" value={p.width} onChange={setDim("width")} min={50} max={1500} step={1} />
              </div>
              <div {...measuring("depth")}>
                <NumField label="Profundidade" value={p.depth} onChange={setDim("depth")} min={50} max={1500} step={1} />
              </div>
              <div {...measuring("height")}>
                <NumField label="Altura livre" value={p.height} onChange={setDim("height")} min={15} max={400} step={1} hint="Com a gaveta fechada, do fundo até o tampo ou a gaveta de cima." />
              </div>
            </div>
            <Segmented label="Sobra" value={p.align} options={ALIGNS} onChange={setAlign} full />
            {plan.nx > 0 && plan.ny > 0 && <span className="hint" aria-live="polite">{planSummary(plan, true, p.baseMagnets ? 3.2 : 0)}</span>}
          </div>
          {chosen.length ? (
            <ModulePanel
              modules={chosen}
              uMax={plan.uMax}
              onChange={(patch) => setLayout(updateModules(p.layout, selected, patch))}
              onDuplicate={() => setLayout(duplicate(p.layout, selected))}
              onRemove={() => {
                setLayout(removeModules(p.layout, selected));
                setSelected([]);
              }}
            />
          ) : (
            <div className="card stack">
              <h3>Caixinhas</h3>
              <span className="hint">Arraste na grade para criar uma caixinha. Toque numa para ajustar; Shift ou ⌘ junta várias.</span>
            </div>
          )}
          <RulerCard />
          <details className="advanced">
            <summary>Opções avançadas</summary>
            <div className="stack">
              <Toggle label="Base com fundo e furos de ímã" checked={p.baseMagnets} onChange={set("baseMagnets")} />
              <NumField label="Margem da mesa" value={p.bedMargin} onChange={set("bedMargin")} min={0} max={20} step={1} hint="4 mm: 6 casas por pedaço na A1. Aumente se usar brim." />
              <ColorPick label="Cor da base" value={p.baseColor} onChange={set("baseColor")} />
            </div>
          </details>
          <ExportButtons models={models.length ? exportModels : []} name="gaveta" busy={busy} onSaved={tool.exported} />
          {print && models.length > 0 && !busy && <PrintPlanCard plan={print} name="gaveta" onSaved={() => tool.exported("gaveta")} />}
        </div>
        <div className="preview-col">
          <Segmented label="Prévia" value={view} options={VIEWS} onChange={setView} />
          {view === "drawer" ? (
            <DrawerView width={p.width} depth={p.depth} height={p.height} focus={focus} organizer={valid ? models : []} />
          ) : view === "grid" ? (
            <div className="card">
              {plan.nx > 0 && plan.ny > 0 ? (
                <DrawerEditor layout={p.layout} plan={plan} selected={selected} onChange={setLayout} onSelect={setSelected} />
              ) : (
                <span className="muted">A gaveta precisa ter pelo menos 43 × 43 mm.</span>
              )}
            </div>
          ) : (
            <Preview3D models={models} busy={busy} busyText="Montando a gaveta…" error={error} emptyText={!valid ? "Corrija os campos em vermelho." : "Meça a gaveta para ver a base."} />
          )}
          {warnings.map((w) => (
            <Alert key={w} kind="warn">
              {w}
            </Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
