import { z } from "zod";
import { validPixKey } from "./pix";

const text = (max: number) => z.string().trim().max(max);
const digits = (s: string) => s.replace(/\D/g, "");

/** CPF (11) ou CNPJ (14) com dígito verificador; vazio é permitido. Reaproveita a validação do Pix. */
const document = text(20).transform((v, ctx) => {
  const d = digits(v);
  if (!d) return "";
  if (d.length !== 11 && d.length !== 14) {
    ctx.addIssue({ code: "custom", message: "CPF tem 11 números e CNPJ tem 14." });
    return z.NEVER;
  }
  try {
    validPixKey(d);
  } catch {
    ctx.addIssue({ code: "custom", message: d.length === 11 ? "CPF inválido: confira os números." : "CNPJ inválido: confira os números." });
    return z.NEVER;
  }
  return d;
});
const email = text(120).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail inválido.");
const phone = text(30);
const address = { cep: text(9), street: text(120), number: text(20), complement: text(60), district: text(80), city: text(80), uf: text(2) };

export const CustomerInput = z.object({
  kind: z.enum(["pf", "pj"]),
  name: z.string().trim().min(1, "Obrigatório").max(120),
  document,
  phone,
  email,
  instagram: text(60),
  ...address,
  discountPct: z.number().min(0).max(100, "Máximo 100%"),
  active: z.boolean(),
  notes: text(1000),
});
export type CustomerInput = z.infer<typeof CustomerInput>;
export type Customer = CustomerInput & { id: number };

export const EMPTY_CUSTOMER: CustomerInput = {
  kind: "pf",
  name: "",
  document: "",
  phone: "",
  email: "",
  instagram: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  uf: "",
  discountPct: 0,
  active: true,
  notes: "",
};

export const CompanyInput = z.object({
  name: text(120),
  tradeName: text(120),
  document,
  phone,
  email,
  instagram: text(60),
  website: text(120),
  ...address,
  logo: z.string().refine((v) => v === "" || /^data:image\/(png|jpeg|webp);base64,/.test(v), "Logo inválido."),
  pixKey: text(120).transform((v, ctx) => {
    if (!v) return "";
    try {
      return validPixKey(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: e instanceof Error ? e.message : "Chave Pix inválida." });
      return z.NEVER;
    }
  }),
  pixName: text(60),
  pixCity: text(40),
  quoteValidityDays: z.number().int().min(1).max(365),
  quoteTerms: text(2000),
  /** Prefixo do número do orçamento: ORC-2026-001 (#36). */
  quotePrefix: z.string().trim().min(1, "Obrigatório").max(10).regex(/^[\p{L}\d]+$/u, "Só letras e números"),
});
export type Company = z.infer<typeof CompanyInput>;

export const DEFAULT_COMPANY: Company = {
  name: "",
  tradeName: "",
  document: "",
  phone: "",
  email: "",
  instagram: "",
  website: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  uf: "",
  logo: "",
  pixKey: "",
  pixName: "",
  pixCity: "",
  quoteValidityDays: 7,
  quoteTerms: "Pagamento: 50% na aprovação e 50% na entrega.\nPrazo de produção contado a partir da aprovação.",
  quotePrefix: "ORC",
};

export function formatDocument(d: string): string {
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d;
}

/** Endereço numa linha, para documentos. */
export const oneLineAddress = (a: Partial<Company | CustomerInput>) =>
  [[a.street, a.number].filter(Boolean).join(", "), a.complement, a.district, [a.city, a.uf].filter(Boolean).join("/"), a.cep && `CEP ${a.cep}`].filter(Boolean).join(" · ");
