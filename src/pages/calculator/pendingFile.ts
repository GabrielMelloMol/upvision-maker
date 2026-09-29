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
