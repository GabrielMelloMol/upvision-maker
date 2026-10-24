import * as THREE from "three";

/*
 * Material de filamento para a foto realista (#251): PLA fosco, PLA silk e PETG. As linhas de camada são um normal map
 * procedural de uma textura só (faixas): nas paredes a faixa tem a altura da camada (v = z ÷ camada), na face de cima
 * tem a largura do traço do bico (v = posição ao longo da linha). Um grão leve ao longo da faixa dá a aspereza.
 */
export type Filament = "pla" | "silk" | "petg";
export const FILAMENT_LABELS: Record<Filament, string> = { pla: "PLA fosco", silk: "PLA silk", petg: "PETG" };

export const LAYER_MM = 0.2;
export const TOP_LINE_MM = 0.42;
const STRIPE_PX = 24; // altura da faixa (uma camada)
export const LAYER_ROWS = 12; // camadas diferentes na textura: cada uma com a sua força (imperfeição, sem repetir a cada 0,2 mm)
const GRAIN_PX = 128; // largura (ao longo da camada): o grão não repete de forma óbvia
const TOP_NZ = 0.5; // acima disso o triângulo é face de cima/baixo
const SLOPE = 2.4; // inclinação máxima da normal na camada (quanto mais, mais marcada)
const GRAIN = 0.12; // grão ao longo da linha
const ROW_VARIATION = 0.45; // quanto a força de cada camada varia (± fração)

let cachedNormal: THREE.CanvasTexture | null = null;

/** Normal map das camadas: perfil arredondado por camada (v) com grão leve (u). Sem espaço de cor (é dado). */
export function layerNormalMap(): THREE.CanvasTexture {
  if (cachedNormal) return cachedNormal;
  const c = document.createElement("canvas");
  c.width = GRAIN_PX;
  c.height = STRIPE_PX * LAYER_ROWS;
  const g = c.getContext("2d")!;
  const img = g.createImageData(GRAIN_PX, STRIPE_PX * LAYER_ROWS);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let row = 0; row < LAYER_ROWS; row++) {
    const strength = 1 + rnd() * ROW_VARIATION; // camada mais ou menos marcada
    const shift = rnd() * 0.12; // e levemente deslocada
    for (let y = 0; y < STRIPE_PX; y++) {
      const t = (y + 0.5) / STRIPE_PX;
      const slope = Math.cos(Math.PI * (t + shift)) * SLOPE * 0.5 * strength;
      for (let x = 0; x < GRAIN_PX; x++) {
        const nx = rnd() * GRAIN;
        const ny = -slope / 2 + rnd() * GRAIN * 0.5;
        const len = Math.hypot(nx, ny, 1);
        const i = ((row * STRIPE_PX + y) * GRAIN_PX + x) * 4;
        img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  cachedNormal = t;
  return t;
}

/** Uma cor sRGB de filamento (preto vira grafite: peça preta sem brilho fica um buraco na foto). */
function paint(color: string): THREE.Color {
  const c = new THREE.Color(color);
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  const sat = Math.min(1, hsl.s * SATURATE); // foto de produto: cores vivas, o filamento real é mais saturado que o hex da tela
  c.setHSL(hsl.h, sat, Math.max(hsl.l, 0.045));
  return c;
}

const SATURATE = 1.12;
const TOP_NORMAL = 0.3; // as linhas do bico na face de cima: bem mais leves que as camadas da parede

export function filamentMaterial(kind: Filament, color: string, top = false): THREE.MeshPhysicalMaterial {
  const base = { color: paint(color), normalMap: layerNormalMap(), normalScale: new THREE.Vector2(1, 1).multiplyScalar(top ? TOP_NORMAL : 1) };
  if (kind === "silk") {
    // silk: acetinado com reflexo largo e cor funda (metal leve)
    const deep = paint(color).multiplyScalar(0.8);
    return new THREE.MeshPhysicalMaterial({ ...base, color: deep, roughness: 0.32, metalness: 0.3 });
  }
  if (kind === "petg") {
    // PETG: liso e brilhante, reflexo nítido da caixa de luz (sem clearcoat: o WebKit do app não compila o shader com ele)
    return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.14, metalness: 0, ior: 1.57, specularIntensity: 1 });
  }
  return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.58, metalness: 0, specularIntensity: 0.55 });
}

/** Parte a geometria (sem índice) em paredes e faces de cima/baixo, que levam materiais com intensidades diferentes. */
export function splitTops(g: THREE.BufferGeometry): { walls: THREE.BufferGeometry | null; tops: THREE.BufferGeometry | null } {
  const pos = g.getAttribute("position"), nor = g.getAttribute("normal");
  const keep: Record<"walls" | "tops", number[]> = { walls: [], tops: [] };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), N = new THREE.Vector3(), e = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t);
    b.fromBufferAttribute(pos, t + 1);
    c.fromBufferAttribute(pos, t + 2);
    N.crossVectors(b.sub(a), e.subVectors(c, a)).normalize();
    keep[Math.abs(N.z) > TOP_NZ ? "tops" : "walls"].push(t, t + 1, t + 2);
  }
  const make = (idx: number[]) => {
    if (!idx.length) return null;
    const out = new THREE.BufferGeometry();
    for (const [name, attr] of [["position", pos], ["normal", nor]] as const) {
      const arr = new Float32Array(idx.length * 3);
      idx.forEach((v, i) => { arr[i * 3] = attr.getX(v); arr[i * 3 + 1] = attr.getY(v); arr[i * 3 + 2] = attr.getZ(v); });
      out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
    }
    return out;
  };
  return { walls: make(keep.walls), tops: make(keep.tops) };
}

/**
 * UV por triângulo: parede → u ao longo da parede, v = z ÷ camada; face de cima/baixo → v = posição perpendicular às
 * linhas do bico (a 45°, como o fatiador faz nas faces de cima), u ao longo delas. Exige geometria sem índice.
 */
export function layerUVs(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute("position");
  const n = pos.count;
  const uv = new Float32Array(n * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), N = new THREE.Vector3();
  const P = [a, b, c];
  const LINE = Math.SQRT1_2;
  for (let t = 0; t < n; t += 3) {
    for (let k = 0; k < 3; k++) P[k].fromBufferAttribute(pos, t + k);
    N.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
    const top = Math.abs(N.z) > TOP_NZ;
    for (let k = 0; k < 3; k++) {
      const p = P[k];
      if (top) {
        uv[(t + k) * 2] = (p.x * LINE - p.y * LINE) / 20; // ao longo da linha (grão)
        uv[(t + k) * 2 + 1] = (p.x * LINE + p.y * LINE) / (TOP_LINE_MM * LAYER_ROWS);
      } else {
        const len = Math.hypot(N.x, N.y) || 1;
        uv[(t + k) * 2] = (p.x * (-N.y / len) + p.y * (N.x / len)) / 20;
        uv[(t + k) * 2 + 1] = p.z / (LAYER_MM * LAYER_ROWS);
      }
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}
