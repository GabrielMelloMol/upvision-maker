import { layoutOnPlate } from "../keychain";
import type { CS } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { artParts, backing, MissingInput, size2, slab, solidMesh, union, type ModelCtx, type ModelOutput } from "./common";
import { ornament, type Ornament } from "./shapes";

export type PendantIcon = Ornament | "art" | "none";

export type NamePendantsParams = {
  items: string; // pingentes separados por vírgula ou linha: "Nome; ícone" (coração, pata, estrela, desenho, nenhum)
  width: number;
  base: number;
  relief: number;
  border: number;
  holes: boolean; // furos de ligação nas laterais
  baseColor: string;
  textColor: string;
  iconColor: string;
};

export const DEFAULT_NAME_PENDANTS: NamePendantsParams = {
  items: "Ana; coração, Pedro; estrela, Thor; pata",
  width: 60,
  base: 2,
  relief: 1,
  border: 2.5,
  holes: true,
  baseColor: "#c9a227",
  textColor: "#1c1c1e",
  iconColor: "#d6262e",
};

const ICON_WORDS: Record<string, PendantIcon> = { coração: "heart", coracao: "heart", pata: "paw", patinha: "paw", estrela: "star", desenho: "art", nenhum: "none", "": "none" };
const HOLE_R = 1.6;
const HOLE_PAD = 3.2; // anel em volta do furo
const TAB_OUT = 2 * HOLE_R + HOLE_PAD; // quanto a orelha do furo passa da base (furo encostado na borda)
const ICON_GAP = 2;
const PLATE_MM = 256;
const GAP_MM = 5;

/** "Ana; coração" → { name: "Ana", icon: "heart" }; ícone desconhecido = coração. */
export function parsePendants(s: string): { name: string; icon: PendantIcon }[] {
  return s
    .split(/[\n,]/)
    .map((l) => l.split(";").map((x) => x.trim()))
    .filter(([n]) => n)
    .map(([name, icon = ""]) => ({ name, icon: ICON_WORDS[icon.toLowerCase()] ?? "heart" }));
}

/**
 * Pingentes de nomes ligáveis: um por pessoa ou pet, com o ícone à esquerda do nome, base que contorna os dois e
 * furos de ligação nas laterais (argolinhas ou corrente passam de um para o outro). Até 3 cores; tudo numa mesa.
 */
export function buildNamePendants(ctx: ModelCtx, p: NamePendantsParams): ModelOutput {
  const { M, text } = ctx;
  const list = parsePendants(p.items);
  if (!list.length) throw new MissingInput("Digite um pingente por linha: Nome; ícone.");
  return scoped((k) => {
    const warnings: string[] = [];
    const pendants: Model[] = list.map(({ name, icon }) => {
      const t = k(text(name, 10)!); // parsePendants só devolve nomes preenchidos
      const [tw, th] = size2(t);
      let iconCs: CS | null = null;
      if (icon === "art") {
        if (ctx.art) iconCs = k(fitInto(ctx.art, 1e6, th * 1.2, 0));
        else warnings.push(`"${name}": envie um desenho para usar como ícone.`);
      } else if (icon !== "none") iconCs = k(ornament(M, icon, th * 1.2));
      const iw = iconCs ? size2(iconCs)[0] : 0;
      // ícone à esquerda do nome, o conjunto centrado; depois tudo escala para a largura pedida
      const x0 = -(iw + (iconCs ? ICON_GAP : 0) + tw) / 2;
      const placedIcon = iconCs ? k(iconCs.translate([x0 + iw / 2, 0])) : null;
      const placedText = k(t.translate([x0 + iw + (iconCs ? ICON_GAP : 0) + tw / 2, 0]));
      const holes = p.holes ? 2 * TAB_OUT : 0;
      const s = (p.width - 2 * p.border - holes) / (iw + (iconCs ? ICON_GAP : 0) + tw);
      const T = k(placedText.scale(s));
      const I = placedIcon ? k(placedIcon.scale(s)) : null;
      let plate = k(backing(M, k(union(M, [T, I])), p.border));
      if (p.holes) {
        const b = plate.bounds();
        const cy = (b.min[1] + b.max[1]) / 2;
        const tabs = [b.min[0] - HOLE_R, b.max[0] + HOLE_R].map((x) => k(k(M.CrossSection.circle(HOLE_R + HOLE_PAD, 32)).translate([x, cy])));
        const bores = tabs.map((c) => { const cb = c.bounds(); return k(k(M.CrossSection.circle(HOLE_R, 24)).translate([(cb.min[0] + cb.max[0]) / 2, cy])); });
        plate = k(k(k(M.CrossSection.union([plate, ...tabs])).hull()).subtract(k(M.CrossSection.union(bores))));
      }
      const parts: Part[] = [{ name: "Base", color: p.baseColor, mesh: solidMesh(k(plate.extrude(p.base))) }, { name: "Nome", color: p.textColor, mesh: slab(T, p.relief, p.base) }];
      if (I) parts.push(...(icon === "art" ? artParts(ctx, I, p.iconColor, "Ícone", p.relief, p.base) : [{ name: "Ícone", color: p.iconColor, mesh: slab(I, p.relief, p.base) }]));
      return { name, parts };
    });
    const laid = layoutOnPlate(pendants, PLATE_MM - 2 * GAP_MM, GAP_MM);
    return { models: laid, warnings: [...new Set(warnings)] };
  });
}
