/// <reference lib="webworker" />
import { unzipSync } from "fflate";
import bosl2Url from "../assets/openscad/bosl2.zip?url";
import { fontUrl, type CatalogFont } from "../geometry/fontCatalog";
import { fontsConf, fontsUsed } from "./scadFonts";

/** `args`: extras da linha de comando (ex.: `-D largura=80`); `files`: arquivos que o programa importa (#96). */
export type ScadRequest = { id: number; programs: string[]; args?: string[]; files?: [string, Uint8Array][] };
export type ScadResponse = { id: number; ok: true; stls: Uint8Array[]; ms: number } | { id: number; ok: false; error: string };

const MAX_LOG_LINES = 8;
const fileCache = new Map<string, Promise<Uint8Array>>();
const loadFile = (f: CatalogFont) => {
  let p = fileCache.get(f.file);
  if (!p) {
    p = fetch(fontUrl(f.file)).then(async (r) => new Uint8Array(await r.arrayBuffer()));
    p.catch(() => fileCache.delete(f.file));
    fileCache.set(f.file, p);
  }
  return p;
};

/** BOSL2 (BSD-2, #96): só é baixado do próprio app quando algum programa inclui `BOSL2/…`. */
let bosl2: Promise<[string, Uint8Array][]> | null = null;
const loadBosl2 = () => {
  bosl2 ??= fetch(bosl2Url)
    .then(async (r) => Object.entries(unzipSync(new Uint8Array(await r.arrayBuffer()))).filter(([p]) => !p.endsWith("/")))
    .catch((e) => {
      bosl2 = null;
      throw e;
    });
  return bosl2;
};

type Fs = { mkdir(p: string): void; writeFile(p: string, d: Uint8Array | string): void; analyzePath(p: string): { exists: boolean } };
/** Grava criando as pastas do caminho (ex.: /libraries/BOSL2/std.scad). */
function writeTree(fs: Fs, path: string, data: Uint8Array) {
  const dirs = path.split("/").slice(1, -1);
  dirs.reduce((cur, d) => {
    const next = `${cur}/${d}`;
    if (!fs.analyzePath(next).exists) fs.mkdir(next);
    return next;
  }, "");
  fs.writeFile(path, data);
}

/** Renderiza cada programa numa instância nova do OpenSCAD (WASM, backend Manifold) e devolve STL binário. */
self.onmessage = async (e: MessageEvent<ScadRequest>) => {
  const { id, programs, args = [], files = [] } = e.data;
  const t0 = performance.now();
  try {
    // import sob demanda: o OpenSCAD tem ~11 MB e só carrega quando uma ferramenta renderiza
    const { createOpenSCAD } = await import("openscad-wasm-prebuilt");
    const used = fontsUsed([...programs, ...args]); // a fonte pode vir de um parâmetro (-D fonte="Pacifico")
    const fonts = await Promise.all(used.map(async (f) => [f.file, await loadFile(f)] as const));
    const conf = fontsConf(used);
    const libs = programs.some((p) => /\bBOSL2\//.test(p)) ? await loadBosl2() : [];
    const stls: Uint8Array[] = [];
    for (const program of programs) {
      const log: string[] = [];
      const scad = (await createOpenSCAD({ print: (s) => log.push(s), printErr: (s) => log.push(s) })).getInstance();
      scad.FS.mkdir("/fonts");
      for (const [name, data] of fonts) scad.FS.writeFile(`/fonts/${name}`, data);
      scad.FS.writeFile("/fonts/fonts.conf", conf);
      (scad as unknown as { ENV: Record<string, string> }).ENV.FONTCONFIG_FILE = "/fonts/fonts.conf";
      const fs = scad.FS as unknown as Fs;
      for (const [name, data] of files) writeTree(fs, `/${name.replace(/^\/+/, "")}`, data);
      for (const [name, data] of libs) writeTree(fs, `/libraries/${name}`, data);
      if (libs.length) (scad as unknown as { ENV: Record<string, string> }).ENV.OPENSCADPATH = "/libraries";
      scad.FS.writeFile("/m.scad", program);
      const rc = scad.callMain(["/m.scad", "-o", "/m.stl", "--backend=manifold", "--export-format=binstl", ...args]);
      let out: Uint8Array | null = null;
      try {
        out = scad.FS.readFile("/m.stl", { encoding: "binary" });
      } catch {
        out = null;
      }
      if (rc !== 0 || !out || out.byteLength <= 84) {
        const errors = log.filter((l) => /error|warning|undefined|syntax|empty/i.test(l)).slice(-MAX_LOG_LINES);
        throw new Error(errors.length ? errors.join("\n") : "O OpenSCAD não gerou nenhuma forma (objeto vazio).");
      }
      stls.push(out);
    }
    self.postMessage({ id, ok: true, stls, ms: performance.now() - t0 } satisfies ScadResponse);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies ScadResponse);
  }
};
