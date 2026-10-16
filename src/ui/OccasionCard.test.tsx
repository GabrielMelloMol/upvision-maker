// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { takeIntent } from "../tools/intent";
import OccasionCard from "./OccasionCard";

describe("destaque da ocasião (#120)", () => {
  test("perto do Dia das Mães mostra o cartão e abre a Criar na coleção", async () => {
    const go = vi.fn();
    render(<OccasionCard go={go} today={new Date(2026, 3, 20)} />);
    expect(screen.getByText("Para o Dia das Mães")).toBeTruthy();
    expect(screen.getByText(/faltam 20 dias · \d+ modelos prontos/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button"));
    expect(go).toHaveBeenCalledWith("create");
    expect(takeIntent("create")).toEqual({ occasion: "maes" });
  });

  test("já na Criar, filtra ali mesmo (onPick) sem trocar de tela", async () => {
    const go = vi.fn();
    const onPick = vi.fn();
    render(<OccasionCard go={go} today={new Date(2026, 3, 20)} onPick={onPick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onPick).toHaveBeenCalledWith("maes");
    expect(go).not.toHaveBeenCalled();
  });

  test("no dia da ocasião diz que é hoje; sem ocasião perto, não aparece", () => {
    const { container, rerender } = render(<OccasionCard go={() => {}} today={new Date(2026, 11, 25)} />);
    expect(screen.getByText(/é hoje/)).toBeTruthy();
    rerender(<OccasionCard go={() => {}} today={new Date(2026, 0, 15)} />);
    expect(container.textContent).toBe("");
  });
});
