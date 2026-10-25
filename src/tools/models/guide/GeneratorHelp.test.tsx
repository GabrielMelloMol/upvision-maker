// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import { Box } from "lucide-react";
import { describe, expect, test } from "vitest";
import type { ModelDef } from "../fields";
import { choice, num } from "../fields";
import GeneratorHelp from "./GeneratorHelp";

const base: ModelDef = {
  id: "x",
  category: "organize",
  label: "X",
  blurb: "",
  icon: Box,
  defaults: { width: 180, wall: 2.4, lid: "hinge" },
  sections: [{ title: "Medidas", fields: [num("width", "Largura", 60, 300, { step: 1, hint: (p) => `Por dentro: ${Number(p.width) - 4} mm` }), num("wall", "Parede", 1.2, 4, { hint: "Mais grossa, mais forte." }), choice("lid", "Tampa", [["hinge", "Dobradiça"], ["none", "Sem tampa"]])] }],
  build: () => ({ models: [] }),
  guide: { presets: [], help: { use: ["Parafusos soltos"], avoid: ["Líquidos"], tips: ["Imprima em PETG"], faq: [{ q: "Cabe na mesa?", a: "Até 256 mm." }] } },
};

describe("GeneratorHelp", () => {
  test("não renderiza nada sem guide", () => {
    const { container } = render(<GeneratorHelp def={{ ...base, guide: undefined }} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("vem fechado e lista quando usar, quando não usar, dicas e perguntas", () => {
    const { container } = render(<GeneratorHelp def={base} />);
    expect(container.querySelector("details.gen-help")).not.toHaveAttribute("open");
    expect(screen.getByText("Como usar")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Quando usar" })).toBeInTheDocument();
    expect(screen.getByText("Parafusos soltos")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Quando não usar" })).toBeInTheDocument();
    // as dicas de impressão ficam no recolhível do Salvar 3MF: aqui só com showTips
    expect(screen.queryByText("Imprima em PETG")).toBeNull();
    expect(screen.getByText("Cabe na mesa?").closest("details")).not.toHaveAttribute("open");
  });

  test("a tabela sai dos campos: faixa, padrão, dica (função usa os padrões) e opções", () => {
    render(<GeneratorHelp def={base} />);
    const table = screen.getByRole("table", { name: "Faixas e valores padrão dos campos" });
    const row = (name: string) => within(within(table).getByRole("rowheader", { name })).getByText(name).closest("tr")!;
    expect(within(row("Largura")).getByText("60 a 300 mm")).toBeInTheDocument();
    expect(within(row("Largura")).getByText("180 mm")).toBeInTheDocument();
    // a dica fica numa linha inteira logo abaixo do campo, no mesmo grupo (#277)
    expect(within(row("Largura").closest("tbody")!).getByText("Por dentro: 176 mm").closest("td")).toHaveAttribute("colspan", "3");
    expect(within(row("Parede")).getByText("1,2 a 4 mm")).toBeInTheDocument();
    expect(within(row("Parede")).getByText("2,4 mm")).toBeInTheDocument();
    expect(within(row("Tampa")).getByText("Dobradiça, Sem tampa")).toBeInTheDocument();
  });

  test("showTips mostra as dicas aqui (tela sem botão de salvar)", () => {
    render(<GeneratorHelp def={base} showTips />);
    expect(screen.getByRole("heading", { name: "Dicas de impressão" })).toBeInTheDocument();
    expect(screen.getByText("Imprima em PETG")).toBeInTheDocument();
  });

  test("sem coluna Dica: a tabela tem só campo, faixa e padrão; campo sem frase de ajuda não ganha linha vazia", () => {
    const bare: ModelDef = { ...base, sections: [{ title: "Medidas", fields: [num("width", "Largura", 60, 300, { step: 1 })] }] };
    const { container } = render(<GeneratorHelp def={bare} />);
    expect(screen.queryByRole("columnheader", { name: "Dica" })).toBeNull();
    expect(container.querySelectorAll(".gen-hint")).toHaveLength(0);
    expect(screen.getByRole("columnheader", { name: "Faixa" })).toBeInTheDocument();
  });
});
