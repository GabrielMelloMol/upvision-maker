// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Model } from "../geometry/types";
import { renderWithApp, setupTauri } from "../test/harness";
import ExportButtons from "./ExportButtons";

/** "Imagem para divulgar" (#211): PNG da peça pronta, com fundo claro, pelo mesmo diálogo de salvar. */
const render = vi.fn<(models: Model[], w: number, h: number, opts: object) => string>(() => "data:image/png;base64,iVBORw0KGgo=");
vi.mock("../thumbs/renderThumb", () => ({ renderModels: (...a: Parameters<typeof render>) => render(...a) }));

const t = setupTauri();
const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
const printed: Model[] = [{ name: "Impressão", parts: [{ name: "A", color: "#000000", mesh }] }];
const assembled: Model[] = [{ name: "Montada", parts: [{ name: "B", color: "#ffffff", mesh }] }];

test("gera o PNG 1600 × 1200 com fundo claro, usa a peça montada quando ela existe e salva como .png", async () => {
  t.handlers["plugin:dialog|save"] = () => "/saida/x-divulgacao.png";
  const user = userEvent.setup();
  renderWithApp(<ExportButtons models={printed} promoModels={assembled} name="Caixa organizadora" />);
  await user.click(screen.getByRole("button", { name: "Imagem para divulgar" }));
  await waitFor(() => expect(render).toHaveBeenCalled());
  const [ms, w, h, opts] = render.mock.calls[0];
  expect(ms).toBe(assembled);
  expect([w, h]).toEqual([1600, 1200]);
  expect(opts).toMatchObject({ png: true, background: 0xf3f4f6 });
  expect(await screen.findByText(/Arquivo salvo em \/saida\/x-divulgacao\.png/)).toBeInTheDocument();
});

test("sem peça montada, usa as do arquivo; se o desenho falhar, avisa em vez de calar", async () => {
  render.mockClear();
  const user = userEvent.setup();
  renderWithApp(<ExportButtons models={printed} name="x" />);
  await user.click(screen.getByRole("button", { name: "Imagem para divulgar" }));
  await waitFor(() => expect(render).toHaveBeenCalled());
  expect(render.mock.calls[0][0]).toBe(printed);
  render.mockImplementationOnce(() => {
    throw new Error("sem WebGL");
  });
  await user.click(screen.getByRole("button", { name: "Imagem para divulgar" }));
  expect(await screen.findByText(/Não foi possível salvar: .*sem WebGL/)).toBeInTheDocument();
});
