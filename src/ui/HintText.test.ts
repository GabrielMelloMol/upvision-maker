import { expect, test } from "vitest";
import { HINT_MAX, splitHint } from "./HintText";

test("dica longa: 1ª frase à vista e o resto no ⓘ; curta ou sem frase curta fica inteira (polimento)", () => {
  expect(splitHint("Use 0 para não cobrar mão de obra.")).toEqual(["Use 0 para não cobrar mão de obra.", ""]);
  const long = "Só vale para impressora sem preço cadastrado. Com preço, a calculadora usa a depreciação por hora da máquina e ignora este número.";
  expect(long.length).toBeGreaterThan(HINT_MAX);
  expect(splitHint(long)).toEqual(["Só vale para impressora sem preço cadastrado.", "Com preço, a calculadora usa a depreciação por hora da máquina e ignora este número."]);
  const noStop = "a".repeat(200);
  expect(splitHint(noStop)).toEqual([noStop, ""]);
});
