import { DatabaseBackup, History, Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { loadBackup, saveBackup } from "./backupActions";
import { errorText, useToast } from "./ui/Toast";
import { findUpdate, installUpdate } from "./updater";
import logo from "./assets/logo.png";
import SuggestDialog from "./feedback/SuggestDialog";
import { CHANGELOG, useWhatsNewAfterUpdate, WhatsNewModal } from "./whatsnew/WhatsNew";
import { PAGES } from "./pages";

export default function App() {
  const [pageId, setPageId] = useState(PAGES[0].id);
  const [reloadKey, setReloadKey] = useState(0);
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [afterUpdate, closeAfterUpdate] = useWhatsNewAfterUpdate();
  const [showAllNews, setShowAllNews] = useState(false);
  const toast = useToast();
  const page = PAGES.find((p) => p.id === pageId) ?? PAGES[0];

  useEffect(() => {
    findUpdate().then(setUpdate);
  }, []);

  async function onSave() {
    try {
      const path = await saveBackup();
      if (path) toast(`Backup salvo em ${path}`);
    } catch (e) {
      toast(`Não foi possível salvar o backup: ${errorText(e)}`, "error");
    }
  }

  async function onRestore() {
    try {
      const r = await loadBackup();
      if (!r) return;
      setReloadKey((k) => k + 1); // remonta a página para reler os dados
      toast(`Backup restaurado. Cópia dos dados anteriores: ${r.safetyCopy}`);
    } catch (e) {
      toast(`Não foi possível restaurar: ${errorText(e)}`, "error");
    }
  }

  async function onInstall() {
    if (!update) return;
    setInstalling(true);
    try {
      await installUpdate(update);
    } catch (e) {
      setInstalling(false);
      toast(`Falha ao atualizar: ${errorText(e)}`, "error");
    }
  }

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Navegação principal">
        <button className="brand" onClick={() => setPageId("home")}>
          <img src={logo} alt="" />
          <span>
            UpVision Maker
            <small>Ferramentas para makers 3D</small>
          </span>
        </button>
        {PAGES.map((p, i) => {
          const header = p.group && p.group !== PAGES[i - 1]?.group ? <div className="group">{p.group}</div> : null;
          return (
            <div key={p.id} style={{ display: "contents" }}>
              {header}
              <button
                className={`nav ${p.id === page.id ? "active" : ""}`}
                aria-current={p.id === page.id ? "page" : undefined}
                onClick={() => setPageId(p.id)}
              >
                <p.icon aria-hidden />
                {p.label}
              </button>
            </div>
          );
        })}
        <div className="footer">
          <button className="link" onClick={() => setShowAllNews(true)}>
            O que há de novo
          </button>
          <button className="suggest" onClick={() => setSuggesting(true)}>
            <Lightbulb aria-hidden /> Sugerir ferramenta
          </button>
          <button onClick={onSave}>
            <DatabaseBackup aria-hidden /> Fazer backup
          </button>
          <button onClick={onRestore}>
            <History aria-hidden /> Restaurar backup
          </button>
        </div>
      </nav>
      <main key={`${page.id}-${reloadKey}`}>
        {update && (
          <div className="banner">
            <span>Nova versão {update.version} disponível.</span>
            <button className="primary" onClick={onInstall} disabled={installing}>
              {installing ? "Atualizando…" : "Atualizar e reiniciar"}
            </button>
          </div>
        )}
        {page.render(setPageId)}
      </main>
      {suggesting && <SuggestDialog onClose={() => setSuggesting(false)} />}
      {afterUpdate.length > 0 && <WhatsNewModal entries={afterUpdate} onClose={closeAfterUpdate} />}
      {showAllNews && <WhatsNewModal entries={CHANGELOG} onClose={() => setShowAllNews(false)} />}
    </div>
  );
}
