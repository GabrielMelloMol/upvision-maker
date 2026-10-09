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

/**
 * Fusos que alguns sistemas não conhecem (ICU enxuto do Windows/WebView2) caem num equivalente que todo sistema tem: ou um
 * fuso vizinho com o mesmo deslocamento, ou um fixo (Etc/GMT+2 = UTC−2). O custo é só o histórico de horário de verão
 * dessas zonas pequenas (Fernando de Noronha, por exemplo, não muda de hora hoje).
 */
const FALLBACKS: Record<string, string> = {
  "America/Noronha": "Etc/GMT+2",
  "America/Eirunepe": "America/Rio_Branco",
  "America/Boa_Vista": "America/Manaus",
  "America/Porto_Velho": "America/Manaus",
  "America/Santarem": "America/Belem",
  "America/Araguaina": "America/Belem",
  "America/Fortaleza": "America/Belem",
  "America/Maceio": "America/Recife",
  "America/Bahia": "America/Recife",
  "America/Campo_Grande": "America/Cuiaba",
};

const known = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const resolved = new Map<string, string>();
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Só para teste: esquece o que já foi resolvido. */
export function resetTzCache(): void {
  resolved.clear();
  formatters.clear();
}

/** Nome de fuso que o Intl deste sistema conhece: o próprio, o equivalente fixo ou, se nada serve, erro claro. */
export function resolveTz(tz: string): string {
  const name = tz.trim();
  const hit = resolved.get(name);
  if (hit) return hit;
  const alt = [name, FALLBACKS[name]].find((z) => z && known(z));
  if (!alt) throw new Error(`Fuso horário desconhecido: ${name}.`);
  resolved.set(name, alt);
  return alt;
}

function formatter(tz: string): Intl.DateTimeFormat {
  const zone = resolveTz(tz);
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formatters.set(zone, f);
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
