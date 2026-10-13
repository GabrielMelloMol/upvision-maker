import type { ManifoldToplevel, Solid } from "./manifold";
import { repairMesh } from "./meshRepair";
import type { Mesh } from "./types";

/** Malha → sólido do Manifold; se a malha estiver aberta tenta consertar (furos pequenos, vértices soltos) antes de desistir. */
export function solidFromMesh(M: ManifoldToplevel, m: Mesh): { solid: Solid; holes: number } {
  // malha aberta: o Manifold lança "Not manifold" (ou devolve um sólido com erro)
  const build = (x: Mesh): Solid | null => {
    try {
      const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: x.positions, triVerts: x.indices }));
      if (s.status() === "NoError" && !s.isEmpty()) return s;
      s.delete();
    } catch {
      /* cai no reparo */
    }
    return null;
  };
  const first = build(m);
  if (first) return { solid: first, holes: 0 };
  const fixed = repairMesh(m);
  const second = build(fixed.mesh);
  if (second) return { solid: second, holes: fixed.holes };
  throw new Error("A malha tem buracos ou arestas soltas demais e não deu para reparar sozinha. Conserte o arquivo (o reparo do fatiador ou do Meshmixer resolve) e envie de novo.");
}
