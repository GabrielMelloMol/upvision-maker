// @vitest-environment happy-dom
import { beforeEach, expect, test } from "vitest";
import { pickSplash, saveSplashMode, storedSplashMode } from "./splashMode";

beforeEach(() => localStorage.clear());

test("abertura (#153): completa por padrão, toda vez; a escolha em Ajustes fica lembrada", () => {
  expect(storedSplashMode()).toBe("full");
  saveSplashMode("off");
  expect(storedSplashMode()).toBe("off");
  localStorage.setItem("upvision:splash-mode", "auto"); // valor antigo/desconhecido: volta ao padrão
  expect(storedSplashMode()).toBe("full");
});

test("abertura (#153): Reduzir movimento troca a completa pela curta; curta e desligada ficam", () => {
  expect(pickSplash("full", false)).toBe("full");
  expect(pickSplash("full", true)).toBe("short");
  expect(pickSplash("short", true)).toBe("short");
  expect(pickSplash("off", false)).toBe("off");
});
