/*
 * Zoom da janela bloqueado (pedido do Gabriel: desmonta o layout). O jeito de aumentar a letra é Preferências > Aparência >
 * Tamanho do texto (ui/zoom.ts). Barra Ctrl/⌘ + roda, Ctrl/⌘ + = − 0 (e o teclado numérico), a pinça do trackpad (no Chromium e no
 * WebView2 ela chega como roda com Ctrl; no WebKit do Mac, como gesturestart/gesturechange) e o toque com dois dedos.
 * Na prévia 3D o zoom da câmera continua: os eventos não são interrompidos, só o zoom da página é cancelado.
 */
const ZOOM_KEYS = new Set(["+", "=", "-", "_", "0", "Add", "Subtract"]);
const ZOOM_CODES = new Set(["Equal", "Minus", "Digit0", "NumpadAdd", "NumpadSubtract", "Numpad0"]);

export function isZoomKey(e: KeyboardEvent): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  return ZOOM_KEYS.has(e.key) || ZOOM_CODES.has(e.code);
}

const inViewer = (e: Event) => e.target instanceof Element && !!e.target.closest(".viewer");

/** Liga o bloqueio. `onBlocked` roda a cada tentativa fora da prévia 3D (quem usa mostra o aviso uma vez). Devolve o desligar. */
export function installZoomGuard(onBlocked: () => void, target: Window = window): () => void {
  const cancel = (e: Event) => {
    e.preventDefault();
    if (!inViewer(e)) onBlocked();
  };
  const onKey = (e: KeyboardEvent) => isZoomKey(e) && cancel(e);
  const onWheel = (e: WheelEvent) => (e.ctrlKey || e.metaKey) && cancel(e);
  const onGesture = (e: Event) => cancel(e);
  const onTouch = (e: Event) => {
    if (((e as TouchEvent).touches?.length ?? 0) > 1) cancel(e);
  };
  target.addEventListener("keydown", onKey, true);
  target.addEventListener("wheel", onWheel, { capture: true, passive: false });
  target.addEventListener("gesturestart", onGesture, true);
  target.addEventListener("gesturechange", onGesture, true);
  target.addEventListener("touchmove", onTouch, { capture: true, passive: false });
  return () => {
    target.removeEventListener("keydown", onKey, true);
    target.removeEventListener("wheel", onWheel, true);
    target.removeEventListener("gesturestart", onGesture, true);
    target.removeEventListener("gesturechange", onGesture, true);
    target.removeEventListener("touchmove", onTouch, true);
  };
}

const HINT_KEY = "upvision:zoomHintShown";

/** O aviso do bloqueio aparece uma vez só (lembrado neste computador). Devolve true na primeira chamada. */
export function takeZoomHint(): boolean {
  try {
    if (localStorage.getItem(HINT_KEY)) return false;
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    // sem armazenamento: mostra só uma vez nesta sessão
    if (shownThisSession) return false;
  }
  shownThisSession = true;
  return true;
}
let shownThisSession = false;
