import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { PhysicalCamera, WebGLPathTracer } from "three-gpu-pathtracer";
import type { Model } from "../../geometry/types";
import { fitCamera } from "../frame";
import { type Filament, filamentMaterial, layerUVs, splitTops } from "./materials";
import { type Backdrop, brickWall, preloadStage, studioEnvironment, table } from "./stage";

/*
 * Foto realista (#251): path tracing progressivo no navegador (three-gpu-pathtracer, WebGL2, sem rede). Câmera ¾ com
 * lente de 50 mm, leve profundidade de campo, sombra de contato e reflexos das caixas de luz. Roda em Playwright
 * (npm run photos) ou ao vivo, amostra por amostra (`createPhoto`).
 */
export const PHOTO_W = 1280;
export const PHOTO_H = 960;
const CREASE = (35 * Math.PI) / 180;
const FOCAL_MM = 50;
const TOP_ELEVATION_DEG = 78; // de cima, mas não a 90° para a perspectiva ainda dar volume
const TOP_F_STOP = 8; // vista de cima: tudo nítido
const F_STOP = 2.8; // fundo bem desfocado (rodada 2)
const ELEVATION_DEG = 25; // câmera baixa
export const AZIMUTH_DEG = 28; // quanto a câmera gira para a direita da frente (−y)
const FOV_DEG = 27; // 50 mm em quadro cheio
const MARGIN = 0.03; // corte apertado
const HERO_PAD = 0.05; // folga em volta da peça principal; a caixa projetada é maior que a peça, então ~0 já a deixa com ~55% do quadro
const WALL_FACTOR = 1; // a parede fica a tantos tamanhos de peça atrás
const TO_Y_UP = new THREE.Euler(-Math.PI / 2, 0, 0);
const VIGNETTE = 0.2;

/** Uma peça (ou grupo de peças) da cena, com o filamento dela. */
export type PhotoItem = { models: Model[]; filament?: Filament };
/** O que vai na foto: peças impressas e adereços (metal, fita...), tudo em mm, Z para cima, já na posição da cena. */
export type PhotoScene = {
  items: PhotoItem[];
  extras: THREE.Object3D[];
  /** peça principal (índice em `items`): o quadro e o foco seguem ela */
  hero?: number;
  /** "top": vista de cima (peças planas); "3q" (padrão): câmera baixa de lado */
  view?: "top" | "3q";
  /** altura da câmera nesta cena, em graus (padrão: 25° de lado, 78° de cima) */
  elevation?: number;
  /** altura da mesa (Z, mm), quando nenhuma peça toca nela (medalha pendurada) */
  floorZ?: number;
  /** folga em volta da peça principal desta cena (a opção `heroPad` vence) */
  heroPad?: number;
  /** mesa de madeira escura: peça clara (branca, creme) some na madeira clara */
  darkTable?: boolean;
};

export type PhotoOpts = {
  filament?: Filament;
  backdrop?: Backdrop;
  /** amostras por pixel (≈ 200 já fica limpo; menos fica granulado) */
  samples?: number;
  fStop?: number;
  elevation?: number;
  azimuth?: number;
  wall?: boolean;
  /** "hero" (padrão, se a cena tem peça principal): enquadra ela e o que cabe em volta; "all": todas as peças */
  frame?: "hero" | "all";
  /** quanto cabe em volta da peça principal, em fração do tamanho dela (0,3 → ela ocupa ~60% do quadro) */
  heroPad?: number;
  exposure?: number;
  bounces?: number;
  w?: number;
  h?: number;
};

export type Photo = { renderer: THREE.WebGLRenderer; tracer: WebGLPathTracer; step: () => number; target: number; done: () => boolean; url: (vignette?: boolean) => string; dispose: () => void; ready: () => Promise<void> };

const yUp = (v: THREE.Vector3) => v.clone().applyEuler(TO_Y_UP);

