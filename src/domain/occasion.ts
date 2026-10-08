import type { Collection } from "../tools/models/variants";

/** Ocasiões com data no calendário (as demais coleções, como Pets ou Negócio, não têm data). */
export type DatedOccasion = Extract<Collection, "maes" | "pascoa" | "junina" | "pais" | "criancas" | "natal">;

/** Como a ocasião aparece em "Para …". */
export const OCCASION_NAME: Record<DatedOccasion, string> = {
  maes: "o Dia das Mães",
  pascoa: "a Páscoa",
  junina: "a Festa Junina",
  pais: "o Dia dos Pais",
  criancas: "o Dia das Crianças",
  natal: "o Natal",
};

/** Quantos dias antes da data o destaque aparece (dá tempo de imprimir e embalar). */
export const OCCASION_LEAD_DAYS = 45;
const DAY = 86_400_000;

const utc = (y: number, m: number, d: number) => Date.UTC(y, m, d);
/** n-ésimo domingo do mês (m de 0 a 11). */
const nthSunday = (y: number, m: number, n: number) => {
  const first = new Date(utc(y, m, 1)).getUTCDay();
  return utc(y, m, 1 + ((7 - first) % 7) + 7 * (n - 1));
};
/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function easter(y: number): number {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const g = Math.floor((8 * b + 13) / 25), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1, day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, month, day);
}

/** Data da ocasião no ano `y` (meia-noite UTC). */
export const occasionDate = (o: DatedOccasion, y: number): number =>
  ({ maes: nthSunday(y, 4, 2), pascoa: easter(y), junina: utc(y, 5, 24), pais: nthSunday(y, 7, 2), criancas: utc(y, 9, 12), natal: utc(y, 11, 25) })[o];

export type UpcomingOccasion = { id: DatedOccasion; days: number };

/** A ocasião mais próxima que ainda não passou e cai nos próximos OCCASION_LEAD_DAYS dias (no dia dela, `days` = 0). */
export function upcomingOccasion(today: Date): UpcomingOccasion | null {
  const t = utc(today.getFullYear(), today.getMonth(), today.getDate()); // data local, como a pessoa vê no calendário
  let best: UpcomingOccasion | null = null;
  for (const id of Object.keys(OCCASION_NAME) as DatedOccasion[]) {
    for (const y of [today.getFullYear(), today.getFullYear() + 1]) {
      const days = Math.round((occasionDate(id, y) - t) / DAY);
      if (days >= 0 && days <= OCCASION_LEAD_DAYS && (!best || days < best.days)) best = { id, days };
    }
  }
  return best;
}
