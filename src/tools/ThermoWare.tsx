import { useMemo, useState } from "react";
import { estimateModels } from "../domain/estimate";
import { loadEmojiFont, loadFont, type FontId } from "../geometry/fonts";
import { getManifold, type CS } from "../geometry/manifold";
import { THERMO_WARE_MOLD_PROFILE, THERMO_WARE_PROFILE } from "../geometry/printProfile";
import { buildStampArt, DEFAULT_ART } from "../geometry/stampArt";
import { BAND_LIMITS, buildBand, DEFAULT_BAND, stripLength, type BandInfo, type BandParams } from "../geometry/thermo/band";
import { bedMm } from "../geometry/bed";
import { layoutPlates } from "../geometry/thermo/layout";
import { PRESS_FRAMES, type PressFrame } from "../geometry/thermo/press";
import { BASKET_VESSEL, buildVessel, DEFAULT_VESSEL, type VesselInfo, type VesselMold, type VesselParams } from "../geometry/thermo/vessel";
import { hasEmoji } from "../geometry/text";
import { splitLines } from "../geometry/keychain";
import type { Model } from "../geometry/types";
import Alert from "../ui/Alert";
import ExportButtons from "../ui/ExportButtons";
import FontPicker from "../ui/FontPicker";
import LinesField from "../ui/LinesField";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import SeeAlso from "../ui/SeeAlso";
import { formatDuration } from "../ui/parse";
import { useModelBuilder } from "../ui/useModelBuilder";
import ColorPick from "./ColorPick";
import GeneratorHelp from "./models/guide/GeneratorHelp";
import { bedWarnings } from "./models/bedCheck";
import { TOOL_HELP } from "./models/help/toolHelp";
import ThermoSteps from "./ThermoSteps";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

type Kind = "pote" | "cesto" | "pulseira";
const KINDS = [["pote", "Pote"], ["cesto", "Cesto"], ["pulseira", "Pulseira"]] as const;
const MOLDS = [["male", "Só o macho"], ["female", "Só a fêmea"], ["both", "O par (prensa)"]] as const;
const MESHES = [["honeycomb", "Favo"], ["diamond", "Losango"]] as const;
const BAND_MESHES = [["solid", "Inteira"], ["honeycomb", "Favo"], ["diamond", "Losango"]] as const;
const SHOWS = [["table", "Mesa (o que imprime)"], ["ready", "Pronto (não imprime)"]] as const;
const SHOWS_PAIR = [["table", "Mesa (o que imprime)"], ["press", "Como prensar (não imprime)"], ["ready", "Pronto (não imprime)"]] as const;
type Show = (typeof SHOWS_PAIR)[number][0];
const TEXT_FILL = 0.7; // quanto do comprimento da tira o texto ocupa

type State = { kind: Kind; v: VesselParams; b: BandParams; text: string; font: FontId };

const initial = (): State => ({
  kind: "pote",
  v: { ...DEFAULT_VESSEL, colors: { ...DEFAULT_VESSEL.colors } },
  b: { ...DEFAULT_BAND, colors: { ...DEFAULT_BAND.colors } },
  text: "Amor",
  font: "pacifico",
});

