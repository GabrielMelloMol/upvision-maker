import { useEffect, useRef } from "react";
import type { Model } from "../../geometry/types";
import type { Dim } from "./drawerShape";
import { createDrawerScene } from "./drawerScene";

type Props = { width: number; depth: number; height: number; focus: Dim | null; organizer: Model[]; trays?: Model[]; slide?: boolean };

const NONE: Model[] = [];
const NAMES: Record<Dim, string> = { width: "largura", depth: "profundidade", height: "altura útil" };

/** Gaveta 3D ao vivo da tela de medidas (#140): muda com as medidas e acende a cota do campo em foco. */
export default function DrawerView({ width, depth, height, focus, organizer, trays = NONE, slide = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createDrawerScene> | null>(null);

  useEffect(() => {
    try {
      scene.current = createDrawerScene(host.current!, labels.current!);
    } catch {
      scene.current = null; // sem WebGL (testes, máquina sem GPU): fica só o texto
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.update({ width, depth, height, focus, organizer, trays, slide });
  }, [width, depth, height, focus, organizer, trays, slide]);

  const desc = `Gaveta de ${width} × ${depth} mm com ${height} mm de altura útil${focus ? `; medindo a ${NAMES[focus]}` : ""}${organizer.length ? "; organizador montado dentro" : ""}${trays.length ? `; bandeja de talheres em cima${slide ? ", deslizando nos trilhos" : ", removível"}` : ""}.`;
  return (
    <div className="viewer drawer-view" ref={host} role="img" aria-label={desc}>
      <div className="drawer-dims" ref={labels} aria-hidden />
      {organizer.length > 0 && (
        <button type="button" className="sm drawer-replay" onClick={() => scene.current?.replay()}>
          Ver montado
        </button>
      )}
    </div>
  );
}
