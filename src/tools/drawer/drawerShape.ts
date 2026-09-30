/*
 * Gaveta desenhada para a tela de medidas (#140), em mm, Z para cima, frente em −Y. O vão interno é
 * [−W/2, W/2] × [−D/2, D/2] × [0, H]; H é a altura útil, do chão da gaveta até o obstáculo (tampo, gaveta de cima).
 * Só dados: a cena 3D (drawerScene) desenha as caixas e as cotas.
 */
export type Dim = "width" | "depth" | "height";
export type Panel = { name: string; size: [number, number, number]; center: [number, number, number]; kind: "box" | "front" | "handle" | "top" };
export type Measure = { key: Dim; from: [number, number, number]; to: [number, number, number]; label: string };

export const WALL = 15;
const FLOOR = 6;
const FRONT = 18;
const TOP = 25;
const REACH = 30; // afastamento da cota até a gaveta
const HANDLE = { w: 120, h: 14, d: 22 };

const mmText = (v: number) => `${Math.round(v).toLocaleString("pt-BR")} mm`;

export function drawerShape(W: number, D: number, H: number): { panels: Panel[]; measures: Measure[] } {
  const side = Math.max(20, H * 0.75); // a caixa da gaveta é mais baixa que o vão (senão não abre)
  const panels: Panel[] = [
    { name: "Fundo", kind: "box", size: [W + 2 * WALL, D + WALL, FLOOR], center: [0, WALL / 2, -FLOOR / 2] },
    { name: "Lateral esquerda", kind: "box", size: [WALL, D + WALL, side], center: [-W / 2 - WALL / 2, WALL / 2, side / 2] },
    { name: "Lateral direita", kind: "box", size: [WALL, D + WALL, side], center: [W / 2 + WALL / 2, WALL / 2, side / 2] },
    { name: "Traseira", kind: "box", size: [W, WALL, side], center: [0, D / 2 + WALL / 2, side / 2] },
    { name: "Frente", kind: "front", size: [W + 2 * WALL + 6, FRONT, Math.max(side + FLOOR + 12, H * 0.92)], center: [0, -D / 2 - FRONT / 2, Math.max(side + FLOOR + 12, H * 0.92) / 2 - FLOOR] },
    { name: "Puxador", kind: "handle", size: [Math.min(HANDLE.w, W * 0.5), HANDLE.d, HANDLE.h], center: [0, -D / 2 - FRONT - HANDLE.d / 2, Math.max(side, H * 0.6)] },
    { name: "Móvel acima", kind: "top", size: [W + 2 * WALL + 60, D + 2 * WALL + 40, TOP], center: [0, WALL / 2, H + TOP / 2] },
  ];
  const measures: Measure[] = [
    { key: "width", from: [-W / 2, -D / 2 - FRONT - REACH, 0], to: [W / 2, -D / 2 - FRONT - REACH, 0], label: mmText(W) },
    { key: "depth", from: [W / 2 + WALL + REACH, -D / 2, 0], to: [W / 2 + WALL + REACH, D / 2, 0], label: mmText(D) },
    { key: "height", from: [W / 2 + WALL + REACH, D / 2, 0], to: [W / 2 + WALL + REACH, D / 2, H], label: mmText(H) },
  ];
  return { panels, measures };
}
