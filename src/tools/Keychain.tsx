import { useEffect, useRef, useState } from "react";
import { isCursive, loadEmojiFont, loadFont, type FontId } from "../geometry/fonts";
import { RESIN_TIP } from "../geometry/models/resin";
import { buildKeychain, DEFAULT_KEYCHAIN, layoutOnPlate, parseNames, splitLines, stackLines, type KeychainParams, type KeychainShape } from "../geometry/keychain";
import { modelsBounds } from "../geometry/bounds";
import { getManifold, type CS } from "../geometry/manifold";
import { scoped } from "../geometry/shape2d";
import { hasEmoji, textToCrossSection } from "../geometry/text";
import { checkText, textWarnings } from "../geometry/textCheck";
import FontPicker from "../ui/FontPicker";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import EmojiPicker from "../ui/EmojiPicker";
import ColorPick from "./ColorPick";
import ExportButtons from "../ui/ExportButtons";
import { DEFAULT_PROFILE } from "../geometry/printProfile";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import { useModelBuilder } from "../ui/useModelBuilder";
import { clearHandoff, peekHandoff } from "./handoff";
import { DESIGN_ACCEPT, designFromSvg, fileToSvg, svgFillColors } from "./designInput";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";
import { errorText } from "../ui/Toast";

const PLATE_MM = 256;
const GAP_MM = 5;
const LOGO_GAP_MM = 2;
const MAX_BATCH = 60;
const LINE_GAP = 0.25; // espaço entre as linhas, em fração da altura do texto
const SHAPES = [["outline", "Contorno"], ["rect", "Retângulo"], ["silhouette", "Silhueta"]] as const;
const LAYERS = [["2", "2 cores"], ["3", "3 cores"]] as const;

