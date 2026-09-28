import { describe, expect, test } from "vitest";
import { extractReply, parseParts, partProgram } from "./scad";

const reply = `Fiz um porta-copos redondo com o nome em relevo.

\`\`\`openscad
// @part base #2563eb Base
// @part texto #ffffff Texto
module base() { cylinder(h = 3, r = 45, $fn = 96); }
module texto() { translate([0, 0, 3]) linear_extrude(1) text("Ana", size = 12, halign = "center", valign = "center"); }
\`\`\`

Quer que eu aumente a borda?`;

describe("extractReply", () => {
  test("separa explicação e código OpenSCAD", () => {
    const r = extractReply(reply);
    expect(r.code).toContain("module base()");
    expect(r.code?.startsWith("//")).toBe(true);
    expect(r.explanation).toContain("porta-copos");
    expect(r.explanation).toContain("aumente a borda");
    expect(r.explanation).not.toContain("module");
  });

  test("aceita bloco ```scad ou sem linguagem; sem código retorna null", () => {
    expect(extractReply("ok\n```scad\ncube(1);\n```").code).toBe("cube(1);");
    expect(extractReply("ok\n```\ncube(2);\n```").code).toBe("cube(2);");
    expect(extractReply("Não entendi, pode detalhar?").code).toBeNull();
  });
});

describe("parseParts", () => {
  test("lê as declarações @part (módulo, cor, nome)", () => {
    expect(parseParts(extractReply(reply).code!)).toEqual([
      { module: "base", color: "#2563eb", name: "Base" },
      { module: "texto", color: "#ffffff", name: "Texto" },
    ]);
  });

  test("ignora @part que aponta para módulo inexistente ou com cor inválida", () => {
    const code = "// @part a #zzzzzz A\n// @part b #112233 B\nmodule b() { cube(1); }";
    expect(parseParts(code)).toEqual([{ module: "b", color: "#112233", name: "B" }]);
  });
});

test("partProgram chama só o módulo da parte", () => {
  const code = extractReply(reply).code!;
  expect(partProgram(code, "texto").trim().endsWith("texto();")).toBe(true);
});
