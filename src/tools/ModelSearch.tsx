import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, History, Scale, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { LICENSES, pushRecent, safeModelUrl, siteOfUrl, SITES, type Site } from "../domain/modelSearch";
import type { Go } from "../pages";
import { setPendingSlicerFile } from "../pages/calculator/pendingFile";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import Field from "../ui/Field";
import Toggle from "../ui/Toggle";
import { errorText, useToast } from "../ui/Toast";

const RECENT_KEY = "upvision.modelSearches";
const SLICED = /\.(3mf|gcode|gco|g|bgcode)$/i;
const MESH = /\.(stl|obj|step|stp)$/i;

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function storeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // sem armazenamento local: as buscas recentes valem só nesta sessão
  }
}

/** Buscar modelos 3D (#77): abre a busca de cada site no navegador, sem copiar nada das páginas. */
export default function ModelSearch({ go }: { go: Go }) {
  const [query, setQuery] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const [recent, setRecent] = useState(loadRecent);
  const [link, setLink] = useState("");
  const [license, setLicense] = useState("");
  const [dropError, setDropError] = useState<string | null>(null);
  const toast = useToast();
  const q = query.trim();

  const open = (url: string) => void openUrl(url).catch((e) => toast(errorText(e), "error"));
  function remember() {
    const next = pushRecent(recent, q);
    setRecent(next);
    storeRecent(next);
  }
  function searchIn(s: Site) {
    if (!q) return;
    remember();
    open(s.search(q, onlyFree));
  }
  function searchAll(e: FormEvent) {
    e.preventDefault();
    if (!q) return;
    remember();
    SITES.forEach((s) => open(s.search(q, onlyFree)));
  }

  const linkSite = link.trim() ? siteOfUrl(link) : null;
  const linkUrl = linkSite ? safeModelUrl(link) : null;
  const verdict = LICENSES.find((l) => l.id === license)?.verdict;

  function onDownloaded(f: File) {
    setDropError(null);
    if (SLICED.test(f.name)) {
      setPendingSlicerFile(f);
      go("calculator");
    } else if (MESH.test(f.name)) setDropError("STL e OBJ ainda não têm peso nem tempo: fatie no Bambu Studio, Orca ou Prusa e arraste aqui o 3MF fatiado ou o G-code.");
    else setDropError("Use o 3MF fatiado ou o G-code (.gcode, .bgcode).");
  }

  return (
    <div className="page">
      <h1>Buscar modelos 3D</h1>
      <p className="lead">Procure nos principais sites de modelos. A busca abre no navegador; aqui nada é copiado das páginas.</p>
      <div className="tool-layout">
        <div className="controls">
          <form className="card stack" onSubmit={searchAll}>
            <div className="affix has-prefix">
              <Search className="prefix" size={16} aria-hidden />
              <input type="search" aria-label="O que você procura" placeholder="Ex.: vaso espiral, porta-copos, chaveiro de pet" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Toggle label="Só modelos grátis (onde o site permite filtrar)" checked={onlyFree} onChange={setOnlyFree} />
            {onlyFree && <span className="hint">O filtro vai junto no {SITES.filter((x) => x.free).map((x) => x.name).join(", ")}; nos outros, use o filtro da própria página.</span>}
            <button type="submit" className="primary" disabled={!q}>
              <ExternalLink aria-hidden size={16} /> Buscar em todos ({SITES.length} abas)
            </button>
            {recent.length > 0 && (
              <div className="chips" role="group" aria-label="Buscas recentes">
                <History aria-hidden size={14} className="muted" />
                {recent.map((r) => (
                  <button key={r} type="button" onClick={() => setQuery(r)}>
                    {r}
                  </button>
                ))}
              </div>
            )}
          </form>
          <ul className="site-list" aria-label="Sites">
            {SITES.map((s) => (
              <li key={s.id} className="card">
                <div>
                  <b>{s.name}</b>
                  <p className="hint">{s.blurb}</p>
                </div>
                <button type="button" className="sm" disabled={!q} onClick={() => searchIn(s)} aria-label={`Buscar no ${s.name}`}>
                  Buscar <ExternalLink aria-hidden size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="preview-col stack">
          <section className="card stack" aria-label="Posso vender a peça?">
            <h3>
              <Scale aria-hidden size={16} /> Posso vender a peça?
            </h3>
            <p className="hint">A licença fica na página de cada modelo. Muitos grátis são <b>NC (não comercial)</b>: dá para imprimir para você, não para vender.</p>
            <Field label="Licença do modelo">
              <select value={license} onChange={(e) => setLicense(e.target.value)}>
                <option value="">Escolher…</option>
                {LICENSES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
            {verdict && <Alert kind={verdict.sell === "yes" ? "ok" : verdict.sell === "no" ? "error" : "warn"}>{verdict.text}</Alert>}
            <p className="hint">Isto é um guia rápido, não orientação jurídica. Na dúvida, pergunte ao autor.</p>
          </section>
          <section className="card stack" aria-label="Achou um modelo?">
            <h3>Achou um modelo?</h3>
            <Field label="Link do modelo" hint={linkSite?.id === "makerworld" ? "Na página do MakerWorld, “Abrir no Bambu Studio” já leva o projeto pronto para fatiar." : undefined}>
              <input value={link} placeholder="https://…" onChange={(e) => setLink(e.target.value)} />
            </Field>
            {link.trim() && !linkUrl && <p className="hint">Cole o link de um dos sites da lista.</p>}
            {linkUrl && (
              <button type="button" className="sm" onClick={() => open(linkUrl)}>
                Abrir no {linkSite!.name} <ExternalLink aria-hidden size={14} />
              </button>
            )}
            <Dropzone accept=".3mf,.gcode,.gco,.g,.bgcode,.stl,.obj" label="Já fatiou? Arraste o 3MF ou G-code" hint="Vai para a Calculadora com peso e tempo preenchidos." onFile={onDownloaded} />
            {dropError && <Alert kind="warn">{dropError}</Alert>}
          </section>
        </div>
      </div>
    </div>
  );
}
