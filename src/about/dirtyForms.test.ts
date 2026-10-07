// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test } from "vitest";
import { hasUnsavedFields, watchEdits } from "./dirtyForms";

/** Auditoria 2026-10, M6: atualizar reinicia o app; campos digitados e não salvos pedem confirmação. */
let stop: () => void;
beforeEach(() => {
  stop = watchEdits();
});
afterEach(() => {
  stop();
  document.body.innerHTML = "";
});
const type = (el: HTMLInputElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

test("sem digitar nada, não há o que perder", () => {
  document.body.innerHTML = "<form><input id=a></form>";
  expect(hasUnsavedFields()).toBe(false);
});

test("campo digitado num formulário ainda na tela conta como não salvo", () => {
  document.body.innerHTML = "<form><input id=a></form>";
  type(document.getElementById("a") as HTMLInputElement, "Ana");
  expect(hasUnsavedFields()).toBe(true);
});

test("campo que saiu da tela (salvou e fechou) não conta", () => {
  document.body.innerHTML = "<dialog open><input id=a></dialog>";
  type(document.getElementById("a") as HTMLInputElement, "Ana");
  document.body.innerHTML = "";
  expect(hasUnsavedFields()).toBe(false);
});

test("ferramentas gravam rascunho sozinhas: campo dentro de .tool-layout não conta", () => {
  document.body.innerHTML = "<div class='tool-layout'><input id=a></div>";
  type(document.getElementById("a") as HTMLInputElement, "Ana");
  expect(hasUnsavedFields()).toBe(false);
});

test("busca e filtros (fora de formulário e de janela) não contam", () => {
  document.body.innerHTML = "<input id=a type=search>";
  type(document.getElementById("a") as HTMLInputElement, "vaso");
  expect(hasUnsavedFields()).toBe(false);
});

test("página sem <form> (Calculadora, Orçamentos): campo digitado na página conta", () => {
  document.body.innerHTML = "<main class='page'><input id=a></main>";
  type(document.getElementById("a") as HTMLInputElement, "12");
  expect(hasUnsavedFields()).toBe(true);
});

test("filtros da barra de ferramentas da página não contam", () => {
  document.body.innerHTML = "<main class='page'><div class='toolbar'><select id=a><option>x</option></select></div></main>";
  type(document.getElementById("a") as HTMLInputElement, "x");
  expect(hasUnsavedFields()).toBe(false);
});
