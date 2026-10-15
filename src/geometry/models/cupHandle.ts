import type { CS, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type CupHandleParams = {
  /** Diâmetro da base do copo, mm. */
  baseDiameter: number;
  /** Diâmetro do copo lá em cima (onde ele é mais largo), mm. */
  topDiameter: number;
  /** Altura do corpo cônico, da base ao topo, mm. */
  bodyHeight: number;
  /** Altura (a partir da base do copo) onde a luva começa. */
  gripZ: number;
  sleeveHeight: number;
  /** Folga entre o copo e a peça. */
  clearance: number;
  wall: number;
  /** Largura da alça (para o lado de fora do copo, na direção Y). */
  handleWidth: number;
  /** Vão para os dedos. */
  fingerGap: number;
  name: string;
  nameMode: "engraved" | "raised" | "none";
  depth: number;
  /** "test": só o anel de teste (a luva curta) para conferir o encaixe antes da peça inteira. */
  print: "full" | "test";
  bodyColor: string;
  nameColor: string;
};

export const DEFAULT_CUP_HANDLE: CupHandleParams = {
  baseDiameter: 80,
  topDiameter: 100,
  bodyHeight: 260,
  gripZ: 70,
  sleeveHeight: 40,
  clearance: 0.5,
  wall: 3,
  handleWidth: 18,
  fingerGap: 32,
  name: "Ana",
  nameMode: "engraved",
  depth: 0.8,
  print: "full",
  bodyColor: "#1c1c1e",
  nameColor: "#f5c542",
};

const FLOOR = 6; // espessura do fundo (mm)
const RECESS = 3; // quanto o fundo do copo entra no assento
const BAR = 8; // espessura das barras da alça
const TEST_HEIGHT = 14; // altura do anel de teste
const SEGMENTS = 128;
const SLANT_MIN = 10; // folga mínima entre a barra de baixo e o começo da inclinação de cima
const MIN_TAPER_WALL = 1.2;
const NAME_EMBED = 0.4; // quanto o relevo do nome entra na parede da luva (fica preso, não solto no ar)

/** Diâmetro do copo a `z` mm da base. */
export const cupDiameter = (p: CupHandleParams, z: number) => p.baseDiameter + ((p.topDiameter - p.baseDiameter) * z) / p.bodyHeight;

/** Medidas derivadas: z do topo do assento, raios nas pontas da luva, altura total. */
export function handleLayout(p: CupHandleParams) {
  const z0 = FLOOR - RECESS; // z do mundo onde a base do copo fica
  const rIn = (cz: number) => cupDiameter(p, cz) / 2 + p.clearance;
  const sleeveBottom = z0 + p.gripZ;
  const sleeveTop = sleeveBottom + p.sleeveHeight;
  const rSleeveTopOut = rIn(p.gripZ + p.sleeveHeight) + p.wall;
  const rMaxOut = Math.max(rSleeveTopOut, rIn(0) + p.wall);
  return { z0, rIn, sleeveBottom, sleeveTop, rSleeveTopOut, rMaxOut };
}

/** Cone de raio r0 em z0 e r1 em z1. */
function cone(M: ModelCtx["M"], r0: number, r1: number, z0: number, z1: number): Solid {
  return scoped((k) => k(M.Manifold.cylinder(z1 - z0, r0, r1, SEGMENTS)).translate([0, 0, z0]));
}

/**
 * Alça de copo térmico removível (#221): o copo assenta num fundo com borda e uma luva cônica (do mesmo cone do copo, com
 * folga) o abraça; uma alça em D para o lado; o nome vai na frente da luva, gravado ou em relevo. A luva sai do perfil do copo (diâmetro da base, da boca e
 * altura do corpo) e há um anel de teste para conferir o encaixe antes da peça inteira.
 */
export function buildCupHandle(ctx: ModelCtx, p: CupHandleParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const L = handleLayout(p);
    if (p.topDiameter < p.baseDiameter) warnings.push("O copo é mais largo embaixo que em cima: a luva foi feita para copo que alarga para cima.");
    if (p.gripZ + p.sleeveHeight > p.bodyHeight) warnings.push("A luva passa do topo do copo: abaixe a altura da luva ou o começo dela.");
    if (p.wall < MIN_TAPER_WALL) warnings.push("Parede muito fina.");

    // ---- anel de teste: só a luva curta, no mesmo ponto do cone
    if (p.print === "test") {
      const h = Math.min(TEST_HEIGHT, p.sleeveHeight);
      const outer = k(cone(M, L.rIn(p.gripZ) + p.wall, L.rIn(p.gripZ + h) + p.wall, 0, h));
      const bore = k(cone(M, L.rIn(p.gripZ), L.rIn(p.gripZ + h), -0.01, h + 0.01));
      const ring = k(outer.subtract(bore));
      return {
        models: [{ name: "Anel de teste", parts: [{ name: "Anel de teste", color: p.bodyColor, mesh: solidMesh(ring) }] }],
        warnings: [...warnings, `Anel de teste: ele tem que passar pelo copo de baixo para cima e parar rente à marca de ${p.gripZ} mm da base. Se apertar, aumente a folga; se ficar folgado, diminua.`],
      };
    }

    // ---- corpo de revolução: fundo + luva
    const rFloor = L.rIn(0) + p.wall;
    const floor = k(cone(M, rFloor, rFloor, 0, FLOOR));
    // luva: revolução do perfil, com a borda de baixo em 45° (a parede vira a rampa) para imprimir sem suporte
    const rb = L.rIn(p.gripZ), rt = L.rIn(p.gripZ + p.sleeveHeight);
    const profile = k(new M.CrossSection([[[rb, L.sleeveBottom], [rb + p.wall, L.sleeveBottom + p.wall], [rt + p.wall, L.sleeveTop], [rt, L.sleeveTop]]], "NonZero"));
    const sleeve = k(M.Manifold.revolve(profile, SEGMENTS));

    // ---- alça em D no plano XZ, largura em Y, para o lado +X
    const xW = L.rMaxOut; // onde começa o vão dos dedos
    const xOut = xW + p.fingerGap + BAR;
    const zTop = L.sleeveTop;
    const zO = Math.max(zTop - (xOut - L.rSleeveTopOut), BAR + SLANT_MIN); // inclinação de 45° em cima: imprime sem suporte
    const outerPoly: [number, number][] = [[0, 0], [xOut, 0], [xOut, zO], [L.rSleeveTopOut, zTop], [0, zTop]];
    const plate = k(new M.CrossSection([outerPoly], "NonZero"));
    const inside = k(plate.offset(-BAR, "Round"));
    const keep = k(k(M.CrossSection.square([xOut, zTop], false)).translate([xW, 0]));
    const window = k(inside.intersect(keep));
    const frame = k(plate.subtract(window));
    // CrossSection (x, z) → sólido: extrudado em Y e girado para o plano XZ
    const handle = k(k(k(frame.extrude(p.handleWidth)).rotate([90, 0, 0])).translate([0, p.handleWidth / 2, 0]));

    let body = k(M.Manifold.union([floor, sleeve, handle]));
    // assento do copo e o espaço do corpo cônico (todo o cone, para a alça não entrar no copo)
    const seat = k(cone(M, L.rIn(0), L.rIn(0), L.z0, FLOOR + 1));
    const bore = k(cone(M, L.rIn(0), L.rIn(p.bodyHeight), L.z0, L.z0 + p.bodyHeight));
    body = k(k(body.subtract(seat)).subtract(bore));

    // ---- nome na frente da luva (o lado de quem olha, a 90° da alça), curvo como o cone: gravado ou em relevo
    const parts: { name: string; color: string; mesh: ReturnType<typeof solidMesh> }[] = [];
    let nameSolid: Solid | null = null;
    if (p.nameMode !== "none" && p.name.trim()) {
      const raw = ctx.text(p.name, 12);
      if (raw) {
        const zLow = L.sleeveBottom + p.wall + 2, zHigh = L.sleeveTop - 2; // acima da rampa de baixo
        const circumference = Math.PI * (L.rIn(p.gripZ) + p.wall + L.rSleeveTopOut);
        const t: CS = k(fitInto(k(raw), Math.min(circumference * 0.4, 90), Math.max(6, zHigh - zLow), (zLow + zHigh) / 2));
        // texto no plano XZ, empurrado para -Y a partir do eixo; a casca do cone recorta a profundidade
        const prism = k(k(t.extrude(L.rMaxOut + 5)).rotate([90, 0, 0]));
        const outerCone = (extra: number) => k(cone(M, rb + p.wall + extra, rt + p.wall + extra, L.sleeveBottom, L.sleeveTop));
        if (p.nameMode === "engraved") body = k(body.subtract(k(prism.intersect(k(outerCone(1).subtract(outerCone(-p.depth)))))));
        else nameSolid = k(prism.intersect(k(outerCone(p.depth).subtract(outerCone(-NAME_EMBED)))));
      }
    }
    parts.push({ name: "Alça", color: p.bodyColor, mesh: solidMesh(body) });
    if (nameSolid) parts.push({ name: "Nome", color: p.nameColor, mesh: solidMesh(nameSolid) });
    return { models: [{ name: "Alça de copo", parts }], warnings };
  });
}
