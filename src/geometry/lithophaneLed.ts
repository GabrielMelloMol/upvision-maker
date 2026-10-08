import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { scoped } from "./shape2d";
import type { Mesh } from "./types";

/*
 * Base de LED da litofania (#101): encaixe para a peça (ou sulco para a parede do cilindro), cavidade para disco ou
 * fita de LED, saída de cabo ou compartimento de 2 pilhas AAA, e uma tampa de baixo que fecha tudo. Medidas em mm.
 */
export const LED = {
  wall: 4, // parede em volta da cavidade
  rebate: 2.4, // rebaixo embaixo, onde entra a tampa
  plateT: 2.2, // espessura da tampa (fica um pouco para dentro do rebaixo)
  plateClear: 0.25, // folga da tampa em cada lado
  ledH: 8, // altura livre para o disco ou a fita
  slotDepth: 10, // profundidade do encaixe da peça
  fit: 0.2, // folga do encaixe em cada lado
  cavityClear: 0.3, // folga em volta do disco
  cableD: 5,
  aaaL: 47, // bolsão de 2 pilhas AAA lado a lado
  aaaW: 23,
  pocketH: 11,
  grooveDepth: 8, // sulco da base redonda
  lidT: 2.4,
  lidCollarH: 5,
  lidCollarWall: 1.6,
  lidClear: 0.3,
  ring: 6, // quanto a base redonda passa do cilindro de cada lado
  boreWall: 2.5, // parede mínima entre o furo central e o sulco
  baseHeight: 2.4 + 8 + 10, // rebaixo + cavidade + encaixe
} as const;

export type LedKind = "disc" | "strip";
export type LedPower = "cable" | "battery";
type Common = { led: LedKind; ledSize: number; power: LedPower };
export type LedBaseParams = Common & ({ layout: "panel"; slotW: number; slotT: number } | { layout: "round"; diameter: number; wallT: number });

type K = <D extends { delete(): void }>(o: D) => D;
const rect = (M: ManifoldToplevel, x0: number, y0: number, x1: number, y1: number): CS => M.CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0]);
const prism = (k: K, cs: CS, z0: number, z1: number): Solid => k(k(cs.extrude(z1 - z0)).translate([0, 0, z0]));
/** Cilindro deitado ao longo de +Y, de y = 0 a `len`, com o eixo na altura `z`. */
const alongY = (M: ManifoldToplevel, k: K, r: number, len: number, z: number): Solid => k(k(k(M.Manifold.cylinder(len, r, r, 32)).rotate([-90, 0, 0])).translate([0, 0, z]));

