import { money } from "../../domain/format";
import type { SlicerWaste } from "../../domain/slicer/waste";
import Alert from "../../ui/Alert";

const g = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} g`;

/** Gramas de purga que ainda precisam entrar no consumo de cada filamento (as que o fatiador já somou, não). */
export function purgeFor(waste: SlicerWaste | undefined, index: number): number {
  if (!waste || waste.included) return 0;
  return waste.byFilament.find((f) => f.index === index)?.grams ?? 0;
}

/**
 * "Desperdício multicor: 18 g (R$ 2,16), 42% do filamento" (#147), com dica para reduzir.
 * `modelGrams` = gramas dos filamentos lidas do arquivo; `priceOf(index)` = R$/kg do filamento escolhido para a linha.
 */
export default function WasteNote({ waste, modelGrams, priceOf }: { waste: SlicerWaste; modelGrams: number; priceOf: (index: number) => number | null }) {
  const total = waste.included ? modelGrams : modelGrams + waste.grams;
  const pct = total > 0 ? Math.round((waste.grams / total) * 100) : 0;
  const prices = waste.byFilament.map((f) => [f, priceOf(f.index)] as const);
  const cost = prices.length && prices.every(([, p]) => p !== null) ? prices.reduce((s, [f, p]) => s + (f.grams / 1000) * p!, 0) : null;
  const what = waste.from === "torre" ? "torre de limpeza" : `purga de ${waste.swaps} ${waste.swaps === 1 ? "troca de cor" : "trocas de cor"}`;
  return (
    <Alert kind="info">
      <b>
        Desperdício multicor: {g(waste.grams)}
        {cost !== null && ` (${money(cost)})`}, {pct}% do filamento
      </b>{" "}
      ({what}
      {waste.from === "camadas" && ", estimada pelas camadas do projeto"}).{" "}
      {waste.included ? "Já está dentro das gramas do fatiador." : "Somado às gramas de cada filamento acima, porque o fatiador informa só o que vai na peça."}{" "}
      Para gastar menos: agrupe as cores por altura, use a purga no preenchimento ou no objeto, ou imprima várias peças na mesma mesa.
    </Alert>
  );
}

/**
 * Suportes e torre de limpeza lidos do G-code (#147): já estão nas gramas do fatiador, então só mostra quanto são e
 * como gastar menos. `perGram` = R$/g médio dos filamentos escolhidos (null = algum sem preço).
 */
export function SupportNote({ support, tower, modelGrams, perGram }: { support?: { grams: number; tree: boolean }; tower?: number; modelGrams: number; perGram: number | null }) {
  const part = (grams: number) => `${g(grams)}${perGram !== null ? ` (${money(grams * perGram)})` : ""}, ${modelGrams > 0 ? Math.round((grams / modelGrams) * 100) : 0}% do filamento`;
  return (
    <Alert kind="info">
      {support && (
        <>
          <b>Suportes: {part(support.grams)}.</b> Já estão nas gramas acima. Para gastar menos: deite ou gire a peça para ficar menos parte no ar
          {!support.tree && " ou use suporte em árvore (numa peça de teste na A1 o suporte caiu de 3,7 g para 2,2 g)"}.{" "}
        </>
      )}
      {tower !== undefined && (
        <>
          <b>Torre de limpeza: {part(tower)}.</b> Também já está nas gramas. Ela recebe um pouco de cada cor em toda camada com troca; várias peças na mesma mesa dividem esse gasto.
        </>
      )}
    </Alert>
  );
}
