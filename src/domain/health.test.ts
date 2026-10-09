import { describe, expect, test } from "vitest";
import { businessHealth, type HealthInput } from "./health";

const base: HealthInput = { today: "2026-10-20", month: { revenue: 1000, cogs: 300, expenses: 200, waste: 0, profit: 500 }, lateDueDates: [], lowStock: 0, emptyStock: 0 };
const check = (i: Partial<HealthInput>, id: string) => businessHealth({ ...base, ...i }).checks.find((c) => c.id === id)!;

describe("saúde do negócio (#190)", () => {
  test("tudo em ordem dá verde, com as quatro verificações", () => {
    const h = businessHealth(base);
    expect(h.level).toBe("ok");
    expect(h.checks.map((c) => c.id)).toEqual(["margin", "bills", "late", "stock"]);
  });

  test("margem: prejuízo é vermelho, abaixo de 10% é amarelo, sem vendas não alarma", () => {
    expect(check({ month: { ...base.month, profit: -50 } }, "margin")).toMatchObject({ level: "critical", detail: expect.stringContaining("Prejuízo de") });
    expect(check({ month: { ...base.month, profit: 80 } }, "margin")).toMatchObject({ level: "warn", detail: expect.stringContaining("8%") });
    expect(check({ month: { ...base.month, profit: 100 } }, "margin").level).toBe("ok"); // exatamente 10%
    expect(check({ month: { revenue: 0, cogs: 0, expenses: 0, waste: 0, profit: 0 } }, "margin").level).toBe("ok");
  });

  test("estoque: abaixo do mínimo é amarelo, zerado é vermelho", () => {
    expect(check({ lowStock: 2 }, "stock")).toMatchObject({ level: "warn", detail: "2 itens abaixo do mínimo." });
    expect(check({ lowStock: 3, emptyStock: 1 }, "stock")).toMatchObject({ level: "critical", detail: "1 item zerado (de 3 abaixo do mínimo)." });
  });

  test("atrasados: 1 ou 2 recentes é amarelo; 3 ou mais, ou um com mais de 7 dias, é vermelho", () => {
    expect(check({ lateDueDates: ["2026-10-18"] }, "late")).toMatchObject({ level: "warn", detail: "1 pedido atrasado, o mais antigo há 2 dias." });
    expect(check({ lateDueDates: ["2026-10-18", "2026-10-19"] }, "late").level).toBe("warn");
    expect(check({ lateDueDates: ["2026-10-18", "2026-10-19", "2026-10-19"] }, "late").level).toBe("critical");
    expect(check({ lateDueDates: ["2026-10-12"] }, "late").level).toBe("critical"); // 8 dias
    expect(check({ lateDueDates: ["2026-10-13"] }, "late").level).toBe("warn"); // 7 dias ainda é amarelo
  });

  test("contas: compara com o esperado até hoje; no começo do mês e sem custos não cobra", () => {
    // dia 20 de 31, contas de 200 → esperado ≈ 129
    expect(check({ month: { revenue: 1000, cogs: 300, expenses: 200, waste: 0, profit: 0 } }, "bills").level).toBe("ok"); // sobraram 700
    expect(check({ month: { revenue: 300, cogs: 200, expenses: 200, waste: 0, profit: 0 } }, "bills").level).toBe("warn"); // sobraram 100 (entre 64 e 129)
    expect(check({ month: { revenue: 220, cogs: 200, expenses: 200, waste: 0, profit: 0 } }, "bills").level).toBe("critical"); // sobraram 20
    expect(check({ today: "2026-10-05", month: { revenue: 0, cogs: 0, expenses: 200, waste: 0, profit: -200 } }, "bills").level).toBe("ok");
    expect(check({ month: { ...base.month, expenses: 0 } }, "bills")).toMatchObject({ level: "ok", detail: "Nenhum custo operacional neste mês." });
  });

  test("amostras e erros reduzem o que sobra para as contas", () => {
    expect(check({ month: { revenue: 300, cogs: 100, expenses: 200, waste: 100, profit: 0 } }, "bills").level).toBe("warn"); // 300 − 100 − 100 = 100
    expect(check({ month: { revenue: 300, cogs: 100, expenses: 200, waste: 0, profit: 0 } }, "bills").level).toBe("ok"); // 200
  });

  test("o geral é o pior dos quatro e cada verificação diz o que fazer e para onde ir", () => {
    const h = businessHealth({ ...base, lowStock: 1, lateDueDates: ["2026-10-01"] });
    expect(h.level).toBe("critical");
    for (const c of h.checks) {
      expect(c.todo.length).toBeGreaterThan(5);
      expect(c.page).toBeTruthy();
    }
    expect(businessHealth({ ...base, lowStock: 1 }).level).toBe("warn");
  });
});
