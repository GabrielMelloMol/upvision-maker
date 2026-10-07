// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { modelVariants } from "../../db/modelVariantsRepo";
import { toolProjects, toolState } from "../../db/toolStateRepo";
import { PAGES } from "../../pages";
import { renderWithApp, setupTauri } from "../../test/harness";
import Models from "../Models";
import { MODELS } from "./defs";
import { FAMILIES, familyOf } from "./families";

/**
 * #141: as famílias são só apresentação por cima dos ids de hoje. Rascunho, variação salva (#26) e último projeto
 * (#85) gravados antes das famílias, com o id antigo do modelo, abrem na família e na variação certas com os valores.
 */
vi.mock("../../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
beforeAll(() => {
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});

const BUILD = { timeout: 30_000 };
const OLD = "gymKeychain"; // antes: card solto "Chaveiro anilha"; agora: Chaveiro › Anilha
/** Estado da tela como o app gravava antes das famílias (envelope do useToolState, v1). */
const oldState = (text: string) => JSON.stringify({ v: 1, state: { id: OLD, all: { [OLD]: { ...MODELS.find((m) => m.id === OLD)!.defaults, text } }, font: "hanken", art: null, batchOn: false, batchText: {}, edits: {} } });

async function expectOpenAsAnilha(text: string) {
  await waitFor(() => expect(within(screen.getByRole("group", { name: "Variação" })).getByRole("button", { name: /Anilha/ })).toHaveAttribute("aria-pressed", "true"), BUILD);
  expect(screen.getByLabelText(/^Texto/)).toHaveValue(text);
}

describe("famílias: nenhum modelo perdido (#141)", () => {
  test("cada modelo está em exatamente uma família; as variações e os atalhos apontam para o que existe", () => {
    const count = new Map<string, number>();
    for (const f of FAMILIES) for (const v of f.variants) count.set(v.id, (count.get(v.id) ?? 0) + 1);
    expect(MODELS.filter((m) => count.get(m.id) !== 1).map((m) => m.id)).toEqual([]);
    const ids = new Set(MODELS.map((m) => m.id));
    expect([...count.keys()].filter((id) => !ids.has(id))).toEqual([]);
    const pages = new Set(PAGES.map((p) => p.id));
    expect(FAMILIES.flatMap((f) => f.tools ?? []).filter((x) => !pages.has(x.page)).map((x) => x.page)).toEqual([]);
    expect(familyOf(OLD).label).toBe("Chaveiro");
  });
});

describe("compatibilidade com o que foi salvo antes das famílias (#141)", () => {
  test("rascunho com o id antigo: Continuar abre Chaveiro › Anilha com o texto digitado", async () => {
    await toolState.save(t.db, { id: "models", data: oldState("80 KG"), updatedAt: new Date().toISOString() });
    const user = userEvent.setup();
    renderWithApp(<Models />);
    await user.click(await screen.findByRole("button", { name: /Continuar de onde parou/ }, BUILD));
    await expectOpenAsAnilha("80 KG");
    expect(within(screen.getByRole("group", { name: "Família" })).getByRole("button", { name: "Chaveiro" })).toHaveAttribute("aria-pressed", "true");
  });

  test("último projeto salvo com o id antigo: Reabrir volta na variação e nos campos", async () => {
    await toolProjects.add(t.db, { toolId: "models", name: "Anilha da academia", data: oldState("PERSONAL"), thumb: null, at: new Date().toISOString() });
    const user = userEvent.setup();
    renderWithApp(<Models />);
    await user.click(await screen.findByRole("button", { name: /Últimos projetos/ }, BUILD));
    await user.click(screen.getByRole("button", { name: "Reabrir Anilha da academia" }));
    await expectOpenAsAnilha("PERSONAL");
  });

  test("variação salva (#26) no id antigo aparece na variação Anilha e aplica os campos", async () => {
    const params = { ...MODELS.find((m) => m.id === OLD)!.defaults, text: "CROSS" };
    await modelVariants.create(t.db, { modelId: OLD, label: "Box da Ana", data: JSON.stringify({ params, layers: [] }), createdAt: new Date().toISOString() });
    await toolState.save(t.db, { id: "models", data: oldState("20 KG"), updatedAt: new Date().toISOString() });
    const user = userEvent.setup();
    renderWithApp(<Models />);
    await user.click(await screen.findByRole("button", { name: /Continuar de onde parou/ }, BUILD));
    await expectOpenAsAnilha("20 KG");
    await user.click(await within(screen.getByRole("group", { name: "Minhas variações" })).findByRole("button", { name: "Box da Ana" }));
    expect(screen.getByLabelText(/^Texto/)).toHaveValue("CROSS");
  });
});
