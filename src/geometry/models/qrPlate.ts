import { linkPayload, qrMatrix, wifiPayload } from "../../domain/qr";
import { instagramPayload, reviewPayload, whatsappPayload } from "../../domain/qrPayloads";
import { iconCs, type IconKind } from "../icons";
import type { CS } from "../manifold";
import { qrModel } from "../qr3d";
import { fitInto, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { boxOf, MissingInput, moveMesh, offsetOf, plateStand, roundedRect, slab, type ElementBox, type ModelCtx, type ModelOutput } from "./common";

export type QrKind = "wifi" | "whatsapp" | "instagram" | "review" | "link";

export type QrPlateParams = {
  kind: QrKind;
  value: string; // rede, telefone, @ ou link
  password: string; // só Wi-Fi
  title: string;
  subtitle: string;
  width: number;
  thickness: number;
  relief: number;
  stand: boolean;
  plateColor: string;
  darkColor: string;
};

export const DEFAULT_QR_PLATE: QrPlateParams = {
  kind: "wifi",
  value: "MinhaLoja",
  password: "senha1234",
  title: "Wi-Fi",
  subtitle: "Aponte a câmera",
  width: 90,
  thickness: 3,
  relief: 1,
  stand: true,
  plateColor: "#f8f8f6",
  darkColor: "#1c1c1e",
};

const ICON: Record<QrKind, IconKind> = { wifi: "wifi", whatsapp: "chat", instagram: "camera", review: "stars", link: "link" };

/** Texto do QR para cada tipo de placa. */
export function qrPlatePayload(kind: QrKind, value: string, password = ""): string {
  if (!value.trim()) throw new MissingInput(kind === "wifi" ? "Digite o nome da rede Wi-Fi." : "Preencha o conteúdo do QR para ver a placa.");
  if (kind === "wifi") return wifiPayload({ ssid: value.trim(), password, security: password ? "WPA" : "nopass" });
  if (kind === "whatsapp") return whatsappPayload(value);
  if (kind === "instagram") return instagramPayload(value);
  if (kind === "review") return reviewPayload(value);
  return linkPayload(value);
}

/** Tipo pelo conteúdo, para a placa com vários QRs: @perfil = Instagram, só números = WhatsApp, resto = link. */
export function guessKind(value: string): QrKind {
  const v = value.trim();
  if (/^@/.test(v) || /instagram\.com/i.test(v)) return "instagram";
  if (/^[\d\s()+-]{10,}$/.test(v)) return "whatsapp";
  return "link";
}

/** QR (placa + módulos) centrado em (x, y), de lado `size`. */
function qrAt(ctx: ModelCtx, payload: string, size: number, p: { thickness: number; relief: number; darkColor: string }, x: number, y: number) {
  const qr = qrModel(ctx.M, qrMatrix(payload), { sizeMm: size, baseMm: p.thickness, reliefMm: p.relief, quiet: 2, qrColor: p.darkColor });
  return { mesh: moveMesh(qr.model.parts[1].mesh, x, y), warnings: qr.warnings };
}

/**
 * Placa QR multiuso: ícone + título em cima, QR no meio e uma frase embaixo (ex.: nome da rede), com suporte.
 * O ícone é desenhado aqui (Wi-Fi, conversa, câmera, estrelas, corrente), sem logo de marca.
 */
export function buildQrPlate(ctx: ModelCtx, p: QrPlateParams): ModelOutput {
  const { M, text } = ctx;
  const payload = qrPlatePayload(p.kind, p.value, p.password);
  const W = p.width, m = W * 0.08, gap = W * 0.05, q = W - 2 * m;
  const th = W * 0.13;
  const sh = p.subtitle.trim() ? W * 0.07 : 0;
  const H = m + th + gap + q + (sh && gap + sh) + m;
  const top = H / 2 - m;
  const qrCy = top - th - gap - q / 2;
  // cada elemento na posição calculada + o deslocamento do gizmo (#79)
  const [qx, qy] = offsetOf(ctx, "qr");
  const qr = qrAt(ctx, payload, q, p, qx, qrCy + qy);
  const elements: ElementBox[] = [{ id: "qr", label: "QR", box: [-q / 2 + qx, qrCy - q / 2 + qy, q / 2 + qx, qrCy + q / 2 + qy] }];
  const plate = scoped((k) => {
    const at = (id: string, label: string, parts: CS[]) => {
      const off = offsetOf(ctx, id);
      const moved = parts.map((c) => k(c.translate(off)));
      elements.push({ id, label, box: boxOf(k(M.CrossSection.union(moved))) });
      return moved;
    };
    const icon = k(iconCs(M, ICON[p.kind], th));
    const title = p.title.trim() ? text(p.title, th * 0.8) : null;
    const head: CS[] = [];
    if (title) {
      const t = k(fitInto(k(title), q - th - gap, th * 0.8, 0));
      const tw = t.bounds().max[0] - t.bounds().min[0];
      const total = th + gap + tw;
      head.push(k(icon.translate([-total / 2 + th / 2, top - th / 2])), k(t.translate([-total / 2 + th + gap + tw / 2, top - th / 2])));
    } else head.push(k(icon.translate([0, top - th / 2])));
    const row = at("head", "Ícone e título", head);
    const sub = sh ? text(p.subtitle, sh) : null;
    if (sub) row.push(...at("subtitle", "Texto de baixo", [k(fitInto(k(sub), q, sh, qrCy - q / 2 - gap - sh / 2))]));
    const parts: Part[] = [
      { name: "Placa", color: p.plateColor, mesh: slab(k(roundedRect(M, W, H, W * 0.06)), p.thickness) },
      { name: "QR", color: p.darkColor, mesh: qr.mesh },
      { name: "Texto", color: p.darkColor, mesh: slab(k(M.CrossSection.union(row)), p.relief, p.thickness) },
    ];
    return { name: p.title.trim() || "Placa QR", parts } satisfies Model;
  });
  const models: Model[] = [plate];
  if (p.stand) models.push(plateStand(M, W, p.thickness, p.plateColor, -H / 2 - 25));
  return { models, warnings: qr.warnings, elements };
}

export type QrListParams = {
  title: string;
  label1: string;
  link1: string;
  label2: string;
  link2: string;
  label3: string;
  link3: string;
  label4: string;
  link4: string;
  layout: "vertical" | "horizontal";
  qrSize: number;
  thickness: number;
  relief: number;
  stand: boolean;
  plateColor: string;
  darkColor: string;
};

export const DEFAULT_QR_LIST: QrListParams = {
  title: "Siga a gente",
  label1: "Instagram",
  link1: "@minhaloja",
  label2: "WhatsApp",
  link2: "(21) 99999-0000",
  label3: "Site",
  link3: "minhaloja.com.br",
  label4: "",
  link4: "",
  layout: "horizontal",
  qrSize: 40,
  thickness: 3,
  relief: 1,
  stand: true,
  plateColor: "#f8f8f6",
  darkColor: "#1c1c1e",
};

/** Placa com 1 a 4 QRs lado a lado (ou empilhados), cada um com o rótulo embaixo e o ícone do tipo. */
export function buildQrList(ctx: ModelCtx, p: QrListParams): ModelOutput {
  const { M, text } = ctx;
  const entries = ([1, 2, 3, 4] as const)
    .map((i) => ({ label: p[`label${i}`].trim(), link: p[`link${i}`].trim() }))
    .filter((e) => e.link);
  if (!entries.length) throw new MissingInput("Preencha pelo menos um link para ver a placa.");
  const q = p.qrSize, m = q * 0.18, gap = q * 0.15, lh = q * 0.16;
  const cellW = q, cellH = q + gap + lh;
  const n = entries.length;
  const th = p.title.trim() ? q * 0.22 : 0;
  const horizontal = p.layout === "horizontal";
  const W = horizontal ? 2 * m + n * cellW + (n - 1) * gap : 2 * m + cellW;
  const H = 2 * m + (th && th + gap) + (horizontal ? cellH : n * cellH + (n - 1) * gap);
  const top = H / 2 - m;
  const warnings: string[] = [];
  const plate = scoped((k) => {
    const texts: CS[] = [];
    const qrMeshes: Part[] = [];
    if (th) texts.push(k(fitInto(k(text(p.title, th)!), W - 2 * m, th, top - th / 2)));
    entries.forEach((e, i) => {
      const x = horizontal ? -W / 2 + m + cellW / 2 + i * (cellW + gap) : 0;
      const yTop = top - (th && th + gap) - (horizontal ? 0 : i * (cellH + gap));
      const kind = guessKind(e.link);
      const qr = qrAt(ctx, qrPlatePayload(kind, e.link), q, p, x, yTop - q / 2);
      warnings.push(...qr.warnings);
      qrMeshes.push({ name: `QR ${i + 1}`, color: p.darkColor, mesh: qr.mesh });
      const labelY = yTop - q - gap - lh / 2;
      const icon = k(iconCs(M, ICON[kind], lh));
      const raw = e.label ? text(e.label, lh) : null;
      if (raw) {
        const t = k(fitInto(k(raw), cellW - lh - 2, lh, 0));
        const tw = t.bounds().max[0] - t.bounds().min[0];
        const total = lh + 2 + tw;
        texts.push(k(icon.translate([x - total / 2 + lh / 2, labelY])), k(t.translate([x - total / 2 + lh + 2 + tw / 2, labelY])));
      } else texts.push(k(icon.translate([x, labelY])));
    });
    return {
      name: p.title.trim() || "Placa de QRs",
      parts: [{ name: "Placa", color: p.plateColor, mesh: slab(k(roundedRect(M, W, H, m)), p.thickness) }, ...qrMeshes, { name: "Texto", color: p.darkColor, mesh: slab(k(M.CrossSection.union(texts)), p.relief, p.thickness) }],
    } satisfies Model;
  });
  const models: Model[] = [plate];
  if (p.stand) models.push(plateStand(M, W, p.thickness, p.plateColor, -H / 2 - 25));
  return { models, warnings: [...new Set(warnings)] };
}
