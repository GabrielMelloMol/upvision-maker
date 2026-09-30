// @vitest-environment happy-dom
import Anthropic from "@anthropic-ai/sdk";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ask, countInputTokens, type AskResult } from "../ai/claude";
import { prepareImage, type RefImage } from "../ai/images";
import { renderScad } from "../ai/render";
import { setSecret } from "../db/repo";
import { renderWithApp, setupTauri } from "../test/harness";
import AskAI from "./AskAI";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
vi.mock("../ai/claude", async (orig) => ({ ...(await orig<typeof import("../ai/claude")>()), ask: vi.fn(), countInputTokens: vi.fn() }));
vi.mock("../ai/render", async (orig) => ({ ...(await orig<typeof import("../ai/render")>()), renderScad: vi.fn() }));
// a imagem de verdade é lida e reduzida num canvas; aqui só o resultado importa
vi.mock("../ai/images", async (orig) => ({ ...(await orig<typeof import("../ai/images")>()), prepareImage: vi.fn() }));

const t = setupTauri();
const askMock = vi.mocked(ask);
const countMock = vi.mocked(countInputTokens);
const prepMock = vi.mocked(prepareImage);
let n = 0;
const fakeImage = (name: string): RefImage => ({ id: `i${n++}`, name, mediaType: "image/jpeg", data: `B64${name}`, width: 100, height: 80, caption: "" });
const reply = (text: string): AskResult => ({ text, costUsd: 0.01, message: { content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 5 } } as unknown as Anthropic.Message });

beforeEach(async () => {
  askMock.mockReset();
  countMock.mockReset();
  prepMock.mockReset();
  vi.mocked(renderScad).mockReset();
  prepMock.mockImplementation(async (f) => fakeImage((f as File).name));
  countMock.mockResolvedValue(2345);
  await setSecret(t.db, "anthropic_api_key", "sk-ant-teste");
  await setSecret(t.db, "ai_model", "claude-sonnet-5");
});

async function start() {
  const user = userEvent.setup();
  const { container } = renderWithApp(<AskAI go={vi.fn()} />);
  await screen.findByText(/Modelo: claude-sonnet-5/);
  return { user, container };
}
const upload = (container: HTMLElement, ...names: string[]) =>
  fireEvent.change(container.querySelector<HTMLInputElement>('input[aria-label="Arquivo de imagem de referência"]')!, { target: { files: names.map((nm) => new File(["x"], nm, { type: "image/jpeg" })) } });

describe("Pedir à IA com imagens de referência (#89)", () => {
  test("anexa, legenda e remove; o custo estimado inclui as imagens; o pedido leva imagens e legendas", async () => {
    const { user, container } = await start();
    upload(container, "foto.jpg", "medida.jpg", "sobra.jpg");
    await screen.findByRole("img", { name: /Imagem 3/ });
    await user.click(screen.getByRole("button", { name: "Remover imagem 3" }));
    await user.type(screen.getByRole("textbox", { name: "Legenda da imagem 1" }), "vista de cima");
    await user.type(screen.getByPlaceholderText(/Descreva a peça/), "porta-copos igual");
    expect(await screen.findByText(/próximo pedido: 2\.345 tokens de entrada com as imagens ≈ US\$ 0\.00/)).toBeInTheDocument();
    const counted = countMock.mock.calls.at(-1)![2].at(-1)!.content as Anthropic.ContentBlockParam[];
    expect(counted.filter((b) => b.type === "image")).toHaveLength(2);

    askMock.mockResolvedValue(reply("Fiz como na foto."));
    await user.click(screen.getByRole("button", { name: "Criar peça" }));
    await waitFor(() => expect(askMock).toHaveBeenCalled());
    const sent = askMock.mock.calls[0][2].at(-1)!.content as Anthropic.ContentBlockParam[];
    expect(sent.map((b) => (b.type === "text" ? b.text : b.type))).toEqual(["Imagem 1: vista de cima", "image", "Imagem 2", "image", "porta-copos igual"]);
    // as miniaturas saem da caixa e aparecem na conversa
    expect(screen.queryByRole("list", { name: "Imagens de referência" })).toBeNull();
    expect(screen.getAllByRole("img", { name: /enviada/ })).toHaveLength(2);
  });

  test("ajuste com imagem: o histórico mantém as imagens anteriores e a nova vai no pedido de ajuste", async () => {
    const { user, container } = await start();
    askMock.mockResolvedValue(reply("Ok."));
    upload(container, "a.jpg");
    await screen.findByRole("img", { name: /Imagem 1/ });
    await user.click(screen.getByRole("button", { name: "Criar peça" }));
    await waitFor(() => expect(askMock).toHaveBeenCalledTimes(1));
    upload(container, "b.jpg");
    await screen.findByRole("img", { name: /Imagem 1: b\.jpg/ });
    await user.type(screen.getByPlaceholderText(/Peça um ajuste/), "deixa igual a esta");
    await user.click(screen.getByRole("button", { name: "Pedir ajuste" }));
    await waitFor(() => expect(askMock).toHaveBeenCalledTimes(2));
    const hist = askMock.mock.calls[1][2];
    const images = hist.flatMap((m) => (Array.isArray(m.content) ? m.content.filter((b) => b.type === "image") : []));
    expect(images).toHaveLength(2);
  });

  test("no máximo 5 por pedido; erro ao abrir a imagem aparece", async () => {
    const { container } = await start();
    upload(container, "1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg");
    expect(await screen.findByText(/Até 5 imagens por pedido: 1 ficou de fora/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("textbox", { name: /Legenda/ })).toHaveLength(5));
    expect(screen.getByRole("button", { name: /Anexar imagem/ })).toBeDisabled();
    prepMock.mockRejectedValueOnce(new Error("Não consegui abrir \"x.jpg\"."));
    await userEvent.setup().click(screen.getByRole("button", { name: "Remover imagem 1" }));
    upload(container, "x.jpg");
    expect(await screen.findByText(/Não consegui abrir "x\.jpg"/)).toBeInTheDocument();
  });
});
