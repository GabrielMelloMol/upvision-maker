import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode };

/** Estado vazio amigável: ilustração, frase humana e no máximo uma ação principal. */
export default function EmptyState({ icon: Icon, title, children, action }: Props) {
  return (
    <div className="empty" role="status">
      <div className="art" aria-hidden>
        <Icon />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="row">{action}</div>}
    </div>
  );
}
