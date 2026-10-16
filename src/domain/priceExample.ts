import { calculate, channelFees, channelPrice, machineHourCost, type CalcInput } from "./calc";
import { money, round2 } from "./format";
import { RULES_DATE, SHOPEE_2026 } from "./channelDefaults";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

/**
 * Exemplo da página "Como calculamos o preço" (#216): uma mesa de 4 chaveiros. Todos os números saem de `calculate`,
 * a mesma função da Calculadora, então a explicação nunca se afasta da conta de verdade.
 */
export const EXAMPLE = {
  pieces: 4,
  grams: 72,
  pricePerKg: 120,
  hours: 4,
  watts: 150,
  laborHours: 0.5,
  ringUnit: 0.3,
  printer: { price: 3000, lifeHours: 5000, upkeepPerHour: 0 },
  fixedPerHour: 1.5,
  /** a regra de fábrica atual do canal (Preferências → Canais de venda), não um número solto */
  channel: SHOPEE_2026,
  marginPct: 30,
};

/** Valores fixos do exemplo: não são os da pessoa (a página mostra os dela ao lado). */
export const EXAMPLE_SETTINGS: Settings = { ...DEFAULT_SETTINGS, kwhPrice: 0.9, laborHourCost: 20, failurePct: 5, taxPct: 4, multResale: 3, multConsumer: 5, channels: [EXAMPLE.channel] };

const e = EXAMPLE;
const input: CalcInput = {
  filaments: [{ pricePerKg: e.pricePerKg, grams: e.grams }],
  extras: [{ unitPrice: e.ringUnit, qty: e.pieces }],
  printerWatts: e.watts,
  printHours: e.hours,
  laborHours: e.laborHours,
  quantity: e.pieces,
  freight: 0,
  marketplaceMarginPct: e.marginPct,
  machinePerHour: machineHourCost(e.printer),
  fixedPerHour: e.fixedPerHour,
};

export const exampleResult = () => calculate(input, EXAMPLE_SETTINGS);

export type PriceStep = {
  id: string;
  title: string;
  /** a regra, em palavras */
  rule: string;
  /** a conta do exemplo, com os números */
  sum: string;
  /** o que a regra deixa de fora ou quando muda */
  note?: string;
  /** onde a pessoa muda o valor */
  where?: string;
  /** o valor da linha (R$) */
  value: number;
};

const n = (x: number, d = 2) => x.toLocaleString("pt-BR", { maximumFractionDigits: d });

