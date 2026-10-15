import { useEffect, useState } from "react";
import { bedMm } from "../geometry/bed";
import { modelsBounds } from "../geometry/bounds";
import { loadEmojiFont, loadFont, type FontId } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import { STAMP_HINGE_PROFILE, STAMP_PROFILE } from "../geometry/printProfile";
import { buildStamp, DEFAULT_STAMP, minEdge, PAPER_PROFILES, type StampAlign, type StampParams, type StampShape } from "../geometry/stamp";
import { buildStampArt, DEFAULT_ART, fixThinStrokes, NO_MOVE, thinWarning, type ArtMove, type StampFrame, type StampLayout } from "../geometry/stampArt";
import { hasEmoji } from "../geometry/text";
import { splitLines } from "../geometry/keychain";
import FontPicker from "../ui/FontPicker";
import LinesField from "../ui/LinesField";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import SeeAlso from "../ui/SeeAlso";
import Segmented from "../ui/Segmented";
import { errorText } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import ColorPick from "./ColorPick";
import { DESIGN_ACCEPT, designFromSvg, fileToSvg } from "./designInput";
import { clearHandoff, peekHandoff } from "./handoff";
import { bedWarnings } from "./models/bedCheck";
import { STAMP_PRESETS, type StampPreset } from "./stampPresets";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

const SHAPES = [["rect", "Retângulo"], ["round", "Redondo (selo)"]] as const;
const ALIGNS = [["pins", "Pinos"], ["magnets", "Ímãs"], ["hinge", "Dobradiça"]] as const;
const LAYOUTS = [["stack", "Logo em cima"], ["side", "Logo ao lado"]] as const;
const FRAMES = [["none", "Sem moldura"], ["line", "Linha"], ["seal", "Selo"]] as const;
const MOVE_LIMIT_MM = 60;
const DEFAULT_TEXT = "Ana & Bruno";

type State = {
  text: string;
  font: FontId;
  logo: { svg: string; name: string } | null;
  layout: StampLayout;
  textScale: number;
  frame: StampFrame;
  lineW: number;
  arcTop: string;
  arcBottom: string;
  arcH: number;
  scale: number;
  move: ArtMove;
  thicken: boolean;
  p: StampParams;
};

const initial = (): State => ({ text: DEFAULT_TEXT, font: "pacifico", logo: peekHandoff(), ...DEFAULT_ART, thicken: true, p: DEFAULT_STAMP });

