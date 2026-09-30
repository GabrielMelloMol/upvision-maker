/** Miniaturas geradas por `npm run thumbs` (src/assets/model-thumbs/<id>.jpg). */
export const THUMBS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob("../../assets/model-thumbs/*.jpg", { eager: true, query: "?url", import: "default" }) as Record<string, string>).map(([path, url]) => [path.replace(/^.*\/(.+)\.jpg$/, "$1"), url]),
);
