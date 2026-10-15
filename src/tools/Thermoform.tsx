import { useEffect, useMemo, useState } from "react";
import { estimateModels } from "../domain/estimate";
import { bedMm } from "../geometry/bed";
import { loadEmojiFont, loadFont, type FontId } from "../geometry/fonts";
import { getManifold, type CS } from "../geometry/manifold";
import { THERMO_MOLD_PROFILE, THERMO_SCREEN_PROFILE } from "../geometry/printProfile";
import { scoped, shrinkToFit } from "../geometry/shape2d";
import { buildStampArt, DEFAULT_ART, type StampLayout } from "../geometry/stampArt";
import { buildThermo, DEFAULT_THERMO, type ThermoInfo, type ThermoParams } from "../geometry/thermo/build";
import { ASYMMETRY_WARN, asymmetry, presetSilhouette, SHAPE_LABELS, silhouetteFromDesign, symmetrize, type SymSide, type ThermoShape } from "../geometry/thermo/shapes";
import { hasEmoji, textToCrossSection } from "../geometry/text";
import { stackLines } from "../geometry/keychain";
import type { Model } from "../geometry/types";
import FontPicker from "../ui/FontPicker";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
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
import { useToolState } from "./useToolState";

type Source = "shape" | "image" | "text";
const SOURCES = [["shape", "Formato pronto"], ["image", "Imagem ou SVG"], ["text", "Texto"]] as const;
const MESHES = [["honeycomb", "Favo"], ["diamond", "Losango"]] as const;
const CLOSURES = [["clip", "Clipe"], ["ring", "Faixa colada"], ["none", "Sem fecho"]] as const;
const SIDES = [["top", "Em cima"], ["bottom", "Embaixo"]] as const;
const LAYOUTS = [["stack", "Logo em cima"], ["side", "Logo ao lado"]] as const;
const SYMS = [["keep", "Como está"], ["left", "Espelhar a esquerda"], ["right", "Espelhar a direita"]] as const;
const LINE_BREAK = /\n|\|/;
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

const initial = (): State => ({ source: "shape", shape: "heart", width: 70, sym: "keep", image: null, cutout: true, silText: "Ana", silFont: "pacifico", text: "Feliz|Natal", font: "great-vibes", logo: peekHandoff(), layout: "stack", textScale: 55, p: { ...DEFAULT_THERMO, colors: { ...DEFAULT_THERMO.colors } } });

