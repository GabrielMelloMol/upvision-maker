import mark from "../assets/brand/mark.svg?raw";

/** Símbolo da UpVision (#138). A estrutura segue `color` (escura no claro, clara no escuro); as camadas mantêm as cores da marca. */
export default function BrandMark({ className = "" }: { className?: string }) {
  return <span className={`brand-mark ${className}`} aria-hidden dangerouslySetInnerHTML={{ __html: mark }} />;
}

/** Nome no estilo do site da UpVision (#138): "Up" no azul da marca, "Vision" na cor do texto, "Maker" em laranja. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      <span className="wm-up">Up</span>Vision <span className="wm-maker">Maker</span>
    </span>
  );
}
