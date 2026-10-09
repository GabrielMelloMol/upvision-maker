// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { renderWithApp, setupTauri } from "../../test/harness";
import { MODEL_ITEMS } from "../../ui/modelSearchItems";
import { vi } from "vitest";
import { CATEGORIES, MODELS } from "./defs";
import { FAMILIES, familiesIn, familyOf } from "./families";
import ModelGallery, { type Occasion } from "./ModelGallery";
import { openWith } from "../intent";
import { placeOf } from "../modelPlaces";
import { COLLECTIONS, inCollection } from "./variants";
import { CATEGORY_TAB } from "./fields";
import Models from "../Models";

vi.mock("../../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
setupTauri();

/** A galeria sozinha, com o estado que a tela dos Modelos prontos dá a ela. */
function Host({ onId }: { onId: (id: string) => void }) {
  const [id, setId] = useState("pix");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number][0]>("plates");
  const [query, setQuery] = useState("");
  const [occasion, setOccasion] = useState<Occasion>(null);
  return (
    <>
      <output aria-label="aberto">{id}</output>
      <ModelGallery id={id} onPick={(next) => { setId(next); onId(next); }} category={category} onCategory={setCategory} query={query} onQuery={setQuery} occasion={occasion} onOccasion={setOccasion} favorites={[]} />
    </>
  );
}

describe("galeria dos Modelos prontos: todos os cartões", () => {
  test("cada cartão de família, em cada categoria, abre uma variação da própria família e a categoria dele", async () => {
    const user = userEvent.setup();
    let last: string | undefined;
    render(<Host onId={(id) => (last = id)} />);
    const wrong: string[] = [];
    let cards = 0;
    for (const [cat, label] of CATEGORIES) {
      await user.click(screen.getByRole("button", { name: CATEGORY_TAB[cat] ?? label }));
      for (const f of familiesIn(cat)) {
        last = undefined;
        const group = within(screen.getByRole("group", { name: "Família" }));
        const card = group.getAllByRole("button").find((b) => b.getAttribute("data-family") === f.id)!;
        expect(card, `${cat}/${f.id}`).toBeTruthy();
        await user.click(card);
        cards++;
        const opened = screen.getByLabelText("aberto").textContent!;
        if (!f.variants.some((v) => v.id === opened)) wrong.push(`${label} › ${f.label}: abriu ${opened}`);
        if (last && last !== opened) wrong.push(`${f.id}: onPick ${last} ≠ ${opened}`);
        if (familyOf(opened).category !== cat) wrong.push(`${f.id}: ${opened} é de outra categoria`);
      }
    }
    expect(cards).toBe(FAMILIES.length);
    expect(wrong).toEqual([]);
  });

  test("cada resultado de ocasião abre o modelo clicado, e todo modelo está em alguma aba", async () => {
    const user = userEvent.setup();
    render(<Host onId={() => {}} />);
    const wrong: string[] = [];
    let seen = 0;
    for (const [c, label] of COLLECTIONS) {
      const chips = screen.getByRole("group", { name: "Ocasião" });
      const more = within(chips).queryByRole("button", { name: /^Mais \(/ });
      if (more) await user.click(more);
      await user.click(within(screen.getByRole("group", { name: "Ocasião" })).getByRole("button", { name: label }));
      const buttons = within(screen.getByRole("group", { name: "Modelo" })).getAllByRole("button");
      expect(buttons.map((b) => b.getAttribute("data-id")).sort(), label).toEqual(MODELS.filter((m) => inCollection(m.id, c)).map((m) => m.id).sort());
      for (const b of buttons) {
        await user.click(b);
        seen++;
        if (screen.getByLabelText("aberto").textContent !== b.getAttribute("data-id")) wrong.push(`${label}: clicou ${b.getAttribute("data-id")}, abriu ${screen.getByLabelText("aberto").textContent}`);
      }
      await user.click(within(screen.getByRole("group", { name: "Ocasião" })).getByRole("button", { name: label })); // desliga
    }
    expect(seen).toBeGreaterThan(50);
    expect(wrong).toEqual([]);
    expect(FAMILIES.flatMap((f) => f.variants.map((v) => v.id)).sort()).toEqual(MODELS.map((m) => m.id).sort());
  });
});

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
