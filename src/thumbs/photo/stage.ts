import * as THREE from "three";
import { ProceduralEquirectTexture } from "three-gpu-pathtracer";

/*
 * Cena de estúdio da foto realista (#251), tudo gerado no app (sem HDRI de arquivo, sem internet): luz de caixas
 * suaves (key à esquerda, fill à direita, tira no topo, recorte de trás) e uma mesa branca ou de madeira clara.
 * A cena fica em Y para cima (como o ambiente do path tracer); as peças chegam em Z para cima e giram na entrada.
 */
export type Backdrop = "studio" | "wood";

type Box = { dir: THREE.Vector3; radius: number; power: number; tint?: THREE.Color };
const unit = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();
const BOXES: Box[] = [
  { dir: unit(-0.85, 0.5, 0.55), radius: 0.3, power: 10 }, // key
  { dir: unit(1, 0.35, 0.5), radius: 0.6, power: 1.0 }, // fill
  { dir: unit(0, 1, 0.1), radius: 0.4, power: 0.5 }, // tira de cima
  { dir: unit(0.3, 0.55, -1), radius: 0.22, power: 4 }, // recorte de trás: brilho de borda
];
const SKY = 0.07; // luz de fundo do estúdio (paredes claras)
const SOFT_EDGE = 0.22; // borda da caixa de luz: quanto maior, mais suave a sombra

/** Ambiente: paredes claras e quatro caixas de luz com borda macia. */
export function studioEnvironment(): ProceduralEquirectTexture {
  const tex = new ProceduralEquirectTexture(512, 256);
  const dir = new THREE.Vector3();
  tex.generationCallback = (polar, _uv, _coord, target) => {
    dir.setFromSpherical(polar);
    const floorFade = dir.y < 0 ? 0.35 : 1;
    let v = SKY * (0.7 + 0.3 * Math.max(0, dir.y)) * floorFade;
    for (const b of BOXES) {
      const ang = Math.acos(Math.min(1, dir.dot(b.dir)));
      const k = THREE.MathUtils.smoothstep(ang, b.radius, b.radius * (1 - SOFT_EDGE));
      v += b.power * k;
    }
    target.setRGB(v * 1.0, v * 0.99, v * 0.96); // luz levemente quente
  };
  tex.update();
  return tex;
}

/** Madeira clara (carvalho): veios longos, a textura repete a cada 400 mm. */
function woodTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d8b98c";
  g.fillRect(0, 0, S, S);
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 260; i++) {
    const y = rnd() * S;
    const amp = 2 + rnd() * 6;
    const ph = rnd() * 6.28;
    g.strokeStyle = `rgba(${150 + rnd() * 30},${105 + rnd() * 30},${60 + rnd() * 25},${0.05 + rnd() * 0.16})`;
    g.lineWidth = 0.6 + rnd() * 2.6;
    g.beginPath();
    for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x / 90 + ph) * amp);
    g.stroke();
  }
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(255,240,215,${0.05 + rnd() * 0.06})`;
    g.fillRect(0, rnd() * S, S, 20 + rnd() * 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Mesa abaixo da peça (Y para cima): branca de estúdio ou madeira clara. */
export function table(kind: Backdrop, span: number, y: number, center: THREE.Vector3): THREE.Mesh {
  const size = span * 120;
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  let mat: THREE.MeshPhysicalMaterial;
  if (kind === "wood") {
    const map = woodTexture();
    map.repeat.set(size / 400, size / 400);
    // sem verniz (clearcoat): o WebKit do app não compila o shader do path tracer com ele
    mat = new THREE.MeshPhysicalMaterial({ map, roughness: 0.55, metalness: 0, specularIntensity: 0.4 });
  } else mat = new THREE.MeshPhysicalMaterial({ color: 0xc3c7cf, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(center.x, y, center.z);
  return mesh;
}
