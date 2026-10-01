// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { DEFAULT_SETTINGS } from "../../domain/settings";
import { loadSettings, saveSettings } from "../../db/repo";
import { renderWithApp, setupTauri } from "../../test/harness";
import AmsCard from "./AmsCard";

const t = setupTauri();

test("Meu AMS: escolhe o nº de slots e o filamento de cada slot, e grava na hora nas Preferências (#98, #165)", async () => {
  await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg) VALUES ('PLA', 'Branco', 'Bambu', 110), ('PLA', 'Preto', 'Bambu', 110)");
  const user = userEvent.setup();
  renderWithApp(<AmsCard />);
  await user.click(await screen.findByRole("button", { name: "8 slots" }));
  expect(screen.getAllByRole("combobox")).toHaveLength(8);
  await user.selectOptions(screen.getByLabelText("Slot 1"), "PLA Branco (Bambu)");
  await user.selectOptions(screen.getByLabelText("Slot 3"), "PLA Preto (Bambu)");
  await waitFor(async () => expect((await loadSettings(t.db)).ams).toEqual({ slots: 8, filaments: [1, null, 2, null, null, null, null, null] }));
});

test("filamento excluído do cadastro: o slot aparece vazio; backup antigo sem 'ams' usa o padrão", async () => {
  await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg) VALUES ('PLA', 'Azul', '', 100)");
  await saveSettings(t.db, { ...DEFAULT_SETTINGS, ams: { slots: 4, filaments: [99, 1] } });
  renderWithApp(<AmsCard />);
  expect(await screen.findByLabelText("Slot 1")).toHaveValue("");
  expect(screen.getByLabelText("Slot 2")).toHaveValue("1");
  // preferências gravadas antes da #98 (sem o campo)
  const old = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).filter(([k]) => k !== "ams"));
  await t.db.execute("UPDATE settings SET data = ? WHERE id = 1", [JSON.stringify({ ...old, kwhPrice: 1.1 })]);
  expect((await loadSettings(t.db)).ams).toEqual({ slots: 4, filaments: [] });
});
