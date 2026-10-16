import { Copy } from "lucide-react";
import { useState } from "react";
import { errorText, useToast } from "../ui/Toast";

/** Texto pronto para pedir a silhueta a uma IA de imagem: simétrica, preta e sólida, sem pontas nem detalhes. */
const silhouettePrompt = (subject: string, use: string): string =>
  `Desenhe a silhueta de ${subject.trim() || "um coração"} para ${use}. Vista de frente, perfeitamente simétrica pelo eixo vertical e centralizada no quadro. ` +
  "Preencha a forma de preto sólido sobre fundo branco liso. Use contornos arredondados e suaves, sem pontas finas, sem detalhes internos, sem texto, sem sombra e sem gradiente. " +
  "Forma simples e grande, que ocupe quase todo o quadro, com margem em volta.";

/** Cartão "Pedir a silhueta para uma IA": o texto pronto e o botão Copiar. */
export default function ThermoPrompt({ use }: { use: string }) {
  const toast = useToast();
  const [subject, setSubject] = useState("um coração");
  const text = silhouettePrompt(subject, use);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast("Texto copiado: cole na sua IA de imagem.", "ok");
    } catch (e) {
      toast(errorText(e), "error");
    }
  }
  return (
    <details className="advanced">
      <summary>Não tem a silhueta? Peça a uma IA de imagem</summary>
      <div className="stack">
        <label>
          O que desenhar
          <input value={subject} maxLength={60} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <textarea readOnly rows={5} value={text} aria-label="Texto para a IA de imagem" />
        <button type="button" onClick={() => void copy()}>
          <Copy aria-hidden size={14} /> Copiar texto
        </button>
        <span className="hint">Salve a imagem que a IA devolver e envie em "Imagem ou SVG". Se sair com um lado diferente do outro, use "Espelhar a esquerda".</span>
      </div>
    </details>
  );
}
