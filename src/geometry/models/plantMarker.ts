import { bedMm } from "../bed";
import { fitInto, scoped } from "../shape2d";
import { MissingInput, roundedRect, slab, type ModelCtx, type ModelOutput } from "./common";

export type PlantMarkerParams = {
  text: string;
  headWidth: number;
  headHeight: number;
  stakeLength: number;
  stakeWidth: number;
  thickness: number;
  relief: number;
  plateColor: string;
  textColor: string;
};
export const DEFAULT_PLANT_MARKER: PlantMarkerParams = {
  text: "Salsa",
  headWidth: 50,
  headHeight: 25,
  stakeLength: 100,
  stakeWidth: 8,
  thickness: 3,
  relief: 0.8,
  plateColor: "#f8f8f6",
  textColor: "#16a34a",
};

const CORNER = 4;
const MARGIN = 4;
const OVERLAP = 1;

/** Marcador de horta ou planta (#121): cabeça com o nome em relevo (outra cor) e haste com ponta para espetar na terra. */
export function buildPlantMarker(ctx: ModelCtx, p: PlantMarkerParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    if (!p.text.trim()) throw new MissingInput("Digite o texto do marcador (o nome da planta).");
    const head = k(k(roundedRect(M, p.headWidth, p.headHeight, CORNER)).translate([0, p.stakeLength + p.headHeight / 2]));
    const half = Math.min(p.stakeWidth, p.headWidth) / 2;
    const stake = k(new M.CrossSection([[[-half, p.stakeLength + OVERLAP], [half, p.stakeLength + OVERLAP], [0, 0]]], "NonZero"));
    const plate = k(M.CrossSection.union([head, stake]));
    const raw = ctx.text(p.text, p.headHeight);
    if (!raw) throw new MissingInput("Digite o texto do marcador (o nome da planta).");
    const label = k(fitInto(k(raw), p.headWidth - 2 * MARGIN, p.headHeight - 2 * MARGIN, p.stakeLength + p.headHeight / 2));
    const warnings = p.stakeLength + p.headHeight > bedMm() ? [`O marcador tem ${Math.round(p.stakeLength + p.headHeight)} mm de comprimento: passa da mesa de ${bedMm()} mm. Diminua a haste.`] : [];
    return {
      models: [
        {
          name: "Marcador",
          parts: [
            { name: "Marcador", color: p.plateColor, mesh: slab(plate, p.thickness) },
            { name: "Texto", color: p.textColor, mesh: slab(label, p.relief, p.thickness) },
          ],
        },
      ],
      warnings,
    };
  });
}
