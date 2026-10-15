import symbol from "../assets/brand/simbolo.svg?raw";
import animated from "../assets/brand/simbolo-animado.svg?raw";
import logoDark from "../assets/brand/logo-horizontal-escuro.svg";
import logoLight from "../assets/brand/logo-horizontal-cor.svg";

/**
 * Símbolo da UpVision (marca nova): o pórtico, as 3 camadas e o filamento, sem placa atrás. A cor do pórtico e da mesa
 * vem de --brand-ink (grafite no claro, quase branco no escuro). `animated` é o ciclo de 4 s da abertura e do carregamento.
 */
export default function BrandMark({ className = "", animated: loop = false }: { className?: string; animated?: boolean }) {
  return <span className={`brand-mark ${loop ? "animated" : ""} ${className}`} aria-hidden dangerouslySetInnerHTML={{ __html: loop ? animated : symbol }} />;
}

/** Logo horizontal: a versão certa para o tema (claro ou escuro) vem do CSS. Mínimo de 120 px de largura: abaixo disso, só o símbolo. */
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-logo ${className}`}>
      <img className="logo-light" src={logoLight} alt="" />
      <img className="logo-dark" src={logoDark} alt="" />
    </span>
  );
}
