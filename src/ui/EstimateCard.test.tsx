// @vitest-environment happy-dom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { getManifold } from "../geometry/manifold";
import { toMesh } from "../geometry/mesh";
import type { Model } from "../geometry/types";
import { takePendingEstimate } from "../pages/calculator/pendingFile";
import { renderWithApp, setupTauri } from "../test/harness";
import { colorSwatch } from "./ColorDots";
import EstimateCard from "./EstimateCard";
import { NAVIGATE_EVENT } from "./navigate";

const t = setupTauri();

async function twoColors(): Promise<Model[]> {
  const M = await getManifold();
  const part = (color: string, x: number) => {
    const s = M.Manifold.cube([30, 30, 30]).translate([x, 0, 0]);
    const mesh = toMesh(s);
    s.delete();
    return { name: color, color, mesh };
  };
  return [{ name: "peça", parts: [part(colorSwatch("Branco")!.toLowerCase(), 0), part(colorSwatch("Azul")!.toLowerCase(), 40)] }];
}

describe("estimativa ao vivo (#99)", { timeout: 30_000 }, () => {
  test("gramas por cor com o filamento cadastrado, R$ e aviso de ±20%; leva para a calculadora", async () => {
    await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Branco', '', 100, 1000, 1000, 0), ('PETG', 'Azul', '', 140, 1000, 1000, 0)");
    const go = vi.fn();
    window.addEventListener(NAVIGATE_EVENT, (e) => go((e as CustomEvent).detail));
    const user = userEvent.setup();
    renderWithApp(<EstimateCard models={await twoColors()} name="Chaveiro Ana" />);
    expect(await screen.findByText(/PETG Azul: /)).toBeInTheDocument();
    expect(screen.getByText(/PLA Branco: /)).toBeInTheDocument();
    expect(screen.getByText(/≈ .* g · ≈ .* · ≈ R\$/)).toBeInTheDocument();
    expect(screen.getByText(/pode errar ±20%/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Levar para a Calculadora" }));
    expect(go).toHaveBeenCalledWith("calculator");
    const sent = takePendingEstimate()!;
    expect(sent.name).toBe("Chaveiro Ana");
    expect(sent.printerId).toBeUndefined(); // mantém a impressora da calculadora
    expect(sent.filaments.map((f) => [f.filamentId, f.pricePerKg])).toEqual([
      [1, 100],
      [2, 140],
    ]);
    expect(sent.filaments[1].grams).toBeGreaterThan(sent.filaments[0].grams); // PETG mais denso
    expect(sent.seconds).toBeGreaterThan(0);
  });

  test("sem filamento cadastrado: estima em PLA e sem R$; some enquanto gera", async () => {
    const models = await twoColors();
    const { rerender } = renderWithApp(<EstimateCard models={models} name="x" />);
    expect(await screen.findAllByText(/cor sem filamento cadastrado/)).toHaveLength(2);
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    rerender(<EstimateCard models={models} name="x" busy />);
    expect(screen.queryByRole("group", { name: "Estimativa sem fatiar" })).not.toBeInTheDocument();
  });
});
