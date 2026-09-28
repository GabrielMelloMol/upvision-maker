import { describe, expect, test } from "vitest";
import type { Filament, Printer } from "../entities";
import { colorHex, filamentDraft, isCloseMatch, matchFilament, matchPrinter } from "./match";

const fil = (id: number, material: string, color: string): Filament => ({ id, material, color, brand: "", pricePerKg: 100, spoolG: 1000, stockG: 1000, minG: 0 });
const stock = [fil(1, "PLA", "Preto"), fil(2, "PLA", "Azul"), fil(3, "PETG", "Branco"), fil(4, "PLA", "#FFFFFF")];

test("colorHex entende hex e nomes em português (com ou sem acento)", () => {
  expect(colorHex("#0a2ca5")).toBe("#0A2CA5");
  expect(colorHex("Azul")).toBe("#1E40AF");
  expect(colorHex("amarelo limão")).toBe("#FACC15");
  expect(colorHex("sem cor")).toBeNull();
});

test("casa pelo material e pela cor mais próxima", () => {
  expect(matchFilament({ index: 1, type: "PLA", color: "#0A2CA5" }, stock)).toBe(2);
  expect(matchFilament({ index: 2, type: "PLA", color: "#FFFFFF" }, stock)).toBe(4);
  expect(matchFilament({ index: 2, type: "PETG", color: "#F5F5F5" }, stock)).toBe(3);
});

test("material diferente não casa; sem tipo, usa só a cor", () => {
  expect(matchFilament({ index: 1, type: "ABS", color: "#000000" }, stock)).toBeNull();
  expect(matchFilament({ index: 1, color: "#050505" }, stock)).toBe(1);
});

test("variações de nome do material (PLA Basic, PLA+) casam com PLA", () => {
  expect(matchFilament({ index: 1, type: "PLA Basic", color: "#000000" }, stock)).toBe(1);
});

test("impressora casa pelo nome (ex.: 'Bambu Lab A1' com cadastro 'A1')", () => {
  const printers: Printer[] = [
    { id: 1, name: "A1 mini", watts: 80 },
    { id: 2, name: "A1", watts: 110 },
    { id: 3, name: "Ender 3", watts: 150 },
  ];
  expect(matchPrinter("Bambu Lab A1", printers)).toBe(2);
  expect(matchPrinter("Bambu Lab A1 mini", printers)).toBe(1);
  expect(matchPrinter("Creality Ender-3 V3 SE", printers)).toBe(3);
  expect(matchPrinter("Prusa MK4", printers)).toBeNull();
});

describe("filamento do arquivo sem par no cadastro (#3)", () => {
  const PALETTE = [["Preto", "#1c1c1e"], ["Azul", "#2563eb"], ["Vermelho", "#d6262e"], ["Transparente", "transparent"]] as const;
  const stock = (material: string, color: string) => ({ id: 1, material, color, brand: "", pricePerKg: 100, spoolG: 1000, stockG: 1000, minG: 0 });

  test("casamento próximo: mesmo material e cor parecida; cor muito diferente não conta", () => {
    expect(isCloseMatch({ index: 1, type: "PLA Basic", color: "#0A2CA5" }, stock("PLA", "Azul"))).toBe(true);
    expect(isCloseMatch({ index: 1, type: "PLA", color: "#DC2626" }, stock("PLA", "Azul"))).toBe(false);
    expect(isCloseMatch({ index: 1, type: "PETG", color: "#0A2CA5" }, stock("PLA", "Azul"))).toBe(false);
    expect(isCloseMatch({ index: 1, type: "PLA" }, stock("PLA", "Azul"))).toBe(true); // arquivo sem cor
    expect(isCloseMatch({ index: 1, type: "PLA", color: "#0A2CA5" }, undefined)).toBe(false);
  });

  test("rascunho do cadastro: material conhecido e nome da cor mais próxima (ou o hex)", () => {
    expect(filamentDraft({ index: 1, type: "PLA Basic", color: "#0A2CA5" }, PALETTE)).toEqual({ material: "PLA", color: "Azul" });
    expect(filamentDraft({ index: 1, type: "PETG-HF", color: "#1B1B1B" }, PALETTE)).toEqual({ material: "PETG", color: "Preto" });
    expect(filamentDraft({ index: 1, type: "PVA", color: "#00FF88" }, PALETTE)).toEqual({ material: "Outro", color: "#00FF88" });
    expect(filamentDraft({ index: 1, type: "PA-CF" }, PALETTE).material).toBe("Nylon");
    expect(filamentDraft({ index: 1 }, PALETTE)).toEqual({ material: "PLA", color: "" });
  });
});
