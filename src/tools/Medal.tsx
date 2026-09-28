import { useEffect, useState } from "react";
import { FONTS, loadFont, type FontId } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import { buildMedal, DEFAULT_MEDAL, type MedalParams, type MedalShape } from "../geometry/medal";
import { textToCrossSection } from "../geometry/text";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import { errorText } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import "../styles/features.css";
import { clearHandoff, peekHandoff } from "./handoff";
import { DESIGN_ACCEPT, designFromSvg, fileToSvg, svgFillColors } from "./designInput";

const SHAPES: [MedalShape, string][] = [
  ["circle", "Redonda"],
  ["hexagon", "Hexágono"],
  ["star", "Estrela"],
  ["shield", "Escudo"],
];

export default function Medal() {
  const [p, setP] = useState<MedalParams>(DEFAULT_MEDAL);
  const [text, setText] = useState("CAMPEÃ");
  const [font, setFont] = useState<FontId>("hanken");
  // SVG vindo do Imagem → SVG (pode ser colorido)
  const [art, setArt] = useState<{ svg: string; name: string } | null>(() => peekHandoff());
  useEffect(clearHandoff, []);
  const [artError, setArtError] = useState<string | null>(null);
  const set = <K extends keyof MedalParams>(k: K) => (v: MedalParams[K]) => setP((o) => ({ ...o, [k]: v }));

  async function onArt(f: File) {
    setArtError(null);
    try {
      setArt({ svg: await fileToSvg(f), name: f.name });
    } catch (e) {
      setArtError(errorText(e));
    }
  }

  const artMulti = !!art && svgFillColors(art.svg).length > 1;
  const valid =
    inRange(p.diameter, 25, 150) && inRange(p.thickness, 1, 10) && inRange(p.rim, 0.8, 10) && inRange(p.relief, 0.4, 5) && (p.ribbon === 0 || inRange(p.ribbon, 5, 50));

  const { models, busy, error } = useModelBuilder(async () => {
    if (!valid) return null;
    const M = await getManifold();
    const txt = text.trim() ? textToCrossSection(M, await loadFont(font), text, p.diameter * 0.14) : null;
    const design = art ? await designFromSvg(art.svg, 100, false, true) : null;
    try {
      return { models: [{ ...buildMedal(M, p, design?.cs ?? null, txt, design?.layers), name: text.trim() || "Medalha" }], warnings: [] };
    } finally {
      txt?.delete();
      design?.cs.delete();
      design?.layers?.forEach((l) => l.cs.delete());
    }
  }, [p, text, font, art, valid]);

  return (
    <div className="page">
      <h1>Medalhas</h1>
      <p className="lead">Formato, texto, imagem no centro e alça para a fita. Base, destaque e imagem saem em cores separadas no 3MF.</p>
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <div className="span-2">
              <span className="field-label">Formato</span>
              <Segmented label="Formato" value={p.shape} options={SHAPES} onChange={set("shape")} full />
            </div>
            <div className="grid two">
              <NumField label="Tamanho" value={p.diameter} onChange={set("diameter")} min={25} max={150} step={1} />
              <NumField label="Largura da fita" value={p.ribbon} onChange={set("ribbon")} min={0} max={50} step={1} hint="0 = sem alça" />
            </div>
          </div>
          <div className="card stack">
            <h3>Texto e imagem</h3>
            <label>
              Texto (embaixo)
              <input value={text} maxLength={24} onChange={(e) => setText(e.target.value)} />
            </label>
            <label>
              Fonte
              <select value={font} onChange={(e) => setFont(e.target.value as FontId)}>
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <Dropzone accept={DESIGN_ACCEPT} label={art ? art.name : "Imagem do centro (SVG ou imagem)"} hint="Logo, troféu, número…" onFile={onArt} />
            {artError && <Alert kind="error">{artError}</Alert>}
            {art && (
              <button className="link danger" onClick={() => setArt(null)}>
                Remover imagem
              </button>
            )}
          </div>
          <div className="card stack">
            <h3>Espessuras e cores</h3>
            <div className="grid two">
              <NumField label="Base" value={p.thickness} onChange={set("thickness")} min={1} max={10} />
              <NumField label="Relevo" value={p.relief} onChange={set("relief")} min={0.4} max={5} />
              <NumField label="Borda" value={p.rim} onChange={set("rim")} min={0.8} max={10} />
            </div>
            <div className="row">
              <label>
                Base
                <input type="color" value={p.baseColor} onChange={(e) => set("baseColor")(e.target.value)} />
              </label>
              <label>
                Borda e texto
                <input type="color" value={p.accentColor} onChange={(e) => set("accentColor")(e.target.value)} />
              </label>
              {!artMulti && (
                <label>
                  Imagem
                  <input type="color" value={p.artColor} onChange={(e) => set("artColor")(e.target.value)} />
                </label>
              )}
            </div>
            {artMulti && <span className="hint">A imagem é colorida: cada cor dela sai com o próprio filamento.</span>}
          </div>
          <ExportButtons models={models} name={`medalha-${text || "sem-texto"}`} busy={busy} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy} busyText="Gerando medalha…" error={error} emptyText={!valid ? "Corrija os campos em vermelho." : undefined} />
        </div>
      </div>
    </div>
  );
}
