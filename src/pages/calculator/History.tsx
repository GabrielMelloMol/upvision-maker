import { History as HistoryIcon, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getDb } from "../../db";
import { calcHistory, type CalcHistoryEntry } from "../../db/calcHistoryRepo";
import { money } from "../../domain/format";
import { errorText, useToast } from "../../ui/Toast";
import { parseSaved, type Saved } from "./saved";

/** Espera a pessoa parar de digitar antes de gravar o cálculo no histórico. */
const SAVE_DEBOUNCE_MS = 1500;

type Summary = { name: string; grams: number; hours: number; price: number };

/**
 * Histórico dos últimos cálculos (#43), no banco (entra no backup). O cálculo aberto é gravado sozinho quando muda
 * e tem custo; "Limpar" ou "Reabrir" trocam qual registro está aberto. `snapshot` = o formulário inteiro.
 */
export function useCalcHistory(
  snapshot: Saved,
  summary: Summary,
  active: boolean,
) {
  const [list, setList] = useState<CalcHistoryEntry[]>([]);
  const current = useRef<number | null>(null);
  const toast = useToast();
  const data = JSON.stringify(snapshot);

  useEffect(() => {
    getDb()
      .then(calcHistory.list)
      .then(setList)
      .catch((e) => console.warn("Histórico da calculadora indisponível:", e));
  }, []);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(async () => {
      try {
        const db = await getDb();
        current.current = await calcHistory.save(db, current.current, {
          ...summary,
          data,
          at: new Date().toISOString(),
        });
        setList(await calcHistory.list(db));
      } catch (e) {
        console.warn("Não deu para gravar o cálculo no histórico:", e);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // grava quando o formulário muda (o resumo sai dele)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, active]);

  async function remove(id: number) {
    try {
      const db = await getDb();
      await calcHistory.remove(db, id);
      if (current.current === id) current.current = null;
      setList(await calcHistory.list(db));
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  return {
    list,
    remove,
    /** Próximas mudanças viram um cálculo novo (depois de "Limpar"). */
    startNew: () => void (current.current = null),
    /** Estado para reabrir `e`, que passa a ser o cálculo aberto; null se o registro estiver estragado. */
    reopen(e: CalcHistoryEntry): Saved | null {
      const s = parseSaved(e.data);
      if (s) current.current = e.id;
      else toast("Este cálculo do histórico não pôde ser aberto.", "error");
      return s;
    },
  };
}

const dateText = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const num = (n: number, digits = 1) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: digits });

type Props = {
  list: CalcHistoryEntry[];
  onReopen: (e: CalcHistoryEntry) => void;
  onRemove: (id: number) => void;
};

/** Lista "Últimos cálculos": nome, data, gramas, horas e preço de venda direta, com Reabrir e Apagar. */
export default function HistoryCard({ list, onReopen, onRemove }: Props) {
  if (!list.length) return null;
  return (
    <section className="card calc-history">
      <h2 className="card-title">
        <HistoryIcon aria-hidden /> Últimos cálculos
      </h2>
      <table>
        <thead>
          <tr>
            <th>Peça</th>
            <th>Quando</th>
            <th className="num">Filamento</th>
            <th className="num">Tempo</th>
            <th className="num">Venda direta</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {list.map((e) => (
            <tr key={e.id}>
              <td>{e.name || <span className="muted">Sem nome</span>}</td>
              <td className="muted">{dateText(e.at)}</td>
              <td className="num">{num(e.grams)} g</td>
              <td className="num">{num(e.hours)} h</td>
              <td className="num">{money(e.price)}</td>
              <td className="actions">
                <div>
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => onReopen(e)}
                    aria-label={`Reabrir ${e.name || "cálculo sem nome"}`}
                  >
                    <RotateCcw aria-hidden size={14} /> Reabrir
                  </button>
                  <button
                    type="button"
                    className="ghost icon-only danger"
                    onClick={() => onRemove(e.id)}
                    aria-label={`Apagar ${e.name || "cálculo sem nome"}`}
                  >
                    <Trash2 aria-hidden size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
