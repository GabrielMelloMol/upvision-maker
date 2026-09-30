import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Model } from "../../geometry/types";
import { fitDistance } from "../../ui/viewerScene";
import { drawerShape, type Dim } from "./drawerShape";

export type DrawerView = { width: number; depth: number; height: number; focus: Dim | null; organizer: Model[]; trays?: Model[]; slide?: boolean };

const DROP_MS = 900;
const VIEW_DIR = new THREE.Vector3(0.55, -1.25, 1.05).normalize();
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (k: number) => 1 - (1 - k) ** 3;

function disposeGroup(g: THREE.Group) {
  for (const o of [...g.children]) {
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((q) => q.dispose());
      else mat?.dispose();
    });
    g.remove(o);
  }
}

/** Seta de cota: linha com duas pontas, na cor pedida. */
function arrow(from: THREE.Vector3, to: THREE.Vector3, color: string, strong: boolean): THREE.Group {
  const g = new THREE.Group();
  const dir = to.clone().sub(from);
  const len = dir.length();
  const head = Math.min(14, len / 4);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: !strong, opacity: strong ? 1 : 0.7 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(strong ? 1.6 : 0.9, strong ? 1.6 : 0.9, Math.max(0.1, len - 2 * head), 8), mat);
  const cone = () => new THREE.Mesh(new THREE.ConeGeometry(strong ? 5 : 3.5, head, 12), mat);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  shaft.quaternion.copy(q);
  shaft.position.copy(from.clone().add(to).multiplyScalar(0.5));
  const a = cone(), b = cone();
  a.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize().negate()));
  a.position.copy(from.clone().add(dir.clone().normalize().multiplyScalar(head / 2)));
  b.quaternion.copy(q);
  b.position.copy(to.clone().sub(dir.clone().normalize().multiplyScalar(head / 2)));
  g.add(shaft, a, b);
  return g;
}

/**
 * Cena da tela de medidas (#140): a gaveta (laterais, fundo, frente com puxador e o móvel de cima transparente) no
 * tamanho digitado, as três cotas (a do campo em foco acesa, na cor de destaque) e, quando há, o organizador montado
 * dentro, que desce para o lugar numa animação curta. Os números das cotas são rótulos HTML em `labels`.
 */
