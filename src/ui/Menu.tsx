import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean };
type Props = { label: string; items: MenuItem[]; icon?: ReactNode };

/**
 * Menu ⋯ (#161): botão com aria-haspopup e uma lista role="menu". Setas, Home/End andam (com volta), Enter/Espaço
 * escolhem, Esc ou Tab fecham; ao fechar o foco volta ao botão. Clicar fora fecha sem escolher.
 */
export default function Menu({ label, items, icon }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const enabled = () => [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];

  useEffect(() => {
    if (!open) return;
    enabled()[0]?.focus();
    const outside = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  function onKey(e: KeyboardEvent) {
    const els = enabled();
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => {
      e.preventDefault();
      els[(n + els.length) % els.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(els.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") setOpen(false);
  }

  return (
    <div className="menu-wrap">
      <button
        ref={trigger}
        type="button"
        className="ghost icon-only sm"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          // ↓ (ou ↑) no botão abre o menu, como nos menus do sistema
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon ?? <MoreHorizontal aria-hidden size={16} />}
      </button>
      {open && (
        <div ref={list} id={id} className="menu-pop" role="menu" aria-label={label} onKeyDown={onKey}>
          {items.map((it, i) => [
            // hairline antes da ação destrutiva (Excluir), separada das outras
            it.danger && i > 0 && !items[i - 1].danger ? <div key={`sep-${it.label}`} role="separator" className="menu-sep" /> : null,
            <button
              key={it.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={it.disabled}
              className={it.danger ? "danger" : undefined}
              onClick={() => {
                close();
                it.onSelect();
              }}
            >
              {it.label}
            </button>,
          ])}
        </div>
      )}
    </div>
  );
}
