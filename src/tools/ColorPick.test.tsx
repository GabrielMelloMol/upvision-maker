// @vitest-environment happy-dom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { saveSettings } from "../db/repo";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { renderWithApp, setupTauri } from "../test/harness";
import ColorPick from "./ColorPick";

const t = setupTauri();

test("oferece primeiro os filamentos do AMS (com o slot), depois os outros cadastrados; sugere o mais parecido (#98)", async () => {
  await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg) VALUES ('PLA', 'Branco', 'Bambu', 110), ('PLA', 'Vermelho', '', 100), ('PETG', 'Azul', '', 120)");
  await saveSettings(t.db, { ...DEFAULT_SETTINGS, ams: { slots: 4, filaments: [2, 1, null, null] } });
  const onChange = vi.fn();
  const user = userEvent.setup();
  renderWithApp(<ColorPick label="Cor do texto" value="#e01010" onChange={onChange} />);
  const group = await screen.findByRole("radiogroup", { name: "Cor do texto: seus filamentos" });
  const names = [...group.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
  expect(names).toEqual(["Slot 1 · PLA Vermelho", "Slot 2 · PLA Branco (Bambu)", "PETG Azul"]);
  // vermelho fora do AMS → o vermelho do slot 1 é o mais parecido
  await user.click(screen.getByRole("button", { name: "Mais parecido no AMS: slot 1" }));
  expect(onChange).toHaveBeenLastCalledWith("#d6262e");
  await user.click(screen.getByRole("radio", { name: "PETG Azul" }));
  expect(onChange).toHaveBeenLastCalledWith("#2563eb");
  // continua com o seletor do sistema
  expect(screen.getByLabelText("Cor do texto")).toHaveAttribute("type", "color");
});

test("sem filamentos cadastrados: só o seletor do sistema", async () => {
  renderWithApp(<ColorPick label="Cor" value="#123456" onChange={vi.fn()} />);
  expect(await screen.findByLabelText("Cor")).toBeInTheDocument();
  expect(screen.queryByRole("radiogroup")).toBeNull();
});
