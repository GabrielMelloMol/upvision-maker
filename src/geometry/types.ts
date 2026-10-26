/** Malha indexada em mm, Z para cima (mesa da impressora em Z = 0). */
export type Mesh = { positions: Float32Array; indices: Uint32Array };
/** Um volume de uma cor (vira "parte" com filamento próprio no 3MF). */
/** `ghost`: só na prévia, desenhado translúcido e sem receber clique (plano e região do corte parcial); nunca vai para arquivo. Parte sem nome não entra na legenda. */
/** Segmentos soltos só da prévia (contorno da região e do plano): `points` são pares de pontos x,y,z; `width` em pixels (não muda com o zoom) e `dash` o traço em mm (0 = contínuo). */
export type PartLines = { points: Float32Array; width: number; dash: number };
/** `zoom`: só na prévia, a caixa (mm) para onde a câmera vai quando se clica no item da legenda ou na área dela (contorno de uma placa da mesa). */
export type Part = { name: string; color: string; mesh: Mesh; ghost?: boolean; lines?: PartLines; zoom?: { min: [number, number, number]; max: [number, number, number]; /** o que a câmera enquadra (as peças da placa); sem isto, a própria caixa */ to?: { min: [number, number, number]; max: [number, number, number] } } };
/** Um objeto imprimível (ex.: um chaveiro), feito de 1+ partes coladas. */
export type Model = {
  name: string;
  parts: Part[];
  /** Mesa do fatiador (1, 2, …) quando o modelo pede mais de uma, como a referência da canopla (#293). Sem isto, mesa 1. */
  plate?: number;
  /** Só aparece na prévia (ex.: o modelo montado ao lado do cartão): não vai para os arquivos nem entra na conta da mesa. */
  previewOnly?: boolean;
};
