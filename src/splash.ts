/**
 * Abertura (#139, #150, #153): o símbolo animado da marca nova sobe, imprime as 3 camadas e desenha o filamento (ciclo de 4 s,
 * simbolo-animado.svg), o nome entra letra a letra e a tela "abre" para o app (coreografia em styles/splash.css). Toca TODA
 * vez que o app abre, uns 3,6 s (#168: a antiga escolha Curta/Desligada ficava salva e escondia a abertura; não há mais escolha).
 * Com "Reduzir movimento" o símbolo (quadro final) e o nome ficam parados o mesmo tempo e o app entra num fade. O app carrega por baixo. A janela do Tauri nasce escondida e só aparece com a abertura já pintada e no
 * tema certo; a animação só começa (e o tempo conta) depois disso. Clique ou tecla pulam; trava de 7 s.
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import animated from "./assets/brand/simbolo-animado.svg?raw";
import "@fontsource/plus-jakarta-sans/latin-800.css";
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
el.id = "splash";
el.className = "full";
el.setAttribute("aria-hidden", "true");
el.innerHTML = `<span class="brand-mark animated">${animated}</span><span class="wordmark">${letters}</span>`;
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
    r.animate([{ clipPath: `circle(0px at ${at})` }, { clipPath: `circle(150vmax at ${at})` }], { duration: dur, easing: "cubic-bezier(0.65, 0, 0.35, 1)" }).finished
      .catch(() => {}) // animação cancelada (aba em segundo plano, elemento removido): só desfaz o estilo
      .finally(() => {
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
