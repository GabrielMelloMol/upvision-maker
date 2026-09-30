import { bedMm } from "./bed";
import { layoutOnPlate } from "./keychain";
import { printPlan } from "./printPlan";
import type { Mesh, Model } from "./types";

/**
 * Precisa de AMS? (#118) Pelas cores do modelo gerado:
 * - "uma-cor": sai com um filamento só;
 * - "troca-manual": as cores estão empilhadas por altura, então dá para imprimir sem AMS trocando o filamento nas pausas;
 * - "ams": cores lado a lado na mesma altura; sem AMS, só pela "Uma mesa por cor" (imprimir cada cor e montar).
 */
export type AmsNeed = "uma-cor" | "troca-manual" | "ams";

export const AMS_LABEL: Record<AmsNeed, string> = {
  "uma-cor": "Sem AMS: 1 cor",
  "troca-manual": "Sem AMS: troca de filamento nas pausas",
  ams: "Precisa de AMS (ou uma mesa por cor)",
};

export const colorsOf = (models: Model[]) => [...new Set(models.flatMap((m) => m.parts.map((p) => p.color.toLowerCase())))];

export function amsNeed(models: Model[]): AmsNeed {
  if (colorsOf(models).length <= 1) return "uma-cor";
  return printPlan(models, "manual", 0.2).error ? "ams" : "troca-manual";
}

const GAP_MM = 4;

/** A malha com o Z mais baixo em 0 (peça de cima de um letreiro vai para a mesa). */
function dropToBed(mesh: Mesh): Mesh {
  let lo = Infinity;
  for (let i = 2; i < mesh.positions.length; i += 3) lo = Math.min(lo, mesh.positions[i]);
  if (!Number.isFinite(lo) || Math.abs(lo) < 1e-9) return mesh;
  const positions = new Float32Array(mesh.positions);
  for (let i = 2; i < positions.length; i += 3) positions[i] -= lo;
  return { positions, indices: mesh.indices };
}

/**
 * "Uma mesa por cor" (#118): para quem monta ou cola as peças (pixel art, shadowbox, marchetaria). Cada cor vira
 * uma mesa só dela, com as partes apoiadas na mesa e arrumadas lado a lado.
 */
export function platesByColor(models: Model[]): { color: string; models: Model[] }[] {
  return colorsOf(models).map((color) => {
    const pieces: Model[] = models.flatMap((m) =>
      m.parts
        .filter((p) => p.color.toLowerCase() === color)
        .map((p) => ({ name: `${m.name} · ${p.name}`, parts: [{ ...p, mesh: dropToBed(p.mesh) }] })),
    );
    return { color, models: pieces.length > 1 ? layoutOnPlate(pieces, bedMm() - 2 * GAP_MM, GAP_MM) : pieces };
  });
}
