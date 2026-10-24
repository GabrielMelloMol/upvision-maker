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
const DOWEL_R = 5;
const wood = () => new THREE.MeshPhysicalMaterial({ color: 0xa88a64, roughness: 0.55, metalness: 0 });

/** Cabide de medalhas: barra de madeira na altura `height`, na direção `axisDeg` (graus no plano da mesa), apoiada em dois pés até a mesa (z = 0). */
export function dowelRack(origin: [number, number], axisDeg: number, halfLen: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const a = (axisDeg * Math.PI) / 180;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(DOWEL_R, DOWEL_R, halfLen * 2, 24), wood());
  bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), Math.sin(a), 0)); // o cilindro nasce ao longo de Y
  bar.position.set(origin[0], origin[1], height);
  g.add(bar);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(12, 12, height + DOWEL_R * 2), wood());
    post.rotation.z = a;
    post.position.set(origin[0] + Math.cos(a) * (halfLen + 6) * s, origin[1] + Math.sin(a) * (halfLen + 6) * s, (height + DOWEL_R * 2) / 2 - DOWEL_R);
    g.add(post);
  }
  return g;
}

/** Fita pendurada: desce da barra (por cima dela, pela frente) até o furo da medalha. `slot` é o ponto do furo (x, y, z); `azDeg` aponta a frente da medalha. */
export function hangingRibbon(slot: THREE.Vector3, barZ: number, width: number, color: string, azDeg: number, axisDeg: number): THREE.Group {
  const g = new THREE.Group();
  const mat = fabric(color);
  const rot = (azDeg * Math.PI) / 180;
  const n = new THREE.Vector2(Math.sin(rot), -Math.cos(rot)); // da barra para a câmera
  const down = new THREE.Mesh(new THREE.BoxGeometry(width, RIBBON_THICK, barZ - slot.z), mat);
  down.position.set(slot.x, slot.y, (barZ + slot.z) / 2);
  down.rotation.z = rot;
  const dowelXY = [slot.x - n.x * (DOWEL_R + 0.5), slot.y - n.y * (DOWEL_R + 0.5)];
  const axis = (axisDeg * Math.PI) / 180;
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(DOWEL_R + 0.5, DOWEL_R + 0.5, width, 24, 1, true), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.85, side: THREE.DoubleSide })); // a fita dá a volta na barra
  wrap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(axis), Math.sin(axis), 0));
  wrap.position.set(dowelXY[0], dowelXY[1], barZ);
  g.add(down, wrap);
  return g;
}

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
