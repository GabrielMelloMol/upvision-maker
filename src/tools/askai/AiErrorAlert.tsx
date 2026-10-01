import { Copy } from "lucide-react";
import { useState } from "react";
import type { AiErrorInfo } from "../../ai/claude";
import Alert from "../../ui/Alert";

/** Erro da IA em português; o texto técnico fica recolhido em "Ver detalhes", com botão de copiar (#157). */
export default function AiErrorAlert({ info }: { info: AiErrorInfo }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(info.detail ?? "");
      setCopied("Copiado.");
    } catch {
      setCopied("Não consegui copiar; selecione o texto acima.");
    }
  }
  return (
    <Alert kind="error">
      {info.text}
      {info.steps && (
        <ol className="ai-error-steps">
          {info.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      {info.detail && (
        <details className="ai-error-detail">
          <summary>Ver detalhes</summary>
          <pre>{info.detail}</pre>
          <button type="button" onClick={() => void copy()}>
            <Copy aria-hidden /> Copiar
          </button>
          {copied && <span className="hint"> {copied}</span>}
        </details>
      )}
    </Alert>
  );
}
