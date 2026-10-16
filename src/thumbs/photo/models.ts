import { loadFont } from "../../geometry/fonts";
import { buildKeychain, DEFAULT_KEYCHAIN } from "../../geometry/keychain";
import { getManifold, type CS } from "../../geometry/manifold";
import { buildMedal, DEFAULT_MEDAL } from "../../geometry/medal";
import { buildThermo, thermoDefaults } from "../../geometry/thermo/build";
import { presetSilhouette } from "../../geometry/thermo/shapes";
import { textToCrossSection } from "../../geometry/text";
import type { Model } from "../../geometry/types";
import { buildModels } from "../renderThumb";

/*
 * As 5 peças do protótipo da foto realista (#251): chaveiro com nome, caixa organizadora, medalha, placa Pix e caixinha
 * termoformada. Cada uma com os valores padrão do app (cores trocadas por uma paleta de foto de produto).
 */
export const PHOTO_IDS = ["keychain", "organizer", "medal", "pix", "thermo"] as const;
export type PhotoId = (typeof PHOTO_IDS)[number];

const THERMO_TEXT_MM = 42;
const centered = (cs: CS): CS => {
  const b = cs.bounds();
  return cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
};

export async function photoModels(id: PhotoId): Promise<Model[]> {
  const M = await getManifold();
  const font = await loadFont("hanken");
  const text = (s: string, h: number) => textToCrossSection(M, font, s, h);
  switch (id) {
    case "keychain":
      return [buildKeychain(M, centered(text("Ana", 14)), { ...DEFAULT_KEYCHAIN, baseColor: "#e8613c", topColor: "#fff6ea" }, "Ana")];
    case "organizer":
      return buildModels("organizerBox");
    case "medal":
      return [buildMedal(M, { ...DEFAULT_MEDAL, diameter: 60, baseColor: "#1d4ed8", accentColor: "#f5c542", artColor: "#ffffff" }, null, centered(text("1º LUGAR", 6)))];
    case "pix":
      return buildModels("pix");
    case "thermo": {
      const sil = presetSilhouette(M, "heart", 80);
      const raw = centered(text("Natal", 12));
      const w = raw.bounds().max[0] * 2;
      const design = w > THERMO_TEXT_MM ? centered(raw.scale(THERMO_TEXT_MM / w)) : raw; // cabe na tela do coração
      return [buildThermo(M, sil, design, thermoDefaults()).assembled];
    }
  }
}
