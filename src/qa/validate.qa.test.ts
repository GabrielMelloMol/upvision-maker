import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { getManifold } from "../geometry/manifold";
import { modelColors, write3mf } from "../geometry/threemf";
import { modelCases, MissingInput, serveFontsFromDisk, type QaCase } from "./cases";
import { checkModels } from "./checks";
import { mergeRows, renderReport, statusOf, type QaRow } from "./report";
import { BAMBU, installed, ORCA, slice, sliceBambuProject, writeProfiles, type Profiles, type SliceResult } from "./slicer";
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

type Built = { c: QaCase; row: QaRow; file?: string; colors: string[]; pauses: number[]; notes: string[]; bedWarned: boolean; colorWarned: boolean };

async function build(c: QaCase): Promise<Built> {
  const M = await getManifold();
  const row: QaRow = { key: c.key, owner: c.owner, group: c.group, label: c.label, variant: c.variant, status: "ok", reasons: [], date: new Date().toISOString().slice(0, 10) };
  let out;
  try {
    out = await c.build();
  } catch (e) {
    const na = e instanceof MissingInput;
    return { c, row: { ...row, status: statusOf(na ? [] : ["x"], [], na), reasons: [na ? `pede entrada: ${e.message}` : `erro ao gerar: ${e instanceof Error ? e.message : String(e)}`] }, colors: [], pauses: [], notes: [], bedWarned: false, colorWarned: false };
  }
  const problems = checkModels(M, out.models);
  // peça maior que a mesa do A1 com o aviso do app na tela: não é bug (serve para impressoras de mesa maior), é aviso
  const bedWarned = out.warnings.some((w) => /mesa/i.test(w));
  // o app avisa que uma parte some (passa da mesa, traço ou cor mais fina que o bico): a cor dela pode não sair no G-code
  const colorWarned = bedWarned || out.warnings.some((w) => /\bsomem?\b/i.test(w));
  const isBed = (msg: string) => /não cabe na mesa|passa da mesa/.test(msg);
  const fails = problems.filter((p) => p.kind === "fail" && !(bedWarned && isBed(p.msg))).map((p) => p.msg);
  const warns = problems.filter((p) => p.kind === "warn" || (bedWarned && isBed(p.msg))).map((p) => p.msg);
  const notes = out.warnings.map((w) => `app: ${w}`); // o que o app já mostra na tela: vai no relatório, não muda o resultado
  const bytes = write3mf(out.models, { pauses: out.pauses, profile: c.profile });
  const colors = new Set(modelColors(out.models));
  const extruders = new Set([...strFromU8(unzipSync(bytes)["Metadata/model_settings.config"]).matchAll(/key="extruder" value="(\d+)"/g)].map((m) => m[1]));
  if (extruders.size !== colors.size) fails.push(`${colors.size} cores mas ${extruders.size} extrusoras no 3MF`);
  if (colors.size > MAX_AMS) warns.push(`${colors.size} cores: mais que os ${MAX_AMS} do AMS lite`);
  const dir = join(OUT, c.key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-]+/g, "_"));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "modelo.3mf");
  writeFileSync(file, bytes);
  return { c, row: { ...row, status: statusOf(fails, warns), reasons: [...fails, ...warns, ...notes] }, file, colors: [...colors], pauses: [...out.pauses].sort((a, b) => a - b), notes, bedWarned, colorWarned };
}

type Slices = { bambu?: SliceResult; orca?: SliceResult; project?: SliceResult };
const z = (n: number) => n.toFixed(2).replace(".", ",");

