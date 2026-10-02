import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withFilamentColors } from "../geometry/bambuProject";

/**
 * Fatiamento real para a varredura de QA (#90): Bambu Studio CLI e OrcaSlicer CLI (o Orca é um fork do Bambu e tem o
 * mesmo CLI e os mesmos perfis BBL). Perfil A1 0.4 + "0.20mm Standard @BBL A1" + Bambu PLA Basic, com a herança
 * (`inherits`) resolvida — sem isso o CLI usa mesa de 200 mm, pausa vazia e 0 g de filamento.
 * Um filamento por cor do modelo, cada um com a sua cor: com a mesma cor (ou o mesmo perfil sem cor) o CLI junta tudo
 * no filamento 1 e não dá para conferir se cada parte saiu na extrusora certa.
 */
export type Slicer = { name: "Bambu Studio" | "OrcaSlicer"; app: string };
export const BAMBU: Slicer = { name: "Bambu Studio", app: process.env.BAMBU_APP ?? "/Applications/BambuStudio.app" };
export const ORCA: Slicer = { name: "OrcaSlicer", app: process.env.ORCA_APP ?? "/Applications/OrcaSlicer.app" };
const exe = (s: Slicer) => join(s.app, "Contents/MacOS", s.name === "OrcaSlicer" ? "OrcaSlicer" : "BambuStudio");
export const installed = (s: Slicer) => existsSync(exe(s));

const PROFILE_NAMES = { machine: "Bambu Lab A1 0.4 nozzle", process: "0.20mm Standard @BBL A1", filament: "Bambu PLA Basic @BBL A1" } as const;
const TIMEOUT_MS = 10 * 60 * 1000;

type Json = Record<string, unknown>;
function resolve(dir: string, kind: string, name: string, seen = new Set<string>()): Json {
  if (seen.has(name)) throw new Error(`perfil circular: ${name}`);
  seen.add(name);
  const own = JSON.parse(readFileSync(join(dir, kind, `${name}.json`), "utf8")) as Json;
  const base = typeof own.inherits === "string" ? resolve(dir, kind, own.inherits, seen) : {};
  const out: Json = { ...base, ...own, name, from: "system" };
  delete out.inherits;
  return out;
}

export type Profiles = { machine: string; process: string; filament: Json };

/** Grava a máquina e o processo resolvidos em `dir`; o filamento vai por caso, um arquivo por cor (`slice`). */
export function writeProfiles(s: Slicer, dir: string): Profiles {
  mkdirSync(dir, { recursive: true });
  const profiles = join(s.app, "Contents/Resources/profiles/BBL");
  const write = (kind: "machine" | "process") => {
    const file = join(dir, `${kind}.json`);
    writeFileSync(file, JSON.stringify(resolve(profiles, kind, PROFILE_NAMES[kind])));
    return file;
  };
  return { machine: write("machine"), process: write("process"), filament: resolve(profiles, "filament", PROFILE_NAMES.filament) };
}

function filamentFiles(p: Profiles, dir: string, colors: string[]): string[] {
  return (colors.length ? colors : ["#808080"]).map((c, i) => {
    const file = join(dir, `filamento${i + 1}.json`);
    writeFileSync(file, JSON.stringify({ ...p.filament, filament_colour: [c.toUpperCase()] }));
    return file;
  });
}

export type SliceResult = {
  ok: boolean;
  error?: string;
  plates: number;
  seconds: number;
  /** Gramas de cada filamento (índice 0 = filamento 1), somando as placas. */
  grams: number[];
  /** Filamentos usados em alguma placa (1 = filamento 1), mesmo quando o cabeçalho não traz o peso. */
  used: number[];
  /** Gramas no total (o Bambu tira do result.json, que não perde a placa de cabeçalho vazio). */
  total: number;
  /** Z (topo da camada) de cada pausa M400 U1 no G-code. */
  pauseZ: number[];
};

