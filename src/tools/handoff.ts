/** Passa um SVG de uma ferramenta para outra (ex.: vetorizar → cortador). */
let pending: { svg: string; name: string } | null = null;

export const handoffSvg = (svg: string, name: string) => {
  pending = { svg, name };
};
/** Leitura sem consumir (inicializadores do React podem rodar 2× em modo estrito). */
export const peekHandoff = () => pending;
export const clearHandoff = () => {
  pending = null;
};
