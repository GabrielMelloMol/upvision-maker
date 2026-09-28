import { expect, test } from "vitest";
import { PRINTER_BRANDS, PRINTER_CATALOG, printerFromCatalog, printerLabel, printerSourceText, printerSubtitle } from "./printers";

test("cobre as principais marcas, cada uma com ao menos 2 modelos", () => {
  for (const b of ["Bambu Lab", "Creality", "Prusa", "Elegoo", "Anycubic", "Sovol", "Flashforge", "Qidi", "Voron / Klipper"]) {
    expect(PRINTER_BRANDS).toContain(b);
    expect(PRINTER_CATALOG.filter((p) => p.brand === b).length).toBeGreaterThanOrEqual(2);
  }
});

test("potência média plausível; dado oficial sempre com link da fonte", () => {
  for (const p of PRINTER_CATALOG) {
    expect(p.watts).toBeGreaterThanOrEqual(40);
    expect(p.watts).toBeLessThanOrEqual(400);
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
  expect(printerSubtitle(PRINTER_CATALOG[0])).toBe("95 W · dado oficial");
  expect(printerSubtitle(PRINTER_CATALOG.find((p) => p.id === "creality-k1")!)).toBe("≈120 W · estimativa");
  expect(() => printerFromCatalog("x")).toThrow();
});
