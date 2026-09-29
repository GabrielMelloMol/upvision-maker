import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { CATALOG } from "../geometry/fontCatalog";
import { fontsConf, fontsUsed, scadFontList } from "./scadFonts";

test("monta só as fontes citadas no programa, sempre com a padrão", () => {
  const ids = fontsUsed(['text("Ana", font="Montserrat");', 'text("x", font="Great Vibes");']).map((f) => f.id);
  expect(ids.sort()).toEqual(["great-vibes", "hanken", "montserrat"]);
  expect(fontsUsed(["cube(1);"]).map((f) => f.id)).toEqual(["hanken"]);
});

test("fonts.conf: nome do catálogo aponta para o nome gravado no .ttf", () => {
  const conf = fontsConf(fontsUsed(['font="Montserrat"']));
  expect(conf).toContain("<family>Montserrat</family><prefer><family>Montserrat Thin ExtraBold</family>");
  expect(conf).toContain("<family>Liberation Sans</family><prefer><family>Hanken Grotesk ExtraBold</family>");
});

test("lista do prompt tem todas as fontes do catálogo", () => {
  const list = scadFontList();
  for (const f of CATALOG) expect(list).toContain(`"${f.family}"`);
});

/** Renderiza no OpenSCAD WASM de verdade, com as fontes montadas como no worker. */
async function render(program: string): Promise<{ stl: number; log: string[] }> {
  const { createOpenSCAD } = await import("openscad-wasm-prebuilt");
  const log: string[] = [];
  const scad = (await createOpenSCAD({ print: (s) => log.push(s), printErr: (s) => log.push(s) })).getInstance();
  const used = fontsUsed([program]);
  scad.FS.mkdir("/fonts");
  for (const f of used) scad.FS.writeFile(`/fonts/${f.file}`, readFileSync(resolve(__dirname, "../assets/fonts", f.file)));
  scad.FS.writeFile("/fonts/fonts.conf", fontsConf(used));
  (scad as unknown as { ENV: Record<string, string> }).ENV.FONTCONFIG_FILE = "/fonts/fonts.conf";
  scad.FS.writeFile("/m.scad", program);
  scad.callMain(["/m.scad", "-o", "/m.stl", "--backend=manifold", "--export-format=binstl"]);
  return { stl: scad.FS.readFile("/m.stl", { encoding: "binary" }).byteLength, log };
}

test("OpenSCAD usa a fonte pedida pelo nome do catálogo (instância de fonte variável)", async () => {
  const a = await render('linear_extrude(2) text("Ana", size=10, font="Montserrat");');
  const b = await render('linear_extrude(2) text("Ana", size=10, font="Pacifico");');
  const c = await render('linear_extrude(2) text("Ana", size=10);');
  expect(a.log.join("\n")).not.toMatch(/Can't get font|font.*not found/i);
  // fonte desconhecida cai na padrão: então Montserrat ≠ padrão prova que o alias achou o arquivo
  const unknown = await render('linear_extrude(2) text("Ana", size=10, font="Fonte Que Nao Existe");');
  expect(unknown.stl).toBe(c.stl);
  expect(new Set([a.stl, b.stl, c.stl]).size).toBe(3);
}, 60_000);
