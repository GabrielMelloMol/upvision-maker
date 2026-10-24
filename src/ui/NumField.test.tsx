// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import NumField from "./NumField";

function Harness({ initial = 50, onChange }: { initial?: number; onChange?: (n: number) => void }) {
  const [v, setV] = useState(initial);
  return <NumField label="Largura" value={v} min={10} max={100} step={1} hint="Frase de ajuda." slider onChange={(n) => { setV(n); onChange?.(n); }} />;
}

describe("NumField com deslizante", () => {
  test("a caixa de número continua sendo o único campo do rótulo e o deslizante tem outro nome", () => {
    render(<Harness />);
    expect(screen.getByLabelText(/^Largura/)).toHaveAttribute("type", "number");
    const range = screen.getByRole("slider", { name: "Deslizar o valor" });
    expect(range).toHaveAttribute("data-for", "Largura");
    expect(range).toHaveAttribute("min", "10");
    expect(range).toHaveAttribute("max", "100");
    expect(range).toHaveAttribute("step", "1");
    expect(screen.getByText("Frase de ajuda.")).toBeInTheDocument();
    expect(screen.getByText(/Largura \(mm\)/)).toBeInTheDocument();
  });

  test("deslizante e número ficam sincronizados", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "70" } });
    expect(onChange).toHaveBeenLastCalledWith(70);
    expect(screen.getByLabelText(/^Largura/)).toHaveValue(70);
    fireEvent.change(screen.getByLabelText(/^Largura/), { target: { value: "30" } });
    expect(screen.getByRole("slider")).toHaveValue("30");
  });

  test("número fora da faixa fica marcado e o deslizante fica preso na faixa", () => {
    render(<Harness initial={500} />);
    expect(screen.getByLabelText(/^Largura/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("slider")).toHaveValue("100");
    expect(screen.getByText(/Use entre 10 e 100/)).toBeInTheDocument();
  });

  test("digitando, o erro espera sair do campo; depois do 1º erro, some assim que a pessoa corrige (#263)", () => {
    render(<Harness />);
    const box = screen.getByLabelText(/^Largura/);
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "1" } }); // a caminho de "12", mínimo 10
    expect(box).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(/Use entre 10 e 100/)).toBeNull();
    fireEvent.blur(box);
    expect(screen.getByText(/Use entre 10 e 100/)).toBeInTheDocument();
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "12" } });
    expect(screen.queryByText(/Use entre 10 e 100/)).toBeNull();
    fireEvent.change(box, { target: { value: "1" } });
    expect(screen.getByText(/Use entre 10 e 100/)).toBeInTheDocument();
  });

  test("a rodinha do mouse sobre o campo em foco tira o foco, para não mudar o número sem querer (#263)", () => {
    render(<Harness />);
    const box = screen.getByLabelText(/^Largura/);
    box.focus();
    fireEvent.wheel(box, { deltaY: 100 });
    expect(box).not.toHaveFocus();
  });

  test("a dica de cm continua aparecendo enquanto a pessoa digita (#194)", () => {
    render(<NumField label="Largura" value={35} min={100} max={1500} cm onChange={() => {}} />);
    fireEvent.focus(screen.getByLabelText(/^Largura/));
    expect(screen.getByText(/Você quis dizer 35 cm/)).toBeInTheDocument();
  });

  test("sem a prop slider, faixa curta ganha o deslizante sozinha; slider={false} e faixa longa ficam só com o número", () => {
    const { rerender } = render(<NumField label="Largura" value={50} min={10} max={100} onChange={() => {}} />);
    expect(screen.getByRole("slider")).toBeInTheDocument();
    rerender(<NumField label="Largura" value={50} min={10} max={100} slider={false} onChange={() => {}} />);
    expect(screen.queryByRole("slider")).toBeNull();
    rerender(<NumField label="Largura" value={500} min={50} max={1500} onChange={() => {}} />);
    expect(screen.queryByRole("slider")).toBeNull();
  });

  test("sem frase própria, usa a da lista pelo nome do campo e, no fim, a faixa", () => {
    const { rerender } = render(<NumField label="Relevo" value={0.8} min={0.4} max={3} onChange={() => {}} />);
    expect(screen.getByText(/Quanto o desenho sobe acima da base/)).toBeInTheDocument();
    rerender(<NumField label="Campo inventado" value={5} min={1} max={9} onChange={() => {}} />);
    expect(screen.getByText("De 1 a 9 mm.")).toBeInTheDocument();
    rerender(<NumField label="Relevo" value={0.8} min={0.4} max={3} hint="Minha frase." onChange={() => {}} />);
    expect(screen.getByText("Minha frase.")).toBeInTheDocument();
    expect(screen.queryByText(/Quanto o desenho sobe/)).toBeNull();
  });
});
