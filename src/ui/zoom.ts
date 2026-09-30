/** Tamanho do texto (#144): zoom do app inteiro, lembrado neste computador. Ctrl/⌘ + e − também funcionam (tauri.conf). */
const KEY = "upvision:zoom";
export const ZOOMS = [
  ["1", "Normal"],
  ["1.15", "Grande"],
  ["1.3", "Maior"],
] as const;
export type Zoom = (typeof ZOOMS)[number][0];

export function storedZoom(): Zoom {
  try {
    const v = localStorage.getItem(KEY);
    return ZOOMS.some(([z]) => z === v) ? (v as Zoom) : "1";
  } catch {
    return "1";
  }
}

/** No app, zoom nativo do webview (texto nítido, sem quebrar o layout); no navegador, o zoom do CSS. */
export async function applyZoom(z: Zoom, save = false): Promise<void> {
  if (save) {
    try {
      localStorage.setItem(KEY, z);
    } catch {
      // só não lembra da próxima vez
    }
  }
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    await getCurrentWebview().setZoom(Number(z));
    document.documentElement.style.removeProperty("zoom");
  } catch {
    document.documentElement.style.zoom = z === "1" ? "" : z;
  }
}
