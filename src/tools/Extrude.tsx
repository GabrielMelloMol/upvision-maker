import { useState } from "react";
import { BASE_COLOR, extrudeDesign, TOP_COLOR } from "../geometry/extrude";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import { DEFAULT_PROFILE } from "../geometry/printProfile";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import { useModelBuilder } from "../ui/useModelBuilder";
import { DESIGN_ACCEPT, designFromSvg, svgFillColors } from "./designInput";
import { useDesignInput } from "./useDesignInput";

export default function Extrude() {
  const { svg, width, setWidth, loading, error: inputError, onFile } = useDesignInput(60);
  const [height, setHeight] = useState(2);
  const [withBase, setWithBase] = useState(false);
  const [baseT, setBaseT] = useState(1.6);
  const [margin, setMargin] = useState(2);
  const [colors, setColors] = useState([BASE_COLOR, TOP_COLOR]);

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
      return { models: [{ ...m, parts: m.parts.map((p, i) => ({ ...p, color: color(i) ?? p.color })) }], warnings: [] };
    } finally {
      cs.delete();
      layers?.forEach((l) => l.cs.delete());
    }
  }, [svg, width, height, withBase, baseT, margin, colors, valid]);

  return (
    <div className="page">
      <h1>Extrusão SVG → 3D</h1>
      <p className="lead">Dá altura a qualquer desenho. Com base, a placa e o desenho saem em cores separadas no 3MF.</p>
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <Dropzone accept={DESIGN_ACCEPT} label={svg ? svg.name : "Arraste um SVG ou imagem"} hint="Imagens são vetorizadas automaticamente" onFile={onFile} />
            {loading && <Alert kind="info">Lendo o desenho…</Alert>}
            {inputError && <Alert kind="error">{inputError}</Alert>}
          </div>
          <div className="card stack">
            <div className="grid two">
              <NumField label="Largura" value={width} onChange={setWidth} min={5} max={300} step={1} />
              <NumField label="Altura do desenho" value={height} onChange={setHeight} min={0.2} max={100} />
            </div>
            <label className="check">
              <input type="checkbox" checked={withBase} onChange={(e) => setWithBase(e.target.checked)} /> Base por baixo (placa na silhueta)
            </label>
            {withBase && (
              <div className="grid two">
                <NumField label="Espessura da base" value={baseT} onChange={setBaseT} min={0.4} max={20} />
                <NumField label="Margem da base" value={margin} onChange={setMargin} min={0} max={30} step={0.5} />
              </div>
            )}
            {multi && <p className="hint">Desenho com {svgColors.length} cores: cada uma sai como uma parte com o próprio filamento no 3MF.</p>}
            <div className="row">
              {(withBase || !multi) && (
                <label>
                  {withBase ? "Cor da base" : "Cor"}
                  <input type="color" value={colors[0]} onChange={(e) => setColors([e.target.value, colors[1]])} />
                </label>
              )}
              {withBase && !multi && (
                <label>
                  Cor do desenho
                  <input type="color" value={colors[1]} onChange={(e) => setColors([colors[0], e.target.value])} />
                </label>
              )}
            </div>
          </div>
          <ExportButtons models={models} name={svg?.name ?? "extrusao"} busy={busy} profile={DEFAULT_PROFILE} />
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
