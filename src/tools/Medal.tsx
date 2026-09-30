import { useEffect, useState } from "react";
import { FONTS, loadFont, type FontId } from "../geometry/fonts";
import { layoutOnPlate } from "../geometry/keychain";
import { getManifold } from "../geometry/manifold";
import { buildMedalDesign, DEFAULT_MEDAL_DESIGN, type MedalDesign, type MedalTextField } from "../geometry/medalDesign";
import { arcTextToCrossSection, textToCrossSection } from "../geometry/text";
import type { Model } from "../geometry/types";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ColorPick from "./ColorPick";
import ExportButtons from "../ui/ExportButtons";
import { DEFAULT_PROFILE } from "../geometry/printProfile";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import Slider from "../ui/Slider";
import { errorText } from "../ui/Toast";
import Toggle from "../ui/Toggle";
import { useModelBuilder } from "../ui/useModelBuilder";
import { DESIGN_ACCEPT, designFromSvg, fileToSvg, svgFillColors } from "./designInput";
import { clearHandoff, peekHandoff } from "./handoff";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";
import { parseBatch, PRESETS, RIMS, SHAPES, TEXTURES, type PresetId } from "./medalPresets";

type Field = Exclude<MedalTextField, "back">;
type SizeKey = "topSize" | "centerSize" | "rankSize" | "dateSize" | "bottomSize";
const FIELDS: { k: Field; label: string; size: SizeKey; max: number }[] = [
  { k: "top", label: "Em arco, em cima", size: "topSize", max: 40 },
  { k: "center", label: "Linha central", size: "centerSize", max: 24 },
  { k: "rank", label: "Colocação", size: "rankSize", max: 24 },
  { k: "date", label: "Data ou ano", size: "dateSize", max: 20 },
  { k: "bottom", label: "Em arco, embaixo", size: "bottomSize", max: 40 },
];
const HANGERS: [MedalDesign["hanger"], string][] = [
  ["ribbon", "Fita"],
  ["ring", "Argola"],
  ["hole", "Furo"],
  ["none", "Nenhuma"],
];
const RIBBONS: ["20" | "25" | "38", string][] = [
  ["20", "2 cm"],
  ["25", "2,5 cm"],
  ["38", "3,8 cm"],
];
const MOUNTS: [MedalDesign["backMount"], string][] = [
  ["none", "Nada"],
  ["magnet", "Ímã 10 × 3 mm"],
  ["brooch", "Broche (base de 25 mm)"],
];
type ColorKey = "baseColor" | "rimColor" | "textColor" | "artColor" | "bgColor";
const COLORS: [ColorKey, string][] = [
  ["baseColor", "Base"],
  ["rimColor", "Borda"],
  ["textColor", "Textos"],
  ["artColor", "Imagem"],
  ["bgColor", "Fundo"],
];
const PLATE_MM = 256;
const GAP_MM = 5;
const MAX_BATCH = 30;
type Fonts = Record<MedalTextField, FontId>;

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Medalhas (#19): formatos, textos em arco, bordas, fundo, imagem, alça, verso, presets e lote. */
export default function Medal() {
  // estado de trabalho: desfazer, rascunho guardado e últimos projetos (#85)
  const tool = useToolState(
    "medal",
    () => ({
      p: DEFAULT_MEDAL_DESIGN as MedalDesign,
      fonts: { top: "hanken", bottom: "hanken", center: "hanken", rank: "hanken", date: "hanken", back: "hanken" } as Fonts,
      // SVG vindo do Imagem → SVG (pode ser colorido)
      art: peekHandoff() as { svg: string; name: string } | null,
      batch: false,
      names: "Ana; 1º LUGAR\nBia; 2º LUGAR\nCaio; 3º LUGAR",
    }),
    { label: "Medalha" },
  );
  const { p, fonts, art, batch, names } = tool.state;
  const [setP, setFonts, setArt, setBatch, setNames] = [tool.field("p"), tool.field("fonts"), tool.field("art"), tool.field("batch"), tool.field("names")];
  useEffect(clearHandoff, []);
  const [artError, setArtError] = useState<string | null>(null);
  const set = <K extends keyof MedalDesign>(k: K) => (v: MedalDesign[K]) => tool.set((cur) => ({ ...cur, p: { ...cur.p, [k]: v } }), `p.${String(k)}`);

  async function onArt(f: File) {
    setArtError(null);
    try {
      setArt({ svg: await fileToSvg(f), name: f.name });
    } catch (e) {
      setArtError(errorText(e));
    }
  }

  const artMulti = !!art && svgFillColors(art.svg).length > 1;
  const engraveTooDeep = p.engraved && p.relief >= p.thickness - 0.6;
  const valid =
    inRange(p.diameter, 25, 150) &&
    inRange(p.thickness, 1.5, 10) &&
    inRange(p.rim, 0, 12) &&
    inRange(p.relief, 0.4, 5) &&
    inRange(p.arcInset, 0, 10) &&
    FIELDS.every((f) => inRange(p[f.size], 2, 24)) &&
    inRange(p.backSize, 2, 20) &&
    !engraveTooDeep;

  const { models, warnings, busy, error } = useModelBuilder(async () => {
    const people = batch ? parseBatch(names) : [];
    if (!valid || (batch && !people.length)) return null;
    const M = await getManifold();
    const loaded = Object.fromEntries(await Promise.all(Object.entries(fonts).map(async ([k, id]) => [k, await loadFont(id)] as const))) as Record<MedalTextField, Awaited<ReturnType<typeof loadFont>>>;
    const design = art ? await designFromSvg(art.svg, 100, false, true) : null;
    try {
      const ctx = {
        M,
        art: design?.cs ?? null,
        artLayers: design?.layers,
        text: (s: string, h: number, f: MedalTextField) => textToCrossSection(M, loaded[f], s, h),
        arc: (s: string, h: number, r: number, side: "top" | "bottom", f: MedalTextField) => arcTextToCrossSection(M, loaded[f], s, h, r, side),
      };
      if (!batch) return { models: buildMedalDesign(ctx, p), warnings: [] };
      // lote: uma medalha por pessoa (nome na linha central, colocação se tiver), todas na mesma mesa
      const all: Model[] = people
        .slice(0, MAX_BATCH)
        .flatMap((x) => buildMedalDesign(ctx, { ...p, center: x.name, rank: x.rank ?? p.rank }).map((m, i) => ({ ...m, name: i === 0 ? x.name : `${m.name} ${x.name}` })));
      const warn = people.length > MAX_BATCH ? [`Só as primeiras ${MAX_BATCH} medalhas foram geradas.`] : [];
      return { models: layoutOnPlate(all, PLATE_MM - 2 * GAP_MM, GAP_MM), warnings: warn };
    } finally {
      design?.cs.delete();
      design?.layers?.forEach((l) => l.cs.delete());
    }
  }, [p, fonts, art, valid, batch, names]);

  const fontSelect = (f: MedalTextField, label: string) => (
    <Choice label={`Fonte: ${label}`} value={fonts[f]} options={FONTS.map((x) => [x.id, x.label] as [FontId, string])} onChange={(v) => setFonts((o) => ({ ...o, [f]: v }))} />
  );
  // cada preset parte do padrão (não herda verso/textos do anterior); só tamanho e espessura continuam
  const applyPreset = (id: PresetId) => setP((o) => ({ ...DEFAULT_MEDAL_DESIGN, diameter: o.diameter, thickness: o.thickness, ...PRESETS.find((x) => x.id === id)!.patch }));

  return (
    <div className="page">
      <h1>Medalhas</h1>
      <p className="lead">Formato, textos em arco, borda, fundo, imagem, alça e verso. Cada parte sai com a sua cor no 3MF.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Modelo pronto</h3>
            <div className="row wrap">
              {PRESETS.map((x) => (
                <button key={x.id} onClick={() => applyPreset(x.id)}>
                  {x.label}
                </button>
              ))}
            </div>
            <span className="hint">Preenche textos e estilo; depois é só ajustar.</span>
          </div>
          <div className="card stack">
            <h3>Formato</h3>
            <Choice label="Formato" value={p.shape} options={SHAPES} onChange={set("shape")} />
            <div className="grid two">
              <NumField label="Tamanho" value={p.diameter} onChange={set("diameter")} min={25} max={150} step={1} />
              <NumField label="Espessura" value={p.thickness} onChange={set("thickness")} min={1.5} max={10} />
            </div>
          </div>
          <div className="card stack">
            <h3>Textos</h3>
            {FIELDS.map((f) => (
              <div key={f.k} className="stack">
                <label>
                  {f.label}
                  <input value={p[f.k]} maxLength={f.max} disabled={batch && f.k === "center"} onChange={(e) => set(f.k)(e.target.value)} />
                </label>
                <div className="grid two">
                  <NumField label={`Altura: ${f.label.toLowerCase()}`} value={p[f.size]} onChange={set(f.size)} min={2} max={24} step={0.5} />
                  {fontSelect(f.k, f.label.toLowerCase())}
                </div>
              </div>
            ))}
            <NumField label="Distância dos arcos até a borda" value={p.arcInset} onChange={set("arcInset")} min={0} max={10} step={0.5} hint="Maior = arco com raio menor, mais para dentro." />
          </div>
          <div className="card stack">
            <h3>Borda, fundo e relevo</h3>
            <div className="grid two">
              <Choice label="Estilo da borda" value={p.rimStyle} options={RIMS} onChange={set("rimStyle")} />
              <NumField label="Largura da borda" value={p.rim} onChange={set("rim")} min={0} max={12} step={0.5} />
              <Choice label="Textura do fundo" value={p.texture} options={TEXTURES} onChange={set("texture")} />
              <NumField label="Relevo" value={p.relief} onChange={set("relief")} min={0.4} max={5} />
            </div>
            <Toggle label="Baixo relevo (detalhes embutidos rente à face)" checked={p.engraved} onChange={set("engraved")} />
            {engraveTooDeep && <Alert kind="warn">No baixo relevo o relevo precisa ser menor que a espessura (menos 0,6 mm).</Alert>}
          </div>
          <div className="card stack">
            <h3>Imagem</h3>
            <Dropzone accept={DESIGN_ACCEPT} label={art ? art.name : "Imagem do centro (SVG ou imagem)"} hint="Logo, troféu, número… Colorida sai uma parte por cor." onFile={onArt} />
            {artError && <Alert kind="error">{artError}</Alert>}
            {art && (
              <>
                <Slider label="Tamanho da imagem" min={10} max={100} value={Math.round(p.artScale * 100)} display={(v) => `${v}%`} onChange={(v) => set("artScale")(v / 100)} />
                <div className="grid two">
                  <NumField label="Mover para o lado" value={p.artX} onChange={set("artX")} min={-60} max={60} step={0.5} />
                  <NumField label="Mover para cima" value={p.artY} onChange={set("artY")} min={-60} max={60} step={0.5} />
                  <NumField label="Girar" value={p.artRotation} onChange={set("artRotation")} min={-180} max={180} step={5} unit="°" />
                </div>
                <button className="link danger" onClick={() => setArt(null)}>
                  Remover imagem
                </button>
              </>
            )}
          </div>
          <div className="card stack">
            <h3>Alça e verso</h3>
            <div>
              <span className="field-label">Pendurar</span>
              <Segmented label="Pendurar" value={p.hanger} options={HANGERS} onChange={set("hanger")} full />
            </div>
            {p.hanger === "ribbon" && (
              <div>
                <span className="field-label">Largura da fita</span>
                <Segmented label="Largura da fita" value={String(p.ribbonWidth) as "25"} options={RIBBONS} onChange={(v) => set("ribbonWidth")(Number(v))} full />
              </div>
            )}
            <Choice label="No verso" value={p.backMount} options={MOUNTS} onChange={set("backMount")} />
            <Toggle label="Verso com texto (peça separada, colada com 2 pinos)" checked={p.back} onChange={set("back")} />
            {p.back && (
              <>
                <label>
                  Texto do verso (uma linha por linha)
                  <textarea rows={3} value={p.backText} onChange={(e) => set("backText")(e.target.value)} />
                </label>
                <div className="grid two">
                  <NumField label="Altura do texto do verso" value={p.backSize} onChange={set("backSize")} min={2} max={20} step={0.5} />
                  {fontSelect("back", "verso")}
                </div>
              </>
            )}
          </div>
          <div className="card stack">
            <h3>Cores</h3>
            <div className="row wrap">
              {COLORS.filter(([k]) => k !== "artColor" || (art && !artMulti)).map(([k, l]) => (
                <ColorPick key={k} label={l} value={p[k]} onChange={set(k)} />
              ))}
            </div>
            {artMulti && <span className="hint">A imagem é colorida: cada cor dela sai com o próprio filamento.</span>}
          </div>
          <div className="card stack">
            <Toggle label="Lote (várias medalhas numa mesa)" checked={batch} onChange={setBatch} />
            {batch && (
              <label>
                Uma pessoa por linha: “Nome; colocação”
                <textarea rows={5} value={names} onChange={(e) => setNames(e.target.value)} />
                <span className="hint">{parseBatch(names).length} medalhas · o nome vai na linha central</span>
              </label>
            )}
          </div>
          <ExportButtons models={models} name={batch ? "medalhas" : `medalha-${p.center || "sem-texto"}`} busy={busy} profile={DEFAULT_PROFILE} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy} busyText="Gerando medalha…" error={error} emptyText={!valid ? "Corrija os campos em vermelho." : batch ? "Digite os nomes do lote." : undefined} />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
