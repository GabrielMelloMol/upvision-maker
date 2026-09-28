import jsQR from "jsqr";
import { describe, expect, test } from "vitest";
import { pixPayload } from "./pix";
import { linkPayload, qrMatrix, qrSvg, wifiPayload } from "./qr";

/** Renderiza a matriz em RGBA (com quiet zone) e decodifica com jsQR: prova que o QR é legível. */
function decode(m: boolean[][], scale = 4, quiet = 4) {
  const n = (m.length + quiet * 2) * scale;
  const px = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 0; y < m.length; y++)
    for (let x = 0; x < m.length; x++)
      if (m[y][x])
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const i = (((y + quiet) * scale + dy) * n + (x + quiet) * scale + dx) * 4;
            px[i] = px[i + 1] = px[i + 2] = 0;
          }
  return jsQR(px, n, n)?.data;
}

describe("qrMatrix", () => {
  test("gera matriz quadrada sem quiet zone, com os padrões de posição nos cantos", () => {
    const m = qrMatrix("https://upvision.com.br");
    expect(m.length).toBe(m[0].length);
    expect(m.length % 4).toBe(1); // 21, 25, 29…
    expect(m[0].slice(0, 7).every(Boolean)).toBe(true); // borda do finder superior esquerdo
  });

  test("texto com acento e Pix decodificam de volta ao original", () => {
    for (const text of ["Olá, maker! Pão de mel ♥", pixPayload({ key: "fulano@exemplo.com", name: "Ana", city: "Rio", amount: 25 })]) {
      expect(decode(qrMatrix(text))).toBe(text);
    }
  });

  test("correção de erro maior gera QR maior ou igual", () => {
    expect(qrMatrix("abc", "H").length).toBeGreaterThanOrEqual(qrMatrix("abc", "L").length);
  });
});

describe("qrSvg", () => {
  test("SVG em mm com quiet zone de 4 módulos e caminho só dos módulos escuros", () => {
    const m = qrMatrix("teste");
    const svg = qrSvg("teste", 30);
    expect(svg).toMatch(/^<svg[^>]*width="30mm" height="30mm"[^>]*viewBox="0 0 (\d+) \1"/);
    expect(svg).toContain(`viewBox="0 0 ${m.length + 8} ${m.length + 8}"`);
    const dark = m.flat().filter(Boolean).length;
    expect((svg.match(/h1v1h-1z/g) ?? []).length).toBe(dark);
  });
});

describe("wifiPayload", () => {
  test("formato WIFI: padrão, com escape de ; , : \\ \"", () => {
    expect(wifiPayload({ ssid: "Casa da Ana", password: "senha;123", security: "WPA" })).toBe("WIFI:T:WPA;S:Casa da Ana;P:senha\\;123;;");
    expect(wifiPayload({ ssid: 'a"b:c', password: "", security: "nopass" })).toBe('WIFI:T:nopass;S:a\\"b\\:c;;');
    expect(wifiPayload({ ssid: "X", password: "p", security: "WPA", hidden: true })).toBe("WIFI:T:WPA;S:X;P:p;H:true;;");
    expect(wifiPayload({ ssid: "a\\b", password: "c,d", security: "WPA" })).toBe("WIFI:T:WPA;S:a\\\\b;P:c\\,d;;");
  });
  test("rede sem nome ou com senha faltando é recusada", () => {
    expect(() => wifiPayload({ ssid: " ", password: "x", security: "WPA" })).toThrow("nome da rede");
    expect(() => wifiPayload({ ssid: "X", password: "", security: "WPA" })).toThrow("senha");
  });
  test("QR do Wi-Fi decodifica", () => {
    const t = wifiPayload({ ssid: "Ateliê", password: "abc12345", security: "WPA" });
    expect(decode(qrMatrix(t))).toBe(t);
  });
});

describe("linkPayload", () => {
  test("completa https:// e valida", () => {
    expect(linkPayload("instagram.com/upvision")).toBe("https://instagram.com/upvision");
    expect(linkPayload(" https://x.com ")).toBe("https://x.com");
    expect(() => linkPayload("não é link")).toThrow("link");
  });
});
