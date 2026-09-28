// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mesh, Model } from "../geometry/types";
import Preview3D from "./Preview3D";
import { createViewer } from "./viewerScene";

// happy-dom não tem WebGL: renderer falso que registra onde a câmera estava a cada quadro.
const gl = vi.hoisted(() => ({ renders: [] as { x: number; y: number; z: number }[], sizes: [] as [number, number][], disposed: 0 }));
vi.mock("three", async (orig) => {
  const mod = await orig<typeof import("three")>();
  class FakeRenderer {
    domElement = document.createElement("canvas");
    setPixelRatio() {}
    setSize(w: number, h: number) {
      gl.sizes.push([w, h]);
    }
    render(_s: unknown, cam: InstanceType<typeof mod.PerspectiveCamera>) {
      gl.renders.push({ x: cam.position.x, y: cam.position.y, z: cam.position.z });
    }
    dispose() {
      gl.disposed++;
    }
  }
  return { ...mod, WebGLRenderer: FakeRenderer };
});
// Controles do mouse substituídos para o teste disparar "start"/"end" (o giro automático depende deles).
const orbit = vi.hoisted(() => ({ last: null as null | { autoRotate: boolean; dispatchEvent: (e: { type: "start" | "end" }) => void; disposed: boolean } }));
vi.mock("three/addons/controls/OrbitControls.js", async () => {
  const { EventDispatcher, Vector3 } = await import("three");
  class OrbitControls extends EventDispatcher<{ change: object; start: object; end: object }> {
    target = new Vector3();
    autoRotate = false;
    autoRotateSpeed = 0;
    enableDamping = false;
    dampingFactor = 0;
    disposed = false;
    constructor() {
      super();
      orbit.last = this as never;
    }
    update() {}
    dispose() {
      this.disposed = true;
    }
  }
  return { OrbitControls };
});

let frames: Map<number, FrameRequestCallback>;
let nextId: number;
let now: number;
let reduced: boolean;
let schemeListeners: (() => void)[];
let resizeCb: (() => void) | null;

/** Roda os quadros pendentes, avançando o relógio `ms` antes de cada um. */
function runFrames(ms: number, max = 50) {
  for (let i = 0; i < max && frames.size; i++) {
    now += ms;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((f) => f(now));
  }
}

beforeEach(() => {
  gl.renders.length = 0;
  gl.sizes.length = 0;
  frames = new Map();
  nextId = 1;
  now = 1000;
  reduced = false;
  schemeListeners = [];
  resizeCb = null;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (frames.set(nextId, cb), nextId++));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("reduced-motion") && reduced,
    addEventListener: (_: string, l: () => void) => schemeListeners.push(l),
    removeEventListener: (_: string, l: () => void) => (schemeListeners = schemeListeners.filter((x) => x !== l)),
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        resizeCb = cb;
      }
      observe() {}
      disconnect() {
        resizeCb = null;
      }
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const box = (sx: number, sy: number, sz: number): Mesh => ({
  positions: new Float32Array([0, 0, 0, sx, 0, 0, 0, sy, 0, 0, 0, sz]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
});
const model = (s: number, parts = [{ name: "Base", color: "#2563eb" }]): Model => ({ name: "m", parts: parts.map((p) => ({ ...p, mesh: box(s, s, s / 2) })) });
const host = () => {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: 400, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 300, configurable: true });
  return el;
};
const lastCam = () => new THREE.Vector3(gl.renders.at(-1)!.x, gl.renders.at(-1)!.y, gl.renders.at(-1)!.z);

