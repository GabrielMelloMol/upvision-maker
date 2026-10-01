import { expect, test } from "vitest";
import { cropRect, outputSize, type PhotoEdit } from "./photoEdit";

const base: PhotoEdit = { rotate: 0, aspect: "free", zoom: 1, brightness: 0 };

test("sem corte: a foto inteira; girar 90° troca largura e altura (#162)", () => {
  expect(cropRect(4000, 3000, base)).toEqual({ x: 0, y: 0, w: 4000, h: 3000 });
  expect(cropRect(4000, 3000, { ...base, rotate: 90 })).toEqual({ x: 0, y: 0, w: 3000, h: 4000 });
});

test("quadrado e 4:3 centralizados; zoom aperta no centro", () => {
  expect(cropRect(4000, 3000, { ...base, aspect: "1:1" })).toEqual({ x: 500, y: 0, w: 3000, h: 3000 });
  expect(cropRect(3000, 4000, { ...base, aspect: "4:3" })).toEqual({ x: 0, y: 875, w: 3000, h: 2250 });
  expect(cropRect(4000, 3000, { ...base, aspect: "1:1", zoom: 2 })).toEqual({ x: 1250, y: 750, w: 1500, h: 1500 });
});

test("saída até 1024 px no lado maior, sem aumentar foto pequena", () => {
  expect(outputSize({ w: 4000, h: 3000 })).toEqual({ w: 1024, h: 768 });
  expect(outputSize({ w: 600, h: 400 })).toEqual({ w: 600, h: 400 });
});
