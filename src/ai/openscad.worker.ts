/// <reference lib="webworker" />
import fredoka from "../assets/scad-fonts/Fredoka-SemiBold.ttf?url";
import hanken from "../assets/scad-fonts/HankenGrotesk-ExtraBold.ttf?url";
import pacifico from "../assets/scad-fonts/Pacifico-Regular.ttf?url";

export type ScadRequest = { id: number; programs: string[] };
export type ScadResponse = { id: number; ok: true; stls: Uint8Array[]; ms: number } | { id: number; ok: false; error: string };

const MAX_LOG_LINES = 8;

/** Fontes para text() no OpenSCAD (OFL). "Liberation Sans", a padrão do OpenSCAD, aponta para a Hanken Grotesk. */
const FONTS: Record<string, string> = { "HankenGrotesk-ExtraBold.ttf": hanken, "Fredoka-SemiBold.ttf": fredoka, "Pacifico-Regular.ttf": pacifico };
const FONTS_CONF = `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>/fonts</dir>
<alias><family>Liberation Sans</family><prefer><family>Hanken Grotesk ExtraBold</family></prefer></alias>
<alias><family>sans-serif</family><prefer><family>Hanken Grotesk ExtraBold</family></prefer></alias></fontconfig>`;

let fontData: Promise<[string, Uint8Array][]> | null = null;
const loadFonts = () =>
  (fontData ??= Promise.all(Object.entries(FONTS).map(async ([name, url]) => [name, new Uint8Array(await (await fetch(url)).arrayBuffer())] as [string, Uint8Array])));

/** Renderiza cada programa numa instância nova do OpenSCAD (WASM, backend Manifold) e devolve STL binário. */
self.onmessage = async (e: MessageEvent<ScadRequest>) => {
  const { id, programs } = e.data;
  const t0 = performance.now();
  try {
    // import sob demanda: o OpenSCAD tem ~11 MB e só carrega quando a ferramenta de IA renderiza
    const { createOpenSCAD } = await import("openscad-wasm-prebuilt");
    const fonts = await loadFonts();
    const stls: Uint8Array[] = [];
    for (const program of programs) {
      const log: string[] = [];
      const scad = (await createOpenSCAD({ print: (s) => log.push(s), printErr: (s) => log.push(s) })).getInstance();
      scad.FS.mkdir("/fonts");
      for (const [name, data] of fonts) scad.FS.writeFile(`/fonts/${name}`, data);
      scad.FS.writeFile("/fonts/fonts.conf", FONTS_CONF);
      (scad as unknown as { ENV: Record<string, string> }).ENV.FONTCONFIG_FILE = "/fonts/fonts.conf";
      scad.FS.writeFile("/m.scad", program);
      const rc = scad.callMain(["/m.scad", "-o", "/m.stl", "--backend=manifold", "--export-format=binstl"]);
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
