/**
 * Animação de abertura (#153): Completa (padrão, ~3,6 s toda vez que o app abre), Curta (~1 s) ou Desligada.
 * Lida pelo splash.ts antes do app carregar; escolhida em Ajustes → Preferências → Aparência. Clique ou tecla pulam.
 */
export const SPLASH_MODES = [
  ["full", "Completa"],
  ["short", "Curta"],
  ["off", "Desligada"],
] as const;
export type SplashMode = (typeof SPLASH_MODES)[number][0];

const MODE_KEY = "upvision:splash-mode";

export function storedSplashMode(): SplashMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return SPLASH_MODES.some(([m]) => m === v) ? (v as SplashMode) : "full";
  } catch {
    return "full";
  }
}

export function saveSplashMode(m: SplashMode): void {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // só não lembra da próxima vez
  }
}

/** Qual abertura mostrar: "Reduzir movimento" do sistema troca a completa pela curta (sem impressão nem zoom). */
export const pickSplash = (mode: SplashMode, reduceMotion: boolean): SplashMode => (mode === "full" && reduceMotion ? "short" : mode);
