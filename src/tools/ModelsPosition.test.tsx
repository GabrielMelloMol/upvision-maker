// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Models from "./Models";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

setupTauri();

beforeAll(() => {
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});
const BUILD = { timeout: 30_000 };

async function open(name: string) {
  const user = userEvent.setup();
  const r = renderWithApp(<Models />);
  await user.type(screen.getByRole("searchbox", { name: "Buscar modelo" }), name);
  await user.click(within(screen.getByRole("group", { name: "Modelo" })).getByRole("button", { name }));
  return { user, ...r };
}

describe("posição dos elementos internos (#79)", () => {
  test("cartão: textos e QR aparecem no gizmo; setas movem; Centralizar tudo volta; desfazer desfaz", async () => {
    const { user, container } = await open("Cartão de visita");
    await waitFor(() => expect(container.querySelectorAll(".gizmo-element")).toHaveLength(2), BUILD);
    const [, qr] = container.querySelectorAll<SVGRectElement>(".gizmo-element");
    fireEvent.pointerDown(qr);
    fireEvent.pointerUp(qr);
    const gizmo = container.querySelector<SVGSVGElement>(".decal-gizmo")!;
    for (let i = 0; i < 3; i++) fireEvent.keyDown(gizmo, { key: "ArrowUp", shiftKey: true });
    expect(await screen.findByText(/QR: passa da borda/, undefined, BUILD)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Centralizar tudo" }));
    await waitFor(() => expect(screen.queryByText(/QR: passa da borda/)).toBeNull(), BUILD);
    // um passo atrás no desfazer: volta o deslocamento
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(await screen.findByText(/QR: passa da borda/, undefined, BUILD)).toBeInTheDocument();
  }, 60_000);

  test("Restaurar posição volta a arrumação padrão", async () => {
    const { user } = await open("Cartão de visita");
    await user.click(screen.getByRole("button", { name: "QR em cima" }));
    await user.click(await screen.findByRole("button", { name: "Restaurar posição" }, BUILD));
    expect(screen.getByRole("button", { name: "Texto + QR à direita" })).toHaveAttribute("aria-pressed", "true");
  }, 60_000);
});
