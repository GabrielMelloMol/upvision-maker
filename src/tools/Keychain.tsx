import { useState } from "react";
import { FONTS, loadFont, type FontId } from "../geometry/fonts";
import { buildKeychain, DEFAULT_KEYCHAIN, layoutOnPlate, parseNames, type KeychainParams } from "../geometry/keychain";
import { modelsBounds } from "../geometry/bounds";
import { getManifold, type CS } from "../geometry/manifold";
import { scoped } from "../geometry/shape2d";
import { textToCrossSection } from "../geometry/text";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import { useModelBuilder } from "../ui/useModelBuilder";
import { DESIGN_ACCEPT, designFromSvg, fileToSvg } from "./designInput";
import { errorText } from "../ui/Toast";

const PLATE_MM = 256;
const GAP_MM = 5;
const LOGO_GAP_MM = 2;
const MAX_BATCH = 60;

export default function Keychain() {
  const [batch, setBatch] = useState(false);
  const [text, setText] = useState("Ana");
  const [names, setNames] = useState("Ana\nBia\nCaio");
  const [font, setFont] = useState<FontId>("pacifico");
  const [textH, setTextH] = useState(14);
  const [logo, setLogo] = useState<{ svg: string; name: string } | null>(null);
  const [logoH, setLogoH] = useState(16);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [p, setP] = useState<KeychainParams>(DEFAULT_KEYCHAIN);
  const set = <K extends keyof KeychainParams>(k: K) => (v: KeychainParams[K]) => setP((o) => ({ ...o, [k]: v }));

  const list = batch ? parseNames(names).slice(0, MAX_BATCH) : [text.trim()].filter(Boolean);
  const valid = inRange(textH, 5, 60) && inRange(p.base, 0.8, 8) && inRange(p.relief, 0.4, 5) && inRange(p.border, 1, 10) && inRange(logoH, 5, 80);

  async function onLogo(f: File) {
    setLogoError(null);
    try {
      setLogo({ svg: await fileToSvg(f), name: f.name });
    } catch (e) {
      setLogoError(errorText(e));
    }
  }

  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!valid || (!list.length && !logo)) return null;
    const M = await getManifold();
    const f = await loadFont(font);
    const logoCs: CS | null = logo ? (await designFromSvg(logo.svg, 100, false)).cs : null;
    try {
      const built = scoped((k) => {
        // logo no tamanho pedido (altura), reaproveitado em todos os chaveiros
        const lb = logoCs?.bounds();
        const logoFit = logoCs && lb ? k(logoCs.scale(logoH / (lb.max[1] - lb.min[1]))) : null;
        const names = list.length ? list : [""];
        return names.map((name) => {
          const txt = name ? k(textToCrossSection(M, f, name, textH)) : null;
          let art: CS;
          if (txt && logoFit) {
            const tb = txt.bounds(), gb = logoFit.bounds();
            art = k(txt.add(k(logoFit.translate([tb.min[0] - LOGO_GAP_MM - gb.max[0], 0]))));
          } else art = (txt ?? logoFit)!;
          return buildKeychain(M, art, p, name || "Chaveiro");
        });
      });
      const placed = built.length > 1 ? layoutOnPlate(built, PLATE_MM - 2 * GAP_MM, GAP_MM) : built;
      const b = modelsBounds(placed);
      const warn: string[] = [];
      if (b && b.max[1] - b.min[1] > PLATE_MM) warn.push("Os chaveiros não cabem numa mesa de 256 mm: divida a lista em mais arquivos.");
      if (batch && parseNames(names).length > MAX_BATCH) warn.push(`Só os primeiros ${MAX_BATCH} nomes foram gerados.`);
      return { models: placed, warnings: warn };
    } finally {
      logoCs?.delete();
    }
  }, [batch, text, names, font, textH, logo, logoH, p, valid]);

  const fontCss = FONTS.find((x) => x.id === font)!.css;

  return (
    <div className="page">
      <h1>Chaveiros</h1>
      <p className="lead">Nome com fonte bonita, logo opcional e argola. Base e texto saem em cores separadas no 3MF, prontos para o AMS.</p>
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <div className="seg" role="group" aria-label="Quantidade">
              <button aria-pressed={!batch} onClick={() => setBatch(false)}>Um nome</button>
              <button aria-pressed={batch} onClick={() => setBatch(true)}>Lote de nomes</button>
            </div>
            {batch ? (
              <label>
                Nomes (um por linha ou separados por vírgula)
                <textarea value={names} onChange={(e) => setNames(e.target.value)} rows={5} />
                <span className="hint">{parseNames(names).length} nomes · todos na mesma mesa</span>
              </label>
            ) : (
              <label>
                Texto
                <input value={text} maxLength={40} onChange={(e) => setText(e.target.value)} />
              </label>
            )}
            <label>
              Fonte
              <select value={font} onChange={(e) => setFont(e.target.value as FontId)}>
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <span className="font-sample" style={{ fontFamily: fontCss }}>
                {(batch ? parseNames(names)[0] : text) || "Exemplo"}
              </span>
            </label>
            <NumField label="Altura do texto" value={textH} onChange={setTextH} min={5} max={60} step={1} />
          </div>
          <div className="card stack">
            <h3>Logo (opcional)</h3>
            <Dropzone accept={DESIGN_ACCEPT} label={logo ? logo.name : "SVG ou imagem do logo"} hint="Fica à esquerda do texto" onFile={onLogo} />
            {logoError && <Alert kind="error">{logoError}</Alert>}
            {logo && (
              <div className="row">
                <NumField label="Altura do logo" value={logoH} onChange={setLogoH} min={5} max={80} step={1} />
                <button className="link danger" onClick={() => setLogo(null)}>Remover logo</button>
              </div>
            )}
          </div>
          <div className="card stack">
            <h3>Base</h3>
            <div className="grid two">
              <NumField label="Espessura" value={p.base} onChange={set("base")} min={0.8} max={8} />
              <NumField label="Relevo do texto" value={p.relief} onChange={set("relief")} min={0.4} max={5} />
              <NumField label="Borda" value={p.border} onChange={set("border")} min={1} max={10} step={0.5} />
            </div>
            <label className="check">
              <input type="checkbox" checked={p.ring} onChange={(e) => set("ring")(e.target.checked)} /> Argola com furo à esquerda
            </label>
            <div className="row">
              <label>
                Cor da base
                <input type="color" value={p.baseColor} onChange={(e) => set("baseColor")(e.target.value)} />
              </label>
              <label>
                Cor do texto
                <input type="color" value={p.topColor} onChange={(e) => set("topColor")(e.target.value)} />
              </label>
            </div>
          </div>
          <ExportButtons models={models} name={batch ? "chaveiros" : `chaveiro-${text || "logo"}`} busy={busy} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy} busyText="Gerando chaveiros…" error={error} emptyText={!valid ? "Corrija os campos em vermelho." : "Digite um nome para ver o chaveiro."} />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
