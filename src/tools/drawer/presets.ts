import { freeSpot, newModule, type DrawerLayout } from "./layout";

/** Uma caixinha do exemplo: tamanho em casas, altura e a fatia da gaveta (0–1) que o grupo ocupa, em área. */
type Item = { w: number; h: number; u: number; label: string; share: number };
export type DrawerPreset = { id: string; label: string; blurb: string; items: Item[] };

/** Exemplos para a grade não abrir vazia: cada um enche a gaveta do usuário, seja qual for o tamanho dela. */
export const DRAWER_PRESETS: DrawerPreset[] = [
  {
    id: "office",
    label: "Escritório",
    blurb: "Canetas, post-its, clipes e borrachas.",
    items: [
      { w: 3, h: 2, u: 4, label: "Canetas", share: 0.24 },
      { w: 2, h: 2, u: 3, label: "Post-its", share: 0.16 },
      { w: 2, h: 1, u: 2, label: "Clipes", share: 0.1 },
      { w: 1, h: 1, u: 2, label: "Borrachas", share: 0.08 },
      { w: 1, h: 1, u: 2, label: "Pilhas", share: 0.06 },
    ],
  },
  {
    id: "workshop",
    label: "Oficina",
    blurb: "Parafusos, porcas, brocas e alicates.",
    items: [
      { w: 3, h: 2, u: 5, label: "Alicates", share: 0.24 },
      { w: 2, h: 2, u: 3, label: "Parafusos", share: 0.2 },
      { w: 2, h: 1, u: 2, label: "Porcas", share: 0.1 },
      { w: 1, h: 1, u: 2, label: "Buchas", share: 0.08 },
      { w: 1, h: 1, u: 2, label: "Brocas", share: 0.06 },
    ],
  },
  {
    id: "makeup",
    label: "Maquiagem",
    blurb: "Pincéis, batons e sombras.",
    items: [
      { w: 3, h: 2, u: 5, label: "Pincéis", share: 0.26 },
      { w: 2, h: 2, u: 3, label: "Batons", share: 0.18 },
      { w: 2, h: 1, u: 2, label: "Sombras", share: 0.1 },
      { w: 1, h: 1, u: 2, label: "Esponjas", share: 0.08 },
      { w: 1, h: 1, u: 2, label: "Cotonetes", share: 0.06 },
    ],
  },
  {
    id: "kitchen",
    label: "Cozinha",
    blurb: "Espátulas, abridores, rolhas e temperos.",
    items: [
      { w: 3, h: 2, u: 5, label: "Espátulas", share: 0.26 },
      { w: 2, h: 2, u: 4, label: "Abridores", share: 0.16 },
      { w: 2, h: 1, u: 3, label: "Temperos", share: 0.1 },
      { w: 1, h: 1, u: 2, label: "Rolhas", share: 0.08 },
      { w: 1, h: 1, u: 2, label: "Elásticos", share: 0.06 },
    ],
  },
];

/** Enche a grade com o exemplo, do maior para o menor; o que não couber fica de fora. */
export function applyPreset(l: DrawerLayout, preset: DrawerPreset, uMax: number): DrawerLayout {
  let out: DrawerLayout = { ...l, modules: [] };
  for (const it of preset.items) {
    const n = Math.max(1, Math.round((it.share * l.cols * l.rows) / (it.w * it.h)));
    for (let i = 0; i < n; i++) {
      const spot = freeSpot(out, it.w, it.h);
      if (!spot) break;
      out = { ...out, modules: [...out.modules, { ...newModule(spot, uMax), u: Math.max(1, Math.min(it.u, uMax)), label: it.label }] };
    }
  }
  return out;
}
