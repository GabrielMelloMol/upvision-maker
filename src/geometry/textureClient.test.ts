import { describe, expect, test } from "vitest";
import { getManifold } from "./manifold";
import { toMesh } from "./mesh";
import { DEFAULT_TEXTURIZE } from "./texturize";
import { texturizeAsync, TexturizeCancelled } from "./textureClient";

const cube = async () => ({ name: "Peça", parts: [{ name: "Peça", color: "#ddd", mesh: toMesh((await getManifold()).Manifold.cube([30, 30, 20], false)) }] });

describe("textura no worker: cliente (#222)", { timeout: 60_000 }, () => {
  test("sem Worker roda na mesma thread, com progresso até 1", async () => {
    const seen: number[] = [];
    const job = texturizeAsync([await cube()], { ...DEFAULT_TEXTURIZE, scale: 8 }, (f) => seen.push(f));
    const r = await job.promise;
    expect(r.models).toHaveLength(1);
    expect(r.info.triangles).toBeGreaterThan(1000);
    expect(seen[seen.length - 1]).toBe(1);
  });

  test("um pedido novo cancela o anterior, e cancelar manualmente rejeita com TexturizeCancelled", async () => {
    const m = await cube();
    const first = texturizeAsync([m], { ...DEFAULT_TEXTURIZE, scale: 8 });
    const second = texturizeAsync([m], { ...DEFAULT_TEXTURIZE, scale: 9 });
    await expect(first.promise).rejects.toBeInstanceOf(TexturizeCancelled);
    await expect(second.promise).resolves.toBeTruthy();
    const third = texturizeAsync([m], { ...DEFAULT_TEXTURIZE, scale: 8 });
    third.cancel();
    await expect(third.promise).rejects.toBeInstanceOf(TexturizeCancelled);
  });
});
