/**
 * Abertura (#139, #150): o bico imprime o símbolo camada por camada, um reflexo de vidro passa pela peça pronta e o
 * símbolo voa para a logo da barra lateral enquanto o app aparece por baixo (coreografia em styles/splash.css).
 * A versão completa roda uma vez por dia e fica pelo menos MIN_FULL_MS (no app instalado o React monta em ~100 ms
 * e ela sumia antes de ser vista); nas outras aberturas é só o reflexo + o voo (~0,4 s), quando o app monta (App chama
 * `window.upvisionSplashDone`). Clique ou tecla pulam; trava de 4 s. "Reduzir movimento": só um fade.
 * A janela do Tauri nasce escondida e só aparece depois do 1º paint da abertura (sem piscar o fundo vazio).
 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import mark from "./assets/brand/mark.svg?raw";
import "./styles/splash.css";
import { applyTheme, storedTheme } from "./ui/theme";

// tema escolhido no app (#152) já na abertura, antes do 1º paint
if (storedTheme() !== "auto") void applyTheme(storedTheme());

const KEY = "upvision:splash";
const MIN_FULL_MS = 1400;
const SHEEN_MS = 160; // versão curta: o voo começa no meio do reflexo
const FLY_MS = 380;
const FADE_MS = 200;
const SAFETY_MS = 4000;
const NAME = "UpVision Maker";

function firstToday(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const first = localStorage.getItem(KEY) !== today;
    localStorage.setItem(KEY, today);
    return first;
  } catch {
    return false; // sem armazenamento: só a versão curta
  }
}

const started = performance.now();
const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const full = firstToday() && !reduce;
const letters = [...NAME].map((c, i) => `<span style="--i:${i}">${c}</span>`).join("");
const glow = `<defs><radialGradient id="splash-glow"><stop offset="0" stop-color="#ffb35c" stop-opacity="0.95"/><stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></radialGradient></defs>`;
const el = document.createElement("div");
el.id = "splash";
el.className = full ? "full" : "short";
el.setAttribute("aria-hidden", "true");
el.innerHTML = `<span class="brand-mark">${mark}<span class="sheen"></span></span><span class="wordmark">${letters}</span>`;
el.style.setProperty("--mark-mask", `url("data:image/svg+xml,${encodeURIComponent(mark)}")`);
const svg = el.querySelector("svg");
svg?.insertAdjacentHTML("afterbegin", glow);
svg?.querySelector(".nozzle")?.insertAdjacentHTML("afterbegin", `<circle class="nozzle-glow" cx="256" cy="234" r="22" fill="url(#splash-glow)"/>`);
document.body.prepend(el);

// mostra a janela depois do 1º paint da abertura (2 frames); fora do Tauri não há janela para mostrar
if ("__TAURI_INTERNALS__" in window)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      getCurrentWindow()
        .show()
        .catch((e) => console.error("abertura: não deu para mostrar a janela", e)); // o Rust mostra sozinho depois de 3 s
    }),
  );

/** O símbolo da abertura voa até a logo da barra lateral (a logo de verdade fica escondida durante o voo). */
function fly(): number {
  const from = el.querySelector<HTMLElement>(".brand-mark");
  const to = document.querySelector<HTMLElement>(".sidebar .brand .brand-mark");
  if (!from || !to || typeof from.animate !== "function") return 0;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (!b.width) return 0; // barra lateral escondida (janela estreita)
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  to.style.visibility = "hidden";
  from.animate([{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${b.width / a.width})` }], { duration: FLY_MS, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" });
  setTimeout(() => (to.style.visibility = ""), FLY_MS);
  return FLY_MS;
}

let done = false;
/** Fecha a abertura: voa (ou só some, ao pular / com Reduzir movimento) e o app aparece com fade + leve escala. */
function finish(skip = false) {
  if (done) return;
  done = true;
  const dur = skip || reduce ? 0 : fly();
  el.classList.add("out");
  if (!dur) el.classList.add("gone");
  document.getElementById("root")?.animate?.([{ opacity: 0, transform: "scale(0.98)" }, { opacity: 1, transform: "none" }], { duration: dur || FADE_MS, easing: "ease-out" });
  setTimeout(() => el.remove(), dur || FADE_MS);
}
/** App montado: a versão completa espera a impressão terminar; a curta passa o reflexo e voa. */
function ready() {
  if (done) return;
  if (full) {
    setTimeout(finish, Math.max(0, MIN_FULL_MS - (performance.now() - started)));
    return;
  }
  el.classList.add("sheening");
  setTimeout(finish, reduce ? 0 : SHEEN_MS);
}
(window as unknown as { upvisionSplashDone?: () => void }).upvisionSplashDone = ready;
addEventListener("pointerdown", () => finish(true), { once: true });
addEventListener("keydown", () => finish(true), { once: true });
setTimeout(() => finish(), SAFETY_MS);
