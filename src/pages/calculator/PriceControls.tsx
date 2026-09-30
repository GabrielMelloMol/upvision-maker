import { ROUNDINGS, type Rounding } from "../../domain/pricing";
import MoneyField from "../../ui/MoneyField";
import { parseMoney } from "../../ui/parse";
import Segmented from "../../ui/Segmented";
import { CompetitorHint } from "./ChannelTable";

type Props = { rounding: Rounding; onRounding: (r: Rounding) => void; competitor: string; onCompetitor: (v: string) => void; ours: number };

/** Acima da tabela de canais: arredondamento dos preços e "testar um preço" (seu ou do concorrente). */
export default function PriceControls({ rounding, onRounding, competitor, onCompetitor, ours }: Props) {
  return (
    <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-4)", marginBottom: "var(--space-3)" }}>
      <div className="stack" style={{ gap: 6 }}>
        <span className="field-label">Arredondar preços</span>
        <Segmented label="Arredondar preços" value={rounding} onChange={onRounding} options={ROUNDINGS} />
      </div>
      <div style={{ flex: "1 1 240px", maxWidth: 360 }}>
        <MoneyField label="Testar um preço (seu ou do concorrente)" value={competitor} onChange={onCompetitor} hint={<CompetitorHint ours={ours} competitor={parseMoney(competitor) || 0} />} />
      </div>
    </div>
  );
}
