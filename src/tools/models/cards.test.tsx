// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { renderWithApp, setupTauri } from "../../test/harness";
import { MODEL_ITEMS } from "../../ui/modelSearchItems";
import { vi } from "vitest";
import { MODELS } from "./defs";
import { FAMILIES, familyOf } from "./families";
import { openWith } from "../intent";
import { placeOf } from "../modelPlaces";
import Models from "../Models";

vi.mock("../../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
setupTauri();

describe("⌘K e atalhos: todo modelo leva a ele mesmo", () => {
  test("cada item do ⌘K pede o modelo certo; só o que virou aba de outra ferramenta muda de tela", () => {
    expect(MODEL_ITEMS).toHaveLength(MODELS.length);
    const tabs = new Set(["shadowbox"]);
    for (const item of MODEL_ITEMS) {
      const id = item.id.replace("model-", "");
      expect(item.pageId, id).toBe("models");
      expect(item.intent, id).toEqual({ id });
      expect(item.subtitle, id).toBe(`Modelos prontos › ${familyOf(id).label}`);
      const place = placeOf(item.pageId, item.intent);
      expect(place.pageId, id).toBe(tabs.has(id) ? "lithophane" : "models");
      if (!tabs.has(id)) expect(place.intent, id).toEqual({ id });
    }
  });

  test("os atalhos das famílias apontam para telas que existem e carregam a aba certa quando têm", () => {
    for (const f of FAMILIES) for (const t of f.tools ?? []) {
      expect(t.page, `${f.id}/${t.label}`).toBeTruthy();
      if (t.page === "organizers") expect(t.intent, `${f.id}/${t.label}`).toMatchObject({ tab: expect.stringMatching(/^(drawer|photo|bins)$/) });
    }
  });
});

describe("a tela dos Modelos prontos abre no modelo pedido", () => {
  test("um pedido por modelo (um por família e todos os de várias variações): o título é o do modelo", async () => {
    const ids = FAMILIES.flatMap((f) => f.variants.map((v) => v.id));
    const wrong: string[] = [];
    for (const id of ids) {
      openWith("models", { id });
      const { unmount } = renderWithApp(<Models />);
      const want = MODELS.find((m) => m.id === id)!.label;
      try {
        await screen.findByRole("heading", { name: want, level: 2 }, { timeout: 10_000 });
      } catch {
        wrong.push(`${id}: esperava "${want}", abriu "${screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent).join(" | ")}"`);
      }
      unmount();
      cleanup();
    }
    expect(wrong).toEqual([]);
  }, 600_000);
});
