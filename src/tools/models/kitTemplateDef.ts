import type { LucideIcon } from "lucide-react";
import { buildKitTemplate, kitDefaults } from "../../geometry/kit";
import type { KitTemplate } from "../../geometry/kit";
import { as, bool, choice, color, num, text, type Category, type FieldDef, type ModelDef, type Section } from "./fields";

/**
 * Tela de um modelo de kit (KitTemplate): os campos do modelo e, por cima, os do kit (cartão, tamanho e encaixe, cores por
 * grupo, arte em relevo). Para registrar um modelo novo basta `kitTemplateDef(meuKit, { category, icon })` no catálogo.
 */
export function kitTemplateDef(tpl: KitTemplate, o: { category: Category; icon: LucideIcon }): ModelDef {
  const targets = tpl.artTargets ?? [];
  const own: Section[] = tpl.sections.map((s) => ({ title: s.title, fields: s.fields as FieldDef[], when: s.when }));
  const common: Section[] = [
    {
      title: "Cartão",
      fields: [
        text("title", "Nome do kit (gravado na moldura)", 24),
        choice("cardSize", "Tamanho do cartão", [["credit", "Cartão de crédito (85,6 × 54)"], ["medium", "Médio (120 × 85)"], ["large", "Grande (180 × 120)"], ["xlarge", "Maior (240 × 160)"], ["bed", "Mesa inteira (quadrado)"]]),
        bool("compact", "Cartão compacto (encolhe ao conteúdo)"),
        num("copies", "Cartões na mesa", 1, 12, { step: 1, unit: "", hint: "Os cartões pequenos cabem vários numa mesa só." }),
        num("frame", "Largura da moldura", 2, 5, { step: 0.5 }),
        num("runner", "Largura dos galhos", 3, 6, { step: 0.5, hint: "Os galhos ligam a moldura às peças, e cada peça leva seu número." }),
        num("gap", "Comprimento do ponto de corte", 2, 4, { step: 0.5 }),
        num("engrave", "Profundidade do nome e dos números", 0.3, 1, { step: 0.1 }),
      ],
    },
    {
      title: "Tamanho e encaixe",
      fields: [
        num("scale", "Tamanho do modelo", 0.5, tpl.scaleMax ?? 2, { step: 0.05, unit: "×", hint: "1 = o tamanho do projeto. Se não couber no cartão, o app usa um maior." }),
        num("thickness", "Espessura das peças", 1.2, 2, { step: 0.1, hint: "1,6 mm costuma ser firme e imprime rápido." }),
        num("fit", "Folga da fenda", 0.1, 0.4, { step: 0.05, hint: "Somada à espessura: a fenda mede espessura + folga. 0,2 encaixa justo; aumente se ficar duro." }),
        num("pinFit", "Folga do pino no furo", 0.05, 0.4, { step: 0.05, hint: "0,15 prende por pressão; aumente se ficar duro, diminua se soltar." }),
        bool("showAssembled", "Mostrar o modelo montado ao lado (só na prévia)"),
      ],
    },
    { title: "Cores", fields: [color("frameColor", "Cartão e pontos de corte"), color("titleColor", "Nome e números"), ...tpl.palette.map((c) => color(`c_${c.key}`, c.label))] },
  ];
  if (targets.length)
    common.push({
      title: "Arte ou logo em relevo",
      fields: [
        choice("artPart", "Em qual peça", [["", "Sem arte"], ...targets]),
        choice("artFace", "Em qual face", [["front", "Face de cima (a que aparece no cartão)"], ["back", "Face de trás"]]),
        num("artSize", "Tamanho da arte", 20, 100, { step: 5, unit: "%", hint: "Em % da peça." }),
        num("artRelief", "Altura do relevo", 0.2, 1.2, { step: 0.1 }),
        color("c_art", "Cor da arte"),
      ],
    });
  return {
    id: tpl.id,
    category: o.category,
    label: tpl.label,
    blurb: tpl.blurb,
    icon: o.icon,
    font: true,
    ...(targets.length ? { art: "Logo ou arte em relevo (opcional)" } : {}),
    defaults: kitDefaults(tpl),
    sections: [...own, ...common],
    build: (ctx, p) => buildKitTemplate(ctx, tpl, as(p)),
  };
}
