// @vitest-environment happy-dom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Box } from "lucide-react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../../test/harness";
import { openWith } from "../intent";
import Models from "../Models";
import { MODELS } from "./defs";
import { choice, num, type ModelDef } from "./fields";

const shown: string[][] = [];
vi.mock("../../ui/viewerScene", () => ({ createViewer: () => ({ setModels: (m: { name: string }[]) => shown.push(m.map((x) => x.name)), dispose() {} }) }));
// o gerador falso não usa geometria: sem WASM nem fontes
vi.mock("../../geometry/manifold", () => ({ getManifold: async () => ({}) }));
vi.mock("../../geometry/fonts", async (orig) => ({ ...(await orig<typeof import("../../geometry/fonts")>()), loadFont: async () => ({}), loadEmojiFont: async () => ({}) }));
vi.mock("./applyLayers", () => ({ applyLayers: async (_M: unknown, models: unknown) => ({ models, warnings: [], byLayer: {}, face: null, shapes: {} }) }));
setupTauri();

const piece = (name: string) => ({ name, parts: [] });
const fake: ModelDef = {
  id: "fakeGuide",
  category: "organize",
  label: "Gerador falso",
  blurb: "Descrição do gerador falso.",
  icon: Box,
  defaults: { width: 100, material: "pla", clearance: 0.35 },
  sections: [{ title: "Medidas", fields: [num("width", "Largura", 50, 200, { step: 1, slider: true, hint: "Largura da caixa." }), choice("material", "Material", [["pla", "PLA"], ["petg", "PETG"]]), num("clearance", "Folga", 0.1, 1)] }],
  guide: { presets: [{ id: "big", label: "Grande", blurb: "Caixa larga.", patch: { width: 180 } }], help: { use: ["Parafusos"], avoid: [], tips: [], faq: [] } },
  derive: (k, v) => (k === "material" ? { clearance: v === "petg" ? 0.4 : 0.35 } : undefined),
  build: () => ({ models: [piece("mesa")], views: [{ id: "open", label: "Aberta", models: [piece("aberta")] }, { id: "closed", label: "Fechada", models: [piece("fechada")], note: "Nota da vista fechada." }] }),
};

beforeAll(() => {
  MODELS.push(fake);
});

describe("gerador guiado em Models", () => {
  test("sugestões por uso no lugar das variações, derive no mesmo passo, vistas na prévia e ajuda abaixo", async () => {
    openWith("models", { id: "fakeGuide" });
    renderWithApp(<Models />);
    expect(await screen.findByRole("heading", { name: "Comece pelo uso" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Variações prontas" })).toBeNull();
    expect(screen.getByText("Como usar")).toBeInTheDocument();
    // vista padrão: "closed"; a nota aparece
    expect(await screen.findByText("Nota da vista fechada.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechada" })).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(shown.at(-1)).toEqual(["fechada"]));
    await userEvent.click(screen.getByRole("button", { name: "Aberta" }));
    await vi.waitFor(() => expect(shown.at(-1)).toEqual(["aberta"]));

    // preset aplica o patch
    await userEvent.click(screen.getByRole("button", { name: "Grande" }));
    expect(screen.getByLabelText(/^Largura/)).toHaveValue(180);
    expect(document.querySelector('input[type="range"][data-for="Largura"]')).toHaveValue("180");

    // derive: trocar o material muda a folga junto
    await userEvent.click(screen.getByRole("button", { name: "PETG" }));
    expect(screen.getByLabelText(/^Folga/)).toHaveValue(0.4);
  });
});
