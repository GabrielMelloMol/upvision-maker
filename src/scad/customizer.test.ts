import { expect, test } from "vitest";
import { defineArgs, parseCustomizer, plateModules, scadImports } from "./customizer";

const SRC = `// Caixa com tampa
/* [Medidas] */
// Largura da caixa
largura = 60; // [20:5:200]
altura = 30; // [10:100]
parede = 1.6; // .2
/* [Estilo] */
formato = "redondo"; // [redondo, quadrado, hexagonal]
cantos = 2; // [0:Reto, 2:Suave, 5:Bem redondo]
tampa = true;
texto = "OLÁ"; // 12
cor_base = "#2563eb"; // color
fonte = "Pacifico"; // font
furo = [3, 4];
/* [Hidden] */
$fn = 64;
interno = largura - 2 * parede;

module caixa() { cube([largura, largura, altura]); }
depois = 5; // [1:10]
caixa();
`;

test("variáveis de topo no formato do Customizer: abas, slider, lista, rótulo, cor, fonte e ocultas", () => {
  const ps = parseCustomizer(SRC);
  expect(ps.map((p) => p.name)).toEqual(["largura", "altura", "parede", "formato", "cantos", "tampa", "texto", "cor_base", "fonte", "furo"]);
  const by = Object.fromEntries(ps.map((p) => [p.name, p]));
  expect(by.largura).toMatchObject({ tab: "Medidas", label: "Largura da caixa", kind: "num", value: 60, min: 20, step: 5, max: 200 });
  expect(by.altura).toMatchObject({ kind: "num", min: 10, max: 100, step: 1, label: "altura" });
  expect(by.parede).toMatchObject({ kind: "num", step: 0.2 });
  expect(by.formato).toMatchObject({ tab: "Estilo", kind: "choice", value: "redondo", options: [["redondo", "redondo"], ["quadrado", "quadrado"], ["hexagonal", "hexagonal"]] });
  expect(by.cantos).toMatchObject({ kind: "choice", value: 2, options: [[0, "Reto"], [2, "Suave"], [5, "Bem redondo"]] });
  expect(by.tampa).toMatchObject({ kind: "bool", value: true });
  expect(by.texto).toMatchObject({ kind: "text", value: "OLÁ", maxLength: 12 });
  expect(by.cor_base).toMatchObject({ kind: "color", value: "#2563eb" });
  expect(by.fonte).toMatchObject({ kind: "font", value: "Pacifico" });
  expect(by.furo).toMatchObject({ kind: "vector", value: [3, 4] });
});

test("sem cabeçalho de aba: aba Parâmetros; expressões e texto depois do 1º módulo ficam de fora", () => {
  const ps = parseCustomizer(`a = 2;\nb = a * 2;\nmodule m() {}\nc = 1;`);
  expect(ps).toEqual([expect.objectContaining({ name: "a", tab: "Parâmetros", kind: "num", value: 2 })]);
});

test("valores viram -D do OpenSCAD (texto escapado, vetor, booleano)", () => {
  const ps = parseCustomizer(SRC);
  expect(defineArgs(ps, { largura: 80, texto: 'Oi "você"', furo: [5, 6], tampa: false })).toEqual([
    "-D", "largura=80",
    "-D", "tampa=false",
    "-D", 'texto="Oi \\"você\\""',
    "-D", "furo=[5,6]",
  ]);
  // valor igual ao do arquivo não vira -D; nome fora da lista é ignorado
  expect(defineArgs(ps, { largura: 60, nada: 1 })).toEqual([]);
});

test("arquivos que o .scad importa e mesas no formato MakerWorld (mw_plate_N)", () => {
  expect(scadImports(`import("default.svg");\nsurface(file = "foto.png", center=true);\nimport("default.svg");`)).toEqual(["default.svg", "foto.png"]);
  expect(plateModules(`module mw_plate_2() {}\nmodule mw_plate_1() { }\nmodule outro() {}`)).toEqual(["mw_plate_1", "mw_plate_2"]);
});
