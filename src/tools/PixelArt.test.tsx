// @vitest-environment happy-dom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { loadRaster } from "../vectorize/client";
import PixelArt from "./PixelArt";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
vi.mock("../vectorize/client", async (orig) => ({ ...(await orig<typeof import("../vectorize/client")>()), loadRaster: vi.fn() }));

setupTauri();
const BUILD = { timeout: 20_000 };

// 40×40: metade de cima vermelha, de baixo amarela
beforeEach(() => {
  vi.mocked(loadRaster).mockReset().mockImplementation(async () => {
    const w = 40, h = 40;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba.set(i < (w * h) / 2 ? [214, 40, 40, 255] : [247, 197, 43, 255], i * 4);
    return { rgba, w, h, url: "blob:img" };
  });
});

describe("Pixel art (#95)", () => {
  test("imagem vira grade com legenda em texto (número, filamento, quantidade) e troca de cor", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PixelArt />);
    expect(screen.getByText("Envie uma imagem ou comece em branco.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Pixels no lado maior/));
    await user.type(screen.getByLabelText(/^Pixels no lado maior/), "10");
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "img.png", { type: "image/png" }));
    expect(await screen.findByRole("img", { name: /Grade de pixels, 10 × 10/ })).toBeInTheDocument();
    const legend = screen.getByLabelText("Legenda das cores");
    expect(within(legend).getByText(/Vermelho · 50 pixels/)).toBeInTheDocument();
    expect(within(legend).getByText(/Amarelo · 50 pixels/)).toBeInTheDocument();
    // trocar o vermelho por azul
    await user.selectOptions(within(legend).getAllByRole("combobox")[0], "Azul");
    expect(within(legend).getByText(/Azul · 50 pixels/)).toBeInTheDocument();
    // quebra-cabeça: bandeja + um objeto por cor
    await user.click(screen.getByRole("button", { name: "Quebra-cabeça" }));
    await user.click(screen.getByRole("button", { name: "Cor" }));
    await user.click(screen.getByRole("button", { name: "3D" }));
    expect(await screen.findByRole("button", { name: /STL pixels cor 2 \(50\)/ }, BUILD)).toBeInTheDocument();
  }, 30_000);
});
