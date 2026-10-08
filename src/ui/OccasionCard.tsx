import { CalendarHeart, ChevronRight } from "lucide-react";
import { OCCASION_NAME, upcomingOccasion } from "../domain/occasion";
import { openWith } from "../tools/intent";
import { MODELS } from "../tools/models/defs";
import { inCollection } from "../tools/models/variants";
import type { Go } from "../pages";

const when = (days: number) => (days === 0 ? "é hoje" : days === 1 ? "é amanhã" : `faltam ${days} dias`);

/** Destaque da ocasião que vem aí (#120): abre a galeria de Modelos prontos já na coleção dela. Some quando nenhuma está perto. */
export default function OccasionCard({ go, today = new Date() }: { go: Go; today?: Date }) {
  const next = upcomingOccasion(today);
  if (!next) return null;
  const count = MODELS.filter((m) => inCollection(m.id, next.id)).length;
  return (
    <button type="button" className="occasion-card" onClick={() => { openWith("models", { occasion: next.id }); go("models"); }}>
      <CalendarHeart aria-hidden />
      <span className="occasion-text">
        <strong>Para {OCCASION_NAME[next.id]}</strong>
        <span className="muted">{when(next.days)} · {count} modelos prontos</span>
      </span>
      <ChevronRight aria-hidden className="chev" />
    </button>
  );
}
