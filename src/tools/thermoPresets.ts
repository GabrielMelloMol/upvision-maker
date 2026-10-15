import type { ThermoShape } from "../geometry/thermo/shapes";
import type { ThermoColors } from "../geometry/thermo/build";

/** O que um modelo pronto preenche na Caixinha termoformada; o resto fica como a pessoa deixou. */
export type ThermoPreset = {
  id: string;
  label: string;
  hint: string;
  shape: ThermoShape;
  text: string;
  font: string;
  colors: Partial<ThermoColors>;
};

export const THERMO_PRESETS: ThermoPreset[] = [
  { id: "natal", label: "Natal (coração)", hint: "Coração verde com Feliz Natal em letra cursiva.", shape: "heart", text: "Feliz|Natal", font: "great-vibes", colors: { sheet: "#1f7a4d", border: "#1f7a4d", design: "#f4f4f2", clip: "#1f7a4d" } },
  { id: "bola", label: "Natal (bola)", hint: "Bola de Natal com a alça de cima para o clipe.", shape: "ball", text: "Boas|Festas", font: "pacifico", colors: { sheet: "#0e7490", border: "#0e7490", design: "#ffffff", clip: "#0e7490" } },
  { id: "namorados", label: "Dia dos Namorados", hint: "Coração vermelho com o recado.", shape: "heart", text: "Love you", font: "great-vibes", colors: { sheet: "#c0392b", border: "#c0392b", design: "#f4f4f2", clip: "#c0392b" } },
  { id: "pascoa", label: "Páscoa", hint: "Ovo rosa para bombons.", shape: "egg", text: "Feliz|Páscoa", font: "pacifico", colors: { sheet: "#d6457e", border: "#d6457e", design: "#fff4f8", clip: "#d6457e" } },
  { id: "brinde", label: "Brinde de empresa", hint: "Quadrado arredondado: troque o texto pelo logo da empresa.", shape: "square", text: "Sua marca", font: "montserrat", colors: { sheet: "#6b2d3a", border: "#6b2d3a", design: "#f4f4f2", clip: "#6b2d3a" } },
];