type View = { screens: Model[]; mold: Model; info: ThermoInfo; asym: number };
const shiftModel = (m: Model, dx: number, dy: number): Model => ({ ...m, parts: m.parts.map((q) => ({ ...q, mesh: { ...q.mesh, positions: q.mesh.positions.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v)) } })) });

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
  const lines = s.silText.split(LINE_BREAK).map((l) => l.trim()).filter(Boolean);
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
  const tool = useToolState<State>("thermoform", initial, { label: "Caixinha termoformada" });
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
  useEffect(clearHandoff, []);

  const lines = s.text.split(LINE_BREAK).map((l) => l.trim()).filter(Boolean);
  const sc = p.screen;
  const valid =
    inRange(s.width, 40, 140) && inRange(p.domeH, 6, 40) && inRange(p.curve, 1.6, 4) && inRange(sc.t, 0.6, 2) && inRange(sc.border, 2, 8) && inRange(sc.aperture, 2, 8) && inRange(sc.wire, 0.6, 2) &&
    inRange(p.mold.flange, 3, 15) && inRange(s.textScale, 20, 200);
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
        const out = buildThermo(M, sil, design, p);
        const warn = [...extra, ...out.warnings];
        if (diff > ASYMMETRY_WARN) warn.unshift(`A silhueta não é simétrica (${Math.round(diff * 100)}% diferente do espelho): o mesmo molde só serve para as duas metades se ela for. Use "Espelhar a esquerda" ou "Espelhar a direita".`);
        const bed = [...bedWarnings(out.screens, warn), ...bedWarnings([out.mold], warn)];
        const spread = out.screens.length ? Math.max(...out.screens.map((m) => Math.max(...m.parts.flatMap((q) => [...q.mesh.positions].filter((_, i) => i % 3 === 0).map(Math.abs))))) : 0;
        if (spread * 2 > bedMm()) warn.push("As duas telas lado a lado passam da largura da mesa: imprima uma de cada vez ou diminua o formato.");
        const moldOffset = (out.screens.length ? spread : 0) + 70 + p.mold.flange;
        const preview = [...out.screens, out.assembled, shiftModel(out.mold, moldOffset, 0)];
        return { models: preview, warnings: [...warn, ...bed], view: { screens: out.screens, mold: out.mold, info: out.info, asym: diff } };
      } finally {
        design?.delete();
      }
    } finally {
      logo?.cs.delete();
      sil.delete();
    }
  }, [s, valid, hasDesign]);

  const screenEst = useMemo(() => (view ? view.screens.map((m) => ({ name: m.name, est: estimateModels([m], THERMO_SCREEN_PROFILE) })) : []), [view]);
  const moldEst = useMemo(() => (view ? estimateModels([view.mold], THERMO_MOLD_PROFILE) : null), [view]);
  const info = view?.info;
  const asymPct = view ? Math.round(view.asym * 100) : 0;

  return (
    <div className="page">
      <h1>Caixinha termoformada</h1>
      <p className="lead">Tela de PLA em malha, prensada a quente num molde.</p>
      <SeeAlso items={[{ label: "Imagem em desenho (SVG)", page: "svg" }, { label: "Carimbo seco", page: "stamp" }]} />
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
                <label>
                  Texto da silhueta (uma linha por linha)
                  <textarea value={s.silText} rows={2} maxLength={40} onChange={(e) => field("silText")(e.target.value)} />
                </label>
                <FontPicker value={s.silFont} onChange={field("silFont")} sample={s.silText.split(LINE_BREAK)[0] ?? ""} label="Fonte da silhueta" />
              </>
            )}
            {fileError && <Alert kind="error">{fileError}</Alert>}
            <NumField label="Largura" value={s.width} onChange={field("width")} min={40} max={140} step={1} />
            {s.source !== "shape" && (
              <>
                <span className="field-label">Simetria</span>
                <Segmented label="Simetria" value={s.sym} options={SYMS} onChange={field("sym")} full />
                <span className="hint">As duas metades usam o mesmo molde, então a silhueta precisa ser simétrica pelo eixo vertical.{view && s.sym === "keep" ? ` Agora ela difere ${asymPct}% do próprio espelho.` : ""}</span>
              </>
            )}
          </div>
          <div className="card stack">
            <h3>Desenho de cima</h3>
            <label>
              Texto (uma linha por linha)
              <textarea value={s.text} rows={2} maxLength={60} onChange={(e) => field("text")(e.target.value)} />
            </label>
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
              <NumField label="Abertura do furo" value={sc.aperture} onChange={setScreen("aperture")} min={2} max={8} step={0.5} />
              <NumField label="Espessura do fio" value={sc.wire} onChange={setScreen("wire")} min={0.6} max={2} step={0.1} hint="Pelo menos 2 filetes do bico" />
              <NumField label="Espessura da tela" value={sc.t} onChange={setScreen("t")} min={0.6} max={2} step={0.1} />
              <NumField label="Borda sólida" value={sc.border} onChange={setScreen("border")} min={2} max={8} step={0.5} />
            </div>
            <span className="field-label">Fecho</span>
            <Segmented label="Fecho" value={sc.closure} options={CLOSURES} onChange={setScreen("closure")} full />
            {sc.closure === "clip" && (
              <>
                <span className="field-label">Onde fica a dobradiça</span>
                <Segmented label="Posição do fecho" value={sc.side} options={SIDES} onChange={setScreen("side")} full />
                <span className="hint">O clipe passa pelo furo da orelha das duas telas e funciona como dobradiça. Fica no eixo de simetria para as duas metades se encontrarem.</span>
              </>
            )}
            {sc.closure === "ring" && <span className="hint">Uma faixa em pé em volta da emenda, para colar por fora das duas metades.</span>}
            <div className="row">
              <ColorPick label="Cor da malha" value={p.colors.sheet} onChange={setColor("sheet")} />
              <ColorPick label="Cor da borda" value={p.colors.border} onChange={setColor("border")} />
              <ColorPick label="Cor do desenho" value={p.colors.design} onChange={setColor("design")} />
              <ColorPick label="Cor do clipe/faixa" value={p.colors.clip} onChange={setColor("clip")} />
            </div>
          </div>
          <div className="card stack">
            <h3>Molde de PETG</h3>
            <div className="grid two">
              <NumField label="Altura do domo" value={p.domeH} onChange={setP("domeH")} min={6} max={40} step={1} />
              <NumField label="Curvatura" unit="" value={p.curve} onChange={setP("curve")} min={1.6} max={4} step={0.1} hint="2 = redondo; mais = topo mais reto" />
            </div>
            <label className="check">
              <input type="checkbox" checked={p.mold.hollow} onChange={(e) => setMold("hollow")(e.target.checked)} /> Molde oco com nervuras (metade do peso do maciço)
            </label>
            <details className="advanced">
              <summary>Opções avançadas</summary>
              <div className="grid two">
                <NumField label="Borda de apoio" value={p.mold.flange} onChange={setMold("flange")} min={3} max={15} step={1} />
                <NumField label="Espessura do apoio" value={p.mold.flangeT} onChange={setMold("flangeT")} min={1} max={5} step={0.5} />
                <ColorPick label="Cor do molde" value={p.colors.mold} onChange={setColor("mold")} />
              </div>
            </details>
          </div>
          <div className="card stack">
            <h3>Telas e clipe (PLA)</h3>
            <ExportButtons models={view?.screens ?? []} name={`caixinha-telas-${lines[0] ?? "termoformada"}`} busy={busy} profile={THERMO_SCREEN_PROFILE} onSaved={tool.exported} />
          </div>
          <div className="card stack">
            <h3>Molde (PETG, outro arquivo)</h3>
            <ExportButtons models={view ? [view.mold] : []} name={`caixinha-molde-${s.source === "shape" ? s.shape : "silhueta"}`} busy={busy} profile={THERMO_MOLD_PROFILE} onSaved={tool.exported} />
          </div>
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy || loading} busyText="Gerando telas e molde…" error={error} emptyText={!valid ? "Corrija os campos em vermelho para ver a caixinha." : s.source === "image" && !s.image ? "Envie a silhueta (SVG ou imagem) para ver a caixinha." : "Escolha um formato para ver a caixinha."} />
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
              <h3>Peso e tempo de cada peça</h3>
              <ul className="plain">
                {screenEst.map((x) => (
                  <li key={x.name}>{x.name}: {x.est ? `≈ ${g(x.est.grams)} · ≈ ${formatDuration(x.est.seconds / 60)}` : "—"}</li>
                ))}
                <li>Molde de PETG: {moldEst ? `≈ ${g(moldEst.grams)} · ≈ ${formatDuration(moldEst.seconds / 60)}` : "—"}</li>
              </ul>
            </section>
          )}
          <section className="card stack" aria-label="Passo a passo da termoformagem">
            <h3>Passo a passo da termoformagem</h3>
            <ol>
              <li>Imprima o molde em PETG (o PLA da tela não gruda nele) e as telas em PLA, deitadas.</li>
              <li>Apoie o molde, com o domo para cima, numa superfície que aguente calor.</li>
              <li>Aqueça uma tela com soprador de ar quente, a uns 15 a 20 cm, em movimentos circulares, por 20 a 40 segundos, até ficar mole e flexível (o PLA amolece perto de 60 °C). Não encoste o soprador.</li>
              <li>Com uma luva ou pano, centralize a tela no molde, com a orelha do fecho no lugar certo, e prense de uma vez até a borda encostar no apoio. Segure uns 15 segundos.</li>
              <li>Deixe esfriar uns 30 segundos e solte: ela mantém a forma. Repita com a outra tela.</li>
              <li>Feche com o clipe (as pontas passam pelos furos das duas orelhas) ou cole a faixa por fora da emenda.</li>
            </ol>
            <span className="hint">Temperaturas e tempos são de referência: teste primeiro numa tela de sobra. Não aqueça o molde (o PETG amolece perto de 75 °C). Se a malha rasgar, diminua a altura do domo.</span>
          </section>
        </div>
      </div>
    </div>
  );
}
