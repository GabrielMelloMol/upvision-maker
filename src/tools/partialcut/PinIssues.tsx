import type { PinIssue } from "../../geometry/cutSequence";
import Alert from "../../ui/Alert";

type Props = { issues: PinIssue[]; many: boolean; onSmallerFixed: (cut: number, size: number) => void; onGlue: (cut: number) => void };

const mm = (n: number) => n.toFixed(1).replace(".", ",");

/** Face pequena demais para o pino: já oferece a saída (pino fixo menor ou colar sem pino) em vez de só avisar. */
export default function PinIssues({ issues, many, onSmallerFixed, onGlue }: Props) {
  return (
    <>
      {issues.map((i) => (
        <Alert key={i.cut} kind="warn">
          <div className="stack">
            <span>
              {many ? `Corte ${i.cut + 1}: a` : "A"} face do corte é pequena ou fina demais para um pino escondido nas duas peças: saiu sem encaixe.
            </span>
            <div className="row wrap">
              {i.fixSize !== null && (
                <button type="button" className="sm primary" onClick={() => onSmallerFixed(i.cut, i.fixSize!)}>
                  Usar pino fixo menor ({mm(i.fixSize)} mm)
                </button>
              )}
              <button type="button" className="sm" onClick={() => onGlue(i.cut)}>
                Colar sem pino
              </button>
            </div>
          </div>
        </Alert>
      ))}
    </>
  );
}
