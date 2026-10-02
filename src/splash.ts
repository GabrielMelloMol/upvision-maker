/**
 * Abertura (#139, #150, #151, #153): o mini-ícone sobe, o bico imprime as 3 camadas do símbolo, o nome entra letra a
 * letra, o reflexo de vidro passa e a tela "abre" para o app (coreografia em styles/splash.css). Toca TODA vez que o
 * app abre, uns 3,6 s (#168: a antiga escolha Curta/Desligada ficava salva e escondia a abertura; não há mais escolha).
 * Com "Reduzir movimento" o símbolo e o nome ficam parados o mesmo tempo e o app entra num fade. O app carrega por baixo. A janela do Tauri nasce escondida e só aparece com a abertura já pintada e no
 * tema certo; a animação só começa (e o tempo conta) depois disso. Clique ou tecla pulam; trava de 7 s.
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import glyph from "./assets/brand/glyph.svg?raw";
import "./styles/splash.css";
import { applyTheme, storedTheme } from "./ui/theme";

/** Quanto a abertura fica antes de abrir o app (contando de quando a janela apareceu). */
const HOLD_MS = 3000;
/** O efeito que "abre" o app. */
const OPEN_MS = 620;
const SKIP_MS = 200;
/** WKWebView/WebView2 pintam um pouco depois do requestAnimationFrame: espera antes de mostrar a janela. */
const PAINT_SETTLE_MS = 60;
const THEME_WAIT_MS = 400;
const SAFETY_MS = 7000;
const NAME = "UpVision Maker";

const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTauri = "__TAURI_INTERNALS__" in window;

// tema escolhido no app (#152) antes de a janela aparecer: senão ela pisca no tema do sistema
const themed: Promise<void> =
  storedTheme() === "auto" ? Promise.resolve() : Promise.race([applyTheme(storedTheme()), new Promise<void>((ok) => setTimeout(ok, THEME_WAIT_MS))]);

/** Mostra a janela depois do paint (tema aplicado + 2 frames + folga); fora do Tauri não há janela para mostrar. */
function showWindow(): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return themed.then(
    () =>
      new Promise((ok) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            setTimeout(() => {
              // macOS: a janela já está na tela invisível (pintando) e só fica visível agora (src-tauri/src/reveal.rs)
              (/Mac/i.test(navigator.platform) ? invoke("reveal_window") : getCurrentWindow().show())
                .catch((e) => console.error("abertura: não deu para mostrar a janela", e)) // o Rust mostra sozinho depois de 3 s
                .finally(ok);
            }, PAINT_SETTLE_MS),
          ),
        ),
      ),
  );
}

const ready = window as unknown as { upvisionSplashDone?: () => void };
const el = document.createElement("div");
const letters = [...NAME].map((c, i) => `<span style="--i:${i}">${c === " " ? "&nbsp;" : c}</span>`).join("");
const glow = `<defs><radialGradient id="splash-glow"><stop offset="0" stop-color="#ffb35c" stop-opacity="0.95"/><stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></radialGradient></defs>`;
// o bico (só na abertura): corpo, ponta e o brilho quente onde o filamento sai
const nozzle = `<g class="nozzle"><circle class="nozzle-glow" cx="16" cy="3.4" r="3.2" fill="url(#splash-glow)"/><rect x="13.6" y="-2.6" width="4.8" height="3.6" rx="1" fill="currentColor"/><path d="M14.6 1h2.8l-1.4 2z" fill="currentColor"/></g>`;
el.id = "splash";
el.className = "full";
el.setAttribute("aria-hidden", "true");
el.innerHTML = `<span class="brand-mark">${glyph}<span class="sheen"></span></span><span class="wordmark">${letters}</span>`;
const svg = el.querySelector("svg");
svg?.insertAdjacentHTML("afterbegin", glow);
svg?.insertAdjacentHTML("beforeend", nozzle);
document.body.prepend(el);

// a animação fica parada até a janela aparecer; o tempo conta daí
let started = Infinity;
let mounted = false;
const shown = showWindow().then(() => {
  started = performance.now();
  el.classList.add("play");
});

let done = false;
const root = () => document.getElementById("root");
/** Abre o app (#153, escolha do Gabriel: íris): o app se abre num círculo a partir da peça. Pular = fade curto. */
const open = (skip: boolean) => {
  if (done) return;
  done = true;
  const r = root();
  const dur = skip || reduce ? SKIP_MS : OPEN_MS;
  const iris = !skip && !reduce && !!r?.animate;
  el.classList.add("out", iris ? "iris" : "skip");
  if (iris && r) {
    const m = el.querySelector(".brand-mark")!.getBoundingClientRect();
    const at = `${Math.round(m.left + m.width / 2)}px ${Math.round(m.top + m.height / 2)}px`;
    r.style.cssText += ";position:relative;z-index:1001";
    r.animate([{ clipPath: `circle(0px at ${at})` }, { clipPath: `circle(150vmax at ${at})` }], { duration: dur, easing: "cubic-bezier(0.65, 0, 0.35, 1)" }).finished.finally(() => {
      r.style.position = "";
      r.style.zIndex = "";
    });
  } else r?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: "ease-out" });
  setTimeout(() => el.remove(), dur);
};
/** Abre quando as duas coisas estão prontas: o tempo da abertura e o app montado por baixo. */
const tryOpen = () => {
  if (!mounted || done) return;
  const wait = HOLD_MS - (performance.now() - started);
  if (wait > 0) setTimeout(tryOpen, wait);
  else open(false);
};
ready.upvisionSplashDone = () => {
  mounted = true;
  void shown.then(tryOpen);
};
addEventListener("pointerdown", () => open(true), { once: true });
addEventListener("keydown", () => open(true), { once: true });
setTimeout(() => open(false), SAFETY_MS);
