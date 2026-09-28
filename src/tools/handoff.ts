/** Passa um SVG de uma ferramenta para outra (ex.: vetorizar → cortador). Lido uma vez. */
let pending: { svg: string; name: string } | null = null;

export const handoffSvg = (svg: string, name: string) => {
  pending = { svg, name };
};
export const takeHandoff = () => {
  const p = pending;
  pending = null;
  return p;
};
