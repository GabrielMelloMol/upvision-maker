import { Calculator, Check, FileText, Shapes, X } from "lucide-react";
import type { Go } from "../pages";
import { openHelp, requestExample } from "./helpStore";

/** O que já tem algo feito no app: o 1º projeto, o 1º cálculo de preço, o 1º orçamento. */
export type StartSteps = { project: boolean; calculator: boolean; quote: boolean };

/** O quadro só serve a quem acabou de instalar: some com o 1º projeto, o 1º cálculo ou ao fechar no X (#253). */
export const startHereOver = (s: StartSteps, closed: boolean) => closed || s.project || s.calculator;

/**
 * "Comece por aqui" na tela inicial (#84, #253): três primeiros passos. Cada passo já feito ganha o selo "feito".
 * Quem fecha no X não vê de novo; o `onClose` grava isso nas preferências (banco, entra no backup).
 */
export default function StartHere({ go, done: finished, onClose }: { go: Go; done: StartSteps; onClose: () => void }) {
  const steps = [
    { key: "project", icon: Shapes, title: "Escolha um produto em Criar", text: "Chaveiro, placa Pix, topo de bolo… com foto, para escolher.", run: () => go("create") },
    {
      key: "calculator",
      icon: Calculator,
      title: "Calcule um preço",
      text: "A calculadora abre com um exemplo preenchido.",
      run: () => {
        requestExample("calculator");
        go("calculator");
      },
    },
    {
      key: "quote",
      icon: FileText,
      title: "Faça um orçamento",
      text: "PDF com seu logo e o QR Pix do valor.",
      run: () => {
        go("quotes");
        openHelp("quotes");
      },
    },
  ];
  return (
    <section className="start-here" aria-label="Comece por aqui">
      <div className="start-here-head">
        <h2>Comece por aqui</h2>
        <button type="button" className="ghost icon-only" aria-label="Fechar Comece por aqui" onClick={onClose}>
          <X aria-hidden />
        </button>
      </div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.title}>
            <button type="button" onClick={s.run}>
              <span className="start-n" aria-hidden>
                {i + 1}
              </span>
              <s.icon aria-hidden />
              <strong>
                {s.title}
                {finished[s.key as keyof StartSteps] && (
                  <span className="start-done">
                    <Check aria-hidden /> feito
                  </span>
                )}
              </strong>
              <span>{s.text}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="hint">Em qualquer tela, o botão ? (ou a tecla ?) mostra como usar.</p>
    </section>
  );
}
