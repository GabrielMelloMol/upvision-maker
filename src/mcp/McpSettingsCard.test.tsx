// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { getSecret } from "../db/repo";
import { renderWithApp, setupTauri } from "../test/harness";
import McpSettingsCard, { startMcpIfOn } from "./McpSettingsCard";

const t = setupTauri();

test("liga com uma chave nova guardada, mostra o comando, troca a chave e desliga apagando-a (#304)", async () => {
  const started: string[] = [];
  let stopped = 0;
  t.handlers["mcp_start"] = (a) => (started.push(a.token as string), { running: true, url: "" });
  t.handlers["mcp_stop"] = () => (stopped++, null);
  renderWithApp(<McpSettingsCard />);
  await userEvent.click(await screen.findByRole("switch", { name: /Deixar uma IA/ }));
  await waitFor(() => expect(started).toHaveLength(1));
  expect(started[0]).toMatch(/^[0-9a-f]{64}$/);
  expect(await getSecret(t.db, "mcp_token")).toBe(started[0]);
  expect(await screen.findByText(new RegExp(`claude mcp add .*Bearer ${started[0]}`))).toBeTruthy();
  expect(screen.getByText(new RegExp(`\\[mcp_servers\\.upvision\\][\\s\\S]*Bearer ${started[0]}`))).toBeTruthy();

  await startMcpIfOn(); // reabrir o app religa com a mesma chave
  expect(started[1]).toBe(started[0]);

  await userEvent.click(screen.getByRole("button", { name: "Gerar chave nova" }));
  await waitFor(() => expect(started).toHaveLength(3));
  expect(started[2]).not.toBe(started[0]);

  await userEvent.click(screen.getByRole("switch", { name: /Deixar uma IA/ }));
  await waitFor(() => expect(stopped).toBe(1));
  expect(await getSecret(t.db, "mcp_token")).toBeNull();
});
