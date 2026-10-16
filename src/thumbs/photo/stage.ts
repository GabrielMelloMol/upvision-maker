import * as THREE from "three";
import { ProceduralEquirectTexture } from "three-gpu-pathtracer";

/*
 * Cena da foto realista (#251), tudo gerado no app (sem HDRI de arquivo, sem internet): luz de janela quente do lado,
 * contraluz suave, preenchimento frio e baixo; mesa de madeira (ou branca de estúdio) e, atrás, parede de tijolo branco.
 * A cena fica em Y para cima (como o ambiente do path tracer); as peças chegam em Z para cima e giram na entrada.
 */
export type Backdrop = "studio" | "wood";

type Box = { dir: THREE.Vector3; radius: number; power: number; tint: [number, number, number] };
const unit = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();
const WARM: [number, number, number] = [1, 0.87, 0.7];
const COOL: [number, number, number] = [0.78, 0.88, 1];
const NEUTRAL: [number, number, number] = [1, 1, 1];
const BOXES: Box[] = [
  { dir: unit(-1, 0.38, 0.22), radius: 0.42, power: 11, tint: WARM }, // janela à esquerda, baixa: luz lateral
  { dir: unit(0.9, 0.25, 0.55), radius: 0.7, power: 0.9, tint: COOL }, // preenchimento frio do lado oposto
  { dir: unit(0, 1, 0.1), radius: 0.35, power: 1.1, tint: NEUTRAL }, // teto
  { dir: unit(-0.35, 0.5, -1), radius: 0.22, power: 4, tint: WARM }, // contraluz: brilho de borda
];
const SKY = 0.06; // luz de fundo do ambiente
const SOFT_EDGE = 0.22; // borda da caixa de luz: quanto maior, mais suave a sombra

/** Ambiente: quarto escuro com uma janela quente e três luzes de apoio, bordas macias. */
export function studioEnvironment(): ProceduralEquirectTexture {
  const tex = new ProceduralEquirectTexture(512, 256);
  const dir = new THREE.Vector3();
  tex.generationCallback = (polar, _uv, _coord, target) => {
    dir.setFromSpherical(polar);
    const ground = dir.y < 0 ? 0.4 : 1;
    let r = SKY * 0.9 * ground, g = SKY * ground, b = SKY * 1.1 * ground;
    for (const box of BOXES) {
      const ang = Math.acos(Math.min(1, dir.dot(box.dir)));
      const k = box.power * THREE.MathUtils.smoothstep(ang, box.radius, box.radius * (1 - SOFT_EDGE));
      r += k * box.tint[0];
      g += k * box.tint[1];
      b += k * box.tint[2];
    }
    target.setRGB(r, g, b);
  };
  tex.update();
  return tex;
}

/** Madeira clara viva: veio forte, tons de mel a castanho, emendas de tábua. A textura repete a cada 400 mm. */
function woodTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#c79a68";
  g.fillRect(0, 0, S, S);
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let band = 0; band < 6; band++) {
    g.fillStyle = `rgba(${190 + rnd() * 35},${150 + rnd() * 30},${105 + rnd() * 30},${0.1 + rnd() * 0.12})`;
    g.fillRect(0, (band / 6) * S, S, S / 6);
  }
  for (let i = 0; i < 220; i++) {
    const y = rnd() * S;
    const amp = 2 + rnd() * 7;
    const ph = rnd() * 6.28;
    g.strokeStyle = `rgba(${85 + rnd() * 35},${60 + rnd() * 25},${35 + rnd() * 20},${0.1 + rnd() * 0.24})`;
    g.lineWidth = 0.5 + rnd() * 2.4;
    g.beginPath();
    for (let x = 0; x <= S; x += 12) g.lineTo(x, y + Math.sin(x / 70 + ph) * amp);
    g.stroke();
  }
  g.fillStyle = "rgba(60,32,10,0.45)"; // emenda entre tábuas
  g.fillRect(0, S / 2 - 1, S, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Tijolo branco pintado: fiadas desencontradas, rejunte cinza, cada tijolo com um tom. Repete a cada 4 fiadas × 4 tijolos. */
function brickTexture(): THREE.CanvasTexture {
  const W = 512, H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b9b4aa";
  g.fillRect(0, 0, W, H);
  let seed = 3;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const bw = W / 4, bh = H / 4, joint = 5;
  for (let row = 0; row < 4; row++)
    for (let col = -1; col < 5; col++) {
      const v = 226 + rnd() * 20;
      g.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
      g.fillRect(col * bw + (row % 2 ? bw / 2 : 0) + joint / 2, row * bh + joint / 2, bw - joint, bh - joint);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const WOOD_TILE_MM = 400;
const BRICK_TILE_MM = 260; // uma repetição da textura: 4 tijolos de 65 mm
const WALL_W = 4000;
const WALL_H = 1600;

/** Mesa abaixo da peça (Y para cima): madeira ou branca de estúdio. Sem clearcoat: o WebKit do app não compila o shader com ele. */
export function table(kind: Backdrop, span: number, y: number, center: THREE.Vector3): THREE.Mesh {
  const size = span * 120;
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  let mat: THREE.MeshPhysicalMaterial;
  if (kind === "wood") {
    const map = woodTexture();
    map.repeat.set(size / WOOD_TILE_MM, size / WOOD_TILE_MM);
    mat = new THREE.MeshPhysicalMaterial({ map, roughness: 0.5, metalness: 0, specularIntensity: 0.45 });
  } else mat = new THREE.MeshPhysicalMaterial({ color: 0xc3c7cf, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(center.x, y, center.z);
  return mesh;
}

/** Parede de tijolo branco: plano vertical em `position`, de frente para `facing` (direção horizontal, Y para cima). */
export function brickWall(position: THREE.Vector3, facing: THREE.Vector3): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(WALL_W, WALL_H);
  const map = brickTexture();
  map.repeat.set(WALL_W / BRICK_TILE_MM, WALL_H / (BRICK_TILE_MM / 2));
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map, roughness: 0.85, metalness: 0 }));
  mesh.position.copy(position).setY(position.y + WALL_H / 2 - 1);
  mesh.lookAt(mesh.position.clone().add(facing)); // a frente do plano (+z local) olha para a câmera
  return mesh;
}
