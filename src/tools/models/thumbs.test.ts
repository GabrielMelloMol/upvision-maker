import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { MODELS } from "./defs";

const DIR = join(__dirname, "../../assets/model-thumbs");

test("todo Modelo pronto tem miniatura e não sobra miniatura de modelo que não existe mais (#149)", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".webp")).map((f) => f.replace(/\.webp$/, ""));
  const ids = MODELS.map((m) => m.id);
  const missing = ids.filter((id) => !files.includes(id));
  expect(missing, `sem miniatura (rode npm run thumbs): ${missing.join(", ")}`).toEqual([]);
  expect(files.filter((f) => !ids.includes(f))).toEqual([]);
  expect(readdirSync(DIR).filter((f) => !f.endsWith(".webp"))).toEqual([]); // nada de JPG antigo
});

test("foto de cartão de ferramenta só para cartão que existe, e ela vence o desenho (#270)", async () => {
  const { PRODUCT_THUMBS } = await import("./thumbs");
  const names = (dir: string) => readdirSync(join(__dirname, "../../assets", dir)).map((f) => f.replace(/\.\w+$/, ""));
  const photos = names("product-photos");
  const ids = names("product-thumbs"); // um desenho por cartão de ferramenta
  expect(photos.filter((id) => !ids.includes(id))).toEqual([]);
  for (const id of photos) expect(PRODUCT_THUMBS[id]).toContain("product-photos");
});
