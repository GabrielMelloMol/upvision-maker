import glyph from "../assets/brand/glyph.svg?raw";

/**
 * Símbolo da UpVision (#151, opção A): a pilha de 3 camadas num mini-ícone (squircle branco no claro, grafite no
 * escuro), como o ícone do app. O mesmo na barra lateral, no Sobre, nas boas-vindas e na abertura.
 */
export default function BrandMark({ className = "" }: { className?: string }) {
  return <span className={`brand-mark ${className}`} aria-hidden dangerouslySetInnerHTML={{ __html: glyph }} />;
}

/** Nome do app em SF Pro semibold na cor do texto (padrão Apple: sem azul/laranja no nome). */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`wordmark ${className}`}>UpVision Maker</span>;
}
