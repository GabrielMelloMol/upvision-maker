import { describe, expect, test } from "vitest";
import { parseTlv } from "../domain/pix";
import { EMPTY_QR_FORM, qrContent } from "./qrContent";

describe("qrContent", () => {
  test("Pix com valor em R$ digitado do jeito brasileiro", () => {
    const r = qrContent("pix", { ...EMPTY_QR_FORM, pix: { key: "fulano@exemplo.com", name: "Ana", city: "Rio", amount: "R$ 1.234,50", txid: "" } });
    expect(r.error).toBeNull();
    expect(parseTlv(r.text!)["54"]).toBe("1234.50");
  });
  test("Pix sem valor: quem paga digita", () => {
    const r = qrContent("pix", { ...EMPTY_QR_FORM, pix: { key: "fulano@exemplo.com", name: "Ana", city: "Rio", amount: "", txid: "" } });
    expect(parseTlv(r.text!)["54"]).toBeUndefined();
  });
  test("erros viram mensagem, não exceção", () => {
    expect(qrContent("pix", EMPTY_QR_FORM).error).toMatch(/chave Pix/);
    expect(qrContent("pix", { ...EMPTY_QR_FORM, pix: { key: "fulano@exemplo.com", name: "A", city: "R", amount: "abc", txid: "" } }).error).toMatch(/Valor/);
    expect(qrContent("link", { ...EMPTY_QR_FORM, link: "oi tudo" }).error).toMatch(/link/);
    expect(qrContent("text", EMPTY_QR_FORM).error).toMatch(/texto/);
  });
  test("link, Wi-Fi e texto", () => {
    expect(qrContent("link", { ...EMPTY_QR_FORM, link: "upvision.com.br" }).text).toBe("https://upvision.com.br");
    expect(qrContent("wifi", { ...EMPTY_QR_FORM, wifi: { ssid: "X", password: "12345678", security: "WPA" } }).text).toBe("WIFI:T:WPA;S:X;P:12345678;;");
    expect(qrContent("text", { ...EMPTY_QR_FORM, text: "Obrigada!" }).text).toBe("Obrigada!");
  });
});