export default function Keychain() {
  // estado de trabalho: desfazer, rascunho guardado e últimos projetos (#85)
  const tool = useToolState(
    "keychain",
    () => ({
      batch: false,
      text: "Ana",
      names: "Ana\nBia\nCaio",
      font: "pacifico" as FontId,
      textH: 14,
      // SVG vindo do Imagem → SVG (pode ser colorido)
      logo: peekHandoff() as { svg: string; name: string } | null,
      logoH: 16,
      p: DEFAULT_KEYCHAIN as KeychainParams,
    }),
    { label: "Chaveiro" },
  );
  const { batch, text, names, font, textH, logo, logoH, p } = tool.state;
  const [setBatch, setText, setNames, setFont, setTextH, setLogo, setLogoH] = [tool.field("batch"), tool.field("text"), tool.field("names"), tool.field("font"), tool.field("textH"), tool.field("logo"), tool.field("logoH")];
  const textRef = useRef<HTMLInputElement>(null);
  useEffect(clearHandoff, []);
  const [logoError, setLogoError] = useState<string | null>(null);
  const set = <K extends keyof KeychainParams>(k: K) => (v: KeychainParams[K]) => tool.set((cur) => ({ ...cur, p: { ...cur.p, [k]: v } }), `p.${String(k)}`);

  const list = batch ? parseNames(names).slice(0, MAX_BATCH) : [text.trim()].filter(Boolean);
  const silhouette = p.shape === "silhouette";
  const logoMulti = !silhouette && !!logo && svgFillColors(logo.svg).length > 1;
  const valid =
    inRange(textH, 5, 60) && inRange(p.base, 0.8, 8) && inRange(p.relief, 0.4, 5) && inRange(p.border, 1, 10) && inRange(logoH, 5, 80) && (p.shape !== "rect" || inRange(p.rectWidth!, 30, 150));

  async function onLogo(f: File) {
    setLogoError(null);
    try {
      setLogo({ svg: await fileToSvg(f), name: f.name });
    } catch (e) {
      setLogoError(errorText(e));
    }
  }

  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!valid || (!list.length && !logo) || (silhouette && (!logo || !list.length))) return null;
    const M = await getManifold();
    const f = await loadFont(font);
    const emoji = list.some(hasEmoji) ? await loadEmojiFont() : undefined;
    const design = logo ? await designFromSvg(logo.svg, 100, false, true) : null;
    const logoCs: CS | null = design?.cs ?? null;
    let textWarn: string[] = [];
    try {
      const built = scoped((k) => {
        // logo no tamanho pedido (altura), reaproveitado em todos os chaveiros; logo colorido leva as camadas junto
        const lb = logoCs?.bounds();
        const s = lb ? logoH / (lb.max[1] - lb.min[1]) : 1;
        const logoFit = logoCs ? k(logoCs.scale(s)) : null;
        const layersFit = design?.layers?.map((l) => ({ color: l.color, cs: k(l.cs.scale(s)) })) ?? null;
        const names = list.length ? list : [""];
        return names.map((name, i) => {
          // "Ana|Silva": uma linha por parte, empilhadas
          const lines = splitLines(name).map((l) => k(textToCrossSection(M, f, l, textH, emoji)));
          const txt = !lines.length ? null : lines.length === 1 ? lines[0] : k(stackLines(M, lines, textH * LINE_GAP));
          // traço fino / letras soltas: o primeiro nome basta (mesma fonte e altura em todos)
          if (txt && i === 0) textWarn = textWarnings(checkText(txt), name, isCursive(font));
          let art: CS;
          let dx = 0;
          if (silhouette) art = txt!;
          else if (txt && logoFit) {
            const tb = txt.bounds(), gb = logoFit.bounds();
            dx = tb.min[0] - LOGO_GAP_MM - gb.max[0];
            art = k(txt.add(k(logoFit.translate([dx, 0]))));
          } else art = (txt ?? logoFit)!;
          let layers = silhouette ? null : (layersFit?.map((l) => ({ color: l.color, cs: k(l.cs.translate([dx, 0])) })) ?? null);
          // etiqueta: o texto encolhe para caber na largura (a altura da etiqueta acompanha)
          const ab = art.bounds();
          const room = (p.rectWidth ?? 0) - 2 * p.border;
          if (p.shape === "rect" && ab.max[0] - ab.min[0] > room) {
            const fit = room / (ab.max[0] - ab.min[0]);
            art = k(art.scale(fit));
            layers = layers?.map((l) => ({ color: l.color, cs: k(l.cs.scale(fit)) })) ?? null;
          }
          return buildKeychain(M, art, p, name.replace(/\|/g, " ") || "Chaveiro", layers, silhouette ? logoFit : null);
        });
      });
      const placed = built.length > 1 ? layoutOnPlate(built, PLATE_MM - 2 * GAP_MM, GAP_MM) : built;
      const b = modelsBounds(placed);
      const warn: string[] = [...textWarn, ...(p.resin ? [RESIN_TIP] : [])];
      if (b && b.max[1] - b.min[1] > PLATE_MM) warn.push("Os chaveiros não cabem numa mesa de 256 mm: divida a lista em mais arquivos.");
      if (batch && parseNames(names).length > MAX_BATCH) warn.push(`Só os primeiros ${MAX_BATCH} nomes foram gerados.`);
      return { models: placed, warnings: warn };
    } finally {
      logoCs?.delete();
      design?.layers?.forEach((l) => l.cs.delete());
    }
  }, [batch, text, names, font, textH, logo, logoH, p, valid]);

  return (
    <div className="page">
      <h1>Chaveiros</h1>
      <p className="lead">Nome e logo em 2 cores, pronto para o AMS.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <div className="seg" role="group" aria-label="Quantidade">
              <button aria-pressed={!batch} onClick={() => setBatch(false)}>Um nome</button>
              <button aria-pressed={batch} onClick={() => setBatch(true)}>Lote de nomes</button>
            </div>
            {batch ? (
              <label>
                Nomes (um por linha ou separados por vírgula; | quebra em duas linhas)
                <textarea value={names} onChange={(e) => setNames(e.target.value)} rows={5} />
                <span className="hint">{parseNames(names).length} nomes · todos na mesma mesa</span>
              </label>
            ) : (
              <div className="field-with-emoji">
                <label>
                  Texto
                  <input ref={textRef} value={text} maxLength={40} onChange={(e) => setText(e.target.value)} />
                </label>
                <EmojiPicker inputRef={textRef} value={text} onChange={setText} />
              </div>
            )}
            {!batch && <span className="hint">Use | para quebrar em duas linhas (ex.: Ana|Silva).</span>}
            <FontPicker value={font} onChange={setFont} sample={(batch ? parseNames(names)[0] : text) ?? ""} />
            <NumField label="Altura do texto" value={textH} onChange={setTextH} min={5} max={60} step={1} />
          </div>
          <div className="card stack">
            <h3>{silhouette ? "Silhueta" : "Logo"}</h3>
            <Dropzone
              accept={DESIGN_ACCEPT}
              label={logo ? logo.name : silhouette ? "SVG ou imagem da silhueta" : "SVG ou imagem do logo"}
              hint={silhouette ? "Vira o formato da base, com o nome por cima" : "Fica à esquerda do texto"}
              onFile={onLogo}
            />
            {logoError && <Alert kind="error">{logoError}</Alert>}
            {logo && (
              <div className="row">
                <NumField label={silhouette ? "Altura da silhueta" : "Altura do logo"} value={logoH} onChange={setLogoH} min={5} max={80} step={1} />
                <button className="link danger" onClick={() => setLogo(null)}>Remover logo</button>
              </div>
            )}
            {logoMulti && <span className="hint">Logo colorido: cada cor dele sai com o próprio filamento; a “Cor do texto” vale só para o nome.</span>}
          </div>
          <div className="card stack">
            <h3>Base</h3>
            <span className="field-label">Formato</span>
            <Segmented label="Formato" value={p.shape ?? "outline"} options={SHAPES} onChange={(v: KeychainShape) => set("shape")(v)} full />
            <span className="field-label">Camadas</span>
            <Segmented label="Camadas" value={String(p.layers ?? 2) as "2" | "3"} options={LAYERS} onChange={(v) => set("layers")(v === "3" ? 3 : 2)} full />
            {p.shape === "rect" && <NumField label="Largura da etiqueta" value={p.rectWidth!} onChange={set("rectWidth")} min={30} max={150} step={1} />}
            <label className="check">
              <input type="checkbox" checked={p.ring} onChange={(e) => set("ring")(e.target.checked)} /> Argola com furo à esquerda
            </label>
            <div className="row">
              <ColorPick label="Cor da base" value={p.baseColor} onChange={set("baseColor")} />
              {p.layers === 3 && (
                <ColorPick label="Cor do meio" value={p.midColor ?? "#ffffff"} onChange={set("midColor")} />
              )}
              <ColorPick label="Cor do texto" value={p.topColor} onChange={set("topColor")} />
            </div>
            {/* template (#139): o que quase ninguém muda fica recolhido */}
            <details className="advanced">
              <summary>Opções avançadas</summary>
              <div className="stack">
                <div className="grid two">
                  <NumField label="Espessura" value={p.base} onChange={set("base")} min={0.8} max={8} />
                  <NumField label="Relevo do texto" value={p.relief} onChange={set("relief")} min={0.4} max={5} />
                  <NumField label="Borda" value={p.border} onChange={set("border")} min={1} max={10} step={0.5} />
                </div>
                <label className="check">
                  <input type="checkbox" checked={!!p.resin} onChange={(e) => set("resin")(e.target.checked)} /> Cavidade para resina (borda elevada)
                </label>
                {p.resin && <NumField label="Profundidade da resina" value={p.resinDepth ?? 1.5} onChange={set("resinDepth")} min={0.6} max={4} />}
              </div>
            </details>
          </div>
          <ExportButtons models={models} name={batch ? "chaveiros" : `chaveiro-${splitLines(text).join(" ") || "logo"}`} busy={busy} profile={DEFAULT_PROFILE} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy} busyText="Gerando chaveiros…" error={error} emptyText={!valid ? "Corrija os campos em vermelho." : silhouette && !logo ? "Envie a silhueta (SVG ou imagem) para ver o chaveiro." : "Digite um nome para ver o chaveiro."} />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
