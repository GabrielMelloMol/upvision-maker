import { getManifold, type ManifoldToplevel } from "../../geometry/manifold";
import { fromFaceFrame, toFaceFrame, type PlanarFace } from "../../geometry/ownModel";
import type { Model } from "../../geometry/types";
import { applyLayers, type LayersResult } from "./applyLayers";
import type { Layer } from "./layers";

export const OWN_MODEL_ERRORS = {
  notExtreme: "Essa face fica dentro de uma reentrância (há peça passando do plano dela). Escolha uma face na parte de fora, voltada para fora da peça.",
  open: "A peça tem a malha aberta ou com erros (não é um sólido fechado). Use Reparar no Bambu Studio, no OrcaSlicer ou no Netfabb e tente de novo.",
};

/**
 * Decais (#26, #113) numa face plana de um modelo próprio: a peça da face gira para a face ficar em cima, os decais
 * entram pelo motor de sempre (relevo, gravado, vazado ou embutido na cor) e tudo volta ao lugar e à posição originais.
 * O gizmo trabalha no plano da face (X para a direita, Y para cima, olhando de fora).
 */
export async function applyOwnDecals(model: Model, face: PlanarFace, layers: Layer[], M?: ManifoldToplevel): Promise<LayersResult> {
  if (!face.extreme) throw new Error(OWN_MODEL_ERRORS.notExtreme);
  const m = M ?? (await getManifold());
  const part = model.parts[face.part];
  const local: Model = { name: model.name, parts: [{ ...part, mesh: toFaceFrame(part.mesh, face) }] };
  let res: LayersResult;
  try {
    res = await applyLayers(m, [local], layers);
  } catch (e) {
    if (/manifold|valid/i.test(String(e))) throw new Error(OWN_MODEL_ERRORS.open, { cause: e });
    throw e;
  }
  if (!layers.length) return { ...res, models: [model] };
  const [done] = res.models;
  const parts = model.parts.flatMap((p, i) => (i === face.part ? done.parts.map((q) => ({ ...q, mesh: fromFaceFrame(q.mesh, face) })) : [p]));
  return { ...res, models: [{ ...model, parts }] };
}
