import { describe, expect, test } from "vitest";
import { feedbackUrl, MAX_DESCRIPTION } from "./feedback";

const base = { title: "Gerador de etiqueta", description: "Queria etiqueta com QR & preço", imageName: null, appVersion: "0.2.0", platform: "macOS" };

describe("feedbackUrl", () => {
  test("com e-mail configurado: mailto com assunto e corpo codificados", () => {
    const u = feedbackUrl(base, "time@exemplo.com");
    expect(u.startsWith("mailto:time@exemplo.com?subject=")).toBe(true);
    const params = new URLSearchParams(u.split("?")[1].replace(/\+/g, "%2B"));
    expect(params.get("subject")).toBe("[UpVision Maker] Sugestão: Gerador de etiqueta");
    expect(params.get("body")).toContain("QR & preço");
    expect(params.get("body")).toContain("Versão: 0.2.0 (macOS)");
  });

  test("sem e-mail: abre issue pré-preenchida no GitHub", () => {
    const u = new URL(feedbackUrl(base, undefined));
    expect(u.origin + u.pathname).toBe("https://github.com/GabrielMelloMol/upvision-maker/issues/new");
    expect(u.searchParams.get("title")).toBe("Sugestão: Gerador de etiqueta");
    expect(u.searchParams.get("labels")).toBe("sugestão");
  });

  test("imagem escolhida vira lembrete para anexar (mailto não anexa arquivos)", () => {
    const u = feedbackUrl({ ...base, imageName: "ideia.png" }, "a@b.co");
    expect(decodeURIComponent(u)).toContain("Anexe a imagem ideia.png");
  });

  test("descrição longa é cortada para caber no link", () => {
    const u = feedbackUrl({ ...base, description: "x".repeat(MAX_DESCRIPTION + 500) }, "a@b.co");
    expect(decodeURIComponent(u).match(/x/g)!.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
  });

  test("e-mail inválido no build cai para o GitHub", () => {
    expect(feedbackUrl(base, "não-é-email")).toContain("github.com");
  });
});
