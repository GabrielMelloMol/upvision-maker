import { qrMatrix } from "../../domain/qr";
import { toMesh } from "../mesh";
import { qrModel } from "../qr3d";
import { fitInto, scoped } from "../shape2d";
import type { CS } from "../manifold";
import { MissingInput, moveMesh, roundedRect, slab, type ModelCtx, type ModelOutput } from "./common";
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
};

export const DEFAULT_BUSINESS_CARD: BusinessCardParams = {
  name: "Ana Souza",
  role: "Ateliê de impressão 3D",
  phone: "(21) 99999-0000",
  email: "ana@minhaloja.com.br",
  link: "minhaloja.com.br",
  thickness: 1.6,
  relief: 0.6,
  fabric: false,
  nfc: false,
  layerHeight: 0.2,
  cardColor: "#1c1c1e",
  textColor: "#f5c542",
};

const W = 85;
const H = 54;
const PAD = 5;
const QR = 30;
const TAG_D = 25 + 1.5;
const FABRIC_LAYERS = 2;

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
  const models = scoped((k) => {
    const hasQr = !!p.link.trim();
    const textW = W - 2 * PAD - (hasQr ? QR + PAD : 0);
    const lines: [string, number][] = [
      [p.name, 6],
      [p.role, 3.6],
      [p.phone, 3.4],
      [p.email, 3.2],
    ];
    const shown = lines.filter(([s]) => s.trim());
    let y = H / 2 - PAD;
    const texts: CS[] = [];
    shown.forEach(([s, h], i) => {
      const raw = text(s, h);
      if (!raw) return;
      y -= h / 2 + (i ? 2.2 : 0);
      texts.push(k(k(fitInto(k(raw), textW, h, y)).translate([-W / 2 + PAD + textW / 2, 0])));
      y -= h / 2;
    });
    let card = k(k(roundedRect(M, W, H, 3)).extrude(p.thickness));
    if (nfc) {
      const cx = hasQr ? -W / 2 + PAD + textW / 2 : 0;
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
    if (hasQr) {
      const qr = qrModel(M, qrMatrix(qrPlatePayload("link", p.link)), { sizeMm: QR, baseMm: p.thickness, reliefMm: p.relief, quiet: 2, qrColor: p.textColor });
      warnings.push(...qr.warnings);
      parts.push({ name: "QR", color: p.textColor, mesh: moveMesh(qr.model.parts[1].mesh, W / 2 - PAD - QR / 2, 0) });
    }
    return [{ name: p.name.trim(), parts }];
  });
  return { models, pauses: [...new Set(pauses)].sort((a, b) => a - b), warnings };
}
