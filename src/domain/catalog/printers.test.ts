import { expect, test } from "vitest";
import { rank } from "../../ui/search";
import { PRINTER_BRANDS, PRINTER_CATALOG, PRINTER_CATALOG_ITEMS, printerFromCatalog, printerLabel, printerSourceText, printerSubtitle } from "./printers";

test("cobre as principais marcas, cada uma com ao menos 2 modelos", () => {
  for (const b of ["Bambu Lab", "Creality", "Prusa", "Elegoo", "Anycubic", "Sovol", "Flashforge", "Qidi", "Voron / Klipper"]) {
    expect(PRINTER_BRANDS).toContain(b);
    expect(PRINTER_CATALOG.filter((p) => p.brand === b).length).toBeGreaterThanOrEqual(2);
  }
});

test("potência média plausível; dado oficial sempre com link da fonte", () => {
  for (const p of PRINTER_CATALOG) {
    expect(p.watts).toBeGreaterThanOrEqual(40);
    expect(p.watts).toBeLessThanOrEqual(500); // OrangeStorm Giga, mesa de 800 mm
    if (p.source === "oficial") expect(p.ref).toMatch(/^https:\/\//);
  }
  const ids = PRINTER_CATALOG.map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("Bambu A1: 95 W, dado oficial; marcas sem dado publicado ficam como estimativa", () => {
  const a1 = PRINTER_CATALOG.find((p) => p.id === "bambu-a1")!;
  expect([a1.watts, a1.source]).toEqual([95, "oficial"]);
  expect(printerLabel(a1)).toBe("Bambu Lab A1");
  expect(printerSourceText(a1)).toBe("dado oficial da Bambu Lab");
  const k1 = PRINTER_CATALOG.find((p) => p.brand === "Creality")!;
  expect(k1.source).toBe("estimativa");
  expect(printerSourceText(k1)).toMatch(/^estimativa/);
});

test("catálogo → formulário e texto da linha", () => {
  expect(printerFromCatalog("bambu-a1")).toEqual({ name: "Bambu Lab A1", watts: "95" });
  expect(printerFromCatalog("voron-0").name).toBe("Voron 0 (120 mm)");
  expect(printerSubtitle(PRINTER_CATALOG[0])).toBe("95 W · dado oficial · aberta · 256×256×256 mm");
  expect(printerSubtitle(PRINTER_CATALOG.find((p) => p.id === "creality-k1")!)).toBe("≈120 W · estimativa · fechada · 220×220×250 mm");
  expect(() => printerFromCatalog("x")).toThrow();
});

test("catálogo ampliado (#21): 150+ modelos, 25+ marcas, volume e gabinete em todos", () => {
  expect(PRINTER_CATALOG.length).toBeGreaterThanOrEqual(150);
  expect(PRINTER_BRANDS.length).toBeGreaterThanOrEqual(25);
  for (const b of ["UltiMaker", "Snapmaker", "Artillery", "GTMax3D", "Sethi3D"]) expect(PRINTER_BRANDS).toContain(b);
  for (const p of PRINTER_CATALOG) {
    expect(typeof p.enclosed).toBe("boolean");
    expect(p.volume).toMatch(/\d+×\d+/);
  }
  expect(PRINTER_CATALOG.find((p) => p.id === "prusa-core-one")).toMatchObject({ source: "oficial", watts: 90 });
});

test.each([
  ["a1", "bambu-a1"],
  ["bambu a1", "bambu-a1"],
  ["k1c", "creality-k1c"],
  ["ender 3", "creality-ender3"],
  ["ender3", "creality-ender3"],
  ["ender-3 v3 se", "creality-ender3-v3-se"],
])("busca tolerante: '%s' acha %s", (q, id) => {
  const hits = rank(PRINTER_CATALOG_ITEMS.map((it) => ({ ...it, pageId: "" })), q).map((it) => it.id);
  expect(hits).toContain(id);
});
