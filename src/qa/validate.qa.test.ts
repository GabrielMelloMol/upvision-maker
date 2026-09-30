import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { getManifold } from "../geometry/manifold";
import { write3mf } from "../geometry/threemf";
import { modelCases, MissingInput, serveFontsFromDisk, type QaCase } from "./cases";
import { checkModels } from "./checks";
import { mergeRows, renderReport, statusOf, type QaRow } from "./report";
import { hasBambu, slice, writeProfiles, type SliceResult } from "./slicer";
import { toolCases } from "./toolCases";

/**
 * Varredura de QA dos Modelos prontos e ferramentas (#90). Fora da suíte normal: rode `scripts/validate-models`
 * (veja as opções lá). Gera 3MF de cada caso, confere a geometria, fatia no Bambu Studio CLI (A1, PLA) e atualiza
 * docs/qa-modelos.json + docs/QA-modelos.md.
 */
const ROOT = resolve(__dirname, "../..");
const OUT = join(ROOT, "test-results/qa");
const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);
const IDS = list(process.env.QA_IDS);
const GROUPS = list(process.env.QA_GROUPS);
const OWNERS = list(process.env.QA_OWNERS);
const SLICE = process.env.QA_SLICE !== "0";
const JOBS = Number(process.env.QA_JOBS ?? 3);
const MAX_AMS = 4; // AMS lite do A1
const MAX_HOURS = 24;
const Z_TOL = 0.21; // mm: pausa no G-code até uma camada de distância do Z pedido

const wanted = (id: string, group: string, owner: string) => (!IDS || IDS.includes(id)) && (!GROUPS || GROUPS.includes(group)) && (!OWNERS || OWNERS.includes(owner));

type Built = { c: QaCase; row: QaRow; file?: string; pauses: number[]; notes: string[] };

async function build(c: QaCase): Promise<Built> {
  const M = await getManifold();
  const row: QaRow = { key: c.key, owner: c.owner, group: c.group, label: c.label, variant: c.variant, status: "ok", reasons: [], date: new Date().toISOString().slice(0, 10) };
  let out;
  try {
    out = await c.build();
  } catch (e) {
    const na = e instanceof MissingInput;
    return { c, row: { ...row, status: statusOf(na ? [] : ["x"], [], na), reasons: [na ? `pede entrada: ${e.message}` : `erro ao gerar: ${e instanceof Error ? e.message : String(e)}`] }, pauses: [], notes: [] };
  }
  const problems = checkModels(M, out.models);
  const fails = problems.filter((p) => p.kind === "fail").map((p) => p.msg);
  const warns = problems.filter((p) => p.kind === "warn").map((p) => p.msg);
  const notes = out.warnings.map((w) => `app: ${w}`); // o que o app já mostra na tela: vai no relatório, não muda o resultado
  const bytes = write3mf(out.models, { pauses: out.pauses, profile: c.profile });
  const colors = new Set(out.models.flatMap((m) => m.parts.map((p) => p.color.toLowerCase())));
  const extruders = new Set([...strFromU8(unzipSync(bytes)["Metadata/model_settings.config"]).matchAll(/key="extruder" value="(\d+)"/g)].map((m) => m[1]));
  if (extruders.size !== colors.size) fails.push(`${colors.size} cores mas ${extruders.size} extrusoras no 3MF`);
  if (colors.size > MAX_AMS) warns.push(`${colors.size} cores: mais que os ${MAX_AMS} do AMS lite`);
  const dir = join(OUT, c.key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-]+/g, "_"));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "modelo.3mf");
  writeFileSync(file, bytes);
  return { c, row: { ...row, status: statusOf(fails, warns), reasons: [...fails, ...warns, ...notes] }, file, pauses: [...out.pauses].sort((a, b) => a - b), notes };
}

