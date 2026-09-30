import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

/** Guia de voz (docs/design/voz.md, #143): subtítulo de tela com no máximo 1 linha; o passo a passo fica no "?". */
const MAX_LEAD = 60;
const files = ["../pages", "../tools"].flatMap((dir) =>
  readdirSync(resolve(__dirname, dir))
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => resolve(__dirname, dir, f)),
);

test("#143: subtítulo das telas em até 60 caracteres, sem exclamação", () => {
  const long = files.flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(/className="lead">([^<{]+)<\/p>/g)]
      .map((m) => m[1].trim())
      .filter((t) => t.length > MAX_LEAD || t.includes("!"))
      .map((t) => `${f.split("/").pop()}: ${t}`),
  );
  expect(long.filter((l) => !l.startsWith("DesignCatalog"))).toEqual([]); // a página interna de design fica de fora
});
