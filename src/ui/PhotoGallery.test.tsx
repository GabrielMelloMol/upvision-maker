// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { photos } from "../db/photosRepo";
import { renderWithApp, setupTauri } from "../test/harness";
import PhotoGallery from "./PhotoGallery";

// sem canvas no happy-dom: a foto já sai pronta, e o ajuste devolve uma imagem conhecida
vi.mock("./photo", () => ({ photoToDataUrl: async (f: File) => `data:image/jpeg;base64,${btoa(f.name)}` }));
vi.mock("./photoEdit", async (orig) => ({ ...(await orig<typeof import("./photoEdit")>()), loadImage: async () => ({ width: 10, height: 10 }), renderEdit: () => "data:image/jpeg;base64,AJUSTADA" }));

const t = setupTauri();
const OWNER = "project:7";
const urls = async () => (await photos.list(t.db, OWNER)).map((p) => p.dataUrl);

test("adicionar por arquivo, a 1ª é a capa; tornar capa e excluir pelo ⋯ (#162)", async () => {
  const user = userEvent.setup();
  renderWithApp(<PhotoGallery owner={OWNER} />);
  await user.upload(screen.getByLabelText("Escolher fotos"), [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.jpg", { type: "image/jpeg" })]);
  await waitFor(async () => expect(await urls()).toEqual([`data:image/jpeg;base64,${btoa("a.jpg")}`, `data:image/jpeg;base64,${btoa("b.jpg")}`]));
  const grid = within(await screen.findByRole("list", { name: "Fotos da peça impressa" }));
  expect(grid.getByText("Capa")).toBeInTheDocument();
  await user.click(grid.getByRole("button", { name: "Ações da foto 2" }));
  await user.click(screen.getByRole("menuitem", { name: "Tornar capa" }));
  await waitFor(async () => expect((await urls())[0]).toBe(`data:image/jpeg;base64,${btoa("b.jpg")}`));
  await user.click(within(screen.getByRole("list", { name: "Fotos da peça impressa" })).getByRole("button", { name: "Ações da foto 2" }));
  await user.click(screen.getByRole("menuitem", { name: "Excluir" }));
  await waitFor(async () => expect(await urls()).toHaveLength(1));
});

test("colar uma imagem adiciona; ajustar troca a foto pela ajustada", async () => {
  const user = userEvent.setup();
  const { container } = renderWithApp(<PhotoGallery owner={OWNER} />);
  const area = container.querySelector(".photo-gallery")!;
  fireEvent.paste(area, { clipboardData: { files: [new File(["c"], "colada.png", { type: "image/png" })] } });
  await waitFor(async () => expect(await urls()).toHaveLength(1));
  await user.click(await screen.findByRole("button", { name: "Ações da foto 1" }));
  await user.click(screen.getByRole("menuitem", { name: /^Ajustar/ }));
  await user.click(await screen.findByRole("button", { name: "Girar para a direita" }));
  await user.click(screen.getByRole("button", { name: "Salvar foto" }));
  await waitFor(async () => expect(await urls()).toEqual(["data:image/jpeg;base64,AJUSTADA"]));
});

test("arquivo que não é imagem é ignorado", async () => {
  const user = userEvent.setup({ applyAccept: false });
  renderWithApp(<PhotoGallery owner={OWNER} />);
  await user.upload(screen.getByLabelText("Escolher fotos"), new File(["x"], "modelo.stl", { type: "model/stl" }));
  await new Promise((r) => setTimeout(r, 50));
  expect(await urls()).toEqual([]);
});