export function createDrawerScene(el: HTMLElement, labels: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(300, -400, 700);
  scene.add(sun);
  const drawer = new THREE.Group(), dims = new THREE.Group(), org = new THREE.Group(), tray = new THREE.Group();
  scene.add(drawer, dims, org, tray);
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  let raf = 0;
  // movimentos curtos: o organizador desce para o lugar; depois a bandeja entra deslizando (ou desce, se removível)
  type Move = { obj: THREE.Object3D; axis: "y" | "z"; from: number; t0: number };
  let moves: Move[] = [];
  let last: DrawerView | null = null;
  let framedFor = "";
  let tags: { el: HTMLElement; at: THREE.Vector3 }[] = [];

  const placeLabels = () => {
    const r = renderer.domElement.getBoundingClientRect();
    for (const t of tags) {
      const p = t.at.clone().project(camera);
      t.el.style.transform = `translate(${((p.x + 1) / 2) * r.width}px, ${((1 - p.y) / 2) * r.height}px) translate(-50%, -50%)`;
    }
  };
  const render = () => {
    renderer.render(scene, camera);
    placeLabels();
  };
  const tick = (now: number) => {
    raf = 0;
    for (const m of moves) {
      const k = Math.min(1, Math.max(0, (now - m.t0) / DROP_MS));
      m.obj.position[m.axis] = m.from * (1 - ease(k));
    }
    moves = moves.filter((m) => now < m.t0 + DROP_MS);
    controls.update();
    render();
    if (moves.length) raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  controls.addEventListener("change", () => !raf && render());

  /** Enquadra a gaveta e as cotas; só quando o tamanho muda bastante ou a prévia muda de formato. */
  function frame(v: DrawerView, force = false) {
    const key = `${Math.round(v.width / 50)}:${Math.round(v.depth / 50)}:${Math.round(v.height / 20)}:${camera.aspect.toFixed(1)}`;
    if (key === framedFor && !force) return;
    framedFor = key;
    const box = new THREE.Box3().setFromObject(drawer).union(new THREE.Box3().setFromObject(dims));
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    camera.position.copy(center.clone().add(VIEW_DIR.clone().multiplyScalar(fitDistance(r, camera.fov, camera.aspect))));
    controls.target.copy(center);
    controls.update();
  }

  function build(v: DrawerView) {
    disposeGroup(drawer);
    disposeGroup(dims);
    labels.replaceChildren();
    tags = [];
    const { panels, measures } = drawerShape(v.width, v.depth, v.height);
    const wood = cssVar("--surface-raised"), edge = cssVar("--tertiary"), text = cssVar("--text");
    for (const p of panels) {
      const geo = new THREE.BoxGeometry(...p.size);
      const top = p.kind === "top";
      const mat = new THREE.MeshStandardMaterial({ color: top ? text : p.kind === "handle" ? edge : wood, roughness: 0.8, transparent: top, opacity: top ? 0.08 : 1, depthWrite: !top });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...p.center);
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: edge, transparent: top, opacity: top ? 0.5 : 1 }));
      lines.position.copy(mesh.position);
      drawer.add(mesh, lines);
    }
    const accent = cssVar("--accent"), muted = cssVar("--muted");
    for (const m of measures) {
      const on = v.focus === m.key;
      const from = new THREE.Vector3(...m.from), to = new THREE.Vector3(...m.to);
      dims.add(arrow(from, to, on ? accent : muted, on));
      const tag = document.createElement("span");
      tag.className = "drawer-dim";
      tag.dataset.dim = m.key;
      if (on) tag.dataset.focus = "";
      tag.textContent = m.label;
      labels.append(tag);
      tags.push({ el: tag, at: from.clone().add(to).multiplyScalar(0.5) });
    }
  }

  function fill(g: THREE.Group, models: Model[]) {
    disposeGroup(g);
    for (const model of models)
      for (const p of model.parts) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(p.mesh.positions, 3));
        geo.setIndex(new THREE.BufferAttribute(p.mesh.indices, 1));
        geo.computeVertexNormals();
        g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.6, flatShading: true })));
      }
  }

  /** Organizador desce; em seguida a bandeja entra pela frente (desliza) ou desce nos trilhos (removível). */
  function play(v: DrawerView) {
    moves = [];
    org.position.z = 0;
    tray.position.set(0, 0, 0);
    if (reducedMotion()) return;
    const now = performance.now();
    if (org.children.length) moves.push({ obj: org, axis: "z", from: v.height * 1.4, t0: now });
    if (tray.children.length)
      moves.push(v.slide ? { obj: tray, axis: "y", from: -(v.depth * 0.6), t0: now + DROP_MS * 0.7 } : { obj: tray, axis: "z", from: v.height, t0: now + DROP_MS * 0.7 });
    for (const m of moves) m.obj.position[m.axis] = m.from;
    wake();
  }

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = el;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    if (last) frame(last);
    render();
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(el);
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  const onScheme = () => {
    if (last) build(last);
    render();
  };
  scheme.addEventListener("change", onScheme);
  resize();

  return {
    update(v: DrawerView) {
      const organizerChanged = v.organizer !== last?.organizer;
      const traysChanged = (v.trays ?? []) !== (last?.trays ?? []);
      const first = (organizerChanged && v.organizer.length > 0 && !last?.organizer.length) || (traysChanged && !!v.trays?.length && !last?.trays?.length);
      build(v);
      frame(v);
      if (organizerChanged) fill(org, v.organizer);
      if (traysChanged) fill(tray, v.trays ?? []);
      last = v;
      if (first) play(v);
      render();
    },
    /** Repete a montagem (botão "Ver montado"). */
    replay() {
      if (last) play(last);
    },
    dispose() {
      cancelAnimationFrame(raf);
      scheme.removeEventListener("change", onScheme);
      ro?.disconnect();
      controls.dispose();
      for (const g of [drawer, dims, org, tray]) disposeGroup(g);
      renderer.dispose();
      renderer.domElement.remove();
      labels.replaceChildren();
    },
  };
}