const TIME_RE = /total estimated time: (?:(\d+)d )?(?:(\d+)h )?(?:(\d+)m )?(\d+)s/;
// Bambu: "; total filament weight [g] : 1.76,1.20" · Orca: "; filament used [g] = 1.94, 0.80"
const GRAMS_RE = /^; (?:total filament weight \[g\] :|filament used \[g\] =)[ \t]*(.*)$/m;
// Bambu: "; filament: 1,2" = filamentos usados na placa (vem até quando o peso sai vazio)
const USED_RE = /^; filament: ([\d,]+)$/m;
export function parseGcode(g: string): { seconds: number; grams: number[]; used: number[]; pauseZ: number[] } {
  const t = TIME_RE.exec(g);
  const seconds = t ? ((Number(t[1] ?? 0) * 24 + Number(t[2] ?? 0)) * 60 + Number(t[3] ?? 0)) * 60 + Number(t[4]) : 0;
  const grams = (GRAMS_RE.exec(g)?.[1].split(",") ?? []).filter((v) => v.trim()).map(Number);
  const used = (USED_RE.exec(g)?.[1].split(",") ?? []).filter(Boolean).map(Number);
  const pauseZ: number[] = [];
  let z = 0;
  for (const line of g.split("\n")) {
    if (line.startsWith("; Z_HEIGHT:")) z = Number(line.slice(11));
    else if (line.startsWith("M400 U1")) pauseZ.push(z);
  }
  return { seconds, grams, used, pauseZ };
}

function run(s: Slicer, args: string[]): Promise<number | null> {
  return new Promise((done) => {
    const p = spawn(exe(s), args, { stdio: "ignore" });
    const timer = setTimeout(() => p.kill("SIGKILL"), TIMEOUT_MS);
    p.on("close", (code) => {
      clearTimeout(timer);
      done(code);
    });
    p.on("error", () => done(null));
  });
}

/** Códigos de saída do CLI (o Orca não grava result.json): os mesmos textos do Bambu, para as mesmas regras. */
const CLI_ERRORS: Record<number, string> = {
  [-50]: "One of the plate is empty or has no object fully inside it.",
  [-52]: "Some objects are located over the boundary of the heated bed.",
  [-100]: "Failed slicing the model.",
  [-101]: "G-code conflicts detected after slicing.",
  [-102]: "Found G-code outside of the printable area.", // Orca
  [-104]: "Found G-code outside of the printable area.", // Bambu
};
const exitError = (code: number | null) => {
  const signed = code !== null && code > 127 ? code - 256 : code;
  return signed !== null && CLI_ERRORS[signed] ? `${CLI_ERRORS[signed]} (código ${signed})` : `código ${code}`;
};

const fail = (error: string): SliceResult => ({ ok: false, error, plates: 0, seconds: 0, grams: [], used: [], total: 0, pauseZ: [] });

/** Junta os G-codes que o CLI gravou em `out` (um por placa). */
function readOutput(s: Slicer, out: string, code: number | null): SliceResult {
  const resultFile = join(out, "result.json"); // só o Bambu grava
  let reported: number | null = null;
  if (existsSync(resultFile)) {
    const r = JSON.parse(readFileSync(resultFile, "utf8")) as { return_code: number; error_string: string; sliced_plates?: { filaments?: { total_used_g: number }[] }[] };
    if (r.return_code !== 0) return fail(`${s.name}: ${r.error_string} (código ${r.return_code})`);
    reported = (r.sliced_plates ?? []).flatMap((p) => p.filaments ?? []).reduce((a, f) => a + f.total_used_g, 0);
  } else if (code !== 0) {
    // o Orca grava o G-code das placas boas e sai com erro pela placa que falhou
    return fail(`${s.name}: ${exitError(code)}`);
  }
  const gcodes = readdirSync(out).filter((f) => f.endsWith(".gcode"));
  if (!gcodes.length) return fail(`${s.name} não gerou G-code: ${exitError(code)}`);
  let seconds = 0;
  const grams: number[] = [];
  const used = new Set<number>();
  const pauseZ: number[] = [];
  for (const f of gcodes) {
    const g = parseGcode(readFileSync(join(out, f), "utf8"));
    seconds += g.seconds;
    g.grams.forEach((v, i) => (grams[i] = (grams[i] ?? 0) + v));
    g.grams.forEach((v, i) => v > 0 && used.add(i + 1));
    g.used.forEach((f) => used.add(f));
    pauseZ.push(...g.pauseZ);
  }
  const total = reported ?? grams.reduce((a, g) => a + g, 0);
  return { ok: true, plates: gcodes.length, seconds, grams, used: [...used].sort((a, b) => a - b), total, pauseZ };
}

