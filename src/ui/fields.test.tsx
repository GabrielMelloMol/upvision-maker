// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import MassField from "./MassField";
import MoneyField from "./MoneyField";
import SmartField from "./SmartField";
import TimeField from "./TimeField";

/** Campo controlado de verdade, como nas telas. */
function Controlled({ as: C, initial = "", ...p }: { as: typeof TimeField | typeof MassField | typeof MoneyField; initial?: string } & Record<string, unknown>) {
  const [v, setV] = useState(initial);
  return <C label="Campo" value={v} onChange={setV} {...p} />;
}

describe("SmartField", () => {
  test("só acusa erro depois de sair do campo; corrige ao digitar", async () => {
    const user = userEvent.setup();
    function Demo() {
      const [v, setV] = useState("");
      return <SmartField label="N" value={v} onChange={setV} parse={Number} invalidText="Não é número." hint="Dica" required preview={(n) => `= ${n}`} />;
    }
    render(<Demo />);
    const input = screen.getByLabelText("N");
    expect(screen.getByText("Dica")).toBeInTheDocument();
    await user.type(input, "abc");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("alert")).toHaveTextContent("Não é número.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    await user.clear(input);
    expect(screen.getByRole("alert")).toHaveTextContent("Obrigatório.");
    await user.type(input, "42");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("= 42")).toBeInTheDocument();
  });

  test("erro externo tem prioridade e onBlur do pai é chamado", async () => {
    const onBlur = vi.fn();
    render(<SmartField label="N" value="1" onChange={() => {}} parse={Number} invalidText="x" error="Já existe." onBlur={onBlur} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Já existe.");
    await userEvent.click(screen.getByLabelText("N"));
    await userEvent.tab();
    expect(onBlur).toHaveBeenCalledOnce();
  });
});

describe("TimeField", () => {
  test("entende 3h20 e mostra a confirmação com minutos", async () => {
    render(<Controlled as={TimeField} />);
    await userEvent.type(screen.getByLabelText("Campo"), "3h20");
    expect(screen.getByText("3h20 (200 min)")).toBeInTheDocument();
  });

  test("número solto em minutos com bare=min; texto inválido explica o formato", async () => {
    const user = userEvent.setup();
    render(<Controlled as={TimeField} bare="min" />);
    const input = screen.getByLabelText("Campo");
    await user.type(input, "15");
    expect(screen.getByText("15 min")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "xyz");
    await user.tab();
    expect(screen.getByRole("alert")).toHaveTextContent("Não entendi o tempo");
  });
});

describe("MassField", () => {
  test("rolos usam o peso do rolo informado", async () => {
    render(<Controlled as={MassField} spoolG={750} />);
    await userEvent.type(screen.getByLabelText("Campo"), "2 rolos");
    expect(screen.getByText("1.500 g (2 rolos)")).toBeInTheDocument();
  });

  test("texto que não é massa mostra erro ao sair", async () => {
    const user = userEvent.setup();
    render(<Controlled as={MassField} />);
    await user.type(screen.getByLabelText("Campo"), "muito");
    await user.tab();
    expect(screen.getByRole("alert")).toHaveTextContent("Use gramas");
  });
});

describe("MoneyField", () => {
  test("formata com 2 casas ao sair do campo e tem prefixo R$", async () => {
    const user = userEvent.setup();
    render(<Controlled as={MoneyField} />);
    const input = screen.getByLabelText("Campo");
    expect(screen.getByText("R$")).toBeInTheDocument();
    await user.type(input, "15,9");
    await user.tab();
    expect(input).toHaveValue("15,90");
  });

  test("valor inválido fica como digitado e mostra erro", async () => {
    const user = userEvent.setup();
    render(<Controlled as={MoneyField} />);
    const input = screen.getByLabelText("Campo");
    await user.type(input, "quinze");
    await user.tab();
    expect(input).toHaveValue("quinze");
    expect(screen.getByRole("alert")).toHaveTextContent("Digite um valor");
  });
});
