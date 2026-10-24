import type { Solid } from "../manifold";
import { toMesh } from "../mesh";
import type { Mesh, Model, Part } from "../types";

type K = <D extends { delete(): void }>(o: D) => D;

/** Vista "Como prensar" (não imprime): o sanduíche fêmea (embaixo), tela plana (no meio) e macho (em cima), aberto, prensando, pronto e em corte. */
export const PRESS_FRAMES = [["open", "Aberto"], ["mid", "Prensando"], ["closed", "Pronto"], ["section", "Corte"]] as const;
export type PressFrame = (typeof PRESS_FRAMES)[number][0];

export const PRESS_NAMES = { female: "1 Molde fêmea (de baixo)", sheet: "2 Tela (aqueça esta)", male: "3 Molde macho (de cima)" } as const;

/** Quanto a tela já está deformada (0 = plana, 1 = casca) e quanto o macho ainda está longe, em cada quadro. */
export const pressStage = (f: PressFrame): { shape: number; open: number } => (f === "open" ? { shape: 0, open: 1 } : f === "mid" ? { shape: 0.5, open: 0.5 } : { shape: 1, open: 0 });

/** Quanto o macho sobe, na vista aberta, para a tela plana caber entre os moldes. */
export const pressTravel = (domeH: number) => domeH + 2 * HOVER + 1;

const ARROW_COLOR = "#f97316";
const ARROW_PX = 3;
const FEMALE_TINT = 0.5;
const HOVER = 12; // mm da tela plana até o apoio da fêmea, no quadro aberto

/** Mistura a cor com branco, para a fêmea e o macho não saírem iguais na vista (só na prévia: os arquivos usam a cor do molde). */
export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

export type PressInput = {
  frame: PressFrame;
  /** Macho (apoio z = 0 até a ponta do domo) e fêmea já na posição de prensar, sobre o macho (como `buildFemaleSolid(..., true)`). */
  male: Solid;
  female: Solid;
  /** A tela, já deformada para este quadro e com a face de baixo em z = 0; cada pedaço é uma cor. */
  sheet: { color: string; solid: Solid | null; label?: boolean }[];
  /** Altura do apoio do macho (onde a tela assenta), altura do topo da fêmea e quanto o macho sobe quando aberto. */
  flangeT: number;
  femaleTop: number;
  travel: number;
  moldColor: string;
};

/**
 * Monta o sanduíche de cabeça para baixo em relação ao molde macho (a fêmea fica fixa embaixo, com a cavidade para cima, o macho desce por cima):
 * a tela plana pousa no meio e é aquecida. `section` corta tudo ao meio (plano y = 0) para ver a folga.
 */
export function pressModel(k: K, o: PressInput): Model {
  const { shape, open } = pressStage(o.frame);
  const lift = o.travel * open; // quanto o macho (e a tela com ele) está acima da posição fechada
  const sheetLift = o.frame === "open" ? HOVER : lift; // aberto: a tela paira logo abaixo da fêmea; depois assenta no apoio do macho e desce com ele
  const cut = o.frame === "section";
  const at = (s: Solid, dz: number): Solid => {
    const moved = k(s.translate([0, 0, dz])); // dz no sistema do macho (apoio em z = 0, fêmea fixa em cima)
    const trimmed = cut ? k(moved.trimByPlane([0, 1, 0], 0)) : moved;
    // vira de cabeça para baixo: o topo da fêmea vira o fundo da vista
    return k(k(trimmed.mirror([0, 0, 1])).translate([0, 0, o.femaleTop]));
  };
  const part = (name: string, color: string, s: Solid | null, dz: number): Part[] => (s ? [{ name, color, mesh: toMesh(at(s, dz)) }] : []);
  const parts: Part[] = [
    ...part(PRESS_NAMES.female, tint(o.moldColor, FEMALE_TINT), o.female, 0),
    ...o.sheet.flatMap((q, i) => part(q.label === false ? "" : i === 0 ? PRESS_NAMES.sheet : "", q.color, q.solid, o.flangeT - sheetLift)),
    ...part(PRESS_NAMES.male, o.moldColor, o.male, -lift),
  ];
  if (shape < 1 && lift > 0) {
    // seta: o macho desce até fechar
    const b = o.male.boundingBox();
    const x = b.max[0] + 10, top = o.femaleTop + lift;
    const head = 4;
    const seg = [[x, 0, top, x, 0, o.femaleTop], [x, 0, o.femaleTop, x - head, 0, o.femaleTop + head], [x, 0, o.femaleTop, x + head, 0, o.femaleTop + head]];
    parts.push({ name: "Prensar: o macho desce", color: ARROW_COLOR, mesh: { positions: new Float32Array(0), indices: new Uint32Array(0) }, lines: { points: Float32Array.from(seg.flat()), width: ARROW_PX, dash: 0 } });
  }
  return { name: "Como prensar (não imprime)", previewOnly: true, parts };
}

type Warp = (verts: Float32Array, count: number) => void;

/**
 * Animação da prensagem (#270): cada pedaço da tela em duas posições com a MESMA malha (mesmos índices, vértice i ↔ i),
 * plana e já virada casca, para interpolar quadro a quadro. Tudo no lugar do quadro "Pronto" de `pressModel` (fêmea
 * embaixo, macho fechado); para animar, suba o macho `travel × (1 − t)` em z e a tela `min(hover, subida do macho)`, e
 * misture plana → casca conforme o macho desce os últimos `hover` mm.
 */
export type PressMorph = { parts: { color: string; flat: Mesh; pressed: Mesh }[]; travel: number; hover: number; male: Model; female: Model };

export type MorphInput = Omit<PressInput, "frame" | "sheet"> & {
  /** A tela plana (face de baixo em z = 0), um sólido por pedaço; `refine` e `warp` são os mesmos da deformação da prévia. */
  sheet: { color: string; solid: Solid | null }[];
  refine: number;
  warp: Warp;
};

export function pressMorph(k: K, o: MorphInput): PressMorph {
  // vira de cabeça para baixo como `pressModel` (z → topo da fêmea − z), invertendo o sentido dos triângulos
  const place = (src: Float32Array, indices: Uint32Array): Mesh => {
    const positions = Float32Array.from(src);
    for (let i = 2; i < positions.length; i += 3) positions[i] = o.femaleTop - (positions[i] + o.flangeT);
    const flipped = Uint32Array.from(indices);
    for (let i = 0; i < flipped.length; i += 3) [flipped[i + 1], flipped[i + 2]] = [flipped[i + 2], flipped[i + 1]];
    return { positions, indices: flipped };
  };
  const parts = o.sheet.flatMap(({ color, solid }) => {
    if (!solid) return [];
    // a deformação vai direto nos vértices: o Manifold reordena a malha ao deformar, e a animação precisa da mesma ordem
    const fine = toMesh(k(solid.refineToLength(o.refine)));
    const formed = Float32Array.from(fine.positions);
    o.warp(formed, formed.length / 3);
    return [{ color, flat: place(fine.positions, fine.indices), pressed: place(formed, fine.indices) }];
  });
  const still = (name: string, color: string, s: Solid): Model => ({ name, previewOnly: true, parts: [{ name, color, mesh: toMesh(k(k(s.mirror([0, 0, 1])).translate([0, 0, o.femaleTop]))) }] });
  return { parts, travel: o.travel, hover: HOVER, male: still(PRESS_NAMES.male, o.moldColor, o.male), female: still(PRESS_NAMES.female, tint(o.moldColor, FEMALE_TINT), o.female) };
}
