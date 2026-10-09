// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { filaments } from "../db/repo";
import { renderWithApp, setupTauri } from "../test/harness";
import { loadRaster } from "../vectorize/client";
import { segmentSubject } from "../vectorize/segment";
import Lithophane from "./Lithophane";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
vi.mock("../vectorize/client", async (orig) => ({ ...(await orig<typeof import("../vectorize/client")>()), loadRaster: vi.fn() }));
vi.mock("../vectorize/segment", () => ({ segmentSubject: vi.fn() }));

const t = setupTauri();
const BUILD = { timeout: 30_000 };

beforeEach(async () => {
  vi.mocked(loadRaster).mockReset().mockImplementation(async (_f, scale) => {
    const w = Math.round(200 * scale(200, 150)), h = Math.round(150 * scale(200, 150));
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba.fill(Math.round(((i % w) / (w - 1)) * 255), i * 4, i * 4 + 3);
      rgba[i * 4 + 3] = 255;
    }
    return { rgba, w, h, url: "blob:foto" };
  });
  // sujeito: metade central da foto
  vi.mocked(segmentSubject).mockReset().mockImplementation(async (_rgba, w, h) => Uint8Array.from({ length: w * h }, (_, i) => (Math.abs((i % w) - w / 2) < w / 4 ? 1 : 0)));
  const base = { material: "PLA", brand: "X", pricePerKg: 80, spoolG: 1000, stockG: 500, minG: 100 };
  for (const [color, td] of [["#1c1c1e", 0.6], ["#8e8e93", null], ["#f8f8f6", 4], ["#6b3a2a", null], ["#e8b89a", null]] as const) await filaments.insert(t.db, { ...base, color, td });
});

async function layered() {
  const user = userEvent.setup();
  const { container } = renderWithApp(<Lithophane />);
  await user.click(screen.getByRole("button", { name: /^Quadro por camadas/ })); // escolha inicial da Foto em relevo
  await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "foto.jpg", { type: "image/jpeg" }));
  await screen.findByLabelText("Trocas de filamento", undefined, BUILD);
  return user;
}

describe("quadro por camadas (#100)", () => {
  test("paleta pronta escolhe os filamentos; TD aparece na lista", async () => {
    const user = await layered();
    expect(screen.getByText(/TD 0,6/)).toBeInTheDocument();
    const warm = screen.getByRole("button", { name: "Retrato quente" });
    await user.click(warm);
    expect(warm).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("checkbox", { name: /#6b3a2a/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /#e8b89a/ })).toBeChecked();
  }, 40_000);

  test("ímã: a pausa entra na lista e no 3MF", async () => {
    const user = await layered();
    await user.click(screen.getByRole("switch", { name: /Encaixe de ímã/ }));
    await waitFor(() => expect(screen.getByLabelText("Trocas de filamento")).toHaveTextContent(/coloque o ímã/), BUILD);
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/quadro-camadas.3mf")).toBe(true));
    const pauses = strFromU8(unzipSync(t.files.get("/saida/quadro-camadas.3mf")!)["Metadata/custom_gcode_per_layer.xml"]);
    expect(pauses.match(/M400 U1/g)).toHaveLength(3); // ímã + 2 trocas
  }, 40_000);

  test("sujeito × fundo: a Silhueta recorta, o fundo fica liso e o contorno do sujeito vira o formato", async () => {
    const user = await layered();
    await user.click(screen.getByRole("button", { name: "Pessoa" }));
    await waitFor(() => expect(segmentSubject).toHaveBeenCalled(), BUILD);
    await user.selectOptions(screen.getByLabelText("Fundo"), "0");
    await user.click(screen.getByRole("button", { name: "Contorno do sujeito" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // a foto e o tipo não mudaram: a Silhueta não roda de novo
    expect(segmentSubject).toHaveBeenCalledTimes(1);
  }, 40_000);
});
