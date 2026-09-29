import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { medalOutline } from "../medal";
import { fitInto, scoped } from "../shape2d";
import type { Part } from "../types";
import { roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type ScrewCaseParams = {
  innerDiameter: number;
  innerHeight: number;
  wall: number;
  floor: number;
  /** Passo da rosca (distância entre filetes vizinhos). */
  pitch: number;
  threadDepth: number;
  clearance: number;
  /** Entradas: 2 fecha na metade das voltas. */
  starts: number;
  /** Voltas até fechar. */
  turns: number;
  name: string;
  nameMode: "raised" | "engraved" | "none";
  relief: number;
  texture: "smooth" | "mosaic";
  iconSize: number;
  keyring: boolean;
  bodyColor: string;
  lidColor: string;
  accentColor: string;
};

export const DEFAULT_SCREW_CASE: ScrewCaseParams = {
  innerDiameter: 20,
  innerHeight: 80,
  wall: 1.6,
  floor: 1.6,
  pitch: 3,
  threadDepth: 1.2,
  clearance: 0.35,
  starts: 2,
  turns: 1.5,
  name: "Ana",
  nameMode: "raised",
  relief: 0.8,
  texture: "smooth",
  iconSize: 7,
  keyring: false,
  bodyColor: "#be185d",
  lidColor: "#fbcfe8",
  accentColor: "#fdf2f8",
};

const HEADROOM = 0.5; // folga entre o topo do gargalo e o teto da tampa
const FLANK_DEG = 55; // flanco em relação à horizontal: imprime sem suporte
const SEGMENTS = 128;
const TWIST_STEP = 0.4; // mm entre divisões da torção (a hélice é linear entre elas)
const EAR = 12;
const EAR_HOLE = 4;
const GAP = 10;
const MIN_BASE = 3;

/** Medidas derivadas (raios e alturas no estojo fechado, corpo com o fundo em z = 0). */
export function caseLayout(p: ScrewCaseParams) {
  const lead = p.pitch * Math.max(1, Math.round(p.starts));
  const neckH = Math.max(p.pitch, p.turns * lead);
  const maleMinor = p.innerDiameter / 2 + p.wall;
  const maleMajor = maleMinor + p.threadDepth;
  const femaleMinor = maleMinor + p.clearance;
  const outer = maleMajor + p.clearance + p.wall;
  const shoulder = Math.max(p.floor + MIN_BASE, p.floor + p.innerHeight - neckH - HEADROOM);
  const lidTop = Math.max(p.wall, 1.6);
  const lidHeight = neckH + HEADROOM + lidTop;
  return { lead, neckH, maleMinor, maleMajor, femaleMinor, outer, shoulder, lidTop, lidHeight, floor: p.floor };
}

/** Seção da rosca: `starts` dentes trapezoidais em volta; torcida ao longo do eixo vira hélice exata. */
function threadSection(M: ManifoldToplevel, p: ScrewCaseParams, grow: number): CS {
  const L = caseLayout(p);
  const n = Math.max(1, Math.round(p.starts));
  const rise = Math.min(0.45, p.threadDepth / Math.tan((FLANK_DEG * Math.PI) / 180) / p.pitch); // fração do passo
  const top = (1 - 2 * rise) / 2;
  const shape = (t: number) => (t < rise ? t / rise : t < rise + top ? 1 : t < 2 * rise + top ? 1 - (t - rise - top) / rise : 0);
  const count = SEGMENTS * n;
  const pts: [number, number][] = Array.from({ length: count }, (_, i) => {
    const a = (2 * Math.PI * i) / count;
    const t = ((a * n) / (2 * Math.PI)) % 1;
    const r = L.maleMinor + grow + p.threadDepth * shape(t);
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  return new M.CrossSection([pts], "Positive");
}

/** Trecho de rosca de z0 a z0 + h, na mesma fase em qualquer peça (a hélice passa por ângulo 0 em z = 0). */
function thread(M: ManifoldToplevel, p: ScrewCaseParams, grow: number, z0: number, h: number): Solid {
  const L = caseLayout(p);
  return scoped((k) => {
    const cs = k(threadSection(M, p, grow));
    const twist = (360 * h) / L.lead;
    const phase = (360 * z0) / L.lead;
    return k(k(cs.extrude(h, Math.ceil(h / TWIST_STEP), twist)).rotate([0, 0, phase])).translate([0, 0, z0]);
  });
}

type Built = { body: Solid; lid: Solid; decor: Part[] };

function build(ctx: ModelCtx, p: ScrewCaseParams, k: <D extends { delete(): void }>(o: D) => D): Built {
  const { M } = ctx;
  const L = caseLayout(p);
  const Ri = p.innerDiameter / 2;
  const top = L.shoulder + L.neckH;
  // corpo: base cheia até o ombro + gargalo com rosca macho (chanfrada no topo para achar a entrada)
  const base = k(M.Manifold.cylinder(L.shoulder, L.outer, L.outer, SEGMENTS));
  const chamfer = k(k(M.Manifold.cylinder(L.neckH - p.threadDepth, L.maleMajor + 1, L.maleMajor + 1, SEGMENTS)).add(k(k(M.Manifold.cylinder(p.threadDepth, L.maleMajor + 1, L.maleMinor, SEGMENTS)).translate([0, 0, L.neckH - p.threadDepth]))));
  const male = k(k(thread(M, p, 0, L.shoulder, L.neckH)).intersect(k(chamfer.translate([0, 0, L.shoulder]))));
  const cavity = k(k(M.Manifold.cylinder(top - p.floor + 1, Ri, Ri, SEGMENTS)).translate([0, 0, p.floor]));
  let body = k(k(base.add(male)).subtract(cavity));
  // tampa (na posição fechada): encosta no ombro; rosca fêmea = a macho + folga, na mesma fase
  const lidOuter = k(k(M.Manifold.cylinder(L.lidHeight, L.outer, L.outer, SEGMENTS)).translate([0, 0, L.shoulder]));
  const female = k(thread(M, p, p.clearance, L.shoulder - 0.01, L.neckH + 0.02));
  const room = k(k(M.Manifold.cylinder(HEADROOM + 0.01, L.maleMajor + p.clearance, L.maleMajor + p.clearance, SEGMENTS)).translate([0, 0, top]));
  let lid = k(lidOuter.subtract(k(female.add(room))));
  if (p.keyring) {
    const ear = k(k(k(roundedRect(M, EAR * 2, EAR, EAR / 2)).subtract(k(k(M.CrossSection.circle(EAR_HOLE / 2, 32)).translate([EAR / 2, 0])))).translate([L.outer, 0]));
    lid = k(lid.add(k(k(ear.extrude(L.lidTop)).translate([0, 0, L.shoulder + L.lidHeight - L.lidTop]))));
  }
  // decoração na parede do corpo (abaixo do ombro): nome na frente e/ou mosaico de um ícone
  const decor: Part[] = [];
  const ring = (inR: number, outR: number) => k(k(k(k(M.CrossSection.circle(outR, SEGMENTS)).subtract(k(M.CrossSection.circle(inR, SEGMENTS)))).extrude(L.shoulder - 2 * p.floor)).translate([0, 0, p.floor]));
  const prism = (cs: CS, angle: number, z: number) => k(k(k(k(cs.extrude(L.outer + p.relief + 1)).rotate([90, 0, 0])).translate([0, 0, z])).rotate([0, 0, angle]));
  let nameHalfAngle = 0;
  if (p.nameMode !== "none" && p.name.trim()) {
    const raw = ctx.text(p.name, 20);
    if (raw) {
      const t = k(fitInto(k(k(raw).rotate(90)), L.outer * 1.1, (L.shoulder - 2 * p.floor) * 0.85, 0));
      const tb = t.bounds();
      nameHalfAngle = (tb.max[0] - tb.min[0]) / 2 / L.outer + 0.15;
      const pr = prism(t, 0, L.shoulder / 2);
      if (p.nameMode === "raised") decor.push({ name: "Nome", color: p.accentColor, mesh: solidMesh(k(pr.intersect(ring(L.outer - 0.01, L.outer + p.relief)))) });
      else body = k(body.subtract(k(pr.intersect(ring(L.outer - p.relief, L.outer + 1)))));
    }
  }
  if (p.texture === "mosaic") {
    const icon0: CS = ctx.art && !ctx.art.isEmpty() ? ctx.art : k(medalOutline(M, "star", 20));
    const icon = k(fitInto(icon0, p.iconSize, p.iconSize, 0));
    const step = p.iconSize * 1.6;
    const cols = Math.max(3, Math.floor((2 * Math.PI * L.outer) / step));
    const rows = Math.max(1, Math.floor((L.shoulder - 2 * p.floor - p.iconSize) / step) + 1);
    const prisms: Solid[] = [];
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const a = (2 * Math.PI * (i + (j % 2) / 2)) / cols; // tijolo: fileiras alternadas meio passo
        const wrapped = Math.atan2(Math.sin(a), Math.cos(a));
        if (nameHalfAngle && Math.abs(wrapped) < nameHalfAngle) continue; // deixa a frente para o nome
        prisms.push(prism(icon, (a * 180) / Math.PI, p.floor + p.iconSize / 2 + 1 + j * step));
      }
    if (prisms.length) {
      const tex = k(k(M.Manifold.union(prisms)).intersect(ring(L.outer - 0.01, L.outer + p.relief)));
      if (!tex.isEmpty()) decor.push({ name: "Textura", color: p.accentColor, mesh: solidMesh(tex) });
    }
  }
  return { body, lid, decor };
}

/** Estojo fechado (para conferir encaixe e espaço interno). Quem chama dá delete() nos dois. */
export function screwCaseClosed(ctx: ModelCtx, p: ScrewCaseParams): { body: Solid; lid: Solid } {
  return scoped((k) => {
    const b = build(ctx, p, k);
    return { body: b.body.translate([0, 0, 0]), lid: b.lid.translate([0, 0, 0]) };
  });
}

/**
 * Estojo cilíndrico com tampa de rosca (#59): medidas internas → corpo e tampa. A tampa é desenhada na posição
 * fechada (por isso para alinhada, rente ao corpo) e depois virada de cabeça para baixo ao lado para imprimir.
 */
export function buildScrewCase(ctx: ModelCtx, p: ScrewCaseParams): ModelOutput {
  return scoped((k) => {
    const L = caseLayout(p);
    const { body, lid, decor } = build(ctx, p, k);
    const flipped = k(lid.rotate([180, 0, 0]));
    const fb = flipped.boundingBox();
    const dx = 2 * L.outer + GAP + (p.keyring ? EAR : 0);
    const printLid = k(flipped.translate([dx, 0, -fb.min[2]]));
    return {
      models: [
        { name: "Corpo", parts: [{ name: "Corpo", color: p.bodyColor, mesh: solidMesh(body) }, ...decor] },
        { name: "Tampa", parts: [{ name: "Tampa", color: p.lidColor, mesh: solidMesh(printLid) }] },
      ],
      warnings: p.threadDepth <= p.clearance + 0.3 ? ["A rosca ficou rasa para a folga: ela pode espanar. Aumente a profundidade ou diminua a folga."] : [],
    };
  });
}
