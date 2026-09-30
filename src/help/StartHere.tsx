import { Calculator, FileText, KeyRound, X } from "lucide-react";
import { useState } from "react";
import type { Go } from "../pages";
import { openHelp, requestExample } from "./helpStore";

const DONE_KEY = "upvision.startHere.done";

function loadDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

/** "Comece por aqui" na tela inicial (#84): três primeiros passos até a pessoa fechar. */
export default function StartHere({ go }: { go: Go }) {
  const [done, setDone] = useState(loadDone);
  if (done) return null;
  const close = () => {
    setDone(true);
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      // sem armazenamento local: volta a aparecer na próxima abertura
    }
  };
  const steps = [
    { icon: KeyRound, title: "Crie um chaveiro", text: "Um nome, uma fonte bonita e o 3MF em 2 cores.", run: () => go("keychain") },
    {
      icon: Calculator,
      title: "Calcule um preço",
      text: "A calculadora abre com um exemplo preenchido.",
      run: () => {
        requestExample("calculator");
        go("calculator");
      },
    },
    {
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
        <button type="button" className="ghost icon-only" aria-label="Fechar Comece por aqui" onClick={close}>
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
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="hint">Em qualquer tela, o botão ? (ou a tecla ?) mostra como usar.</p>
    </section>
  );
}
