import type { CalcResult } from "./calc";
import { money, round2 } from "./format";
import type { Settings } from "./settings";

/** Potência da fonte ≈ 3,5× o consumo médio imprimindo (ex.: A1: fonte 350 W, consumo ~95 W). */
export const PSU_EXAMPLE_FACTOR = 3.5;

export type PriceDiff = { id: "failure" | "power" | "markup" | "labor"; title: string; ours: number; theirs: number; text: string };

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} %`;

/**
 * As 4 escolhas de conta que mais afastam o nosso preço do de outras calculadoras, com os números da tela (por peça):
 * "aqui" (`ours`) × "do outro jeito" (`theirs`).
 */
export function priceDifferences(r: CalcResult, s: Settings, o: { failurePct: number; watts: number }): PriceDiff[] {
  const perUnit = r.batchCost > 0 ? r.unitCost / r.batchCost : 0;
  const u = (n: number) => round2(n * perUnit);
  const lost = r.filament + r.energy + r.machine;
  const mult = s.multConsumer;
  const margin = 1 - 1 / mult;
  const base = r.unitCost - (s.multiplyLabor ? 0 : u(r.labor)) - u(r.fixed);
  const laborU = u(r.labor);
  return [
    {
      id: "failure",
      title: "Falhas: dividir ou somar",
      ours: u(r.failure),
      theirs: u(lost * (o.failurePct / 100)),
      text: `Com ${pct(o.failurePct)} de falhas, aqui o custo que se perde é dividido por ${pct(100 - o.failurePct)} das impressões que dão certo. Somar ${pct(o.failurePct)} por cima dá um pouco menos, e a diferença cresce com a taxa.`,
    },
    {
      id: "power",
      title: "Consumo médio × potência da fonte",
      ours: u(r.energy),
      theirs: u(r.energy * PSU_EXAMPLE_FACTOR),
      text: `Aqui a energia usa ${o.watts > 0 ? `${o.watts} W` : "a potência informada"}, o consumo médio imprimindo. Muitas calculadoras usam a potência da fonte (a da etiqueta, uns ${PSU_EXAMPLE_FACTOR.toLocaleString("pt-BR")}× maior), o que multiplica a energia.`,
    },
    {
      id: "markup",
      title: "Markup × margem",
      ours: round2(base * mult),
      theirs: round2(base * (1 + margin)),
      text: `×${mult} é markup de ${pct((mult - 1) * 100)} e margem de ${pct(margin * 100)}. Quem aplica "${pct(margin * 100)}" como acréscimo sobre o custo chega a um preço bem menor; quem fala em "margem de ${pct(mult * 100)}" está falando do multiplicador.`,
    },
    {
      id: "labor",
      title: "Mão de obra fora do multiplicador",
      ours: laborU,
      theirs: round2(laborU * mult),
      text: s.multiplyLabor
        ? `Você está no jeito antigo (Preferências): a mão de obra também é multiplicada por ${mult}.`
        : laborU > 0
          ? `Aqui a sua hora de trabalho entra uma vez só, depois do multiplicador. Multiplicada por ${mult}, ela pesaria ${money(round2(laborU * mult))} no preço.`
          : "Nesta conta não há mão de obra; quando houver, ela entra uma vez só, depois do multiplicador.",
    },
  ];
}
