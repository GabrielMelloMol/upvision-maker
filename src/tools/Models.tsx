import { Search, SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { getDb } from "../db";
import { loadCompany } from "../db/customersRepo";
import { FONTS, loadFont, type FontId } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import { textToCrossSection } from "../geometry/text";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import EmptyState from "../ui/EmptyState";
import ExportButtons from "../ui/ExportButtons";
import Field from "../ui/Field";
import MoneyField from "../ui/MoneyField";
import NumField from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import Toggle from "../ui/Toggle";
import { errorText } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import { DESIGN_ACCEPT, designFromSvg, fileToSvg } from "./designInput";
import { MissingInput } from "../geometry/models/common";
import { CATEGORIES, MODELS, validParams, type Category, type FieldDef, type Params } from "./models/defs";
import "../styles/features.css";

/** Minúsculas e sem acento, para a busca. */
const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const ART_WIDTH_MM = 100; // o desenho é reescalado por cada modelo; aqui só normaliza

/** Modelos paramétricos prontos: escolha na galeria, ajuste os campos, veja em 3D e salve o 3MF em cores. */
export default function Models() {
  const [id, setId] = useState(MODELS[0].id);
  const [all, setAll] = useState<Record<string, Params>>(() => Object.fromEntries(MODELS.map((m) => [m.id, m.defaults])));
  const [font, setFont] = useState<FontId>("hanken");
  const [art, setArt] = useState<{ svg: string; name: string } | null>(null);
  const [artError, setArtError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>(MODELS[0].category);
  const [query, setQuery] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  const def = MODELS.find((m) => m.id === id)!;
  const q = normalize(query.trim());
  const shown = q ? MODELS.filter((m) => normalize(`${m.label} ${m.blurb}`).includes(q)) : MODELS.filter((m) => m.category === category);
  function pickCategory(c: Category) {
    setCategory(c);
    setQuery("");
    if (def.category !== c) setId(MODELS.find((m) => m.category === c)!.id);
  }
  const p = all[id];
  const set = (k: string) => (v: string | number | boolean) => setAll((a) => ({ ...a, [id]: { ...a[id], [k]: v } }));

  // Placa Pix já vem com os dados da empresa (Preferências → Dados da empresa).
  useEffect(() => {
    getDb()
      .then(loadCompany)
      .then((c) =>
        setAll((a) => ({ ...a, pix: { ...a.pix, key: c.pixKey, name: c.pixName || c.tradeName || c.name, city: c.pixCity || c.city, subtitle: c.tradeName || c.name } })),
      )
      .catch((e) => console.warn("Sem dados da empresa para a placa Pix:", e));
  }, []);

  async function onArt(f: File) {
    setArtError(null);
    try {
      setArt({ svg: await fileToSvg(f), name: f.name });
    } catch (e) {
      setArtError(errorText(e));
    }
  }

  const valid = validParams(def, p);
  const useArt = def.art ? art : null;
  const { models, warnings, pauses, busy, error } = useModelBuilder(async () => {
    if (!valid) return null;
    const M = await getManifold();
    const f = await loadFont(font);
    const design = useArt ? await designFromSvg(useArt.svg, ART_WIDTH_MM, false, true) : null;
    try {
      let out;
      try {
        out = def.build({ M, art: design?.cs ?? null, artLayers: design?.layers, text: (s, h) => (s.trim() ? textToCrossSection(M, f, s, h) : null) }, p);
      } catch (e) {
        // dado obrigatório faltando não é erro: vira o texto da prévia vazia
        if (!(e instanceof MissingInput)) throw e;
        setMissing(e.message);
        return null;
      }
      setMissing(null);
      return { models: out.models, warnings: out.warnings ?? [], pauses: out.pauses };
    } finally {
      design?.cs.delete();
      design?.layers?.forEach((l) => l.cs.delete());
    }
  }, [def, p, font, useArt, valid]);

  return (
    <div className="page">
      <h1>Modelos prontos</h1>
      <p className="lead">Escolha um modelo, ajuste texto, tamanho e cores e salve o 3MF já separado por cor.</p>
      <div className="model-picker">
        <div className="row">
          {/* buscando, os resultados são de todas as categorias: nenhuma fica marcada */}
          <Segmented label="Categoria" value={(q ? "" : category) as Category} options={CATEGORIES} onChange={pickCategory} />
          <div className="affix has-prefix">
            <Search className="prefix" size={16} aria-hidden />
            <input
              type="search"
              placeholder="Buscar modelo"
              aria-label="Buscar modelo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            />
          </div>
        </div>
        <div className="model-gallery" role="group" aria-label="Modelo">
        {shown.map((m) => (
          <button key={m.id} type="button" aria-pressed={m.id === id} onClick={() => setId(m.id)} title={m.blurb}>
            <m.icon aria-hidden />
            <span>{m.label}</span>
          </button>
        ))}

        </div>
        {!shown.length && (
          <EmptyState icon={SearchX} title={`Nenhum modelo com “${query.trim()}”`} action={<button onClick={() => setQuery("")}>Limpar busca</button>} />
        )}
      </div>
      <div className="tool-layout">
        <div className="controls">
          <p className="hint">{def.blurb}</p>
          {def.sections.map((s) => (
            <div className="card stack" key={s.title}>
              <h3>{s.title}</h3>
              <div className="grid two">
                {s.fields.map((f) => (
                  <ParamField key={f.k} f={f} value={p[f.k]} onChange={set(f.k)} />
                ))}
              </div>
              {s === def.sections[def.fontSection ?? 0] && def.font && (
                <Field label="Fonte">
                  <select value={font} onChange={(e) => setFont(e.target.value as FontId)}>
                    {FONTS.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {s === def.sections[0] && def.art && (
                <>
                  <Dropzone accept={DESIGN_ACCEPT} label={art ? art.name : def.art} hint="SVG ou imagem (vira vetor sozinha)." onFile={onArt} />
                  {artError && <Alert kind="error">{artError}</Alert>}
                  {art && (
                    <button className="link danger" onClick={() => setArt(null)}>
                      Remover desenho
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <ExportButtons models={models} name={`${def.label}-${String(p.text ?? p.line1 ?? p.title ?? p.base ?? "")}`} busy={busy} pauses={pauses} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy} busyText={`Gerando ${def.label.toLowerCase()}…`} error={error} emptyText={!valid ? "Corrija os campos em vermelho." : (missing ?? undefined)} />
          {warnings.map((w) => (
            <Alert key={w} kind="info">
              {w}
            </Alert>
          ))}
        </div>
      </div>
    </div>
  );
}

function ParamField({ f, value, onChange }: { f: FieldDef; value: Params[string]; onChange: (v: string | number | boolean) => void }) {
  switch (f.kind) {
    case "num":
      return <NumField label={f.label} value={value as number} onChange={onChange} min={f.min} max={f.max} step={f.step} unit={f.unit} hint={f.hint} />;
    case "text":
      return (
        <Field label={f.label} hint={f.hint}>
          <input value={String(value)} maxLength={f.max} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "money":
      return <MoneyField label={f.label} value={String(value)} onChange={onChange} hint={f.hint} />;
    case "color":
      return (
        <label>
          {f.label}
          <input type="color" value={String(value)} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
    case "bool":
      return <Toggle label={f.label} checked={Boolean(value)} onChange={onChange} />;
    case "choice":
      return (
        <div className="span-2">
          <span className="field-label">{f.label}</span>
          <Segmented label={f.label} value={String(value)} options={f.options} onChange={onChange} full />
        </div>
      );
  }
}
