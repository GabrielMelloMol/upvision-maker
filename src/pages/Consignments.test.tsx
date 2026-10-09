// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { todayIso } from "../domain/orders";
import { addDays } from "../domain/quotes";
import { renderWithApp, setupTauri, type TauriState } from "../test/harness";
import Quotes from "./Quotes";

// As fontes vêm por fetch de URL do Vite no app; aqui lê direto do disco (igual a Quotes.test.tsx).
vi.mock("../pdf/fonts", () => ({
  loadPdfFonts: async () => {
    const font = (n: string) => new Uint8Array(readFileSync(resolve(__dirname, "../assets/pdf-fonts", n)));
    return { regular: font("Inter-Regular.ttf"), semibold: font("Inter-SemiBold.ttf"), bold: font("Inter-Bold.ttf") };
  },
}));

const t = setupTauri();

type Mv = { kind: "filament" | "material" | "product"; id: number; delta: number };
type Change = { orderId: number; expectApplied: boolean; setApplied: boolean; status: string; note: string; appliedPlan: string | null; deliveredAt: string | null };
/** Mesmo contrato do comando Rust apply_stock, sobre o SQLite do teste (como em Orders.test.tsx). */
function installApplyStock(s: TauriState) {
  const col = { filament: ["filaments", "stockG"], material: ["materials", "stock"], product: ["products", "stock"] } as const;
  s.handlers["apply_stock"] = (a) => {
    for (const mv of a.movements as Mv[]) s.raw.prepare(`UPDATE ${col[mv.kind][0]} SET ${col[mv.kind][1]} = ${col[mv.kind][1]} + ? WHERE id = ?`).run(mv.delta, mv.id);
    const o = a.order as Change | null;
    if (o) {
      s.raw.prepare("UPDATE orders SET stockApplied = ?, status = ?, appliedPlan = ?, deliveredAt = ? WHERE id = ?").run(o.setApplied ? 1 : 0, o.status, o.appliedPlan, o.deliveredAt, o.orderId);
      s.raw.prepare("INSERT INTO order_history (orderId, status, note, at) VALUES (?, ?, ?, '2026-10-08 10:00:00')").run(o.orderId, o.status, o.note);
    }
    return null;
  };
}

const seed = () =>
  t.raw.exec(`INSERT INTO company (id, data) VALUES (1, '{"name":"UpVision 3D","city":"Rio de Janeiro","pixKey":"52998224725"}');
    INSERT INTO customers (kind, name, discountPct, active, phone) VALUES ('pj', 'Loja da Bia', 0, 1, '21 9999-0000');
    INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 100, 1000, 1000, 0);
    INSERT INTO products (name, kind, composition, piecesPerPlate, stock, manualPrice, consignmentPrice) VALUES ('Chaveiro', 'simple', '{"filaments":[{"filamentId":1,"grams":10}],"materials":[],"items":[]}', 1, 0, 15, 8);`);

const insertConsignment = (startDaysAgo: number, active = 1) =>
  t.raw
    .prepare("INSERT INTO consignments (customerId, customerName, startDate, periodDays, items, active, createdAt) VALUES (1, 'Loja da Bia', ?, 30, ?, ?, '2026-09-01')")
    .run(addDays(todayIso(), -startDaysAgo), JSON.stringify([{ productId: 1, name: "Chaveiro", qty: 20, transferPrice: 8, salePrice: 15 }]), active);

const pdfs = () => [...t.files.entries()].filter(([p]) => p.endsWith(".pdf"));
const setup = () => {
  installApplyStock(t);
  const user = userEvent.setup();
  renderWithApp(<Quotes go={vi.fn()} />);
  return user;
};

