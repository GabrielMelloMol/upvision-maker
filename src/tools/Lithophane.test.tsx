// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { loadRaster } from "../vectorize/client";
import Lithophane from "./Lithophane";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
vi.mock("../vectorize/client", async (orig) => ({ ...(await orig<typeof import("../vectorize/client")>()), loadRaster: vi.fn() }));

const t = setupTauri();
const BUILD = { timeout: 20_000 };

/** Degradê horizontal do tamanho pedido pela tela (a largura em pontos vem do fator de escala). */
beforeEach(() => {
  vi.mocked(loadRaster).mockReset().mockImplementation(async (_f, scale) => {
    const w = Math.round(200 * scale(200, 150)), h = Math.round(150 * scale(200, 150));
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba.fill(Math.round(((i % w) / (w - 1)) * 255), i * 4, i * 4 + 3);
      rgba[i * 4 + 3] = 255;
    }
    return { rgba, w, h, url: "blob:foto" };
  });
});

async function withPhoto() {
  const user = userEvent.setup();
  const { container } = renderWithApp(<Lithophane />);
  await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "foto.jpg", { type: "image/jpeg" }));
  return { user, container };
}

describe("Litofania e quadro", () => {
  test("sem foto: prévia vazia", () => {
    renderWithApp(<Lithophane />);
    expect(screen.getByText("Envie uma foto para ver o relevo.")).toBeInTheDocument();
  });

  test("litofania plana em pé: largura pedida e salva 3MF; detalhe fino demais é limitado", async () => {
    const { user } = await withPhoto();
    // abre em "Contra a luz" (original × simulação); o 3D fica no outro botão
    expect(screen.getByRole("img", { name: "Foto original" })).toBeInTheDocument();
    expect(screen.getByText("Contra a luz", { selector: "figcaption span" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "3D" }));
    await user.clear(screen.getByLabelText(/^Largura/));
    await user.type(screen.getByLabelText(/^Largura/), "60");
    expect(await screen.findByText(/^60\.0 × /, undefined, BUILD)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/litofania.3mf")).toBe(true));
    await user.clear(screen.getByLabelText(/^Largura/));
    await user.type(screen.getByLabelText(/^Largura/), "200");
    await user.clear(screen.getByLabelText(/^Detalhe/));
    await user.type(screen.getByLabelText(/^Detalhe/), "0.15");
    expect(await screen.findByText(/Detalhe limitado a 0,50 mm/, undefined, BUILD)).toBeInTheDocument();
  }, 40_000);

  test("quadro por camadas: lista de trocas e pausas; com AMS vira uma parte por cor sem pausa", async () => {
    const { user, container } = await withPhoto();
    await user.click(screen.getByRole("button", { name: "Quadro por camadas" }));
    const list = await screen.findByLabelText("Trocas de filamento", undefined, BUILD);
    expect(list).toHaveTextContent("Comece com");
    expect(list.querySelectorAll("li")).toHaveLength(3); // início + 2 trocas (3 cores padrão)
    expect(screen.getByRole("button", { name: /Projeto do Bambu Studio/ })).toBeInTheDocument();
    // sem AMS a prévia já mostra as 3 faixas coloridas (o arquivo é uma peça só com pausas)
    expect(container.querySelectorAll(".legend span")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "3D" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/quadro-camadas.3mf")).toBe(true));
    const one = strFromU8(unzipSync(t.files.get("/saida/quadro-camadas.3mf")!)["Metadata/model_settings.config"]);
    expect(one.match(/<part /g)).toHaveLength(1);
    await user.click(screen.getByRole("switch", { name: /Uma parte por cor/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Projeto do Bambu Studio/ })).not.toBeInTheDocument(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(strFromU8(unzipSync(t.files.get("/saida/quadro-camadas.3mf")!)["Metadata/model_settings.config"]).match(/<part /g)).toHaveLength(3));
  }, 40_000);
});
