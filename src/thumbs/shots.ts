import * as THREE from "three";
import type { Model } from "../geometry/types";
import type { Params } from "../tools/models/defs";
import { buildModels, renderModels } from "./renderThumb";

/*
 * Prints para conferir os kits (cartão, montado em ¾, frente, lado e baú aberto), sem mouse: roda na página do E2E
 * (tests/e2e/shots.e2e.ts, só com SHOTS=1). Fundo claro opaco, PNG.
 */
const BG = 0xf1f1f4;
const AHEAD = { x: new THREE.Vector3(1, 0, 0.04).normalize(), "-y": new THREE.Vector3(0, -1, 0.04).normalize() };
const views = (forward: "x" | "-y") => ({
  top: new THREE.Vector3(0, -0.001, 1).normalize(),
  threeQuarter: new THREE.Vector3(0.9, -1.4, 1.0).normalize(),
  front: AHEAD[forward], // de frente: olhando para a frente do kit (o bicho aponta para +x, o baú abre para -y)
  side: forward === "x" ? AHEAD["-y"] : AHEAD.x, // de lado: o perfil
});
export type ShotView = "top" | "threeQuarter" | "front" | "side";

const W = 1280, H = 960;
type Mesh = Model["parts"][number]["mesh"];

/** Gira, em torno do eixo X que passa por (y0, z0), as peças cujo nome casa; abre = a frente (−y) sobe. */
function swing(models: Model[], match: RegExp, y0: number, z0: number, deg: number): Model[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const turn = (m: Mesh): Mesh => {
    const p = new Float32Array(m.positions);
    for (let i = 0; i < p.length; i += 3) {
      const dy = p[i + 1] - y0, dz = p[i + 2] - z0;
      p[i + 1] = y0 + dy * c + dz * s;
      p[i + 2] = z0 - dy * s + dz * c;
    }
    return { ...m, positions: p };
  };
  return models.map((m) => ({ ...m, parts: m.parts.map((q) => (match.test(q.name) ? { ...q, mesh: turn(q.mesh) } : q)) }));
}

/** Eixo (y, z) do baú no montado: acha a posição do piso (centrado em x = y = 0 no desenho) e soma a altura do eixo. */
function bauAxis(preview: Model, hingeU: number, hingeV: number): [number, number] {
  const floor = preview.parts.find((q) => /piso/i.test(q.name));
  if (!floor) throw new Error("sem piso no montado");
  const p = floor.mesh.positions;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity;
  for (let i = 0; i < p.length; i += 3) {
    x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); z0 = Math.min(z0, p[i + 2]);
  }
  void x0; void x1;
  const cy = (y0 + y1) / 2;
  return [cy + hingeU, z0 - 2 + hingeV]; // o piso fica a FLOOR_Z = 2 acima do chão
}

export type ShotSet = Record<string, string>; // nome do arquivo → data URL PNG

/** Todas as vistas de um kit: cartão, montado em ¾, frente e lado (e o baú aberto). */
export async function kitShots(id: string, patch: Params, open?: { hingeU: number; hingeV: number }, forward: "x" | "-y" = "x"): Promise<ShotSet> {
  const VIEWS = views(forward);
  const models = await buildModels(id, patch);
  const card = models.filter((m) => !m.previewOnly);
  const preview = models.filter((m) => m.previewOnly);
  const png = (ms: Model[], view: ShotView, fov = 26) => renderModels(ms, W, H, { dir: VIEWS[view], background: BG, png: true, fov, margin: 0.08 });
  const out: ShotSet = {
    "cartao.png": png(card, "top", 18),
    "montado.png": png(preview, "threeQuarter"),
    "frente.png": png(preview, "front", 18),
    "lado.png": png(preview, "side", 18),
  };
  if (open) {
    const [y0, z0] = bauAxis(preview[0], open.hingeU, open.hingeV);
    const opened = swing(preview, /tampa/i, y0, z0, 70);
    out["aberto.png"] = png(opened, "threeQuarter");
    out["aberto-lado.png"] = png(opened, "side", 18);
  }
  return out;
}
