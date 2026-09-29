import { useState } from "react";
import { money } from "../domain/format";
import { KWH_BY_STATE, KWH_STATE_DATE, KWH_STATE_SOURCE, stateKwhPrice, STATES } from "../domain/kwhByState";
import { formatMoneyInput } from "./parse";

/** "Não tenho a conta agora": escolhe o estado e preenche o kWh com a média estimada (#39). A conta de luz continua sendo o melhor caminho. */
export default function StateKwhSelect({ onPick }: { onPick: (price: string) => void }) {
  const [uf, setUf] = useState("");
  const price = uf ? stateKwhPrice(uf) : null;
  return (
    <label className="state-kwh">
      Sem a conta agora? Média do estado
      <select
        value={uf}
        onChange={(e) => {
          setUf(e.target.value);
          const p = stateKwhPrice(e.target.value);
          if (p !== null) onPick(formatMoneyInput(String(p)));
        }}
      >
        <option value="">Escolher estado…</option>
        {STATES.map((s) => (
          <option key={s} value={s}>
            {s} · {money(stateKwhPrice(s)!)}
          </option>
        ))}
      </select>
      <span className="hint" title={`Fonte: ${KWH_STATE_SOURCE}, ${KWH_STATE_DATE}. Sem bandeira e sem iluminação pública.`}>
        {price !== null
          ? `Estimativa da ${KWH_BY_STATE[uf].distributor} com ICMS (${String(KWH_BY_STATE[uf].icmsPct).replace(".", ",")} %) e PIS/COFINS. ANEEL, ${KWH_STATE_DATE}. Troque pelo valor da conta quando puder.`
          : `Estimativa com dados da ANEEL (${KWH_STATE_DATE}).`}
      </span>
    </label>
  );
}