type Shared = { screens: Model[]; molds: Model[]; ready: Model; press: Model };
/** A vista guarda de que peça veio: ao trocar de peça a anterior ainda fica na tela até a nova ficar pronta. */
type View = (Shared & { kind: "vessel"; info: VesselInfo }) | (Shared & { kind: "band"; info: BandInfo });
const g = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} g`;
const fmt = (n: number, d = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Pote, cesto e pulseira termoformados: forma positiva (macho) e negativa (fêmea) genéricas, com o disco ou a tira de PLA. */
export default function ThermoWare() {
  const tool = useToolState<State>("thermoware", initial, { label: "Pote, cesto ou pulseira termoformados", version: 1 });
  const s = tool.state;
  const field = tool.field;
  const setV = <K extends keyof VesselParams>(key: K) => (val: VesselParams[K]) => tool.set((cur) => ({ ...cur, v: { ...cur.v, [key]: val } }), `v.${String(key)}`);
  const setB = <K extends keyof BandParams>(key: K) => (val: BandParams[K]) => tool.set((cur) => ({ ...cur, b: { ...cur.b, [key]: val } }), `b.${String(key)}`);
  const setKind = (kind: Kind) =>
    tool.set((cur) => ({ ...cur, kind, v: kind === "cesto" ? { ...cur.v, ...BASKET_VESSEL, kind: "cesto" } : kind === "pote" ? { ...cur.v, kind: "pote" } : cur.v }), "kind");
  const [show, setShow] = useState<Show>("table");
  const [frame, setFrame] = useState<PressFrame>("open");
  const { v, b } = s;
  const vessel = s.kind !== "pulseira";
  const pair = vessel && s.v.mold === "both";
  const lines = splitLines(s.text);

  const valid = vessel
    ? inRange(v.mouthD, 50, 200) && inRange(v.height, 20, 150) && inRange(v.draft, 3, 20) && inRange(v.cornerR, 0, 40) && inRange(v.t, 0.8, 2) && inRange(v.rim, 3, 12) && inRange(v.margin, 2, 20) && inRange(v.aperture, 1.6, 10) && inRange(v.wire, 0.8, 3) && inRange(v.flange, 4, 15)
    : inRange(b.wrist, BAND_LIMITS.wrist[0], BAND_LIMITS.wrist[1]) && inRange(b.width, BAND_LIMITS.width[0], BAND_LIMITS.width[1]) && inRange(b.t, BAND_LIMITS.t[0], BAND_LIMITS.t[1]) && inRange(b.opening, BAND_LIMITS.opening[0], BAND_LIMITS.opening[1]) && inRange(b.border, 1.6, 6) && inRange(b.aperture, 1.6, 8) && inRange(b.wire, 0.8, 3) && inRange(b.mandrelEase, 0, 10);

  const { models, warnings, view, busy, error } = useModelBuilder<View>(async () => {
    if (!valid) return null;
    const M = await getManifold();
    if (vessel) {
      const out = buildVessel(M, { ...v, kind: s.kind === "cesto" ? "cesto" : "pote" }, { preview: show === "ready", press: show === "press" ? frame : undefined });
      const bed = [out.screens, out.molds].flatMap((grp) => bedWarnings(grp, out.warnings));
      return { models: layoutPlates([{ label: "Tela (aquecer e prensar) · PLA 0,20 mm", models: out.screens }, { label: "Moldes · PETG 0,24 mm", models: out.molds }], bedMm()), warnings: [...out.warnings, ...bed], view: { kind: "vessel", screens: out.screens, molds: out.molds, ready: out.assembled, press: out.press, info: out.info } };
    }
    let design: CS | null = null;
    if (lines.length) {
      const font = await loadFont(s.font);
      const emoji = lines.some(hasEmoji) ? await loadEmojiFont() : undefined;
      const len = stripLength(b);
      const art = buildStampArt(M, { shape: "rect", w: Math.max(10, len * TEXT_FILL), h: Math.max(6, b.width - 2 * (b.border + 2)), logo: null, lines, font, emoji, layout: "stack", textScale: 55, frame: "none", lineW: DEFAULT_ART.lineW, arcTop: "", arcBottom: "", arcH: DEFAULT_ART.arcH, scale: 100, move: DEFAULT_ART.move });
      design = art.art;
    }
    try {
      const out = buildBand(M, b, design, { preview: show === "ready" });
      const bed = [out.strip, out.mandrel].flatMap((grp) => bedWarnings(grp, out.warnings));
      return { models: layoutPlates([{ label: "Tira (aquecer e enrolar) · PLA 0,20 mm", models: out.strip }, { label: "Mandril · PETG 0,24 mm", models: out.mandrel }], bedMm()), warnings: [...out.warnings, ...bed], view: { kind: "band", screens: out.strip, molds: out.mandrel, ready: out.assembled, press: { name: "", previewOnly: true, parts: [] }, info: out.info } };
    } finally {
      design?.delete();
    }
  }, [s, valid, show, frame]);

  const est = useMemo(() => (view ? [...view.screens.map((m) => [m, THERMO_WARE_PROFILE] as const), ...view.molds.map((m) => [m, THERMO_WARE_MOLD_PROFILE] as const)].map(([m, prof]) => ({ name: m.name, est: estimateModels([m], prof) })) : []), [view]);
  const baseName = s.kind === "pulseira" ? "pulseira" : s.kind;
  const vInfo = view?.kind === "vessel" ? view.info : undefined;
  const bInfo = view?.kind === "band" ? view.info : undefined;

  return (
    <div className="page">
      <h1>Pote, cesto e pulseira termoformados</h1>
      <p className="lead">Disco ou tira de PLA formados a quente num molde de PETG.</p>
      <SeeAlso items={[{ label: "Caixinha termoformada", page: "thermoform" }]} />
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>O que fazer</h3>
            <Segmented label="Peça" value={s.kind} options={KINDS} onChange={setKind} full />
            {s.kind === "pote" && <span className="hint">Pote de PLA inteiro, em pé, com a boca para cima e uma aba plana em volta.</span>}
            {s.kind === "cesto" && <span className="hint">Igual ao pote, mas a parede é uma malha (favo ou losango), com a boca sólida para dar rigidez.</span>}
            {s.kind === "pulseira" && <span className="hint">Uma tira plana que se enrola num mandril com o diâmetro interno que você escolher (uns 60 a 65 mm para passar a mão) e fica em C: a abertura deixa abrir e fechar.</span>}
          </div>

          {vessel && (
            <>
              <div className="card stack">
                <h3>Forma</h3>
                <div className="grid two">
                  <NumField label="Diâmetro da boca" value={v.mouthD} onChange={setV("mouthD")} min={50} max={200} step={1} hint="Por dentro, na altura da borda" />
                  <NumField label="Altura" value={v.height} onChange={setV("height")} min={20} max={150} step={1} />
                  <NumField label="Ângulo de saída" unit="°" value={v.draft} onChange={setV("draft")} min={3} max={20} step={0.5} hint="5° ou mais para tirar fácil do molde" />
                  <NumField label="Raio do canto do fundo" value={v.cornerR} onChange={setV("cornerR")} min={0} max={40} step={1} hint="Canto vivo rasga a tela" />
                </div>
              </div>
              <div className="card stack">
                <h3>{s.kind === "cesto" ? "Disco em malha (PLA)" : "Disco (PLA)"}</h3>
                <div className="grid two">
                  <NumField label="Espessura" value={v.t} onChange={setV("t")} min={0.8} max={2} step={0.1} />
                  <NumField label="Borda sólida na boca" value={v.rim} onChange={setV("rim")} min={3} max={12} step={0.5} hint="Dá rigidez à boca; fica na aba plana" />
                  <NumField label="Sobra do disco" value={v.margin} onChange={setV("margin")} min={2} max={20} step={1} hint="Além da conta da planificação" />
                </div>
                {s.kind === "cesto" && (
                  <>
                    <span className="field-label">Malha</span>
                    <Segmented label="Malha" value={v.mesh} options={MESHES} onChange={setV("mesh")} full />
                    <div className="grid two">
                      <NumField label="Abertura do furo" value={v.aperture} onChange={setV("aperture")} min={1.6} max={10} step={0.1} />
                      <NumField label="Espessura do fio" value={v.wire} onChange={setV("wire")} min={0.8} max={3} step={0.1} />
                    </div>
                    <label className="check">
                      <input type="checkbox" checked={v.solidBase} onChange={(e) => setV("solidBase")(e.target.checked)} /> Fundo sólido (não deixa cair coisa pequena)
                    </label>
                  </>
                )}
                <div className="row">
                  <ColorPick label="Cor do disco" value={v.colors.sheet} onChange={(c) => tool.set((cur) => ({ ...cur, v: { ...cur.v, colors: { ...cur.v.colors, sheet: c, border: c, base: c } } }), "v.color")} />
                </div>
              </div>
              <div className="card stack">
                <h3>Moldes de PETG</h3>
                <Segmented label="Molde" value={v.mold} options={MOLDS} onChange={(m: VesselMold) => setV("mold")(m)} full />
                <span className="hint">
                  {v.mold === "male" && "Forma positiva: o disco quente é empurrado por cima do macho. É o mais simples."}
                  {v.mold === "female" && "Forma negativa: o disco quente é empurrado para dentro da cavidade, como numa tigela."}
                  {v.mold === "both" && "O par prensa o disco: a fêmea tem folga de espessura do disco + folga em volta do macho."}
                </span>
                <details className="advanced">
                  <summary>Opções avançadas</summary>
                  <div className="grid two">
                    <NumField label="Apoio em volta" value={v.flange} onChange={setV("flange")} min={4} max={15} step={1} />
                    <NumField label="Folga do par" value={v.clearance} onChange={setV("clearance")} min={0.2} max={0.4} step={0.05} hint="Somada à espessura do disco" />
                    <ColorPick label="Cor do molde" value={v.colors.mold} onChange={(c) => tool.set((cur) => ({ ...cur, v: { ...cur.v, colors: { ...cur.v.colors, mold: c } } }), "v.mold.color")} />
                  </div>
                </details>
              </div>
            </>
          )}

          {!vessel && (
            <>
              <div className="card stack">
                <h3>Medidas</h3>
                <div className="grid two">
                  <NumField label="Circunferência interna" value={b.wrist} onChange={setB("wrist")} min={BAND_LIMITS.wrist[0]} max={BAND_LIMITS.wrist[1]} step={1} hint="Em volta da parte mais larga da mão (uns 190 a 220 mm), para a pulseira abrir e passar" />
                  <NumField label="Largura" value={b.width} onChange={setB("width")} min={BAND_LIMITS.width[0]} max={BAND_LIMITS.width[1]} step={1} />
                  <NumField label="Espessura" value={b.t} onChange={setB("t")} min={BAND_LIMITS.t[0]} max={BAND_LIMITS.t[1]} step={0.1} hint="1 a 1,5 mm dobra bem" />
                  <NumField label="Abertura do C" value={b.opening} onChange={setB("opening")} min={BAND_LIMITS.opening[0]} max={BAND_LIMITS.opening[1]} step={1} hint="Negativa = as pontas se sobrepõem" />
                </div>
                {bInfo && !vessel && (
                  <span className="hint">
                    Tira de {fmt(bInfo.length, 0)} mm; mandril de {fmt(bInfo.mandrelD)} mm de diâmetro e {fmt(bInfo.mandrelH, 0)} mm de altura.
                  </span>
                )}
              </div>
              <div className="card stack">
                <h3>Tira de PLA</h3>
                <Segmented label="Tira" value={b.mesh} options={BAND_MESHES} onChange={setB("mesh")} full />
                {b.mesh !== "solid" && (
                  <div className="grid two">
                    <NumField label="Abertura do furo" value={b.aperture} onChange={setB("aperture")} min={1.6} max={8} step={0.1} />
                    <NumField label="Espessura do fio" value={b.wire} onChange={setB("wire")} min={0.8} max={3} step={0.1} />
                  </div>
                )}
                <NumField label="Borda sólida" value={b.border} onChange={setB("border")} min={1.6} max={6} step={0.2} />
                <LinesField label="Texto (opcional)" value={s.text} onChange={field("text")} maxLength={40} />
                <FontPicker value={s.font} onChange={field("font")} sample={lines[0] ?? ""} />
                <div className="row">
                  <ColorPick label="Cor da tira" value={b.colors.strip} onChange={(c) => tool.set((cur) => ({ ...cur, b: { ...cur.b, colors: { ...cur.b.colors, strip: c, border: c } } }), "b.color")} />
                  <ColorPick label="Cor do texto" value={b.colors.design} onChange={(c) => tool.set((cur) => ({ ...cur, b: { ...cur.b, colors: { ...cur.b.colors, design: c } } }), "b.design.color")} />
                </div>
                <details className="advanced">
                  <summary>Opções avançadas</summary>
                  <NumField label="Folga do mandril" value={b.mandrelEase} onChange={setB("mandrelEase")} min={0} max={10} step={0.5} hint="Aumenta a circunferência do mandril; a pulseira encolhe um pouco ao esfriar" />
                </details>
              </div>
            </>
          )}

          <div className="card stack">
            <h3>{s.kind === "pulseira" ? "Tira (PLA, 0,20 mm)" : "Disco (PLA, 0,20 mm)"}</h3>
            <ExportButtons models={view?.screens ?? []} name={`${baseName}-termoformado`} busy={busy} profile={THERMO_WARE_PROFILE} onSaved={tool.exported} />
          </div>
          <div className="card stack">
            <h3>{s.kind === "pulseira" ? "Mandril (PETG, 0,24 mm)" : "Moldes (PETG, 0,24 mm)"}</h3>
            <ExportButtons models={view?.molds ?? []} name={`${baseName}-molde`} busy={busy} profile={THERMO_WARE_MOLD_PROFILE} onSaved={tool.exported} tips={TOOL_HELP.thermoware.tips} />
          </div>
          <GeneratorHelp help={TOOL_HELP.thermoware} />
        </div>
        <div className="preview-col">
          <Segmented label="O que mostrar" value={pair || show !== "press" ? show : "table"} options={pair ? SHOWS_PAIR : SHOWS} onChange={setShow} full />
          {pair && show === "press" && (
            <>
              <Segmented label="Quadro" value={frame} options={PRESS_FRAMES} onChange={setFrame} full />
              <Alert kind="info">{frame === "section" ? "Corte ao meio: o macho dentro da fêmea, com o disco no meio e a folga em volta. Vire a câmera em Frente." : "São dois moldes que se encaixam e o disco do meio é o que esquenta: 1 fêmea embaixo, 2 disco plano, 3 macho em cima, que desce e prensa. Não vai para o arquivo."}</Alert>
            </>
          )}
          {show === "ready" && <Alert kind="info">{s.kind === "pulseira" ? "A pulseira já enrolada no mandril, de frente. Ela não vai para o arquivo: o que imprime está em Mesa." : `${s.kind === "cesto" ? "O cesto" : "O pote"} já formado, de pé. Ele não vai para o arquivo: o que imprime está em Mesa.`}</Alert>}
          <Preview3D models={show === "ready" && view ? [view.ready] : pair && show === "press" && view ? [view.press] : models} busy={busy} busyText="Gerando peças e molde…" error={error} views emptyText={!valid ? "Corrija os campos em vermelho para ver a peça." : "Ajuste as medidas para ver a peça."} />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
          {view && (
            <section className="card stack" aria-label="Resumo da termoformagem">
              <h3>Medidas e conta</h3>
              {vInfo && (
                <p>
                  Disco plano de <strong>{fmt(vInfo.discD, 0)} mm</strong> de diâmetro: o perfil do fundo à boca tem {fmt(vInfo.profileLen, 0)} mm, mais a aba de {fmt(vInfo.lip, 0)} mm. O pote pronto tem uns <strong>{fmt(vInfo.potH, 0)} mm</strong> de altura e o fundo plano, {fmt(vInfo.flatTop, 0)} mm. A fórmula é aproximada: a tela afina ao esticar, então teste com uma sobra.
                </p>
              )}
              {bInfo && (
                <p>
                  Tira plana de <strong>{fmt(bInfo.length, 0)} mm</strong> (circunferência {fmt(b.wrist, 0)} mm {b.opening >= 0 ? "menos" : "mais"} {fmt(Math.abs(b.opening), 0)} mm de {b.opening >= 0 ? "abertura" : "sobreposição"}), que dá {fmt(bInfo.sweep, 0)}° no mandril de {fmt(bInfo.mandrelD)} mm.
                </p>
              )}
              <h3>Peso e tempo de cada peça</h3>
              <ul className="plain">
                {est.map((x) => (
                  <li key={x.name}>{x.name}: {x.est ? `≈ ${g(x.est.grams)} · ≈ ${formatDuration(x.est.seconds / 60)}` : "—"}</li>
                ))}
              </ul>
            </section>
          )}
          <ThermoSteps kind={vessel ? "vessel" : "band"} pair={pair} />
        </div>
      </div>
    </div>
  );
}
