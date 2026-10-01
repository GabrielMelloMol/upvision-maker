import { ClipboardCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getDb } from "../../db";
import { printLogsRepo } from "../../db/printLogsRepo";
import type { Printer } from "../../domain/entities";
import { lastWorked, measuredFailurePct, MIN_PRINTS, printStats, settingsSummary, type PrintLog } from "../../domain/printLogs";
import { formatDuration } from "../../ui/parse";
import { errorText, useToast } from "../../ui/Toast";
import PrintLogForm from "./PrintLogForm";

const dateBr = (iso: string) => iso.split("-").reverse().join("/");
const grams = (g: number) => `${g.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g`;

/** Uma linha "o que foi usado": ajustes, filamentos, tempo e gramas. */
export function logLine(l: PrintLog, printers: Printer[]): string {
  return [printers.find((p) => p.id === l.printerId)?.name, settingsSummary(l), l.filaments, l.minutes != null && formatDuration(l.minutes), l.grams != null && grams(l.grams)].filter(Boolean).join(" · ");
}

/**
 * Ficha de impressão do produto (#163): o que funcionou, o histórico e a taxa de sucesso, que vira a taxa de falha
 * do produto no preço quando ele não tem uma digitada (a partir de 3 impressões).
 */
export default function PrintSheet({ productId, printers, ownFailurePct }: { productId: number; printers: Printer[]; ownFailurePct: number | null }) {
  const [logs, setLogs] = useState<PrintLog[] | null>(null);
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const reload = useCallback(async () => setLogs(await printLogsRepo.forProduct(await getDb(), productId)), [productId]);
  useEffect(() => {
    (async () => setLogs(await printLogsRepo.forProduct(await getDb(), productId)))().catch((e) => toast(`Erro ao ler a ficha: ${errorText(e)}`, "error"));
  }, [productId, toast]);

  async function remove(id: number) {
    try {
      await printLogsRepo.remove(await getDb(), id);
      await reload();
    } catch (e) {
      toast(`Não foi possível apagar: ${errorText(e)}`, "error");
    }
  }

  if (!logs) return null;
  const stats = printStats(logs);
  const measured = measuredFailurePct(logs);
  const worked = lastWorked(logs);
  return (
    <section className="stack print-sheet" aria-labelledby="print-sheet-title">
      <h3 className="subhead" id="print-sheet-title">
        <ClipboardCheck aria-hidden /> Ficha de impressão
      </h3>
      {stats.total > 0 ? (
        <p className="hint">
          Deu certo {stats.ok} de {stats.total} ({stats.successPct}%).{" "}
          {measured === null
            ? `Com ${MIN_PRINTS} impressões a taxa de falha medida passa a valer no preço.`
            : ownFailurePct !== null
              ? `Taxa de falha medida: ${measured}% (o preço usa a de ${ownFailurePct}% digitada neste produto).`
              : `Taxa de falha medida: ${measured}%, usada no preço deste produto.`}
        </p>
      ) : (
        <p className="hint">Anote como você imprimiu e se deu certo: na próxima vez é só repetir, e a taxa de falha do preço passa a ser a real.</p>
      )}
      {worked && (
        <div className="print-worked">
          <strong>O que funcionou ({dateBr(worked.at)})</strong>
          <span>{logLine(worked, printers) || "Sem ajustes anotados."}</span>
          {worked.notes && <span className="hint">{worked.notes}</span>}
        </div>
      )}
      {adding ? (
        <PrintLogForm
          productId={productId}
          base={worked}
          printers={printers}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void reload();
          }}
        />
      ) : (
        <button type="button" className="sm" onClick={() => setAdding(true)}>
          Registrar impressão
        </button>
      )}
      {logs.length > 0 && (
        <details>
          <summary>Histórico ({logs.length})</summary>
          <ul className="print-history">
            {logs.map((l) => (
              <li key={l.id}>
                <span className={l.result === "ok" ? "ok" : "bad"}>{l.result === "ok" ? "Deu certo" : `Falhou${l.reason ? `: ${l.reason}` : ""}`}</span> · {dateBr(l.at)}
                {logLine(l, printers) && <span className="hint"> · {logLine(l, printers)}</span>}
                <button type="button" className="link danger" onClick={() => void remove(l.id)} aria-label={`Apagar a impressão de ${dateBr(l.at)}`}>
                  Apagar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
