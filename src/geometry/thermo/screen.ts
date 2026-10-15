import { nozzleMm } from "../bed";
import type { CS, ManifoldToplevel } from "../manifold";

type K = <D extends { delete(): void }>(o: D) => D;

type MeshStyle = "honeycomb" | "diamond";
type Closure = "clip" | "ring" | "none";
type ClosureSide = "top" | "bottom";

export type ScreenParams = {
  /** Espessura da tela. */
  t: number;
  /** Largura da borda sólida. */
  border: number;
  mesh: MeshStyle;
  /** Abertura de cada furo da malha (entre lados paralelos) e espessura do fio. */
  aperture: number;
  wire: number;
  closure: Closure;
  side: ClosureSide;
  /** Fecho por clipe: orelha com furo nas duas telas e o clipe que as une. */
  earW: number;
  earLen: number;
  hole: number;
  clipWire: number;
  clipT: number;
  clipLen: number;
  clipW: number;
  clipGap: number;
  /** Fecho por borda extra: faixa em volta da emenda. */
  ringT: number;
  ringH: number;
  ringGap: number;
};

export const DEFAULT_SCREEN: ScreenParams = {
  t: 1,
  border: 3,
  mesh: "honeycomb",
  aperture: 2.5,
  wire: 0.8,
  closure: "clip",
  side: "top",
  earW: 9,
  earLen: 9,
  hole: 3.6,
  clipWire: 2,
  clipT: 1.6,
  clipLen: 16,
  clipW: 9,
  clipGap: 2.4,
  ringT: 1.6,
  ringH: 6,
  ringGap: 0.3,
};

const SQRT3 = Math.sqrt(3);
const EAR_ROUND = 2;
const EAR_OVERLAP = 2;
const HOLE_MARGIN = 0.5; // o furo fica fora da silhueta com esta folga
const EAR_END = 2; // faixa entre o furo e a ponta da orelha

const rrect = (M: ManifoldToplevel, w: number, h: number, r: number, k: K): CS => {
  const rr = Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  return rr > 0 ? k(k(M.CrossSection.square([w - 2 * rr, h - 2 * rr], true)).offset(rr, "Round")) : k(M.CrossSection.square([w, h], true));
};

/** Furos da malha cobrindo a caixa `b`: favo (hexágonos) ou losango (quadrados a 45°). Quem chama apaga o resultado. */
export function meshHoles(M: ManifoldToplevel, b: { min: number[]; max: number[] }, p: Pick<ScreenParams, "mesh" | "aperture" | "wire">, k: K): CS {
  const pitch = p.aperture + p.wire;
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  const reach = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2 + 2 * pitch;
  const cells: [number, number][][] = [];
  if (p.mesh === "honeycomb") {
    const R = p.aperture / SQRT3; // raio do hexágono (vértice para cima)
    const rowH = (pitch * SQRT3) / 2;
    for (let j = -Math.ceil(reach / rowH); j <= Math.ceil(reach / rowH); j++)
      for (let i = -Math.ceil(reach / pitch); i <= Math.ceil(reach / pitch); i++) {
        const x = cx + i * pitch + (Math.abs(j) % 2) * (pitch / 2), y = cy + j * rowH;
        cells.push(Array.from({ length: 6 }, (_, v) => [x + R * Math.cos(Math.PI / 2 + (v * Math.PI) / 3), y + R * Math.sin(Math.PI / 2 + (v * Math.PI) / 3)] as [number, number]));
      }
    return k(new M.CrossSection(cells, "NonZero"));
  }
  const h = p.aperture / 2;
  const n = Math.ceil(reach / pitch);
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) cells.push([[i * pitch - h, j * pitch - h], [i * pitch + h, j * pitch - h], [i * pitch + h, j * pitch + h], [i * pitch - h, j * pitch + h]]);
  return k(k(k(new M.CrossSection(cells, "NonZero")).rotate(45)).translate([cx, cy]));
}

export type ScreenRegions = { border: CS; mesh: CS; design: CS };

