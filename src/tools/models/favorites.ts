/** Modelos favoritos (estrela no editor): ficam neste computador, para a Criar mostrar o chip "Favoritos". */
export const FAVORITES_KEY = "upvision.favoriteModels";

export function loadFavorites(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
