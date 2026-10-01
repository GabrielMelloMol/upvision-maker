/**
 * Miniaturas dos Modelos prontos (#149): render com fundo transparente, câmera ¾ e luz de estúdio, geradas por
 * `npm run thumbs` (src/thumbs/renderThumb.ts) em src/assets/model-thumbs/<id>.webp. O card dá o fundo (claro/escuro).
 */
export const THUMBS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob("../../assets/model-thumbs/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>).map(([path, url]) => [path.replace(/^.*\/(.+)\.webp$/, "$1"), url]),
);
