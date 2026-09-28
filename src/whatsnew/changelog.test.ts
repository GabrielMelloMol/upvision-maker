import { describe, expect, test } from "vitest";
import { compareVersions, entriesToShow, parseChangelog } from "./changelog";

const md = `# Novidades

## 0.3.0 — 2026-10-10
- Etiquetas com QR
- **Negrito** mantido

## 0.2.0 — 2026-09-28
- Cortador de biscoito
- Chaveiros

## 0.1.0 — 2026-09-26
- Calculadora
`;

test("parseChangelog lê versões, datas e itens", () => {
  const c = parseChangelog(md);
  expect(c.map((e) => e.version)).toEqual(["0.3.0", "0.2.0", "0.1.0"]);
  expect(c[0]).toEqual({ version: "0.3.0", date: "2026-10-10", items: ["Etiquetas com QR", "**Negrito** mantido"] });
});

test("compareVersions compara numericamente", () => {
  expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
  expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  expect(compareVersions("0.2.0", "0.2.1")).toBeLessThan(0);
});

describe("entriesToShow", () => {
  const c = parseChangelog(md);
  test("depois de atualizar: mostra tudo que é mais novo que a última versão vista, até a atual", () => {
    expect(entriesToShow(c, "0.1.0", "0.3.0").map((e) => e.version)).toEqual(["0.3.0", "0.2.0"]);
  });
  test("primeira instalação (nada visto) ou mesma versão: não mostra", () => {
    expect(entriesToShow(c, null, "0.3.0")).toEqual([]);
    expect(entriesToShow(c, "0.3.0", "0.3.0")).toEqual([]);
  });
  test("não mostra versões futuras que ainda não foram instaladas", () => {
    expect(entriesToShow(c, "0.1.0", "0.2.0").map((e) => e.version)).toEqual(["0.2.0"]);
  });
});