/** O que um fatiador mostrou de errado: não fatiou, 0 g, cor que não saiu no G-code, pausa faltando ou fora do Z. */
function judge(label: string, s: SliceResult, b: Built): { fails: string[]; warns: string[] } {
  if (!s.ok) {
    const error = s.error ?? "não fatiou";
    // peça maior que a mesa do A1 e o app já avisou na tela: aviso
    if (b.bedWarned && /no object fully inside|plate is empty/i.test(error)) return { fails: [], warns: [`${label} recusa na mesa de 256 mm do A1 (o app avisa)`] };
    // torre de purga (2+ cores) no CLI: o --arrange só reserva a torre para STL (--load-filament-ids), então com a mesa
    // cheia ela cai em cima de uma peça (-101); e na posição padrão (y = 220) ela passa da mesa quando a camada pede 2
    // trocas (-104). Na tela, o Arrumar reserva a torre e dá para arrastá-la: limite do CLI, não do modelo (#90)
    if (b.colors.length > 1 && /G-code conflicts|outside of the printable area/.test(error))
      return { fails: [], warns: [`${label}: torre de purga ${/conflicts/.test(error) ? "em cima de uma peça depois do --arrange do CLI" : "passa da mesa na posição padrão do CLI"} (na tela, arraste a torre ou use Arrumar)`] };
    return { fails: [`${label}: ${error}`], warns: [] };
  }
  const empty = !s.used.length;
  const missing = empty ? [] : b.colors.flatMap((c, i) => (s.used.includes(i + 1) ? [] : [`${label}: a cor ${i + 1} (${c}) não saiu no G-code`]));
  const fails = [
    // peça maior que a mesa (o app avisa) pode deixar a placa vazia: o "recusa na mesa" já conta como aviso
    ...(empty && !b.bedWarned ? [`${label}: fatiou com 0 g de filamento`] : []),
    // peça maior que a mesa ou cor fina demais, com o aviso do app na tela: a cor some junto, é aviso e não cor errada
    ...(b.colorWarned ? [] : missing),
    ...(s.pauseZ.length !== b.pauses.length
      ? [`${label}: ${b.pauses.length} pausa(s) pedida(s), ${s.pauseZ.length} no G-code`]
      : b.pauses.flatMap((p, i) => (Math.abs(s.pauseZ[i] - p) > Z_TOL ? [`${label}: pausa em Z ${z(s.pauseZ[i])} (pedida ${z(p)})`] : []))),
  ];
  return { fails, warns: [...(empty && b.bedWarned ? [`${label}: placa vazia, a peça passa da mesa (o app avisa)`] : []), ...(b.colorWarned ? missing.map((m) => `${m} (o app avisa)`) : [])] };
}

function withSlices(b: Built, r: Slices): QaRow {
  const own = b.row.reasons.filter((x) => !b.notes.includes(x));
  const judged = ([["Bambu", r.bambu], ["Orca", r.orca], ["Projeto Bambu", r.project]] as const).flatMap(([label, s]) => (s ? [{ label, ...judge(label, s, b) }] : []));
  const fails = [...(b.row.status === "falha" ? own : []), ...judged.flatMap((j) => j.fails)];
  const main = r.bambu ?? r.orca;
  const warns = [
    ...(b.row.status === "falha" ? [] : own),
    ...judged.flatMap((j) => j.warns),
    ...(main?.ok && main.seconds > MAX_HOURS * 3600 ? [`mais de ${MAX_HOURS} h de impressão`] : []),
    ...(main?.ok && main.plates > 1 ? [`não coube numa placa: ${main.plates} placas`] : []),
  ];
  return {
    ...b.row,
    status: statusOf(fails, warns),
    reasons: [...fails, ...warns, ...b.notes],
    slicers: judged.map((j) => `${j.label} ${j.fails.length ? "✗" : "✓"}`).join(" · ") || undefined,
    ...(main?.ok
      ? { minutes: Math.round(main.seconds / 60), grams: Math.round(main.total * 10) / 10, plates: main.plates, pauses: b.pauses.length ? main.pauseZ.map(z).join(" / ") : undefined }
      : {}),
  };
}

