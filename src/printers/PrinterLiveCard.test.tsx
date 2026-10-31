// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { onReport } from "./live";
import PrinterLiveCard, { remaining } from "./PrinterLiveCard";

const t = setupTauri();

test("procura na rede, preenche IP e série, conecta com o código e mostra o andamento (#15)", async () => {
  const calls: Record<string, unknown>[] = [];
  t.handlers["printer_discover"] = () => [{ ip: "192.168.68.59", serial: "03900D611528416", model: "N2S", name: "A1 combo" }];
  t.handlers["printer_watch"] = (a) => (calls.push(a), "b".repeat(64));
  t.handlers["printer_unwatch"] = () => null;
  const user = userEvent.setup();
  renderWithApp(<PrinterLiveCard />);
  await user.click(screen.getByRole("button", { name: "Conectar uma Bambu" }));
  await user.click(screen.getByRole("button", { name: "Procurar na rede" }));
  await waitFor(() => expect(screen.getByLabelText("Endereço IP")).toHaveValue("192.168.68.59"));
  expect(screen.getByLabelText("Número de série")).toHaveValue("03900D611528416");
  expect(screen.getByRole("button", { name: "Conectar" })).toBeDisabled();
  await user.type(screen.getByLabelText(/Código de acesso/), "12345678");
  await user.click(screen.getByRole("button", { name: "Conectar" }));
  await waitFor(() => expect(calls).toEqual([{ ip: "192.168.68.59", serial: "03900D611528416", code: "12345678", pin: "" }]));
  onReport("03900D611528416", JSON.stringify({ print: { gcode_state: "RUNNING", subtask_name: "chaveiro", mc_percent: 45, mc_remaining_time: 83 } }));
  expect(await screen.findByText(/chaveiro · 45% · faltam 1 h 23 min/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Esquecer" }));
  await waitFor(() => expect(screen.queryByText(/chaveiro/)).toBeNull());
});

test("tempo restante legível", () => {
  expect(remaining(45)).toBe("45 min");
  expect(remaining(125)).toBe("2 h 05 min");
});
