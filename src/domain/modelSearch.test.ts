import { expect, test } from "vitest";
import { LICENSES, pushRecent, RECENT_MAX, safeModelUrl, siteOfUrl, SITES } from "./modelSearch";

const site = (id: string) => SITES.find((s) => s.id === id)!;

test("URLs de busca de cada site, com o termo codificado (#77)", () => {
  expect(site("printables").search("vaso espiral", false)).toBe("https://www.printables.com/search/models?q=vaso%20espiral");
  expect(site("makerworld").search("vaso", false)).toBe("https://makerworld.com/en/search/models?keyword=vaso");
  expect(site("thingiverse").search("vaso", false)).toBe("https://www.thingiverse.com/search?q=vaso&type=things&sort=relevant");
  expect(site("thangs").search("a/b", false)).toBe("https://thangs.com/search/a%2Fb?scope=all");
});

test("filtro de grátis só onde o site aceita na URL", () => {
  expect(site("cults3d").search("vaso", true)).toBe("https://cults3d.com/pt/busca?q=vaso&only_free=true");
  expect(site("cults3d").search("vaso", false)).toBe("https://cults3d.com/pt/busca?q=vaso");
  expect(SITES.filter((s) => s.free).map((s) => s.id)).toEqual(["cults3d"]);
});

test("link colado: reconhece o site e só abre http(s) de site conhecido", () => {
  expect(siteOfUrl("https://makerworld.com/en/models/12345")?.name).toBe("MakerWorld");
  expect(siteOfUrl("https://www.thingiverse.com/thing:1")?.id).toBe("thingiverse");
  expect(siteOfUrl("https://evil.com/?makerworld.com")).toBeNull();
  expect(siteOfUrl("não é link")).toBeNull();
  expect(safeModelUrl(" https://www.printables.com/model/1 ")).toBe("https://www.printables.com/model/1");
  expect(safeModelUrl("javascript:alert(1)")).toBeNull();
});

test("licenças: NC não pode vender; CC BY pode com crédito", () => {
  expect(LICENSES.find((l) => l.id === "nc")!.verdict.sell).toBe("no");
  expect(LICENSES.find((l) => l.id === "by")!.verdict).toMatchObject({ sell: "yes", text: expect.stringMatching(/crédito/) });
});

test("buscas recentes: no topo, sem repetir, com limite", () => {
  let list: string[] = [];
  for (let i = 0; i < RECENT_MAX + 2; i++) list = pushRecent(list, `b${i}`);
  expect(list).toHaveLength(RECENT_MAX);
  expect(pushRecent(["Vaso", "copo"], "vaso")).toEqual(["vaso", "copo"]);
  expect(pushRecent(["a"], "  ")).toEqual(["a"]);
});
