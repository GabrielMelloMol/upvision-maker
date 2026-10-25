import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { loadFont } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import type { ModelCtx } from "../geometry/models/common";
import { testArt, testArtLayers } from "../geometry/models/sampleArt";
import { arcTextToCrossSection, textToCrossSection } from "../geometry/text";
import type { Model } from "../geometry/types";
import { MODELS, type Params } from "../tools/models/defs";
import { fitCamera, THUMB_VIEW } from "./frame";

/*
 * Miniaturas dos Modelos prontos (#149): render com o three.js do app, fundo transparente (o card dá o fundo e
 * acompanha claro/escuro), sem a grade da mesa, câmera ¾ padronizada com enquadramento automático, luz de estúdio
 * suave (ambiente + key, fill e rim) com sombra de contato e material tipo PLA. Roda no navegador (npm run thumbs).
 */
export const THUMB_W = 640;
export const THUMB_H = 480;
const CREASE = (35 * Math.PI) / 180; // quinas vivas acima disso; curvas suaves abaixo
const ENV_INTENSITY = 0.35; // reflexo suave do estúdio; mais que isso o preto vira cinza
const EDGE_DEG = 40; // contorno só nas quinas
const EDGE_OPACITY = 0.2; // traço fino e translúcido: peça branca não some no card claro
const STUDIO_SHADOW = 0.42; // sombra de contato da vitrine: bem visível no fundo claro
const MIN_LIGHTNESS = 0.06; // preto vira grafite escuro (continua preto); o rim separa do card escuro

/** Entradas que alguns modelos exigem para não abrir vazios. */
/** Modelos em que o texto é o destaque: a miniatura mostra o texto padrão, não o desenho de exemplo. */
const TEXT_THUMBS = new Set(["gymDumbbell", "gymKettlebell", "paperClip", "bookThumb", "bookStand", "stampMold"]);
const INPUTS: Record<string, Params> = { organizerBox: { boxColor: "#0f9d8a", lidColor: "#fbf3df", decorColor: "#0f9d8a" },  pix: { key: "loja@upvision.app", name: "Minha Loja", city: "Sao Paulo" }, coaster: { faceDown: false, text: "Café", borderWidth: 2 }, musicCard: { code: "qr", codeLink: "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl", codeSize: 40 }, phoneStandFold: { layout: "assembled", text: "Ana", bodyColor: "#7c8ea6" }, bigFrame: { artW: 150, artH: 190, width: 22, claws: false, back: "none", bodyColor: "#8b5a2b" }, micHolder: { handleColor: "#1c1c1e" } };

export async function buildModels(id: string, patch: Params = {}, view = "closed"): Promise<Model[]> {
  const def = MODELS.find((m) => m.id === id);
  if (!def) throw new Error(`Modelo ${id} não existe`);
  const M = await getManifold();
  const p = { ...def.defaults, ...INPUTS[id], ...patch };
  const fields = def.sections.flatMap((s) => s.fields);
  const font = await loadFont("hanken");
  const extra = Object.fromEntries(await Promise.all(fields.filter((f) => f.kind === "font").map(async (f) => [f.k, await loadFont(String(p[f.k]))] as const)));
  const ctx: ModelCtx = {
    M,
    art: def.art && !TEXT_THUMBS.has(def.id) ? testArt(M) : null,
    artLayers: def.art && def.artColors ? testArtLayers(M) : null,
    text: (s, h) => (s.trim() ? textToCrossSection(M, font, s, h) : null),
    arc: (s, h, r, side) => (s.trim() ? arcTextToCrossSection(M, font, s, h, r, side) : null),
    fontText: (k) => (s, h) => (s.trim() ? textToCrossSection(M, extra[k] ?? font, s, h) : null),
    offset: () => [0, 0],
  };
  const out = def.build(ctx, p);
  // modelos com vistas (caixa organizadora): a miniatura mostra a peça pronta, fechada, não as peças soltas na mesa
  return out.views?.find((v) => v.id === view)?.models ?? out.models;
}

/*
 * Cores da galeria (#211): quase todo modelo sai preto e branco; na vitrine, cada um ganha um par de cores de uma paleta
 * (escuro → cor principal, claro → tom suave), sempre o mesmo para o mesmo id. Modelo que já tem cor própria (azul,
 * vermelho, dourado...) fica como está. A peça real continua com a cor que a pessoa escolher.
 */
const PALETTES: { main: string; soft: string }[] = [
  { main: "#0f9d8a", soft: "#fbf3df" },
  { main: "#e8613c", soft: "#fff6ea" },
  { main: "#4f46e5", soft: "#eef0ff" },
  { main: "#3f9b5f", soft: "#f6f1de" },
  { main: "#c9317a", soft: "#fff0f6" },
  { main: "#2f9bd8", soft: "#ffffff" },
  { main: "#8b5cf6", soft: "#f4f0ff" },
  { main: "#e0a21c", soft: "#fffbea" },
];
const NEUTRAL_DARK = new Set(["#1c1c1e"]);
const NEUTRAL_LIGHT = new Set(["#f8f8f6", "#ffffff", "#f4f4f2"]);
export function showcaseColors(id: string, models: Model[]): Model[] {
  const colors = new Set(models.flatMap((m) => m.parts.map((p) => p.color.toLowerCase())));
  const hasDark = [...colors].some((c) => NEUTRAL_DARK.has(c));
  const hasLight = [...colors].some((c) => NEUTRAL_LIGHT.has(c));
  if (!hasDark && !hasLight) return models;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pal = PALETTES[h % PALETTES.length];
  const swap = (c: string) => {
    const k = c.toLowerCase();
    if (NEUTRAL_DARK.has(k)) return pal.main;
    if (NEUTRAL_LIGHT.has(k)) return hasDark ? pal.soft : pal.main; // peça de uma cor só: a principal
    return c;
  };
  return models.map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p, color: swap(p.color) })) }));
}