/**
 * Tela plana em regiões 2D: borda sólida (com a orelha do fecho), malha (fios no miolo) e o desenho sólido por cima.
 * Os furos ficam a um fio da borda e do desenho e fragmentos menores que o bico viram sólido, então não há fio solto.
 * Quem chama apaga as três regiões.
 */
export function screenRegions(M: ManifoldToplevel, sil: CS, design: CS | null, p: ScreenParams, k: K, ear: CS | null = null): ScreenRegions {
  const inner = k(sil.offset(-p.border, "Round"));
  const d = design ? k(design.intersect(inner)) : null;
  const field = d ? k(inner.subtract(d)) : inner;
  const keepOut = k(field.offset(-p.wire, "Round"));
  const holes = k(meshHoles(M, sil.bounds(), p, k).intersect(keepOut));
  const r = nozzleMm() / 2;
  const clean = k(k(holes.offset(-r, "Round")).offset(r, "Round")); // furos menores que o bico viram sólido
  const mesh = clean.isEmpty() ? field : k(field.subtract(clean));
  const border = k(sil.subtract(inner));
  return {
    // a orelha não entra na área da malha (senão o sólido da orelha sobrepõe os fios): só o que está fora do miolo
    border: ear ? M.CrossSection.union([border, k(ear.subtract(inner))]) : border.translate([0, 0]),
    mesh: mesh.translate([0, 0]),
    design: (d ?? k(M.CrossSection.square([0.001, 0.001]))).translate([0, 0]),
  };
}

/** Orelha do fecho: aba que sai da silhueta no eixo de simetria (em cima ou embaixo), com o furo do clipe. */
export function earOf(M: ManifoldToplevel, sil: CS, p: ScreenParams, k: K): CS {
  const b = sil.bounds();
  const strip = k(k(M.CrossSection.square([0.2, b.max[1] - b.min[1] + 4], true)).translate([0, (b.max[1] + b.min[1]) / 2]));
  const onAxis = k(sil.intersect(strip)).bounds();
  const s = p.side === "top" ? 1 : -1;
  const edge = s * (s > 0 ? onAxis.max[1] : onAxis.min[1]); // distância do eixo até o contorno, no sentido da orelha
  const reach = s * (s > 0 ? b.max[1] : b.min[1]); // ponto mais alto do formato (coração: passa do vão entre os lóbulos)
  const holeR = p.hole / 2;
  const tip = Math.max(edge + p.earLen, reach + holeR + HOLE_MARGIN + EAR_END);
  const len = tip - edge + EAR_OVERLAP;
  const tab = k(rrect(M, p.earW, len, EAR_ROUND, k).translate([0, s * (edge - EAR_OVERLAP + len / 2)]));
  const hole = k(k(M.CrossSection.circle(holeR, 32)).translate([0, s * (tip - EAR_END - holeR)]));
  return k(tab.subtract(hole));
}

/** Clipe-dobradiça: argola chata aberta (um "C" de pista), impressa deitada; as pontas passam pelos furos das duas orelhas. */
export function clipRegion(M: ManifoldToplevel, p: ScreenParams, k: K): CS {
  const outer = rrect(M, p.clipLen, p.clipW, p.clipW / 2, k);
  const inner = rrect(M, p.clipLen - 2 * p.clipWire, p.clipW - 2 * p.clipWire, (p.clipW - 2 * p.clipWire) / 2, k);
  const gap = k(k(M.CrossSection.square([p.clipGap, p.clipWire + 0.2], true)).translate([0, p.clipW / 2 - p.clipWire / 2]));
  return k(k(outer.subtract(inner)).subtract(gap));
}

/** Faixa externa em volta da emenda (borda extra colada por fora), com folga para a silhueta. */
export function ringRegion(sil: CS, p: ScreenParams, k: K): CS {
  return k(k(sil.offset(p.ringGap + p.ringT, "Round")).subtract(k(sil.offset(p.ringGap, "Round"))));
}
