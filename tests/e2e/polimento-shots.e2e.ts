import { SEED_BASE, SEED_ORDERS } from "../visual/seed";
import { expect, go, openApp, test } from "./tauri";

// Passada de polimento: todas as telas, claro/escuro, 1100/1440 px. POLISH=antes|depois → docs/design/polimento/<fase>/
// POLISH_EMPTY=1 fotografa com o banco vazio (estados vazios).
const PHASE = process.env.POLISH;
const EMPTY = !!process.env.POLISH_EMPTY;
test.skip(!PHASE, "só roda com POLISH=antes|depois");

const PAGES = ["Início", "Criar", "Imagem em desenho (SVG)", "Cortador de biscoito", "Chaveiros", "Medalhas", "Desenho em 3D", "QR Code e Pix", "Modelos prontos", "Etiquetas de rolo", "Litofania e quadro", "Pixel art", "Organizador de gaveta", "Separar cores de um 3MF", "Modelo personalizável (OpenSCAD)", "Buscar modelos na internet", "Pedir à IA", "Painel", "Pedidos", "Orçamentos", "Financeiro", "Custos operacionais", "Calculadora", "Clientes", "Produtos", "Filamentos", "Materiais extras", "Impressoras", "Dados da empresa", "Preferências"];
const slug = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

for (const width of EMPTY ? [1440] : [1100, 1440])
  for (const scheme of EMPTY ? (["light"] as const) : (["light", "dark"] as const))
    test(`${EMPTY ? "vazio " : ""}${width} ${scheme}`, async ({ page, tauri }) => {
      test.setTimeout(600_000);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 860 });
      await openApp(page);
      await go(page, "Estoque"); // cria o banco
      if (!EMPTY) tauri.db.exec(SEED_BASE + SEED_ORDERS);
      const start = page.getByRole("button", { name: "Fechar Comece por aqui" });
      for (const label of PAGES) {
        await go(page, label);
        await expect(page.locator("main h1").first()).toBeVisible();
        if (label === "Início" && (await start.count())) await start.click();
        await page.mouse.move(width - 5, 855);
        await page.waitForTimeout(/Chaveiros|Medalhas|Modelos|QR|Gaveta|gaveta/.test(label) ? 2500 : 700);
        await page.screenshot({ path: `docs/design/polimento/${PHASE}/${EMPTY ? "vazio-" : ""}${slug(label)}-${width}-${scheme}.jpg`, type: "jpeg", quality: 78 });
      }
    });
