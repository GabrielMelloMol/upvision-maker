import type { ProductInput } from "../../domain/products";

/** Rascunho de produto vindo da calculadora ("Salvar como produto"). Lido uma vez pela página de Produtos. */
let pending: Partial<ProductInput> | null = null;
export const setProductDraft = (d: Partial<ProductInput>) => {
  pending = d;
};
export const peekProductDraft = () => pending;
export const clearProductDraft = () => {
  pending = null;
};
