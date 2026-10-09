import { describe, expect, test } from "vitest";
import { PAGE_REDIRECTS, PAGES, pageFor } from "../pages";
import { PAGE_TABS } from "../ui/pageAliases";

describe("telas que viraram abas de outra (Organizadores)", () => {
  test("o Organizador de gaveta e o Organizador pela foto não são mais telas à parte; Organizadores é uma só, em Criar", () => {
    expect(PAGES.map((p) => p.id)).not.toContain("drawer");
    expect(PAGES.map((p) => p.id)).not.toContain("toolfit");
    const org = PAGES.find((p) => p.id === "organizers")!;
    expect(org).toMatchObject({ label: "Organizadores", section: "create", group: "Ferramentas" });
    expect(PAGES.filter((p) => p.id === "organizers")).toHaveLength(1);
  });

  test("cada id antigo leva à tela nova, na aba certa, e guarda o nome que a pessoa conhecia", () => {
    expect(PAGE_REDIRECTS.drawer).toEqual({ to: "organizers", intent: { tab: "drawer" }, label: "Organizador de gaveta" });
    expect(PAGE_REDIRECTS.toolfit).toEqual({ to: "organizers", intent: { tab: "photo" }, label: "Organizador pela foto" });
    for (const r of Object.values(PAGE_REDIRECTS)) expect(PAGES.some((p) => p.id === r.to)).toBe(true);
  });

  test("um id antigo nunca é também o id de uma tela (o redirecionamento não esconde nada)", () => {
    for (const id of Object.keys(PAGE_REDIRECTS)) expect(PAGES.some((p) => p.id === id)).toBe(false);
  });

  test("pageFor acha a tela por id novo ou antigo", () => {
    expect(pageFor("organizers")?.label).toBe("Organizadores");
    expect(pageFor("drawer")?.id).toBe("organizers");
    expect(pageFor("toolfit")?.id).toBe("organizers");
    expect(pageFor("lithophane")?.id).toBe("lithophane");
    expect(pageFor("nao-existe")).toBeUndefined();
  });

  test("as abas da busca apontam para a tela e para abas que existem", () => {
    const tabs = PAGE_TABS.map((t) => t.tab).sort();
    expect(tabs).toEqual(["bins", "drawer", "photo"]);
    for (const t of PAGE_TABS) expect(PAGES.some((p) => p.id === t.pageId)).toBe(true);
    // as duas abas com nome antigo usam exatamente os mesmos intents do mapa de redirecionamento
    for (const [old, r] of Object.entries(PAGE_REDIRECTS)) expect(PAGE_TABS.find((t) => t.label === r.label)?.tab, old).toBe((r.intent as { tab: string }).tab);
  });
});
