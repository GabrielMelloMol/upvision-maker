// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { MonthPoint } from "../domain/finance";
import { HBars, MonthlyBars, ProfitBars, StatTile, monthLabel } from "./charts";

const months = (n: number, f: (i: number) => Partial<MonthPoint> = () => ({})): MonthPoint[] =>
  Array.from({ length: n }, (_, i) => ({ month: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, revenue: 0, costs: 0, profit: 0, ...f(i) }));
const axis = (c: HTMLElement) => [...c.querySelectorAll("text.viz-axis")].map((e) => e.textContent);

describe("charts", () => {
  test("monthLabel", () => {
    expect(monthLabel("2026-01")).toBe("jan/26");
    expect(monthLabel("2025-12")).toBe("dez/25");
  });

  test("MonthlyBars: eixo em degraus redondos, 'mil' e rótulos de mês espaçados acima de 12 meses", () => {
    const { container } = render(<MonthlyBars data={months(24, (i) => ({ revenue: i === 3 ? 1800 : 100, costs: 50 }))} />);
    expect(screen.getByRole("img", { name: "Receita e custos por mês, 24 meses" })).toBeInTheDocument();
    const labels = axis(container);
    expect(labels.slice(0, 5)).toEqual(["0", "500", "1 mil", "1,5 mil", "2 mil"]); // máx 1800 → 2000
    expect(labels.slice(5)).toEqual(["jan/24", "mar/24", "mai/24", "jul/24", "set/24", "nov/24", "jan/25", "mar/25", "mai/25", "jul/25", "set/25", "nov/25"]);
    expect(container.querySelectorAll("path.viz-s1")).toHaveLength(24);
  });

  test("MonthlyBars: tudo zero não desenha barras e usa eixo 0–1", () => {
    const { container } = render(<MonthlyBars data={months(2)} />);
    expect(container.querySelectorAll("path")).toHaveLength(0);
    expect(axis(container).slice(0, 5)).toEqual(["0", "0,25", "0,5", "0,75", "1"]);
  });

  test("ProfitBars: eixo divergente com teto e piso; lucro zero não desenha barra", () => {
    const { container } = render(<ProfitBars data={months(3, (i) => ({ profit: [300, -40, 0][i] }))} />);
    expect(axis(container).slice(0, 3)).toEqual(["0", "500", "-50"]);
    expect(container.querySelectorAll("path.viz-s1")).toHaveLength(1);
    expect(container.querySelectorAll("path.viz-bad")).toHaveLength(1);
  });

  test("ProfitBars: só positivo não mostra piso", () => {
    const { container } = render(<ProfitBars data={months(1, () => ({ profit: 7 }))} />);
    expect(axis(container)).toEqual(["0", "10", "jan/24"]);
  });

  test("HBars: formato próprio, título acessível e vazio", () => {
    const { container, rerender } = render(<HBars rows={[{ label: "A", value: 4 }, { label: "B", value: 1 }]} format={(n) => `${n} un`} />);
    expect(screen.getByTitle("A: 4 un")).toBeInTheDocument();
    expect([...container.querySelectorAll<HTMLElement>(".hbars-bar")].map((b) => b.style.width)).toEqual(["100%", "25%"]);
    rerender(<HBars rows={[]} />);
    expect(screen.getByText("Sem vendas entregues no período.")).toBeInTheDocument();
  });

  test("StatTile: queda boa quando subir é ruim, queda ruim no padrão, zero sem seta", () => {
    const { container, rerender } = render(<StatTile label="Custo" value="R$ 1" delta={-12.4} upIsGood={false} />);
    expect(container.querySelector(".stat-delta")).toHaveClass("good");
    expect(container.querySelector(".stat-delta")).toHaveTextContent("▼ 12% vs. período anterior");
    rerender(<StatTile label="Receita" value="R$ 1" delta={-50} />);
    expect(container.querySelector(".stat-delta")).toHaveClass("bad");
    rerender(<StatTile label="Receita" value="R$ 1" delta={0} hint="dica" />);
    expect(container.querySelector(".stat-delta")).toBeNull();
    expect(screen.queryByText("sem base para comparar")).not.toBeInTheDocument();
    expect(screen.getByText("dica")).toBeInTheDocument();
  });
});
