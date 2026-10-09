import { describe, expect, test } from "vitest";
import { addDaysIso, ConsignmentInput, nextRestock, restockStatus, restockTotal } from "./consignments";

const base = { startDate: "2026-09-01", periodDays: 30, lastRestockAt: null };

describe("reposição de consignado (#184)", () => {
  test("o prazo conta do início do contrato e, depois da 1ª reposição, da última", () => {
    expect(nextRestock(base)).toBe("2026-10-01");
    expect(nextRestock({ ...base, lastRestockAt: "2026-10-05" })).toBe("2026-11-04");
    expect(addDaysIso("2026-12-20", 30)).toBe("2027-01-19");
  });

  test("avisa quantos dias faltam, o dia da reposição e o atraso", () => {
    expect(restockStatus(base, "2026-09-21")).toMatchObject({ days: 10, label: "faltam 10 dias para a reposição", soon: false });
    expect(restockStatus(base, "2026-09-24")).toMatchObject({ days: 7, soon: true });
    expect(restockStatus(base, "2026-09-30").label).toBe("falta 1 dia para a reposição");
    expect(restockStatus(base, "2026-10-01").label).toBe("reposição é hoje");
    expect(restockStatus(base, "2026-10-02").label).toBe("reposição atrasada há 1 dia");
    expect(restockStatus(base, "2026-10-11")).toMatchObject({ days: -10, label: "reposição atrasada há 10 dias", soon: true });
  });

  test("passa o horário de verão sem errar um dia", () => {
    expect(restockStatus({ startDate: "2026-10-10", periodDays: 30, lastRestockAt: null }, "2026-11-08").days).toBe(1);
  });

  test("total em repasse soma qtd × repasse em centavos", () => {
    expect(restockTotal([{ qty: 20, transferPrice: 8.1 }, { qty: 3, transferPrice: 0.33 }])).toBe(162.99);
  });

  test("valida a loja, o prazo e as peças", () => {
    const ok = { customerId: 1, customerName: "Loja", startDate: "2026-09-01", periodDays: 30, notes: "", items: [{ productId: 1, name: "Chaveiro", qty: 10, transferPrice: 8, salePrice: 15 }] };
    expect(ConsignmentInput.safeParse(ok).success).toBe(true);
    expect(ConsignmentInput.safeParse({ ...ok, periodDays: 0 }).success).toBe(false);
    expect(ConsignmentInput.safeParse({ ...ok, items: [] }).success).toBe(false);
    expect(ConsignmentInput.safeParse({ ...ok, startDate: "01/09/2026" }).success).toBe(false);
  });
});
