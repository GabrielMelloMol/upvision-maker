import type { CS } from "../manifold";
import { medalOutline } from "../medal";
import { fitInto, scoped } from "../shape2d";
import { artParts, backing, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type BagClipParams = {
  cover: number; // comprimento das hastes = largura da boca do saco que ele fecha
  gap: number; // espessura do saco dobrado (folga)
  arm: number; // espessura das hastes (força)
  height: number; // largura do clipe (altura na impressão)
  artWidth: number;
  base: number;
  relief: number;
  clipColor: string;
  artColor: string;
};

export const DEFAULT_BAG_CLIP: BagClipParams = { cover: 90, gap: 1.2, arm: 3.2, height: 10, artWidth: 30, base: 2.4, relief: 1, clipColor: "#2563eb", artColor: "#facc15" };

const ROOT_EXTRA = 2.2; // vão na raiz além do saco: a curva flexiona sem trincar
const TIP_RATIO = 0.45; // na ponta o vão fica menor que o saco: é a pré-carga que aperta
const MIN_GAP = 0.3; // abaixo disso as hastes grudam na impressão
const FLARE = 5; // boca aberta para o saco entrar
const MOUTH_EXTRA = 3;
const TOOTH_BACK = 2.5; // dente de trava, antes da boca
const TOOTH_MAX = 0.45;
const ROOT_WALL = 1.5; // raiz mais grossa que as hastes
const BORDER = 2.4;
const HEAD_OVERLAP = 2;

/** Medidas derivadas da fenda (exportadas para os testes e para a dica na tela). */
export function bagClipProfile(p: Pick<BagClipParams, "cover" | "gap" | "arm">) {
  const rootGap = p.gap + ROOT_EXTRA;
  const tipGap = Math.max(MIN_GAP, p.gap * TIP_RATIO);
  const toothR = Math.max(0, Math.min(TOOTH_MAX, (tipGap - 0.15) / 2));
  const xT = p.cover - TOOTH_BACK;
  const yInAt = (x: number) => rootGap / 2 + ((tipGap - rootGap) / 2) * (x / p.cover);
  return { rootGap, tipGap, toothR, xT, yInAt, toothGap: 2 * (yInAt(xT) - toothR), flare: FLARE, mouth: p.gap + MOUTH_EXTRA, rootWall: p.arm * ROOT_WALL };
}

/**
 * Clipe de saco em U: duas hastes em balanço ligadas por uma raiz arredondada e reforçada. A fenda afunila até
 * ficar menor que o saco na ponta (a pré-carga das hastes aperta), com um dente de trava e a boca aberta para o saco
 * entrar. Impresso deitado: as camadas correm ao longo das hastes, que flexionam sem quebrar.
 * Sem desenho enviado, a cabeça é um coração.
 */
export function buildBagClip(ctx: ModelCtx, p: BagClipParams): ModelOutput {
  const { M } = ctx;
  const f = bagClipProfile(p);
  return scoped((k) => {
    const L = p.cover;
    const arm = (sign: 1 | -1) => {
      const pts: [number, number][] = [
        [0, f.rootGap / 2],
        [L, f.tipGap / 2],
        [L + FLARE, f.mouth / 2],
        [L + FLARE, f.mouth / 2 + p.arm * 0.7],
        [L, f.tipGap / 2 + p.arm],
        [0, f.rootGap / 2 + p.arm],
      ];
      const cs = k(new M.CrossSection([pts.map(([x, y]) => [x, sign * y] as [number, number])], "NonZero"));
      if (f.toothR <= 0) return cs;
      // dente: meia bolinha saindo da face de dentro, perto da boca
      const tooth = k(k(M.CrossSection.circle(f.toothR + 0.3, 24)).translate([f.xT, sign * (f.yInAt(f.xT) + 0.3)]));
      return k(cs.add(tooth));
    };
    const rOut = f.rootGap / 2 + f.rootWall;
    const halfPlane = k(k(M.CrossSection.square([rOut + 1, 2 * rOut + 2], false)).translate([-rOut - 1, -rOut - 1]));
    const root = k(k(k(M.CrossSection.circle(rOut, 64)).subtract(k(M.CrossSection.circle(f.rootGap / 2, 48)))).intersect(halfPlane));
    const body2d = k(M.CrossSection.union([arm(1), arm(-1), root]));

    const custom = !!ctx.art && !ctx.art.isEmpty();
    const src: CS = custom ? ctx.art! : k(medalOutline(M, "heart", p.artWidth));
    const fitted = k(fitInto(src, p.artWidth, p.artWidth, 0));
    const head0 = k(backing(M, fitted, BORDER));
    const dx = -rOut + HEAD_OVERLAP - head0.bounds().max[0];
    const head = k(head0.translate([dx, 0]));
    const placed = k(fitted.translate([dx, 0]));
    const clip = k(k(body2d.extrude(p.height)).add(k(head.extrude(p.base))));
    // coração padrão: sem camadas de cor do desenho enviado
    const art = artParts(custom ? ctx : { ...ctx, art: null, artLayers: null }, placed, p.artColor, "Arte", p.relief, p.base);
    return {
      models: [{ name: "Clipe de saco", parts: [{ name: "Clipe", color: p.clipColor, mesh: solidMesh(clip) }, ...art] }],
      warnings: [
        `Na ponta a fenda fica com ${f.tipGap.toFixed(1).replace(".", ",")} mm, menor que o saco: é isso que aperta. Se não fechar, aumente a folga; se soltar, diminua.`,
        "Imprima deitado (como sai no arquivo), PLA ou PETG, 3 paredes.",
      ],
    };
  });
}
