import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary = ação principal (azul) · action = exportar/salvar arquivo (laranja) · secondary · ghost · link · danger */
  variant?: "primary" | "action" | "secondary" | "ghost" | "link" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
};

/** Botão do design system. Equivale a <button className="primary lg">; use o que for mais legível. */
export default function Button({ variant = "secondary", size = "md", icon: Icon, className = "", type = "button", children, ...rest }: Props) {
  const cls = [variant === "secondary" ? "" : variant, size === "md" ? "" : size, className].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls || undefined} {...rest}>
      {Icon && <Icon aria-hidden />}
      {children}
    </button>
  );
}
