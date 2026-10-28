import { useEffect, useMemo, useState } from "react";
import { bedMm } from "../geometry/bed";
import { estimateModels } from "../domain/estimate";
import { loadEmojiFont, loadFont, type FontId } from "../geometry/fonts";
import { getManifold, type CS } from "../geometry/manifold";
import { THERMO_CLOSURE_PROFILE, THERMO_MOLD_PROFILE, THERMO_SCREEN_PROFILE } from "../geometry/printProfile";
import { scoped, shrinkToFit } from "../geometry/shape2d";
import { buildStampArt, DEFAULT_ART, type StampLayout } from "../geometry/stampArt";
import { buildThermo, thermoDefaults, type BaseMode, type ThermoInfo, type ThermoParams } from "../geometry/thermo/build";
import { layoutPlates } from "../geometry/thermo/layout";
import { PRESS_VIEWS, type PressMorph, type PressView } from "../geometry/thermo/press";
import PressPlayer from "./PressPlayer";
import { CLEARANCE_RANGE } from "../geometry/thermo/mold";
import type { Closure } from "../geometry/thermo/screen";
import { ASYMMETRY_WARN, asymmetry, presetSilhouette, SHAPE_LABELS, silhouetteFromDesign, symmetrize, type SymSide, type ThermoShape } from "../geometry/thermo/shapes";
import { hasEmoji, textToCrossSection } from "../geometry/text";
import { splitLines, stackLines } from "../geometry/keychain";
import type { Model } from "../geometry/types";
import FontPicker from "../ui/FontPicker";
import LinesField from "../ui/LinesField";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import GeneratorHelp from "./models/guide/GeneratorHelp";
import { TOOL_HELP } from "./models/help/toolHelp";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import SeeAlso from "../ui/SeeAlso";
import { formatDuration } from "../ui/parse";
import { errorText } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import ColorPick from "./ColorPick";
import { DESIGN_ACCEPT, designFromSvg, fileToCutSvg } from "./designInput";
import { clearHandoff, peekHandoff } from "./handoff";
import { bedWarnings } from "./models/bedCheck";
import { THERMO_PRESETS, type ThermoPreset } from "./thermoPresets";
import ToolSessionBar from "./ToolSessionBar";
import ThermoPrompt from "./ThermoPrompt";
import ThermoSteps from "./ThermoSteps";
import { useToolState } from "./useToolState";

type Source = "shape" | "image" | "text";
const SOURCES = [["shape", "Formato pronto"], ["image", "Imagem ou SVG"], ["text", "Texto"]] as const;
const MESHES = [["honeycomb", "Favo"], ["diamond", "Losango"]] as const;
const CLOSURES = [["connector", "Conector com porca"], ["hinge", "Dobradiça e trava"], ["none", "Sem fecho (cascas soltas)"], ["clip", "Clipe"], ["ring", "Faixa colada"], ["cap", "Tampa rosqueada"]] as const;
const CLOSURE_HINTS: Record<Closure, string> = {
  connector: "As orelhas das duas cascas ficam juntas, o conector passa pelos furos e a porca enrosca por cima. A argola da porca é o pendurador; para encher, desenrosque.",
  hinge: "Cada casca é colada num aro firme. Os dois aros saem da impressora já unidos pela dobradiça e fecham com a trava da frente: abre e fecha como uma Pokébola.",
  none: "As duas cascas ficam soltas, borda com borda: encha e amarre com uma fita.",
  clip: "O clipe passa pelo furo da orelha das duas telas e funciona como dobradiça. Fica no eixo de simetria para as duas metades se encontrarem.",
  ring: "Uma faixa em pé em volta da emenda, para colar por fora das duas metades (o aro).",
  cap: "Cada base leva metade de um pino rosqueado no eixo de simetria; as duas metades formam o pino e a tampa enrosca nele. A tampa tem um furo para a fita: ela é o pendurador.",
};
const SIDE_LABELS: Partial<Record<Closure, string>> = { connector: "Onde fica o conector (e o pendurador)", hinge: "Onde fica a dobradiça (a trava fica do outro lado)", clip: "Onde fica a dobradiça", cap: "Onde fica o pendurador" };
const BASES = [["both", "Nas duas metades"], ["one", "Numa metade"], ["none", "Sem base"]] as const;
const SHOWS = [["table", "Mesa (o que imprime)"], ["press", "Como prensar (não imprime)"], ["assembled", "Montada (não imprime)"], ["shell", "Casca prensada (não imprime)"]] as const;
type Show = (typeof SHOWS)[number][0];
const SIDES = [["top", "Em cima"], ["bottom", "Embaixo"]] as const;
const LAYOUTS = [["stack", "Logo em cima"], ["side", "Logo ao lado"]] as const;
const SYMS = [["keep", "Como está"], ["left", "Espelhar a esquerda"], ["right", "Espelhar a direita"]] as const;
const DESIGN_FILL = 0.8; // quanto da área da malha o desenho ocupa
const DESIGN_MARGIN = 2; // folga do desenho até a borda sólida
const BLOB_MM = 4; // texto vira silhueta engordando as letras até se tocarem

