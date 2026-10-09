// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { loadRaster } from "../vectorize/client";
import { openWith } from "./intent";
import Lithophane from "./Lithophane";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
vi.mock("../vectorize/client", async (orig) => ({ ...(await orig<typeof import("../vectorize/client")>()), loadRaster: vi.fn() }));

const t = setupTauri();
const BUILD = { timeout: 30_000 };

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
  await user.click(screen.getByRole("button", { name: /^Litofania/ })); // escolha inicial (#foto em relevo)
  await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "foto.jpg", { type: "image/jpeg" }));
  return { user, container };
}

describe("Foto em relevo", () => {
  test("começa perguntando o que fazer, com os cinco jeitos; escolher abre a aba e a prévia vazia", async () => {
    const user = userEvent.setup();
    renderWithApp(<Lithophane />);
    expect(screen.getByRole("heading", { name: "Foto em relevo", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "O que você quer fazer?" })).toBeInTheDocument();
    const cards = within(screen.getByRole("region", { name: "O que você quer fazer?" })).getAllByRole("button");
    expect(cards.map((c) => c.querySelector("strong")!.textContent)).toEqual(["Litofania", "Colorida", "Relevo", "Quadro por camadas", "Shadowbox"]);
    expect(screen.queryByText("Envie uma foto para ver o relevo.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Relevo/ }));
    expect(screen.queryByRole("heading", { name: "O que você quer fazer?" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Relevo", pressed: true })).toBeInTheDocument(); // aba
    expect(screen.getByText("Envie uma foto para ver o relevo.")).toBeInTheDocument();
  });

  test("aberto por atalho com a aba pedida (Veja também, busca) pula a escolha", async () => {
    openWith("lithophane", { mode: "relief" });
    renderWithApp(<Lithophane />);
    expect(await screen.findByRole("button", { name: "Relevo", pressed: true })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "O que você quer fazer?" })).not.toBeInTheDocument();
  });

  test("aba Shadowbox embute o modelo de sempre, sem a galeria de Modelos prontos", async () => {
    openWith("lithophane", { mode: "shadowbox" });
    renderWithApp(<Lithophane />);
    expect(await screen.findByRole("heading", { name: "Shadowbox (placas empilhadas)", level: 2 }, { timeout: 30_000 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Modelos prontos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Buscar modelo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shadowbox", pressed: true })).toBeInTheDocument();
  }, 40_000);

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

  test("ligar o AMS bloqueia salvar até o arquivo novo ficar pronto (não salva o de antes, com pausas)", async () => {
    const { user } = await withPhoto();
    await user.click(screen.getByRole("button", { name: "Quadro por camadas" }));
    await screen.findByLabelText("Trocas de filamento", undefined, BUILD);
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("switch", { name: /Uma parte por cor/ }));
    // logo depois do clique o arquivo ainda é o antigo: salvar precisa esperar
    expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/quadro-camadas.3mf")).toBe(true));
    const files = unzipSync(t.files.get("/saida/quadro-camadas.3mf")!);
    expect(strFromU8(files["Metadata/model_settings.config"]).match(/<part /g)).toHaveLength(3);
    expect(files["Metadata/custom_gcode_per_layer.xml"]).toBeUndefined(); // com AMS, sem pausas
  }, 40_000);
});

describe("formatos novos e base de LED (#101)", () => {
  const objects = (name: string) => strFromU8(unzipSync(t.files.get(name)!)["3D/3dmodel.model"]).match(/<item /g)?.length ?? 0;
  const items = (name: string) => [...strFromU8(unzipSync(t.files.get(name)!)["Metadata/model_settings.config"]).matchAll(/<object id="\d+"><metadata key="name" value="([^"]*)"/g)].map((m) => m[1]);

  test("cilindro: pede diâmetro e altura (a largura some), salva o tubo e, com a base de LED, a tampa de baixo e a de cima, tudo no mesmo 3MF", async () => {
    const { user } = await withPhoto();
    await user.selectOptions(screen.getByLabelText("Formato"), "cylinder");
    expect(screen.queryByLabelText(/^Largura/)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Diâmetro \(mm\)/));
    await user.type(screen.getByLabelText(/^Diâmetro \(mm\)/), "60");
    await user.clear(screen.getByLabelText(/^Altura \(mm\)/));
    await user.type(screen.getByLabelText(/^Altura \(mm\)/), "70");
    await user.click(screen.getByRole("switch", { name: "Fazer a base de LED" }));
    await user.click(screen.getByRole("switch", { name: "Tampa de cima" }));
    await user.click(screen.getByRole("button", { name: "3D" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/litofania.3mf")).toBe(true));
    expect(items("/saida/litofania.3mf")).toEqual(["Litofania", "Base de LED", "Tampa da base", "Tampa do abajur"]);
    expect(objects("/saida/litofania.3mf")).toBe(4);
  }, 90_000);

  test("coração com base de fita e pilhas: tipo, largura da fita e alimentação mudam a base; sem a base volta a uma peça", async () => {
    const { user } = await withPhoto();
    await user.selectOptions(screen.getByLabelText("Formato"), "heart");
    expect(screen.queryByLabelText(/^Diâmetro \(mm\)/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Fazer a base de LED" }));
    await user.click(screen.getByRole("button", { name: "Fita" }));
    expect(screen.getByLabelText(/^Largura da fita/)).toHaveValue(10);
    await user.click(screen.getByRole("button", { name: "Pilhas" }));
    expect(screen.getByText(/2 pilhas AAA/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "3D" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/litofania.3mf")).toBe(true));
    expect(items("/saida/litofania.3mf")).toEqual(["Litofania", "Base de LED", "Tampa da base"]);
    t.files.clear();
    await user.click(screen.getByRole("switch", { name: "Fazer a base de LED" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/litofania.3mf")).toBe(true));
    expect(items("/saida/litofania.3mf")).toEqual(["Litofania"]);
  }, 90_000);

  test("curva e caixa não têm base de LED: a seção some do formulário", async () => {
    const { user } = await withPhoto();
    expect(screen.getByRole("switch", { name: "Fazer a base de LED" })).toBeInTheDocument(); // plana
    await user.selectOptions(screen.getByLabelText("Formato"), "curved");
    expect(screen.queryByRole("switch", { name: "Fazer a base de LED" })).not.toBeInTheDocument();
  });

  test("diâmetro ou disco de LED fora dos limites marca o campo e bloqueia a peça", async () => {
    const { user } = await withPhoto();
    await user.selectOptions(screen.getByLabelText("Formato"), "cylinder");
    await user.clear(screen.getByLabelText(/^Diâmetro \(mm\)/));
    await user.type(screen.getByLabelText(/^Diâmetro \(mm\)/), "500");
    expect(await screen.findByText(/Use entre 30 e 150/)).toBeInTheDocument();
  });
  test("litofania colorida: pede 5 filamentos, avisa do TD e salva um volume por cor", async () => {
    const { user } = await withPhoto();
    await user.click(screen.getByRole("button", { name: "Colorida" }));
    expect(await screen.findByText(/5 filamentos ao mesmo tempo/, undefined, BUILD)).toBeInTheDocument();
    expect(screen.getByText(/Sem TD cadastrado para ciano/)).toBeInTheDocument();
    expect(screen.getByLabelText("Filamento ciano")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "3D" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/litofania-colorida.3mf")).toBe(true));
    const cfg = strFromU8(unzipSync(t.files.get("/saida/litofania-colorida.3mf")!)["Metadata/model_settings.config"]);
    expect(cfg.match(/<part /g)!.length).toBeGreaterThanOrEqual(4);
  }, 90_000);

  test("TD preenchido some com o aviso daquela tinta", async () => {
    const { user } = await withPhoto();
    await user.click(screen.getByRole("button", { name: "Colorida" }));
    await screen.findByText(/Sem TD cadastrado para ciano/, undefined, BUILD);
    for (const nome of ["ciano", "magenta", "amarelo", "preto"]) {
      await user.clear(screen.getByLabelText(new RegExp(`^TD ${nome}`)));
      await user.type(screen.getByLabelText(new RegExp(`^TD ${nome}`)), "2");
    }
    await waitFor(() => expect(screen.queryByText(/Sem TD cadastrado/)).not.toBeInTheDocument(), BUILD);
  }, 90_000);
  test("relevo: placa deitada numa cor, profundidade pedida e 3MF salvo", async () => {
    const { user } = await withPhoto();
    await user.click(screen.getByRole("button", { name: "Relevo" }));
    expect(screen.queryByRole("button", { name: "Contra a luz" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Profundidade/));
    await user.type(screen.getByLabelText(/^Profundidade/), "4");
    await user.clear(screen.getByLabelText(/^Base/));
    await user.type(screen.getByLabelText(/^Base/), "1");
    expect(await screen.findByText(/× 5\.0 mm/, undefined, BUILD)).toBeInTheDocument(); // base + profundidade = 5 mm de altura
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/relevo.3mf")).toBe(true));
  }, 90_000);

  test("relevo: profundidade fora do limite marca o campo e bloqueia a peça", async () => {
    const { user } = await withPhoto();
    await user.click(screen.getByRole("button", { name: "Relevo" }));
    await user.clear(screen.getByLabelText(/^Profundidade/));
    await user.type(screen.getByLabelText(/^Profundidade/), "50");
    expect(await screen.findByText(/Use entre 0,5 e 10/)).toBeInTheDocument();
  });
});
