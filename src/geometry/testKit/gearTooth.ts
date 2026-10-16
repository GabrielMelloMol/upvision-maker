// Cópia do perfil de involuta de src/geometry/models/gears.ts (branch feat/mecanicas, ainda sem merge): o kit fica independente até as duas
// branches entrarem; depois do merge, trocar por um import e apagar este arquivo.
import type { CS, ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";

const STEP = 7; // pontos por flanco da involuta

type K = <D extends { delete(): void }>(o: D) => D;

/** Função involuta: inv(α) = tan α − α. */
export const inv = (a: number) => Math.tan(a) - a;

export type GearSpec = {
  teeth: number;
  /** Módulo (mm): o passo é π·módulo. */
  module: number;
  /** Ângulo de pressão, graus (20° é o padrão). */
  pressure: number;
  /** Espessura do dente no círculo primitivo (mm). */
  tooth: number;
  /** Altura do dente acima do círculo primitivo e fundo abaixo dele (mm). */
  addendum: number;
  dedendum: number;
};

/** Dimensões derivadas de uma engrenagem (raios, mm). */
export function gearRadii(g: GearSpec) {
  const rp = (g.module * g.teeth) / 2;
  const alpha = (g.pressure * Math.PI) / 180;
  return { rp, rb: rp * Math.cos(alpha), ra: rp + g.addendum, rf: rp - g.dedendum, alpha };
}

/**
 * Perfil de uma engrenagem de dentes de involuta (centro na origem), como região 2D. Os flancos saem do círculo de base (ou do pé
 * do dente, o que for maior) até a ponta; o pé é um disco. Serve para engrenagem externa e, com `tooth` e alturas trocados,
 * para a cavidade de uma engrenagem interna. Quem chama dá delete().
 */
export function gearOutline(M: ManifoldToplevel, g: GearSpec): CS {
  return scoped((k: K) => {
    const { rp, rb, ra, rf, alpha } = gearRadii(g);
    const r0 = Math.max(rb, rf);
    const halfAt = (r: number) => g.tooth / (2 * rp) + inv(alpha) - inv(Math.acos(Math.min(1, rb / r)));
    const rs = Array.from({ length: STEP + 1 }, (_, i) => r0 + ((ra - r0) * i) / STEP);
    const pitch = (2 * Math.PI) / g.teeth;
    const teeth: CS[] = [];
    for (let i = 0; i < g.teeth; i++) {
      const c = i * pitch;
      const left = rs.map((r) => [r * Math.cos(c - halfAt(r)), r * Math.sin(c - halfAt(r))] as [number, number]);
      const right = [...rs].reverse().map((r) => [r * Math.cos(c + halfAt(r)), r * Math.sin(c + halfAt(r))] as [number, number]);
      const root = (a: number) => [(rf - 0.3) * Math.cos(a), (rf - 0.3) * Math.sin(a)] as [number, number]; // entra no disco do pé
      const a0 = c - halfAt(r0), a1 = c + halfAt(r0);
      teeth.push(k(new M.CrossSection([[root(a0), ...left, ...right, root(a1)]], "NonZero")));
    }
    const base = k(M.CrossSection.circle(rf, 8 * g.teeth));
    return M.CrossSection.union([base, ...teeth]);
  });
}

/** Engrenagem externa padrão: dente de 2,25·módulo de altura (addendum = módulo, dedendum = 1,25·módulo), com folga `backlash` tirada do dente. */
export const spurSpec = (teeth: number, module: number, pressure: number, backlash: number): GearSpec => ({ teeth, module, pressure, tooth: (Math.PI * module) / 2 - backlash / 2, addendum: module, dedendum: 1.25 * module });
