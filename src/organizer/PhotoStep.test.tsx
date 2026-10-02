// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { renderScene, type Scene } from "./photo/testPhoto";
import PhotoStep from "./PhotoStep";
import type { Sheet, ToolOutline } from "./types";

// foto sintética menor (800 × 600) no lugar de decodificar um arquivo de verdade
const SCENE: Scene = {
  sheet: { w: 210, h: 297 },
  boxes: [{ x: 55, y: 120, w: 100, d: 40, h: 0 }],
  camera: [140, 260, 420],
  target: [105, 150, 0],
  focalPx: 650,
  size: [800, 600],
  roll: 5,
};
const load = vi.hoisted(() => ({ focalPx: null as number | null }));
vi.mock("./photoFile", () => ({
  loadToolPhoto: async () => ({ img: renderScene(SCENE, 2), url: "blob:foto", focalPx: load.focalPx }),
}));

const upload = () => userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "ferramentas.jpg", { type: "image/jpeg" }));

describe("PhotoStep (#169)", { timeout: 30_000 }, () => {
  test("acha a folha, mostra os 4 cantos e entrega o contorno de 100 × 40 mm", async () => {
    const onOutlines = vi.fn<(o: ToolOutline[], s: Sheet) => void>();
    render(<PhotoStep onOutlines={onOutlines} />);
    expect(screen.getByRole("list", { name: "Como fotografar" })).toHaveTextContent(/zoom 2x.*sem sombra/); // antes da foto: como fotografar
    await upload();
    expect(await screen.findByRole("button", { name: /Canto 1 da folha/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trocar foto" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Canto \d da folha/ })).toHaveLength(4);
    await waitFor(() => expect(onOutlines).toHaveBeenCalled(), { timeout: 10_000 });
    const [outlines, sheet] = onOutlines.mock.lastCall!;
    expect(sheet).toEqual({ widthMm: 210, heightMm: 297 });
    expect(outlines).toHaveLength(1);
    expect(screen.getByText(/× 40,\d mm/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Contornos medidos na folha de 210 × 297 mm/ })).toBeInTheDocument(); // em cima da foto
    expect(screen.getByRole("list", { name: "Medidas" })).toHaveTextContent("Ferramenta 1");
  });

  test("sem EXIF e com altura: pede o comprimento medido com régua e reescala", async () => {
    const onOutlines = vi.fn<(o: ToolOutline[], s: Sheet) => void>();
    render(<PhotoStep onOutlines={onOutlines} />);
    await upload();
    await waitFor(() => expect(onOutlines).toHaveBeenCalled(), { timeout: 10_000 });
    const height = screen.getByLabelText(/Altura das ferramentas/);
    fireEvent.change(height, { target: { value: "10" } });
    const ruler = await screen.findByLabelText(/Comprimento real da Ferramenta 1/, {}, { timeout: 10_000 });
    await userEvent.type(ruler, "120");
    await waitFor(() => expect(screen.getByText(/120,0 × \d/)).toBeInTheDocument());
    expect(onOutlines.mock.lastCall![0][0].heightMm).toBe(10);
  });

  test("canto movido pelo teclado mede de novo", async () => {
    const onOutlines = vi.fn<(o: ToolOutline[], s: Sheet) => void>();
    render(<PhotoStep onOutlines={onOutlines} />);
    await upload();
    await waitFor(() => expect(onOutlines).toHaveBeenCalled(), { timeout: 10_000 });
    const calls = onOutlines.mock.calls.length;
    fireEvent.keyDown(screen.getByRole("button", { name: /Canto 1 da folha/ }), { key: "ArrowLeft", shiftKey: true });
    await waitFor(() => expect(onOutlines.mock.calls.length).toBeGreaterThan(calls), { timeout: 10_000 });
  });
});