/** Base de LED e a tampa de baixo. `warnings`: o que a pessoa precisa saber (ex.: o disco não cabe). */
export function buildLedBase(M: ManifoldToplevel, p: LedBaseParams): { base: Mesh; plate: Mesh; warnings: string[] } {
  const H = LED.baseHeight;
  const battery = p.power === "battery";
  const warnings: string[] = [];
  return scoped((k) => {
    let footprint: CS;
    const cuts: Solid[] = [];
    let wire: Solid | null = null;
    if (p.layout === "panel") {
      const slotX = p.slotW + 2 * LED.fit, slotY = p.slotT + 2 * LED.fit;
      const disc = p.led === "disc";
      const cavX = disc ? p.ledSize + 2 * LED.cavityClear : Math.max(slotX, 30), cavY = p.ledSize + 2 * LED.cavityClear;
      let bx = Math.max(slotX, cavX) + 2 * LED.wall;
      const halfY = Math.max(slotY, cavY) / 2 + LED.wall;
      let yMax = halfY;
      const pocketY0 = cavY / 2 + 3;
      if (battery) {
        bx = Math.max(bx, LED.aaaL + 2 * LED.wall);
        yMax = Math.max(yMax, pocketY0 + LED.aaaW + LED.wall);
        cuts.push(prism(k, rect(M, -LED.aaaL / 2, pocketY0, LED.aaaL / 2, pocketY0 + LED.aaaW), -1, LED.rebate + LED.pocketH));
        wire = prism(k, rect(M, -2, 0, 2, pocketY0 + 1), LED.rebate + 1, LED.rebate + 5);
      } else cuts.push(alongY(M, k, LED.cableD / 2, yMax + 1, LED.rebate + 3));
      footprint = k(rect(M, -bx / 2, -halfY, bx / 2, yMax));
      const cavity = disc ? prism(k, k(M.CrossSection.circle(cavX / 2, 64)), -1, LED.rebate + LED.ledH) : prism(k, rect(M, -cavX / 2, -cavY / 2, cavX / 2, cavY / 2), -1, LED.rebate + LED.ledH);
      cuts.push(cavity, prism(k, rect(M, -slotX / 2, -slotY / 2, slotX / 2, slotY / 2), H - LED.slotDepth, H + 1));
    } else {
      const R = p.diameter / 2;
      const Ro = R + LED.ring, Rin = R - p.wallT - LED.fit, Rgo = R + LED.fit;
      const maxBore = Rin - LED.boreWall;
      const wantBore = p.led === "disc" ? p.ledSize / 2 + LED.cavityClear : maxBore;
      if (wantBore > maxBore) warnings.push(`O disco de LED de ${p.ledSize} mm não cabe dentro do cilindro de ${p.diameter} mm: o furo da base ficou em ${(2 * maxBore).toFixed(0)} mm. Use um disco menor ou aumente o diâmetro.`);
      const bore = Math.min(wantBore, maxBore);
      let fp = k(M.CrossSection.circle(Ro, 128));
      if (battery) {
        const y0 = Ro + 2;
        fp = k(fp.add(k(rect(M, -(LED.aaaL / 2 + LED.wall), Ro - 8, LED.aaaL / 2 + LED.wall, y0 + LED.aaaW + LED.wall))));
        cuts.push(prism(k, rect(M, -LED.aaaL / 2, y0, LED.aaaL / 2, y0 + LED.aaaW), -1, LED.rebate + LED.pocketH));
        wire = prism(k, rect(M, -2, 0, 2, y0 + 1), LED.rebate + 1, LED.rebate + 5);
      } else cuts.push(alongY(M, k, LED.cableD / 2, Ro + 1, LED.rebate + 3));
      footprint = fp;
      cuts.push(prism(k, k(M.CrossSection.circle(bore, 96)), -1, H + 1)); // furo central, aberto até o topo
      cuts.push(prism(k, k(k(M.CrossSection.circle(Rgo, 128)).subtract(k(M.CrossSection.circle(Rin, 128)))), H - LED.grooveDepth, H + 1));
    }
    const rebate = k(footprint.offset(-3, "Round"));
    cuts.push(prism(k, rebate, -1, LED.rebate));
    if (wire) cuts.push(wire);
    const base = k(prism(k, footprint, 0, H).subtract(k(M.Manifold.union(cuts))));
    const plate = prism(k, k(rebate.offset(-LED.plateClear, "Round")), 0, LED.plateT);
    return { base: toMesh(base), plate: toMesh(plate), warnings };
  });
}

/** Tampa do abajur: disco do diâmetro do cilindro com um colar que entra por dentro dele, com folga. */
export function buildLid(M: ManifoldToplevel, p: { diameter: number; wallT: number }): Mesh {
  return scoped((k) => {
    const R = p.diameter / 2;
    const outer = R - p.wallT - LED.lidClear;
    const disc = prism(k, k(M.CrossSection.circle(R, 128)), 0, LED.lidT);
    const collar = prism(k, k(k(M.CrossSection.circle(outer, 128)).subtract(k(M.CrossSection.circle(outer - LED.lidCollarWall, 128)))), LED.lidT - 0.01, LED.lidT + LED.lidCollarH);
    return toMesh(k(disc.add(collar)));
  });
}
