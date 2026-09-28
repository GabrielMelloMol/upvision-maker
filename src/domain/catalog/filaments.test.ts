import { expect, test } from "vitest";
import { MATERIAL_TYPES } from "../entities";
import { FILAMENT_CATALOG, FILAMENT_CATALOG_ITEMS, filamentFromCatalog } from "./filaments";

test("marcas comuns no Brasil, com materiais válidos e rolo padrão", () => {
  const brands = new Set(FILAMENT_CATALOG.map((f) => f.brand));
  for (const b of ["Voolt3D", "3D Fila", "GTMax3D", "Sunlu", "Bambu Lab", "eSun", "Creality"]) expect(brands).toContain(b);
  for (const f of FILAMENT_CATALOG) {
    expect(MATERIAL_TYPES).toContain(f.material);
    expect(f.spoolG).toBeGreaterThan(0);
    expect(f.colors.length).toBeGreaterThan(0);
  }
});

test("catálogo → formulário (marca, material, rolo; cor e preço ficam para ela)", () => {
  expect(filamentFromCatalog("voolt3d-petg")).toEqual({ brand: "Voolt3D", material: "PETG", spoolG: "1000" });
  const item = FILAMENT_CATALOG_ITEMS.find((i) => i.id === "bambu-pla")!;
  expect(item).toMatchObject({ group: "Bambu Lab", title: "PLA", subtitle: "PLA · 1 kg" });
  expect(item.keywords).toContain("Preto");
  expect(() => filamentFromCatalog("x")).toThrow();
});