type State = {
  source: Source;
  shape: ThermoShape;
  width: number;
  sym: SymSide;
  image: { svg: string; name: string } | null;
  cutout: boolean;
  silText: string;
  silFont: FontId;
  text: string;
  font: FontId;
  logo: { svg: string; name: string } | null;
  layout: StampLayout;
  textScale: number;
  p: ThermoParams;
};

const initial = (): State => ({ source: "shape", shape: "heart", width: 70, sym: "keep", image: null, cutout: true, silText: "Ana", silFont: "pacifico", text: "Feliz\nNatal", font: "great-vibes", logo: peekHandoff(), layout: "stack", textScale: 55, p: thermoDefaults() });

type View = { screens: Model[]; closure: Model[]; molds: Model[]; assembled: Model; shell: Model; press: Model; morph?: PressMorph; info: ThermoInfo; asym: number };

const g = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} g`;
const fmt = (n: number, d = 2) => n.toFixed(d).replace(".", ",");

/** Silhueta (CS em mm, simétrica ou a simetrizar) a partir do que a pessoa escolheu. */
async function silhouetteOf(s: State): Promise<CS | null> {
  const M = await getManifold();
  if (s.source === "shape") return presetSilhouette(M, s.shape, s.width);
  if (s.source === "image") {
    if (!s.image) return null;
    const d = await designFromSvg(s.image.svg, s.width, false);
    try {
      return silhouetteFromDesign(M, d.cs, s.width);
    } finally {
      d.cs.delete();
    }
  }
  const lines = splitLines(s.silText);
  if (!lines.length) return null;
  const f = await loadFont(s.silFont);
  const emoji = lines.some(hasEmoji) ? await loadEmojiFont() : undefined;
  return scoped((k) => {
    const cs = lines.map((l) => k(textToCrossSection(M, f, l, 40, emoji)));
    const all = cs.length === 1 ? cs[0] : k(stackLines(M, cs, 10));
    return silhouetteFromDesign(M, k(all.offset(BLOB_MM, "Round")), s.width, BLOB_MM);
  });
}

export default function Thermoform() {
  const tool = useToolState<State>("thermoform", initial, { label: "Caixinha termoformada", version: 2 });
  const s = tool.state;
  const { p } = s;
  const field = tool.field;
  const setP = <K extends keyof ThermoParams>(key: K) => (v: ThermoParams[K]) => tool.set((cur) => ({ ...cur, p: { ...cur.p, [key]: v } }), `p.${String(key)}`);
  const setScreen = <K extends keyof ThermoParams["screen"]>(key: K) => (v: ThermoParams["screen"][K]) => tool.set((cur) => ({ ...cur, p: { ...cur.p, screen: { ...cur.p.screen, [key]: v } } }), `screen.${String(key)}`);
  const setMold = <K extends keyof ThermoParams["mold"]>(key: K) => (v: ThermoParams["mold"][K]) => tool.set((cur) => ({ ...cur, p: { ...cur.p, mold: { ...cur.p.mold, [key]: v } } }), `mold.${String(key)}`);
  const setColor = (key: keyof ThermoParams["colors"]) => (v: string) => tool.set((cur) => ({ ...cur, p: { ...cur.p, colors: { ...cur.p.colors, [key]: v } } }), `color.${key}`);
  const [fileError, setFileError] = useState<string | null>(null);
  const [cutWarn, setCutWarn] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState<Show>("table");
  const [frame, setFrame] = useState<PressView>("play");
  useEffect(clearHandoff, []);

  const lines = splitLines(s.text);
  const sc = p.screen;
  const valid =
    inRange(s.width, 40, 140) && inRange(p.domeH, 6, 40) && inRange(p.curve, 1.6, 4) && inRange(sc.t, 0.6, 2) && inRange(sc.border, 2, 8) && inRange(sc.aperture, 1.4, 8) && inRange(sc.wire, 0.6, 2) &&
    inRange(p.mold.flange, 3, 15) && inRange(p.mold.clearance, CLEARANCE_RANGE[0], CLEARANCE_RANGE[1]) && inRange(s.textScale, 20, 200);
  const hasDesign = lines.length > 0 || !!s.logo;

  async function onImage(f: File) {
    setFileError(null);
    setCutWarn(null);
    setLoading(true);
    try {
      const r = await fileToCutSvg(f, { cutout: s.cutout });
      field("image")({ svg: r.svg, name: f.name });
      if (r.cutout?.uncertain) setCutWarn(r.cutout.warning ?? "Não tenho certeza do recorte do fundo: confira a silhueta.");
    } catch (e) {
      setFileError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  async function onLogo(f: File) {
    setFileError(null);
    try {
      const r = await fileToCutSvg(f, { cutout: false });
      field("logo")({ svg: r.svg, name: f.name });
    } catch (e) {
      setFileError(errorText(e));
    }
  }
  function applyPreset(pr: ThermoPreset) {
    tool.set((cur) => ({ ...cur, source: "shape", shape: pr.shape, sym: "keep", text: pr.text, font: pr.font, p: { ...cur.p, colors: { ...cur.p.colors, ...pr.colors } } }), "preset");
  }

  const { models, warnings, view, busy, error } = useModelBuilder<View>(async () => {
    if (!valid) return null;
    const M = await getManifold();
    const raw = await silhouetteOf(s);
    if (!raw) return null;
    const sil = symmetrize(M, raw, s.sym);
    raw.delete();
    let logo: Awaited<ReturnType<typeof designFromSvg>> | null = null;
    try {
      const diff = asymmetry(sil);
      const extra: string[] = [];
      let design: CS | null = null;
      if (hasDesign) {
        logo = s.logo ? await designFromSvg(s.logo.svg, 100, false) : null;
        const font = await loadFont(s.font);
        const emoji = lines.some(hasEmoji) ? await loadEmojiFont() : undefined;
        const area = scoped((k) => k(sil.offset(-(p.screen.border + DESIGN_MARGIN), "Round")).bounds());
        const box = { w: (area.max[0] - area.min[0]) * DESIGN_FILL, h: (area.max[1] - area.min[1]) * DESIGN_FILL };
        const art = buildStampArt(M, { shape: "rect", w: Math.max(10, box.w), h: Math.max(8, box.h), logo: logo?.cs ?? null, lines, font, emoji, layout: s.layout, textScale: s.textScale, frame: "none", lineW: DEFAULT_ART.lineW, arcTop: "", arcBottom: "", arcH: DEFAULT_ART.arcH, scale: 100, move: DEFAULT_ART.move });
        extra.push(...art.warnings);
        try {
          design = scoped((k) => shrinkToFit(art.art, k(sil.offset(-(p.screen.border + DESIGN_MARGIN), "Round"))));
        } finally {
          art.art.delete();
        }
      }
      try {
        const out = buildThermo(M, sil, design, p, { preview: show === "assembled" || show === "shell", press: show === "press" ? (frame === "play" ? "closed" : frame) : undefined, morph: show === "press" && frame === "play" });
        const warn = [...extra, ...out.warnings];
        if (diff > ASYMMETRY_WARN) warn.unshift(`A silhueta não é simétrica (${Math.round(diff * 100)}% diferente do espelho): o mesmo molde só serve para as duas metades se ela for. Use "Espelhar a esquerda" ou "Espelhar a direita".`);
        const bed = [out.screens, out.closure, out.molds].flatMap((g) => bedWarnings(g, warn));
        const table = layoutPlates(
          [
            { label: `Telas (aquecer e prensar)${out.info.bases === "none" ? "" : " e bases"} · PLA 0,20 mm`, models: out.screens },
            { label: `${out.closure.map((m) => m.name).join(" e ")} · PLA 0,16 mm`, models: out.closure },
            { label: "Moldes fêmea e macho · PETG 0,24 mm", models: out.molds },
          ],
          bedMm(),
        );
        return { models: table, warnings: [...warn, ...bed], view: { screens: out.screens, closure: out.closure, molds: out.molds, assembled: out.assembled, shell: out.shell, press: out.press, morph: out.morph, info: out.info, asym: diff } };
      } finally {
        design?.delete();
      }
    } finally {
      logo?.cs.delete();
      sil.delete();
    }
  }, [s, valid, hasDesign, show, frame]);

  const pieceEst = useMemo(
    () => (view ? [...view.screens.map((m) => [m, THERMO_SCREEN_PROFILE] as const), ...view.closure.map((m) => [m, THERMO_CLOSURE_PROFILE] as const), ...view.molds.map((m) => [m, THERMO_MOLD_PROFILE] as const)].map(([m, prof]) => ({ name: m.name, est: estimateModels([m], prof) })) : []),
    [view],
  );
  const info = view?.info;
  const asymPct = view ? Math.round(view.asym * 100) : 0;

  return (
    <div className="page">
      <h1>Caixinha termoformada</h1>
      <p className="lead">Tela de PLA em malha, prensada a quente num molde.</p>
      <SeeAlso items={[{ label: "Imagem em SVG", page: "svg" }, { label: "Carimbo seco", page: "stamp" }]} />
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Modelo pronto</h3>
            <div className="row wrap">
              {THERMO_PRESETS.map((pr) => (
                <button key={pr.id} type="button" title={pr.hint} onClick={() => applyPreset(pr)}>
                  {pr.label}
                </button>
              ))}
            </div>
            <span className="hint">Preenche formato, texto e cores; depois é só ajustar.</span>
          </div>
          <div className="card stack">
            <h3>Formato da caixinha</h3>
            <Segmented label="Origem da silhueta" value={s.source} options={SOURCES} onChange={field("source")} full />
            {s.source === "shape" && (
              <label>
                Formato
                <select value={s.shape} onChange={(e) => field("shape")(e.target.value as ThermoShape)}>
                  {SHAPE_LABELS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
            )}
            {s.source === "image" && (
              <>
                <Dropzone accept={DESIGN_ACCEPT} label={s.image ? s.image.name : "Silhueta: SVG ou imagem"} hint="Uma forma cheia e simples funciona melhor" onFile={onImage} />
                <label className="check">
                  <input type="checkbox" checked={s.cutout} onChange={(e) => field("cutout")(e.target.checked)} /> Recortar o fundo da foto
                </label>
                {loading && <Alert kind="info">Lendo a imagem…</Alert>}
                {cutWarn && <Alert kind="warn">{cutWarn}</Alert>}
              </>
            )}
            {s.source === "text" && (
              <>
                <LinesField label="Texto da silhueta (Enter para nova linha)" value={s.silText} onChange={field("silText")} maxLength={40} />
                <FontPicker value={s.silFont} onChange={field("silFont")} sample={splitLines(s.silText)[0] ?? ""} label="Fonte da silhueta" />
              </>
            )}
            {fileError && <Alert kind="error">{fileError}</Alert>}
            <NumField label="Largura" value={s.width} onChange={field("width")} min={40} max={140} step={1} hint="Largura da caixinha de presente pronta." />
            {s.source !== "shape" && (
              <>
                <span className="field-label">Simetria</span>
                <Segmented label="Simetria" value={s.sym} options={SYMS} onChange={field("sym")} full />
                <span className="hint">As duas metades usam o mesmo molde, então a silhueta precisa ser simétrica pelo eixo vertical.{view && s.sym === "keep" ? ` Agora ela difere ${asymPct}% do próprio espelho.` : ""}</span>
              </>
            )}
            <ThermoPrompt use="uma caixinha termoformada de presente" />
          </div>
          <div className="card stack">
            <h3>Desenho de cima</h3>
            <LinesField value={s.text} onChange={field("text")} maxLength={60} />
            <FontPicker value={s.font} onChange={field("font")} sample={lines[0] ?? ""} />
            <Dropzone accept={DESIGN_ACCEPT} label={s.logo ? s.logo.name : "Logo (opcional): SVG, PNG ou foto"} hint="Formas simples e grandes saem melhor" onFile={onLogo} />
            {s.logo && (
              <>
                <button type="button" className="link danger" onClick={() => field("logo")(null)}>Remover logo</button>
                <Segmented label="Posição do logo" value={s.layout} options={LAYOUTS} onChange={field("layout")} full />
                <NumField label="Tamanho do texto" unit="% do logo" value={s.textScale} onChange={field("textScale")} min={20} max={200} step={5} />
              </>
            )}
            <label className="check">
              <input type="checkbox" checked={p.designOnBoth} onChange={(e) => setP("designOnBoth")(e.target.checked)} /> Desenho nas duas metades
            </label>
            <label className="check">
              <input type="checkbox" checked={p.thickenDesign} onChange={(e) => setP("thickenDesign")(e.target.checked)} /> Engrossar traços finos demais para o bico
            </label>
            <label className="check">
              <input type="checkbox" checked={p.compensate} onChange={(e) => setP("compensate")(e.target.checked)} /> Compensar o esticamento (o desenho sai do tamanho certo depois de prensado)
            </label>
          </div>
          <div className="card stack">
            <h3>Tela de PLA</h3>
            <span className="field-label">Malha</span>
            <Segmented label="Malha" value={sc.mesh} options={MESHES} onChange={setScreen("mesh")} full />
            <div className="grid two">
              <NumField label="Abertura do furo" value={sc.aperture} onChange={setScreen("aperture")} min={1.4} max={8} step={0.1} />
              <NumField label="Espessura do fio" value={sc.wire} onChange={setScreen("wire")} min={0.6} max={2} step={0.1} hint="Pelo menos 2 filetes do bico" />
              <NumField label="Espessura da tela" value={sc.t} onChange={setScreen("t")} min={0.6} max={2} step={0.1} />
              <NumField label="Borda sólida" value={sc.border} onChange={setScreen("border")} min={2} max={8} step={0.5} />
            </div>
            <label>
              Fecho
              <select aria-label="Fecho" value={sc.closure} onChange={(e) => setScreen("closure")(e.target.value as Closure)}>
                {CLOSURES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <span className="hint">{CLOSURE_HINTS[sc.closure]}</span>
            {SIDE_LABELS[sc.closure] && (
              <>
                <span className="field-label">{SIDE_LABELS[sc.closure]}</span>
                <Segmented label="Posição do fecho" value={sc.side} options={SIDES} onChange={setScreen("side")} full />
              </>
            )}
            <span className="field-label">Placas de base</span>
            <Segmented label="Placas de base" value={sc.closure === "cap" ? "both" : sc.closure === "hinge" ? "none" : p.bases} options={BASES} onChange={(v: BaseMode) => setP("bases")(v)} full />
            <span className="hint">Sem base, as cascas encostam borda com borda e fica oco por dentro, para balas e enfeites. A base fecha o fundo de cada casca: nas duas metades vira um enfeite fechado; numa só, uma caixinha com tampa de malha. A dobradiça dispensa a base; a tampa rosqueada precisa das duas.</span>
            <label className="check">
              <input type="checkbox" checked={p.baseArt} onChange={(e) => setP("baseArt")(e.target.checked)} /> Desenho também na base, visto através da malha
            </label>
            <div className="row">
              <ColorPick label="Cor da malha" value={p.colors.sheet} onChange={setColor("sheet")} />
              <ColorPick label="Cor da borda" value={p.colors.border} onChange={setColor("border")} />
              <ColorPick label="Cor do desenho" value={p.colors.design} onChange={setColor("design")} />
              <ColorPick label="Cor da base" value={p.colors.base} onChange={setColor("base")} />
              <ColorPick label="Cor do clipe/tampa/faixa" value={p.colors.clip} onChange={setColor("clip")} />
            </div>
          </div>
          <div className="card stack">
            <h3>Moldes de PETG (macho e fêmea)</h3>
            <div className="grid two">
              <NumField label="Altura do domo" value={p.domeH} onChange={setP("domeH")} min={6} max={40} step={1} />
              <NumField label="Curvatura" unit="" value={p.curve} onChange={setP("curve")} min={1.6} max={4} step={0.1} hint="2 = redondo; mais = topo mais reto" />
              <NumField label="Folga do molde" value={p.mold.clearance} onChange={setMold("clearance")} min={CLEARANCE_RANGE[0]} max={CLEARANCE_RANGE[1]} step={0.05} hint="Folga entre macho e fêmea = espessura da tela + esta folga" />
            </div>
            <label className="check">
              <input type="checkbox" checked={p.mold.hollow} onChange={(e) => setMold("hollow")(e.target.checked)} /> Molde oco com nervuras (metade do peso do maciço)
            </label>
            <details className="advanced">
              <summary>Opções avançadas</summary>
              <div className="grid two">
                <NumField label="Borda de apoio" value={p.mold.flange} onChange={setMold("flange")} min={3} max={15} step={1} />
                <NumField label="Espessura do apoio" value={p.mold.flangeT} onChange={setMold("flangeT")} min={1} max={5} step={0.5} />
                <NumField label="Parede de centralização" value={p.mold.centerWall} onChange={setMold("centerWall")} min={0} max={3} step={0.2} hint="Cerca a tela no macho; 0 desliga" />
                <ColorPick label="Cor do molde" value={p.colors.mold} onChange={setColor("mold")} />
              </div>
            </details>
          </div>
          <div className="card stack">
            <h3>Telas, bases e faixa (PLA, 0,20 mm)</h3>
            <ExportButtons models={view?.screens ?? []} name={`caixinha-telas-${lines[0] ?? "termoformada"}`} busy={busy} profile={THERMO_SCREEN_PROFILE} onSaved={tool.exported} />
          </div>
          {(view?.closure.length ?? 0) > 0 && (
            <div className="card stack">
              <h3>{CLOSURES.find(([v]) => v === sc.closure)?.[1]} (PLA, 0,16 mm)</h3>
              <ExportButtons models={view?.closure ?? []} name={`caixinha-fecho-${lines[0] ?? "termoformada"}`} busy={busy} profile={THERMO_CLOSURE_PROFILE} onSaved={tool.exported} />
            </div>
          )}
          <div className="card stack">
            <h3>Moldes macho e fêmea (PETG, 0,24 mm)</h3>
            <ExportButtons models={view?.molds ?? []} name={`caixinha-molde-${s.source === "shape" ? s.shape : "silhueta"}`} busy={busy} profile={THERMO_MOLD_PROFILE} onSaved={tool.exported} tips={TOOL_HELP.thermoform.tips} />
          </div>
          <GeneratorHelp help={TOOL_HELP.thermoform} />
        </div>
        <div className="preview-col">
          <Segmented label="O que mostrar" value={show} options={SHOWS} onChange={setShow} full />
          {show === "press" && (
            <>
              <Segmented label="Quadro" value={frame} options={PRESS_VIEWS} onChange={setFrame} full />
              <Alert kind="info">
                {frame === "section"
                  ? "Corte ao meio: o macho dentro da fêmea, com a tela no meio e a folga em volta (a espessura da tela mais a folga do molde). Vire a câmera em Frente."
                  : "São dois moldes que se encaixam e a tela do meio é a que esquenta: 1 fêmea embaixo, 2 tela plana, 3 macho em cima, que desce e prensa. Não vai para o arquivo."}
              </Alert>
            </>
          )}
          {(show === "assembled" || show === "shell") && <Alert kind="info">{show === "assembled" ? "Prévia da caixinha já prensada, com a tela curvada sobre o domo. Ela não vai para o arquivo: o que imprime está em Mesa." : "Uma casca já prensada, de perto: a malha curvada sobre o domo, com o desenho e a base. Ela não vai para o arquivo."}</Alert>}
          {show === "press" && frame === "play" && view?.morph ? (
            <PressPlayer morph={view.morph} busy={busy || loading} busyText="Gerando telas e molde…" error={error} views emptyText={!valid ? "Corrija os campos em vermelho para ver a caixinha." : s.source === "image" && !s.image ? "Envie a silhueta (SVG ou imagem) para ver a caixinha." : "Escolha um formato para ver a caixinha."} />
          ) : (
            <Preview3D models={show === "assembled" && view ? [view.assembled] : show === "shell" && view ? [view.shell] : show === "press" && view ? [view.press] : models} busy={busy || loading} busyText="Gerando telas e molde…" error={error} views emptyText={!valid ? "Corrija os campos em vermelho para ver a caixinha." : s.source === "image" && !s.image ? "Envie a silhueta (SVG ou imagem) para ver a caixinha." : "Escolha um formato para ver a caixinha."} />
          )}
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
          {info && (
            <section className="card stack" aria-label="Resumo da termoformagem">
              <h3>Quanto a tela estica</h3>
              <p>
                A tela estica cerca de <strong>{fmt(info.stretch)}×</strong> ao cobrir o domo. O furo de {fmt(sc.aperture, 1)} mm vira uns <strong>{fmt(info.apertureAfter, 1)} mm</strong> no topo.
                {p.compensate && info.designScale < 0.995 ? ` O desenho da tela plana foi encolhido para ${Math.round(info.designScale * 100)}% e sai do tamanho pedido depois de prensado.` : ""}
              </p>
              <p>
                Folga do molde fêmea: <strong>{fmt(info.moldGap)} mm</strong> (tela de {fmt(sc.t, 1)} mm + {fmt(p.mold.clearance)} mm). Depois de esticada, a tela fica com uns <strong>{fmt(info.thinTop)} mm</strong> no topo.
              </p>
              <h3>Peso e tempo de cada peça</h3>
              <ul className="plain">
                {pieceEst.map((x) => (
                  <li key={x.name}>{x.name}{x.name.startsWith("Molde") ? " (PETG)" : ""}: {x.est ? `≈ ${g(x.est.grams)} · ≈ ${formatDuration(x.est.seconds / 60)}` : "—"}</li>
                ))}
              </ul>
            </section>
          )}
          <ThermoSteps kind="box" pair closure={sc.closure} bases={(info?.bases ?? p.bases) !== "none"} />
        </div>
      </div>
    </div>
  );
}
