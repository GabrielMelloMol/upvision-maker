import { describe, expect, test, vi } from "vitest";
import { getManifold } from "../geometry/manifold";
import { onReleaseHeavy, releaseHeavy } from "./heavy";

describe("liberar o pesado ao trocar de tela (#88)", () => {
  test("solta cada registrado uma vez; um erro não impede os outros", () => {
    const a = vi.fn();
    const b = vi.fn(() => {
      throw new Error("falhou");
    });
    const c = vi.fn();
    onReleaseHeavy(a);
    onReleaseHeavy(b);
    const off = onReleaseHeavy(c);
    off(); // desregistrado não é chamado
    vi.spyOn(console, "warn").mockImplementation(() => {});
    releaseHeavy();
    releaseHeavy();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).not.toHaveBeenCalled();
  });

  test("manifold solto é carregado de novo na próxima ferramenta e continua funcionando", { timeout: 30_000 }, async () => {
    const first = await getManifold();
    releaseHeavy();
    const second = await getManifold();
    expect(second).not.toBe(first);
    const cube = second.Manifold.cube([10, 10, 10]);
    expect(cube.volume()).toBeCloseTo(1000);
    cube.delete();
    expect(await getManifold()).toBe(second); // sem trocar de tela, a mesma instância
  });
});
