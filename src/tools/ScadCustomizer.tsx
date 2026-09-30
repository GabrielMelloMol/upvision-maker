import { useEffect, useMemo, useState } from "react";
import { renderPrograms, renderScad, RenderCancelled } from "../ai/render";
import { getDb } from "../db";
import { modelVariants, type ModelVariant } from "../db/modelVariantsRepo";
import { LICENSES } from "../domain/modelSearch";
import { readBinaryStl } from "../geometry/stlRead";
import type { Model } from "../geometry/types";
import { defineArgs, parseCustomizer, plateModules, scadImports, type ScadValue } from "../scad/customizer";
import { fromFormValue, toFormValue, toSections } from "../scad/form";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import Field from "../ui/Field";
import Preview3D from "../ui/Preview3D";
import { errorText, useToast } from "../ui/Toast";
import { useData } from "../ui/useData";
import ParamField from "./models/ParamField";
import type { Params } from "./models/fields";
import { restoreBytes, storeBytes } from "./storedFile";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

const MAX_SCAD_BYTES = 1024 * 1024;
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const RENDER_DEBOUNCE_MS = 700; // o OpenSCAD leva segundos: espera a pessoa parar de digitar
const LIBRARY_ID = "scad"; // "Meus modelos" OpenSCAD ficam na tabela de variações (#26), que entra no backup
const PLATE_COLOR = "#2563eb";

type Scad = { name: string; text: string };
const initialState = () => ({ scad: null as Scad | null, values: {} as Params, license: "", credit: "", imports: {} as Record<string, Uint8Array> });
type ScadState = ReturnType<typeof initialState>;
type Saved = { source: string; license: string; credit: string; values: Params };

/**
 * OpenSCAD personalizável (#96): abre um .scad no formato do Customizer (o mesmo do Parametric Model Maker), vira
 * formulário e 3MF. O OpenSCAD (GPL) roda isolado no mesmo worker do "Pedir à IA", carregado só aqui.
 */
