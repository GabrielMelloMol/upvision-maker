import { tail } from "./log";

/** Espaço do registro na mensagem (o WhatsApp corta textos longos; ver WHATSAPP_TEXT em feedback.ts). */
export const REPORT_LOG_CHARS = 1100;
const TAIL_LINES = 40;

export type ReportInfo = { version: string; build: string; system: string; log: string; what?: string };

/** Cabeçalho do diagnóstico: versão, build e sistema (sem dados pessoais). */
export const reportHeader = (i: Pick<ReportInfo, "version" | "build" | "system">) => `UpVision Maker v${i.version} (build ${i.build}) · ${i.system}`;

/** Texto curto para a mensagem: o que ela descreveu + as últimas linhas do registro, cortando do começo se passar do limite. */
export function shortReport(i: ReportInfo): string {
  let log = tail(i.log, TAIL_LINES);
  if (log.length > REPORT_LOG_CHARS) log = `…${log.slice(-REPORT_LOG_CHARS)}`;
  return [i.what?.trim() || "(sem descrição)", "", reportHeader(i), "", "Últimos registros:", log || "(nenhum erro registrado)"].join("\n");
}

/** Arquivo completo para anexar. */
export const fullReport = (i: ReportInfo) => [reportHeader(i), `Gerado em ${new Date().toISOString()}`, "", i.log.trim() || "(nenhum erro registrado)", ""].join("\n");
