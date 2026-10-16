import { COUPONS, type KitInputs, type KitSelection } from "../geometry/testKit/catalog";
import { COLOR, dateBr, Pdf, type PdfFonts } from "./doc";

const br = (v: number, d = 2) => v.toFixed(d).replace(".", ",");
const NEEDS: Record<string, (i: KitInputs) => string> = {
  cup: (i) => `diâmetro de ${br(i.cupDiameter, 1)} mm na altura da alça`,
  board: (i) => `${br(i.boardL, 1)} × ${br(i.boardW, 1)} mm (comprimento × largura)`,
  phone: (i) => `aparelho de ${br(i.phoneW, 1)} mm de largura, ${br(i.phoneT, 1)} mm de espessura e canto de raio ${br(i.phoneR, 1)} mm`,
  candy: (i) => `êmbolo de ${br(i.candyD, 1)} mm de diâmetro`,
};

/**
 * Folha de conferência do Kit de testes físicos (#247): o que imprimir, o que medir ou encaixar em cada peça, quando o teste vale e onde
 * lançar o número escolhido no app (a folga preferida vira o padrão). Só os cupons marcados entram.
 */
export type PlateSummary = { title: string; names: string[] };

export async function testKitPdf(fonts: PdfFonts, selected: KitSelection, inputs: KitInputs, date: string, plates: PlateSummary[] = []): Promise<{ bytes: Uint8Array; trace: string[] }> {
  const pdf = await Pdf.create(fonts, "Kit de testes físicos");
  const chosen = COUPONS.filter((c) => selected[c.id]);
  pdf.text("KIT DE TESTES FÍSICOS", { size: 16, font: "bold" });
  pdf.text(`Folha de conferência · ${dateBr(date)}`, { size: 9.5, color: COLOR.muted });
  pdf.gap(8);
  pdf.text("Imprima o kit uma vez, confira cada peça abaixo e lance o número escolhido em Ajustes › Kit de testes: a folga preferida vira o padrão das ferramentas. Cada peça tem o número em relevo (1, 2, 3…); o número é a posição na varredura, e a tabela mostra a folga de cada um.", { size: 9.5 });
  pdf.gap(4);
  pdf.text("Isto confere o encaixe na SUA impressora, com o SEU filamento e bico. Mudou de filamento, de bico ou de máquina? Repita o teste. Nada aqui foi verificado fisicamente antes: por isso o kit existe.", { size: 9, color: COLOR.muted });
  pdf.gap(8);

  const withNeeds = chosen.filter((c) => NEEDS[c.id]);
  if (withNeeds.length) {
    pdf.text("Medidas usadas neste kit (refaça o kit se as suas forem diferentes)", { size: 11, font: "semibold" });
    for (const c of withNeeds) pdf.text(`•  ${c.title}: ${NEEDS[c.id](inputs)}`, { size: 9.5 });
    pdf.gap(8);
  }

  if (plates.length) {
    pdf.text("Mesas e filamentos (imprima uma mesa por vez, no filamento indicado)", { size: 11, font: "semibold" });
    for (const pl of plates) {
      pdf.text(pl.title, { size: 9.5, font: "semibold" });
      pdf.text(pl.names.join(" · "), { size: 8.5, color: COLOR.muted });
    }
    pdf.gap(8);
  }

  pdf.text("Resumo", { size: 11, font: "semibold" });
  const w = pdf.width;
  pdf.table(
    [
      { title: "Peça", width: w * 0.34 },
      { title: "Ferramenta", width: w * 0.36 },
      { title: "Material do teste", width: w * 0.3 },
    ],
    chosen.map((c) => [c.title, c.tool, c.material]),
    9,
  );

  chosen.forEach((c, idx) => {
    pdf.ensure(210);
    pdf.gap(12);
    pdf.rule();
    pdf.gap(6);
    pdf.text(`${idx + 1}. ${c.title}`, { size: 12.5, font: "bold" });
    pdf.text(`${c.tool} · ${c.material}`, { size: 9, color: COLOR.muted });
    pdf.gap(4);
    pdf.text(`O que é: ${c.what}`, { size: 9.5 });
    pdf.text(`Como conferir: ${c.how}`, { size: 9.5 });
    pdf.text(`Quando vale: ${c.pass}`, { size: 9.5, font: "semibold" });
    pdf.gap(4);
    pdf.table(
      [
        { title: "Número da peça", width: w * 0.25 },
        { title: c.fitLabel, width: w * 0.45 },
        { title: "Marque a melhor", width: w * 0.3 },
      ],
      c.sweep.map((v, i) => [String(i + 1), `${br(v, v >= 1 && c.fitKey !== "latchReach" ? 1 : 2)} ${c.unit}${v === c.fallback ? "  (padrão de hoje)" : ""}`, "[   ]"]),
      9.5,
    );
    pdf.gap(4);
    pdf.text(`Onde lançar: Ajustes › Kit de testes › ${c.fitLabel}. Hoje vale ${br(c.fallback, c.fallback >= 1 && c.fitKey !== "latchReach" ? 1 : 2)} ${c.unit}.`, { size: 9.5, font: "semibold", color: COLOR.accent });
    pdf.text("Número escolhido: ______     Anotações: ______________________________________________", { size: 9.5 });
  });

  pdf.gap(14);
  pdf.rule();
  pdf.gap(6);
  pdf.text("Peças que dependem de medida (como a capa) pedem o seu aparelho; as outras, só a sua impressora e as peças de verdade (copo, placa).", { size: 8.5, color: COLOR.muted });
  return { bytes: await pdf.save("Kit de testes físicos · UpVision Maker"), trace: pdf.trace };
}
