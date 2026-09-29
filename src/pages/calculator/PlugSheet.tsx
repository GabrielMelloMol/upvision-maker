import { PlugZap } from "lucide-react";
import { useState } from "react";
import { plugWatts } from "../../domain/energy";
import { parseDecimal } from "../../domain/format";
import Sheet from "../../ui/Sheet";
import SmartField from "../../ui/SmartField";
import TimeField from "../../ui/TimeField";
import { parseDuration } from "../../ui/parse";

type Props = { catalogWatts?: number; onUse: (watts: number) => void; onClose: () => void };

/** "Medir com tomada inteligente": contador Total (kWh) no início e no fim de uma impressão → W médio. */
export default function PlugSheet({ catalogWatts, onUse, onClose }: Props) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [time, setTime] = useState("");
  const { watts, warnings } = plugWatts({ startKwh: parseDecimal(start), endKwh: parseDecimal(end), hours: (parseDuration(time) || 0) / 60 }, catalogWatts);
  const kwhField = { inputMode: "decimal" as const, parse: parseDecimal, invalidText: "Digite o número do app, ex.: 52,16.", placeholder: "Ex.: 52,16" };

  return (
    <Sheet
      title="Medir com tomada inteligente"
      icon={PlugZap}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (watts !== null) onUse(watts);
      }}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={watts === null}>
            {watts === null ? "Usar este valor" : `Usar ${watts} W`}
          </button>
        </>
      }
    >
      <p className="hint">
        No app da tomada, use o <b>Total (kWh)</b>, não o Power (W): o W instantâneo vai de uns 6 W parada a mais de 300 W aquecendo a mesa. Anote o Total antes de
        começar uma impressão longa e de novo quando ela terminar.
      </p>
      <div className="grid two">
        <SmartField label="kWh no início" value={start} onChange={setStart} data-autofocus {...kwhField} />
        <SmartField label="kWh no fim" value={end} onChange={setEnd} {...kwhField} />
        <TimeField label="Duração da impressão" value={time} onChange={setTime} />
      </div>
      <div className="calc-summary" style={{ position: "static" }}>
        <section className="card hero">
          <span className="hint">Potência média</span>
          <span className="big">{watts === null ? "—" : `${watts} W`}</span>
          {warnings.map((w) => (
            <span key={w} className="error">
              {w}
            </span>
          ))}
        </section>
      </div>
    </Sheet>
  );
}