describe("createViewer", () => {
  test("monta o canvas no host, ajusta ao tamanho e desmonta tudo no dispose", () => {
    const el = host();
    const v = createViewer(el);
    expect(el.firstElementChild).toBeInstanceOf(HTMLCanvasElement);
    expect(gl.sizes.at(-1)).toEqual([400, 300]);
    Object.defineProperty(el, "clientWidth", { value: 800 });
    resizeCb!();
    expect(gl.sizes.at(-1)).toEqual([800, 300]);

    v.dispose();
    expect(el.querySelector("canvas")).toBeNull();
    expect(orbit.last!.disposed).toBe(true);
    expect(schemeListeners).toHaveLength(0);
    expect(resizeCb).toBeNull();
  });

  test("1º modelo: câmera desliza até ele, gira alguns segundos e para sozinha", () => {
    const v = createViewer(host());
    v.setModels([model(40)]);
    expect(frames.size).toBe(1);
    runFrames(100, 8); // voo de 700 ms
    const landed = lastCam();
    expect(orbit.last!.autoRotate).toBe(true);
    runFrames(500); // gira ~6 s e desliga
    expect(frames.size).toBe(0);
    expect(orbit.last!.autoRotate).toBe(false);
    // enquadra o modelo: câmera na frente (Y negativo) e acima (Z positivo) do centro
    expect(landed.y).toBeLessThan(0);
    expect(landed.z).toBeGreaterThan(0);
    v.dispose();
  });

  test("movimento reduzido: pula direto para o enquadramento, sem animação", () => {
    reduced = true;
    const v = createViewer(host());
    v.setModels([model(40)]);
    expect(frames.size).toBe(0);
    expect(lastCam().length()).toBeGreaterThan(0);
    v.dispose();
  });

  test("mudança pequena de tamanho não mexe na câmera; grande reenquadra sem girar; vazio zera", () => {
    reduced = true;
    const v = createViewer(host());
    v.setModels([model(40)]);
    const first = lastCam();
    v.setModels([model(42)]); // < 25 %
    expect(lastCam().distanceTo(first)).toBeCloseTo(0, 5);
    v.setModels([model(120)]);
    expect(lastCam().length()).toBeGreaterThan(first.length() * 2);

    reduced = false;
    v.setModels([]);
    v.setModels([model(10)]);
    expect(frames.size).toBe(1); // voltou a ser "1º modelo": voa de novo
    v.dispose();
  });

  test("arrastar o mouse interrompe voo e giro; soltar amortece por um tempo e para", () => {
    const v = createViewer(host());
    v.setModels([model(40)]);
    orbit.last!.dispatchEvent({ type: "start" });
    runFrames(16, 3);
    expect(orbit.last!.autoRotate).toBe(false);
    expect(frames.size).toBe(1); // continua renderizando enquanto arrasta
    orbit.last!.dispatchEvent({ type: "end" });
    runFrames(200);
    expect(frames.size).toBe(0);
    const n = gl.renders.length;
    orbit.last!.dispatchEvent({ type: "change" } as never);
    expect(gl.renders.length).toBe(n + 1); // mudança fora do loop renderiza na hora
    v.dispose();
  });

  test("trocar tema claro/escuro redesenha a mesa", () => {
    const v = createViewer(host());
    const n = gl.renders.length;
    schemeListeners.forEach((l) => l());
    expect(gl.renders.length).toBe(n + 1);
    v.dispose();
  });
});

describe("Preview3D", () => {
  test("mostra medidas, legenda de cores (mais de uma) e esconde o aviso de vazio", () => {
    const { container } = render(<Preview3D models={[model(40, [{ name: "Base", color: "#111111" }, { name: "Texto", color: "#ffffff" }])]} />);
    expect(screen.getByText("40.0 × 40.0 × 20.0 mm")).toBeInTheDocument();
    expect([...container.querySelectorAll(".legend span")].map((s) => s.textContent)).toEqual(["Base", "Texto"]);
    expect(screen.queryByText("A prévia aparece aqui.")).not.toBeInTheDocument();
  });

  test("estados: vazio, carregando e erro", () => {
    const { rerender, container } = render(<Preview3D models={[]} emptyText="Envie algo." />);
    expect(screen.getByText("Envie algo.")).toBeInTheDocument();
    expect(container.querySelector(".hud")).toBeNull();
    rerender(<Preview3D models={[model(10)]} busy busyText="Gerando…" />);
    expect(screen.getByText("Gerando…")).toBeInTheDocument();
    expect(container.querySelector(".legend")).toBeNull(); // uma cor só: sem legenda
    rerender(<Preview3D models={[]} error="Deu ruim" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Deu ruim");
  });
});
