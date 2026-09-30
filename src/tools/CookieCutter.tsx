import { bedWarnings } from "./models/bedCheck";
import { buildCutter, DEFAULT_CUTTER, type CutterParams, type ReliefMode } from "../geometry/cutter";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import { CUTTER_PROFILE } from "../geometry/printProfile";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import { useModelBuilder } from "../ui/useModelBuilder";
import { DESIGN_ACCEPT, designFromSvg } from "./designInput";
import { exampleFile, useExample } from "../help/helpStore";
import ToolSessionBar from "./ToolSessionBar";
import { initialDesign, useDesignInput } from "./useDesignInput";
import { useToolState } from "./useToolState";

const LIMITS = {
  width: [20, 250],
  blade: [0.4, 3],
  height: [5, 40],
  rimWidth: [0, 15],
  rimHeight: [0.6, 6],
  plate: [1, 6],
  relief: [0.4, 6],
  clearance: [0.2, 2],
  edgeMargin: [0, 6],
} as const;


export default function CookieCutter() {
  // estado de trabalho: desfazer, rascunho guardado e últimos projetos (#85)
  const tool = useToolState("cutter", () => ({ ...initialDesign(70), mirror: true, p: DEFAULT_CUTTER as CutterParams }), { label: "Cortador" });
  const { mirror, p } = tool.state;
  const setMirror = tool.field("mirror");
  const { svg, width, setWidth, loading, error: inputError, onFile } = useDesignInput(tool.state, (patch, key) => tool.set((cur) => ({ ...cur, ...patch }), key));
  useExample("cutter", () => void exampleFile("heart").then(onFile)); // "Usar exemplo" da ajuda (#84)
  const set = <K extends keyof CutterParams>(key: K) => (v: CutterParams[K]) => tool.set((cur) => ({ ...cur, p: { ...cur.p, [key]: v } }), `p.${String(key)}`);

  const valid = (Object.entries(LIMITS) as [keyof typeof LIMITS, readonly [number, number]][]).every(([k, [lo, hi]]) =>
    inRange(k === "width" ? width : (p[k] as number), lo, hi),
  );

  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!svg || !valid) return null;
    const { M, cs } = await designFromSvg(svg.text, width, mirror);
    try {
      const out = buildCutter(M, cs, p);
      return { ...out, warnings: [...out.warnings, ...bedWarnings(out.models, out.warnings)] }; // #122
    } finally {
      cs.delete();
    }
  }, [svg, width, mirror, p, valid]);

  return (
    <div className="page">
      <h1>Cortador de biscoito</h1>
      <p className="lead">O contorno vira lâmina; o desenho de dentro, carimbo.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <Dropzone accept={DESIGN_ACCEPT} label={svg ? svg.name : "Arraste um SVG ou imagem"} hint="SVG, PNG, JPG… (imagens são vetorizadas automaticamente)" onFile={onFile} />
            {loading && <Alert kind="info">Lendo o desenho…</Alert>}
            {inputError && <Alert kind="error">{inputError}</Alert>}
          </div>
          <div className="card stack">
            <h3>Cortador</h3>
            <NumField label="Largura" value={width} onChange={setWidth} min={LIMITS.width[0]} max={LIMITS.width[1]} step={1} />
          </div>
          <div className="card stack">
            <label className="check">
              <input type="checkbox" checked={p.stamp} onChange={(e) => set("stamp")(e.target.checked)} /> <strong>Carimbo do desenho interno</strong>
            </label>
            {p.stamp && (
              <>
                <label>
                  O que marca na massa
                  <select value={p.reliefMode} onChange={(e) => set("reliefMode")(e.target.value as ReliefMode)}>
                    <option value="auto">Automático</option>
                    <option value="lines">Linhas do desenho</option>
                    <option value="holes">Partes vazadas do desenho</option>
                  </select>
                </label>
              </>
            )}
          </div>
          {/* template (#139): o que quase ninguém muda fica recolhido; os padrões já imprimem bem */}
          <details className="advanced">
            <summary>Opções avançadas</summary>
            <div className="stack">
              <div className="grid two">
                <NumField label="Altura" value={p.height} onChange={set("height")} min={LIMITS.height[0]} max={LIMITS.height[1]} step={1} />
                <NumField label="Lâmina" value={p.blade} onChange={set("blade")} min={LIMITS.blade[0]} max={LIMITS.blade[1]} />
                <NumField label="Borda de apoio" value={p.rimWidth} onChange={set("rimWidth")} min={LIMITS.rimWidth[0]} max={LIMITS.rimWidth[1]} step={0.5} />
                <NumField label="Altura da borda" value={p.rimHeight} onChange={set("rimHeight")} min={LIMITS.rimHeight[0]} max={LIMITS.rimHeight[1]} />
              </div>
              <label className="check">
                <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Espelhar (o biscoito sai igual ao desenho)
              </label>
              {p.stamp && (
                <div className="grid two">
                  <NumField label="Relevo" value={p.relief} onChange={set("relief")} min={LIMITS.relief[0]} max={LIMITS.relief[1]} />
                  <NumField label="Placa" value={p.plate} onChange={set("plate")} min={LIMITS.plate[0]} max={LIMITS.plate[1]} />
                  <NumField label="Folga no cortador" value={p.clearance} onChange={set("clearance")} min={LIMITS.clearance[0]} max={LIMITS.clearance[1]} />
                  <NumField label="Margem da borda" value={p.edgeMargin} onChange={set("edgeMargin")} min={LIMITS.edgeMargin[0]} max={LIMITS.edgeMargin[1]} />
                </div>
              )}
            </div>
          </details>
          <ExportButtons models={models} name={svg ? `cortador-${svg.name}` : "cortador"} busy={busy} profile={CUTTER_PROFILE} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy || loading} busyText={loading ? "Lendo o desenho…" : "Gerando cortador…"} error={error} emptyText={svg && !valid ? "Corrija os campos em vermelho para ver o cortador." : "Envie um desenho para ver o cortador."} />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
          {models.length > 0 && <Alert kind="info">Imprima o cortador com a borda na mesa e a lâmina para cima. O carimbo encaixa por dentro dele.</Alert>}
        </div>
      </div>
    </div>
  );
}
