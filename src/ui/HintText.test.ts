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

// Auditoria de UX (M8): a parte à vista nunca termina em ":" (parecia texto quebrado antes do ⓘ).
test("corte em dois-pontos fecha a frase à vista com ponto final", () => {
  const text = "Para quem compra de você para revender e depois vender de novo para o cliente final: ×3 sobre o custo, ou seja, markup de 200 %.";
  const [shown, more] = splitHint(text);
  expect(shown).toBe("Para quem compra de você para revender e depois vender de novo para o cliente final.");
  expect(shown.endsWith(":")).toBe(false);
  expect(more).toBe("×3 sobre o custo, ou seja, markup de 200 %.");
});