export default function Stamp() {
  const tool = useToolState<State>("stamp", initial, { label: "Carimbo seco" });
  const s = tool.state;
  const { p, move } = s;
  const field = tool.field;
  const setP = <K extends keyof StampParams>(key: K) => (v: StampParams[K]) => tool.set((cur) => ({ ...cur, p: { ...cur.p, [key]: v } }), `p.${String(key)}`);
  const setMove = field("move");
  const [logoError, setLogoError] = useState<string | null>(null);
  useEffect(clearHandoff, []);

  const round = p.shape === "round";
  const seal = round && s.frame === "seal";
  const lines = splitLines(s.text);
  const edgeNeeded = minEdge(p);
  const valid =
    inRange(p.w, 15, 140) && (round || inRange(p.h, 10, 140)) && inRange(p.edge, 6, 25) && inRange(p.plate, 3, 8) && inRange(p.relief, 0.4, 3) && inRange(p.draft, 0, 20) && inRange(p.paper, 0.2, 2) &&
    inRange(s.textScale, 20, 200) && inRange(s.scale, 10, 150) && inRange(s.lineW, 0.8, 4) && inRange(s.arcH, 2.5, 10) &&
    inRange(move.rot, -180, 180) && inRange(move.dx, -MOVE_LIMIT_MM, MOVE_LIMIT_MM) && inRange(move.dy, -MOVE_LIMIT_MM, MOVE_LIMIT_MM) &&
    (p.align !== "magnets" || (inRange(p.magD, 3, 12) && inRange(p.magH, 1, 6) && inRange(p.magTol, 0, 0.5))) && (p.align !== "hinge" || (inRange(p.hingeGap, 4, 14) && inRange(p.hingeFilm, 0.3, 0.8)));
  const hasInput = lines.length > 0 || !!s.logo || (seal && !!(s.arcTop.trim() || s.arcBottom.trim()));

  async function onLogo(f: File) {
    setLogoError(null);
    try {
      field("logo")({ svg: await fileToSvg(f), name: f.name });
    } catch (e) {
      setLogoError(errorText(e));
    }
  }

  function applyPreset(pr: StampPreset) {
    tool.set((cur) => ({ ...cur, text: pr.text, font: pr.font, layout: pr.layout ?? cur.layout, frame: pr.frame, arcTop: pr.arcTop ?? "", arcBottom: pr.arcBottom ?? "", p: { ...cur.p, ...pr.p } }), "preset");
  }

  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!valid || !hasInput) return null;
    const M = await getManifold();
    const font = await loadFont(s.font);
    const emoji = [...lines, s.arcTop, s.arcBottom].some(hasEmoji) ? await loadEmojiFont() : undefined;
    const design = s.logo ? await designFromSvg(s.logo.svg, 100, false) : null;
    try {
      const made = buildStampArt(M, { shape: p.shape, w: p.w, h: round ? p.w : p.h, logo: design?.cs ?? null, lines, font, emoji, layout: s.layout, textScale: s.textScale, frame: s.frame, lineW: s.lineW, arcTop: s.arcTop, arcBottom: s.arcBottom, arcH: s.arcH, scale: s.scale, move });
      try {
        const thin = fixThinStrokes(M, made.art, s.thicken);
        try {
          const out = buildStamp(M, thin.cs, p);
          const warn = [...made.warnings, ...thinWarning(thin), ...out.warnings];
          const printable = out.models.filter((m) => !m.previewOnly);
          const b = modelsBounds(printable);
          if (b && b.max[0] - b.min[0] > bedMm()) warn.push("As duas placas juntas passam da largura da mesa: o fatiador as coloca em mesas separadas (ou use o tamanho menor).");
          return { models: out.models, warnings: [...warn, ...bedWarnings(printable, warn)] };
        } finally {
          thin.cs.delete();
        }
      } finally {
        made.art.delete();
      }
    } finally {
      design?.cs.delete();
    }
  }, [s, valid, hasInput]);

  const profile = p.align === "hinge" ? STAMP_HINGE_PROFILE : STAMP_PROFILE;
  const paperId = PAPER_PROFILES.find((x) => x.paper === p.paper)?.id ?? "custom";
  const moved = move.rot !== 0 || move.dx !== 0 || move.dy !== 0;
  const hintFor = (): string =>
    p.align === "pins"
      ? "Pinos nos cantos: o papel precisa caber entre eles. Para papel maior que a placa, use ímãs ou dobradiça."
      : p.align === "magnets"
        ? `Ímãs de ${p.magD}×${p.magH} mm colados nos bolsos de baixo, com a mesma ordem de polos nas duas placas (teste antes de colar). O papel pode ser maior que a placa.`
        : "A dobradiça de filme une as placas: dobre como um livro com o papel dentro; ele sai livre pelos outros lados.";

  return (
    <div className="page">
      <h1>Carimbo seco</h1>
      <p className="lead">Duas placas que gravam o desenho em relevo, sem tinta.</p>
      <SeeAlso items={[{ label: "Imagem em desenho (SVG)", page: "svg" }, { label: "Medalhas", page: "medal" }]} />
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Modelo pronto</h3>
            <div className="row wrap">
              {STAMP_PRESETS.map((pr) => (
                <button key={pr.id} type="button" title={pr.hint} onClick={() => applyPreset(pr)}>
                  {pr.label}
                </button>
              ))}
            </div>
            <span className="hint">Preenche texto, formato e encaixe; depois é só ajustar.</span>
          </div>
          <div className="card stack">
            <h3>Desenho</h3>
            <LinesField value={s.text} onChange={field("text")} maxLength={80} />
            <FontPicker value={s.font} onChange={field("font")} sample={lines[0] ?? ""} />
            <Dropzone accept={DESIGN_ACCEPT} label={s.logo ? s.logo.name : "SVG, PNG ou foto do logo"} hint="Fotos e PNG viram desenho sozinhos; sobreposições são unidas pelo app" onFile={onLogo} />
            {logoError && <Alert kind="error">{logoError}</Alert>}
            {s.logo && (
              <>
                <button type="button" className="link danger" onClick={() => field("logo")(null)}>Remover logo</button>
                <Segmented label="Posição do logo" value={s.layout} options={LAYOUTS} onChange={field("layout")} full />
                <NumField label="Tamanho do texto" unit="% do logo" value={s.textScale} onChange={field("textScale")} min={20} max={200} step={5} />
              </>
            )}
            <label className="check">
              <input type="checkbox" checked={s.thicken} onChange={(e) => field("thicken")(e.target.checked)} /> Engrossar traços finos demais para o bico
            </label>
          </div>
          <div className="card stack">
            <h3>Formato</h3>
            <Segmented label="Formato" value={p.shape} options={SHAPES} onChange={(v: StampShape) => setP("shape")(v)} full />
            <div className="grid two">
              <NumField label={round ? "Diâmetro" : "Largura"} value={p.w} onChange={setP("w")} min={15} max={140} step={1} />
              {!round && <NumField label="Altura" value={p.h} onChange={setP("h")} min={10} max={140} step={1} />}
            </div>
            <span className="field-label">Moldura</span>
            <Segmented label="Moldura" value={round || s.frame !== "seal" ? s.frame : "line"} options={round ? FRAMES : FRAMES.filter(([v]) => v !== "seal")} onChange={(v: StampFrame) => field("frame")(v)} full />
            {s.frame !== "none" && <NumField label="Espessura da linha" value={s.lineW} onChange={field("lineW")} min={0.8} max={4} step={0.1} />}
            {seal && (
              <>
                <label>
                  Texto em cima, em volta
                  <input value={s.arcTop} maxLength={32} onChange={(e) => field("arcTop")(e.target.value)} />
                </label>
                <label>
                  Texto embaixo, em volta
                  <input value={s.arcBottom} maxLength={32} onChange={(e) => field("arcBottom")(e.target.value)} />
                </label>
                <NumField label="Altura do texto em volta" value={s.arcH} onChange={field("arcH")} min={2.5} max={10} step={0.5} />
              </>
            )}
          </div>
          <div className="card stack">
            <h3>Papel e encaixe</h3>
            <span className="field-label">Papel</span>
            <Segmented label="Papel" value={paperId as "common"} options={PAPER_PROFILES.map((x) => [x.id, `${x.label} (${String(x.paper).replace(".", ",")})`] as const)} onChange={(id) => setP("paper")(PAPER_PROFILES.find((x) => x.id === id)!.paper)} full />
            <span className="field-label">Alinhamento das placas</span>
            <Segmented label="Alinhamento" value={p.align} options={ALIGNS} onChange={(v: StampAlign) => setP("align")(v)} full />
            <span className="hint">{hintFor()}</span>
            {p.align === "magnets" && (
              <div className="grid two">
                <NumField label="Diâmetro do ímã" value={p.magD} onChange={setP("magD")} min={3} max={12} step={0.5} />
                <NumField label="Altura do ímã" value={p.magH} onChange={setP("magH")} min={1} max={6} step={0.5} />
                <NumField label="Folga do bolso" value={p.magTol} onChange={setP("magTol")} min={0} max={0.5} step={0.05} hint="Pouca folga: o ímã entra por pressão" />
                <label>
                  Quantidade
                  <select value={p.magCount} onChange={(e) => setP("magCount")(Number(e.target.value) === 4 ? 4 : 2)}>
                    <option value={2}>2 na diagonal</option>
                    <option value={4}>4 nos cantos</option>
                  </select>
                </label>
              </div>
            )}
            <div className="row">
              <ColorPick label="Cor da placa com relevo" value={p.topColor} onChange={setP("topColor")} />
              <ColorPick label="Cor da placa com cavidade" value={p.bottomColor} onChange={setP("bottomColor")} />
            </div>
            <details className="advanced">
              <summary>Opções avançadas</summary>
              <div className="stack">
                <div className="grid two">
                  <NumField label="Folga do papel" value={p.paper} onChange={setP("paper")} min={0.2} max={2} step={0.05} />
                  <NumField label="Altura do relevo" value={p.relief} onChange={setP("relief")} min={0.4} max={3} step={0.1} />
                  <NumField label="Inclinação das paredes" unit="°" value={p.draft} onChange={setP("draft")} min={0} max={20} step={1} hint="Solta o papel sem rasgar" />
                  <NumField label="Espessura das placas" value={p.plate} onChange={setP("plate")} min={3} max={8} step={0.5} />
                  <NumField label="Borda da placa" value={p.edge} onChange={setP("edge")} min={6} max={25} step={0.5} hint={p.edge < edgeNeeded ? `O alinhamento pede ${String(Math.round(edgeNeeded * 10) / 10).replace(".", ",")} mm: aumento sozinho` : undefined} />
                  <NumField label="Folga dos pinos" value={p.pinFit} onChange={setP("pinFit")} min={0.1} max={0.5} step={0.05} />
                  {p.align === "hinge" && (
                    <>
                      <NumField label="Vão da dobradiça" value={p.hingeGap} onChange={setP("hingeGap")} min={4} max={14} step={1} />
                      <NumField label="Espessura do filme" value={p.hingeFilm} onChange={setP("hingeFilm")} min={0.3} max={0.8} step={0.1} />
                    </>
                  )}
                  <NumField label="Tamanho do conteúdo" unit="%" value={s.scale} onChange={field("scale")} min={10} max={150} step={5} />
                  <NumField label="Girar o desenho" unit="°" value={move.rot} onChange={(v) => setMove({ ...move, rot: v })} min={-180} max={180} step={1} />
                  <NumField label="Mover para a direita" value={move.dx} onChange={(v) => setMove({ ...move, dx: v })} min={-MOVE_LIMIT_MM} max={MOVE_LIMIT_MM} step={0.5} />
                  <NumField label="Mover para cima" value={move.dy} onChange={(v) => setMove({ ...move, dy: v })} min={-MOVE_LIMIT_MM} max={MOVE_LIMIT_MM} step={0.5} />
                </div>
                {moved && (
                  <button type="button" className="link" onClick={() => setMove(NO_MOVE)}>
                    Voltar ao centro
                  </button>
                )}
                <span className="hint">O espelho da placa de baixo e o deslocamento são calculados juntos: as duas metades sempre casam.</span>
              </div>
            </details>
          </div>
          <ExportButtons models={models.filter((m) => !m.previewOnly)} name={`carimbo-${lines[0] ?? s.logo?.name ?? "seco"}`} busy={busy} profile={profile} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy} busyText="Gerando as placas…" error={error} emptyText={!valid ? "Corrija os campos em vermelho para ver o carimbo." : "Digite um texto ou envie um logo para ver o carimbo."} />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
          {p.align === "hinge" && <Alert kind="info">A dobradiça é um filme de {String(p.hingeFilm).replace(".", ",")} mm: imprima em PETG (o PLA racha em poucas dobras) e dobre devagar.</Alert>}
          {models.length > 0 && <Alert kind="info">Ao lado das placas está o papel já gravado (só prévia). Feche a placa de baixo virando-a como a página de um livro: o desenho dela é o espelho do relevo.</Alert>}
        </div>
      </div>
    </div>
  );
}
