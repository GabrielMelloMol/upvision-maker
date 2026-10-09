import type { CS } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { MissingInput, plateStand, roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { CITIES, skyStars } from "./starSky";

export type StarMapMount = "none" | "stand" | "magnet";

export type StarMapParams = {
  city: string; // id de CITIES ou "custom" (usa latitude e longitude)
  lat: number;
  lon: number;
  utcOffset: number; // fuso da hora informada, em horas (Brasília = -3)
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  title: string;
  caption: string; // vazio = "dd.mm.aaaa · cidade"
  maxMag: number; // as estrelas mais fracas que isto ficam de fora
  starScale: number;
  width: number;
  thickness: number;
  relief: number;
  mount: StarMapMount;
  plateColor: string;
  starColor: string;
};

export const DEFAULT_STAR_MAP: StarMapParams = {
  city: "saopaulo", lat: -23.55, lon: -46.63, utcOffset: -3, year: 2024, month: 12, day: 24, hour: 22, minute: 0,
  title: "Nossa noite", caption: "", maxMag: 4.5, starScale: 1, width: 120, thickness: 3, relief: 0.8, mount: "stand",
  plateColor: "#16213e", starColor: "#f5efe0",
};

const MARGIN = 6; // da borda da placa ao círculo do céu
const RING_MM = 1; // largura do aro do horizonte
const TEXT_BLOCK = 0.3; // altura da faixa de texto, em frações da largura
const MIN_STAR_MM = 1; // a menor estrela que imprime bem com bico de 0,4
const STAR_STEP_MM = 0.55; // quanto cada magnitude a mais de brilho engorda a estrela
const EDGE_FRACTION = 0.97; // as estrelas ficam um pouco para dentro do aro
const MAGNET_D = 10.2;
const MAGNET_DEPTH = 2;
const MIN_FACE_MM = 1.2;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const pad = (n: number) => String(Math.round(n)).padStart(2, "0");

/** Diâmetro da estrela (mm) pela magnitude: as brilhantes são maiores. */
export const starDiameter = (mag: number, maxMag: number, scale: number): number => Math.max(MIN_STAR_MM, (MIN_STAR_MM + (maxMag - mag) * STAR_STEP_MM) * scale);

/** Mapa estelar de uma data (#106): o céu de um lugar e momento, em relevo numa placa, com título e legenda. */
export function buildStarMap(ctx: ModelCtx, p: StarMapParams): ModelOutput {
  const { M, text } = ctx;
  const year = Math.round(p.year), month = Math.round(p.month), day = Math.round(p.day);
  if (day < 1 || day > DAYS_IN_MONTH[month - 1] + (month === 2 && isLeap(year) ? 1 : 0)) throw new MissingInput("Esse dia não existe nesse mês: confira a data.");
  const city = CITIES.find((c) => c[0] === p.city);
  const place = city ? { lat: city[2], lon: city[3] } : { lat: p.lat, lon: p.lon };
  const sky = skyStars(place, { year, month, day, hour: p.hour, minute: p.minute, utcOffset: p.utcOffset }, p.maxMag);

  return scoped((k) => {
    const W = p.width, textH = W * TEXT_BLOCK, H = W + textH;
    const R = W / 2 - MARGIN;
    const cy = H / 2 - W / 2; // centro do céu: no quadrado de cima da placa
    const stars: CS[] = sky.map((s) => k(k(M.CrossSection.circle(starDiameter(s.mag, p.maxMag, p.starScale) / 2, 20)).translate([s.x * R * EDGE_FRACTION, cy + s.y * R * EDGE_FRACTION])));
    const ring = k(k(M.CrossSection.circle(R + RING_MM, 96)).subtract(k(M.CrossSection.circle(R, 96)))).translate([0, cy]);
    k(ring);
    const marks: CS[] = [...stars, ring];

    const line = (s: string, h: number, y: number): CS | null => {
      const raw = s.trim() ? text(s, 100) : null;
      return raw ? k(fitInto(k(raw), W - 2 * MARGIN, h, y)) : null;
    };
    const label = p.caption.trim() || `${pad(day)}.${pad(month)}.${year}${city ? ` · ${city[1]}` : ""}`;
    const bottom = -H / 2;
    for (const t of [line(p.title, textH * 0.36, bottom + textH * 0.68), line(label, textH * 0.17, bottom + textH * 0.2)]) if (t) marks.push(t);

    const outline = k(roundedRect(M, W, H, W * 0.05));
    let plateMesh;
    if (p.mount === "magnet") {
      const pocket = k(k(M.Manifold.cylinder(MAGNET_DEPTH + 0.01, MAGNET_D / 2, MAGNET_D / 2, 48, false)).translate([0, 0, -0.01]));
      plateMesh = solidMesh(k(k(outline.extrude(p.thickness)).subtract(pocket)));
    } else plateMesh = slab(outline, p.thickness);
    const parts: Part[] = [
      { name: "Placa", color: p.plateColor, mesh: plateMesh },
      { name: "Estrelas", color: p.starColor, mesh: slab(k(M.CrossSection.union(marks)), p.relief, p.thickness) },
    ];
    const models: Model[] = [{ name: "Mapa estelar", parts }];
    if (p.mount === "stand") models.push(plateStand(M, W, p.thickness, p.plateColor, -H / 2 - 25));

    const warnings = [`${sky.length} estrelas visíveis (até a magnitude ${p.maxMag}) no céu de ${city?.[1] ?? "lat. " + place.lat + ", long. " + place.lon}. O horário de verão conta no fuso: com ele, use um fuso a mais.`];
    if (p.mount === "magnet" && p.thickness - MAGNET_DEPTH < MIN_FACE_MM) warnings.push(`Com ímã, use espessura de ${MAGNET_DEPTH + MIN_FACE_MM} mm ou mais: a frente fina demais deixa o ímã marcar.`);
    if (p.mount === "magnet") warnings.push(`Encaixe um ímã de ${MAGNET_D - 0.2} mm por ${MAGNET_DEPTH} mm (disco de neodímio) na parte de trás, com cola.`);
    return { models, warnings };
  });
}
