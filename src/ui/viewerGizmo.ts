import * as THREE from "three";

/**
 * Alças arrastáveis na prévia 3D (corte parcial): esferas sempre visíveis, de tamanho fixo na tela. Uma alça com `axis`
 * anda só ao longo dele; sem `axis` anda no plano horizontal (com Shift, na vertical). A prévia só avisa o novo ponto;
 * quem manda no estado é a ferramenta.
 */
export type Vec3 = [number, number, number];
export type Handle = { id: string; pos: Vec3; axis?: Vec3; color?: string };
export type OnHandle = (id: string, pos: Vec3, done: boolean) => void;

const SCREEN_FRACTION = 0.022; // diâmetro da alça em relação à distância da câmera
const GRAB_BONUS = 1.6; // área de pegar um pouco maior que o desenho
const DEFAULT_COLOR = "#38bdf8";
const ACTIVE_COLOR = "#f97316";

/** Parâmetro t do ponto da reta `o + t·d` mais perto do raio `ro + s·rd` (retas não paralelas). */
export function lineParam(ro: THREE.Vector3, rd: THREE.Vector3, o: THREE.Vector3, d: THREE.Vector3): number {
  const w = o.clone().sub(ro);
  const [a, b, c] = [d.dot(d), d.dot(rd), rd.dot(rd)];
  const [e, f] = [d.dot(w), rd.dot(w)];
  const den = a * c - b * b;
  return Math.abs(den) < 1e-9 ? 0 : (b * f - c * e) / den;
}

type Deps = { scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: { enabled: boolean }; el: HTMLElement; canvas: HTMLCanvasElement; render: () => void };

export function createGizmo({ scene, camera, controls, el, canvas, render }: Deps) {
  const group = new THREE.Group();
  scene.add(group);
  let handles: Handle[] = [];
  let onHandle: OnHandle = () => {};
  let active: { id: string; start: THREE.Vector3; axis: THREE.Vector3 | null; mesh: THREE.Mesh } | null = null;
  const unit = new THREE.SphereGeometry(0.5, 16, 12);
  const raycaster = new THREE.Raycaster();

  const ndc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const scaleOf = (pos: THREE.Vector3) => camera.position.distanceTo(pos) * SCREEN_FRACTION;

  function build() {
    for (const m of [...group.children] as THREE.Mesh[]) {
      (m.material as THREE.Material).dispose();
      group.remove(m);
    }
    for (const h of handles) {
      const mat = new THREE.MeshBasicMaterial({ color: h.color ?? DEFAULT_COLOR, depthTest: false, transparent: true, opacity: 0.95 });
      const mesh = new THREE.Mesh(unit, mat);
      mesh.renderOrder = 10;
      mesh.userData.id = h.id;
      mesh.position.set(...h.pos);
      group.add(mesh);
    }
    update();
  }

  /** Mantém o tamanho na tela (chamado antes de cada desenho). */
  function update() {
    for (const m of group.children) m.scale.setScalar(scaleOf(m.position));
    if (import.meta.env.DEV) publish();
  }

  /** Só em desenvolvimento e nos testes E2E: onde cada alça está na tela (px relativos à prévia), em data-handles. */
  function publish() {
    const r = canvas.getBoundingClientRect();
    const at: Record<string, [number, number]> = {};
    for (const m of group.children as THREE.Mesh[]) {
      const p = m.position.clone().project(camera);
      at[m.userData.id] = [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height];
    }
    el.dataset.handles = JSON.stringify(at);
  }

  function pick(e: PointerEvent): THREE.Mesh | null {
    raycaster.setFromCamera(ndc(e), camera);
    let best: { mesh: THREE.Mesh; d: number } | null = null;
    for (const m of group.children as THREE.Mesh[]) {
      const r = m.scale.x * 0.5 * GRAB_BONUS;
      const d = raycaster.ray.distanceToPoint(m.position);
      if (d <= r && (!best || d < best.d)) best = { mesh: m, d };
    }
    return best?.mesh ?? null;
  }

  function target(e: PointerEvent): THREE.Vector3 | null {
    if (!active) return null;
    raycaster.setFromCamera(ndc(e), camera);
    const { ray } = raycaster;
    const axis = active.axis ?? (e.shiftKey ? new THREE.Vector3(0, 0, 1) : null);
    if (axis) return active.start.clone().add(axis.clone().multiplyScalar(lineParam(ray.origin, ray.direction, active.start, axis)));
    const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -active.start.z), new THREE.Vector3());
    return hit;
  }

  const emit = (e: PointerEvent, done: boolean) => {
    const p = target(e);
    if (!p || !active) return;
    active.mesh.position.copy(p);
    onHandle(active.id, [p.x, p.y, p.z], done);
    render();
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || !handles.length) return;
    const mesh = pick(e);
    if (!mesh) return;
    e.stopPropagation();
    e.preventDefault();
    const h = handles.find((x) => x.id === mesh.userData.id)!;
    active = { id: h.id, start: mesh.position.clone(), axis: h.axis ? new THREE.Vector3(...h.axis).normalize() : null, mesh };
    (mesh.material as THREE.MeshBasicMaterial).color.set(ACTIVE_COLOR);
    controls.enabled = false;
    el.setPointerCapture?.(e.pointerId);
    render();
  };
  const onMove = (e: PointerEvent) => {
    if (active) return emit(e, false);
    const over = handles.length ? pick(e) : null;
    el.style.cursor = over ? "grab" : "";
  };
  const onUp = (e: PointerEvent) => {
    if (!active) return;
    emit(e, true);
    active = null;
    controls.enabled = true;
    el.releasePointerCapture?.(e.pointerId);
    build();
    render();
  };
  el.addEventListener("pointerdown", onDown, true); // antes do OrbitControls e do clique de escolher face
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);

  return {
    set(next: Handle[], cb: OnHandle) {
      onHandle = cb;
      handles = next;
      if (active) return; // em arrasto, a alça segue o ponteiro; as posições novas entram ao soltar
      build();
      render();
    },
    update,
    dispose() {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      for (const m of group.children as THREE.Mesh[]) (m.material as THREE.Material).dispose();
      unit.dispose();
      scene.remove(group);
    },
  };
}
