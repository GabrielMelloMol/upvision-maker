import { fitInto, outerOnly, scoped } from "../shape2d";
import { artParts, moveMesh, roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type ClickerParams = {
  plateHole: number; // recorte da chave (MX: 14,0) + folga
  stemFit: number; // folga da cruz da haste
  capSize: number;
  relief: number;
  bodyColor: string;
  capColor: string;
  artColor: string;
};

export const DEFAULT_CLICKER: ClickerParams = { plateHole: 14.05, stemFit: 0.1, capSize: 18, relief: 1, bodyColor: "#1c1c1e", capColor: "#f8f8f6", artColor: "#2563eb" };

const WALL = 2;
const PLATE_T = 1.5; // chapa onde a chave encaixa (padrão MX)
const CAVITY = 9; // espaço para o corpo da chave e os terminais
const FLOOR = 1.6;
const BODY = 14 + 2 * WALL + 4;
const CROSS_L = 4.19;
const CROSS_W = 1.2;
const SOCKET_D = 3.6;
const BOSS_R = 2.8;
const CAP_T = 2.4;
const TAB_R = 4;
const TAB_HOLE = 2;

/**
 * Chaveiro clicker para chave mecânica (tipo Cherry MX): corpo com a chapa de 1,5 mm e a tecla com o encaixe em cruz.
 * O corpo imprime em pé (a chapa faz ponte); a tecla de cabeça para baixo, com a cruz para cima.
 */
export function buildClicker(ctx: ModelCtx, p: ClickerParams): ModelOutput {
  const { M, art } = ctx;
  return scoped((k) => {
    const outer = k(roundedRect(M, BODY, BODY, 3));
    const H = FLOOR + CAVITY + PLATE_T;
    const tab = k(k(M.CrossSection.circle(TAB_R, 32)).translate([0, BODY / 2 + TAB_R - 1.5]));
    const tabHole = k(k(M.CrossSection.circle(TAB_HOLE, 32)).translate([0, BODY / 2 + TAB_R - 1.5]));
    const shell = k(k(outer.extrude(H)).add(k(k(tab.subtract(tabHole)).extrude(FLOOR + 2))));
    const cavity = k(k(k(roundedRect(M, BODY - 2 * WALL, BODY - 2 * WALL, 1)).extrude(CAVITY)).translate([0, 0, FLOOR]));
    const hole = k(k(k(M.CrossSection.square([p.plateHole, p.plateHole], true)).extrude(PLATE_T + 1)).translate([0, 0, FLOOR + CAVITY - 0.5]));
    const body = k(k(shell.subtract(cavity)).subtract(hole));

    const cap2d = k(roundedRect(M, p.capSize, p.capSize, 3));
    const cross = k(M.CrossSection.union([k(M.CrossSection.square([CROSS_L + p.stemFit, CROSS_W + p.stemFit], true)), k(M.CrossSection.square([CROSS_W + p.stemFit, CROSS_L + p.stemFit], true))]));
    const boss = k(k(k(M.CrossSection.circle(BOSS_R, 32)).subtract(cross)).extrude(SOCKET_D));
    // tecla de cabeça para baixo: topo na mesa (z=0), cruz para cima
    const cap = k(k(cap2d.extrude(CAP_T)).add(k(boss.translate([0, 0, CAP_T]))));
    const dx = BODY / 2 + p.capSize / 2 + 8;
    const parts = [{ name: "Tecla", color: p.capColor, mesh: moveMesh(solidMesh(cap), dx, 0) }];
    if (art) {
      // arte embutida rente no topo da tecla (fica embaixo na impressão): 1ª camada colorida
      const placed = k(k(fitInto(art, p.capSize - 4, p.capSize - 4, 0)).scale([-1, 1]));
      const inset = k(outerOnly(M, placed));
      if (!inset.isEmpty()) {
        const art0 = artParts(ctx, placed, p.artColor, "Arte", Math.min(p.relief, CAP_T - 0.8), 0);
        parts.push(...art0.map((a) => ({ ...a, mesh: moveMesh(a.mesh, dx, 0) })));
        parts[0] = { ...parts[0], mesh: moveMesh(solidMesh(k(cap.subtract(k(placed.extrude(Math.min(p.relief, CAP_T - 0.8)))))), dx, 0) };
      }
    }
    return {
      models: [
        { name: "Corpo", parts: [{ name: "Corpo", color: p.bodyColor, mesh: solidMesh(body) }] },
        { name: "Tecla", parts },
      ],
      warnings: [
        "Encaixe feito para chave tipo Cherry MX (e compatíveis). Imprima a chapa e a cruz primeiro: se ficar justo, aumente as folgas.",
        "A chave entra por cima na chapa do corpo; a tecla encaixa na haste.",
      ],
    };
  });
}
