import { expect, test } from "vitest";
import { parseFilamentQr, filamentQr } from "./spoolQr";

test("ida e volta do QR do rolo; lixo, outro QR ou id inválido dão null", () => {
  expect(filamentQr(12)).toBe("upvision:filamento/12");
  expect(parseFilamentQr(" UPVISION:filamento/12\n")).toBe(12);
  expect(parseFilamentQr("https://exemplo.com")).toBeNull();
  expect(parseFilamentQr("upvision:filamento/")).toBeNull();
  expect(parseFilamentQr("upvision:filamento/1x")).toBeNull();
});
