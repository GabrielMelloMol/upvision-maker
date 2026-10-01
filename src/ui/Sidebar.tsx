import { Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Intenção do hover na faixa recolhida (#156): abrir só com o mouse parado nela; fechar sem pressa ao sair. */
const PEEK_OPEN_MS = 150;
const PEEK_CLOSE_MS = 300;
import { SECTIONS, type PageDef, type SectionDef } from "../pages";
import { modKey } from "./shortcuts";
import BrandMark, { Wordmark } from "./BrandMark";
import { toggleTheme, useDarkNow } from "./theme";

type Props = {
  pages: PageDef[];
  current: string;
  onNavigate: (id: string) => void;
  onNews: () => void;
  onSuggest: () => void;
  onBackup: () => void;
  onRestore: () => void;
  /** Versão instalada (rodapé) e se há atualização (selo). Clicar abre "Sobre". */
  version?: string | null;
  updateAvailable?: boolean;
  onAbout?: () => void;
  /** Recolhida em faixa de ícones (#139): passar o mouse ou o foco expande por cima do conteúdo. */
  rail?: boolean;
  /** Janela estreita: fica recolhida sem escolha, então o botão some. */
  narrow?: boolean;
  onToggle?: () => void;
};

/**
 * Barra lateral (#139): cinco seções e Ajustes. Só a seção aberta mostra as telas dela, recuadas e sem ícone.
 * As ferramentas ficam na galeria Criar; a que estiver aberta aparece embaixo de Criar.
 */
export default function Sidebar({ pages, current, onNavigate, onNews, onSuggest, onBackup, onRestore, version, updateAvailable, onAbout, rail = false, narrow = false, onToggle }: Props) {
  const page = pages.find((p) => p.id === current);
  const open = page?.section ?? "home";
  // recolhida (#156): o painel abre por cima com o mouse parado nela (150 ms) e fecha 300 ms depois de sair; o foco do
  // teclado também abre. Ao recolher, fecha na hora (mesmo com o mouse em cima).
  const [peek, setPeek] = useState(false);
  const timer = useRef(0);
  const navRef = useRef<HTMLElement>(null);
  const later = (open: boolean, ms: number) => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPeek(open), ms);
  };
  useEffect(() => {
    clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recolher/expandir zera o painel (o rail vem de fora)
    setPeek(false);
    const el = document.activeElement as HTMLElement | null;
    if (rail && el?.closest(".sidebar") && !el.matches(".sidebar-toggle")) el.blur();
  }, [rail]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const peekProps = rail
    ? {
        "data-peek": peek || undefined,
        onPointerEnter: (e: React.PointerEvent) => e.pointerType === "mouse" && later(true, PEEK_OPEN_MS),
        onPointerLeave: () => later(false, PEEK_CLOSE_MS),
        onFocus: (e: React.FocusEvent) => (e.target as HTMLElement).matches(":focus-visible") && later(true, 0),
        onBlur: (e: React.FocusEvent) => !navRef.current?.contains(e.relatedTarget as Node) && later(false, 0),
      }
    : {};
  const sub = (s: SectionDef) => {
    if (s.id !== open) return [];
    if (s.id === "create") return page && page.id !== "create" ? [page] : [];
    return pages.filter((p) => p.section === s.id && s.id !== "home");
  };
  const actions =
    open === "settings"
      ? [
          { label: "Fazer backup", run: onBackup },
          { label: "Restaurar backup", run: onRestore },
          { label: "O que há de novo", run: onNews },
          { label: "Sugerir ferramenta", run: onSuggest },
        ]
      : [];

  const item = (s: SectionDef) => {
    const children = sub(s);
    return (
      <div className="nav-section" key={s.id}>
        {/* a seção só fica marcada quando não mostra telas embaixo; senão quem fica marcada é a tela */}
        <button className={`nav ${s.id === open ? "open" : ""} ${s.id === open && !children.length ? "active" : ""}`} aria-current={s.id === open && !children.length ? "page" : undefined} data-page={s.landing} title={rail ? s.label : undefined} onClick={() => onNavigate(s.landing)}>
          <s.icon aria-hidden />
          <span className="label">{s.label}</span>
        </button>
        {(children.length > 0 || (s.id === "settings" && actions.length > 0)) && (
          <div className="subnav">
            {children.map((p) => (
              <button key={p.id} title={p.label} className={`nav sub ${p.id === current ? "active" : ""}`} aria-current={p.id === current ? "page" : undefined} data-page={p.id} onClick={() => onNavigate(p.id)}>
                {p.label}
              </button>
            ))}
            {s.id === "settings" &&
              actions.map((a) => (
                <button key={a.label} className="nav sub" onClick={a.run}>
                  {a.label}
                </button>
              ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav ref={navRef} className="sidebar" aria-label="Navegação principal" {...peekProps}>
      <div className="drag" data-tauri-drag-region />
      <div className="sidebar-head">
        <button className="brand" onClick={() => onNavigate("home")}>
          <BrandMark />
          <Wordmark className="brand-name" />
        </button>
        {onToggle && !narrow && (
          <button type="button" className="ghost icon-only sm sidebar-toggle" onClick={onToggle} aria-label={rail ? "Expandir barra lateral" : "Recolher barra lateral"} title={`${rail ? "Expandir" : "Recolher"} (${modKey()}${modKey() === "⌘" ? "⌥" : "+Alt+"}S)`} aria-keyshortcuts="Meta+Alt+S Control+Alt+S">
            {rail ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
          </button>
        )}
      </div>
      <div className="scroll">{SECTIONS.filter((s) => s.id !== "settings").map(item)}</div>
      <div className="footer">
        {SECTIONS.filter((s) => s.id === "settings").map(item)}
        <div className="footer-row">
        {onAbout && (
          <button className={`version ${updateAvailable ? "has-update" : ""}`} onClick={onAbout} aria-label={`Versão ${version ?? ""}${updateAvailable ? ", atualização disponível" : ""}: abrir Sobre`}>
            <span>v{version ?? "…"}</span>
            {updateAvailable && <span className="update-pill">Atualização disponível</span>}
          </button>
        )}
          <ThemeButton />
        </div>
      </div>
    </nav>
  );
}

/** Sol/lua no rodapé (#152): alterna claro e escuro; Automático fica em Ajustes → Preferências → Aparência. */
function ThemeButton() {
  const dark = useDarkNow();
  const label = dark ? "Modo claro" : "Modo escuro";
  const shortcut = `${modKey()}${modKey() === "⌘" ? "⇧" : "+Shift+"}L`;
  return (
    <button type="button" className="ghost icon-only sm theme-toggle" onClick={() => void toggleTheme()} aria-label={label} title={`${label} (${shortcut})`} aria-keyshortcuts="Meta+Shift+L Control+Shift+L">
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </button>
  );
}
