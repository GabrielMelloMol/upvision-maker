import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { platesByColor } from "../geometry/amsNeed";
import { getManifold } from "../geometry/manifold";
import { write3mf } from "../geometry/threemf";
import { AMS_NEED } from "../tools/models/amsTable";
import { MissingInput, modelCases, serveFontsFromDisk } from "./cases";
import { BAMBU, installed, ORCA, slice, writeProfiles, type Slicer } from "./slicer";

/**
 * "Uma mesa por cor" nos fatiadores (#118): para modelos que precisam de AMS (cores lado a lado), gera o 3MF de cada cor
 * como o botão "Salvar uma mesa por cor" faz e fatia no Bambu Studio CLI e no OrcaSlicer CLI (A1, PLA). Cada mesa precisa
 * fatiar, ter gramas e usar só o filamento 1. Fora da suíte normal: `scripts/validate-models --plates [--ids a,b]`.
 */
const ROOT = resolve(__dirname, "../..");
const OUT = join(ROOT, "test-results/qa-plates");
const IDS = process.env.QA_IDS?.split(",").map((s) => s.trim()).filter(Boolean);
// Mesas que são só peças soltas no ar (letras na parede): o Bambu avisa "floating regions" e fatia, o Orca CLI recusa (-100).
const ORCA_FLOATING_ONLY = new Set(["screwCase:padrão · cor 2"]);
const DEFAULT_COUNT = 6; // sem --ids: os primeiros modelos que precisam de AMS, em ordem alfabética

describe.skipIf(!process.env.QA_PLATES)("uma mesa por cor nos fatiadores (#118)", () => {
  test("cada mesa fatia sozinha, com gramas, num filamento só", { timeout: 3 * 3600 * 1000 }, async () => {
    serveFontsFromDisk(ROOT);
    const M = await getManifold();
    const slicers = ([BAMBU, ORCA] as Slicer[]).filter(installed);
    expect(slicers.length, "nenhum fatiador instalado").toBeGreaterThan(0);
    const ids = IDS ?? Object.keys(AMS_NEED).filter((id) => AMS_NEED[id] === "ams").slice(0, DEFAULT_COUNT);
    const cases = modelCases(M, (d) => ids.includes(d.id)).filter((c) => c.variant === "padrão");
    expect(cases.length, "nenhum modelo com esses ids").toBeGreaterThan(0);
    rmSync(OUT, { recursive: true, force: true });
    const failures: string[] = [];
    for (const c of cases) {
      let models;
      try {
        models = (await c.build()).models;
      } catch (e) {
        if (e instanceof MissingInput) continue;
        throw e;
      }
      for (const [i, plate] of platesByColor(models).entries()) {
        for (const s of slicers) {
          const dir = join(OUT, c.key.replace(/[^a-zA-Z0-9-]+/g, "_"), `cor-${i + 1}`);
          mkdirSync(dir, { recursive: true });
          const file = join(dir, "mesa.3mf");
          writeFileSync(file, write3mf(plate.models, { profile: c.profile }));
          const profiles = writeProfiles(s, join(OUT, "_perfis", s.name.replace(/\W+/g, "")));
          const r = await slice(s, file, join(dir, s.name.replace(/\W+/g, "")), profiles, [plate.color]);
          const label = `${c.key} · cor ${i + 1} (${plate.color}) · ${s.name}`;
          if (!r.ok && s === ORCA && ORCA_FLOATING_ONLY.has(`${c.key} · cor ${i + 1}`)) console.log(`[qa-plates] ${label}: limite conhecido do Orca CLI (peças soltas)`);
          else if (!r.ok) failures.push(`${label}: ${r.error ?? "não fatiou"}`);
          else if (!(r.total > 0 || r.grams.some((g) => g > 0))) failures.push(`${label}: fatiou sem gramas`);
          else if (r.used.some((f) => f !== 1)) failures.push(`${label}: usa o filamento ${r.used.join(",")} (devia ser só o 1)`);
          console.log(`[qa-plates] ${label}: ${r.ok ? `${r.total.toFixed(1)} g` : "FALHOU"}`);
        }
      }
    }
    expect(failures, "mesas que não fatiaram direito").toEqual([]);
  });
});
