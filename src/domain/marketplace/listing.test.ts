import { describe, expect, test } from "vitest";
import type { Filament, Material } from "../entities";
import { EMPTY_PRODUCT, type Product, type ProductCtx } from "../products";
import { DEFAULT_SETTINGS } from "../settings";
import { MARKETPLACES } from "./columns";
import { listingFile, listingRows, productGrams, type ListingOptions } from "./listing";
import { readWorkbook } from "./xlsx";

const fil = (id: number, pricePerKg: number): Filament => ({ id, material: "PLA", color: "", brand: "", pricePerKg, spoolG: 1000, stockG: 1000, minG: 0 });
const box: Material = { id: 1, name: "Embalagem", unit: "un", unitPrice: 5, stock: 100, min: 0 };
const product = (id: number, p: Partial<Product>): Product => ({ ...EMPTY_PRODUCT, id, name: `P${id}`, ...p });

// exemplo da home: luminária 120 g de PLA a R$ 85/kg + embalagem R$ 5 → custo 15,96; Shopee 20% + R$ 4 com 30% = 39,92
const lum = product(1, { name: "Luminária de lua", sku: "LUM-1", stock: 3.6, composition: { filaments: [{ filamentId: 1, grams: 120 }], materials: [{ materialId: 1, qty: 1 }], items: [] } });
const ctx = (products: Product[]): ProductCtx => ({ filaments: [fil(1, 85)], materials: [box], printers: [], products, settings: { ...DEFAULT_SETTINGS, maintenancePct: 5, failurePct: 0 } });
const opts: ListingOptions = { marketplace: "shopee", channel: "Shopee", categoryId: "101152", packagingG: 30, box: { length: 20, width: 15, height: 10 } };

describe("linhas da planilha de upload em massa (#78)", () => {
  test("preço do canal, estoque inteiro, peso da peça + embalagem em kg, caixa padrão e categoria", () => {
    const [r] = listingRows([lum], ctx([lum]), opts);
    expect(r.values).toMatchObject({ name: "Luminária de lua", sku: "LUM-1", price: 39.92, stock: 3, weight: 0.15, length: 20, width: 15, height: 10, category: "101152", unit: "UN", origin: "0" });
    expect(r.values.description).toBe("Luminária de lua"); // sem descrição, repete o nome
    expect(r.missing).toEqual(["descrição", "NCM"]);
  });

  test("dados do próprio produto têm prioridade; venda direta usa o preço manual", () => {
    const p = { ...lum, description: "Luminária impressa em 3D com LED", ncm: "94055000", weightG: 300, boxL: 12, boxW: 12, boxH: 18, manualPrice: 89.9 };
    const [r] = listingRows([p], ctx([p]), { ...opts, channel: "Venda direta (consumidor final)" });
    expect(r.values).toMatchObject({ price: 89.9, weight: 0.3, length: 12, width: 12, height: 18, ncm: "94055000" });
    expect(r.missing).toEqual([]);
  });

  test("peso de kit soma os produtos de dentro; peças na mesa dividem o filamento", () => {
    const piece = product(2, { piecesPerPlate: 4, composition: { filaments: [{ filamentId: 1, grams: 100 }], materials: [], items: [] } });
    const kit = product(3, { kind: "kit", composition: { filaments: [], materials: [], items: [{ productId: 2, qty: 3 }] } });
    expect(productGrams(piece, ctx([piece, kit]))).toBe(25);
    expect(productGrams(kit, ctx([piece, kit]))).toBe(75);
  });

  test("Mercado Livre: mesmas linhas com as colunas e o peso em gramas do mapeamento dele", () => {
    const [r] = listingRows([lum], ctx([lum]), { ...opts, marketplace: "ml", channel: "Mercado Livre (clássico)" });
    expect(r.values.weight).toBe(150);
    expect(r.values.condition).toBe("Novo");
    expect(Object.keys(MARKETPLACES.ml.columns)).toContain("condition");
  });

  test("sem modelo: planilha simples com os rótulos do marketplace e uma linha por produto", () => {
    const rows = listingRows([lum], ctx([lum]), opts);
    const { bytes, note } = listingFile(rows, "shopee");
    const [sheet] = readWorkbook(bytes);
    expect(sheet.rows[0].slice(0, 3)).toEqual(["Categoria", "Nome do Produto", "Descrição do Produto"]);
    expect(sheet.rows[1].slice(0, 2)).toEqual(["101152", "Luminária de lua"]);
    expect(note).toMatch(/copie/);
  });
});
