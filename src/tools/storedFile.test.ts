// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { restoreBytes, restoreFile, storeBytes, storeFile, STORED_FILE_MAX } from "./storedFile";

test("arquivo pequeno vai inteiro no rascunho e volta igual; grande fica só com o nome (#85)", async () => {
  const small = new File(["olá mundo"], "foto.jpg", { type: "image/jpeg" });
  const s = await storeFile(small);
  expect(s).toMatchObject({ name: "foto.jpg", type: "image/jpeg" });
  const back = (await restoreFile(s))!;
  expect(back.name).toBe("foto.jpg");
  expect(await back.text()).toBe("olá mundo");

  const big = new File([new Uint8Array(STORED_FILE_MAX + 1)], "grande.jpg", { type: "image/jpeg" });
  expect(await storeFile(big)).toEqual({ name: "grande.jpg", type: "image/jpeg" });
  expect(await restoreFile({ name: "grande.jpg", type: "image/jpeg" })).toBeNull();
  expect(await storeFile(null)).toBeNull();
});

test("bytes do 3MF: base64 de ida e volta; grandes não entram", () => {
  const b = new Uint8Array([0, 1, 2, 250, 255, 128]);
  expect(restoreBytes(storeBytes(b))).toEqual(b);
  expect(storeBytes(new Uint8Array(STORED_FILE_MAX + 1))).toBeNull();
  expect(restoreBytes(null)).toBeNull();
});
