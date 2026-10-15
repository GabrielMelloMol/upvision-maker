import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * O símbolo da marca em 3D: o bico imprime 5 camadas (fio laranja, miolo azul, topo com contorno laranja),
 * a peça é embalada numa caixa kraft com fita azul e laço laranja e sai para entrega. Roda em loop.
 * Vem da animação do site da UpVision (mesma cena); aqui o tema segue o do app.
 */

const COLORS = {
  blue: 0x0244e6,
  orange: 0xf85a00,
  kraft: 0xd8b98c,
  dark: { ink: 0xd9def0, bed: 0x2a2e38, ground: 0x22252e, hemi: 1.6 },
  light: { ink: 0x141a2e, bed: 0x141a2e, ground: 0xbfbab0, hemi: 1.9 },
};

const L = 5; // camadas
const LH = 0.3; // altura da camada
const GAP = 0.09; // folga entre camadas
const S = 1.9; // lado do bloco
const TW = 0.26; // largura do fio
const H = L * (LH + GAP) - GAP;
const NOZZLE_BASE = LH; // altura do bico na primeira camada

/** linha do tempo (ms) */
const T = { print: 7600, lift: 700, drop: 1100, tie: 700, hold: 900, ship: 1300, back: 1100 };
const CYCLE = Object.values(T).reduce((a, b) => a + b);
/** parte de cada camada gasta desenhando o fio; o resto é a troca de andar */
const TRACE = 0.78;
/** quadro mostrado com movimento reduzido: peça impressa, antes de embalar */
export const STILL_MS = T.print + T.lift * 0.5;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

const corners = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
].map(([x, z]) => [x * (S / 2 - TW / 2), z * (S / 2 - TW / 2)] as const);

function nozzleAt(f: number): [number, number] {
  const e = Math.min(3, Math.floor(f * 4));
  const g = f * 4 - e;
  const [ax, az] = corners[e];
  const [bx, bz] = corners[(e + 1) % 4];
  return [ax + (bx - ax) * g, az + (bz - az) * g];
}

export function statusText(ms: number): string {
  let t = ms % CYCLE;
  if (t < T.print) return `Imprimindo camada ${Math.min(L, Math.floor((t / T.print) * L) + 1)} de ${L}…`;
  t -= T.print + T.lift;
  if (t < T.drop + T.tie) return "Embalando para presente…";
  t -= T.drop + T.tie;
  if (t < T.hold) return "Pronta e embalada.";
  t -= T.hold;
  if (t < T.ship) return "Pronta para entrega…";
  return "Pronta para a próxima peça.";
}

export function cycleProgress(ms: number): number {
  return (ms % CYCLE) / CYCLE;
}

