import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { PhysicalCamera, WebGLPathTracer } from "three-gpu-pathtracer";
import type { Model } from "../../geometry/types";
import { fitCamera, THUMB_VIEW } from "../frame";
import { type Filament, filamentMaterial, layerUVs, splitTops } from "./materials";
import { type Backdrop, studioEnvironment, table } from "./stage";

/*
 * Foto realista (#251): path tracing progressivo no navegador (three-gpu-pathtracer, WebGL2, sem rede). Câmera ¾ com
 * lente de 50 mm, leve profundidade de campo, sombra de contato e reflexos das caixas de luz. Roda em Playwright
 * (npm run photos) ou ao vivo, amostra por amostra (`createPhoto`).
 */
export const PHOTO_W = 1280;
export const PHOTO_H = 960;
const CREASE = (35 * Math.PI) / 180;
const FOCAL_MM = 50;
const F_STOP = 6; // quanto menor, mais desfoque fora do plano da peça
const TO_Y_UP = new THREE.Euler(-Math.PI / 2, 0, 0);
const VIGNETTE = 0.22;

export type PhotoOpts = {
  filament?: Filament;
  backdrop?: Backdrop;
  /** amostras por pixel (≈ 200 já fica limpo; menos fica granulado) */
  samples?: number;
  fStop?: number;
  exposure?: number;
  bounces?: number;
  w?: number;
  h?: number;
};

export type Photo = { renderer: THREE.WebGLRenderer; tracer: WebGLPathTracer; step: () => number; target: number; done: () => boolean; url: (vignette?: boolean) => string; dispose: () => void; ready: () => Promise<void> };

const yUp = (v: THREE.Vector3) => v.clone().applyEuler(TO_Y_UP);

/** Monta a cena e devolve o controle da renderização progressiva. */
export function createPhoto(models: Model[], opts: PhotoOpts = {}, canvas?: HTMLCanvasElement): Photo {
  const w = opts.w ?? PHOTO_W, h = opts.h ?? PHOTO_H;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true, canvas });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 1.0;

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment();
  scene.background = new THREE.Color(0xe9ebee);
  const group = new THREE.Group();
  for (const m of models)
    for (const part of m.parts) {
      let g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(part.mesh.positions, 3));
      g.setIndex(new THREE.BufferAttribute(part.mesh.indices, 1));
      g = toCreasedNormals(g, CREASE);
      const { walls, tops } = splitTops(g);
      g.dispose();
      for (const [geo, isTop] of [[walls, false], [tops, true]] as const) {
        if (!geo) continue;
        layerUVs(geo);
        group.add(new THREE.Mesh(geo, filamentMaterial(opts.filament ?? "pla", part.color, isTop)));
      }
    }
  const box = new THREE.Box3().setFromObject(group); // Z para cima
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1);
  group.rotation.copy(TO_Y_UP);
  scene.add(group);
  const floor = table(opts.backdrop ?? "studio", span, box.min.z, yUp(center)); // Z da mesa vira Y
  scene.add(floor);

  // câmera: enquadra em Z para cima e converte (posição e alvo) para Y para cima
  const probe = new THREE.PerspectiveCamera(THUMB_VIEW.fov, w / h, 0.1, span * 50);
  fitCamera(probe, box, THUMB_VIEW.dir, 0.08);
  const camera = new PhysicalCamera(THUMB_VIEW.fov, w / h, span * 0.05, span * 80);
  const target = yUp(center);
  camera.position.copy(yUp(probe.position));
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.setFocalLength(FOCAL_MM);
  camera.fStop = opts.fStop ?? F_STOP;
  camera.focusDistance = camera.position.distanceTo(target);
  camera.updateMatrixWorld();

  scene.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
    for (const t of [mat?.map, mat?.normalMap]) if (t) renderer.initTexture(t); // sobe as texturas à GPU antes do path tracer lê-las
  });
  const tracer = new WebGLPathTracer(renderer);
  tracer.renderDelay = 0;
  tracer.fadeDuration = 0;
  tracer.minSamples = 1;
  tracer.rasterizeScene = false;
  tracer.bounces = opts.bounces ?? 5;
  tracer.filterGlossyFactor = 0.6; // segura os pontinhos brancos (fireflies) dos reflexos
  tracer.tiles.set(2, 2);
  tracer.dynamicLowRes = false;
  tracer.setScene(scene, camera);

  const targetSamples = opts.samples ?? 200;
  return {
    renderer,
    tracer,
    target: targetSamples,
    step: () => {
      tracer.renderSample();
      return tracer.samples;
    },
    done: () => tracer.samples >= targetSamples,
    ready: async () => {
      for (let i = 0; i < 400 && (tracer as { isCompiling?: boolean }).isCompiling; i++) await new Promise((r) => setTimeout(r, 25));
    },
    url: (vignette = true) => {
      const src = renderer.domElement;
      if (!vignette) return src.toDataURL("image/png");
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      g.drawImage(src, 0, 0);
      const grad = g.createRadialGradient(w / 2, h * 0.46, h * 0.25, w / 2, h * 0.46, Math.hypot(w, h) * 0.6);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, `rgba(20,24,34,${VIGNETTE})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      return c.toDataURL("image/png");
    },
    dispose: () => {
      tracer.dispose();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/** Renderiza até o número de amostras e devolve o PNG e o tempo. */
export async function renderPhoto(models: Model[], opts: PhotoOpts = {}): Promise<{ url: string; ms: number; samples: number; setupMs: number; gpu: string }> {
  const s0 = performance.now();
  const photo = createPhoto(models, opts);
  await photo.ready();
  photo.step(); // 1ª amostra: compila o shader e sobe a BVH
  photo.renderer.getContext().finish();
  const t0 = performance.now();
  const setupMs = t0 - s0;
  const gl = photo.renderer.getContext();
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "?";
  while (!photo.done()) {
    photo.step();
    photo.renderer.getContext().finish();
    await new Promise((r) => setTimeout(r, 0));
  }
  const ms = performance.now() - t0;
  const url = photo.url();
  const samples = photo.tracer.samples;
  photo.dispose();
  return { url, ms, samples, setupMs, gpu };
}

/**
 * A primeira foto da página com textura (mesa de madeira) sai escura: o path tracer só enxerga as texturas depois de um
 * primeiro uso completo. Uma foto minúscula descartada, com a mesma mesa, resolve; chame antes da primeira foto de verdade.
 */
export async function warmUp(models: Model[], opts: PhotoOpts = {}): Promise<void> {
  await renderPhoto(models, { ...opts, w: 32, h: 24, samples: 2 });
}
