import { qrMatrix } from "../../domain/qr";
import { toMesh } from "../mesh";
import { qrModel } from "../qr3d";
import { fitInto, scoped } from "../shape2d";
import { thinLineWarning } from "../textCheck";
import type { CS } from "../manifold";
import { boxOf, MissingInput, moveMesh, placeIn, roundedRect, slab, type AlignX, type AlignY, type ElementBox, type ModelCtx, type ModelOutput } from "./common";
import { nfcLayout } from "./nfcKeychain";
import { qrPlatePayload } from "./qrPlate";

export type BusinessCardParams = {
  name: string;
  role: string;
  phone: string;
  email: string;
  link: string; // QR opcional
  thickness: number;
  relief: number;
  fabric: boolean; // pausa na 2ª camada para colocar tecido (organza, tule)
  nfc: boolean;
  layerHeight: number;
  cardColor: string;
  textColor: string;
  /** Arrumação (#79): texto à esquerda + QR à direita, QR à esquerda, QR em cima ou só texto. */
  layout?: "qrRight" | "qrLeft" | "qrTop" | "textOnly";
  align?: AlignX; // alinhamento das linhas dentro do bloco
  blockY?: AlignY; // bloco de texto em cima, no meio ou embaixo da área
  lineGap?: number; // espaço entre linhas (mm)
};

export const DEFAULT_BUSINESS_CARD: BusinessCardParams = {
  name: "Ana Souza",
  role: "Impressão 3D",
  phone: "(21) 99999-0000",
  email: "ana@loja.com",
  link: "minhaloja.com.br",
  thickness: 1.6,
  relief: 0.6,
  fabric: false,
  nfc: false,
  layerHeight: 0.2,
  cardColor: "#1c1c1e",
  textColor: "#f5c542",
  layout: "qrRight",
  align: "left",
  blockY: "middle",
  lineGap: 2.2,
};

const W = 85;
const H = 54;
const PAD = 5;
const QR = 30;
const TAG_D = 25 + 1.5;
const FABRIC_LAYERS = 2;
const MIN_QR = 14; // QR menor que isto fica difícil de ler
const EDGE = 1; // elemento a menos disto da borda: avisa

// 4,6 mm: a menor altura em que os traços da fonte padrão (Hanken) passam de 0,4 mm (#126)
const NAME_H = 6;
const LINE_H = 4.6;

const snap = (z: number) => Math.round(z * 1000) / 1000;

/**
 * Cartão de visita 85 × 54: textos em relevo à esquerda, QR à direita (opcional). Pausas opcionais: na 2ª camada
 * para colocar um tecido fino (fica "preso" dentro), e no bolsão da tag NFC.
 */
