import { getManifold } from "../../geometry/manifold";
import { toMesh } from "../../geometry/mesh";
import type { Mesh, Model } from "../../geometry/types";

/*
 * Quinas arredondadas da foto realista (#251): peça impressa não tem aresta de CAD. Soma de Minkowski de cada parte com
 * uma esfera pequena (r ≈ 0,3–0,5 mm): arredonda as quinas convexas e engorda a peça em r. O fundo volta para z = 0.
 */
export const BEVEL_MM = 0.4;
const BALL_SEGMENTS = 4;
const MAX_TRIS = 20000; // acima disso (QR, malha da termoformada) a soma de Minkowski leva minutos: a parte fica como está

export async function bevelModels(models: Model[], r = BEVEL_MM): Promise<Model[]> {
  const M = await getManifold();
  const ball = M.Manifold.sphere(r, BALL_SEGMENTS);
  const out = models.map((m) => ({
    ...m,
    parts: m.parts.map((part) => {
      if (part.mesh.indices.length / 3 > MAX_TRIS) return part;
      const solid = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices }));
      const grown = solid.minkowskiSum(ball);
      const mesh = toMesh(grown);
      for (let i = 2; i < mesh.positions.length; i += 3) mesh.positions[i] += r;
      const rounded: Mesh = mesh;
      solid.delete();
      grown.delete();
      return { ...part, mesh: rounded };
    }),
  }));
  ball.delete();
  return out;
}
