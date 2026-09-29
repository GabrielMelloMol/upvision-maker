import { expect, test } from "vitest";
import { instagramPayload, reviewPayload, whatsappPayload } from "./qrPayloads";

test("WhatsApp: põe o 55, aceita máscara e recusa número curto", () => {
  expect(whatsappPayload("(21) 99999-0000")).toBe("https://wa.me/5521999990000");
  expect(whatsappPayload("+55 21 3333-4444")).toBe("https://wa.me/552133334444");
  expect(() => whatsappPayload("9999")).toThrow(/DDD/);
});

test("Instagram: @, perfil puro ou link viram o link do perfil", () => {
  expect(instagramPayload("@minha.loja")).toBe("https://instagram.com/minha.loja");
  expect(instagramPayload("https://www.instagram.com/minha_loja/?hl=pt")).toBe("https://instagram.com/minha_loja");
  expect(() => instagramPayload("com espaço")).toThrow(/@ do Instagram/);
});

test("avaliação: precisa ser um link", () => {
  expect(reviewPayload("g.page/r/abc/review")).toBe("https://g.page/r/abc/review");
  expect(() => reviewPayload("sem link")).toThrow();
});