/**
 * Fatia `file` (3MF do app) como a pessoa faria: um filamento por cor, `--arrange 1`. O Orca lê a pausa do próprio
 * 3MF; o Bambu Studio não lê a pausa de 3MF de terceiros, então ela vai como no "Projeto do Bambu Studio" (#11).
 * `out` precisa ser caminho absoluto.
 */
export async function slice(s: Slicer, file: string, out: string, p: Profiles, colors: string[], pauses: number[] = []): Promise<SliceResult> {
  mkdirSync(out, { recursive: true });
  const fils = filamentFiles(p, out, colors);
  const extra: string[] = [];
  if (s === BAMBU && pauses.length) {
    const pauseFile = join(out, "pausas.json");
    writeFileSync(pauseFile, JSON.stringify(pauseJson(pauses, fils.length)));
    extra.push("--load-custom-gcodes", pauseFile);
  }
  const code = await run(s, ["--slice", "0", "--arrange", "1", "--load-settings", `${p.machine};${p.process}`, "--load-filaments", fils.join(";"), ...extra, "--outputdir", out, file]);
  return readOutput(s, out, code);
}

/** Igual ao `pause_json` de src-tauri/src/bambu.rs. */
const pauseJson = (pauses: number[], filaments: number) => ({
  mode: filaments > 1 ? "MultiAsSingle" : "SingleExtruder",
  gcodes: pauses.map((z) => ({ type: "PausePrint", print_z: z, color: "", extruder: 1, extra: "" })),
});

/**
 * O caminho do botão "Projeto do Bambu Studio": o CLI importa o 3MF e exporta o projeto com as pausas (os mesmos
 * argumentos de src-tauri/src/bambu.rs), o app troca as cores (`withFilamentColors`) e a pessoa fatia o projeto.
 */
export async function sliceBambuProject(file: string, out: string, p: Profiles, colors: string[], pauses: number[]): Promise<SliceResult> {
  const exportDir = join(out, "projeto");
  mkdirSync(exportDir, { recursive: true });
  const fils = filamentFiles(p, exportDir, colors);
  const pauseFile = join(exportDir, "pausas.json");
  writeFileSync(pauseFile, JSON.stringify(pauseJson(pauses, fils.length)));
  const code = await run(BAMBU, ["--load-settings", `${p.machine};${p.process}`, "--load-filaments", fils.join(";"), "--load-custom-gcodes", pauseFile, "--outputdir", exportDir, "--export-3mf", "projeto.3mf", file]);
  const project = join(exportDir, "projeto.3mf");
  if (!existsSync(project)) return fail(`Bambu Studio não exportou o projeto (código ${code})`);
  const withColors = join(exportDir, "projeto-cores.3mf");
  writeFileSync(withColors, withFilamentColors(readFileSync(project), colors));
  const sliced = join(out, "projeto-fatiado");
  mkdirSync(sliced, { recursive: true });
  return readOutput(BAMBU, sliced, await run(BAMBU, ["--slice", "0", "--outputdir", sliced, withColors]));
}
