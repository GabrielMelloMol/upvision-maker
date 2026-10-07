// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import PhoneApp from "./PhoneApp";
import PhoneSettingsCard, { groupCode, pairUrl } from "./PhoneSettingsCard";
import type { PhoneSummary } from "./types";

const t = setupTauri();
const SUMMARY: PhoneSummary = {
  orders: [{ id: 7, customer: "Ana", dueDate: "2026-09-20", status: "Pendente", late: true, items: "2× Chaveiro", canFinish: true }],
  filaments: [{ id: 1, name: "PLA Preto", stockG: 150, minG: 200, low: true }],
};

let sent: { path: string; init?: RequestInit }[];
let isPaired: boolean;
beforeEach(() => {
  sent = [];
  isPaired = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      sent.push({ path, init });
      const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (path === "/api/pair") {
        // o código vai no cabeçalho, nunca no corpo: o servidor não lê o corpo de quem ainda não pareou (B25)
        expect(init?.body).toBeUndefined();
        isPaired = (init?.headers as Record<string, string>)["X-UpVision-Code"] === "123456";
        return isPaired ? ok({ ok: true }) : new Response(JSON.stringify({ error: "Código errado." }), { status: 401 });
      }
      if (!isPaired) return new Response(JSON.stringify({ error: "Conecte." }), { status: 401 });
      if (path === "/api/summary") return ok(SUMMARY);
      if (path.endsWith("/consume")) return ok({ stockG: 115 });
      return ok({ ok: true });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("página do celular (#16)", () => {
  test("sem sessão pede o código; código certo conecta e mostra os pedidos com prazo", async () => {
    const user = userEvent.setup();
    render(<PhoneApp />);
    const input = await screen.findByLabelText("Código");
    await user.type(input, "111 111");
    await user.click(screen.getByRole("button", { name: "Conectar" }));
    expect(await screen.findByText("Código errado.")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "123 456");
    await user.click(screen.getByRole("button", { name: "Conectar" }));
    expect(await screen.findByText("#7 Ana")).toBeInTheDocument();
    expect(screen.getByText("atrasado · 20/09")).toBeInTheDocument();
  });

  test("o código no endereço (lido do QR) conecta sozinho e some da barra", async () => {
    history.replaceState(null, "", "/#codigo=123456");
    render(<PhoneApp />);
    expect(await screen.findByText("#7 Ana")).toBeInTheDocument();
    expect(location.hash).toBe("");
  });

  test("marcar pronto e dar baixa mandam o cabeçalho próprio (proteção contra sites de fora)", async () => {
    isPaired = true;
    const user = userEvent.setup();
    render(<PhoneApp />);
    await user.click(await screen.findByRole("button", { name: "Marcar pronto" }));
    expect(await screen.findByText("Pedido #7 marcado como pronto.")).toBeInTheDocument();
    const done = sent.find((s) => s.path === "/api/orders/7/done")!;
    expect((done.init!.headers as Record<string, string>)["X-UpVision"]).toBe("1");

    await user.click(screen.getByRole("button", { name: /Estoque/ }));
    expect(screen.getByText(/150 g · acabando/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Baixa/ }));
    await user.selectOptions(screen.getByLabelText("Filamento"), "1");
    await user.type(screen.getByLabelText("Quanto usou (g)"), "35");
    await user.click(screen.getByRole("button", { name: "Dar baixa" }));
    expect(await screen.findByText("Baixa de 35 g em PLA Preto.")).toBeInTheDocument();
    expect(JSON.parse(String(sent.find((s) => s.path === "/api/filaments/1/consume")!.init!.body))).toEqual({ grams: 35 });
  });
});

describe("Celular: quantidade da baixa (M12)", () => {
  test("1.250 é mil duzentos e cinquenta gramas (com aviso), 35,5 é decimal e texto solto não dá baixa", async () => {
    isPaired = true;
    const user = userEvent.setup();
    render(<PhoneApp />);
    await user.click(await screen.findByRole("button", { name: /Baixa/ }));
    await user.selectOptions(screen.getByLabelText("Filamento"), "1");
    const amount = screen.getByLabelText("Quanto usou (g)");
    await user.type(amount, "1.250");
    expect(screen.getByText(/Entendi "1\.250" como 1\.250\. Se era 1,25/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dar baixa" }));
    await waitFor(() => expect(sent.some((x) => x.path === "/api/filaments/1/consume")).toBe(true));
    expect(JSON.parse(String(sent.filter((x) => x.path === "/api/filaments/1/consume").at(-1)!.init!.body))).toEqual({ grams: 1250 });
    await user.type(amount, "abc");
    expect(screen.getByRole("button", { name: "Dar baixa" })).toBeDisabled();
  });
});

describe("Celular na rede de casa, no computador (#16)", () => {
  const RUNNING = { running: true, url: "http://192.168.0.10:51234/", code: "123456", phones: 1, locked: false };

  test("código em dois grupos e QR com o código embutido", () => {
    expect(groupCode("123456")).toBe("123 456");
    expect(pairUrl(RUNNING)).toBe("http://192.168.0.10:51234/#codigo=123456");
  });

  test("desligado por padrão; ligar mostra endereço e código; Desconectar todos", async () => {
    let state = { running: false, url: "", code: "", phones: 0, locked: false };
    t.handlers["lan_status"] = () => state;
    t.handlers["lan_start"] = () => (state = RUNNING);
    t.handlers["lan_disconnect_all"] = () => (state = { ...RUNNING, code: "654321", phones: 0 });
    const user = userEvent.setup();
    renderWithApp(<PhoneSettingsCard />);
    const toggle = await screen.findByRole("switch", { name: /Deixar o celular ver/ });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(await screen.findByText("http://192.168.0.10:51234/")).toBeInTheDocument();
    expect(screen.getByText("123 456")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /QR Code/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desconectar todos" }));
    await waitFor(() => expect(screen.getByText("654 321")).toBeInTheDocument());
    expect(screen.getByText("Celulares conectados: 0")).toBeInTheDocument();
  });

  test("5 códigos errados travam o pareamento até gerar um código novo", async () => {
    let state = { ...RUNNING, phones: 0, locked: true };
    t.handlers["lan_status"] = () => state;
    t.handlers["lan_new_code"] = () => (state = { ...state, code: "999000", locked: false });
    const user = userEvent.setup();
    renderWithApp(<PhoneSettingsCard />);
    expect(await screen.findByText(/errou o código 5 vezes/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gerar código novo" }));
    expect(await screen.findByText("999 000")).toBeInTheDocument();
    expect(screen.queryByText(/errou o código 5 vezes/)).not.toBeInTheDocument();
  });
});