/** Monta a cena e devolve o controle da renderização progressiva. */
export function createPhoto(scene3: PhotoScene, opts: PhotoOpts = {}, canvas?: HTMLCanvasElement): Photo {
  const w = opts.w ?? PHOTO_W, h = opts.h ?? PHOTO_H;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true, canvas });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // mantém a saturação das cores (o ACES lava)
  renderer.toneMappingExposure = opts.exposure ?? 0.14;

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment();
  scene.background = new THREE.Color(0xe9ebee);
  const group = new THREE.Group();
  const printed = new THREE.Group();
  const itemGroups: THREE.Group[] = [];
  for (const item of scene3.items) {
    const ig = new THREE.Group();
    itemGroups.push(ig);
    printed.add(ig);
    for (const m of item.models)
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
          ig.add(new THREE.Mesh(geo, filamentMaterial(item.filament ?? opts.filament ?? "pla", part.color, isTop)));
        }
      }
  }
  group.add(printed, ...scene3.extras);
  const box = new THREE.Box3().setFromObject(printed); // Z para cima: foco, mesa e enquadramento seguem só o que foi impresso (a corrente e a fita podem sair do quadro)
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1);
  // enquadramento: a peça principal mais uma folga (as outras peças aparecem em volta, desfocadas); sem principal, tudo
  const top = scene3.view === "top";
  const hero = scene3.hero !== undefined && (opts.frame ?? (top ? "all" : "hero")) === "hero" ? itemGroups[scene3.hero] : undefined;
  let frameBox = box;
  if (hero) {
    const hb = new THREE.Box3().setFromObject(hero);
    const hs = hb.getSize(new THREE.Vector3());
    frameBox = hb.clone().expandByScalar(Math.max(hs.x, hs.y) * (opts.heroPad ?? scene3.heroPad ?? HERO_PAD));
    frameBox.min.z = hb.min.z; // nada abaixo da mesa
  }
  const frameCenter = frameBox.getCenter(new THREE.Vector3());
  const focusPoint = hero ? new THREE.Box3().setFromObject(hero).getCenter(new THREE.Vector3()) : frameCenter;
  group.rotation.copy(TO_Y_UP);
  scene.add(group);
  const floor = table(opts.backdrop ?? "wood", span, scene3.floorZ ?? box.min.z, yUp(center), scene3.darkTable); // Z da mesa vira Y

  scene.add(floor);

  // câmera baixa, de lado, olhando o centro das peças; enquadra em Z para cima e converte para Y para cima
  const el = ((opts.elevation ?? scene3.elevation ?? (top ? TOP_ELEVATION_DEG : ELEVATION_DEG)) * Math.PI) / 180, az = ((opts.azimuth ?? (top ? 0 : AZIMUTH_DEG)) * Math.PI) / 180;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el));
  const probe = new THREE.PerspectiveCamera(FOV_DEG, w / h, 0.1, span * 50);
  fitCamera(probe, frameBox, dir, MARGIN);
  const camera = new PhysicalCamera(FOV_DEG, w / h, span * 0.05, span * 80);
  // o fitCamera desloca o alvo na tela para centrar a caixa: o ponto olhado é onde o eixo da câmera passa mais perto do centro
  const fwd = probe.getWorldDirection(new THREE.Vector3());
  const target = yUp(probe.position.clone().addScaledVector(fwd, frameCenter.clone().sub(probe.position).dot(fwd)));
  const focus = yUp(focusPoint); // foco na peça principal
  camera.position.copy(yUp(probe.position));
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.setFocalLength(FOCAL_MM);
  camera.fStop = opts.fStop ?? (top ? TOP_F_STOP : F_STOP);
  camera.focusDistance = camera.position.distanceTo(focus);
  camera.updateMatrixWorld();
  if (opts.wall ?? (!top && opts.backdrop !== "studio")) {
    const toCam = camera.position.clone().sub(target).setY(0).normalize(); // horizontal, da peça para a câmera
    scene.add(brickWall(target.clone().addScaledVector(toCam, -span * WALL_FACTOR).setY(floor.position.y), toCam));
  }

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
export async function renderPhoto(scene3: PhotoScene, opts: PhotoOpts = {}): Promise<{ url: string; ms: number; samples: number; setupMs: number; gpu: string }> {
  const s0 = performance.now();
  await preloadStage();
  const photo = createPhoto(scene3, opts);
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
export async function warmUp(scene3: PhotoScene, opts: PhotoOpts = {}): Promise<void> {
  await renderPhoto(scene3, { ...opts, w: 32, h: 24, samples: 2 });
}
