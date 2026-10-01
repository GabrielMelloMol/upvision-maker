// @vitest-environment happy-dom
import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { toolProjects, toolState } from "../db/toolStateRepo";
import { renderWithApp, setupTauri } from "../test/harness";
import { openProjectIn } from "./intent";
import { useToolState } from "./useToolState";

/** #161: chegar na ferramenta por Meus projetos abre aquele projeto, ou já continua o rascunho. */
const t = setupTauri();
const env = (text: string) => JSON.stringify({ v: 1, state: { text } });

function Probe() {
  const tool = useToolState("probe", { text: "padrão" }, { label: "Probe" });
  return (
    <>
      <output>{tool.state.text}</output>
      {tool.draft && <span>tem rascunho</span>}
    </>
  );
}

test("projeto pedido abre no lugar do estado inicial, sem oferecer o rascunho", async () => {
  await toolState.save(t.db, { id: "probe", data: env("rascunho"), updatedAt: "2026-10-01T09:00:00Z" });
  const id = await toolProjects.add(t.db, { toolId: "probe", name: "Bia", data: env("Bia"), thumb: null, at: "2026-09-30T10:00:00Z" });
  openProjectIn("probe", { projectId: id });
  renderWithApp(<Probe />);
  expect(await screen.findByText("Bia")).toBeInTheDocument();
  expect(screen.queryByText("tem rascunho")).toBeNull();
});

test("continuar pelo Meus projetos: o rascunho já entra, sem o Continuar de onde parou", async () => {
  await toolState.save(t.db, { id: "probe", data: env("rascunho"), updatedAt: "2026-10-01T09:00:00Z" });
  openProjectIn("probe", { resume: true });
  renderWithApp(<Probe />);
  expect(await screen.findByText("rascunho")).toBeInTheDocument();
  expect(screen.queryByText("tem rascunho")).toBeNull();
});

test("sem pedido: segue oferecendo o rascunho como antes (#85)", async () => {
  await toolState.save(t.db, { id: "probe", data: env("rascunho"), updatedAt: "2026-10-01T09:00:00Z" });
  renderWithApp(<Probe />);
  expect(await screen.findByText("tem rascunho")).toBeInTheDocument();
  expect(screen.getByText("padrão")).toBeInTheDocument();
});
