import { expect, test } from "vitest";
import { parseCustomizer } from "./customizer";
import { fromFormValue, toFormValue, toSections } from "./form";

const ps = parseCustomizer(`/* [Medidas] */
largura = 60; // [20:5:200]
cantos = 2; // [0:Reto, 2:Suave]
/* [Texto] */
fonte = "Pacifico"; // font
outra = "Fonte Inexistente"; // font
furo = [3, 4];
`);
const by = Object.fromEntries(ps.map((p) => [p.name, p]));

test("uma seção por aba, com os campos do formulário dos Modelos prontos", () => {
  const s = toSections(ps);
  expect(s.map((x) => x.title)).toEqual(["Medidas", "Texto"]);
  expect(s[0].fields[0]).toMatchObject({ k: "largura", kind: "num", min: 20, max: 200, step: 5 });
  expect(s[0].fields[1]).toMatchObject({ kind: "choice", options: [["0", "Reto"], ["2", "Suave"]] });
  expect(s[1].fields.map((f) => f.kind)).toEqual(["font", "text", "text"]);
});

test("ida e volta: lista numérica, fonte do catálogo e vetor", () => {
  expect(fromFormValue(by.cantos, toFormValue(by.cantos, 2))).toBe(2);
  expect(toFormValue(by.fonte, "Pacifico")).toBe("pacifico");
  expect(fromFormValue(by.fonte, "pacifico")).toBe("Pacifico");
  expect(toFormValue(by.furo, [3, 4])).toBe("3, 4");
  expect(fromFormValue(by.furo, "5, 6.5")).toEqual([5, 6.5]);
  expect(fromFormValue(by.furo, "5, x")).toBeNull();
});
