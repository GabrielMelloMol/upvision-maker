/**
 * Leitura "humana" de campos: tempo (3h20, 3:20, 200 min), massa (850 g, 1,2 kg, 2 rolos) e dinheiro (R$ 1.234,56).
 * Tudo retorna NaN quando não entende, para o campo mostrar erro em vez de chutar.
 */

const num = (s: string) => Number(s.replace(",", "."));

/** Minutos. Número solto vale `bare` (padrão horas: "3" = 3 h; mão de obra usa "min"). */
export function parseDuration(raw: string, bare: "h" | "min" = "h"): number {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return NaN;
  const clock = /^(\d+):([0-5]?\d)$/.exec(s);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  if (/^\d+([.,]\d+)?$/.test(s)) return Math.round(num(s) * (bare === "h" ? 60 : 1));
  const m = /^(?:(\d+(?:[.,]\d+)?)d)?(?:(\d+(?:[.,]\d+)?)h)?(?:(\d+)(?:min|m)?)?$/.exec(s);
  if (!m || (!m[1] && !m[2] && !m[3])) return NaN;
  const [, d, h, min] = m;
  if (min && !/(min|m)$/.test(s) && !h) return NaN; // "20" sozinho já caiu no número solto
  if (min && (h || d) && Number(min) > 59) return NaN;
  return Math.round((d ? num(d) * 1440 : 0) + (h ? num(h) * 60 : 0) + (min ? Number(min) : 0));
}

export function formatDuration(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 min";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** Número pt-BR: "1.500" = 1500, "1,5" = 1,5, "1234.5" = 1234,5. */
function ptNumber(s: string): number {
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d+([.,]\d+)?$/.test(s)) return num(s);
  return NaN;
}

/** Gramas. Aceita g, kg e rolos (usa o peso do rolo). */
export function parseMass(raw: string, spoolG: number): number {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  const m = /^([\d.,]+)(g|kg|r|rolo|rolos)?$/.exec(s);
  if (!m) return NaN;
  const v = ptNumber(m[1]);
  if (!Number.isFinite(v)) return NaN;
  const unit = m[2] ?? "g";
  return Math.round(unit === "kg" ? v * 1000 : unit.startsWith("r") ? v * spoolG : v);
}

const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export function formatMass(g: number, spoolG?: number): string {
  const base = `${int.format(Math.round(g))} g`;
  if (!spoolG || g < spoolG || g % (spoolG / 2) !== 0) return base;
  const r = g / spoolG;
  return `${base} (${int.format(r)} ${r === 1 ? "rolo" : r < 2 ? "rolo" : "rolos"})`;
}

/** Reais. Aceita "R$ 1.234,56", "1234.56", "15,9". */
export function parseMoney(raw: string): number {
  const s = raw.trim().replace(/^r\$\s*/i, "").replace(/\s/g, "");
  if (!s) return NaN;
  if (/^\d+\.\d{3}$/.test(s)) return ptNumber(s); // "1.234" = mil duzentos e trinta e quatro
  return ptNumber(s);
}

const money2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Formata o texto do campo ao sair dele; se não entendeu, devolve como está (o campo mostra o erro). */
export function formatMoneyInput(raw: string): string {
  const v = parseMoney(raw);
  return Number.isFinite(v) ? money2.format(v) : raw;
}
