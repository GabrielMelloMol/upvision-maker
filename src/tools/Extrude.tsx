import { bedWarnings } from "./models/bedCheck";
import { BASE_COLOR, extrudeDesign, TOP_COLOR } from "../geometry/extrude";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ColorPick from "./ColorPick";
import ExportButtons from "../ui/ExportButtons";
import { DEFAULT_PROFILE } from "../geometry/printProfile";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import { useModelBuilder } from "../ui/useModelBuilder";
import { DESIGN_ACCEPT, designFromSvg, svgFillColors } from "./designInput";
import { exampleFile, useExample } from "../help/helpStore";
import ToolSessionBar from "./ToolSessionBar";
import { initialDesign, useDesignInput } from "./useDesignInput";
import { useToolState } from "./useToolState";

export default function Extrude() {
  // estado de trabalho: desfazer, rascunho guardado e últimos projetos (#85)
  const tool = useToolState("extrude", () => ({ ...initialDesign(60), height: 2, withBase: false, baseT: 1.6, margin: 2, colors: [BASE_COLOR, TOP_COLOR] }), { label: "Extrusão" });
  const { height, withBase, baseT, margin, colors } = tool.state;
  const [setHeight, setWithBase, setBaseT, setMargin, setColors] = [tool.field("height"), tool.field("withBase"), tool.field("baseT"), tool.field("margin"), tool.field("colors")];
  const { svg, width, setWidth, loading, error: inputError, onFile } = useDesignInput(tool.state, (patch, key) => tool.set((cur) => ({ ...cur, ...patch }), key));
  useExample("extrude", () => void exampleFile("heart").then(onFile)); // "Usar exemplo" da ajuda (#84)

  const svgColors = svg ? svgFillColors(svg.text) : [];
  const multi = svgColors.length > 1;
  const valid = inRange(width, 5, 300) && inRange(height, 0.2, 100) && (!withBase || (inRange(baseT, 0.4, 20) && inRange(margin, 0, 30)));

  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!svg || !valid) return null;
    const { M, cs, layers } = await designFromSvg(svg.text, width, false, true);
    try {
      const m = extrudeDesign(M, cs, { height, base: withBase ? { margin, thickness: baseT } : null }, svg.name, layers);
      // SVG colorido: as cores das camadas vêm do desenho; só a base usa o seletor
      const color = (i: number) => (layers ? (withBase && i === 0 ? colors[0] : undefined) : colors[withBase ? i : 0]);
      const models = [{ ...m, parts: m.parts.map((p, i) => ({ ...p, color: color(i) ?? p.color })) }];
      return { models, warnings: bedWarnings(models, []) }; // #122
    } finally {
      cs.delete();
      layers?.forEach((l) => l.cs.delete());
    }
  }, [svg, width, height, withBase, baseT, margin, colors, valid]);

  return (
    <div className="page">
      <h1>Extrusão SVG → 3D</h1>
      <p className="lead">Dá altura a qualquer desenho, com base se quiser.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Desenho</h3>
            <Dropzone accept={DESIGN_ACCEPT} label={svg ? svg.name : "Arraste um SVG ou imagem"} hint="Imagens são vetorizadas automaticamente" onFile={onFile} />
            {loading && <Alert kind="info">Lendo o desenho…</Alert>}
            {inputError && <Alert kind="error">{inputError}</Alert>}
          </div>
          <div className="card stack">
            <h3>Peça</h3>
            <div className="grid two">
              <NumField label="Largura" value={width} onChange={setWidth} min={5} max={300} step={1} />
              <NumField label="Altura do desenho" value={height} onChange={setHeight} min={0.2} max={100} />
            </div>
            <label className="check">
              <input type="checkbox" checked={withBase} onChange={(e) => setWithBase(e.target.checked)} /> Base por baixo (placa na silhueta)
            </label>
            {multi && <p className="hint">Desenho com {svgColors.length} cores: cada uma sai como uma parte com o próprio filamento no 3MF.</p>}
            <div className="row">
              {(withBase || !multi) && (
                <ColorPick label={withBase ? "Cor da base" : "Cor"} value={colors[0]} onChange={(c) => setColors([c, colors[1]])} />
              )}
              {withBase && !multi && (
                <ColorPick label="Cor do desenho" value={colors[1]} onChange={(c) => setColors([colors[0], c])} />
              )}
            </div>
          </div>
          {withBase && (
            <details className="advanced">
              <summary>Opções avançadas</summary>
              <div className="grid two">
                <NumField label="Espessura da base" value={baseT} onChange={setBaseT} min={0.4} max={20} />
                <NumField label="Margem da base" value={margin} onChange={setMargin} min={0} max={30} step={0.5} />
              </div>
            </details>
          )}
          <ExportButtons models={models} name={svg?.name ?? "extrusao"} busy={busy} profile={DEFAULT_PROFILE} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy || loading} error={error} emptyText={svg && !valid ? "Corrija os campos em vermelho." : "Envie um desenho para extrudar."} />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
