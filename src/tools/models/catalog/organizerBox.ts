import { PackageOpen } from "lucide-react";
import { buildOrganizerBox } from "../../../geometry/models/organizerBox";
import { dimsOf, deriveOrganizer, DEFAULT_ORGANIZER, MATERIALS, type OrganizerParams } from "../../../geometry/models/organizer/params";
import { as, bool, choice, color, num, text, type FieldDef, type ModelDef, type Params } from "../fields";
import { ORGANIZER_GUIDE } from "../organizer/guide";
import { fitDefaults } from "../fitDefaults";

const br = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const slide = (k: string, label: string, min: number, max: number, hint: string | ((p: Params) => string), extra: Partial<Extract<FieldDef, { kind: "num" }>> = {}): FieldDef => num(k, label, min, max, { slider: true, hint, ...extra });
/** A outra leitura da medida: por fora mostra a de dentro, por dentro mostra a de fora. */
const other = (axis: "W" | "D" | "H") => (p: Params): string => {
  const d = dimsOf(as<OrganizerParams>(p));
  const inner = as<OrganizerParams>(p).measure === "inner";
  const v = axis === "W" ? (inner ? d.outerW : d.innerW) : axis === "D" ? (inner ? d.outerD : d.innerD) : inner ? d.totalH : d.depth;
  const what = axis === "H" ? (inner ? "Altura total com a tampa" : "Profundidade dos nichos") : inner ? "Por fora" : "Por dentro";
  return `${what}: ${br(v)} mm.`;
};

/** Caixa organizadora (#204): sugestões por uso, 4 jeitos de dividir, tampa de dobradiça com trava, nome, 4 vistas e ajuda. */
export const ORGANIZER_BOX_MODEL: ModelDef = {
  id: "organizerBox",
  category: "organize",
  label: "Caixa organizadora",
  blurb: "Caixa de nichos para parafusos, componentes e bijuterias: escolha o uso, ajuste as medidas e veja as divisórias, a tampa com dobradiça e trava e as peças na mesa.",
  icon: PackageOpen,
  font: true,
  fontSection: 4,
  artSection: 4,
  art: "Desenho na tampa (opcional)",
  defaults: DEFAULT_ORGANIZER,
  liveDefaults: () => fitDefaults({ hingeClearance: "hingeClearance", latchReach: "latchReach" }), // as folgas validadas no Kit de testes (#247)
  guide: ORGANIZER_GUIDE,
  derive: (changed, value, p, prev) => deriveOrganizer(changed, value, p, prev),
  sections: [
    {
      title: "Medidas",
      fields: [
        choice("measure", "Medir", [["outer", "Por fora"], ["inner", "Por dentro"]]),
        slide("outerW", "Largura", 60, 300, other("W"), { step: 1 }),
        slide("outerD", "Profundidade", 50, 300, other("D"), { step: 1 }),
        slide("outerH", "Altura", 18, 120, other("H"), { step: 1 }),
      ],
    },
    {
      title: "Divisórias",
      fields: [
        choice("layoutMode", "Jeito de dividir", [["equal", "Iguais"], ["mixed", "Largos + pequenos"], ["channel", "Canal longo"], ["custom", "Faixa por faixa"]], true),
        { k: "map", kind: "dividerMap", label: "Mapa das divisórias" },
        slide("cols", "Nichos na largura", 1, 10, "Quantos nichos lado a lado. No modo Faixa por faixa vale o que você montar abaixo.", { step: 1, unit: "" }),
        slide("rows", "Fileiras", 1, 8, "Quantas fileiras da frente ao fundo.", { step: 1, unit: "" }),
        { k: "strips", kind: "strips", label: "Faixas" },
      ],
    },
    {
      title: "Paredes",
      fields: [
        slide("wall", "Parede", 1.2, 5, "2,4 mm (6 perímetros de 0,4) é firme sem gastar muito filamento.", { step: 0.1 }),
        slide("divider", "Divisória", 1.2, 5, "Parede entre os nichos. 1,2 mm cabe mais nichos; 2 mm é mais resistente.", { step: 0.1 }),
        slide("floor", "Fundo", 1.2, 6, "Espessura do chão. Com a opção empilhável, deixe 2,4 mm ou mais.", { step: 0.1 }),
        slide("outerRadius", "Canto de fora", 0, 15, "Arredondado por fora, bom para a mão e para a impressão.", { step: 0.5 }),
        slide("cellRadius", "Canto do nicho", 0, 8, "Arredonda o canto de dentro de cada nicho: fica fácil tirar parafuso.", { step: 0.5 }),
      ],
    },
    {
      title: "Tampa",
      fields: [
        choice("lid", "Tipo", [["hinge", "Dobradiça"], ["snap", "Encaixe"], ["slide", "Deslizante"], ["none", "Sem tampa"]], true),
        slide("lidT", "Espessura da tampa", 1.6, 4, "2,4 mm fica firme e deixa o pino bem preso.", { step: 0.1 }),
        choice("material", "Material", MATERIALS),
        slide("latchClearance", "Folga da trava", 0.15, 0.6, "Dura demais, aumente 0,05; solta demais, diminua. O material já ajusta o padrão.", { step: 0.05 }),
        slide("hingeClearance", "Folga do pino da dobradiça", 0.15, 0.6, "Pino preso: aumente 0,05; tampa balançando: diminua. O Kit de testes (Ajustes) acha o seu valor.", { step: 0.05 }),
        slide("latchReach", "Profundidade do gancho da trava", 0.6, 2, "Gancho fundo prende firme; raso solta fácil. O Kit de testes (Ajustes) acha o seu valor.", { step: 0.1 }),
        bool("handle", "Puxador (peça para colar na tampa)"),
        bool("stackable", "Empilhável (anel na tampa e rebaixo no fundo)"),
        bool("labelSlot", "Porta-etiqueta na frente (rebaixo de 32 × 17 mm)"),
      ],
    },
    {
      title: "Nome e cores",
      fields: [
        choice("labelPlace", "Onde vai o nome", [["none", "Sem nome"], ["lid", "Na tampa"], ["sideLong", "Lateral maior"], ["sideShort", "Lateral menor"]], true),
        text("text", "Nome", 24),
        choice("textMode", "Como grava", [["inlay", "Embutido"], ["raised", "Em relevo"], ["engraved", "Gravado"]]),
        slide("textSize", "Altura das letras", 4, 40, "Se o nome não couber na lateral ou na tampa, o app reduz sozinho.", { step: 1 }),
        slide("relief", "Relevo ou gravação", 0.4, 1.6, "Quanto o nome sobe ou afunda. 0,6 mm dá duas cores bem definidas.", { step: 0.1 }),
        slide("artSize", "Altura do desenho", 10, 150, "Só vale se você enviar um desenho para a tampa.", { step: 1 }),
        color("boxColor", "Caixa"),
        color("lidColor", "Tampa"),
        color("decorColor", "Nome e desenho"),
      ],
    },
  ],
  build: (ctx, p) => buildOrganizerBox(ctx, as<OrganizerParams>(p)),
};
