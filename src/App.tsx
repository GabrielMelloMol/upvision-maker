import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { loadBackup, saveBackup } from "./backupActions";
import { errorText, useToast } from "./ui/Toast";
import AboutSheet from "./about/AboutSheet";
import { latestVersion, useUpdates } from "./about/useUpdates";
import { useAutoBackup } from "./backup/useAutoBackup";
import { notifyBackupDone } from "./backup/BackupSettingsCard";
import SuggestDialog from "./feedback/SuggestDialog";
import SyncBanner from "./sync/SyncBanner";
import { installPhoneBridge } from "./phone/api";
import { CHANGELOG, useWhatsNewAfterUpdate, WhatsNewModal } from "./whatsnew/WhatsNew";
import Onboarding, { useFirstRun } from "./onboarding/Onboarding";
import { PAGES } from "./pages";
import PageSkeleton from "./ui/PageSkeleton";
import Sidebar from "./ui/Sidebar";
import Toolbar from "./ui/Toolbar";
import CommandPalette from "./ui/CommandPalette";
import { setPendingOpen, type SearchItem } from "./ui/search";
import { installShortcuts, modKey } from "./ui/shortcuts";
import { CircleHelp, Search } from "lucide-react";
import { articleFor } from "./help/articles";
import HelpSheet from "./help/HelpSheet";
import { openHelp } from "./help/helpStore";

/** Rolagem a partir da qual o large title some e a toolbar mostra o título pequeno. */
const TITLE_SCROLL_PX = 48;

export default function App() {
  const [pageId, setPageId] = useState(PAGES[0].id);
  const [reloadKey, setReloadKey] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const updates = useUpdates();
  const [about, setAbout] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [afterUpdate, closeAfterUpdate] = useWhatsNewAfterUpdate();
  const [showAllNews, setShowAllNews] = useState(false);
  const [firstRun, closeFirstRun] = useFirstRun();
  const [searching, setSearching] = useState(false);
  const toast = useToast();
  const { reminderDays, neverBackedUp, backupNow } = useAutoBackup();
  const page = PAGES.find((p) => p.id === pageId) ?? PAGES[0];
  const remount = useCallback(() => setReloadKey((k) => k + 1), []);

  // tela aberta para o atalho "?" (o atalho é instalado uma vez só)
  const pageRef = useRef(pageId);
  useEffect(() => {
    pageRef.current = pageId;
  }, [pageId]);
  useEffect(() => installPhoneBridge(), []); // respostas para o celular na rede de casa (#16)
  useEffect(() => installShortcuts({ openPalette: () => setSearching(true), openHelp: () => void (articleFor(pageRef.current) && openHelp(pageRef.current)) }), []);

  function pick(item: SearchItem) {
    setSearching(false);
    setPendingOpen(item.recordId !== undefined ? { pageId: item.pageId, recordId: item.recordId } : null);
    if (item.pageId) {
      navigate(item.pageId);
      setReloadKey((k) => k + 1); // remonta mesmo se já estiver na página, para abrir o registro
    }
    if (item.help) openHelp(item.help);
  }

  function navigate(id: string) {
    setPageId(id);
    setScrolled(false);
  }

  async function onSave() {
    try {
      const path = await saveBackup();
      if (path) {
        toast(`Backup salvo em ${path}`);
        notifyBackupDone();
      }
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
        version={updates.version}
        updateAvailable={updates.status === "available"}
        onAbout={() => setAbout(true)}
      />
      <main key={`${page.id}-${reloadKey}`} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > TITLE_SCROLL_PX)}>
        <Toolbar title={page.label} icon={page.icon} scrolled={scrolled}>
          <button className="ghost sm search-btn" onClick={() => setSearching(true)} aria-keyshortcuts="Meta+K Control+K">
            <Search aria-hidden /> Buscar <kbd>{modKey()}</kbd>
            <kbd>K</kbd>
          </button>
          {articleFor(page.id) && (
            <button className="ghost sm icon-only help-btn" onClick={() => openHelp(page.id)} aria-label={`Ajuda: ${page.label}`} title="Ajuda desta tela (?)" aria-keyshortcuts="?">
              <CircleHelp aria-hidden />
            </button>
          )}
        </Toolbar>
        <div className="view">
          <SyncBanner onImported={remount} onOpenBackups={() => navigate("preferences")} />
          {reminderDays !== null && (
            <div className="banner warn" role="status">
              <span>{neverBackedUp ? "Você ainda não fez nenhum backup dos seus dados." : `Faz ${reminderDays} dias sem backup dos seus dados.`}</span>
              <button className="primary" onClick={() => backupNow().then(() => toast("Backup feito."), (e) => toast(`Não foi possível fazer o backup: ${errorText(e)}`, "error"))}>
                Fazer backup agora
              </button>
              <button className="ghost" onClick={() => navigate("preferences")}>
                Configurar
              </button>
            </div>
          )}
          {updates.update && !about && (
            <div className="banner">
              <span>Nova versão v{latestVersion(updates)} disponível.</span>
              <button className="primary" onClick={updates.install} disabled={updates.status === "installing"}>
                {updates.status === "installing" ? "Atualizando…" : "Atualizar e reiniciar"}
              </button>
              {updates.error && (
                <span className="error" role="alert">
                  {updates.error}
                </span>
              )}
            </div>
          )}
          <Suspense fallback={<PageSkeleton />}>{page.render(navigate)}</Suspense>
        </div>
      </main>
      {about && (
        <AboutSheet
          {...updates}
          onClose={() => setAbout(false)}
          onNews={() => {
            setAbout(false);
            setShowAllNews(true);
          }}
        />
      )}
      <HelpSheet />
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
