// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { pixPayload } from "../domain/pix";
import { qrSvg, wifiPayload } from "../domain/qr";
import { renderWithApp, setupTauri } from "../test/harness";
import QrCode from "./QrCode";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 15_000 };
const saved = (suffix: string) => new TextDecoder().decode([...t.files].find(([p]) => p.endsWith(suffix))![1]);
const COMPANY = { name: "Ateliê da Ana", pixKey: "fulano@exemplo.com", pixName: "Ana Souza", pixCity: "Niterói" };

describe("QR Code e Pix", () => {
  test("Pix: usa os dados da empresa, salva SVG idêntico ao BR Code e copia o copia e cola", async () => {
    await t.db.execute("INSERT INTO company (id, data) VALUES (1, ?)", [JSON.stringify(COMPANY)]);
    const user = userEvent.setup(); // instala um clipboard falso em navigator
    renderWithApp(<QrCode />);
    expect(await screen.findByDisplayValue("fulano@exemplo.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome de quem recebe")).toHaveValue("Ana Souza");
    await user.type(screen.getByLabelText(/Identificador/), "PED 42");
    expect(screen.getByLabelText(/Identificador/)).toHaveValue("PED42");

    const expected = pixPayload({ key: COMPANY.pixKey, name: COMPANY.pixName, city: COMPANY.pixCity, txid: "PED42" });
    expect(screen.getByText(`Pix · ${expected.length} caracteres`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Salvar SVG/ }));
    expect(await screen.findByText("SVG salvo em /saida/pix.svg")).toBeInTheDocument();
    expect(saved("pix.svg")).toBe(qrSvg(expected, 50));

    await user.click(screen.getByRole("button", { name: /Copiar Pix/ }));
    expect(await screen.findByText("Pix copia e cola copiado.")).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(expected);
  });

  test("Pix sem chave: explica o que falta e bloqueia salvar; valor inválido também", async () => {
    const user = userEvent.setup();
    renderWithApp(<QrCode />);
    expect(await screen.findByText("Preencha o conteúdo para ver o QR Code.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar SVG/ })).toBeDisabled();
    await user.type(screen.getByLabelText(/^Chave Pix/), "fulano@exemplo.com");
    await user.type(screen.getByLabelText("Nome de quem recebe"), "Ana");
    await user.type(screen.getByLabelText("Cidade"), "Rio");
    await user.type(screen.getByLabelText(/Valor/), "abc");
    expect(await screen.findByText("Valor do Pix inválido. Ex.: 25,00")).toBeInTheDocument();
  });

  test("copiar falha: toast de erro", async () => {
    await t.db.execute("INSERT INTO company (id, data) VALUES (1, ?)", [JSON.stringify(COMPANY)]);
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("negado"));
    renderWithApp(<QrCode />);
    await screen.findByDisplayValue("fulano@exemplo.com");
    await user.click(screen.getByRole("button", { name: /Copiar Pix/ }));
    expect(await screen.findByText("Não consegui copiar: negado")).toBeInTheDocument();
  });

  test("Wi-Fi: pede o nome da rede; rede aberta esconde a senha; salva com nome da rede", async () => {
    const user = userEvent.setup();
    renderWithApp(<QrCode />);
    await user.click(screen.getByRole("button", { name: "Wi-Fi" }));
    expect(screen.getByText("Informe o nome da rede Wi-Fi.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nome da rede"), "Ateliê");
    await user.type(screen.getByLabelText("Senha"), "abc;12345");
    await user.click(screen.getByRole("button", { name: /Salvar SVG/ }));
    await waitFor(() => expect(t.files.has("/saida/wifi-atelie.svg")).toBe(true));
    expect(saved(".svg")).toBe(qrSvg(wifiPayload({ ssid: "Ateliê", password: "abc;12345", security: "WPA" }), 50));
    await user.click(screen.getByRole("button", { name: "Aberta" }));
    expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
  });

  test("texto e link", async () => {
    const user = userEvent.setup();
    renderWithApp(<QrCode />);
    await user.click(screen.getByRole("button", { name: "Texto" }));
    expect(screen.getByText("Digite o texto do QR Code.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "Obrigada!");
    expect(screen.getByText("Texto · 9 caracteres")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Link" }));
    await user.type(screen.getByLabelText(/^Link/), "instagram.com/loja");
    expect(screen.getByText(/^Link · \d+ caracteres/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar Pix/ })).not.toBeInTheDocument();
  });

  test("3D: placa 50 mm em 2 cores, salva 3MF; lado fora da faixa não gera", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<QrCode />);
    await user.click(screen.getByRole("button", { name: "Texto" }));
    await user.type(screen.getByRole("textbox"), "oi");
    await user.click(screen.getByRole("button", { name: "3D" }));
    expect(await screen.findByText("50.0 × 50.0 × 3.0 mm", undefined, BUILD)).toBeInTheDocument();
    expect(container.querySelectorAll(".legend span")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/qr-code.3mf")).toBe(true));

    await user.clear(screen.getByLabelText(/^Lado/));
    await user.type(screen.getByLabelText(/^Lado/), "5");
    expect(await screen.findByText("Preencha o conteúdo para ver a peça.", undefined, BUILD)).toBeInTheDocument();
  });

  test("cores do 3D e erro ao salvar SVG", async () => {
    t.handlers["plugin:fs|write_file"] = () => {
      throw new Error("sem permissão");
    };
    const user = userEvent.setup();
    const { container } = renderWithApp(<QrCode />);
    await user.click(screen.getByRole("button", { name: "Texto" }));
    await user.type(screen.getByRole("textbox"), "oi");
    await user.click(screen.getByRole("button", { name: /Salvar SVG/ }));
    expect(await screen.findByText(/Não foi possível salvar: .*sem permissão/)).toBeInTheDocument();

    const [base, dark] = container.querySelectorAll<HTMLInputElement>('input[type="color"]');
    fireEvent.input(base, { target: { value: "#ff0000" } });
    fireEvent.input(dark, { target: { value: "#00ff00" } });
    await user.click(screen.getByRole("button", { name: "3D" }));
    await waitFor(() => expect([...container.querySelectorAll<HTMLElement>(".legend i")].map((i) => i.style.background)).toEqual(["#ff0000", "#00ff00"]), BUILD);
  });
});
