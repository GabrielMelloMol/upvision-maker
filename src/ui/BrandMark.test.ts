import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("ícone do Windows (#138): .ico com 16, 24, 32, 48, 64 e 256 px em PNG", () => {
  const ico = readFileSync("src-tauri/icons/icon.ico");
  const count = ico.readUInt16LE(4);
  const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + 16 * i) || 256).sort((a, b) => a - b);
  expect(sizes).toEqual([16, 24, 32, 48, 64, 256]);
});

test("símbolo da marca: pórtico segue --brand-ink, cores da marca e sem fundo", () => {
  for (const f of ["simbolo", "simbolo-animado"]) {
    const svg = readFileSync(`src/assets/brand/${f}.svg`, "utf8");
    expect(svg).toContain("var(--brand-ink");
    expect(svg).toContain("#0244e6"); // Azul UpVision
    expect(svg).toContain("#f85a00"); // Laranja Filamento
    expect(svg).not.toMatch(/#fff\b|#ffffff/i);
  }
});

test("logo horizontal: versão para fundo claro e para fundo escuro, em vetor", () => {
  for (const f of ["logo-horizontal-cor", "logo-horizontal-escuro"]) expect(readFileSync(`src/assets/brand/${f}.svg`, "utf8")).toMatch(/viewBox="0 0 724 222"/);
});

test("ícone do macOS 26: azul do site, pilha e filamento, com aparência escura (azul-noite) e sem a moldura/placa branca", () => {
  const icon = JSON.parse(readFileSync("src-tauri/icons/AppIcon.icon/icon.json", "utf8"));
  expect(icon.groups.map((g: { name: string }) => g.name).sort()).toEqual(["Filamento", "Pilha"]);
  const dark = icon["fill-specializations"].find((f: { appearance?: string }) => f.appearance === "dark");
  expect(dark.value["automatic-gradient"]).toBe("srgb:0.04314,0.12157,0.40000,1.00000"); // #0B1F66
  expect(icon["fill-specializations"][0].value["automatic-gradient"]).toBe("srgb:0.00784,0.26667,0.90196,1.00000"); // #0244E6
});
