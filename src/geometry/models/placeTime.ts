import tzlookup from "tz-lookup";

/*
 * Fuso e horário de verão de um lugar numa data (#196): o fuso (nome IANA) sai da coordenada, com os limites de fuso
 * do tz-lookup, e o deslocamento daquele dia sai do Intl, que traz o histórico do banco IANA (inclusive o horário de
 * verão do Brasil até o verão de 2018/19). Tudo offline.
 */
export type LocalTime = { year: number; month: number; day: number; hour: number; minute: number };

/** Nome IANA do fuso de uma coordenada (ex.: "America/Sao_Paulo"). */
export function tzAt(lat: number, lon: number): string {
  return tzlookup(lat, lon);
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    } catch (e) {
      throw new Error(`Fuso horário desconhecido: ${tz}.`, { cause: e });
    }
    formatters.set(tz, f);
  }
  return f;
}

/** Deslocamento do fuso (em minutos) em um instante UTC (ms). */
function offsetMinutesAtUtc(tz: string, utcMs: number): number {
  const parts = Object.fromEntries(formatter(tz).formatToParts(new Date(utcMs)).map((p) => [p.type, Number(p.value)]));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** Deslocamento do fuso (em horas, ex.: −2, 5,5) na hora de parede informada. Na hora que não existe, vale a depois do salto. */
export function utcOffsetHours(tz: string, t: LocalTime): number {
  const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute);
  let off = offsetMinutesAtUtc(tz, wall);
  const refined = offsetMinutesAtUtc(tz, wall - off * 60000);
  if (refined !== off) off = refined;
  return off / 60;
}

/** Horário de verão ativo: o deslocamento é maior que o menor do ano (o padrão). */
export function isDst(tz: string, t: LocalTime): boolean {
  const now = utcOffsetHours(tz, t);
  const standard = Math.min(utcOffsetHours(tz, { ...t, month: 1, day: 1, hour: 12, minute: 0 }), utcOffsetHours(tz, { ...t, month: 7, day: 1, hour: 12, minute: 0 }));
  return now > standard;
}

/** "UTC−3", "UTC+5:30", "UTC−2 (horário de verão)". */
export function offsetLabel(offset: number, dst: boolean): string {
  if (offset === 0) return `UTC±0${dst ? " (horário de verão)" : ""}`;
  const abs = Math.abs(offset), h = Math.floor(abs), m = Math.round((abs - h) * 60);
  return `UTC${offset < 0 ? "−" : "+"}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}${dst ? " (horário de verão)" : ""}`;
}
