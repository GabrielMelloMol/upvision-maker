import * as THREE from "three";

/** Câmera ¾ das miniaturas (#149): de frente, à direita e de cima (Z para cima), lente estreita para pouca distorção. */
export const THUMB_VIEW = { dir: new THREE.Vector3(0.9, -1.4, 1.0).normalize(), fov: 26, margin: 0.1 };

const corners = (b: THREE.Box3) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));

/** Limites da caixa projetada na tela (coordenadas normalizadas, −1 a 1). */
function projected(camera: THREE.PerspectiveCamera, pts: THREE.Vector3[]) {
  camera.updateMatrixWorld();
  const p = pts.map((v) => v.clone().project(camera));
  return { minX: Math.min(...p.map((v) => v.x)), maxX: Math.max(...p.map((v) => v.x)), minY: Math.min(...p.map((v) => v.y)), maxY: Math.max(...p.map((v) => v.y)) };
}

/**
 * Põe a câmera na direção `dir` olhando a caixa e acha a distância em que ela ocupa a tela com margem `margin` (de cada
 * lado, em fração da meia-tela) no lado que aperta primeiro, com a caixa centrada na imagem.
 */
export function fitCamera(camera: THREE.PerspectiveCamera, box: THREE.Box3, dir: THREE.Vector3, margin: number): void {
  camera.up.set(0, 0, 1);
  const pts = corners(box);
  const target = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1;
  const limit = 1 - margin;
  const place = (d: number) => {
    camera.position.copy(target).add(dir.clone().multiplyScalar(d));
    camera.lookAt(target);
  };
  const fits = (d: number) => {
    place(d);
    const r = projected(camera, pts);
    return r.maxX - r.minX <= 2 * limit && r.maxY - r.minY <= 2 * limit;
  };
  /** Menor distância em que a caixa cabe dentro da margem (busca binária). */
  const nearest = () => {
    let lo = radius * 0.05, hi = radius * 40;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  // distância e centro dependem um do outro (perspectiva): alterna até assentar
  for (let round = 0; round < 6; round++) {
    const d = nearest();
    place(d);
    // desloca o alvo no plano da tela até o meio da caixa projetada cair no centro
    const r = projected(camera, pts);
    const halfH = Math.tan(((camera.fov * Math.PI) / 180) / 2) * d;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    target.add(right.multiplyScalar(((r.minX + r.maxX) / 2) * halfH * camera.aspect).add(up.multiplyScalar(((r.minY + r.maxY) / 2) * halfH)));
  }
  place(nearest());
  camera.updateProjectionMatrix();
}

/** Para teste: limites projetados de uma caixa na câmera atual. */
export const projectedBox = (camera: THREE.PerspectiveCamera, box: THREE.Box3) => projected(camera, corners(box));
