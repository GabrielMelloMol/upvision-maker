import { expect, test } from "vitest";
import type { ToolProject } from "../../db/toolStateRepo";
import { allTags, filterLibrary, libraryItems, NO_FILTERS } from "./library";

const p = (id: number, toolId: string, name: string, at: string, extra: Partial<ToolProject> = {}): ToolProject => ({ id, toolId, name, data: "{}", thumb: null, at, ...extra });
const NOW = Date.parse("2026-10-01T12:00:00Z");
const items = libraryItems(
  [
    p(1, "keychain", "Chaveiro Ana", "2026-09-30T10:00:00Z", { favorite: 1, tags: '["escola"]' }),
    p(2, "medal", "Formatura Medicina", "2026-08-01T10:00:00Z", { tags: '["formatura","escola"]' }),
    p(3, "keychain", "", "2026-09-25T10:00:00Z"),
  ],
  [{ id: "qr", updatedAt: "2026-10-01T09:00:00Z" }],
);
const label = (id: string) => ({ keychain: "Chaveiros", medal: "Medalhas", qr: "QR Code e Pix" })[id] ?? id;
const names = (f: Partial<typeof NO_FILTERS>) => filterLibrary(items, { ...NO_FILTERS, ...f }, label, NOW).map((i) => i.name);

test("rascunhos vêm primeiro; projeto sem nome aparece como Sem nome (#161)", () => {
  expect(items.map((i) => `${i.kind}:${i.name}`)).toEqual(["draft:Rascunho", "project:Chaveiro Ana", "project:Formatura Medicina", "project:Sem nome"]);
});

test("busca por nome, ferramenta e tag, sem acento; filtros de ferramenta, tag, favoritos e período", () => {
  expect(names({ q: "medicina" })).toEqual(["Formatura Medicina"]);
  expect(names({ q: "chaveiros" })).toEqual(["Chaveiro Ana", "Sem nome"]);
  expect(names({ q: "ESCOLA" })).toEqual(["Chaveiro Ana", "Formatura Medicina"]);
  expect(names({ q: "qr code" })).toEqual(["Rascunho"]);
  expect(names({ toolId: "keychain" })).toEqual(["Chaveiro Ana", "Sem nome"]);
  expect(names({ tag: "formatura" })).toEqual(["Formatura Medicina"]);
  expect(names({ favorites: true })).toEqual(["Chaveiro Ana"]);
  expect(names({ period: "7" })).toEqual(["Rascunho", "Chaveiro Ana", "Sem nome"]);
  expect(allTags(items)).toEqual(["escola", "formatura"]);
});
