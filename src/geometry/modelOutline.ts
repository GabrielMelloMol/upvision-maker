import { getManifold } from "./manifold";
import { readOwnFile } from "./ownModel";

type Pt = [number, number];

/**
 * Peça 3D (.3mf/.stl) vista de cima (#320): o contorno da sombra de todas as partes, Y para cima como na mesa.
 * Coordenadas arredondadas a 0,01 mm (fica leve no rascunho guardado).
 */
export async function modelOutline(bytes: Uint8Array, fileName: string): Promise<{ pts: Pt[]; closed: boolean }[]> {
  const model = readOwnFile(bytes, fileName);
  const M = await getManifold();
  const trash: { delete(): void }[] = [];
  const k = <T extends { delete(): void }>(x: T) => (trash.push(x), x);
  try {
    const solids = model.parts.map((p) => k(M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: p.mesh.positions, triVerts: p.mesh.indices }))));
    const shadow = k(k(M.Manifold.union(solids)).project());
    const r = (n: number) => Math.round(n * 100) / 100;
    const lines = shadow.toPolygons().map((poly) => ({ pts: poly.map(([x, y]): Pt => [r(x), r(y)]), closed: true }));
    if (!lines.length) throw new Error("A peça não tem nada visto de cima.");
    return lines;
  } catch (e) {
    // malha aberta ou com furos: o Manifold recusa
    if (e instanceof Error && e.message.startsWith("A peça")) throw e;
    throw new Error("Não deu para ler o contorno desta peça (a malha tem furos). Abra no Bambu Studio, conserte e exporte de novo.", { cause: e });
  } finally {
    trash.forEach((t) => t.delete());
  }
}
