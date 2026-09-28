import { qrMatrix } from "../domain/qr";
import { filamentQr } from "../domain/spoolQr";
import { moveMesh, roundedRect, slab, type TextFn } from "./models/common";
import type { ManifoldToplevel } from "./manifold";
import { QR_BASE_COLOR, QR_DARK_COLOR, qrModel } from "./qr3d";
import { fitInto, scoped } from "./shape2d";
import type { Model, Part } from "./types";

export type SpoolTagInput = { id: number; title: string; color: string | null };

const W = 66;
const H = 28;
const QR = 24;
const BASE = 1.6;
const RELIEF = 0.8;
const HOLE_R = 2.2; // abraçadeira ou argola no furo do carretel
const PAD = 2;
const DOT_R = 3.5;

/**
 * Plaquinha do rolo: placa clara com o QR (aponta para o filamento), o nome e o #id em relevo escuro,
 * uma bolinha na cor do filamento e furo para prender no carretel.
 */
export function buildSpoolTag(M: ManifoldToplevel, text: TextFn, t: SpoolTagInput): Model {
  return scoped((k) => {
    const qr = qrModel(M, qrMatrix(filamentQr(t.id)), { sizeMm: QR, baseMm: BASE, reliefMm: RELIEF, quiet: 2 });
    const qx = -W / 2 + PAD + QR / 2;
    const hx = W / 2 - PAD - HOLE_R - 1;
    const plate = k(k(roundedRect(M, W, H, 3)).subtract(k(k(M.CrossSection.circle(HOLE_R, 32)).translate([hx, H / 2 - PAD - HOLE_R - 1]))));
    const tx0 = qx + QR / 2 + PAD;
    const tw = hx - HOLE_R - PAD - tx0;
    const line = (s: string, h: number, cy: number) => {
      const raw = text(s, h);
      return raw ? k(k(fitInto(k(raw), tw, h, cy)).translate([tx0 + tw / 2, 0])) : null;
    };
    const labels = [line(t.title, 6, 4), line(`#${t.id}`, 5, -6)].filter((c) => c !== null);
    const parts: Part[] = [
      { name: "Placa", color: QR_BASE_COLOR, mesh: slab(plate, BASE) },
      { name: "QR", color: QR_DARK_COLOR, mesh: moveMesh(qr.model.parts[1].mesh, qx, 0) },
    ];
    if (labels.length) parts.push({ name: "Texto", color: QR_DARK_COLOR, mesh: slab(k(M.CrossSection.union(labels)), RELIEF, BASE) });
    if (t.color) parts.push({ name: t.title || "Cor", color: t.color, mesh: slab(k(k(M.CrossSection.circle(DOT_R, 32)).translate([hx, -H / 2 + PAD + DOT_R + 1])), RELIEF, BASE) });
    return { name: t.title || `Filamento ${t.id}`, parts };
  });
}
