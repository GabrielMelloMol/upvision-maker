import { lazy, useCallback, useEffect, useRef, useState, Suspense } from "react";
import { loadBackup, saveBackup } from "./backupActions";
import { errorText, useToast } from "./ui/Toast";
import AboutSheet from "./about/AboutSheet";
import { hasUnsavedFields } from "./about/dirtyForms";
import { latestVersion, useUpdates } from "./about/useUpdates";
import { useAutoBackup } from "./backup/useAutoBackup";
import { notifyBackupDone } from "./backup/BackupSettingsCard";
import SuggestDialog from "./feedback/SuggestDialog";
import SyncBanner from "./sync/SyncBanner";
import { installPhoneBridge } from "./phone/api";
import { CHANGELOG, useWhatsNewAfterUpdate, WhatsNewModal } from "./whatsnew/WhatsNew";
import { useFirstRun } from "./onboarding/firstRun";
// só na primeira abertura: fora do carregamento inicial (#88)
const Onboarding = lazy(() => import("./onboarding/Onboarding"));
import { PAGE_REDIRECTS, PAGES } from "./pages";
import PageSkeleton from "./ui/PageSkeleton";
import { releaseHeavy } from "./ui/heavy";
import { refreshBed } from "./tools/bedPrinter";
import { openWith } from "./tools/intent";
import { flushPendingSaves } from "./tools/pendingSaves";
import { getDb } from "./db";
import { markStartup } from "./about/perf";
import { NAVIGATE_EVENT, requestNavigate } from "./ui/navigate";
import { placeOf } from "./tools/modelPlaces";
import { installZoomGuard, takeZoomHint } from "./ui/zoomGuard";
import Sidebar from "./ui/Sidebar";
import Toolbar from "./ui/Toolbar";
import CommandPalette from "./ui/CommandPalette";
import { setPendingOpen, type SearchItem } from "./ui/search";
import { installShortcuts, modKey } from "./ui/shortcuts";
import { useSidebarRail } from "./ui/useSidebarRail";
import { toggleTheme } from "./ui/theme";
import { CircleHelp, Search } from "lucide-react";
import { articleFor } from "./help/articles";
import HelpSheet from "./help/HelpSheet";
import TourHost from "./ui/Tour";
import { helpTopicFor, openHelp, useHelpTopic } from "./help/helpStore";

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
  const { reminderDays, neverBackedUp, backupError, backupNow } = useAutoBackup();
  const page = PAGES.find((p) => p.id === pageId) ?? PAGES[0];
  const helpId = useHelpTopic(page.id); // telas com abas (Organizadores) mostram a ajuda da aba aberta
  const helpArticle = articleFor(helpId);
  // gravações adiadas das ferramentas vão para o banco antes de a tela ser refeita (B1)
  const remount = useCallback(() => void flushPendingSaves().then(() => setReloadKey((k) => k + 1)), []);
  // dados que chegaram do outro computador com um formulário preenchido na tela: a tela só é refeita quando a pessoa quiser (B1)
  const [arrived, setArrived] = useState<string | null>(null);
  const onImported = useCallback(
    (from: string) => {
      if (hasUnsavedFields()) setArrived(from);
      else remount();
    },
    [remount],
  );

  // tela aberta para o atalho "?" (o atalho é instalado uma vez só)
  const pageRef = useRef(pageId);
  useEffect(() => {
    pageRef.current = pageId;
  }, [pageId]);
  useEffect(markStartup, []);
  // zoom da janela bloqueado: avisa uma vez onde aumentar a letra (Preferências > Aparência > Tamanho do texto)
  useEffect(
    () =>
      installZoomGuard(() => {
        if (!takeZoomHint()) return;
        toast("Para aumentar a letra, use Preferências > Aparência > Tamanho do texto.", "ok", {
          label: "Abrir",
          onClick: () => {
            openWith("preferences", { section: "look" });
            requestNavigate("preferences");
          },
        });
      }),
    [toast],
  );
  useEffect(() => void getDb().then(refreshBed).catch((e) => console.warn("Mesa da impressora:", e)), []); // #119
  // telas pedindo para abrir outra (ex.: "Levar para a Calculadora" das ferramentas 3D, #99)
  useEffect(() => {
    const onGo = (e: Event) => navigate((e as CustomEvent<string>).detail);
    window.addEventListener(NAVIGATE_EVENT, onGo);
    return () => window.removeEventListener(NAVIGATE_EVENT, onGo);
  }); // tempo de abertura para o Copiar informações (#88)
  useEffect(() => installPhoneBridge(), []); // respostas para o celular na rede de casa (#16)
  // app montado: a abertura some (src/splash.ts)
  useEffect(() => (window as unknown as { upvisionSplashDone?: () => void }).upvisionSplashDone?.(), []);
  const sidebar = useSidebarRail();
  const toggleSidebar = sidebar.toggle;
  useEffect(() => installShortcuts({ openPalette: () => setSearching(true), openHelp: () => void (articleFor(helpTopicFor(pageRef.current)) && openHelp(helpTopicFor(pageRef.current))), toggleSidebar, toggleTheme: () => void toggleTheme() }), [toggleSidebar]);

  function pick(item: SearchItem) {
    setSearching(false);
    if (item.run) return item.run();
    const place = placeOf(item.pageId, item.intent); // o modelo que virou aba de ferramenta abre na aba
    if (item.intent !== undefined) openWith(place.pageId, place.intent); // ex.: o modelo escolhido na busca
    setPendingOpen(item.recordId !== undefined ? { pageId: place.pageId, recordId: item.recordId } : null);
    if (item.pageId) {
      navigate(place.pageId);
      setReloadKey((k) => k + 1); // remonta mesmo se já estiver na página, para abrir o registro
    }
    if (item.help) openHelp(item.help);
  }

  function navigate(requested: string) {
    // tela que virou parte de outra (ex.: Organizador de gaveta → Organizadores): vai para a nova, já na aba certa
    const redirect = PAGE_REDIRECTS[requested];
    const id = redirect?.to ?? requested;
    if (redirect?.intent !== undefined) {
      openWith(redirect.to, redirect.intent);
      if (id === pageId) void flushPendingSaves().then(() => setReloadKey((k) => k + 1)); // já está nela: refaz para ler a aba
    }
    if (id !== pageId) releaseHeavy(); // solta motores WASM e workers da tela que saiu (#88)
    // mesa da impressora escolhida (#119): relê ao trocar de tela (impressora cadastrada ou trocada nas Preferências)
    getDb().then(refreshBed).catch((e) => console.warn("Mesa da impressora:", e));
    setPageId(id);
    setScrolled(false);
  }

  /** Backup e sincronização moram em Preferências › Seus dados (#179). */
  function openBackups() {
    if (pageId !== "preferences") openWith("preferences", { section: "data" });
    navigate("preferences");
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
    <div className="app" data-sidebar={sidebar.rail ? "rail" : "full"}>
      <Sidebar
        rail={sidebar.rail}
        onToggle={sidebar.toggle}
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
          {helpArticle && (
            <button className="ghost sm icon-only help-btn" onClick={() => openHelp(helpId)} aria-label={`Ajuda: ${helpId === page.id ? page.label : helpArticle.title}`} title="Ajuda desta tela (?)" aria-keyshortcuts="?">
              <CircleHelp aria-hidden />
            </button>
          )}
        </Toolbar>
        <div className="view">
          <SyncBanner onImported={onImported} onOpenBackups={openBackups} />
          {arrived && (
            <div className="banner warn" role="status">
              <span>Chegaram dados novos de {arrived}. Termine o que está preenchendo e atualize a tela para ver (o formulário aberto será fechado).</span>
              <button
                className="primary"
                onClick={() => {
                  setArrived(null);
                  remount();
                }}
              >
                Atualizar a tela
              </button>
            </div>
          )}
          {backupError && (
            <div className="banner warn" role="alert">
              <span>O backup automático falhou: {backupError}</span>
              <button className="primary" onClick={() => backupNow().then(() => toast("Backup feito."), (e) => toast(`Não foi possível fazer o backup: ${errorText(e)}`, "error"))}>
                Tentar de novo
              </button>
              <button className="ghost" onClick={openBackups}>
                Configurar
              </button>
            </div>
          )}
          {reminderDays !== null && !backupError && (
            <div className="banner warn" role="status">
              <span>{neverBackedUp ? "Você ainda não fez nenhum backup dos seus dados." : `Faz ${reminderDays} dias sem backup dos seus dados.`}</span>
              <button className="primary" onClick={() => backupNow().then(() => toast("Backup feito."), (e) => toast(`Não foi possível fazer o backup: ${errorText(e)}`, "error"))}>
                Fazer backup agora
              </button>
              <button className="ghost" onClick={openBackups}>
                Configurar
              </button>
            </div>
          )}
          {/* #155: aparece com o app aberto (checa a cada 1 h e ao voltar para a janela); "Depois" some até a próxima abertura */}
          {(updates.status === "available" || updates.status === "installing") && !updates.dismissed && !about && (
            <div className="banner" role="status">
              <span>Nova versão v{latestVersion(updates)} disponível.</span>
              <button className="ghost" onClick={() => setAbout(true)}>
                Ver novidades
              </button>
              {updates.update && (
                <button className="primary" onClick={updates.install} disabled={updates.status === "installing"}>
                  {updates.status === "installing" ? "Atualizando…" : "Atualizar agora"}
                </button>
              )}
              <button className="ghost" onClick={updates.dismiss} disabled={updates.status === "installing"}>
                Depois
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
      <TourHost pageId={page.id} />
      {searching && <CommandPalette pages={PAGES} onPick={pick} onClose={() => setSearching(false)} />}
      {suggesting && <SuggestDialog onClose={() => setSuggesting(false)} />}
      {afterUpdate.length > 0 && <WhatsNewModal entries={afterUpdate} onClose={closeAfterUpdate} />}
      {showAllNews && <WhatsNewModal entries={CHANGELOG} onClose={() => setShowAllNews(false)} />}
      {firstRun && afterUpdate.length === 0 && (
        <Suspense fallback={null}>
          <Onboarding
            onClose={() => {
              closeFirstRun();
              setReloadKey((k) => k + 1); // a página atual relê o que foi cadastrado
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
