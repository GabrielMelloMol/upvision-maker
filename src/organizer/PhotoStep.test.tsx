// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { printedTone } from "./photo/markers";
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
const load = vi.hoisted(() => ({ focalPx: null as number | null, scene: null as Scene | null }));
vi.mock("./photoFile", () => ({
  loadToolPhoto: async () => ({ img: renderScene(load.scene ?? SCENE, 2), url: "blob:foto", focalPx: load.focalPx }),
}));
const saved = vi.hoisted(() => ({ calls: [] as [string, Uint8Array][] }));
vi.mock("../ui/saveFile", () => ({
  saveFile: async (name: string, data: Uint8Array) => {
    saved.calls.push([name, data]);
    return `/tmp/${name}`;
  },
}));
beforeEach(() => {
  load.scene = null;
  saved.calls = [];
});
// mesa branca do tom do papel, sem sombra: a borda some
const BLANK: Scene = { ...SCENE, table: { tone: 233 } };
const A4 = { widthMm: 210, heightMm: 297 };

const upload = () => userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "ferramentas.jpg", { type: "image/jpeg" }));

describe("PhotoStep (#169)", { timeout: 90_000 }, () => {
  test("acha a folha, mostra os 4 cantos e entrega o contorno de 100 × 40 mm", async () => {
    const onOutlines = vi.fn<(o: ToolOutline[], s: Sheet) => void>();
    render(<PhotoStep onOutlines={onOutlines} />);
    expect(screen.getByRole("list", { name: "Como fotografar" })).toHaveTextContent(/zoom 2x.*sem sombra/); // antes da foto: como fotografar
    await upload();
    expect(await screen.findByRole("button", { name: /Canto 1 da folha/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trocar foto" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Canto \d da folha/ })).toHaveLength(4);
    await waitFor(() => expect(onOutlines).toHaveBeenCalled(), { timeout: 40_000 });
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
    await waitFor(() => expect(onOutlines).toHaveBeenCalled(), { timeout: 40_000 });
    const height = screen.getByLabelText(/Altura das ferramentas/);
    fireEvent.change(height, { target: { value: "10" } });
    const ruler = await screen.findByLabelText(/Comprimento real da Ferramenta 1/, {}, { timeout: 40_000 });
    await userEvent.type(ruler, "120");
    await waitFor(() => expect(screen.getByText(/120,0 × \d/)).toBeInTheDocument());
    expect(onOutlines.mock.lastCall![0][0].heightMm).toBe(10);
  });

  test("canto movido pelo teclado mede de novo", async () => {
    const onOutlines = vi.fn<(o: ToolOutline[], s: Sheet) => void>();
    render(<PhotoStep onOutlines={onOutlines} />);
    await upload();
    await waitFor(() => expect(onOutlines).toHaveBeenCalled(), { timeout: 40_000 });
    const calls = onOutlines.mock.calls.length;
    fireEvent.keyDown(screen.getByRole("button", { name: /Canto 1 da folha/ }), { key: "ArrowLeft", shiftKey: true });
    await waitFor(() => expect(onOutlines.mock.calls.length).toBeGreaterThan(calls), { timeout: 40_000 });
  });

  test("mesa branca sem borda: avisa que não tem certeza dos cantos e destaca os 4 pontos", async () => {
    load.scene = BLANK;
    render(<PhotoStep onOutlines={vi.fn()} />);
    await upload();
    expect(await screen.findByText(/não tenho certeza dos cantos|não achei a folha sozinho/i)).toBeInTheDocument();
    expect(screen.getByText(/fundo escuro embaixo da folha ou use a folha de medição/)).toBeInTheDocument();
    screen.getAllByRole("button", { name: /Canto \d da folha/ }).forEach((c) => expect(c).toHaveClass("low"));
  });

  test("folha de medição na mesa branca: acha pelos marcadores, sem aviso, e mede a ferramenta", async () => {
    load.scene = { ...BLANK, print: (x, y) => printedTone(A4, x, y) };
    const onOutlines = vi.fn<(o: ToolOutline[], s: Sheet) => void>();
    render(<PhotoStep onOutlines={onOutlines} />);
    await upload();
    expect(await screen.findByText(/Achei a folha de medição pelos 4 quadrados/)).toBeInTheDocument();
    screen.getAllByRole("button", { name: /Canto \d da folha/ }).forEach((c) => expect(c).not.toHaveClass("low"));
    await waitFor(() => expect(onOutlines).toHaveBeenCalled(), { timeout: 40_000 });
    expect(onOutlines.mock.lastCall![0]).toHaveLength(1); // marcadores e régua impressos não viram ferramenta
  });

  test("numeração começa em firstNumber na foto e na lista (várias fotos numa gaveta)", async () => {
    const onOutlines = vi.fn<(o: ToolOutline[], s: Sheet) => void>();
    render(<PhotoStep onOutlines={onOutlines} firstNumber={4} />);
    await upload();
    await waitFor(() => expect(onOutlines).toHaveBeenCalled(), { timeout: 40_000 });
    expect(screen.getByRole("list", { name: "Medidas" })).toHaveTextContent("Ferramenta 4");
    expect(screen.getByRole("img", { name: /Contornos medidos/ })).toHaveTextContent("4");
  });

  test("baixa a folha de medição em PDF (A4 e Carta) antes mesmo de escolher a foto", async () => {
    render(<PhotoStep onOutlines={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Folha de medição Carta (PDF)" }));
    await waitFor(() => expect(saved.calls).toHaveLength(1));
    const [name, data] = saved.calls[0];
    expect(name).toBe("folha-de-medicao-carta.pdf");
    expect(new TextDecoder().decode(data.subarray(0, 5))).toBe("%PDF-");
  });
});