export default function ScadCustomizer() {
  const tool = useToolState("scad", initialState, {
    label: "OpenSCAD personalizável",
    save: (s) => ({ ...s, imports: Object.fromEntries(Object.entries(s.imports).map(([k, v]) => [k, storeBytes(v)])) }),
    load: (raw) => {
      const r = raw as Omit<ScadState, "imports"> & { imports?: Record<string, string | null> };
      const imports = Object.fromEntries(Object.entries(r.imports ?? {}).flatMap(([k, v]) => (restoreBytes(v) ? [[k, restoreBytes(v)!]] : [])));
      return { ...r, imports };
    },
  });
  const { scad, values, license, credit, imports } = tool.state;
  const [setValues, setLicense, setCredit, setImports] = [tool.field("values"), tool.field("license"), tool.field("credit"), tool.field("imports")];
  const [fileError, setFileError] = useState<string | null>(null);
  const toast = useToast();

  const params = useMemo(() => (scad ? parseCustomizer(scad.text) : []), [scad]);
  const sections = useMemo(() => toSections(params), [params]);
  const needed = useMemo(() => (scad ? scadImports(scad.text) : []), [scad]);
  const plates = useMemo(() => (scad ? plateModules(scad.text) : []), [scad]);
  const missing = needed.filter((n) => !imports[n]);
  const current = (name: string) => values[name] ?? toFormValue(params.find((p) => p.name === name)!, params.find((p) => p.name === name)!.value);
  const scadValues: Record<string, ScadValue | null> = Object.fromEntries(params.map((p) => [p.name, fromFormValue(p, current(p.name))]));
  const invalid = params.filter((p) => scadValues[p.name] === null).map((p) => p.label);
  const args = invalid.length ? null : defineArgs(params, scadValues as Record<string, ScadValue>);
  const argsKey = JSON.stringify(args);

  const [models, setModels] = useState<Model[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!scad || !args || missing.length) return;
    let cancel = () => {};
    const t = setTimeout(() => {
      setBusy(true);
      const files = Object.entries(imports);
      const run = plates.length
        ? (() => {
            // ponytail: cada mesa renderiza o arquivo inteiro + mw_plate_N(); geometria solta no topo sai em todas
            const r = renderPrograms(plates.map((m) => `${scad.text}\n\n${m}();\n`), { args, files });
            return { result: r.result.then((stls) => stls.map((stl, i): Model => ({ name: `Mesa ${i + 1}`, parts: [{ name: `Mesa ${i + 1}`, color: PLATE_COLOR, mesh: readBinaryStl(stl) }] }))), cancel: r.cancel };
          })()
        : (() => {
            const r = renderScad(scad.text, scad.name, { args, files });
            return { result: r.result.then((m) => [m]), cancel: r.cancel };
          })();
      cancel = run.cancel;
      run.result
        .then((m) => {
          setModels(m);
          setError(null);
        })
        .catch((e) => !(e instanceof RenderCancelled) && setError(errorText(e)))
        .finally(() => setBusy(false));
    }, RENDER_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      cancel();
    };
    // args vão pela chave em texto (mesmo conteúdo = mesma renderização)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scad, argsKey, imports, plates, missing.length]);

  async function onScad(f: File) {
    setFileError(null);
    if (!f.name.toLowerCase().endsWith(".scad")) return setFileError("Envie o arquivo .scad do OpenSCAD.");
    if (f.size > MAX_SCAD_BYTES) return setFileError("Arquivo .scad maior que 1 MB.");
    const next = { name: f.name.replace(/\.scad$/i, ""), text: await f.text() };
    tool.set((o) => ({ ...o, scad: next, values: {}, imports: {} })); // arquivo novo: um passo de desfazer só
    setModels([]);
  }
  async function onImport(name: string, f: File) {
    if (f.size > MAX_IMPORT_BYTES) return toast(`${f.name}: maior que 20 MB.`, "error");
    const bytes = new Uint8Array(await f.arrayBuffer());
    setImports((o) => ({ ...o, [name]: bytes }));
  }

  const [saved, reloadSaved] = useData((db) => modelVariants.list(db, LIBRARY_ID), [] as ModelVariant[]);
  async function saveToLibrary() {
    if (!scad) return;
    try {
      const data: Saved = { source: scad.text, license, credit, values };
      await modelVariants.create(await getDb(), { modelId: LIBRARY_ID, label: scad.name.slice(0, 60), data: JSON.stringify(data), createdAt: new Date().toISOString() });
      toast(`"${scad.name}" guardado em Meus modelos.`);
      reloadSaved();
    } catch (e) {
      toast(errorText(e), "error");
    }
  }
  function openSaved(v: ModelVariant) {
    try {
      const d = JSON.parse(v.data) as Saved;
      tool.set(() => ({ scad: { name: v.label, text: d.source }, values: d.values ?? {}, license: d.license ?? "", credit: d.credit ?? "", imports: {} }));
    } catch {
      toast("Não deu para abrir este modelo guardado.", "error");
    }
  }
  async function removeSaved(v: ModelVariant) {
    await modelVariants.remove(await getDb(), v.id);
    reloadSaved();
  }

  const verdict = LICENSES.find((l) => l.id === license)?.verdict;
  const firstText = String(Object.values(values).find((v) => typeof v === "string" && v.trim()) ?? "");

  return (
    <div className="page">
      <h1>OpenSCAD personalizável</h1>
      <p className="lead">Abra um .scad com parâmetros no formato do Customizer (Thingiverse, Printables, MakerWorld) e ajuste as medidas num formulário, sem abrir o código.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <Dropzone accept=".scad" label={scad ? `${scad.name}.scad` : "Arraste o arquivo .scad"} hint="Os parâmetros do topo do arquivo viram campos: [min:passo:max], listas, /* [Abas] */." onFile={onScad} />
            {fileError && <Alert kind="error">{fileError}</Alert>}
            {saved.length > 0 && (
              <div className="stack" aria-label="Meus modelos">
                <span className="field-label">Meus modelos</span>
                <div className="chips">
                  {saved.map((v) => (
                    <span key={v.id} className="chip-with-x">
                      <button type="button" onClick={() => openSaved(v)}>
                        {v.label}
                      </button>
                      <button type="button" className="chip-x" aria-label={`Apagar ${v.label}`} onClick={() => void removeSaved(v)}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {scad && (
            <div className="card stack">
              <h3>Licença do modelo</h3>
              <Field label="Licença informada pelo autor">
                <select value={license} onChange={(e) => setLicense(e.target.value)}>
                  <option value="">Escolha…</option>
                  {LICENSES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>
              {verdict && <Alert kind={verdict.sell === "yes" ? "info" : "warn"}>{verdict.text}</Alert>}
              <Field label="Autor e link (crédito)">
                <input value={credit} maxLength={200} onChange={(e) => setCredit(e.target.value)} />
              </Field>
              <button type="button" className="btn" disabled={!license} onClick={() => void saveToLibrary()}>
                Guardar em Meus modelos
              </button>
            </div>
          )}
          {needed.length > 0 && (
            <div className="card stack">
              <h3>Arquivos do modelo</h3>
              {needed.map((n) => (
                <Dropzone key={n} accept={n.includes(".") ? n.slice(n.lastIndexOf(".")) : "*"} label={imports[n] ? `${n} ✓` : n} hint="O .scad lê este arquivo: envie o seu (desenho, foto ou peça)." onFile={(f) => void onImport(n, f)} />
              ))}
            </div>
          )}
          {sections.map((s) => (
            <div key={s.title} className="card stack">
              <h3>{s.title}</h3>
              <div className="grid two">
                {s.fields.map((f) => (
                  <ParamField key={f.k} f={f} value={current(f.k)} sample={firstText} onChange={(v) => setValues((o) => ({ ...o, [f.k]: v }))} />
                ))}
              </div>
            </div>
          ))}
          {scad && !params.length && <Alert kind="info">Este .scad não tem parâmetros no formato do Customizer: ele gera a peça como está.</Alert>}
          {invalid.length > 0 && <Alert kind="error">Corrija: {invalid.join(", ")}.</Alert>}
          <ExportButtons models={busy ? [] : models} name={scad?.name ?? "openscad"} busy={busy} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy} busyText="Renderizando no OpenSCAD…" error={error} emptyText={!scad ? "Envie um .scad para começar." : missing.length ? `Envie ${missing.join(", ")}.` : undefined} />
          {plates.length > 0 && <span className="hint">{plates.length} mesas do MakerWorld (mw_plate_N): cada uma sai como um objeto no 3MF.</span>}
          <span className="hint">OpenSCAD é software livre (GPL-2.0); roda separado do app, só nesta tela e no Pedir à IA.</span>
        </div>
      </div>
    </div>
  );
}
