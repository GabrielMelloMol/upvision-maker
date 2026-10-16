import type { CS, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { bevelPrism } from "./bevel";
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
  /** Luva: lisa, vazada (furos redondos em volta) ou com faixas em relevo no alto e embaixo. */
  sleeveStyle: "smooth" | "cutouts" | "bands";
  /** Marcas de dedo na pegada da alça. */
  grooves: boolean;
  /** Copo fantasma translúcido na prévia (só para ver o encaixe; não vai para o arquivo). */
  showCup: boolean;
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
  sleeveStyle: "smooth",
  grooves: true,
  showCup: true,
  name: "Ana",
  nameMode: "raised",
  depth: 0.8,
  print: "full",
  bodyColor: "#1c1c1e",
  nameColor: "#f5c542",
};

const CUP_COLOR = "#8fd3ff";

const FLOOR = 6; // espessura do fundo (mm)
const RECESS = 3; // quanto o fundo do copo entra no assento
const BAR = 8; // espessura das barras da alça
const TEST_HEIGHT = 14; // altura do anel de teste
const SEGMENTS = 128;
const SLANT_MIN = 10; // folga mínima entre a barra de baixo e o começo da inclinação de cima
const MIN_TAPER_WALL = 1.2;
const PLATE_ROUND = 12; // raio dos cantos de fora da alça
const WINDOW_ROUND = 6; // raio dos cantos do vão dos dedos
const EDGE_ROUND = 4; // arredondado da seção da alça (oval)
const GROOVE_R = 3.5; // marcas de dedo
const GROOVE_STEP = 14;
const CUTOUT_COUNT = 12;
const CUTOUT_FRONT_DEG = 40; // sem furo na frente (nome) nem do lado da alça
const CUTOUT_HANDLE_DEG = 30;
const BAND_H = 4;
const BAND_UP = 0.8;
const BANDS_MIN_SLEEVE = 30;
const GHOST_ABOVE = 30; // quanto o copo fantasma passa do topo da luva
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
    const rounded = (cs: CS, r: number) => k(k(cs.offset(-r, "Round")).offset(r, "Round")); // tira as quinas vivas (cantos convexos com raio r)
    const plate = k(new M.CrossSection([outerPoly], "NonZero"));
    const inside = k(plate.offset(-BAR, "Round"));
    const keep = k(k(M.CrossSection.square([xOut, zTop], false)).translate([xW, 0]));
    const window = rounded(k(inside.intersect(keep)), WINDOW_ROUND);
    // a peça de fora arredondada só nos cantos de fora (o lado que entra na luva fica reto, vai para dentro do corpo)
    const wide = k(new M.CrossSection([[[-50, 0], ...outerPoly.slice(1, 4), [-50, zTop]]], "NonZero")); // prolonga para o lado do eixo: o raio não morde a junção
    const fromAxis = k(M.CrossSection.square([xOut + 1, zTop + 1], false)); // só o lado de fora do eixo
    const frame = k(k(rounded(wide, PLATE_ROUND).intersect(fromAxis)).subtract(window));
    // seção oval: as quatro bordas (fora, vão e topos) recuam em arco nas duas faces
    const grip = k(bevelPrism(M, frame, p.handleWidth, "round", EDGE_ROUND, { bottom: true, top: true }));
    // CrossSection (x, z) → sólido: extrudado em Y e girado para o plano XZ
    let handle = k(k(grip.rotate([90, 0, 0])).translate([0, p.handleWidth / 2, 0]));
    if (p.grooves) {
      // marcas de dedo: sulcos redondos na face de dentro da barra de fora
      const n = Math.max(2, Math.min(5, Math.floor((zO - 2 * BAR) / GROOVE_STEP)));
      const grooves = Array.from({ length: n }, (_, i) => {
        const z = BAR + (zO - 2 * BAR) * ((i + 0.5) / n);
        return k(k(k(M.Manifold.cylinder(p.handleWidth + 2, GROOVE_R, GROOVE_R, 24)).rotate([90, 0, 0])).translate([xOut - BAR, p.handleWidth / 2 + 1, z]));
      });
      handle = k(handle.subtract(k(M.Manifold.union(grooves))));
    }

    let body = k(M.Manifold.union([floor, sleeve, handle]));
    // assento do copo e o espaço do corpo cônico (todo o cone, para a alça não entrar no copo)
    const seat = k(cone(M, L.rIn(0), L.rIn(0), L.z0, FLOOR + 1));
    const bore = k(cone(M, L.rIn(0), L.rIn(p.bodyHeight), L.z0, L.z0 + p.bodyHeight));
    body = k(k(body.subtract(seat)).subtract(bore));

    // ---- luva: faixas em relevo ou furos vazados em volta
    const outerCone = (extra: number, z0 = L.sleeveBottom, z1 = L.sleeveTop) => {
      const at = (z: number) => rb + p.wall + ((rt - rb) * (z - L.sleeveBottom)) / p.sleeveHeight + extra;
      return k(cone(M, at(z0), at(z1), z0, z1));
    };
    const bands = p.sleeveStyle === "bands" && p.sleeveHeight >= BANDS_MIN_SLEEVE;
    if (p.sleeveStyle === "bands" && !bands) warnings.push("A luva é baixa para as faixas: aumente a altura da luva (30 mm ou mais).");
    const bandParts: Solid[] = [];
    if (bands) {
      const lowZ = L.sleeveBottom + p.wall + 1, highZ = L.sleeveTop - BAND_H;
      for (const z of [lowZ, highZ]) bandParts.push(k(outerCone(BAND_UP, z, z + BAND_H).subtract(outerCone(-NAME_EMBED, z, z + BAND_H))));
      body = k(body.add(k(M.Manifold.union(bandParts))));
    }
    if (p.sleeveStyle === "cutouts" && p.sleeveHeight >= BANDS_MIN_SLEEVE) {
      const zc = (L.sleeveBottom + p.wall + L.sleeveTop) / 2;
      const r = Math.min(5, (L.sleeveTop - L.sleeveBottom - p.wall) / 2 - 3);
      const holes: Solid[] = [];
      for (let i = 0; i < CUTOUT_COUNT; i++) {
        const deg = (360 * i) / CUTOUT_COUNT; // 0° = lado da alça (+X), 270° = frente (-Y, nome)
        const fromHandle = Math.min(deg, 360 - deg), fromFront = Math.abs(deg - 270);
        if (fromHandle < CUTOUT_HANDLE_DEG || fromFront < CUTOUT_FRONT_DEG) continue;
        // furo redondo na direção do raio, atravessando só a parede
        holes.push(k(k(k(k(M.Manifold.cylinder(L.rMaxOut + 5, r, r, 24)).rotate([-90, 0, 0])).rotate([0, 0, deg - 90])).translate([0, 0, zc])));
      }
      if (holes.length) body = k(body.subtract(k(M.Manifold.union(holes))));
    }

    // ---- nome na frente da luva (o lado de quem olha, a 90° da alça), curvo como o cone: gravado ou em relevo
    const parts: { name: string; color: string; mesh: ReturnType<typeof solidMesh> }[] = [];
    let nameSolid: Solid | null = null;
    if (p.nameMode !== "none" && p.name.trim()) {
      const raw = ctx.text(p.name, 12);
      if (raw) {
        const zLow = L.sleeveBottom + p.wall + (bands ? 1 + BAND_H + 1.5 : 2), zHigh = L.sleeveTop - (bands ? BAND_H + 1.5 : 2); // acima da rampa de baixo e entre as faixas
        const circumference = Math.PI * (L.rIn(p.gripZ) + p.wall + L.rSleeveTopOut);
        const t: CS = k(fitInto(k(raw), Math.min(circumference * 0.4, 90), Math.max(6, zHigh - zLow), (zLow + zHigh) / 2));
        // texto no plano XZ, empurrado para -Y a partir do eixo; a casca do cone recorta a profundidade
        const prism = k(k(t.extrude(L.rMaxOut + 5)).rotate([90, 0, 0]));
        if (p.nameMode === "engraved") body = k(body.subtract(k(prism.intersect(k(outerCone(1).subtract(outerCone(-p.depth)))))));
        else nameSolid = k(prism.intersect(k(outerCone(p.depth).subtract(outerCone(-NAME_EMBED)))));
      }
    }
    parts.push({ name: "Alça", color: p.bodyColor, mesh: solidMesh(body) });
    if (nameSolid) parts.push({ name: "Nome", color: p.nameColor, mesh: solidMesh(nameSolid) });
    const models: { name: string; parts: typeof parts; previewOnly?: boolean }[] = [{ name: "Alça de copo", parts }];
    if (p.showCup) {
      // copo fantasma do perfil, assentado onde o copo fica: só a parte de baixo, até um pouco acima da luva
      const h = Math.min(p.bodyHeight, L.sleeveTop + GHOST_ABOVE - L.z0);
      const top = L.rIn(h) - p.clearance;
      const cupBody = k(M.Manifold.cylinder(h, p.baseDiameter / 2, top, SEGMENTS)).translate([0, 0, L.z0]);
      models.push({ name: "Copo (só na prévia)", previewOnly: true, parts: [{ name: "", color: CUP_COLOR, ghost: true, mesh: solidMesh(cupBody) } as (typeof parts)[number]] });
      cupBody.delete();
    }
    return { models, warnings };
  });
}
