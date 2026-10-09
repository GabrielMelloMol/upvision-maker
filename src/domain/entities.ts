import { z } from "zod";

const name = z.string().trim().min(1, "Obrigatório").max(120);
const text = z.string().trim().max(120);
const nonNeg = z.number().min(0, "Não pode ser negativo");

export const MATERIAL_TYPES = ["PLA", "PETG", "ABS", "ASA", "TPU", "Nylon", "Resina", "Outro"] as const;

/** price/lifeHours/upkeepPerHour: depreciação e desgaste (custo de máquina por hora). */
// Padrões: cadastros e backups anteriores à v0.6 não têm esses campos.
/** nozzle: diâmetro do bico em mm (0,2 / 0,4 / 0,6 / 0,8 ou outro); o mapa estelar e os avisos de parte fina usam o da impressora das ferramentas. */
export const DEFAULT_NOZZLE = 0.4;
export const PrinterInput = z.object({ name, watts: nonNeg, price: nonNeg.default(0), lifeHours: nonNeg.default(5000), upkeepPerHour: nonNeg.default(0), nozzle: z.number().min(0.1, "O bico vai de 0,1 a 2 mm").max(2, "O bico vai de 0,1 a 2 mm").default(DEFAULT_NOZZLE) });
export const FilamentInput = z.object({
  material: name,
  color: text,
  brand: text,
  pricePerKg: nonNeg,
  spoolG: z.number().positive(),
  stockG: z.number(), // pode ficar negativo se o consumo real passar do saldo
  minG: nonNeg,
  // TD (transmission distance, mm) do quadro por camadas (#100); backups antigos não têm o campo
  td: z.number().min(0.1).max(20).nullable().default(null),
});
export const MaterialInput = z.object({ name, unit: z.string().trim().min(1).max(20), unitPrice: nonNeg, stock: z.number(), min: nonNeg });

export type PrinterInput = z.infer<typeof PrinterInput>;
export type FilamentInput = z.infer<typeof FilamentInput>;
export type MaterialInput = z.infer<typeof MaterialInput>;
export type WithId<T> = T & { id: number };
export type Printer = WithId<PrinterInput>;
/** `td` opcional no tipo: registros montados à mão (testes, telefone) não precisam dele. */
export type Filament = WithId<Omit<FilamentInput, "td"> & { td?: number | null }>;
export type Material = WithId<MaterialInput>;
