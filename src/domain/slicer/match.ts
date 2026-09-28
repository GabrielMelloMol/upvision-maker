import { MATERIAL_TYPES, type Filament, type Printer } from "../entities";
import type { SlicerFilament } from "./types";

const NAMED: Record<string, string> = {
  preto: "#111111", branco: "#FFFFFF", cinza: "#9CA3AF", prata: "#C0C0C0", vermelho: "#DC2626", vinho: "#7F1D1D",
  laranja: "#F97316", amarelo: "#FACC15", dourado: "#D4AF37", verde: "#16A34A", azul: "#1E40AF", "azul claro": "#60A5FA",
  roxo: "#7C3AED", lilas: "#C4B5FD", rosa: "#EC4899", marrom: "#78350F", bege: "#E7D8B1", transparente: "#EEEEEE", natural: "#EEE8D5",
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "#abc123", "Azul", "amarelo limão" → hex; null se não reconhecer. */
export function colorHex(c: string | undefined): string | null {
  if (!c) return null;
  const t = c.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toUpperCase();
  const n = norm(t);
  if (NAMED[n]) return NAMED[n];
  const first = Object.keys(NAMED).find((k) => n.startsWith(k));
  return first ? NAMED[first] : null;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
/** "PLA Basic", "PLA+", "PLA-CF" → "PLA". */
const baseMaterial = (m: string) => norm(m).match(/^[a-z]+/)?.[0] ?? norm(m);

/** Filamento cadastrado mais provável: mesmo material e cor mais próxima. */
export function matchFilament(f: SlicerFilament, stock: Filament[]): number | null {
  const candidates = f.type ? stock.filter((s) => baseMaterial(s.material) === baseMaterial(f.type!)) : stock;
  if (!candidates.length) return null;
  const target = colorHex(f.color);
  if (!target) return candidates[0].id;
  const scored = candidates.map((s) => ({ id: s.id, d: colorHex(s.color) ? dist(target, colorHex(s.color)!) : Infinity }));
  return scored.reduce((a, b) => (b.d < a.d ? b : a)).id;
}

const tokens = (s: string) => norm(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);

/** Impressora cadastrada cujo nome aparece no modelo do arquivo (a mais específica vence). */
export function matchPrinter(model: string | undefined, printers: Printer[]): number | null {
  if (!model) return null;
  const m = tokens(model).join(" ");
  const hits = printers
    .map((p) => ({ id: p.id, t: tokens(p.name).join(" ") }))
    .filter((p) => p.t && new RegExp(`(^| )${p.t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(m));
  return hits.length ? hits.sort((a, b) => b.t.length - a.t.length)[0].id : null;
}

/** Até esta distância de cor (RGB) é "a mesma cor" (tons de azul de marcas diferentes); vermelho × azul passa de 200. */
const SAME_COLOR = 110;

/** O filamento cadastrado escolhido é mesmo este do arquivo (material igual e cor parecida)? */
export function isCloseMatch(f: SlicerFilament, s: Filament | undefined): boolean {
  if (!s) return false;
  if (f.type && baseMaterial(s.material) !== baseMaterial(f.type)) return false;
  const a = colorHex(f.color);
  const b = colorHex(s.color);
  return !a || !b || dist(a, b) <= SAME_COLOR;
}

const MATERIAL_ALIAS: Record<string, string> = { pa: "Nylon", nylon: "Nylon" };

/** Material e cor para pré-preencher "Cadastrar este filamento". A cor vira o nome mais próximo da paleta, ou o hex. */
export function filamentDraft(f: SlicerFilament, palette: readonly (readonly [string, string])[]): { material: string; color: string } {
  const base = f.type ? baseMaterial(f.type) : "pla";
  const material = MATERIAL_ALIAS[base] ?? MATERIAL_TYPES.find((m) => m.toLowerCase() === base) ?? "Outro";
  const hex = colorHex(f.color);
  if (!hex) return { material, color: f.color?.trim() ?? "" };
  const named = palette.filter(([, h]) => /^#[0-9a-f]{6}$/i.test(h)).map(([name, h]) => ({ name, d: dist(hex, h.toUpperCase()) }));
  const best = named.reduce((a, b) => (b.d < a.d ? b : a), { name: "", d: Infinity });
  return { material, color: best.d <= SAME_COLOR ? best.name : hex };
}
