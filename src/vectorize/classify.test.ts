import { expect, test } from "vitest";
import { classifyImage } from "./classify";
import { loadFixture } from "./testFixtures";

test("reconhece foto de pessoa", () => {
  const f = loadFixture("foto-pessoa.jpg");
  expect(classifyImage(f.rgba, f.w, f.h).isPhoto).toBe(true);
});

test.each(["logo.jpg", "desenho.jpg"])("não confunde %s (JPEG com artefatos) com foto", (name) => {
  const f = loadFixture(name);
  expect(classifyImage(f.rgba, f.w, f.h).isPhoto).toBe(false);
});
