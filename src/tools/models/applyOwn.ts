import { getManifold, type ManifoldToplevel } from "../../geometry/manifold";
import { faceAxes, fromFaceFrame, toFaceFrame, type PlanarFace, type Vec3 } from "../../geometry/ownModel";
import { applyMapped, applySurfaceDecals, surfaceFace } from "../../geometry/surfaceDecal";
import { fitWrap, wrapFace, wrapMap, type WrapFit } from "../../geometry/wrapDecal";
import type { Model } from "../../geometry/types";
import { applyLayers, applyPrepared, type DecalEngine, type LayersResult, type PreparedLayer } from "./applyLayers";
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
export async function applyOwnDecals(model: Model, face: PlanarFace, layers: Layer[], M?: ManifoldToplevel, prepared?: PreparedLayer[]): Promise<LayersResult> {
  if (!face.extreme) throw new Error(OWN_MODEL_ERRORS.notExtreme);
  const m = M ?? (await getManifold());
  const part = model.parts[face.part];
  const local: Model = { name: model.name, parts: [{ ...part, mesh: toFaceFrame(part.mesh, face) }] };
  let res: LayersResult;
  try {
    res = prepared ? applyPrepared(m, [local], layers, prepared) : await applyLayers(m, [local], layers);
  } catch (e) {
    if (/manifold|valid/i.test(String(e))) throw new Error(OWN_MODEL_ERRORS.open, { cause: e });
    throw e;
  }
  if (!layers.length) return { ...res, models: [model] };
  const [done] = res.models;
  const parts = model.parts.flatMap((p, i) => (i === face.part ? done.parts.map((q) => ({ ...q, mesh: fromFaceFrame(q.mesh, face) })) : [p]));
  return { ...res, models: [{ ...model, parts }] };
}

/** Ponto escolhido numa superfície qualquer (curva ou não): onde o clique acertou e para onde a superfície aponta ali. */
/** `wrap`: o eixo da peça (do arquivo) em torno do qual o desenho dá a volta; sem ele a projeção é reta. */
export type WrapAxis = "x" | "y" | "z";
export type SurfaceSpot = { part: number; point: Vec3; normal: Vec3; wrap?: WrapAxis };

const WORLD_AXIS: Record<WrapAxis, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const wrapEngine = (fit: WrapFit): DecalEngine => ({
  face: (_M, models) => wrapFace(fit, models[0].parts[0].name),
  apply: (M, models, decals) => applyMapped(M, models, decals, () => wrapMap(M, fit)),
});

const CURVED: DecalEngine = { face: surfaceFace, apply: applySurfaceDecals };

/**
 * Decais (#212) numa superfície curva de um modelo próprio: a peça gira para o ponto ficar na origem olhando para cima,
 * o desenho é projetado na superfície e o relevo/entalhe acompanha a curva; depois tudo volta ao lugar original.
 */
export async function applyOwnCurved(model: Model, spot: SurfaceSpot, layers: Layer[], M?: ManifoldToplevel, prepared?: PreparedLayer[]): Promise<LayersResult> {
  const m = M ?? (await getManifold());
  const frame = { normal: spot.normal, centroid: spot.point };
  const part = model.parts[spot.part];
  const local: Model = { name: model.name, parts: [{ ...part, mesh: toFaceFrame(part.mesh, frame) }] };
  let engine = CURVED;
  const notes: string[] = [];
  if (spot.wrap) {
    // o eixo do arquivo no quadro do ponto escolhido (X para a direita, Y para cima, Z para fora)
    const { u, v, n } = faceAxes(spot.normal);
    const A = WORLD_AXIS[spot.wrap];
    const dotv = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const r = fitWrap(local.parts[0].mesh, [dotv(u, A), dotv(v, A), dotv(n, A)]);
    if ("fit" in r) engine = wrapEngine(r.fit);
    else notes.push(`Enrolar: ${r.fail} Usei a projeção reta.`);
  }
  let res: LayersResult;
  try {
    res = prepared ? applyPrepared(m, [local], layers, prepared, engine) : await applyLayers(m, [local], layers, engine);
  } catch (e) {
    if (/manifold|valid/i.test(String(e))) throw new Error(OWN_MODEL_ERRORS.open, { cause: e });
    throw e;
  }
  if (!layers.length) return { ...res, models: [model] };
  const [done] = res.models;
  const parts = model.parts.flatMap((p, i) => (i === spot.part ? done.parts.map((q) => ({ ...q, mesh: fromFaceFrame(q.mesh, frame) })) : [p]));
  return { ...res, warnings: [...notes, ...res.warnings], models: [{ ...model, parts }] };
}

/** A parte mais perto do ponto clicado (para modelos 3MF com várias peças). */
export function partAtPoint(model: Model, point: Vec3): number {
  let best = { i: 0, d: Infinity };
  model.parts.forEach((p, i) => {
    const d = nearestVertexDistance(p.mesh, point);
    if (d < best.d) best = { i, d };
  });
  return best.i;
}

function nearestVertexDistance(mesh: Model["parts"][number]["mesh"], p: Vec3): number {
  let d = Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) d = Math.min(d, (mesh.positions[i] - p[0]) ** 2 + (mesh.positions[i + 1] - p[1]) ** 2 + (mesh.positions[i + 2] - p[2]) ** 2);
  return d;
}