/** Os componentes do custo e do preço, na ordem em que a conta é feita. */
export function priceSteps(): PriceStep[] {
  const r = exampleResult();
  const s = EXAMPLE_SETTINGS;
  const hourly = machineHourCost(e.printer);
  const kwh = (e.watts / 1000) * e.hours;
  const lost = r.filament + r.purge + r.energy + r.machine;
  const qty = e.pieces;
  const after = (r.labor * (s.multiplyLabor ? 0 : 1) + r.fixed) / qty;
  const base = r.unitCost - after;
  const channel = r.channels[0];
  const day = (iso: string) => iso.split("-").reverse().join("/");
  return [
    { id: "filament", title: "Filamento", rule: "preço do quilo ÷ 1000 × gramas usadas na mesa inteira (peças, suportes e torre).", sum: `${money(e.pricePerKg)} ÷ 1000 × ${e.grams} g = ${money(r.filament)}`, note: "As gramas vêm do fatiador (ou do arquivo 3MF). Com mais de um filamento, soma uma linha por filamento.", where: "Estoque → Filamentos (preço do quilo)", value: r.filament },
    { id: "extras", title: "Materiais extras", rule: "preço de cada material × quantidade usada.", sum: `${e.pieces} argolas × ${money(e.ringUnit)} = ${money(r.extras)}`, note: "Ímãs, argolas, embalagem, fita: tudo o que entra na peça e não é filamento.", where: "Estoque → Materiais extras", value: r.extras },
    { id: "energy", title: "Energia", rule: "potência em kW × horas de impressão × preço do kWh.", sum: `${n(e.watts / 1000, 3)} kW × ${e.hours} h = ${n(kwh)} kWh × ${money(s.kwhPrice)} = ${money(r.energy)}`, note: "Se você mediu o consumo na tomada, o kWh medido substitui potência × horas.", where: "Estoque → Impressoras (watts) e Ajustes → Preferências (kWh)", value: r.energy },
    { id: "machine", title: "Desgaste da máquina", rule: "(preço da impressora ÷ vida útil em horas + desgaste por hora) × horas de impressão.", sum: `(${money(e.printer.price)} ÷ ${n(e.printer.lifeHours, 0)} h = ${money(hourly)}/h) × ${e.hours} h = ${money(r.machine)}`, note: "Sem a impressora cadastrada, entra no lugar uma manutenção em % sobre os outros custos.", where: "Estoque → Impressoras", value: r.machine },
    { id: "labor", title: "Mão de obra", rule: "horas de trabalho × valor da sua hora.", sum: `${n(e.laborHours)} h × ${money(s.laborHourCost)} = ${money(r.labor)}`, note: "Fica de fora do cálculo de falhas: se a peça falha, você perde material, não o seu tempo já pago.", where: "Ajustes → Preferências (valor da hora)", value: r.labor },
    { id: "failure", title: "Falhas", rule: "o que se perde numa falha (filamento, energia e máquina) ÷ (1 − taxa de falha) − o que se perde.", sum: `${money(lost)} ÷ (1 − ${s.failurePct}%) − ${money(lost)} = ${money(r.failure)}`, note: "A taxa diz quantas impressões se perdem; o custo dessas perdas é espalhado nas peças boas. Ela pode ser por material ou por produto.", where: "Ajustes → Preferências (taxa de falha)", value: r.failure },
    { id: "fixed", title: "Custos fixos", rule: "custo operacional por hora de impressão × horas.", sum: `${money(e.fixedPerHour)}/h × ${e.hours} h = ${money(r.fixed)}`, note: "Aluguel, internet, impostos fixos… rateados pelas horas produtivas do mês. Só entra se estiver ligado.", where: "Resultados → Custos operacionais", value: r.fixed },
    { id: "unit", title: "Custo por peça", rule: "soma de tudo ÷ quantidade de peças na mesa.", sum: `${money(r.batchCost)} ÷ ${qty} peças = ${money(r.unitCost)}`, note: "O custo da mesa é dividido pelas peças que saem dela; o frete absorvido soma por peça, depois.", value: r.unitCost },
    { id: "multiplier", title: "Preço pelo multiplicador", rule: "(custo − mão de obra e custos fixos) × multiplicador + mão de obra e custos fixos + frete.", sum: `(${money(r.unitCost)} − ${money(after)}) × ${s.multResale} + ${money(after)} = ${money(r.resale)} (lojista); × ${s.multConsumer} = ${money(r.consumer)} (cliente final)`, note: `A mão de obra e os custos fixos entram depois do multiplicador, senão multiplicar por ${s.multConsumer} inflaria o seu tempo ${s.multConsumer} vezes. Base multiplicada: ${money(base)}.`, where: "Ajustes → Preferências (multiplicadores)", value: r.consumer },
    { id: "channel", title: "Preço por canal de venda", rule: "(custo + taxa fixa) ÷ (1 − comissão − imposto − margem desejada), com a comissão e a taxa da faixa de preço em que a peça cai.", sum: `(${money(r.unitCost)} + ${money(e.channel.feeFixed)}) ÷ (1 − ${e.channel.feePct}% − ${s.taxPct}% − ${e.marginPct}%) = ${money(channel.price ?? 0)}`, note: `Nesse preço a ${e.channel.name} fica com ${money(channel.fees)} em taxas e imposto, e sobram ${money(channel.profit)} (${n(channel.marginPct, 1)}% do preço). Canais com faixas de preço, teto de comissão ou frete grátis acima de um valor são resolvidos faixa a faixa. Regra de fábrica do canal ${e.channel.name} (conferida em ${day(e.channel.checkedAt ?? RULES_DATE)}): a sua pode ser diferente, confira em Preferências → Canais de venda.`, where: "Ajustes → Preferências (canais, imposto e margem)", value: channel.price ?? 0 },
  ];
}

/** Confere (para o teste e para a página) que as linhas somam o custo da mesa. */
export const exampleParts = () => {
  const r = exampleResult();
  return round2(r.filament + r.purge + r.extras + r.energy + r.labor + r.machine + r.failure + r.fixed + r.maintenance);
};

// reexporta o que a conta do canal usa, para o teste cruzar com a função crua
export { channelFees, channelPrice };
