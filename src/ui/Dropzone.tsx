import { Upload } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
  accept: string;
  label: string;
  hint?: string;
  onFile: (f: File) => void;
  /** Botão pequeno numa linha (ex.: "Trocar foto" depois de escolher), ainda aceitando soltar o arquivo. */
  compact?: boolean;
};

/** Área de arrastar e soltar + clique para escolher arquivo. */
export default function Dropzone({ accept, label, hint, onFile, compact = false }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`dropzone ${compact ? "compact" : ""} ${over ? "over" : ""}`}
      role="button"
      tabIndex={0}
      // o clique programático no <input> sobe até aqui de novo: ignora para não entrar em loop
      onClick={(e) => e.target !== input.current && input.current?.click()}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); // Espaço não rola a página
        input.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <Upload aria-hidden />
      <strong>{label}</strong>
      {hint && !compact && <span className="small">{hint}</span>}
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
