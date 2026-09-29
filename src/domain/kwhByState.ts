import { round2 } from "./format";

/**
 * Preço do kWh residencial por estado, para quem ainda não tem a conta de luz em mãos (#39). É ESTIMATIVA:
 * - tarifa B1 residencial convencional (TUSD + TE, sem impostos) da distribuidora da capital, vigente em 29/09/2026,
 *   do conjunto "Tarifas homologadas das distribuidoras" da ANEEL (dadosabertos.aneel.gov.br);
 * - mais ICMS residencial do estado (faixa de consumo acima da isenção; SEFAZ estaduais, 2026) e ~3 % de PIS/COFINS,
 *   calculados "por dentro": tarifa ÷ (1 − impostos). Bandeira e iluminação pública ficam de fora.
 * Atualizar: filtrar o CSV da ANEEL por B1 / Convencional / Residencial / Tarifa de Aplicação na data de hoje.
 */
export const KWH_STATE_SOURCE = "ANEEL (tarifa B1 da distribuidora da capital) + ICMS do estado e PIS/COFINS";
export const KWH_STATE_DATE = "set/2026";
const PIS_COFINS_PCT = 3;

type Row = { distributor: string; tariff: number; icmsPct: number; since: string };

export const KWH_BY_STATE: Record<string, Row> = {
  AC: { distributor: "Energisa AC", tariff: 0.8297, icmsPct: 19, since: "2026-08-26" },
  AL: { distributor: "Equatorial AL", tariff: 0.8514, icmsPct: 20.5, since: "2026-05-03" },
  AM: { distributor: "Âmbar Amazonas", tariff: 0.8757, icmsPct: 20, since: "2026-05-26" },
  AP: { distributor: "CEA Equatorial", tariff: 0.8251, icmsPct: 18, since: "2026-04-13" },
  BA: { distributor: "Neoenergia Coelba", tariff: 0.8777, icmsPct: 20.5, since: "2026-04-22" },
  CE: { distributor: "Enel CE", tariff: 0.7017, icmsPct: 20, since: "2026-08-26" },
  DF: { distributor: "Neoenergia Brasília", tariff: 0.8267, icmsPct: 20, since: "2026-01-01" },
  ES: { distributor: "EDP ES", tariff: 0.8437, icmsPct: 17, since: "2026-08-07" },
  GO: { distributor: "Equatorial GO", tariff: 0.8918, icmsPct: 19, since: "2026-01-01" },
  MA: { distributor: "Equatorial MA", tariff: 0.8888, icmsPct: 20, since: "2026-08-28" },
  MG: { distributor: "Cemig", tariff: 0.9033, icmsPct: 18, since: "2026-05-28" },
  MS: { distributor: "Energisa MS", tariff: 0.9866, icmsPct: 17, since: "2026-04-22" },
  MT: { distributor: "Energisa MT", tariff: 0.8994, icmsPct: 17, since: "2026-04-08" },
  PA: { distributor: "Equatorial PA", tariff: 0.9783, icmsPct: 19, since: "2026-01-01" },
  PB: { distributor: "Energisa PB", tariff: 0.7097, icmsPct: 20, since: "2026-08-28" },
  PE: { distributor: "Neoenergia PE", tariff: 0.7989, icmsPct: 20.5, since: "2026-04-29" },
  PI: { distributor: "Equatorial PI", tariff: 0.9467, icmsPct: 22.5, since: "2026-01-01" },
  PR: { distributor: "Copel", tariff: 0.7680, icmsPct: 19, since: "2026-06-24" },
  RJ: { distributor: "Light", tariff: 0.8806, icmsPct: 20, since: "2026-03-15" },
  RN: { distributor: "Neoenergia Cosern", tariff: 0.7758, icmsPct: 20, since: "2026-04-22" },
  RO: { distributor: "Energisa RO", tariff: 0.7624, icmsPct: 19.5, since: "2026-08-26" },
  RR: { distributor: "Âmbar Roraima", tariff: 0.7895, icmsPct: 20, since: "2026-01-25" },
  RS: { distributor: "CEEE Equatorial", tariff: 0.8220, icmsPct: 17, since: "2026-01-01" },
  SC: { distributor: "Celesc", tariff: 0.7598, icmsPct: 17, since: "2026-08-22" },
  SE: { distributor: "Energisa SE", tariff: 0.7546, icmsPct: 20, since: "2026-04-22" },
  SP: { distributor: "Enel SP", tariff: 0.7894, icmsPct: 18, since: "2026-07-04" },
  TO: { distributor: "Energisa TO", tariff: 0.9928, icmsPct: 20, since: "2026-08-26" },
};

export const STATES = Object.keys(KWH_BY_STATE);

/** Preço estimado do kWh com impostos, em R$ (null para UF desconhecida). */
export function stateKwhPrice(uf: string): number | null {
  const r = KWH_BY_STATE[uf];
  return r ? round2(r.tariff / (1 - (r.icmsPct + PIS_COFINS_PCT) / 100)) : null;
}
