import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Grupo arredondado com sombra suave. `title` vira o cabeçalho do grupo. */
export default function Card({ title, icon: Icon, className = "", children }: { title?: ReactNode; icon?: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <h2 className="card-title">
          {Icon && <Icon aria-hidden />}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
