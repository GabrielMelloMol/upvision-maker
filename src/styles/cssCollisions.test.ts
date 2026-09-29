import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const DIR = resolve(__dirname);

/**
 * Variantes de propósito em outro arquivo: `.error`/`.hint` são textos base (base.css) e `.alert.error`/`.hint.ok`
 * são variantes de componente (components.css), aplicadas junto com a base.
 */
const ALLOWED = new Set(["error", "hint"]);

/** Por arquivo: classes estilizadas "puras" (`.x`, `.x:hover`) e classes usadas em seletor composto no mesmo elemento (`.a.b`). */
function classes(css: string): { bare: Set<string>; compound: Set<string> } {
  // @supports aqui só ajusta cantos (corner-shape) em listas de classes: não conta
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@supports[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const bare = new Set<string>();
  const compound = new Set<string>();
  for (const m of text.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@")) continue;
    for (const raw of sel.split(",")) {
      const part = raw.trim();
      const b = /^\.([A-Za-z][\w-]*)(?::{1,2}[\w-]+(?:\([^)]*\))?)*$/.exec(part);
      if (b) bare.add(b[1]);
      else if (!/[\s>+~]/.test(part)) {
        const cls = [...part.matchAll(/\.([A-Za-z][\w-]*)/g)].map((x) => x[1]);
        if (cls.length > 1) cls.forEach((c) => compound.add(c));
      }
    }
  }
  return { bare, compound };
}

/** Classe pura num arquivo e usada (pura ou composta) em outro: a regra de um vaza para o elemento do outro. */
export function clashes(files: Record<string, string>): string[] {
  const parsed = Object.entries(files).map(([name, css]) => ({ name, ...classes(css) }));
  const out: string[] = [];
  for (const a of parsed)
    for (const b of parsed)
      if (a.name !== b.name)
        for (const c of a.bare)
          if (!ALLOWED.has(c) && (b.compound.has(c) || (b.bare.has(c) && a.name < b.name))) out.push(`.${c}: ${a.name} × ${b.name}`);
  return out;
}

test("#80: nenhuma classe base é estilizada em dois arquivos de estilo", () => {
  const files = Object.fromEntries(readdirSync(DIR).filter((f) => f.endsWith(".css")).map((f) => [f, readFileSync(resolve(DIR, f), "utf8")]));
  expect(clashes(files)).toEqual([]);
});

test("o detector pega o caso do #80 (.qr-preview de 140 px × .viewer.qr-preview) e ignora @supports e refinamentos", () => {
  expect(clashes({ "features.css": ".qr-preview { width: 140px }", "tools.css": ".viewer.qr-preview { display: grid }" })).toEqual([".qr-preview: features.css × tools.css"]);
  expect(clashes({ "a.css": ".x { a: b }", "b.css": ".x { c: d }" })).toEqual([".x: a.css × b.css"]);
  expect(clashes({ "a.css": ".card { a: b }", "b.css": "@supports (corner-shape: squircle) { .card { c: d } } .list .card { e: f }" })).toEqual([]);
});
