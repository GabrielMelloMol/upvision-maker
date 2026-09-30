import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Fatiamento no Bambu Studio CLI para a varredura de QA (#90): perfil A1 0.4 + "0.20mm Standard @BBL A1" + Bambu PLA
 * Basic, com a herança (`inherits`) resolvida — sem isso o CLI usa mesa de 200 mm, pausa vazia e 0 g de filamento.
 * Um filamento só: o CLI 02.08 cai (139) ao fatiar 2+ filamentos com perfis resolvidos (group_nozzle_info), então
 * cores/extrusoras são conferidas no próprio 3MF.
 */
export const BAMBU_APP = process.env.BAMBU_APP ?? "/Applications/BambuStudio.app";
const EXE = join(BAMBU_APP, "Contents/MacOS/BambuStudio");
const PROFILES = join(BAMBU_APP, "Contents/Resources/profiles/BBL");
const PROFILE_NAMES = { machine: "Bambu Lab A1 0.4 nozzle", process: "0.20mm Standard @BBL A1", filament: "Bambu PLA Basic @BBL A1" } as const;
const TIMEOUT_MS = 10 * 60 * 1000;

export const hasBambu = () => existsSync(EXE);

type Json = Record<string, unknown>;
function resolve(kind: string, name: string, seen = new Set<string>()): Json {
  if (seen.has(name)) throw new Error(`perfil circular: ${name}`);
  seen.add(name);
  const own = JSON.parse(readFileSync(join(PROFILES, kind, `${name}.json`), "utf8")) as Json;
  const base = typeof own.inherits === "string" ? resolve(kind, own.inherits, seen) : {};
  const out: Json = { ...base, ...own, name, from: "system" };
  delete out.inherits;
  return out;
}

/** Grava os 3 perfis resolvidos em `dir` e devolve os caminhos. */
export function writeProfiles(dir: string): { machine: string; process: string; filament: string } {
  mkdirSync(dir, { recursive: true });
  const write = (kind: keyof typeof PROFILE_NAMES) => {
    const file = join(dir, `${kind}.json`);
    writeFileSync(file, JSON.stringify(resolve(kind, PROFILE_NAMES[kind])));
    return file;
  };
  return { machine: write("machine"), process: write("process"), filament: write("filament") };
}

export type SliceResult = {
  ok: boolean;
  error?: string;
  plates: number;
  seconds: number;
  grams: number;
  /** Z (topo da camada) de cada pausa M400 U1 no G-code. */
  pauseZ: number[];
};

const TIME_RE = /total estimated time: (?:(\d+)d )?(?:(\d+)h )?(?:(\d+)m )?(\d+)s/;
export function parseGcode(g: string): { seconds: number; pauseZ: number[] } {
  const t = TIME_RE.exec(g);
  const seconds = t ? ((Number(t[1] ?? 0) * 24 + Number(t[2] ?? 0)) * 60 + Number(t[3] ?? 0)) * 60 + Number(t[4]) : 0;
  const pauseZ: number[] = [];
  let z = 0;
  for (const line of g.split("\n")) {
    if (line.startsWith("; Z_HEIGHT:")) z = Number(line.slice(11));
    else if (line.startsWith("M400 U1")) pauseZ.push(z);
  }
  return { seconds, pauseZ };
}

function run(args: string[]): Promise<number | null> {
  return new Promise((done) => {
    const p = spawn(EXE, args, { stdio: "ignore" });
    const timer = setTimeout(() => p.kill("SIGKILL"), TIMEOUT_MS);
    p.on("close", (code) => {
      clearTimeout(timer);
      done(code);
    });
    p.on("error", () => done(null));
  });
}

/** Fatia `file` (3MF) com os perfis de `writeProfiles`; `out` precisa ser caminho absoluto. */
export async function slice(file: string, out: string, profiles: ReturnType<typeof writeProfiles>, pauses: number[] = []): Promise<SliceResult> {
  mkdirSync(out, { recursive: true });
  // o Bambu não lê a pausa do 3MF simples: vai como no "Projeto do Bambu Studio" da #11 (src-tauri/src/bambu.rs)
  const pauseFile = join(out, "pausas.json");
  writeFileSync(pauseFile, JSON.stringify({ mode: "SingleExtruder", gcodes: pauses.map((z) => ({ type: "PausePrint", print_z: z, color: "", extruder: 1, extra: "" })) }));
  const pauseArgs = pauses.length ? ["--load-custom-gcodes", pauseFile] : [];
  const code = await run(["--slice", "0", "--arrange", "1", "--load-settings", `${profiles.machine};${profiles.process}`, "--load-filaments", profiles.filament, ...pauseArgs, "--outputdir", out, file]);
  const fail = (error: string): SliceResult => ({ ok: false, error, plates: 0, seconds: 0, grams: 0, pauseZ: [] });
  const resultFile = join(out, "result.json");
  if (!existsSync(resultFile)) return fail(`Bambu Studio CLI saiu com código ${code} sem result.json`);
  const r = JSON.parse(readFileSync(resultFile, "utf8")) as { return_code: number; error_string: string; sliced_plates?: { filaments?: { total_used_g: number }[] }[] };
  if (r.return_code !== 0) return fail(`Bambu Studio: ${r.error_string} (código ${r.return_code})`);
  const gcodes = readdirSync(out).filter((f) => f.endsWith(".gcode"));
  if (!gcodes.length) return fail(`Bambu Studio não gerou G-code (código ${code})`);
  let seconds = 0;
  const pauseZ: number[] = [];
  for (const f of gcodes) {
    const g = parseGcode(readFileSync(join(out, f), "utf8"));
    seconds += g.seconds;
    pauseZ.push(...g.pauseZ);
  }
  const grams = (r.sliced_plates ?? []).flatMap((p) => p.filaments ?? []).reduce((s, f) => s + f.total_used_g, 0);
  return { ok: true, plates: gcodes.length, seconds, grams, pauseZ };
}
