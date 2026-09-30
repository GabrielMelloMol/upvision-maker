// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { renderPrograms, renderScad } from "../ai/render";
import type { Model } from "../geometry/types";
import { renderWithApp, setupTauri } from "../test/harness";
import ScadCustomizer from "./ScadCustomizer";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
vi.mock("../ai/render", async (orig) => ({ ...(await orig<typeof import("../ai/render")>()), renderScad: vi.fn(), renderPrograms: vi.fn() }));

setupTauri();
const renderMock = vi.mocked(renderScad);
const programsMock = vi.mocked(renderPrograms);
const mesh = { positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 20, 0, 0, 0, 5]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]) };
const CUBE: Model = { name: "caixa", parts: [{ name: "Peça", color: "#2563eb", mesh }] };
// STL binário de 1 triângulo (84 + 50 bytes)
const STL = (() => {
  const b = new Uint8Array(134);
  new DataView(b.buffer).setUint32(80, 1, true);
  return b;
})();

const SCAD = `/* [Medidas] */
// Largura da caixa
largura = 60; // [20:5:200]
/* [Estilo] */
formato = "redondo"; // [redondo, quadrado]
module caixa() { cube(largura); }
caixa();
`;

beforeEach(() => {
  renderMock.mockReset();
  programsMock.mockReset();
  renderMock.mockImplementation(() => ({ result: Promise.resolve(CUBE), cancel: () => {} }));
  programsMock.mockImplementation((programs) => ({ result: Promise.resolve(programs.map(() => STL)), cancel: () => {} }));
});

async function open(text = SCAD, name = "caixa.scad") {
  const user = userEvent.setup({ applyAccept: false }); // o filtro do seletor não vale ao arrastar: o app confere a extensão
  const { container } = renderWithApp(<ScadCustomizer />);
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  await user.upload(input, new File([text], name));
  return { user, container };
}

test("abas viram seções, parâmetros viram campos e a mudança vai ao OpenSCAD como -D", async () => {
  const { user } = await open();
  expect(await screen.findByRole("heading", { name: "Medidas" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Estilo" })).toBeInTheDocument();
  await waitFor(() => expect(renderMock).toHaveBeenCalled());
  expect(renderMock.mock.calls[0][2]).toMatchObject({ args: [] });
  await user.click(screen.getByRole("button", { name: "quadrado" }));
  const largura = screen.getByLabelText(/Largura da caixa/);
  fireEvent.change(largura, { target: { value: "80" } });
  await waitFor(() => expect(renderMock.mock.calls.at(-1)?.[2]).toMatchObject({ args: ["-D", "largura=80", "-D", 'formato="quadrado"'] }), { timeout: 3000 });
});

test("licença NC avisa que não pode vender; guardar em Meus modelos só com licença escolhida", async () => {
  const { user } = await open();
  const save = await screen.findByRole("button", { name: "Guardar em Meus modelos" });
  expect(save).toBeDisabled();
  await user.selectOptions(screen.getByLabelText("Licença informada pelo autor"), "nc");
  expect(screen.getByText(/não pode vender a peça impressa/)).toBeInTheDocument();
  await user.click(save);
  expect(await screen.findByRole("button", { name: "caixa" })).toBeInTheDocument();
});

test("mesas do MakerWorld (mw_plate_N): um objeto por mesa", async () => {
  await open(`n = 2; // [1:5]\nmodule mw_plate_1() { cube(n); }\nmodule mw_plate_2() { sphere(n); }\n`, "mesas.scad");
  await waitFor(() => expect(programsMock).toHaveBeenCalled());
  const programs = programsMock.mock.calls[0][0];
  expect(programs).toHaveLength(2);
  expect(programs[1]).toMatch(/mw_plate_2\(\);\s*$/);
  expect(await screen.findByText(/2 mesas do MakerWorld/)).toBeInTheDocument();
});

test("arquivo importado pelo .scad: pede o envio antes de renderizar", async () => {
  await open(`import("default.svg");\n`, "logo.scad");
  expect(await screen.findByText("Envie default.svg.")).toBeInTheDocument();
  expect(renderMock).not.toHaveBeenCalled();
});

test("não é .scad: erro claro", async () => {
  await open("x", "peca.stl");
  expect(await screen.findByText("Envie o arquivo .scad do OpenSCAD.")).toBeInTheDocument();
});
