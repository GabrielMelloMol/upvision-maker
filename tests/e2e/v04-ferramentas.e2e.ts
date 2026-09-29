import type { Page } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { expect, go, openApp, test, toastWith, type TauriMock } from "./tauri";

/** Acha o modelo pela busca (a galeria mostra uma categoria por vez). */
async function pickModel(page: Page, name: string) {
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(name);
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name, exact: true }).click();
}


const FIX = "tests/fixtures";
const RED = "#d6262e"; // hex de "Vermelho" em FILAMENT_COLORS
const BLUE = "#2563eb"; // "Azul"
const BLACK = "#1c1c1e"; // "Preto"
const WHITE = "#f8f8f6"; // "Branco"
const GREEN = "#22a04b"; // "Verde" (fora das cores padrão das ferramentas)

// dois quadrados de cores diferentes, lado a lado
const TWO_COLOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" viewBox="0 0 40 20"><path fill="${RED}" d="M0 0 H18 V20 H0 Z"/><path fill="${GREEN}" d="M22 0 H40 V20 H22 Z"/></svg>`;
const svgFile = { name: "duas-cores.svg", mimeType: "image/svg+xml", buffer: Buffer.from(TWO_COLOR_SVG) };

const fileEnding = (tauri: TauriMock, end: string) => [...tauri.files].find(([p]) => p.endsWith(end))?.[1];
const fills = (svg: string) => [...svg.matchAll(/<path fill="([^"]+)"/g)].map((m) => m[1]);
/** Extrusoras distintas das partes no model_settings.config do 3MF. */
const extruders = (threemf: Buffer) => {
  const cfg = strFromU8(unzipSync(new Uint8Array(threemf))["Metadata/model_settings.config"]);
  return new Set([...cfg.matchAll(/<part [^>]*>.*?key="extruder" value="(\d+)"/g)].map((m) => m[1]));
};

async function seedFilaments(page: Page, tauri: TauriMock) {
  await go(page, "Impressoras"); // cria o banco
  const ins = tauri.db.prepare("INSERT INTO filaments (material, color, brand, pricePerKg) VALUES (?, ?, ?, 120)");
  for (const [color, brand] of [["Vermelho", "Voolt"], ["Azul", "Voolt"], ["Preto", ""], ["Branco", ""]]) ins.run("PLA", color, brand);
}

async function waitModel(page: Page) {
  await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
}

async function save3mf(page: Page, tauri: TauriMock) {
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  return fileEnding(tauri, ".3mf")!;
}

