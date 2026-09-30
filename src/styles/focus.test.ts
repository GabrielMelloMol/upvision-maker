import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const css = readdirSync(__dirname)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(resolve(__dirname, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""))
  .join("\n");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

test("#142: quem usa all: unset (zera o outline) declara o próprio anel de foco em outline", () => {
  const unset = rules.filter((r) => /all:\s*unset/.test(r.body)).flatMap((r) => r.sel.split(",").map((s) => s.trim()));
  const missing = unset.filter((sel) => !rules.some((r) => r.sel.split(",").some((s) => s.trim() === `${sel}:focus-visible`) && /outline:\s*\d+px solid/.test(r.body)));
  expect(missing).toEqual([]);
});

test("#142: o anel global é outline (box-shadow: none dos botões não apaga o foco)", () => {
  const global = rules.find((r) => r.sel === ":focus-visible")!;
  expect(global.body).toMatch(/outline:\s*3px solid var\(--focus-ring\)/);
  expect(global.body).not.toMatch(/box-shadow/);
});
