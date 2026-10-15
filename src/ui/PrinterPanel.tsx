import { useEffect, useRef, useState } from "react";
import type * as PrinterScene from "./printer/printerScene";

// começa um pouco antes de entrar na tela, para já estar rodando quando aparecer
const PRELOAD_MARGIN = "200px";
// a animação começa no meio da impressão: o primeiro quadro já mostra a peça crescendo, nunca a mesa vazia
const START_MS = 4600;
const LITE_CORES = 4;

const DARK = "(prefers-color-scheme: dark)";
const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Impressora 3D (Three.js) da marca: a mesma animação do site, no Início.
 * - three é carregado sob demanda, quando o painel chega perto da tela (não pesa na abertura do app)
 * - pausa fora da tela, com a janela escondida/minimizada e sem trabalhar à toa: roda em modo lite em máquina fraca
 * - movimento reduzido: um quadro parado da peça pronta; sem WebGL, não desenha nada
 * - acompanha o tema do app (o tema do app vai para a janela nativa, então o prefers-color-scheme já é o certo)
 */
export default function PrinterPanel({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState("Imprimindo camada 4 de 5…");

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || typeof IntersectionObserver === "undefined" || typeof matchMedia !== "function") return;

    const reduced = matchMedia(REDUCED).matches;
    const lite = (navigator.hardwareConcurrency ?? 8) <= LITE_CORES;
    const dark = matchMedia(DARK);
    let mod: typeof PrinterScene | null = null;
    let scene: ReturnType<typeof PrinterScene.createPrinterScene> | null = null;
    let starting = false;
    let disposed = false;
    let visible = false;
    let raf = 0;
    let clock = START_MS; // ms de animação (para no lugar quando pausa)
    let last = 0;
    let lastStatus = "";

    const draw = (ms: number) => {
      if (!scene || !mod) return;
      scene.render(ms);
      const text = mod.statusText(ms);
      if (text !== lastStatus) setStatus((lastStatus = text));
      if (barRef.current) barRef.current.style.transform = `scaleX(${mod.cycleProgress(ms)})`;
    };
    const frame = (now: number) => {
      clock += Math.min(now - last, 100);
      last = now;
      draw(clock);
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      if (!scene || reduced || !visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const redrawStill = () => reduced && mod && draw(mod.STILL_MS);

    async function start() {
      starting = true;
      try {
        mod = await import("./printer/printerScene");
        if (disposed) return;
        scene = mod.createPrinterScene(canvas!, { lite });
      } catch {
        return; // sem WebGL: fica só o texto
      }
      const { width, height } = container!.getBoundingClientRect();
      scene.resize(width, height);
      scene.setTheme(dark.matches);
      // primeiro quadro já aqui: sem depender do requestAnimationFrame (janela em segundo plano não roda rAF)
      draw(reduced ? mod.STILL_MS : clock);
      setLive(true);
      sync();
    }

    const intersection = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !starting) void start();
        sync();
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    intersection.observe(container);

    const resize = new ResizeObserver(([entry]) => {
      scene?.resize(entry.contentRect.width, entry.contentRect.height);
      redrawStill();
    });
    resize.observe(container);

    const onTheme = () => {
      scene?.setTheme(dark.matches);
      redrawStill();
      if (!reduced && scene) draw(clock);
    };
    dark.addEventListener("change", onTheme);
    document.addEventListener("visibilitychange", sync);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      intersection.disconnect();
      resize.disconnect();
      dark.removeEventListener("change", onTheme);
      document.removeEventListener("visibilitychange", sync);
      scene?.dispose();
    };
  }, []);

  return (
    <figure className={`printer-panel ${className}`}>
      <div ref={containerRef} className="printer-stage" role="img" aria-label="Impressora 3D imprimindo um bloco azul camada por camada, que depois é embalado para presente e enviado">
        <canvas ref={canvasRef} className={live ? "live" : undefined} />
      </div>
      <figcaption>
        <span aria-hidden className="printer-bar">
          <span ref={barRef} />
        </span>
        <span className="printer-status">{status}</span>
      </figcaption>
    </figure>
  );
}
