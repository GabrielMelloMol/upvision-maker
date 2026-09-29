import { fitInto, scoped } from "../shape2d";
import type { CS, ManifoldToplevel } from "../manifold";
import { roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { heart } from "./shapes";
import { DEFAULT_RESIN, RESIN_TIP, resinRim, type ResinParams } from "./resin";

export type NfcKeychainParams = {
  shape: "circle" | "square" | "heart" | "hexagon" | "star" | "dodecagon";
  size: number;
  tagDiameter: number;
  tagThickness: number;
  layerHeight: number;
  relief: number;
  text: string;
  baseColor: string;
  textColor: string;
} & ResinParams;

export const DEFAULT_NFC: NfcKeychainParams = {
  shape: "circle",
  size: 38,
  tagDiameter: 25,
  tagThickness: 0.8,
  layerHeight: 0.2,
  relief: 0.8,
  text: "Ana",
  baseColor: "#ffffff",
  textColor: "#2563eb",
  ...DEFAULT_RESIN,
};

const TAG_CLEARANCE = 1.5; // folga no diâmetro
const FLOOR_MM = 0.8;
const COVER_MM = 1.2;
const DEPTH_EXTRA = 0.2;
const TAB_R = 4.5;
const TAB_HOLE_R = 2.2;
export const NFC_MIN_WALL = 2;

const STAR_INNER = 0.72; // estrela gorda: o miolo precisa caber a tag

/** Contorno do chaveiro com largura ~`size`, centrado (#69: coração, hexágono, estrela e 12 lados). */
function nfcOutline(M: ManifoldToplevel, shape: NfcKeychainParams["shape"], size: number): CS {
  if (shape === "square") return roundedRect(M, size, size, 5);
  if (shape === "hexagon") {
    const c = M.CrossSection.circle(size / 2, 6);
    const out = c.rotate(30);
    c.delete();
    return out;
  }
  if (shape === "dodecagon") return M.CrossSection.circle(size / 2, 12);
  if (shape === "heart") return heart(M, size);
  if (shape === "star")
    return new M.CrossSection(
      [Array.from({ length: 10 }, (_, i) => {
        const r = (i % 2 ? STAR_INNER : 1) * (size / 2);
        const a = Math.PI / 2 + (i * Math.PI) / 5;
        return [r * Math.cos(a), r * Math.sin(a)] as [number, number];
      })],
      "NonZero",
    );
  return M.CrossSection.circle(size / 2, 96);
}

/** Arredonda para cima até um múltiplo da altura de camada (com tolerância numérica). */
const toLayers = (mm: number, lh: number) => Math.ceil(mm / lh - 1e-6) * lh;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Onde fica o bolsão da tag e em que altura pausar (antes da 1ª camada acima dele). */
export function nfcLayout(p: Pick<NfcKeychainParams, "tagThickness" | "layerHeight">) {
  const lh = p.layerHeight;
  const bottom = round3(toLayers(FLOOR_MM, lh));
  const top = round3(bottom + toLayers(p.tagThickness + DEPTH_EXTRA, lh));
  const height = round3(top + toLayers(COVER_MM, lh));
  return { bottom, top, height, pauseZ: round3(top + lh) };
}

/**
 * Chaveiro com tag NFC embutida: bolsão fechado no meio da peça e pausa no 3MF logo depois da última
 * camada do bolsão — a impressora para, você encaixa a tag e ela é coberta pelas camadas seguintes.
 */
export function buildNfcKeychain({ M, text }: ModelCtx, p: NfcKeychainParams): ModelOutput {
  const hole = p.tagDiameter + TAG_CLEARANCE;
  if (p.size < hole + 2 * NFC_MIN_WALL) throw new Error(`Para uma tag de ${p.tagDiameter} mm o chaveiro precisa ter pelo menos ${Math.ceil(hole + 2 * NFC_MIN_WALL)} mm.`);
  const L = nfcLayout(p);
  return scoped((k) => {
    const outline = k(nfcOutline(M, p.shape, p.size));
    // a tag (com folga) precisa caber no formato com parede mínima (coração e estrela têm miolo menor)
    // centro do bolso: meio da região onde o círculo inteiro cabe (no coração fica acima do meio)
    const fits = k(outline.offset(-(NFC_MIN_WALL + hole / 2), "Round"));
    if (fits.isEmpty()) throw new Error(`Neste formato a tag de ${p.tagDiameter} mm não cabe: aumente o tamanho do chaveiro.`);
    // qualquer ponto de `fits` serve; o do meio do maior pedaço (no coração há um por curva), e se o meio cair
    // fora dele (pedaço côncavo), um vértice do próprio pedaço
    const blob = fits.decompose().map(k).reduce((a, b) => (b.area() > a.area() ? b : a));
    const fb = blob.bounds();
    let pc: [number, number] = [(fb.min[0] + fb.max[0]) / 2, (fb.min[1] + fb.max[1]) / 2];
    if (!k(k(k(M.CrossSection.circle(0.05, 8)).translate(pc)).subtract(blob)).isEmpty()) pc = blob.toPolygons()[0][0] as [number, number];
    // topo no eixo (o coração tem um vão entre as curvas: a argola precisa encostar nele)
    const ty = k(outline.intersect(k(M.CrossSection.square([0.6, 1e4], true)))).bounds().max[1] + TAB_R - 1.5;
    const tab = k(k(M.CrossSection.circle(TAB_R, 48)).translate([0, ty]));
    const body2d = k(k(outline.add(tab)).subtract(k(k(M.CrossSection.circle(TAB_HOLE_R, 32)).translate([0, ty]))));
    const pocket = k(k(k(M.CrossSection.circle(hole / 2, 96)).extrude(L.top - L.bottom)).translate([pc[0], pc[1], L.bottom]));
    const body = k(k(body2d.extrude(L.height)).subtract(pocket));
    const parts = [{ name: "Base", color: p.baseColor, mesh: solidMesh(body) }];
    const raw = text(p.text, 100);
    if (raw) parts.push({ name: "Texto", color: p.textColor, mesh: slab(k(fitInto(k(raw), p.size * 0.72, p.size * 0.35, 0)), p.relief, L.height) });
    // cavidade para resina sobre a tag e o texto (#53)
    const rim = resinRim(outline, L.height, raw ? p.relief : 0, p, p.baseColor);
    if (rim) parts.push(rim);
    const z = L.pauseZ.toFixed(2).replace(".", ",");
    return {
      models: [{ name: "Chaveiro NFC", parts }],
      pauses: [L.pauseZ],
      warnings: [
        `Pausa em Z = ${z} mm: a impressora para, você coloca a tag no bolsão e retoma.`,
        `OrcaSlicer e PrusaSlicer já abrem com a pausa. Para o Bambu Studio, use “Projeto do Bambu Studio (pausa pronta)”.`,
        ...(p.resin ? [RESIN_TIP] : []),
      ],
    };
  });
}
