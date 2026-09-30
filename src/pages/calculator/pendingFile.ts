/** Arquivo do fatiador vindo de outra tela (ex.: Buscar modelos, #77); a calculadora lê uma vez ao abrir. */
let pending: File | null = null;
export const setPendingSlicerFile = (f: File) => {
  pending = f;
};
export function takePendingSlicerFile(): File | null {
  const f = pending;
  pending = null;
  return f;
}

/** Estimativa de uma ferramenta 3D (#99) para preencher a calculadora ao abrir; lida uma vez. */
let pendingEstimate: import("../SlicerImport").SlicerApply | null = null;
export const setPendingEstimate = (a: import("../SlicerImport").SlicerApply) => {
  pendingEstimate = a;
};
export function takePendingEstimate() {
  const a = pendingEstimate;
  pendingEstimate = null;
  return a;
}
