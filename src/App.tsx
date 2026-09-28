import { useEffect, useState, Suspense } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { loadBackup, saveBackup } from "./backupActions";
import { errorText, useToast } from "./ui/Toast";
import { findUpdate, installUpdate } from "./updater";
import SuggestDialog from "./feedback/SuggestDialog";
import { CHANGELOG, useWhatsNewAfterUpdate, WhatsNewModal } from "./whatsnew/WhatsNew";
import Onboarding, { useFirstRun } from "./onboarding/Onboarding";
import { PAGES } from "./pages";
import PageSkeleton from "./ui/PageSkeleton";
import Sidebar from "./ui/Sidebar";
import Toolbar from "./ui/Toolbar";
import CommandPalette from "./ui/CommandPalette";
import { setPendingOpen, type SearchItem } from "./ui/search";
import { installShortcuts, modKey } from "./ui/shortcuts";
import { Search } from "lucide-react";

/** Rolagem a partir da qual o large title some e a toolbar mostra o título pequeno. */
const TITLE_SCROLL_PX = 48;

export default function App() {
  const [pageId, setPageId] = useState(PAGES[0].id);
  const [reloadKey, setReloadKey] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [afterUpdate, closeAfterUpdate] = useWhatsNewAfterUpdate();
  const [showAllNews, setShowAllNews] = useState(false);
  const [firstRun, closeFirstRun] = useFirstRun();
  const [searching, setSearching] = useState(false);
  const toast = useToast();
  const page = PAGES.find((p) => p.id === pageId) ?? PAGES[0];

  useEffect(() => {
    findUpdate().then(setUpdate);
  }, []);
  useEffect(() => installShortcuts({ openPalette: () => setSearching(true) }), []);

  function pick(item: SearchItem) {
    setSearching(false);
    setPendingOpen(item.recordId !== undefined ? { pageId: item.pageId, recordId: item.recordId } : null);
    navigate(item.pageId);
    setReloadKey((k) => k + 1); // remonta mesmo se já estiver na página, para abrir o registro
  }

  function navigate(id: string) {
    setPageId(id);
    setScrolled(false);
  }

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
      <Sidebar
        pages={PAGES}
        current={page.id}
        onNavigate={navigate}
        onNews={() => setShowAllNews(true)}
        onSuggest={() => setSuggesting(true)}
        onBackup={onSave}
        onRestore={onRestore}
      />
      <main key={`${page.id}-${reloadKey}`} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > TITLE_SCROLL_PX)}>
        <Toolbar title={page.label} icon={page.icon} scrolled={scrolled}>
          <button className="ghost sm search-btn" onClick={() => setSearching(true)} aria-keyshortcuts="Meta+K Control+K">
            <Search aria-hidden /> Buscar <kbd>{modKey()}</kbd>
            <kbd>K</kbd>
          </button>
        </Toolbar>
        <div className="view">
          {update && (
            <div className="banner">
              <span>Nova versão {update.version} disponível.</span>
              <button className="primary" onClick={onInstall} disabled={installing}>
                {installing ? "Atualizando…" : "Atualizar e reiniciar"}
              </button>
            </div>
          )}
          <Suspense fallback={<PageSkeleton />}>{page.render(navigate)}</Suspense>
        </div>
      </main>
      {searching && <CommandPalette pages={PAGES} onPick={pick} onClose={() => setSearching(false)} />}
      {suggesting && <SuggestDialog onClose={() => setSuggesting(false)} />}
      {afterUpdate.length > 0 && <WhatsNewModal entries={afterUpdate} onClose={closeAfterUpdate} />}
      {showAllNews && <WhatsNewModal entries={CHANGELOG} onClose={() => setShowAllNews(false)} />}
      {firstRun && afterUpdate.length === 0 && (
        <Onboarding
          onClose={() => {
            closeFirstRun();
            setReloadKey((k) => k + 1); // a página atual relê o que foi cadastrado
          }}
        />
      )}
    </div>
  );
}