export function createPrinterScene(canvas: HTMLCanvasElement, opts: { lite: boolean }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lite, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.lite ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
  camera.position.set(9.4, 7.6, 9.4);
  camera.lookAt(0, 1.75, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, COLORS.dark.ground, COLORS.dark.hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-4, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.lite ? 512 : 1024, opts.lite ? 512 : 1024);
  sun.shadow.radius = 4;
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
  // luz de recorte por trás: separa as bordas do fundo
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(6, 4, -7);
  scene.add(hemi, sun, rim);

  const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05 });
  const BLUE = mat(COLORS.blue);
  const ORANGE = mat(COLORS.orange);
  const INK = mat(COLORS.dark.ink);
  const BED = mat(COLORS.dark.bed);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const o = new THREE.Mesh(g, m);
    o.castShadow = o.receiveShadow = true;
    return o;
  };
  const box = (w: number, h: number, d: number, m: THREE.Material) => mesh(new THREE.BoxGeometry(w, h, d), m);
  const rounded = (w: number, h: number, d: number, r: number, m: THREE.Material) =>
    mesh(new RoundedBoxGeometry(w, h, d, 3, r), m);

  const bed = rounded(3.3, 0.2, 3.3, 0.06, BED);
  bed.position.y = -0.11;
  scene.add(bed);

  // cada camada: 4 bordas (o fio) + o miolo, que preenche quando a borda fecha
  const layers = Array.from({ length: L }, (_, i) => {
    const y = i * (LH + GAP) + LH / 2;
    const g = new THREE.Group();
    scene.add(g);
    const edges = Array.from({ length: 4 }, () => {
      const e = box(1, LH, TW, ORANGE);
      g.add(e);
      return e;
    });
    const fill = box(S + 0.012, LH + 0.008, S + 0.012, BLUE);
    fill.position.y = y;
    g.add(fill);
    return { g, edges, fill, y };
  });

  function drawEdges(layer: (typeof layers)[number], f: number) {
    layer.edges.forEach((m, e) => {
      const g = clamp(f * 4 - e);
      m.visible = g > 0;
      if (!m.visible) return;
      const [ax, az] = corners[e];
      const [bx, bz] = corners[(e + 1) % 4];
      const seg = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / seg;
      const dz = (bz - az) / seg;
      const len = (seg + TW) * g;
      m.scale.x = len;
      m.rotation.y = -Math.atan2(dz, dx);
      m.position.set(ax - (dx * TW) / 2 + (dx * len) / 2, layer.y, az - (dz * TW) / 2 + (dz * len) / 2);
    });
  }

  // pórtico: trilho que sobe com a peça + carrinho + bico
  const gantry = new THREE.Group();
  scene.add(gantry);
  const rail = rounded(4.4, 0.18, 0.18, 0.05, INK);
  rail.position.y = 1.15;
  const car = new THREE.Group();
  gantry.add(rail, car);
  const head = rounded(0.62, 0.55, 0.62, 0.08, INK);
  head.position.y = 1.15;
  const cone = mesh(new THREE.ConeGeometry(0.2, 0.42, 24), INK);
  cone.rotation.x = Math.PI;
  cone.position.y = 0.67;
  const drip = box(0.1, 0.3, 0.1, ORANGE);
  drip.position.y = 0.33;
  car.add(head, cone, drip);

  // caixa de presente: papel kraft + fita azul + laço laranja
  const gift = new THREE.Group();
  scene.add(gift);
  const kraft = new THREE.MeshStandardMaterial({ color: COLORS.kraft, roughness: 0.85, transparent: true });
  const ribbonMat = new THREE.MeshStandardMaterial({ color: COLORS.blue, roughness: 0.4, transparent: true });
  const bowMat = new THREE.MeshStandardMaterial({ color: COLORS.orange, roughness: 0.4, transparent: true });
  const BW = S + 0.3;
  const BH = H + 0.3;
  const giftBox = rounded(BW, BH, BW, 0.05, kraft);
  giftBox.position.y = BH / 2;
  const ribbon = new THREE.Group();
  gift.add(giftBox, ribbon);
  ribbon.add(box(BW + 0.03, BH + 0.03, 0.26, ribbonMat), box(0.26, BH + 0.03, BW + 0.03, ribbonMat));
  ribbon.children.forEach((r) => (r.position.y = BH / 2));
  for (const side of [-1, 1]) {
    const bow = mesh(new THREE.TorusGeometry(0.26, 0.08, 12, 32), bowMat);
    bow.position.set(side * 0.24, BH + 0.2, 0);
    bow.rotation.set(0, 0, side * 0.5);
    ribbon.add(bow);
  }

  function update(ms: number) {
    let t = ms % CYCLE;
    const phase = (name: keyof typeof T) => {
      const v = t / T[name];
      t -= T[name];
      return v;
    };
    const pr = phase("print");
    const li = phase("lift");
    const dr = phase("drop");
    const ti = phase("tie");
    phase("hold");
    const sh = phase("ship");
    const bk = phase("back");
    const inPrint = pr < 1;
    const k = Math.min(L - 1, Math.floor(pr * L));
    const lp = clamp(pr * L - k);
    const covered = dr >= 1; // a caixa já desceu e cobre a peça

    layers.forEach((ly, i) => {
      ly.g.visible = !covered && (i <= k || !inPrint);
      const done = !inPrint || i < k;
      drawEdges(ly, done ? 1 : clamp(lp / TRACE));
      const settle = done ? 1 : clamp((lp - TRACE) / (1 - TRACE));
      // o azul cresce do centro e cobre o fio; na camada do topo para antes e o contorno laranja fica
      const fs = Math.max(0.001, ease(settle) * (i === L - 1 ? (S - TW * 2) / S : 1));
      ly.fill.visible = settle > 0;
      ly.fill.scale.set(fs, 1, fs);
    });

    // bico: contorna a camada; na troca de andar sobe suave até a próxima
    const ySettle = inPrint ? ease(clamp((lp - TRACE) / (1 - TRACE))) : 1;
    const yLayer = NOZZLE_BASE + (k + (inPrint ? ySettle : 0)) * (LH + GAP);
    let [nx, nz] = inPrint && lp < TRACE ? nozzleAt(lp / TRACE) : corners[0];
    let gy = yLayer;
    let lift = 0;
    if (!inPrint) {
      const e = ease(clamp(li));
      nx *= 1 - e;
      nz *= 1 - e;
      lift = e * 0.8;
    }
    if (bk > 0 && bk < 1) {
      const e = ease(bk);
      gy = NOZZLE_BASE + (1 - e) * (yLayer + lift - NOZZLE_BASE);
      lift = 0;
      nx = corners[0][0] * e;
      nz = corners[0][1] * e;
    }
    gantry.position.set(0, gy + lift, nz);
    car.position.x = nx;
    drip.visible = inPrint && lp < TRACE;

    // presente: desce, ganha fita e laço, e sai para entrega
    gift.visible = li >= 1 && sh < 1;
    const out = ease(clamp(sh));
    gift.position.set(out * 2.6, (1 - easeOutBack(clamp(dr))) * 3, -out * 0.6);
    gift.rotation.y = out * 0.25;
    ribbon.visible = dr >= 1;
    ribbon.scale.setScalar(Math.max(0.001, easeOutBack(clamp(ti))));
    const opacity = 1 - clamp((sh - 0.15) / 0.6);
    for (const m of [kraft, ribbonMat, bowMat]) m.opacity = opacity;
  }

  return {
    render(ms: number) {
      update(ms);
      scene.rotation.y = Math.sin(ms / 5000) * 0.05;
      renderer.render(scene, camera);
    },
    resize(width: number, height: number) {
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    setTheme(isDark: boolean) {
      const c = isDark ? COLORS.dark : COLORS.light;
      hemi.groundColor.set(c.ground);
      hemi.intensity = c.hemi;
      INK.color.set(c.ink);
      BED.color.set(c.bed);
    },
    dispose() {
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const m of [BLUE, ORANGE, INK, BED, kraft, ribbonMat, bowMat]) m.dispose();
      renderer.dispose();
    },
  };
}
