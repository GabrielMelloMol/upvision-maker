import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Model } from "../geometry/types";

const PLATE_MM = 256;
const FLY_MS = 700;
const SPIN_MS = 6000;
const SPIN_FADE_MS = 1200;
const SPIN_SPEED = 1.1; // OrbitControls: 2 = uma volta a cada 30 s
const SETTLE_MS = 900; // amortecimento depois de soltar o mouse
/** Refaz o enquadramento só quando o tamanho muda mais que isso (editar um campo não mexe na câmera). */
const REFRAME_RATIO = 0.25;

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#999";
const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;

/**
 * Cena da prévia 3D: Z para cima, mesa 256 mm, cores do tema (claro/escuro), render sob demanda.
 * Ao chegar o 1º modelo a câmera desliza até ele e gira devagar por alguns segundos; qualquer toque do mouse para o giro.
 */
export function createViewer(el: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(80, -120, 200);
  scene.add(sun);
  const group = new THREE.Group();
  scene.add(group);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -160, 140);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;

  let grid: THREE.GridHelper | null = null;
  function buildGrid() {
    if (grid) {
      scene.remove(grid);
      grid.dispose();
    }
    grid = new THREE.GridHelper(PLATE_MM, 26, cssVar("--grid-major"), cssVar("--grid-minor"));
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);
  }
  buildGrid();

  let raf = 0;
  let looping = false;
  let dragging = false;
  let fly: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t0: number; spin: boolean } | null = null;
  let spinUntil = 0;
  let settleUntil = 0;
  const lastCenter = new THREE.Vector3();
  let lastSize = 0;
  const render = () => renderer.render(scene, camera);

  function tick(now: number) {
    raf = 0;
    looping = true;
    if (fly) {
      const e = easeOutCubic(Math.min(1, (now - fly.t0) / FLY_MS));
      camera.position.lerpVectors(fly.from, fly.to, e);
      controls.target.lerpVectors(fly.fromT, fly.toT, e);
      if (e === 1) {
        if (fly.spin) spinUntil = now + SPIN_MS;
        fly = null;
      }
    }
    const spinning = !fly && !dragging && now < spinUntil;
    controls.autoRotate = spinning;
    controls.autoRotateSpeed = SPIN_SPEED * Math.min(1, (spinUntil - now) / SPIN_FADE_MS);
    controls.update();
    render();
    looping = false;
    if (fly || spinning || dragging || now < settleUntil) raf = requestAnimationFrame(tick);
  }
  const wake = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  controls.addEventListener("change", () => !looping && !raf && render());
  controls.addEventListener("start", () => {
    dragging = true;
    fly = null;
    spinUntil = 0;
    wake();
  });
  controls.addEventListener("end", () => {
    dragging = false;
    settleUntil = performance.now() + SETTLE_MS;
    wake();
  });

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = el;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  const onScheme = () => {
    buildGrid();
    render();
  };
  scheme.addEventListener("change", onScheme);
  resize();

  function frame(wasEmpty: boolean) {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    // só reenquadra se o tamanho mudou ou o modelo saiu do lugar (ex.: trocou de modelo), não a cada ajuste fino
    const moved = center.distanceTo(lastCenter) / Math.max(size, 1);
    if (!wasEmpty && lastSize && Math.abs(size - lastSize) / lastSize < REFRAME_RATIO && moved < REFRAME_RATIO) return;
    lastSize = size;
    lastCenter.copy(center);
    const r = Math.max(size / 2, 10);
    const to = center.clone().add(new THREE.Vector3(0, -1.6 * r, 1.4 * r).multiplyScalar(1.3));
    if (reducedMotion()) {
      camera.position.copy(to);
      controls.target.copy(center);
      controls.update();
      return;
    }
    // Chegada: começa mais longe e um pouco de lado, para a câmera "pousar" no modelo.
    const from = wasEmpty ? to.clone().sub(center).multiplyScalar(1.45).applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.5).add(center) : camera.position.clone();
    fly = { from, to, fromT: wasEmpty ? center.clone() : controls.target.clone(), toT: center, t0: performance.now(), spin: wasEmpty };
    wake();
  }

  return {
    setModels(models: Model[]) {
      const wasEmpty = group.children.length === 0;
      for (const m of [...group.children] as THREE.Mesh[]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        group.remove(m);
      }
      for (const model of models) {
        for (const p of model.parts) {
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(p.mesh.positions, 3));
          g.setIndex(new THREE.BufferAttribute(p.mesh.indices, 1));
          g.computeVertexNormals();
          group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.6, metalness: 0.05, flatShading: true })));
        }
      }
      if (group.children.length === 0) lastSize = 0;
      frame(wasEmpty);
      render();
    },
    dispose() {
      cancelAnimationFrame(raf);
      scheme.removeEventListener("change", onScheme);
      ro.disconnect();
      controls.dispose();
      grid?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
