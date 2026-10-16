import * as THREE from "three";

/*
 * Peças que não são impressas, só enfeitam a cena da foto (#251): argola e corrente de metal, fita da medalha, parafusos
 * da caixa. Z para cima, mm, na posição da peça (quem monta a cena move o grupo junto com a peça).
 */
export const metal = () => new THREE.MeshPhysicalMaterial({ color: 0xd5d8de, metalness: 1, roughness: 0.24 });
const fabric = (color: string) => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0 });

const RING_R = 12;
const RING_WIRE = 0.9;
const RING_TILT_DEG = 25;
const BEAD_R = 1.1;
const BEAD_STEP = 2.5;
const CHAIN_BEADS = 28;

/** Argola e corrente de bolinhas saindo do furo da peça `hole` (centro do furo, z do meio da placa). A corrente cai para `heading` (graus, 180 = para −x). */
export function ringAndChain(hole: THREE.Vector3, heading = 180, wobble = 0.35): THREE.Group {
  const g = new THREE.Group();
  const t = (RING_TILT_DEG * Math.PI) / 180;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, RING_WIRE, 14, 56), metal());
  ring.rotation.x = Math.PI / 2; // anel no plano XZ
  ring.position.set(hole.x - RING_R * Math.cos(t), hole.y, hole.z + RING_R * Math.sin(t));
  g.add(ring);
  // corrente: bolinhas numa curva suave rente à mesa, a partir de onde a argola encosta nela
  const h = (heading * Math.PI) / 180;
  let a = h;
  let x = hole.x - 2 * RING_R * Math.cos(t) - 2, y = hole.y;
  const bead = new THREE.SphereGeometry(BEAD_R, 14, 10);
  for (let i = 0; i < CHAIN_BEADS; i++) {
    const m = new THREE.Mesh(bead, metal());
    m.position.set(x, y, BEAD_R);
    g.add(m);
    a += Math.sin(i * 0.5) * wobble * 0.18;
    x += Math.cos(a) * BEAD_STEP;
    y += Math.sin(a) * BEAD_STEP;
  }
  return g;
}

const RIBBON_THICK = 0.7;
const RIBBON_LEN = 95;

/** Fita saindo do furo da medalha: duas tiras em V, abertas para +y, passando pelo furo (z de meio da alça). */
export function ribbonV(slot: THREE.Vector3, width: number, color: string, spreadDeg = 14): THREE.Group {
  const g = new THREE.Group();
  const mat = fabric(color);
  for (const s of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, RIBBON_LEN, RIBBON_THICK), mat);
    strip.geometry.translate(0, RIBBON_LEN / 2, 0); // a ponta da tira fica na origem
    strip.position.copy(slot);
    strip.rotation.z = s * (spreadDeg * Math.PI) / 180;
    strip.position.x += s * width * 0.25;
    g.add(strip);
  }
  return g;
}

/** Parafusos e porcas, um por ponto (centro de nicho da caixa), sobre a base `z`. Determinístico. */
export function hardwareAt(points: [number, number][], z: number): THREE.Group {
  const g = new THREE.Group();
  const steel = metal();
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xcaa24a, metalness: 1, roughness: 0.3 });
  let seed = 5;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  points.forEach(([x, y], i) => {
    if (i % 4 === 3) return; // nicho vazio
    const nut = i % 3 === 0;
    const geo = nut ? new THREE.CylinderGeometry(3.4, 3.4, 2.6, 6) : new THREE.CylinderGeometry(1.4, 1.4, 11, 12);
    const m = new THREE.Mesh(geo, nut ? brass : steel);
    if (nut) {
      m.rotation.x = Math.PI / 2; // porca deitada: eixo em z
      m.position.set(x + (rnd() - 0.5) * 4, y + (rnd() - 0.5) * 4, z + 1.3);
    } else {
      m.rotation.z = Math.PI / 2 + (rnd() - 0.5) * 1.2; // parafuso deitado, em qualquer direção
      m.position.set(x + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 3, z + 1.4);
    }
    g.add(m);
  });
  return g;
}
