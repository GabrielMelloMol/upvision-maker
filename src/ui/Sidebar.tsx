import { Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SECTIONS, type PageDef, type SectionDef } from "../pages";
import { modKey } from "./shortcuts";
import BrandMark, { Wordmark } from "./BrandMark";
import { toggleTheme, useDarkNow } from "./theme";

/** Dica dos ícones da faixa recolhida (#167): espera um pouco para não piscar quando o mouse só passa por cima. */
const TIP_DELAY_MS = 300;
const TIP_GAP_PX = 8;

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
  /** Recolhida em faixa de ícones (#167): só o botão e o atalho abrem e fecham; o conteúdo divide o espaço com ela. */
  rail?: boolean;
  onToggle?: () => void;
};

/**
 * Barra lateral (#139): cinco seções e Ajustes. Só a seção aberta mostra as telas dela, recuadas e sem ícone.
 * As ferramentas ficam na galeria Criar; a que estiver aberta aparece embaixo de Criar.
 */
export default function Sidebar({ pages, current, onNavigate, onNews, onSuggest, onBackup, onRestore, version, updateAvailable, onAbout, rail = false, onToggle }: Props) {
  const page = pages.find((p) => p.id === current);
  const open = page?.section ?? "home";
  const tip = useRailTip(rail);
  const toggleKeys = `${modKey()}${modKey() === "⌘" ? "⌥" : "+Alt+"}S`;
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
        <button className={`nav ${s.id === open ? "open" : ""} ${s.id === open && !children.length ? "active" : ""}`} aria-current={s.id === open && !children.length ? "page" : undefined} data-page={s.landing} data-tip={s.label} onClick={() => onNavigate(s.landing)}>
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
    <nav className="sidebar" aria-label="Navegação principal" {...tip.handlers}>
      <div className="drag" data-tauri-drag-region />
      <div className="sidebar-head">
        <button className="brand" onClick={() => onNavigate("home")}>
          <BrandMark />
          <Wordmark className="brand-name" />
        </button>
        {onToggle && (
          <button type="button" className="ghost icon-only sm sidebar-toggle" onClick={onToggle} aria-label={rail ? "Expandir barra lateral" : "Recolher barra lateral"} title={rail ? undefined : `Recolher (${toggleKeys})`} data-tip={`Expandir (${toggleKeys})`} aria-keyshortcuts="Meta+Alt+S Control+Alt+S">
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
      {tip.node}
    </nav>
  );
}

/**
 * Dica ao lado do ícone na faixa recolhida (#167), como o Tooltip do shadcn/ui: mouse parado ou foco do teclado. Fica no
 * body porque a barra corta o que passa da borda dela. O nome do botão continua no texto escondido (leitor de tela).
 */
function useRailTip(rail: boolean) {
  const [tip, setTip] = useState<{ label: string; x: number; y: number } | null>(null);
  const timer = useRef(0);
  const hide = () => {
    clearTimeout(timer.current);
    setTip(null);
  };
  const show = (target: EventTarget, ms: number) => {
    const el = (target as Element).closest?.<HTMLElement>("[data-tip]");
    clearTimeout(timer.current);
    if (!rail || !el) return setTip(null);
    timer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      setTip({ label: el.dataset.tip!, x: r.right + TIP_GAP_PX, y: r.top + r.height / 2 });
    }, ms);
  };
  useEffect(() => hide, [rail]);
  const handlers = rail
    ? {
        onPointerOver: (e: React.PointerEvent) => e.pointerType === "mouse" && show(e.target, TIP_DELAY_MS),
        onPointerLeave: hide,
        onPointerDown: hide,
        onFocus: (e: React.FocusEvent) => (e.target as HTMLElement).matches(":focus-visible") && show(e.target, 0),
        onBlur: hide,
      }
    : {};
  const node =
    tip &&
    createPortal(
      <div className="rail-tip" aria-hidden style={{ left: tip.x, top: tip.y }}>
        {tip.label}
      </div>,
      document.body,
    );
  return { handlers, node };
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
