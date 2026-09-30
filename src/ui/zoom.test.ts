// @vitest-environment happy-dom
import { afterEach, expect, test } from "vitest";
import { applyZoom, storedZoom } from "./zoom";

afterEach(() => {
  localStorage.clear();
  document.documentElement.style.removeProperty("zoom");
});

test("tamanho do texto (#144): fora do app usa o zoom do CSS, lembra a escolha e ignora valor estranho", async () => {
  expect(storedZoom()).toBe("1");
  await applyZoom("1.3", true);
  expect(document.documentElement.style.zoom).toBe("1.3");
  expect(storedZoom()).toBe("1.3");
  localStorage.setItem("upvision:zoom", "9");
  expect(storedZoom()).toBe("1");
  await applyZoom("1");
  expect(document.documentElement.style.zoom).toBe("");
});
