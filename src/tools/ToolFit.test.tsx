// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test, vi } from "vitest";
import { renderScene, type Scene } from "../organizer/photo/testPhoto";
import { renderWithApp, setupTauri } from "../test/harness";
import ToolFit from "./ToolFit";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
// foto sintética (a mesma dos testes do PhotoStep): uma caixa de 100 × 40 mm numa A4
const SCENE: Scene = { sheet: { w: 210, h: 297 }, boxes: [{ x: 55, y: 120, w: 100, d: 40, h: 0 }], camera: [140, 260, 420], target: [105, 150, 0], focalPx: 650, size: [800, 600], roll: 5 };
vi.mock("../organizer/photoFile", () => ({ loadToolPhoto: async () => ({ img: renderScene(SCENE, 2), url: "blob:foto", focalPx: null }) }));

const t = setupTauri();
const BUILD = { timeout: 30_000 };
const saved = (name: string) => strFromU8(unzipSync(t.files.get(`/saida/${name}`)!)["3D/3dmodel.model"]);

describe("Organizador pela foto (#169)", () => {
  test("prévia 2D com a medida de cada ferramenta de exemplo e bloco salvo em 3MF", async () => {
    const user = userEvent.setup();
    renderWithApp(<ToolFit />);
    expect(screen.getByRole("img", { name: /Chave de fenda: 190 × 26 mm.*Tesoura: 178 × 56 mm/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/organizador-block.3mf")).toBe(true));
    expect(saved("organizador-block.3mf").match(/<item /g)).toHaveLength(1);
  }, 60_000);

  test("folga pronta preenche o valor; peça de teste sai com um contorno por ferramenta", async () => {
    const user = userEvent.setup();
    renderWithApp(<ToolFit />);
    await user.click(screen.getByRole("button", { name: "Média" }));
    expect(screen.getByRole("spinbutton", { name: /^Folga/ })).toHaveValue(0.6);
    await user.click(screen.getByRole("button", { name: "Teste" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/organizador-test.3mf")).toBe(true));
    expect(saved("organizador-test.3mf").match(/<item /g)).toHaveLength(3);
  }, 60_000);

  test("foto da folha troca os exemplos pelo contorno medido e a peça usa ele", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<ToolFit />);
    expect(screen.getByText(/ferramentas de exemplo/)).toBeInTheDocument();
    expect(screen.queryByText(/Falta a altura/)).not.toBeInTheDocument(); // sem foto, nada a medir
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "ferramentas.jpg", { type: "image/jpeg" }));
    const sheet = await screen.findByRole("img", { name: /Folha de 210 × 297 mm\. Ferramenta 1: 10\d × (39|40|41) mm$/ }, BUILD);
    expect(sheet).toBeInTheDocument();
    // altura 0 não passa calada: aviso com exemplos (#169, óculos)
    expect(screen.getByText(/Falta a altura das ferramentas.*óculos dobrados ~40 mm/)).toBeInTheDocument();
    expect(screen.queryByText(/ferramentas de exemplo/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
  }, 60_000);

  test("ferramenta mais alta que o encaixe: sugere altura × 0,6 com Usar e diz quanto fica para fora (#169)", async () => {
    const user = userEvent.setup();
    renderWithApp(<ToolFit />);
    // exemplos: chave de fenda com 26 mm de altura, encaixe padrão de 12 mm
    expect(screen.getByText(/A ferramenta mais alta tem 26 mm e o encaixe 12 mm: 14 mm ficam para fora/)).toBeInTheDocument();
    expect(screen.getByText(/A peça fica com 14 mm de altura/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Usar 16 mm" }));
    expect(screen.getByRole("spinbutton", { name: /^Profundidade/ })).toHaveValue(16);
    expect(screen.getByText(/10 mm ficam para fora/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Usar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/A peça fica com 18 mm de altura/)).toBeInTheDocument();
  });

  test("gaveta: pede as medidas, bandeja do tamanho das ferramentas e gramas comparadas com a bandeja cheia", async () => {
    const user = userEvent.setup();
    renderWithApp(<ToolFit />);
    await user.click(screen.getByRole("button", { name: "Gaveta" }));
    // rótulos curtos dentro do grupo "Gaveta" (revisão do Quartzo: o longo quebrava e desalinhava)
    const drawer = screen.getByRole("group", { name: "Gaveta" });
    expect(within(drawer).getByRole("spinbutton", { name: /^Largura/ })).toBeInTheDocument();
    expect(within(drawer).getByRole("spinbutton", { name: /^Profundidade/ })).toBeInTheDocument();
    expect(await screen.findByText(/Bandeja de \d+ × \d+ mm \(só o tamanho das ferramentas/, undefined, BUILD)).toBeInTheDocument();
    // gramas e tempo comparados com uma bandeja do tamanho da mesa (#169: 1 óculos virava 248 × 248 mm)
    const cmp = await screen.findByText(/Bandejas do tamanho das ferramentas: ≈ [\d.]+ g .* Uma bandeja do tamanho da mesa \(248 × 248 mm\) gastaria ≈ [\d.]+ g/, undefined, BUILD);
    const [mine, full] = [...cmp.textContent!.matchAll(/≈ ([\d.]+) g/g)].map((m) => Number(m[1].replace(/\./g, "")));
    expect(mine).toBeLessThan(full);
  }, 60_000);

  test("gaveta modular: uma caixinha por ferramenta no mapa (setas movem) e cada mesa num 3MF com nomes (#169)", async () => {
    const user = userEvent.setup();
    renderWithApp(<ToolFit />);
    await user.click(screen.getByRole("button", { name: "Gaveta" }));
    await user.click(screen.getByRole("button", { name: "Caixinhas" }));
    expect(within(screen.getByRole("group", { name: "Gaveta" })).getByRole("spinbutton", { name: /^Altura útil/ })).toBeInTheDocument();
    expect(screen.getByText("Altura das caixinhas", { selector: ".field-label" })).toBeInTheDocument(); // rótulo visível
    // altura: niveladas pela mais alta por padrão; borda de empilhar ligada
    expect(screen.getByRole("button", { name: "Mais alta" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("switch", { name: /Borda de empilhar/ })).toBeChecked();
    const map = screen.getByRole("img", { name: /Gaveta com 9 × 7 casas de 42 mm, frente embaixo; 3 caixinhas; \d+ casas livres\./ });
    expect(within(map).getByText("Frente")).toBeInTheDocument();
    const bins = screen.getAllByRole("button", { name: /^Caixinha \d / });
    expect(bins.map((b) => b.getAttribute("aria-label")!.match(/^Caixinha (\d)/)![1]).sort()).toEqual(["1", "2", "3"]); // mesmo número da lista
    // seta para cima: pelo menos uma caixinha anda (as de trás não batem em nada)
    const before = bins.map((b) => b.getAttribute("aria-label"));
    for (const b of bins) fireEvent.keyDown(b, { key: "ArrowUp" });
    const after = screen.getAllByRole("button", { name: /^Caixinha \d / }).map((b) => b.getAttribute("aria-label"));
    expect(after).not.toEqual(before);
    expect(screen.getByRole("button", { name: "Arrumar de novo sozinho" })).toBeInTheDocument();
    // salvar: base em pedaços e as caixinhas, cada mesa num 3MF
    const saveAll = await screen.findByRole("button", { name: "Salvar todas as mesas numa pasta" }, BUILD);
    // o resumo da grade é informação (azul), não aviso (amarelo)
    const summary = screen.getByText(/^Cabem 9 × 7 casas/);
    expect(summary.closest(".alert")).toHaveClass("info");
    t.openPath = "/pasta";
    await user.click(saveAll);
    await waitFor(() => expect([...t.files.keys()].some((k) => k.startsWith("/pasta/organizador-gaveta-mesa-1"))).toBe(true));
    const all = [...t.files].filter(([k]) => k.startsWith("/pasta/organizador-gaveta-mesa-")).map(([, v]) => strFromU8(unzipSync(v)["3D/3dmodel.model"])).join();
    expect(all).toMatch(/name="Caixinha Chave de fenda \d+×\d+×\d+"/);
    expect(all).toMatch(/name="Caixinha Tesoura/);
    expect(all).toMatch(/name="Base( \d+)?"/);
  }, 120_000);

  test("várias fotos somam ferramentas: numeração contínua, renomear e remover (#169)", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<ToolFit />);
    const upload = () => user.upload(container.querySelector<HTMLInputElement>('.photo-step input[type="file"]')!, new File(["x"], "ferramentas.jpg", { type: "image/jpeg" }));
    await upload();
    const first = await screen.findByRole("textbox", { name: "Nome da ferramenta 1" }, BUILD);
    expect(first).toHaveValue("Ferramenta 1");
    await user.click(screen.getByRole("button", { name: /Adicionar outra foto/ }));
    await upload();
    const second = await screen.findByRole("textbox", { name: "Nome da ferramenta 2" }, BUILD);
    expect(second).toHaveValue("Ferramenta 2");
    // a foto nova numera a partir de 2, como a lista (PhotoStep com firstNumber)
    expect(screen.getByText(/Ferramenta 2/, { selector: ".photo-step *" })).toBeInTheDocument();
    expect(screen.getByText(/2 fotos somadas/)).toBeInTheDocument();
    await user.clear(first);
    await user.type(first, "Alicate");
    expect(screen.getByRole("textbox", { name: "Nome da ferramenta 1" })).toHaveValue("Alicate");
    await user.click(screen.getByRole("button", { name: "Remover Ferramenta 2" }));
    expect(screen.queryByRole("textbox", { name: "Nome da ferramenta 2" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nome da ferramenta 1" })).toHaveValue("Alicate");
  }, 120_000);
  test("gaveta de 35 × 25 digitada em cm: sugere 350 × 250 mm e aceita com um clique (#194)", async () => {
    const user = userEvent.setup();
    renderWithApp(<ToolFit />);
    await user.click(screen.getByRole("button", { name: "Gaveta" }));
    const drawer = within(screen.getByRole("group", { name: "Gaveta" }));
    const w = drawer.getByRole("spinbutton", { name: /^Largura/ }), d = drawer.getByRole("spinbutton", { name: /^Profundidade/ });
    await user.clear(w);
    await user.type(w, "35");
    await user.clear(d);
    await user.type(d, "25");
    expect(drawer.getAllByText(/Use entre 60 e 1\.000 mm \(6 e 100 cm\)/, { selector: "span.error" })).toHaveLength(2);
    await user.click(drawer.getByRole("button", { name: "Usar 350 mm" }));
    await user.click(drawer.getByRole("button", { name: "Usar 250 mm" }));
    expect(w).toHaveValue(350);
    expect(d).toHaveValue(250);
  });
});
