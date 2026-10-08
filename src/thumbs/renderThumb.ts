import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { loadFont } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import type { ModelCtx } from "../geometry/models/common";
import { testArt } from "../geometry/models/sampleArt";
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
const MIN_LIGHTNESS = 0.06; // preto vira grafite escuro (continua preto); o rim separa do card escuro

/** Entradas que alguns modelos exigem para não abrir vazios. */
const INPUTS: Record<string, Params> = { pix: { key: "loja@upvision.app", name: "Minha Loja", city: "Sao Paulo" }, coaster: { faceDown: false, text: "Café", borderWidth: 2 }, bigFrame: { artW: 150, artH: 190, width: 22, claws: false, back: "none", bodyColor: "#8b5a2b" } }; // a miniatura mostra a moldura inteira (uma peça), não as peças soltas // o porta-copos imprime com o desenho na mesa: na miniatura ele aparece em cima

async function buildModels(id: string): Promise<Model[]> {
  const def = MODELS.find((m) => m.id === id);
  if (!def) throw new Error(`Modelo ${id} não existe`);
  const M = await getManifold();
  const p = { ...def.defaults, ...INPUTS[id] };
  const fields = def.sections.flatMap((s) => s.fields);
  const font = await loadFont("hanken");
  const extra = Object.fromEntries(await Promise.all(fields.filter((f) => f.kind === "font").map(async (f) => [f.k, await loadFont(String(p[f.k]))] as const)));
  const ctx: ModelCtx = {
    M,
    art: def.art ? testArt(M) : null,
    artLayers: null,
    text: (s, h) => (s.trim() ? textToCrossSection(M, font, s, h) : null),
    arc: (s, h, r, side) => (s.trim() ? arcTextToCrossSection(M, font, s, h, r, side) : null),
    fontText: (k) => (s, h) => (s.trim() ? textToCrossSection(M, extra[k] ?? font, s, h) : null),
    offset: () => [0, 0],
  };
  return def.build(ctx, p).models;
}

function material(color: string): THREE.MeshPhysicalMaterial {
  // PLA: plástico fosco com um brilho leve, sem metal. Só na miniatura, o preto clareia até um grafite.
  const c = new THREE.Color(color);
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  if (hsl.l < MIN_LIGHTNESS) c.setHSL(hsl.h, hsl.s, MIN_LIGHTNESS);
  return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.6, metalness: 0, specularIntensity: 0.6, clearcoat: 0.1, clearcoatRoughness: 0.5 });
}

/** Desenha os modelos e devolve a imagem (WebP com transparência, data URL). */
export function renderModels(models: Model[], w = THUMB_W, h = THUMB_H): string {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
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
  key.position.copy(center).add(new THREE.Vector3(-0.6, -0.9, 1.7).multiplyScalar(span * 2));
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
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(span * 6, span * 6), new THREE.ShadowMaterial({ opacity: 0.14 }));
  floor.position.set(center.x, center.y, box.min.z - 0.01);
  floor.receiveShadow = true;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(THUMB_VIEW.fov, w / h, 0.1, span * 50);
  fitCamera(camera, box, THUMB_VIEW.dir, THUMB_VIEW.margin);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/webp", 0.86);
  // limpa a GPU: são dezenas de miniaturas na mesma página
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    (mesh.material as THREE.Material | undefined)?.dispose?.();
  });
  floor.geometry.dispose();
  (floor.material as THREE.Material).dispose();
  scene.environment?.dispose();
  pmrem.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}

/** Miniatura de um modelo pelo id (valores padrão). */
export async function renderThumb(id: string): Promise<string> {
  return renderModels(await buildModels(id));
}

export const thumbIds = () => MODELS.map((m) => m.id);
