import { expect, test } from "vitest";
import { photoFiles } from "./listingPhotos";

test("fotos para o marketplace: SKU (ou nome) no arquivo, numeradas, extensão pelo formato (#162)", () => {
  const files = photoFiles([
    { product: { sku: "CH-1", name: "Chaveiro" }, dataUrls: ["data:image/jpeg;base64,/9j/", "data:image/png;base64,iVBO"] },
    { product: { sku: "", name: "Vaso Azul" }, dataUrls: ["data:image/jpeg;base64,/9j/"] },
    { product: { sku: "X", name: "Sem foto" }, dataUrls: [] },
  ]);
  expect(files.map((f) => f.name)).toEqual(["ch-1-1.jpg", "ch-1-2.png", "vaso-azul-1.jpg"]);
  expect([...files[0].bytes.slice(0, 2)]).toEqual([0xff, 0xd8]); // JPEG de verdade, não o texto base64
});
