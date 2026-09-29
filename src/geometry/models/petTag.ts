import type { CS, ManifoldToplevel } from "../manifold";
import { medalOutline } from "../medal";
import { toMesh } from "../mesh";
import { fitInto, outerOnly, scoped } from "../shape2d";
import { MissingInput, slab, type ModelCtx, type ModelOutput } from "./common";

export type PetShape = "bone" | "paw" | "circle" | "heart" | "shield" | "oval" | "wavy" | "fish" | "art";

export type PetTagParams = {
  shape: PetShape;
  name: string;
  phone: string;
  note: string;
  size: number;
  thickness: number;
  relief: number;
  baseColor: string;
  textColor: string;
  backColor: string;
};

export const DEFAULT_PET_TAG: PetTagParams = { shape: "bone", name: "Thor", phone: "(21) 99999-0000", note: "Se me achar, me leve pra casa", size: 45, thickness: 3, relief: 0.8, baseColor: "#2563eb", textColor: "#f8f8f6", backColor: "#f8f8f6" };

const TAB_R = 3.8;
const HOLE_R = 1.8;
const AXIS_BAND = 0.6;
const BACK_DEPTH = 0.6; // verso embutido rente à face de baixo (cor própria nas 1ªs camadas)

type K = <D extends { delete(): void }>(o: D) => D;

const OVAL_RATIO = 0.7; // altura/largura da oval
const WAVES = 12; // ondas da oval ondulada
const WAVE_AMP = 0.05; // fração do raio
const SEG = 144;

/** Contorno polar r(θ) de uma oval (largura 1), com ondas opcionais. */
function oval(M: ManifoldToplevel, amp: number): CS {
  const pts = Array.from({ length: SEG }, (_, i) => {
    const t = (i / SEG) * 2 * Math.PI;
    const r = 0.5 * (1 + amp * Math.sin(WAVES * t));
    return [r * Math.cos(t), r * OVAL_RATIO * Math.sin(t)] as [number, number];
  });
  return new M.CrossSection([pts], "NonZero");
}

/** Contorno da tag com o maior lado = `d`, centrado. `art` = desenho enviado (formato "desenho"). */
function petOutline(M: ManifoldToplevel, k: K, shape: PetShape, d: number, art: CS | null = null): CS {
  if (shape === "circle" || shape === "heart" || shape === "shield") return k(medalOutline(M, shape, d));
  if (shape === "art") {
    if (!art) throw new MissingInput("Envie o desenho do formato da tag.");
    return k(outerOnly(M, k(fitInto(art, d, d, 0))));
  }
  let cs: CS;
  if (shape === "oval" || shape === "wavy") cs = k(oval(M, shape === "wavy" ? WAVE_AMP : 0));
  else if (shape === "fish") {
    // corpo oval + rabo triangular à direita, sobrepostos
    const body = k(k(oval(M, 0)).scale([0.78, 0.85]));
    const tail = k(new M.CrossSection([[[0.3, 0], [0.62, 0.3], [0.62, -0.3]]], "NonZero"));
    cs = k(M.CrossSection.union([body, tail]));
  } else if (shape === "bone") {
    const h = d * 0.46;
    const bar = k(M.CrossSection.square([d * 0.72, h * 0.62], true));
    const knobs = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => k(k(M.CrossSection.circle(h * 0.3, 48)).translate([sx * d * 0.36, sy * h * 0.22]))));
    cs = k(M.CrossSection.union([bar, ...knobs]));
  } else {
    const pad = k(k(M.CrossSection.circle(0.5, 64)).scale([1.1, 0.9]));
    const toes = [
      [-0.62, 0.62, 0.2],
      [-0.22, 0.92, 0.22],
      [0.22, 0.92, 0.22],
      [0.62, 0.62, 0.2],
    ].map(([x, y, r]) => k(k(M.CrossSection.circle(r, 48)).translate([x, y])));
    // dedos ligados à almofada por uma ponte fina (a tag precisa ser uma peça só)
    const bridge = k(k(M.CrossSection.square([1.2, 0.6], true)).translate([0, 0.55]));
    cs = k(M.CrossSection.union([pad, bridge, ...toes]));
  }
  const b = cs.bounds();
  const s = d / Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]);
  return k(k(cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2])).scale(s));
}

/**
 * Plaquinha de identificação de pet: nome em relevo na frente; telefone e recado no verso, embutidos rente
 * à face de baixo em outra cor (sai liso, sem perder o texto com o uso). Argola no topo.
 */
export function buildPetTag({ M, text, art }: ModelCtx, p: PetTagParams): ModelOutput {
  if (!p.name.trim()) throw new MissingInput("Digite o nome do pet.");
  if (p.thickness < BACK_DEPTH + 1.2) throw new Error("Espessura mínima: 1,8 mm (o verso é embutido).");
  return scoped((k) => {
    const outline = petOutline(M, k, p.shape, p.size, art);
    const b = outline.bounds();
    const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1];
    // topo exatamente no eixo (coração e patinha têm um vão no meio: a argola precisa encostar nele)
    const top = k(outline.intersect(k(M.CrossSection.square([AXIS_BAND, 1e4], true)))).bounds().max[1];
    const c: [number, number] = [0, top + TAB_R - 1.5];
    const body2d = k(k(outline.add(k(k(M.CrossSection.circle(TAB_R, 48)).translate(c)))).subtract(k(k(M.CrossSection.circle(HOLE_R, 32)).translate(c))));
    const inner = k(outline.offset(-2, "Round"));
    const name = k(k(fitInto(k(text(p.name, 100)!), w * 0.72, h * 0.34, 0)).intersect(inner));
    const lines = [p.phone, p.note].map((s) => s.trim()).filter(Boolean);
    const lh = Math.min(h * 0.16, 6);
    const back = lines
      .map((l, i) => {
        const raw = text(l, lh);
        const cy = lines.length > 1 ? (i === 0 ? 1 : -1) * (lh / 2 + 1) : 0;
        return raw ? k(k(k(fitInto(k(raw), w * 0.7, lh, cy)).scale([-1, 1])).intersect(inner)) : null; // espelhado: lido pelo verso
      })
      .filter((x): x is CS => !!x);
    const backCs = back.length ? k(M.CrossSection.union(back)) : null;
    let body = k(body2d.extrude(p.thickness));
    if (backCs) body = k(body.subtract(k(backCs.extrude(BACK_DEPTH))));
    const parts = [
      { name: "Tag", color: p.baseColor, mesh: toMesh(body) },
      { name: "Nome", color: p.textColor, mesh: slab(name, p.relief, p.thickness) },
    ];
    if (backCs) parts.push({ name: "Verso", color: p.backColor, mesh: slab(backCs, BACK_DEPTH) });
    return { models: [{ name: p.name.trim(), parts }] };
  });
}
