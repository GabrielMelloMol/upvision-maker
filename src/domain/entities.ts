import { z } from "zod";

const name = z.string().trim().min(1, "Obrigatório").max(120);
const text = z.string().trim().max(120);
const nonNeg = z.number().min(0, "Não pode ser negativo");

export const MATERIAL_TYPES = ["PLA", "PETG", "ABS", "ASA", "TPU", "Nylon", "Resina", "Outro"] as const;

/** price/lifeHours/upkeepPerHour: depreciação e desgaste (custo de máquina por hora). */
// Padrões: cadastros e backups anteriores à v0.6 não têm esses campos.
export const PrinterInput = z.object({ name, watts: nonNeg, price: nonNeg.default(0), lifeHours: nonNeg.default(5000), upkeepPerHour: nonNeg.default(0) });
export const FilamentInput = z.object({
  material: name,
  color: text,
  brand: text,
  pricePerKg: nonNeg,
  spoolG: z.number().positive(),
  stockG: z.number(), // pode ficar negativo se o consumo real passar do saldo
  minG: nonNeg,
});
export const MaterialInput = z.object({ name, unit: z.string().trim().min(1).max(20), unitPrice: nonNeg, stock: z.number(), min: nonNeg });

export type PrinterInput = z.infer<typeof PrinterInput>;
export type FilamentInput = z.infer<typeof FilamentInput>;
export type MaterialInput = z.infer<typeof MaterialInput>;
export type WithId<T> = T & { id: number };
export type Printer = WithId<PrinterInput>;
export type Filament = WithId<FilamentInput>;
export type Material = WithId<MaterialInput>;
