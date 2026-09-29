import type { CS } from "../manifold";
import { fitInto, scoped, shrinkToFit } from "../shape2d";
import { artParts, backing, boxOf, offsetOf, roundedRect, size2, slab, union, type ElementBox, type ModelCtx, type ModelOutput, MissingInput } from "./common";
import { spacedText } from "./photoHolder";

export type BookmarkParams = {
  text: string;
  length: number;
  width: number;
  thickness: number;
  relief: number;
  hole: boolean;
  baseColor: string;
  textColor: string;
  /** "strip" = tira com texto ao longo (padrão); "side" = aba fina dentro do livro e o nome de pé saindo da lateral (#71). */
  mode?: "strip" | "side";
  nameHeight?: number; // lateral: altura máxima das letras que saem do livro
  spacing?: number; // lateral: espaço extra entre letras
};

export const DEFAULT_BOOKMARK: BookmarkParams = {
  text: "Boa leitura",
  length: 150,
  width: 40,
  thickness: 1.6,
  relief: 0.8,
  hole: true,
  baseColor: "#1c1c1e",
  textColor: "#f5c542",
  mode: "strip",
  nameHeight: 14,
  spacing: 0,
};

const TAB_T = 0.8; // aba fina: fica dentro do livro sem marcar as páginas
const NAME_BORDER = 1.5; // contorno das letras, na cor da base
const NAME_SINK = 0.35; // fração da altura das letras que entra na aba (segura o nome)

const HOLE_R = 2.5;
const MARGIN = 4;

/** Marca-página: tira arredondada com furo para o cordão, texto ao longo do comprimento e desenho opcional no topo. */
export function buildBookmark(ctx: ModelCtx, p: BookmarkParams): ModelOutput {
  if (p.mode === "side") return buildSideBookmark(ctx, p);
  const { M, text, art } = ctx;
  return scoped((k) => {
    const L = p.length, W = p.width;
    const holeY = L / 2 - MARGIN - HOLE_R;
    let body = k(roundedRect(M, W, L, 4));
    if (p.hole) body = k(body.subtract(k(k(M.CrossSection.circle(HOLE_R, 32)).translate([0, holeY]))));
    const inner = k(body.offset(-MARGIN, "Round"));
    const top = p.hole ? holeY - HOLE_R - MARGIN : L / 2 - MARGIN;
    const artH = art ? Math.min(W - 2 * MARGIN, L * 0.3) : 0;
    const slots = [];
    const elements: ElementBox[] = [];
    // desenho e texto na posição calculada + o deslocamento do gizmo (#79)
    const at = (id: string, label: string, cs: CS) => {
      const moved = k(cs.translate(offsetOf(ctx, id)));
      elements.push({ id, label, box: boxOf(moved) });
      return moved;
    };
    if (art) slots.push(at("art", "Desenho", k(shrinkToFit(k(fitInto(art, W - 2 * MARGIN, artH, top - artH / 2)), inner))));
    const raw = text(p.text, 100);
    if (raw) {
      // texto deitado ao longo do comprimento, lido de baixo para cima
      const turned = k(k(raw).rotate(90));
      const room = top - (art ? artH + MARGIN : 0) - (-L / 2 + MARGIN);
      const cy = -L / 2 + MARGIN + room / 2;
      slots.push(at("text", "Texto", k(shrinkToFit(k(fitInto(turned, (W - 2 * MARGIN) * 0.7, room, cy)), inner))));
    }
    if (!slots.length) throw new MissingInput("Digite um texto ou envie um desenho.");
    return {
      models: [
        {
          name: "Marca-página",
          parts: [
            { name: "Base", color: p.baseColor, mesh: slab(body, p.thickness) },
            { name: "Texto", color: p.textColor, mesh: slab(k(M.CrossSection.union(slots)), p.relief, p.thickness) },
          ],
        },
      ],
      elements,
    };
  });
}

/**
 * Marca-página com nome na lateral: aba fina (fica dentro do livro) e o nome de pé na borda comprida, saindo para
 * fora do livro, com o tamanho da letra ajustado ao comprimento. Desenho opcional na aba. 2 cores.
 */
function buildSideBookmark(ctx: ModelCtx, p: BookmarkParams): ModelOutput {
  const { M, text, art } = ctx;
  return scoped((k) => {
    const L = p.length, W = p.width;
    const raw = spacedText(M, text, p.text, p.nameHeight ?? 14, p.spacing ?? 0); // na altura final: o espaço fica em mm de verdade
    if (!raw) throw new MissingInput("Digite o nome.");
    // nome deitado ao longo do comprimento (x da tela = comprimento da aba), cabendo em 90% dele
    const name = k(fitInto(k(raw), L * 0.9, p.nameHeight ?? 14, 0));
    const [, nh] = size2(name);
    // a aba vai de x = −W até a borda; as letras ficam em pé na borda, entrando NAME_SINK da altura na aba
    const tab = k(k(roundedRect(M, W, L, 4)).translate([-W / 2 + nh * NAME_SINK, 0]));
    const letters = k(k(name.rotate(-90)).translate([nh / 2, 0])); // topo das letras para fora do livro (+x)
    const halo = k(backing(M, letters, NAME_BORDER));
    const base = k(union(M, [tab, halo]));
    const parts = [
      { name: "Base", color: p.baseColor, mesh: slab(base, TAB_T) },
      { name: "Nome", color: p.textColor, mesh: slab(letters, p.relief + p.thickness - TAB_T, TAB_T) },
      { name: "Contorno", color: p.baseColor, mesh: slab(k(halo.subtract(k(letters.offset(0.01)))), p.thickness - TAB_T, TAB_T) },
    ];
    if (art) {
      // desenho na aba, no meio
      const tb = tab.bounds();
      const placed = k(k(fitInto(art, (tb.max[0] - tb.min[0]) * 0.6, L * 0.35, 0)).translate([(tb.min[0] + tb.max[0]) / 2 - nh * NAME_SINK, 0]));
      parts.push(...artParts(ctx, placed, p.textColor, "Desenho", p.relief, TAB_T));
    }
    return {
      models: [{ name: "Marca-página", parts }],
      warnings: ["A aba (0,8 mm) fica dentro do livro; o nome sai pela lateral, de pé. Imprima deitado, como está."],
    };
  });
}