export function buildBusinessCard(ctx: ModelCtx, p: BusinessCardParams): ModelOutput {
  const { M, text } = ctx;
  if (!p.name.trim()) throw new MissingInput("Digite o nome.");
  const nfc = p.nfc ? nfcLayout({ tagThickness: 0.8, layerHeight: p.layerHeight }) : null;
  if (nfc && p.thickness < nfc.height) throw new Error(`Com NFC o cartão precisa de pelo menos ${nfc.height.toFixed(1).replace(".", ",")} mm de espessura.`);
  const pauses: number[] = [];
  const warnings: string[] = [];
  const out: { elements?: ElementBox[] } = {};
  const models = scoped((k) => {
    const layout = p.layout ?? "qrRight";
    const hasQr = !!p.link.trim() && layout !== "textOnly";
    const gap = p.lineGap ?? 2.2;
    const align = p.align ?? "left";
    const inner: [number, number, number, number] = [-W / 2 + PAD, -H / 2 + PAD, W / 2 - PAD, H / 2 - PAD];
    const side = hasQr && layout !== "qrTop";
    const textW = inner[2] - inner[0] - (side ? QR + PAD : 0);
    const lines: [string, number][] = [
      [p.name, NAME_H],
      [p.role, LINE_H],
      [p.phone, LINE_H],
      [p.email, LINE_H],
    ];
    // bloco de linhas montado na origem, cada linha alinhada à esquerda, ao centro ou à direita
    let y = 0;
    const block: CS[] = [];
    lines
      .filter(([s]) => s.trim())
      .forEach(([s, h], i) => {
        const raw = text(s, h);
        if (!raw) return;
        y -= h / 2 + (i ? gap : 0);
        const line = k(fitInto(k(raw), textW, h, y));
        const b = line.bounds();
        // confere o traço no tamanho final: a linha longa encolhe para caber (#126)
        const thin = thinLineWarning(line, s);
        if (thin) warnings.push(thin);
        const x = align === "left" ? -b.min[0] : align === "right" ? -b.max[0] : -(b.min[0] + b.max[0]) / 2;
        block.push(k(line.translate([x, 0])));
        y -= h / 2;
      });
    const blockCs = k(M.CrossSection.union(block));
    const tb = boxOf(blockCs);
    const tbH = tb[3] - tb[1];
    // áreas de cada elemento conforme a arrumação
    let qrSize = QR;
    let textArea = inner, qrArea: [number, number, number, number] | null = null;
    if (hasQr && layout === "qrRight") [textArea, qrArea] = [[inner[0], inner[1], inner[2] - QR - PAD, inner[3]], [inner[2] - QR, inner[1], inner[2], inner[3]]];
    if (hasQr && layout === "qrLeft") [qrArea, textArea] = [[inner[0], inner[1], inner[0] + QR, inner[3]], [inner[0] + QR + PAD, inner[1], inner[2], inner[3]]];
    if (hasQr && layout === "qrTop") {
      qrSize = Math.min(QR, inner[3] - inner[1] - tbH - PAD);
      if (qrSize < MIN_QR) warnings.push("Com QR em cima sobra pouco espaço: o QR ficou pequeno. Use menos linhas ou o QR ao lado.");
      qrArea = [inner[0], inner[3] - qrSize, inner[2], inner[3]];
      textArea = [inner[0], inner[1], inner[2], inner[3] - qrSize - PAD];
    }
    const [tdx, tdy] = placeIn(ctx, "texts", tb, textArea, "center", p.blockY ?? "middle");
    const texts = [k(blockCs.translate([tdx, tdy]))];
    const elements: ElementBox[] = [{ id: "texts", label: "Textos", box: [tb[0] + tdx, tb[1] + tdy, tb[2] + tdx, tb[3] + tdy] }];
    let card = k(k(roundedRect(M, W, H, 3)).extrude(p.thickness));
    if (nfc) {
      const cx = side ? (textArea[0] + textArea[2]) / 2 : 0;
      card = k(card.subtract(k(k(M.Manifold.cylinder(nfc.top - nfc.bottom, TAG_D / 2, TAG_D / 2, 64)).translate([cx, -H / 2 + PAD + TAG_D / 2 - 6, nfc.bottom]))));
      pauses.push(nfc.pauseZ);
      warnings.push(`Pausa em Z = ${nfc.pauseZ.toFixed(2).replace(".", ",")} mm para a tag NFC.`);
    }
    if (p.fabric) {
      const z = snap((FABRIC_LAYERS + 1) * p.layerHeight);
      pauses.push(z);
      warnings.push(`Pausa em Z = ${z.toFixed(2).replace(".", ",")} mm: estique o tecido sobre a mesa e retome (as camadas de cima prendem ele).`);
    }
    const parts = [
      { name: "Cartão", color: p.cardColor, mesh: toMesh(card) },
      { name: "Textos", color: p.textColor, mesh: slab(k(M.CrossSection.union(texts)), p.relief, p.thickness) },
    ];
    if (hasQr && qrArea && qrSize > 0) {
      const qr = qrModel(M, qrMatrix(qrPlatePayload("link", p.link)), { sizeMm: qrSize, baseMm: p.thickness, reliefMm: p.relief, quiet: 2, qrColor: p.textColor });
      warnings.push(...qr.warnings);
      // o QR sai centrado na origem; a caixa dele é o quadrado do tamanho pedido
      const qb: [number, number, number, number] = [-qrSize / 2, -qrSize / 2, qrSize / 2, qrSize / 2];
      const [qx, qy] = placeIn(ctx, "qr", qb, qrArea);
      parts.push({ name: "QR", color: p.textColor, mesh: moveMesh(qr.model.parts[1].mesh, qx, qy) });
      elements.push({ id: "qr", label: "QR", box: [qb[0] + qx, qb[1] + qy, qb[2] + qx, qb[3] + qy] });
    }
    for (const e of elements)
      if (e.box[0] < -W / 2 + EDGE || e.box[2] > W / 2 - EDGE || e.box[1] < -H / 2 + EDGE || e.box[3] > H / 2 - EDGE) warnings.push(`${e.label}: passa da borda do cartão. Arraste de volta ou use "Centralizar tudo".`);
    out.elements = elements;
    return [{ name: p.name.trim(), parts }];
  });
  return { models, pauses: [...new Set(pauses)].sort((a, b) => a - b), warnings, elements: out.elements };
}
