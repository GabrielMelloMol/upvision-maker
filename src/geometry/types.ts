/** Malha indexada em mm, Z para cima (mesa da impressora em Z = 0). */
export type Mesh = { positions: Float32Array; indices: Uint32Array };
/** Um volume de uma cor (vira "parte" com filamento próprio no 3MF). */
export type Part = { name: string; color: string; mesh: Mesh };
/** Um objeto imprimível (ex.: um chaveiro), feito de 1+ partes coladas. */
export type Model = {
  name: string;
  parts: Part[];
  /** Só aparece na prévia (ex.: o modelo montado ao lado do cartão): não vai para os arquivos nem entra na conta da mesa. */
  previewOnly?: boolean;
};
