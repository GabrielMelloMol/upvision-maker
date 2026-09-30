import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, test } from "vitest";
import { amsNeed, type AmsNeed } from "../geometry/amsNeed";
import { getManifold } from "../geometry/manifold";
import { modelCases, MissingInput, serveFontsFromDisk } from "./cases";

/**
 * Tabela "precisa de AMS?" dos Modelos prontos para a galeria Criar (#118): gera cada modelo no padrão e grava
 * src/tools/models/amsNeed.json. Fora da suíte normal: `npm run ams-table` (rodar de novo quando entrar modelo novo).
 */
const ROOT = resolve(__dirname, "../..");

describe.skipIf(!process.env.AMS_TABLE)("tabela de AMS dos modelos (#118)", () => {
  test("gera src/tools/models/amsNeed.json", { timeout: 20 * 60_000 }, async () => {
    serveFontsFromDisk(ROOT);
    const M = await getManifold();
    const table: Record<string, AmsNeed> = {};
    for (const c of modelCases(M, () => true).filter((x) => x.variant === "padrão")) {
      try {
        table[c.key.split(":")[0]] = amsNeed((await c.build()).models);
      } catch (e) {
        if (!(e instanceof MissingInput)) throw e; // modelo que pede entrada (foto, SVG): fica sem selo
      }
    }
    const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(join(ROOT, "src/tools/models/amsNeed.json"), `${JSON.stringify(sorted, null, 2)}\n`);
  });
});