describe("Consignados (#184)", () => {
  test("avisa na tela de Orçamentos quando falta pouco e mostra os dias na lista", async () => {
    seed();
    insertConsignment(25); // reposição em 5 dias
    const user = setup();
    expect(await screen.findByText(/Consignados: Loja da Bia \(faltam 5 dias para a reposição\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver consignados" }));
    const sheet = await screen.findByRole("dialog", { name: "Consignados" });
    expect(within(sheet).getByRole("row", { name: /Loja da Bia/ })).toHaveTextContent("faltam 5 dias para a reposição");
  });

  test("sem prazo próximo não avisa; atrasado aparece com o selo", async () => {
    seed();
    insertConsignment(10); // faltam 20 dias
    const user = setup();
    await user.click(await screen.findByRole("button", { name: "Consignados" }));
    const sheet = await screen.findByRole("dialog", { name: "Consignados" });
    expect(within(sheet).getByRole("row", { name: /Loja da Bia/ })).toHaveTextContent("faltam 20 dias");
    expect(screen.queryByText(/Consignados: Loja da Bia/)).not.toBeInTheDocument();
  });

  test("registrar a reposição cria o pedido de revenda pelo repasse, baixa o estoque, renova o prazo e salva o termo em PDF", async () => {
    seed();
    insertConsignment(35); // atrasada
    t.savePath = (n) => `/saida/${n}`;
    const user = setup();
    await user.click(await screen.findByRole("button", { name: "Consignados" }));
    await user.click(await screen.findByRole("button", { name: "Registrar reposição de Loja da Bia" }));
    const restock = await screen.findByRole("dialog", { name: /Reposição · Loja da Bia/ });
    const qty = within(restock).getByLabelText("Qtd a repor");
    await user.clear(qty);
    await user.type(qty, "5");
    expect(within(restock).getByText(/Total em repasse: R\$\s40,00/)).toBeInTheDocument();
    await user.click(within(restock).getByRole("button", { name: "Registrar reposição" }));
    expect(await screen.findByText(/Termo salvo em \/saida\/reposicao-loja-da-bia-/)).toBeInTheDocument();

    expect(t.raw.prepare("SELECT customerId, customerName, channel, status, stockApplied FROM orders").get()).toEqual({ customerId: 1, customerName: "Loja da Bia", channel: "Revenda", status: "production", stockApplied: 1 });
    expect(t.raw.prepare("SELECT description, qty, unitPrice FROM order_items").get()).toEqual({ description: "Chaveiro", qty: 5, unitPrice: 8 });
    expect((t.raw.prepare("SELECT stockG FROM filaments").get() as { stockG: number }).stockG).toBe(950); // 5 × 10 g
    expect(t.raw.prepare("SELECT lastRestockAt FROM consignments").get()).toEqual({ lastRestockAt: todayIso() });
    expect(new TextDecoder().decode(pdfs()[0][1].subarray(0, 5))).toBe("%PDF-");
  }, 30_000);

  test("encerrar tira a loja do aviso e reativar volta", async () => {
    seed();
    insertConsignment(25);
    const user = setup();
    await user.click(await screen.findByRole("button", { name: "Consignados" }));
    await user.click(await screen.findByRole("button", { name: "Encerrar Loja da Bia" }));
    await waitFor(() => expect(t.raw.prepare("SELECT active FROM consignments").get()).toEqual({ active: 0 }));
    expect(await screen.findByRole("button", { name: "Reativar Loja da Bia" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar reposição de Loja da Bia" })).not.toBeInTheDocument();
  });

  test("salvar o contrato de consignação passa a acompanhar a reposição daquela loja", async () => {
    seed();
    t.savePath = (n) => `/saida/${n}`;
    const user = setup();
    await user.click(await screen.findByRole("button", { name: "Contrato de consignação" }));
    const sheet = await screen.findByRole("dialog", { name: "Contrato de consignação" });
    await user.selectOptions(within(sheet).getByLabelText("Consignatário (loja parceira)"), "Loja da Bia");
    await user.selectOptions(within(sheet).getByLabelText("Adicionar produto"), "Chaveiro");
    await user.click(within(sheet).getByRole("button", { name: "Salvar PDF do contrato" }));
    expect(await screen.findByText(/Contrato salvo em/)).toBeInTheDocument();
    await waitFor(() => expect(t.raw.prepare("SELECT customerName, periodDays, items FROM consignments").get()).toMatchObject({ customerName: "Loja da Bia", periodDays: 30 }));
    expect(JSON.parse((t.raw.prepare("SELECT items FROM consignments").get() as { items: string }).items)).toMatchObject([{ productId: 1, name: "Chaveiro", transferPrice: 8, salePrice: 15 }]);
  }, 30_000);
});