test("Imagem→SVG colorido: paleta dos filamentos, troca de cor e SVG salvo com as cores escolhidas", async ({ page, tauri }) => {
  await openApp(page);
  await seedFilaments(page, tauri);
  await go(page, "Imagem → SVG");
  await page.locator('input[type="file"]').setInputFiles(`${FIX}/logo.jpg`);
  await expect(page.getByRole("img", { name: "Imagem original" })).toBeVisible();

  await page.getByRole("group", { name: "Cores" }).getByRole("button", { name: "3", exact: true }).click();
  const useFil = page.getByLabel("Usar as cores dos filamentos cadastrados");
  await expect(useFil).toBeChecked();
  await page.getByRole("button", { name: /^Aplicar/ }).click();
  await expect(page.getByText("Resultado atualizado.")).toBeVisible({ timeout: 60_000 });

  const selects = page.getByRole("combobox", { name: /^Filamento da cor \d$/ });
  const n = await selects.count();
  expect(n).toBeGreaterThanOrEqual(2);
  expect(n).toBeLessThanOrEqual(3);
  const palette = [RED, BLUE, BLACK, WHITE];
  // cada cor já é um filamento cadastrado, com o nome dele no select
  for (let i = 0; i < n; i++) expect(palette).toContain(await selects.nth(i).inputValue());
  await expect(selects.first().locator("option", { hasText: "PLA Vermelho (Voolt)" })).toHaveCount(1);

  // troca a cor 1 por um filamento que ainda não está em uso
  const used = await Promise.all([...Array(n).keys()].map((i) => selects.nth(i).inputValue()));
  const free = palette.find((c) => !used.includes(c))!;
  await selects.first().selectOption(free);
  await expect(selects.first()).toHaveValue(free);

  await page.getByRole("button", { name: "Salvar SVG" }).click();
  await expect(toastWith(page, "SVG salvo em")).toBeVisible();
  const svg = fileEnding(tauri, "logo.svg")!.toString();
  expect(svg).toMatch(/<svg[^>]*width="[\d.]+mm"/);
  expect(fills(svg)).toEqual([free, ...used.slice(1)]);

  // o SVG colorido vai para Medalhas e a dica de imagem colorida aparece
  await page.getByRole("button", { name: "Fazer medalha" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Medalhas" })).toBeVisible();
  await expect(page.getByText("A imagem é colorida: cada cor dela sai com o próprio filamento.")).toBeVisible();
  await expect(page.getByLabel("Imagem", { exact: true })).toHaveCount(0); // sem seletor de cor única
});

test("Imagem→SVG colorido sem a paleta dos filamentos usa as cores da imagem", async ({ page, tauri }) => {
  await openApp(page);
  await seedFilaments(page, tauri);
  await go(page, "Imagem → SVG");
  await page.locator('input[type="file"]').setInputFiles(`${FIX}/desenho.jpg`);
  await expect(page.getByRole("img", { name: "Imagem original" })).toBeVisible();
  await page.getByRole("group", { name: "Cores" }).getByRole("button", { name: "2", exact: true }).click();
  await page.getByLabel("Usar as cores dos filamentos cadastrados").uncheck();
  await page.getByRole("button", { name: /^Aplicar/ }).click();
  await expect(page.getByText("Resultado atualizado.")).toBeVisible({ timeout: 60_000 });

  const selects = page.getByRole("combobox", { name: /^Filamento da cor \d$/ });
  await expect(selects).toHaveCount(2);
  const colors = [await selects.nth(0).inputValue(), await selects.nth(1).inputValue()];
  for (const c of colors) {
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
    await expect(page.locator("option:checked", { hasText: `${c} (da imagem)` })).toHaveCount(1);
  }
  await page.getByRole("button", { name: "Salvar SVG" }).click();
  await expect(toastWith(page, "SVG salvo em")).toBeVisible();
  expect(fills(fileEnding(tauri, "desenho.svg")!.toString())).toEqual(colors);
});

test("Sem filamentos com cor, a opção de paleta fica desativada com dica", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Imagem → SVG");
  await page.locator('input[type="file"]').setInputFiles(`${FIX}/logo.jpg`);
  await page.getByRole("group", { name: "Cores" }).getByRole("button", { name: "2", exact: true }).click();
  await expect(page.getByLabel("Usar as cores dos filamentos cadastrados")).toBeDisabled();
  await expect(page.getByText("Cadastre filamentos com cor em Filamentos para usar a paleta deles.")).toBeVisible();
});

test("Extrusão: SVG de 2 cores mostra a dica e sai com uma extrusora por cor", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Extrusão 3D");
  await page.locator('input[type="file"]').setInputFiles(svgFile);
  await expect(page.getByText("Desenho com 2 cores: cada uma sai como uma parte com o próprio filamento no 3MF.")).toBeVisible();
  await expect(page.getByLabel("Cor", { exact: true })).toHaveCount(0); // cores vêm do desenho
  await waitModel(page);
  expect(extruders(await save3mf(page, tauri)).size).toBe(2);
});

test("Medalhas: imagem de 2 cores mostra a dica e o 3MF ganha as cores da imagem", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Medalhas");
  await waitModel(page);
  await page.locator('input[type="file"]').setInputFiles(svgFile);
  await expect(page.getByText("A imagem é colorida: cada cor dela sai com o próprio filamento.")).toBeVisible();
  await waitModel(page);
  // base + borda + textos + 2 cores da imagem (#19 separou borda e textos)
  expect(extruders(await save3mf(page, tauri)).size).toBe(5);
});

test("Chaveiros: logo de 2 cores sai com uma extrusora por cor", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Chaveiros");
  await page.locator('input[type="file"]').setInputFiles(svgFile);
  await expect(page.getByText("duas-cores.svg")).toBeVisible();
  await waitModel(page);
  // base + texto + 2 cores do logo
  expect(extruders(await save3mf(page, tauri)).size).toBe(4);
});

