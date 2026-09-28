// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import type { Model } from "../geometry/types";
import { renderWithApp, setupTauri } from "../test/harness";
import ExportButtons from "./ExportButtons";

const t = setupTauri();
const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
const model = (name: string): Model => ({ name, parts: [{ name, color: "#000000", mesh }] });

test("vários objetos: um STL por objeto com o nome no arquivo; 3MF junta tudo", async () => {
  const user = userEvent.setup();
  renderWithApp(<ExportButtons models={[model("Cortador"), model("Carimbo")]} name="Coração Grande" />);
  await user.click(screen.getByRole("button", { name: "STL carimbo" }));
  await waitFor(() => expect(t.files.has("/saida/coracao-grande-carimbo.stl")).toBe(true));
  expect(t.files.get("/saida/coracao-grande-carimbo.stl")!.byteLength).toBe(84 + 50);
  await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
  expect(await screen.findByText("Arquivo salvo em /saida/coracao-grande.3mf")).toBeInTheDocument();
});

test("sem modelos ou ocupado: desabilitado", () => {
  const { rerender } = renderWithApp(<ExportButtons models={[]} name="x" />);
  expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeDisabled();
  rerender(<ExportButtons models={[model("A")]} name="x" busy />);
  expect(screen.getByRole("button", { name: /Salvar STL/ })).toBeDisabled();
});

test("falha ao gravar vira toast de erro", async () => {
  t.handlers["plugin:fs|write_file"] = () => {
    throw new Error("disco cheio");
  };
  const user = userEvent.setup();
  renderWithApp(<ExportButtons models={[model("A")]} name="x" />);
  await user.click(screen.getByRole("button", { name: /Salvar STL/ }));
  expect(await screen.findByText(/Não foi possível salvar: .*disco cheio/)).toBeInTheDocument();
});
