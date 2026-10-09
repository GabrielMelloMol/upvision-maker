import type { CS, ManifoldToplevel } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { LED } from "../lithophaneLed";
import { bedMm } from "../bed";
import { MissingInput, moveMesh, plateStand, roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { isDst, offsetLabel, tzAt, utcOffsetHours } from "./placeTime";
import { CITIES, skyLines, skyStars, type SkyLine, type SkyStar } from "./starSky";

export type StarMapMount = "none" | "stand" | "magnet";
/** Quantidade de estrelas: o limite de magnitude sai sozinho do tamanho da placa; isto só pede menos ou mais. */
export type StarDensity = "few" | "normal" | "many";

export type StarMapParams = {
  city: string; // id de CITIES (rascunhos antigos) ou "custom" (usa latitude e longitude, do lugar buscado)
  lat: number;
  lon: number;
  placeName: string; // nome do lugar buscado ("Campinas, SP"), para a legenda e o aviso (#196)
  tz: string; // nome IANA do fuso do lugar buscado; vazio = pela latitude e longitude
  tzAuto: boolean; // fuso e horário de verão pela localização e pela data (#196)
  utcOffset: number; // fuso da hora informada, em horas (Brasília = -3), usado com o fuso automático desligado
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  title: string;
  caption: string; // vazio = "dd.mm.aaaa · cidade"
  density: StarDensity; // poucas, normal, muitas: o limite de magnitude é automático pelo tamanho da placa e do bico
  nozzle: number | string; // bico da impressora em mm (0,2 / 0,4 / 0,6 / 0,8; vem como texto do seletor): estrela e linha nunca ficam mais finas que ele aguenta
  starScale: number;
  hollow: boolean; // estrelas vazadas (furos) para LED atrás
  ledDepth: number; // profundidade do rebaixo atrás para a fita ou o disco de LED
  lines: boolean; // linhas das constelações
  width: number;
  thickness: number;
  relief: number;
  mount: StarMapMount;
  plateColor: string;
  starColor: string;
};

export const DEFAULT_STAR_MAP: StarMapParams = {
  city: "custom", lat: -23.55, lon: -46.63, placeName: "São Paulo, SP", tz: "America/Sao_Paulo", tzAuto: true, utcOffset: -3, year: 2024, month: 12, day: 24, hour: 22, minute: 0,
  title: "Nossa noite", caption: "", density: "normal", nozzle: 0.4, starScale: 1, hollow: false, ledDepth: 4, lines: true, width: 120, thickness: 3, relief: 0.8, mount: "stand",
  plateColor: "#16213e", starColor: "#f5efe0",
};

const MARGIN = 6; // da borda da placa ao círculo do céu
const RING_MM = 1; // largura do aro do horizonte
const TEXT_BLOCK = 0.3; // altura da faixa de texto, em frações da largura
export const MIN_STAR_FACTOR = 1.5; // a menor estrela: 1,5 bico (0,6 mm com bico 0,4)
export const MIN_HOLE_FACTOR = 2; // o menor furo (estrela vazada): 2 bicos
export const MIN_LINE_FACTOR = 2; // a linha de constelação mais fina: 2 bicos
const STAR_STEP_MM = 0.55; // quanto cada magnitude a mais de brilho engorda a estrela
const MAG_CEILING = 5; // o catálogo embutido vai até a magnitude 5
const STARS_PER_MM2 = 0.0525; // estrelas por mm² do céu com bico 0,4 e "normal" (placa de 120 mm: ~480, até a magnitude 4,5)
const DENSITY_LEVEL: Record<StarDensity, number> = { few: 0.5, normal: 1, many: 1.7 };
const REF_NOZZLE = 0.4;
const LID_GAP_MM = 10; // espaço entre a placa e a tampa na mesa
const SKIN_MM = 1.2; // frente da placa vazada (onde ficam os furos das estrelas)
const EDGE_FRACTION = 0.97; // as estrelas ficam um pouco para dentro do aro
const MAGNET_D = 10.2;
const MAGNET_DEPTH = 2;
const MIN_FACE_MM = 1.2;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const pad = (n: number) => String(Math.round(n)).padStart(2, "0");

/** Menor estrela (ou furo, se vazada) que o bico imprime: o mínimo vale para todas, a mais fraca inclusive. */
export const minStarMm = (nozzle: number, hollow: boolean): number => nozzle * (hollow ? MIN_HOLE_FACTOR : MIN_STAR_FACTOR);
/** Linha de constelação mais fina que o bico imprime. */
export const minLineMm = (nozzle: number): number => nozzle * MIN_LINE_FACTOR;

/** Diâmetro "ideal" da estrela (mm) pela magnitude: as brilhantes são maiores; a do limite vale o mínimo, vezes a escala. */
export const idealDiameter = (mag: number, limit: number, scale: number, minStar: number): number => (minStar + (limit - mag) * STAR_STEP_MM) * scale;
/** Diâmetro impresso: o ideal, mas nunca abaixo do mínimo. */
export const starDiameter = (mag: number, limit: number, scale: number, minStar: number): number => Math.max(minStar, idealDiameter(mag, limit, scale, minStar));

export type PlanStar = SkyStar & { /** mm a partir do centro do céu */ px: number; py: number; ideal: number; d: number };
export type StarMapPlan = {
  place: { lat: number; lon: number };
  placeName: string;
  zone: string;
  when: { year: number; month: number; day: number; hour: number; minute: number; utcOffset: number };
  /** raio do céu em mm (a borda é o horizonte) */
  R: number;
  stars: PlanStar[];
  /** quantas estrelas o céu tem acima do horizonte até a magnitude 5, e quantas cabem */
  visible: number;
  allowed: number;
  limit: number;
  nozzle: number;
  minStar: number;
  lineMm: number;
  /** estrelas cujo tamanho ideal ficaria abaixo do mínimo e foram engrossadas até ele */
  tooSmall: number;
};

/** Raio do céu (mm) numa placa da largura `width`. */
export const skyRadius = (width: number): number => width / 2 - MARGIN;

/**
 * O que vai na placa, já decidido: as estrelas com posição e diâmetro final, o limite de magnitude (automático pelo
 * tamanho da placa, do bico e de "Quantidade de estrelas") e quantas ficariam pequenas demais. Usado pela peça e pela
 * prévia "como vai sair impresso".
 */
export function starMapPlan(p: StarMapParams): StarMapPlan {
  const year = Math.round(p.year), month = Math.round(p.month), day = Math.round(p.day);
  if (day < 1 || day > DAYS_IN_MONTH[month - 1] + (month === 2 && isLeap(year) ? 1 : 0)) throw new MissingInput("Esse dia não existe nesse mês: confira a data.");
  const city = CITIES.find((c) => c[0] === p.city);
  const place = city ? { lat: city[2], lon: city[3] } : { lat: p.lat, lon: p.lon };
  const placeName = city ? city[1] : p.placeName.trim();
  // fuso e horário de verão pela localização e pela data (#196); o campo tz só vale para o lugar buscado
  const tz = !city && p.tz.trim() ? p.tz.trim() : tzAt(place.lat, place.lon);
  const local = { year, month, day, hour: p.hour, minute: p.minute };
  const utcOffset = p.tzAuto ? utcOffsetHours(tz, local) : p.utcOffset;
  const zone = p.tzAuto ? offsetLabel(utcOffset, isDst(tz, local)) : offsetLabel(utcOffset, false);
  const when = { ...local, utcOffset };

  const nozzle = Math.max(0.1, Number(p.nozzle) || REF_NOZZLE);
  const minStar = minStarMm(nozzle, p.hollow);
  const R = skyRadius(p.width);
  const all = skyStars(place, when, MAG_CEILING); // da mais brilhante à mais fraca
  // quantas estrelas cabem: proporcional à área do céu, ao quadrado do bico de referência e à quantidade pedida
  const allowed = Math.max(1, Math.round(STARS_PER_MM2 * Math.PI * R * R * (REF_NOZZLE / nozzle) ** 2 * DENSITY_LEVEL[p.density ?? "normal"]));
  const limit = all.length <= allowed ? MAG_CEILING : all[allowed - 1].mag;
  const shown = all.filter((s) => s.mag <= limit);
  const stars: PlanStar[] = shown.map((s) => {
    const ideal = idealDiameter(s.mag, limit, p.starScale, minStar);
    return { ...s, px: s.x * R * EDGE_FRACTION, py: s.y * R * EDGE_FRACTION, ideal, d: Math.max(minStar, ideal) };
  });
  return { place, placeName, zone, when, R, stars, visible: all.length, allowed, limit, nozzle, minStar, lineMm: minLineMm(nozzle), tooSmall: stars.filter((s) => s.ideal < minStar - 1e-9).length };
}

type Keep = <D extends { delete(): void }>(o: D) => D;

/** Cada trecho de linha vira um retângulo fino com uma ponta redonda por vértice (sem frestas nas curvas). */
function constellationShapes(M: ManifoldToplevel, lines: SkyLine[], radius: number, cy: number, lineMm: number, k: Keep): CS[] {
  const shapes: CS[] = [];
  for (const { points } of lines) {
    points.forEach(([x, y], i) => {
      const [px, py] = [x * radius, cy + y * radius];
      shapes.push(k(k(M.CrossSection.circle(lineMm / 2, 12)).translate([px, py])));
      const prev = points[i - 1];
      if (!prev) return;
      const [qx, qy] = [prev[0] * radius, cy + prev[1] * radius];
      const len = Math.hypot(px - qx, py - qy);
      if (len < 1e-6) return;
      const bar = k(M.CrossSection.square([len, lineMm], true));
      shapes.push(k(k(bar.rotate((Math.atan2(py - qy, px - qx) * 180) / Math.PI)).translate([(px + qx) / 2, (py + qy) / 2])));
    });
  }
  return shapes;
}

/** Medidas da placa vazada (LED atrás): a frente, o rebaixo do LED e o degrau da tampa, reaproveitando as medidas da base de LED da litofania. */
export function hollowLayout(p: Pick<StarMapParams, "width" | "ledDepth">) {
  const R = skyRadius(p.width);
  const pocketR = R + RING_MM + 1; // o rebaixo cobre o céu e o aro
  const recessR = pocketR + 1.5; // o degrau onde a tampa assenta
  const thickness = SKIN_MM + p.ledDepth + LED.rebate;
  return { R, pocketR, recessR, lidR: recessR - LED.plateClear, lidT: LED.plateT, recessDepth: LED.rebate, skin: SKIN_MM, thickness };
}

/** Mapa estelar de uma data (#106): o céu de um lugar e momento, em relevo numa placa (ou vazado para LED), com título e legenda. */
export function buildStarMap(ctx: ModelCtx, p: StarMapParams): ModelOutput {
  const { M, text } = ctx;
  const plan = starMapPlan(p);
  const { place, placeName, zone, when, R, minStar } = plan;
  const hollow = p.hollow;
  const lay = hollowLayout(p);

  return scoped((k) => {
    const W = p.width, textH = W * TEXT_BLOCK, H = W + textH;
    const cy = H / 2 - W / 2; // centro do céu: no quadrado de cima da placa
    const stars: CS[] = plan.stars.map((s) => k(k(M.CrossSection.circle(s.d / 2, 20)).translate([s.px, cy + s.py])));
    const ring = k(k(M.CrossSection.circle(R + RING_MM, 96)).subtract(k(M.CrossSection.circle(R, 96)))).translate([0, cy]);
    k(ring);
    const lineShapes = p.lines ? constellationShapes(M, skyLines(place, when), R * EDGE_FRACTION, cy, plan.lineMm, k) : [];
    const drawn: CS[] = [ring, ...lineShapes];

    const line = (s: string, h: number, y: number): CS | null => {
      const raw = s.trim() ? text(s, 100) : null;
      return raw ? k(fitInto(k(raw), W - 2 * MARGIN, h, y)) : null;
    };
    const label = p.caption.trim() || `${pad(Math.round(p.day))}.${pad(Math.round(p.month))}.${Math.round(p.year)}${placeName ? ` · ${placeName}` : ""}`;
    const bottom = -H / 2;
    for (const t of [line(p.title, textH * 0.36, bottom + textH * 0.68), line(label, textH * 0.17, bottom + textH * 0.2)]) if (t) drawn.push(t);

    const outline = k(roundedRect(M, W, H, W * 0.05));
    const name = plan.placeName || `lat. ${place.lat}, long. ${place.lon}`;
    const warnings = [`${plan.stars.length} estrelas (até a magnitude ${plan.limit.toFixed(1)}, automático pelo tamanho da placa) no céu de ${name}, fuso ${zone}${p.tzAuto ? " (automático pela localização e pela data)" : ""}.`];
    if (plan.tooSmall) warnings.push(`${plan.tooSmall} de ${plan.stars.length} estrelas ficariam menores que ${minStar.toFixed(2).replace(".", ",")} mm (o mínimo do bico de ${String(plan.nozzle).replace(".", ",")} mm) e foram engrossadas até ele.`);
    const models: Model[] = [];
    let thickness = p.thickness;

    if (!hollow) {
      const marks: CS[] = [...stars, ...drawn];
      let plateMesh;
      if (p.mount === "magnet") {
        const pocket = k(k(M.Manifold.cylinder(MAGNET_DEPTH + 0.01, MAGNET_D / 2, MAGNET_D / 2, 48, false)).translate([0, 0, -0.01]));
        plateMesh = solidMesh(k(k(outline.extrude(p.thickness)).subtract(pocket)));
      } else plateMesh = slab(outline, p.thickness);
      const parts: Part[] = [
        { name: "Placa", color: p.plateColor, mesh: plateMesh },
        { name: "Estrelas", color: p.starColor, mesh: slab(k(M.CrossSection.union(marks)), p.relief, p.thickness) },
      ];
      models.push({ name: "Mapa estelar", parts });
      if (p.mount === "magnet" && p.thickness - MAGNET_DEPTH < MIN_FACE_MM) warnings.push(`Com ímã, use espessura de ${MAGNET_DEPTH + MIN_FACE_MM} mm ou mais: a frente fina demais deixa o ímã marcar.`);
      if (p.mount === "magnet") warnings.push(`Encaixe um ímã de ${MAGNET_D - 0.2} mm por ${MAGNET_DEPTH} mm (disco de neodímio) na parte de trás, com cola.`);
    } else {
      // Estrelas vazadas: a frente (z = 0, na mesa) tem as estrelas como furos que atravessam; atrás fica o rebaixo para o LED
      // e, no fundo dele, o degrau da tampa. Linhas, aro e texto entram rentes na frente, em outra cor.
      thickness = lay.thickness;
      const holes = k(M.CrossSection.union(stars));
      const inlayCs = k(k(M.CrossSection.union(drawn)).subtract(holes));
      const inlay = Math.min(p.relief, lay.skin - 0.4);
      const eps = 0.01;
      const solid = k(outline.extrude(lay.thickness));
      const cavity = k(k(k(M.CrossSection.circle(lay.pocketR, 96)).translate([0, cy])).extrude(lay.thickness - lay.skin + eps));
      const recess = k(k(k(M.CrossSection.circle(lay.recessR, 96)).translate([0, cy])).extrude(lay.recessDepth + eps));
      const throughHoles = k(holes.extrude(lay.skin + 2 * eps));
      const inlayCut = k(inlayCs.extrude(inlay + eps));
      const body = k(solid.subtract(k(cavity.translate([0, 0, lay.skin]))));
      const withRecess = k(body.subtract(k(recess.translate([0, 0, lay.thickness - lay.recessDepth]))));
      const withHoles = k(withRecess.subtract(k(throughHoles.translate([0, 0, -eps]))));
      const plate = k(withHoles.subtract(k(inlayCut.translate([0, 0, -eps]))));
      const lidCs = k(k(M.CrossSection.circle(lay.lidR, 96)).subtract(k(k(M.CrossSection.circle(LED.cableD / 2, 32)).translate([0, -lay.lidR]))));
      const lid = k(lidCs.extrude(lay.lidT));
      models.push({ name: "Mapa estelar", parts: [{ name: "Placa", color: p.plateColor, mesh: solidMesh(plate) }, { name: "Estrelas", color: p.starColor, mesh: slab(inlayCs, inlay, 0) }] });
      models.push({ name: "Tampa do LED", parts: [{ name: "Tampa", color: p.plateColor, mesh: moveMesh(solidMesh(lid), W / 2 + LID_GAP_MM + lay.lidR, cy) }] });
      warnings.push(`Estrelas vazadas: imprima com a frente para baixo (como está). Cole uma fita ou um disco de LED de até ${p.ledDepth} mm no rebaixo de trás e feche com a tampa (ela tem a saída do cabo).`);
      if (W + LID_GAP_MM + 2 * lay.lidR > bedMm()) warnings.push(`A tampa não cabe ao lado da placa na mesa de ${bedMm()} mm: imprima a tampa em outra mesa ou use uma placa menor.`);
      if (p.mount === "magnet") warnings.push("Com as estrelas vazadas não há ímã atrás (o rebaixo ocupa o lugar): use o suporte de mesa ou nenhum apoio.");
    }
    if (p.mount === "stand") models.push(plateStand(M, W, thickness, p.plateColor, -H / 2 - 25));
    return { models, warnings };
  });
}
