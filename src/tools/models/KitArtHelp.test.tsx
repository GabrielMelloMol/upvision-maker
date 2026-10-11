// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SvgMask } from "../../vectorize/svgMask";
import KitArtHelp from "./KitArtHelp";
import { KIT_EXAMPLES } from "./kitExamples";

afterEach(cleanup);
const W = 100, H = 60;
const maskOf = (boxes: [number, number, number, number][]): SvgMask => {
  const mask = new Uint8Array(W * H);
  for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * W + x] = 1;
  return { mask, w: W, h: H, url: "data:image/png;base64,AAAA" };
};

describe("ajuda de imagem do Kit card", () => {
  test("sem imagem: mostra o quadro bom/ruim e os 4 exemplos, e o exemplo escolhido sobe", async () => {
    const onExample = vi.fn();
    render(<KitArtHelp art={null} cut={null} onExample={onExample} />);
    expect(screen.getByText("Que imagem funciona")).toBeTruthy();
    for (const t of ["De lado", "Uma figura só", "Fundo liso", "De frente", "Várias coisas", "Fundo bagunçado"]) expect(screen.getByText(t)).toBeTruthy();
    for (const e of KIT_EXAMPLES) expect(screen.getByRole("button", { name: e.label })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Carro" }));
    expect(onExample).toHaveBeenCalledWith(expect.objectContaining({ id: "car", mode: "vehicle" }));
    expect(screen.queryByText("O que o app entendeu")).toBeNull();
  });

  test("imagem boa: mostra a silhueta e confirma", async () => {
    const rasterize = vi.fn().mockResolvedValue(maskOf([[10, 20, 90, 50], [70, 5, 90, 25]]));
    const { default: KitSilhouette } = await import("./KitSilhouette");
    render(<KitSilhouette svg="<svg/>" cut={null} rasterize={rasterize} />);
    await waitFor(() => expect(screen.getByRole("img", { name: /1 figura/ })).toBeTruthy());
    expect(screen.getByText(/Uma figura inteira/)).toBeTruthy();
  });

  test.each([
    ["várias figuras", [[5, 10, 45, 50], [55, 10, 95, 50]], null, /2 figuras separadas/],
    ["vista de frente", [[35, 5, 65, 55]], null, /vista de frente/],
    ["contorno fino", [[5, 10, 95, 12], [5, 48, 95, 50], [5, 10, 7, 50], [93, 10, 95, 50]], null, /contorno é muito fino/],
    ["recorte incerto", [[10, 20, 90, 50], [70, 5, 90, 25]], { method: "color", confidence: 0.3, uncertain: true, warning: "O fundo da foto é bagunçado." }, /Recorte incerto: O fundo da foto é bagunçado/],
  ] as const)("aviso: %s", async (_n, boxes, cut, text) => {
    const rasterize = vi.fn().mockResolvedValue(maskOf(boxes as unknown as [number, number, number, number][]));
    const { default: KitSilhouette } = await import("./KitSilhouette");
    render(<KitSilhouette svg="<svg/>" cut={cut as never} rasterize={rasterize} />);
    await waitFor(() => expect(screen.getByText(text)).toBeTruthy());
    expect(screen.queryByText(/Uma figura inteira/)).toBeNull();
  });
});
