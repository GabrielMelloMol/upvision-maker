// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { money } from "../domain/format";
import { exampleResult, priceSteps } from "../domain/priceExample";
import PricingHow from "./PricingHow";

vi.mock("../db", () => ({ getDb: () => Promise.reject(new Error("sem banco")) }));

describe("Como calculamos o preço (#216)", () => {
  it("mostra um passo por componente, com a regra, a conta do exemplo e o valor", () => {
    render(<PricingHow go={() => {}} />);
    const list = screen.getByRole("list", { name: "Passo a passo da conta" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(priceSteps().length);
    for (const li of items) {
      expect(within(li).getByText("Regra:")).toBeTruthy();
      expect(within(li).getByText("No exemplo:")).toBeTruthy();
    }
    expect(within(items[0]).getByText(/72 g = R\$\s?8,64/)).toBeTruthy();
  });

  it("a soma conferida bate com o custo por peça da Calculadora", () => {
    render(<PricingHow go={() => {}} />);
    const r = exampleResult();
    const sum = screen.getByRole("heading", { name: "Conferindo a soma" }).closest("section")!;
    const text = (sum.textContent ?? "").replace(/\u00a0/g, " ");
    expect(text).toContain(`${money(r.batchCost)} na mesa, ou ${money(r.unitCost)} por peça`.replace(/\u00a0/g, " "));
  });

  it("sem banco a página funciona só com o exemplo; os botões levam às telas certas", async () => {
    const go = vi.fn();
    render(<PricingHow go={go} />);
    const cmp = screen.getByTestId("pricing-compare");
    expect(within(cmp).getByRole("row", { name: /Valor da sua hora/ }).textContent).toMatch(/R\$\s?20,00/);
    expect(within(cmp).getByRole("row", { name: /Canal de venda/ }).textContent).toContain("Shopee: 20% + R$\u00a04,50 (regra de 15/10/2026)");
    expect(within(cmp).getAllByText("—").length).toBeGreaterThan(0); // sem banco, a coluna "os seus" fica vazia
    await userEvent.click(screen.getByRole("button", { name: "Abrir a Calculadora" }));
    expect(go).toHaveBeenCalledWith("calculator");
  });
});
