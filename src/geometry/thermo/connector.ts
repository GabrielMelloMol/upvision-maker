import type { ManifoldToplevel, Solid } from "../manifold";
import { capSolid, threadedRod, type CapSpec, type ThreadSpec } from "./thread";

type K = <D extends { delete(): void }>(o: D) => D;

/*
 * Conector com porca (#273), como nos termoformados do MakerWorld: as orelhas das duas cascas ficam uma sobre a outra, o
 * parafuso passa pelos furos e a porca cega enrosca por cima, apertando as duas. A argola da porca é o pendurador.
 * Os dois imprimem em pé, sem suporte; a rosca é a mesma da tampa rosqueada, menor (Ø 6).
 */

export const CONNECTOR_THREAD: ThreadSpec = { major: 3, depth: 0.8, pitch: 2, length: 7 };
const ENGAGE = 3 * CONNECTOR_THREAD.pitch; // quanto o parafuso entra na porca
const TIP_GAP = 0.4; // a ponta passa um pouco das orelhas antes de começar a contar a rosca da porca
const NUT = { wall: 2, floor: 1.6, loopHole: 4, loopRim: 2.2 } as const;

export type ConnectorSpec = { thread: ThreadSpec; headR: number; headH: number; /** espessura das duas orelhas juntas */ grip: number; nut: CapSpec };

/** Parafuso e porca para apertar orelhas de espessura total `grip`, com a folga de rosca validada no Kit de testes. */
export const connectorSpec = (clearance: number, grip: number): ConnectorSpec => ({
  thread: { ...CONNECTOR_THREAD, length: grip + TIP_GAP + ENGAGE },
  headR: 6,
  headH: 1.6,
  grip,
  nut: { thread: { ...CONNECTOR_THREAD, length: ENGAGE + 1 }, clearance, ...NUT },
});

/** Diâmetro do furo das orelhas: o parafuso mais a folga dos dois lados. */
export const connectorHole = (clearance: number) => 2 * (CONNECTOR_THREAD.major + clearance);

/** Parafuso de cabeça chata, em pé com a cabeça na mesa. Quem chama apaga o resultado. */
export function boltSolid(M: ManifoldToplevel, k: K, c: ConnectorSpec): Solid {
  const head = k(M.Manifold.cylinder(c.headH, c.headR, c.headR, 48));
  const rod = k(k(threadedRod(M, k, c.thread)).translate([0, 0, c.headH]));
  return M.Manifold.union([head, rod]);
}

/** Porca cega com a argola da fita: a tampa rosqueada na medida do conector, com a boca para cima. Quem chama apaga o resultado. */
export const nutSolid = (M: ManifoldToplevel, k: K, c: ConnectorSpec): Solid => capSolid(M, k, c.nut);
