import { pixPayload } from "../../domain/pix";
import { qrMatrix } from "../../domain/qr";
import { qrModel, QR_BASE_COLOR, QR_DARK_COLOR } from "../qr3d";
import { fitInto, scoped } from "../shape2d";
import type { Model } from "../types";
import { MissingInput, moveMesh, roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type PixPlateParams = {
  key: string;
  name: string;
  city: string;
  amount: number; // 0 = quem paga digita
  title: string;
  subtitle: string;
  width: number;
  thickness: number;
  relief: number;
  stand: boolean;
  plateColor: string;
  darkColor: string;
};

export const DEFAULT_PIX_PLATE: PixPlateParams = {
  key: "",
  name: "",
  city: "",
  amount: 0,
  title: "PIX",
  subtitle: "",
  width: 90,
  thickness: 3,
  relief: 1,
  stand: true,
  plateColor: QR_BASE_COLOR,
  darkColor: QR_DARK_COLOR,
};

const SLOT_TILT_DEG = 12;
const SLOT_CLEARANCE = 0.5;

/** Placa de balcão: título, QR do Pix e nome em relevo escuro sobre placa clara; suporte inclinado opcional. */
export function buildPixPlate({ M, text }: ModelCtx, p: PixPlateParams): ModelOutput {
  if (!p.key.trim()) throw new MissingInput("Preencha a chave Pix para ver a placa.");
  const payload = pixPayload({ key: p.key, name: p.name, city: p.city, amount: p.amount > 0 ? p.amount : undefined });
  const W = p.width;
  const m = W * 0.08; // margem
  const gap = W * 0.05;
  const q = W - 2 * m; // lado do QR (com 2 módulos de margem clara)
  const th = p.title.trim() ? W * 0.13 : 0;
  const sh = p.subtitle.trim() ? W * 0.07 : 0;
  const H = m + (th && th + gap) + q + (sh && gap + sh) + m;
  const top = H / 2 - m;
  const qrCy = top - (th && th + gap) - q / 2;

  const qr = qrModel(M, qrMatrix(payload), { sizeMm: q, baseMm: p.thickness, reliefMm: p.relief, quiet: 2, qrColor: p.darkColor });
  const plate = scoped((k) => {
    const labels = [
      th ? k(fitInto(k(text(p.title, th)!), q, th, top - th / 2)) : null,
      sh ? k(fitInto(k(text(p.subtitle, sh)!), q, sh, qrCy - q / 2 - gap - sh / 2)) : null,
    ].filter((c) => c !== null);
    const parts = [
      { name: "Placa", color: p.plateColor, mesh: slab(k(roundedRect(M, W, H, W * 0.06)), p.thickness) },
      { name: "QR", color: p.darkColor, mesh: moveMesh(qr.model.parts[1].mesh, 0, qrCy) },
    ];
    if (labels.length) parts.push({ name: "Texto", color: p.darkColor, mesh: slab(k(M.CrossSection.union(labels)), p.relief, p.thickness) });
    return { name: "Placa Pix", parts } satisfies Model;
  });
  const models: Model[] = [plate];
  if (p.stand) models.push(pixStand(M, p, -H / 2 - 25));
  return { models, warnings: qr.warnings };
}

/** Suporte: bloco com rasgo inclinado onde a placa encaixa em pé. */
function pixStand({ Manifold }: ModelCtx["M"], p: PixPlateParams, y: number): Model {
  const w = p.width * 0.7, d = 30, h = 12, depth = 8;
  return scoped((k) => {
    const block = k(k(Manifold.cube([w, d, h], true)).translate([0, 0, h / 2]));
    const slotW = p.thickness + SLOT_CLEARANCE;
    const slot = k(k(k(Manifold.cube([w + 10, slotW, 40], true)).translate([0, 0, 20])).rotate([-SLOT_TILT_DEG, 0, 0]));
    const cut = k(block.subtract(k(slot.translate([0, 0, h - depth]))));
    return { name: "Suporte", parts: [{ name: "Suporte", color: p.plateColor, mesh: moveMesh(solidMesh(cut), 0, y) }] };
  });
}
