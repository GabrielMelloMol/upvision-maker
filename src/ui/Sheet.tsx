import { X, type LucideIcon } from "lucide-react";
import { useId, useLayoutEffect, useRef, type FormEvent, type ReactNode } from "react";

type Props = {
  title: ReactNode;
  icon?: LucideIcon;
  onClose: () => void;
  children: ReactNode;
  /** Botões do rodapé (o principal por último, à direita). */
  footer?: ReactNode;
  /** Se passado, corpo + rodapé viram um <form> (Enter envia). */
  onSubmit?: (e: FormEvent) => void;
  wide?: boolean;
};

/**
 * Modal com <dialog> nativo: prende o foco, fecha com Esc ou clique fora e devolve o foco a quem abriu.
 * Para focar um campo ao abrir, marque-o com `data-autofocus`.
 */
export default function Sheet({ title, icon: Icon, onClose, children, footer, onSubmit, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  // Layout effect: a limpeza roda antes de o <dialog> sair do DOM, então dá para devolver o foco.
  useLayoutEffect(() => {
    const d = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      d.close();
      opener?.focus?.();
    };
  }, []);

  const Body = onSubmit ? "form" : "div";
  return (
    <dialog
      ref={ref}
      className={`sheet ${wide ? "wide" : ""}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <Body className="sheet-inner" onSubmit={onSubmit} noValidate={onSubmit ? true : undefined}>
        <header className="sheet-head">
          {Icon && <Icon aria-hidden className="sheet-icon" />}
          <h2 id={id}>{title}</h2>
          <button type="button" className="ghost icon-only" aria-label="Fechar" onClick={onClose}>
            <X aria-hidden />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </Body>
    </dialog>
  );
}