test("Chaveiro NFC: Projeto do Bambu Studio manda o 3MF com a pausa e grava as cores das partes", async ({ page, tauri }) => {
  // O comando Rust `bambu_project` roda o CLI do Bambu Studio; aqui ele devolve um projeto mínimo.
  const fakeProject = Array.from(zipSync({ "Metadata/project_settings.config": strToU8(JSON.stringify({ filament_colour: ["#000000"], layer_height: "0.2" })) }));
  await page.addInitScript((project: number[]) => {
    const w = window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: unknown, o?: unknown) => Promise<unknown> }; __bambuArgs?: unknown };
    const real = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (cmd, args, opts) => {
      if (cmd !== "bambu_project") return real(cmd, args, opts);
      w.__bambuArgs = args;
      return project;
    };
  }, fakeProject);
  await openApp(page);
  await go(page, "Modelos prontos");
  await pickModel(page, "Chaveiro NFC");
  await expect(page.getByText(/Pausa em Z = 2,00 mm/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /Salvar 3MF \(Orca \/ Prusa\)/ })).toBeVisible();

  await page.getByRole("button", { name: "Projeto do Bambu Studio (pausa pronta)" }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();

  const args = (await page.evaluate(() => (window as unknown as { __bambuArgs: unknown }).__bambuArgs)) as { model: number[]; pauses: number[]; filaments: number };
  expect(args.pauses).toEqual([2]);
  expect(args.filaments).toBe(2);
  const sent = unzipSync(Uint8Array.from(args.model));
  expect(strFromU8(sent["Metadata/custom_gcode_per_layer.xml"])).toMatch(/<layer top_z="2" type="1"[^>]*gcode="M400 U1"/);

  const [path, project] = [...tauri.files].find(([p]) => p.endsWith("-bambu.3mf"))!;
  expect(path).toMatch(/chaveiro-nfc-ana-bambu\.3mf$/);
  const cfg = JSON.parse(strFromU8(unzipSync(new Uint8Array(project))["Metadata/project_settings.config"]));
  expect(cfg.filament_colour).toEqual(["#FFFFFF", "#2563EB"]); // base e texto do DEFAULT_NFC
  expect(cfg.layer_height).toBe("0.2"); // resto do projeto intacto
});

test("Modelos sem pausa não mostram o botão do Bambu Studio", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Modelos prontos");
  await pickModel(page, "Topo de bolo");
  await waitModel(page);
  await expect(page.getByRole("button", { name: /Salvar 3MF \(Bambu \/ Orca \/ Prusa\)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Projeto do Bambu Studio (pausa pronta)" })).toHaveCount(0);
});

const NEW_MODELS = ["Chaveiro de logo", "Placa adaptável", "Topo de lápis", "Placa de sinalização", "Decoração de palavras", "Ejetor de brigadeiro", "Clipe de saco", "Cortador + carimbo"];

test("Modelos prontos (#9): cada modelo novo gera prévia 3D sem erro", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Modelos prontos");
  const gallery = page.getByRole("group", { name: "Modelo" });
  // os modelos com desenho pedem um antes de gerar; o desenho enviado vale para todos eles
  await pickModel(page, NEW_MODELS[0]);
  await expect(page.getByText("Envie um desenho (SVG ou imagem) para ver o modelo.")).toBeVisible({ timeout: 60_000 });
  await page.locator('input[type="file"]').setInputFiles(svgFile);
  for (const name of NEW_MODELS) {
    await pickModel(page, name);
    await expect(gallery.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    await waitModel(page);
    await expect(page.locator(".viewer .overlay")).toHaveCount(0);
  }
});

test("Chaveiro de logo: logo de 2 cores vira uma parte por cor no 3MF", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await pickModel(page, "Chaveiro de logo");
  await page.locator('input[type="file"]').setInputFiles(svgFile);
  await expect(page.getByText("duas-cores.svg")).toBeVisible();
  await waitModel(page);
  // base + 2 cores do logo
  expect(extruders(await save3mf(page, tauri)).size).toBe(3);
});
