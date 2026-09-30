/**
 * Liquid Glass (#139), por camadas e com parcimônia (barra de cima, sheets, busca e seletor):
 * - "refract": Chromium (WebView2 no Windows) com refração por filtro SVG (feDisplacementMap) no backdrop-filter,
 *   só nas sheets e na busca (fundo parado); na barra de cima custaria um quadro a cada rolagem;
 * - "css": WebKit (Mac) e o resto: desfoque, bordas de luz e brilho especular que segue o mouse;
 * - "lite": máquina fraca ou "reduzir movimento": sem refração e sem brilho que se mexe;
 * - "off": "reduzir transparência": superfícies opacas.
 */
export type GlassMode = "refract" | "css" | "lite" | "off";

const FILTER_ID = "lg-refract";
/** Núcleos e memória (GB) abaixo dos quais o vidro fica simples. */
const WEAK_CORES = 4;
const WEAK_MEMORY_GB = 4;
const SURFACES = "dialog.sheet, dialog.palette";

const media = (q: string) => typeof matchMedia === "function" && matchMedia(q).matches;

export function glassMode(nav: Pick<Navigator, "userAgent" | "hardwareConcurrency"> & { deviceMemory?: number } = navigator): GlassMode {
  if (media("(prefers-reduced-transparency: reduce)")) return "off";
  const weak = (nav.hardwareConcurrency || 8) <= WEAK_CORES || (nav.deviceMemory ?? 8) <= WEAK_MEMORY_GB;
  if (weak || media("(prefers-reduced-motion: reduce)")) return "lite";
  // só o Chromium (Chrome, WebView2 do Windows) aplica filtro SVG no backdrop-filter; o WebKit do Mac fica no CSS
  return /Chrome\//.test(nav.userAgent) ? "refract" : "css";
}

/** Refração sutil: ruído suave desloca o que está atrás do vidro alguns pixels. */
function injectFilter() {
  if (document.getElementById(FILTER_ID)) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.innerHTML = `<filter id="${FILTER_ID}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="1" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  document.body.appendChild(svg);
}

/** Liga o vidro na raiz (data-glass) e o brilho que segue o mouse. Retorna o desligamento. */
export function installGlass(mode: GlassMode = glassMode()): () => void {
  document.documentElement.dataset.glass = mode;
  if (mode === "refract") injectFilter();
  if (mode === "lite" || mode === "off") return () => {};
  let frame = 0;
  let last: PointerEvent | null = null;
  const apply = () => {
    frame = 0;
    const el = last && (last.target as Element | null)?.closest?.(SURFACES);
    if (!el || !(el instanceof HTMLElement)) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${Math.round(last!.clientX - r.left)}px`);
    el.style.setProperty("--my", `${Math.round(last!.clientY - r.top)}px`);
  };
  const onMove = (e: PointerEvent) => {
    last = e;
    if (!frame) frame = requestAnimationFrame(apply); // no máximo uma vez por quadro
  };
  addEventListener("pointermove", onMove, { passive: true });
  return () => {
    removeEventListener("pointermove", onMove);
    if (frame) cancelAnimationFrame(frame);
  };
}
