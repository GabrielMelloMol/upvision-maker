import { Box, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { modelsBounds } from "../geometry/bounds";
import type { Model } from "../geometry/types";

type Props = {
  models: Model[];
  busy?: boolean;
  busyText?: string;
  error?: string | null;
  emptyText?: string;
};

const PLATE_MM = 256;

/** Prévia 3D padrão de todas as ferramentas: Z para cima, mesa 256 mm, girar/zoom com o mouse. */
export default function Preview3D({ models, busy, busyText = "Gerando modelo…", error, emptyText = "A prévia aparece aqui." }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<{ scene: THREE.Scene; group: THREE.Group; camera: THREE.PerspectiveCamera; controls: OrbitControls; render: () => void } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(80, -120, 200);
    scene.add(sun);
    const grid = new THREE.GridHelper(PLATE_MM, 26, 0x94a3b8, 0xcbd5e1);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);
    const group = new THREE.Group();
    scene.add(group);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(0, -160, 140);
    const controls = new OrbitControls(camera, renderer.domElement);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    ctx.current = { scene, group, camera, controls, render };
    resize();
    return () => {
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
  }, []);

  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    for (const m of [...c.group.children] as THREE.Mesh[]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      c.group.remove(m);
    }
    for (const model of models) {
      for (const p of model.parts) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(p.mesh.positions, 3));
        g.setIndex(new THREE.BufferAttribute(p.mesh.indices, 1));
        g.computeVertexNormals();
        c.group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.6, metalness: 0.05, flatShading: true })));
      }
    }
    const box = new THREE.Box3().setFromObject(c.group);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 10);
      c.controls.target.copy(center);
      c.camera.position.copy(center).add(new THREE.Vector3(0, -1.6 * r, 1.4 * r).multiplyScalar(1.3));
      c.controls.update();
    }
    c.render();
  }, [models]);

  const legend = [...new Map(models.flatMap((m) => m.parts).map((p) => [p.color + p.name, p])).values()].slice(0, 6);
  const b = modelsBounds(models);
  const size = b && { x: b.max[0] - b.min[0], y: b.max[1] - b.min[1], z: b.max[2] - b.min[2] };

  return (
    <div className="viewer" ref={host} role="img" aria-label="Prévia 3D do modelo">
      {size && (
        <div className="hud">
          {size.x.toFixed(1)} × {size.y.toFixed(1)} × {size.z.toFixed(1)} mm
        </div>
      )}
      {legend.length > 1 && (
        <div className="legend">
          {legend.map((p) => (
            <span key={p.color + p.name}>
              <i style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
        </div>
      )}
      {(busy || error || models.length === 0) && (
        <div className={`overlay ${busy ? "busy" : ""}`} aria-live="polite">
          <div className="inner">
            {busy ? (
              <>
                <div className="spinner" />
                <span>{busyText}</span>
              </>
            ) : error ? (
              <div className="alert error" role="alert">
                <TriangleAlert />
                <span>{error}</span>
              </div>
            ) : (
              <>
                <Box />
                <span>{emptyText}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
