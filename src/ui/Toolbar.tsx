import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Barra superior da página: fica translúcida e mostra o título pequeno quando o large title sai da tela. */
export default function Toolbar({ title, icon: Icon, scrolled, children }: { title: string; icon?: LucideIcon; scrolled: boolean; children?: ReactNode }) {
  return (
    <div className={`toolbar ${scrolled ? "scrolled" : ""}`} data-tauri-drag-region>
      <div className="title" aria-hidden={!scrolled}>
        {Icon && <Icon aria-hidden />}
        {title}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