function material(color: string): THREE.MeshPhysicalMaterial {
  // PLA: plástico fosco com um brilho leve, sem metal. Só na miniatura, o preto clareia até um grafite.
  const c = new THREE.Color(color);
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  if (hsl.l < MIN_LIGHTNESS) c.setHSL(hsl.h, hsl.s, MIN_LIGHTNESS);
  return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.6, metalness: 0, specularIntensity: 0.6, clearcoat: 0.1, clearcoatRoughness: 0.5 });
}

/** Desenha os modelos e devolve a imagem (WebP com transparência, data URL). */
export type ShotOpts = { dir?: THREE.Vector3; fov?: number; margin?: number; /** cor opaca do fundo (padrão: transparente) */ background?: number; /** fundo de estúdio: degradê claro com a sombra da peça mais marcada */ studio?: boolean; png?: boolean };

/** Fundo de estúdio: claro no centro, um pouco mais fechado nas bordas (vinheta suave). */
function studioBackdrop(w: number, h: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.hypot(w, h) / 1.6);
  grad.addColorStop(0, "#fafbfc");
  grad.addColorStop(1, "#d9dde4");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function renderModels(models: Model[], w = THUMB_W, h = THUMB_H, opts: ShotOpts = {}): string {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.setClearColor(opts.background ?? 0x000000, opts.background === undefined ? 0 : 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const backdrop = opts.studio ? studioBackdrop(w, h) : null;
  if (backdrop) scene.background = backdrop;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // com scene.environment, quem vale é a intensidade da cena (a do material só serve para material.envMap)
  scene.environmentIntensity = ENV_INTENSITY;
  const group = new THREE.Group();
  for (const m of models)
    for (const part of m.parts) {
      let g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(part.mesh.positions, 3));
      g.setIndex(new THREE.BufferAttribute(part.mesh.indices, 1));
      g = toCreasedNormals(g, CREASE);
      const mesh = new THREE.Mesh(g, material(part.color));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh, new THREE.LineSegments(new THREE.EdgesGeometry(g, EDGE_DEG), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: EDGE_OPACITY })));
    }
  scene.add(group);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1);
  // luz de estúdio: key (sombra), fill do outro lado e rim de trás para destacar o contorno
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  // key alta: sombra curta, embaixo da peça (sombra de contato, não uma mancha comprida)
  key.position.copy(center).add((opts.studio ? new THREE.Vector3(-0.9, -0.7, 1.2) : new THREE.Vector3(-0.6, -0.9, 1.7)).multiplyScalar(span * 2));
  key.target.position.copy(center);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 10;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0004;
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -span;
  sc.right = sc.top = span;
  sc.near = 0.1;
  sc.far = span * 6;
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.copy(center).add(new THREE.Vector3(1.2, -0.4, 0.5).multiplyScalar(span * 2));
  // dois rims por trás, um de cada lado: contorno claro que separa a peça escura do fundo escuro
  const rim = new THREE.DirectionalLight(0xffffff, 1.0);
  rim.position.copy(center).add(new THREE.Vector3(0.6, 1.4, 0.2).multiplyScalar(span * 2)); // rasante: só o contorno, não o topo
  const rim2 = new THREE.DirectionalLight(0xffffff, 0.6);
  rim2.position.copy(center).add(new THREE.Vector3(-1.2, 1.0, 0.15).multiplyScalar(span * 2));
  scene.add(key, key.target, fill, rim, rim2, new THREE.HemisphereLight(0xffffff, 0xd8dce4, 0.2));
  // sombra de contato: só a sombra aparece, o chão some (fundo transparente)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(span * 6, span * 6), new THREE.ShadowMaterial({ opacity: opts.studio ? STUDIO_SHADOW : 0.14 }));
  floor.position.set(center.x, center.y, box.min.z - 0.01);
  floor.receiveShadow = true;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(opts.fov ?? THUMB_VIEW.fov, w / h, 0.1, span * 50);
  fitCamera(camera, box, opts.dir ?? THUMB_VIEW.dir, opts.margin ?? THUMB_VIEW.margin);
  renderer.render(scene, camera);
  const url = opts.png ? renderer.domElement.toDataURL("image/png") : renderer.domElement.toDataURL("image/webp", 0.86);
  // limpa a GPU: são dezenas de miniaturas na mesma página
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    (mesh.material as THREE.Material | undefined)?.dispose?.();
  });
  floor.geometry.dispose();
  (floor.material as THREE.Material).dispose();
  scene.environment?.dispose();
  backdrop?.dispose();
  pmrem.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}

/** Miniatura de um modelo pelo id (valores padrão). */
export async function renderThumb(id: string): Promise<string> {
  return renderModels(showcaseColors(id, await buildModels(id)), THUMB_W, THUMB_H, { studio: true });
}

export const thumbIds = () => MODELS.map((m) => m.id);
