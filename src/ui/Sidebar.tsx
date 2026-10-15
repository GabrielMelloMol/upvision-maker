import { Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SECTIONS, type PageDef, type SectionDef } from "../pages";
import { modKey } from "./shortcuts";
import { BrandLogo } from "./BrandMark";
import { toggleTheme, useDarkNow } from "./theme";

/** Dica dos ícones da faixa recolhida (#167): espera um pouco para não piscar quando o mouse só passa por cima. */
const TIP_DELAY_MS = 300;
const TIP_GAP_PX = 8;
/** Menu das telas da seção aberta na faixa recolhida: some um instante depois que o mouse sai, para dar tempo de cruzar até ele. */
const MENU_CLOSE_MS = 250;
const MENU_ITEM_PX = 32;
const MENU_CHROME_PX = 56;

type MenuItem = { key: string; label: string; active: boolean; run: () => void };
type Menus = Record<string, { label: string; items: MenuItem[] }>;

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

  // faixa recolhida: as telas da seção aberta não cabem na faixa e viram um menu ao lado do ícone (a seção "Criar" só mostra a ferramenta aberta, sem menu)
  const menus: Menus = {};
  for (const s of SECTIONS) {
    const items: MenuItem[] = [
      ...sub(s).map((p) => ({ key: p.id, label: p.label, active: p.id === current, run: () => onNavigate(p.id) })),
      ...(s.id === "settings" ? actions.map((a) => ({ key: a.label, label: a.label, active: false, run: a.run })) : []),
    ];
    if (s.id !== "create" && items.length) menus[s.id] = { label: s.label, items };
  }
  const tip = useRailTip(rail, menus);

  const item = (s: SectionDef) => {
    const children = sub(s);
    return (
      <div className="nav-section" key={s.id}>
        {/* a seção só fica marcada quando não mostra telas embaixo; senão quem fica marcada é a tela */}
        <button className={`nav ${s.id === open ? "open" : ""} ${s.id === open && !children.length ? "active" : ""}`} aria-current={s.id === open && !children.length ? "page" : undefined} data-page={s.landing} data-tip={s.label} data-menu={rail && menus[s.id] ? s.id : undefined} aria-haspopup={rail && menus[s.id] ? "menu" : undefined} onClick={() => onNavigate(s.landing)} onKeyDown={(e) => rail && menus[s.id] && (e.key === "ArrowRight" || e.key === "ArrowDown") && (e.preventDefault(), tip.openMenu(e.currentTarget))}>
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
        <button className="brand" aria-label="UpVision Maker" onClick={() => onNavigate("home")}>
          <BrandLogo />
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
 * No ícone da seção aberta, a dica vira o menu das telas dela (sem isso, na janela de 900 px, elas ficavam inalcançáveis).
 */
function useRailTip(rail: boolean, menus: Menus) {
  const [tip, setTip] = useState<{ label: string; x: number; y: number; menu?: string; focusFirst?: boolean } | null>(null);
  const timer = useRef(0);
  const origin = useRef<HTMLElement | null>(null);
  const restoring = useRef(false); // devolver o foco ao ícone (Esc) não reabre o menu
  const hide = () => {
    clearTimeout(timer.current);
    origin.current = null;
    setTip(null);
  };
  const hideLater = () => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      origin.current = null;
      setTip(null);
    }, MENU_CLOSE_MS);
  };
  const place = (el: HTMLElement, focusFirst = false) => {
    const r = el.getBoundingClientRect();
    const id = el.dataset.menu;
    const items = id ? menus[id]?.items.length ?? 0 : 0;
    const top = id ? Math.max(8, Math.min(r.top, window.innerHeight - (items * MENU_ITEM_PX + MENU_CHROME_PX) - 8)) : r.top + r.height / 2;
    setTip({ label: el.dataset.tip!, x: r.right + (id ? 0 : TIP_GAP_PX), y: top, menu: id && menus[id] ? id : undefined, focusFirst });
  };
  const show = (target: EventTarget, ms: number) => {
    const el = (target as Element).closest?.<HTMLElement>("[data-tip]");
    clearTimeout(timer.current);
    if (!rail || !el) return setTip(null);
    timer.current = window.setTimeout(() => {
      origin.current = el;
      place(el);
    }, ms);
  };
  useEffect(() => hide, [rail]);
  const handlers = rail
    ? {
        // pointermove (e não over): depois de clicar na seção, mexer o mouse no mesmo ícone mostra o menu que acabou de existir
        // (o menu é filho do nav na árvore do React: o que acontece dentro dele não conta aqui)
        onPointerMove: (e: React.PointerEvent) => e.pointerType === "mouse" && !(e.target as Element).closest(".rail-menu") && (e.target as Element).closest("[data-tip]") !== origin.current && show(e.target, TIP_DELAY_MS),
        onPointerLeave: () => (tip?.menu ? hideLater() : hide()),
        onPointerDown: (e: React.PointerEvent) => !(e.target as Element).closest("[data-menu], .rail-menu") && hide(),
        onFocus: (e: React.FocusEvent) => !restoring.current && (e.target as HTMLElement).matches(":focus-visible") && !(e.target as Element).closest(".rail-menu") && show(e.target, 0),
        onBlur: (e: React.FocusEvent) => !(e.relatedTarget as Element | null)?.closest?.(".rail-menu") && hide(),
      }
    : {};
  const menu = tip?.menu ? menus[tip.menu] : null;
  const close = (restoreFocus: boolean) => {
    const back = origin.current;
    hide();
    if (restoreFocus && back) {
      restoring.current = true;
      back.focus();
      restoring.current = false;
    }
  };
  const onMenuKey = (e: React.KeyboardEvent<HTMLElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") close(true);
    else if (e.key === "ArrowDown") items[(i + 1) % items.length]?.focus();
    else if (e.key === "ArrowUp") items[(i - 1 + items.length) % items.length]?.focus();
    else return;
    e.preventDefault();
  };
  const node =
    tip &&
    createPortal(
      menu ? (
        <div className="rail-menu" style={{ left: tip.x, top: tip.y }} onPointerEnter={() => clearTimeout(timer.current)} onPointerLeave={hideLater} onKeyDown={onMenuKey}>
          <div className="rail-menu-card" role="menu" aria-label={menu.label}>
            <div className="rail-menu-title" aria-hidden>
              {menu.label}
            </div>
            {menu.items.map((it, i) => (
              <button
                key={it.key}
                role="menuitem"
                className={it.active ? "active" : ""}
                aria-current={it.active ? "page" : undefined}
                ref={(el) => {
                  if (i === 0 && tip.focusFirst && el && !el.parentElement?.contains(document.activeElement)) el.focus();
                }}
                onClick={() => {
                  close(false);
                  it.run();
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rail-tip" aria-hidden style={{ left: tip.x, top: tip.y }}>
          {tip.label}
        </div>
      ),
      document.body,
    );
  return { handlers, node, openMenu: (el: HTMLElement) => { origin.current = el; place(el, true); } };
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