function withSlice(b: Built, s: SliceResult): QaRow {
  const own = b.row.reasons.filter((r) => !b.notes.includes(r));
  const fails = b.row.status === "falha" ? own : [];
  const warns = b.row.status === "falha" ? [] : own;
  if (!s.ok) return { ...b.row, status: "falha", reasons: [...fails, ...warns, s.error ?? "não fatiou", ...b.notes] };
  if (s.grams <= 0) fails.push("fatiou com 0 g de filamento");
  if (s.seconds > MAX_HOURS * 3600) warns.push(`mais de ${MAX_HOURS} h de impressão`);
  if (s.plates > 1) warns.push(`não coube numa placa: ${s.plates} placas`);
  const z = (n: number) => n.toFixed(2).replace(".", ",");
  if (s.pauseZ.length !== b.pauses.length) fails.push(`${b.pauses.length} pausa(s) pedida(s), ${s.pauseZ.length} no G-code`);
  else b.pauses.forEach((p, i) => Math.abs(s.pauseZ[i] - p) > Z_TOL && fails.push(`pausa em Z ${z(s.pauseZ[i])} (pedida ${z(p)})`));
  return {
    ...b.row,
    status: statusOf(fails, warns),
    reasons: [...fails, ...warns, ...b.notes],
    minutes: Math.round(s.seconds / 60),
    grams: Math.round(s.grams * 10) / 10,
    plates: s.plates,
    pauses: b.pauses.length ? s.pauseZ.map(z).join(" / ") : undefined,
  };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

describe.skipIf(!process.env.QA)("varredura de QA (#90)", () => {
  test("gera, confere, fatia e atualiza o relatório", async () => {
    serveFontsFromDisk(ROOT);
    const M = await getManifold();
    const all = [...modelCases(M, () => true), ...toolCases(M)];
    const cases = all.filter((c) => wanted(c.key.split(":")[0], c.group, c.owner));
    expect(cases.length, "nenhum caso com esses filtros").toBeGreaterThan(0);
    const built: Built[] = [];
    for (const c of cases) {
      built.push(await build(c));
      console.log(`[qa] gerado ${c.key}: ${built[built.length - 1].row.status}`);
    }
    const slicing = SLICE && hasBambu();
    const profiles = slicing ? writeProfiles(join(OUT, "_perfis")) : null;
    const rows = await pool(built, JOBS, async (b) => {
      if (!profiles || !b.file) return b.row;
      const r = withSlice(b, await slice(b.file, join(b.file, "..", "fatiado"), profiles, b.pauses));
      console.log(`[qa] fatiado ${b.c.key}: ${r.status} ${r.reasons.join("; ")}`);
      return r;
    });
    const jsonFile = join(ROOT, "docs/qa-modelos.json");
    // casos que não existem mais (modelo ou variante renomeados) saem do relatório
    const known = new Set(all.map((c) => c.key));
    const merged = mergeRows(existsSync(jsonFile) ? (JSON.parse(readFileSync(jsonFile, "utf8")) as QaRow[]) : [], rows).filter((r) => known.has(r.key));
    writeFileSync(jsonFile, JSON.stringify(merged, null, 1) + "\n");
    writeFileSync(join(ROOT, "docs/QA-modelos.md"), renderReport(merged, HEADER(slicing)));
  }, 6 * 3600 * 1000);
});

const HEADER = (sliced: boolean) => `# QA dos Modelos prontos e ferramentas (#90)

Gerado por \`scripts/validate-models\` (não edite à mão: os dados ficam em \`docs/qa-modelos.json\`; cada rodada só troca os casos que rodou).

Para cada modelo: valores **padrão**, todos os campos numéricos no **mínimo** e todos no **máximo**. Cada caso vira um 3MF
(com as pausas e a configuração recomendada da #86) e passa por:

- **geometria:** malha manifold, nada abaixo da mesa, cada objeto encostado na mesa, nenhum corpo solto no ar, cabe em 256 mm,
  parede/traço < 0,4 mm (abertura de 0,2 mm num corte a 10/30/50/70/90% da altura → aviso), extrusora de cada parte = sua cor, até 4 cores (AMS lite);
- **Bambu Studio CLI** ${sliced ? "" : "(não rodou nesta máquina) "}— perfil Bambu Lab A1 0.4 + 0.20mm Standard + Bambu PLA Basic, herança resolvida,
  \`--arrange 1\`: fatiou, gramas > 0, cabe numa placa, pausas \`M400 U1\` no Z pedido (até 0,21 mm), tempo < 24 h.
  Fatia com **um filamento**: o CLI 02.08 cai (código 139, group_nozzle_info) com 2+ filamentos em perfis resolvidos,
  então a troca de cores é conferida no 3MF, não no G-code.
- **OrcaSlicer:** não instalado nas máquinas da equipe; o 3MF segue o mesmo formato (Metadata/model_settings.config).

"n/a" = o modelo precisa de uma entrada que o teste não dá (ex.: foto). "app:" = aviso que o próprio app mostra na tela.
`;
