/**
 * Abertura (#139): o símbolo "se imprime" camada por camada enquanto o app carrega. Não atrasa nada: some assim
 * que o app monta (App chama `window.upvisionSplashDone`), no 1º clique ou tecla, ou em 4 s. A animação inteira
 * roda uma vez por dia; nas outras aberturas é só um fade curto. "Reduzir movimento" desliga a animação.
 */
import mark from "./assets/brand/mark.svg?raw";
import "./styles/splash.css";

const KEY = "upvision:splash";
const SAFETY_MS = 4000;
const FADE_MS = 220;

function firstToday(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const first = localStorage.getItem(KEY) !== today;
    localStorage.setItem(KEY, today);
    return first;
  } catch {
    return false; // sem armazenamento: só o fade curto
  }
}

const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const el = document.createElement("div");
el.id = "splash";
el.className = firstToday() && !reduce ? "full" : "short";
el.setAttribute("aria-hidden", "true");
el.innerHTML = `<span class="brand-mark printing">${mark}</span><span class="wordmark"><span class="wm-up">Up</span>Vision <span class="wm-maker">Maker</span></span>`;
document.body.prepend(el);

let done = false;
function hide() {
  if (done) return;
  done = true;
  el.classList.add("out");
  setTimeout(() => el.remove(), FADE_MS);
}
(window as unknown as { upvisionSplashDone?: () => void }).upvisionSplashDone = hide;
addEventListener("pointerdown", hide, { once: true });
addEventListener("keydown", hide, { once: true });
setTimeout(hide, SAFETY_MS);
