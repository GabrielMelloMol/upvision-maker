import { useCallback } from "react";
import { getManifold } from "../geometry/manifold";
import { buildToolFit, CLEARANCES, DEFAULT_TOOL_FIT, type ToolFitMode, type ToolFitParams } from "../geometry/models/toolFit";
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
import { bedWarnings } from "./models/bedCheck";
import SheetPreview from "./toolfit/SheetPreview";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

const LIMITS = {
  clearance: [0, 2],
  depth: [3, 60],
  floor: [1, 10],
  wall: [1.2, 10],
  drawerW: [60, 1000],
  drawerD: [60, 1000],
} as const;

const MODES: [ToolFitMode, string][] = [
  ["block", "Bloco"],
  ["gridfinity", "Gridfinity"],
  ["drawer", "Gaveta"],
  ["test", "Teste"], // "Peça de teste" quebrava em 3 linhas no seletor; a dica embaixo explica
];
const MODE_HINT: Record<ToolFitMode, string> = {
  block: "Um bloco com o encaixe de cada ferramenta, do tamanho que precisar (até a mesa).",
  gridfinity: "Caixa na grade de 42 mm, com o pé padrão: encaixa nas bases Gridfinity.",
  drawer: "Bandejas que enchem a gaveta, cada uma do tamanho da mesa; as ferramentas são arrumadas sozinhas.",
  test: "Peça de teste: só o contorno, com 2 mm de altura: imprime em minutos e confere a folga antes do organizador.",
};

type State = { outlines: ToolOutline[]; sheet: Sheet; fromPhoto: boolean; p: ToolFitParams };

/** Organizador pela foto (#169): a foto (PhotoStep, da Forja) dá os contornos em mm; aqui eles viram encaixe exato. */
export default function ToolFit() {
  const tool = useToolState<State>("toolfit", () => ({ outlines: EXAMPLE_OUTLINES, sheet: A4, fromPhoto: false, p: DEFAULT_TOOL_FIT }), { label: "Organizador pela foto" });
  const { outlines, sheet, fromPhoto, p } = tool.state;
  const setState = tool.set;
  const onOutlines = useCallback((found: ToolOutline[], s: Sheet) => setState((cur) => ({ ...cur, outlines: found, sheet: s, fromPhoto: true }), "outlines"), [setState]);
  const set = <K extends keyof ToolFitParams>(key: K) => (v: ToolFitParams[K]) => tool.set((cur) => ({ ...cur, p: { ...cur.p, [key]: v } }), `p.${String(key)}`);
  const preset = CLEARANCES.find(([, , mm]) => mm === p.clearance)?.[0] ?? "custom";

  const valid = (Object.entries(LIMITS) as [keyof typeof LIMITS, readonly [number, number]][]).every(([k, [lo, hi]]) => inRange(p[k], lo, hi));
  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!valid || !outlines.length) return null;
    const out = buildToolFit(await getManifold(), outlines, p);
    const w = out.warnings ?? [];
    return { models: out.models, warnings: [...w, ...bedWarnings(out.models, w)] };
  }, [outlines, p, valid]);

  return (
    <div className="page">
      <h1>Organizador pela foto</h1>
      <p className="lead">Fotografe na folha A4 e imprima o encaixe exato.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <PhotoStep onOutlines={onOutlines} />
          {!fromPhoto && <Alert kind="info">Sem foto ainda: a prévia usa 3 ferramentas de exemplo.</Alert>}
          {fromPhoto && !outlines.length && <Alert kind="warn">Nenhuma ferramenta achada na foto: confira os 4 cantos da folha e se as ferramentas contrastam com o papel.</Alert>}
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
            <NumField label="Profundidade" value={p.depth} onChange={set("depth")} min={LIMITS.depth[0]} max={LIMITS.depth[1]} step={1} />
            <Toggle label="Recorte para o dedo" checked={p.finger} onChange={set("finger")} hint="Um semicírculo no meio de cada ferramenta para tirá-la do encaixe." />
          </div>
          <div className="card stack">
            <h3>Saída</h3>
            <Segmented label="Saída" value={p.mode} options={MODES} onChange={set("mode")} full />
            <p className="hint">{MODE_HINT[p.mode]}</p>
            {p.mode === "drawer" && (
              <div className="grid two">
                <NumField label="Largura da gaveta" value={p.drawerW} onChange={set("drawerW")} min={LIMITS.drawerW[0]} max={LIMITS.drawerW[1]} step={1} />
                <NumField label="Profundidade da gaveta" value={p.drawerD} onChange={set("drawerD")} min={LIMITS.drawerD[0]} max={LIMITS.drawerD[1]} step={1} />
              </div>
            )}
          </div>
          <details className="advanced">
            <summary>Opções avançadas</summary>
            <div className="grid two">
              <NumField label="Fundo" value={p.floor} onChange={set("floor")} min={LIMITS.floor[0]} max={LIMITS.floor[1]} step={0.2} />
              <NumField label="Parede" value={p.wall} onChange={set("wall")} min={LIMITS.wall[0]} max={LIMITS.wall[1]} step={0.2} />
            </div>
          </details>
          <ExportButtons models={models} name={`organizador-${p.mode}`} busy={busy} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          {/* o 3D (o resultado) primeiro, à vista; a folha numerada embaixo (o contorno já aparece em cima da foto) */}
          <Preview3D models={models} busy={busy} busyText="Gerando os encaixes…" error={error} emptyText={valid ? "Sem ferramentas para encaixar." : "Corrija os campos em vermelho para ver a peça."} />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
          <SheetPreview outlines={outlines} sheet={sheet} />
        </div>
      </div>
    </div>
  );
}
