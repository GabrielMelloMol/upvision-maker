// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { loadSettings } from "../../db/repo";
import { renderWithApp, setupTauri } from "../../test/harness";
import SlicerCard from "./SlicerCard";

const t = setupTauri();

test("Ajustes › Fatiador: automático mostra qual vai abrir; escolher grava nas Preferências (#160)", async () => {
  t.handlers["slicers_installed"] = () => [
    { id: "orca", name: "OrcaSlicer", path: "/Applications/OrcaSlicer.app" },
    { id: "bambu", name: "Bambu Studio", path: "/Applications/BambuStudio.app" },
  ];
  const user = userEvent.setup();
  renderWithApp(<SlicerCard />);
  const select = await screen.findByLabelText(/^Abrir no/);
  expect([...(select as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Automático (Bambu Studio)", "Bambu Studio", "OrcaSlicer"]);
  await user.selectOptions(select, "orca");
  await waitFor(async () => expect((await loadSettings(t.db)).slicer).toBe("orca"));
});

test("nenhum instalado: explica o que instalar", async () => {
  t.handlers["slicers_installed"] = () => [];
  renderWithApp(<SlicerCard />);
  expect(await screen.findByText(/Nenhum fatiador encontrado/)).toBeInTheDocument();
});