/** Bambu e Orca com o 3MF do app; o "Projeto do Bambu Studio" quando ele serve para algo (cores ou pausas). */
async function sliceAll(b: Built, profiles: { bambu?: Profiles; orca?: Profiles }): Promise<Slices> {
  const dir = join(b.file!, "..");
  const bambu = profiles.bambu && (await slice(BAMBU, b.file!, join(dir, "bambu"), profiles.bambu, b.colors, b.pauses));
  const orca = profiles.orca && (await slice(ORCA, b.file!, join(dir, "orca"), profiles.orca, b.colors, b.pauses));
  const wantsProject = profiles.bambu && (b.colors.length > 1 || b.pauses.length > 0);
  const project = wantsProject ? await sliceBambuProject(b.file!, dir, profiles.bambu!, b.colors, b.pauses) : undefined;
  return { bambu, orca, project };
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
    const profiles = {
      bambu: SLICE && installed(BAMBU) ? writeProfiles(BAMBU, join(OUT, "_perfis/bambu")) : undefined,
      orca: SLICE && installed(ORCA) ? writeProfiles(ORCA, join(OUT, "_perfis/orca")) : undefined,
    };
    const rows = await pool(built, JOBS, async (b) => {
      if (!(profiles.bambu || profiles.orca) || !b.file) return b.row;
      const r = withSlices(b, await sliceAll(b, profiles));
      console.log(`[qa] fatiado ${b.c.key}: ${r.status} ${r.reasons.join("; ")}`);
      return r;
    });
    const jsonFile = join(ROOT, "docs/qa-modelos.json");
    // casos que não existem mais (modelo ou variante renomeados) saem do relatório
    const known = new Set(all.map((c) => c.key));
    const merged = mergeRows(existsSync(jsonFile) ? (JSON.parse(readFileSync(jsonFile, "utf8")) as QaRow[]) : [], rows).filter((r) => known.has(r.key));
    writeFileSync(jsonFile, JSON.stringify(merged, null, 1) + "\n");
    writeFileSync(join(ROOT, "docs/QA-modelos.md"), renderReport(merged, HEADER));
  }, 6 * 3600 * 1000);
});

const HEADER = `# QA dos Modelos prontos e ferramentas (#90)

Gerado por \`scripts/validate-models\` (não edite à mão: os dados ficam em \`docs/qa-modelos.json\`; cada rodada só troca os casos que rodou).
O resumo da rodada, com o que falhava e o que foi corrigido, está em [QA-fatiador.md](QA-fatiador.md).

Para cada modelo: valores **padrão**, todos os campos numéricos no **mínimo** e todos no **máximo**. Cada caso vira um 3MF
(com as pausas e a configuração recomendada da #86) e passa por:

- **geometria:** malha manifold, nada abaixo da mesa, cada objeto encostado na mesa, nenhum corpo solto no ar, cabe em 256 mm,
  parede/traço < 0,4 mm (abertura de 0,2 mm num corte a 10/30/50/70/90% da altura → aviso), extrusora de cada parte = sua cor, até 4 cores (AMS lite);
- **fatiadores** (coluna "Fatiadores"), perfil Bambu Lab A1 0.4 + 0.20mm Standard + Bambu PLA Basic, herança resolvida,
  \`--arrange 1\`, **um filamento por cor** (cada um com a sua cor):
  - **Bambu:** Bambu Studio CLI com o 3MF do app (a pausa vai por \`--load-custom-gcodes\`, como no botão do app);
  - **Orca:** OrcaSlicer CLI com o 3MF do app (a pausa sai do próprio 3MF);
  - **Projeto Bambu:** só com 2+ cores ou pausa — o caminho do botão "Projeto do Bambu Studio": o CLI exporta o projeto,
    o app troca as cores e o projeto é fatiado.

  Em cada um: fatiou, gramas > 0, **cada cor com gramas no G-code** (a parte saiu no filamento certo), pausas \`M400 U1\`
  no Z pedido (até 0,21 mm). Tempo, gramas e placas da tabela são do Bambu; mais de 24 h ou mais de uma placa → aviso.

"n/a" = o modelo precisa de uma entrada que o teste não dá (ex.: foto). "app:" = aviso que o próprio app mostra na tela.
Peça maior que a mesa de 256 mm do A1 conta como **aviso** quando o app avisa na tela (os campos vão além para
impressoras de mesa maior); sem o aviso do app, é **falha**.
`;
