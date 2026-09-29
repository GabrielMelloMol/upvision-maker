import type { CS } from "../manifold";
import { toMesh } from "../mesh";
import { fitInto, scoped } from "../shape2d";
import { artParts, slab, type ModelCtx, type ModelOutput } from "./common";

export type MirrorKeychainParams = {
  mirror: number; // diâmetro do espelho
  mirrorThickness: number;
  fit: number; // folga do espelho
  top: string;
  bottom: string;
  textSize: number;
  rim: number; // largura do aro onde vai o texto
  relief: number;
  bodyColor: string;
  textColor: string;
  artColor: string;
};

export const DEFAULT_MIRROR: MirrorKeychainParams = {
  mirror: 40,
  mirrorThickness: 2,
  fit: 0.3,
  top: "LINDA",
  bottom: "POR DENTRO E POR FORA",
  textSize: 3.6,
  rim: 6,
  relief: 0.6,
  bodyColor: "#f472b6",
  textColor: "#f8f8f6",
  artColor: "#7e3fd6",
};

const FLOOR = 1.6;
const LIP = 0.4; // o aro passa do espelho: segura e protege a borda
const TAB_R = 4.5;
const HOLE_R = 2.2;
const BACK_DEPTH = 0.6;
const ART_FRAC = 0.7;

/**
 * Chaveiro que segura um espelho redondo (colado no bolsão), com frases em arco no aro (em cima e embaixo) e,
 * no verso, o desenho embutido rente em outra cor. Sem texto em arco disponível, as frases saem retas no aro.
 */
export function buildMirrorKeychain(ctx: ModelCtx, p: MirrorKeychainParams): ModelOutput {
  const { M, text } = ctx;
  const R = (p.mirror + 2 * p.fit) / 2;
  const Rout = R + p.rim;
  const H = FLOOR + p.mirrorThickness + LIP;
  const warnings: string[] = [];
  return scoped((k) => {
    const disc = k(M.CrossSection.circle(Rout, 128));
    const c: [number, number] = [0, Rout + TAB_R - 2];
    const outline = k(k(disc.add(k(k(M.CrossSection.circle(TAB_R, 48)).translate(c)))).subtract(k(k(M.CrossSection.circle(HOLE_R, 32)).translate(c))));
    let body = k(k(outline.extrude(H)).subtract(k(k(k(M.CrossSection.circle(R, 128)).extrude(H)).translate([0, 0, FLOOR]))));
    const ring = k(disc.subtract(k(M.CrossSection.circle(R + 0.8, 128))));
    const mid = R + p.rim / 2;
    const phrases: CS[] = [];
    for (const [s, side] of [[p.top, "top"], [p.bottom, "bottom"]] as const) {
      if (!s.trim()) continue;
      const cs = ctx.arc
        ? ctx.arc(s, p.textSize, side === "top" ? mid - p.textSize / 2 : mid + p.textSize / 2, side)
        : (() => {
            const raw = text(s, p.textSize);
            return raw && fitInto(k(raw), R * 1.2, p.textSize, (side === "top" ? 1 : -1) * mid);
          })();
      if (cs) phrases.push(k(k(cs).intersect(ring)));
    }
    if (!ctx.arc && phrases.length) warnings.push("Texto em arco indisponível nesta versão: as frases saem retas.");
    const parts = [{ name: "Chaveiro", color: p.bodyColor, mesh: toMesh(body) }];
    if (phrases.length) parts.push({ name: "Frases", color: p.textColor, mesh: slab(k(M.CrossSection.union(phrases)), p.relief, H) });
    if (ctx.art && !ctx.art.isEmpty()) {
      // verso: desenho espelhado, embutido rente à face de baixo
      const placed = k(k(fitInto(ctx.art, R * 2 * ART_FRAC, R * 2 * ART_FRAC, 0)).scale([-1, 1]));
      body = k(body.subtract(k(placed.extrude(BACK_DEPTH))));
      parts[0] = { ...parts[0], mesh: toMesh(body) };
      parts.push(...artParts({ ...ctx, artLayers: null }, placed, p.artColor, "Verso", BACK_DEPTH, 0));
    }
    warnings.push(`Espelho de ${p.mirror} mm × ${String(p.mirrorThickness).replace(".", ",")} mm: cole no bolsão com cola para espelho.`);
    return { models: [{ name: "Chaveiro espelho", parts }], warnings };
  });
}
