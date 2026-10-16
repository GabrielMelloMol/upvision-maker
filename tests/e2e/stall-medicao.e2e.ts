import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

/**
 * Medição de travadas (#248): para cada ferramenta que processa o arquivo do cliente, o pior engasgo da tela (a tarefa mais
 * longa da thread principal e o maior intervalo entre dois quadros) em cada etapa: carregar o arquivo, escolher o ponto/ajustar.
 * Só roda com STALL_OUT=<arquivo.jsonl> (cada execução acrescenta uma linha). STALL_TOOL e STALL_MODEL escolhem o caso;
 * STALL_HEAVY=<caminho do 3MF/STL pesado> aponta o modelo pesado (ex.: o presépio de 1,2 milhão de triângulos).
 */
const OUT = process.env.STALL_OUT ?? "";
const TOOL = process.env.STALL_TOOL ?? "";
const MODEL = (process.env.STALL_MODEL ?? "medio") as "medio" | "pesado";
const HEAVY = process.env.STALL_HEAVY ?? "";
const SETTLE_MS = 1500;
const LIMIT_MS = Number(process.env.STALL_LIMIT_MIN ?? 12) * 60_000;

/** Vaso de barriga larga e nervuras, ~70 mil triângulos: o "modelo médio". */
function vaseStl(): Buffer {
  const rings = 140, seg = 160;
  const R = (z: number) => 14 + 24 * Math.sin((Math.PI * Math.min(z, 100)) / 100) ** 1.2 + 1.3 * Math.sin(z * 0.9);
  const tris: number[][][] = [];
  const pt = (i: number, j: number) => { const z = (110 * j) / rings, a = (2 * Math.PI * (i % seg)) / seg; return [R(z) * Math.cos(a), R(z) * Math.sin(a), z]; };
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const [a, b, c, d] = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)]; tris.push([a, b, c], [a, c, d]); }
  for (let i = 0; i < seg; i++) { tris.push([[0, 0, 0], pt(i + 1, 0), pt(i, 0)]); tris.push([[0, 0, 110], pt(i, rings), pt(i + 1, rings)]); }
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, n) => { let o = 84 + n * 50 + 12; for (const p of t) for (const v of p) { buf.writeFloatLE(v, o); o += 4; } });
  return buf;
}

/** O mesmo vaso como 3MF que pinta por material (faixas de cor): o "modelo médio" das ferramentas que só abrem 3MF. */
function vase3mf(): Buffer {
  const rings = 140, seg = 160;
  const R = (z: number) => 14 + 24 * Math.sin((Math.PI * Math.min(z, 100)) / 100) ** 1.2 + 1.3 * Math.sin(z * 0.9);
  const v: string[] = [], t: string[] = [];
  for (let j = 0; j <= rings; j++) for (let i = 0; i < seg; i++) { const z = (110 * j) / rings, a = (2 * Math.PI * i) / seg; v.push(`<vertex x="${(R(z) * Math.cos(a)).toFixed(3)}" y="${(R(z) * Math.sin(a)).toFixed(3)}" z="${z.toFixed(3)}"/>`); }
  const at = (i: number, j: number) => j * seg + (i % seg);
  const col = (j: number) => (j > rings * 0.7 ? 1 : j > rings * 0.25 && j < rings * 0.35 ? 2 : 0);
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]; t.push(`<triangle v1="${a}" v2="${b}" v3="${c}" pid="2" p1="${col(j)}"/>`, `<triangle v1="${a}" v2="${c}" v3="${d}" pid="2" p1="${col(j)}"/>`); }
  v.push('<vertex x="0" y="0" z="0"/>', '<vertex x="0" y="0" z="110"/>');
  const [lo, hi] = [rings * 0 + (rings + 1) * seg, (rings + 1) * seg + 1];
  for (let i = 0; i < seg; i++) { t.push(`<triangle v1="${lo}" v2="${at(i + 1, 0)}" v3="${at(i, 0)}" pid="2" p1="0"/>`, `<triangle v1="${hi}" v2="${at(i, rings)}" v3="${at(i + 1, rings)}" pid="2" p1="1"/>`); }
  const model = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"><resources><m:colorgroup id="2"><m:color color="#E8E4DAFF"/><m:color color="#C0392BFF"/><m:color color="#2563EBFF"/></m:colorgroup><object id="1" type="model" name="Vaso"><mesh><vertices>${v.join("")}</vertices><triangles>${t.join("")}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  return Buffer.from(zipSync({ "3D/3dmodel.model": strToU8(model) }));
}

const file = () => (MODEL === "pesado" ? { name: "pesado.3mf", mimeType: "model/3mf", buffer: readFileSync(HEAVY) } : TOOL === "separar-cores" ? { name: "medio.3mf", mimeType: "model/3mf", buffer: vase3mf() } : { name: "medio.stl", mimeType: "model/stl", buffer: vaseStl() });

async function install(page: Page) {
  await page.addInitScript(() => {
    const st = { phase: "inicio", worst: {} as Record<string, { tarefa: number; quadro: number }> };
    (window as unknown as { __st: typeof st }).__st = st;
    const rec = (kind: "tarefa" | "quadro", ms: number) => {
      const w = (st.worst[st.phase] ??= { tarefa: 0, quadro: 0 });
      w[kind] = Math.max(w[kind], ms);
    };
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => rec("tarefa", e.duration))).observe({ entryTypes: ["longtask"] });
    } catch { /* sem longtask */ }
    let last = performance.now();
    const tick = (t: number) => { rec("quadro", t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
const phase = (page: Page, p: string) => page.evaluate((x) => { (window as unknown as { __st: { phase: string } }).__st.phase = x; }, p);

/** Espera a ferramenta ficar quieta: sem véu de carregamento, sem barra de progresso e sem texto de leitura por SETTLE_MS. */
async function settle(page: Page) {
  const start = Date.now();
  let quietSince = 0;
  while (Date.now() - start < LIMIT_MS) {
    const busy = (await page.locator(".viewer .overlay.busy, .viewer .busy-chip, progress, [role=status]:has-text('Lendo')").count()) > 0;
    if (busy) quietSince = 0;
    else if (!quietSince) quietSince = Date.now();
    else if (Date.now() - quietSince >= SETTLE_MS) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

type Scenario = { page: string; run: (p: Page, phase: (n: string) => Promise<void>) => Promise<void> };
const upload = async (p: Page) => p.locator('input[type="file"]').first().setInputFiles(file());

const SCENARIOS: Record<string, Scenario> = {
  "nome-ou-logo": {
    page: "Nome ou logo na peça",
    run: async (p, ph) => {
      await ph("carregar"); await upload(p); await settle(p);
      await ph("ponto");
      const limpar = p.getByRole("button", { name: "Limpar ponto" });
      const face = p.getByRole("button", { name: /^Face/, pressed: true });
      for (let y = 380; y <= 760 && !(await limpar.count()) && !(await face.count()); y += 40)
        for (let x = 200; x <= 560 && !(await limpar.count()) && !(await face.count()); x += 40) await p.locator(".viewer").click({ position: { x, y } });
      await settle(p);
      await ph("desenho"); await p.getByRole("button", { name: /Adicionar texto/ }).click(); await p.getByLabel("Largura").fill("10"); await settle(p);
      await ph("ajuste"); await p.getByLabel("Largura").fill("14"); await settle(p);
    },
  },
  "separar-cores": {
    page: "Separar as cores de um arquivo",
    run: async (p, ph) => {
      await ph("carregar"); await upload(p); await settle(p);
      await ph("ajuste"); await p.getByRole("button", { name: "Objetos separados" }).click(); await settle(p);
    },
  },
  "cortar-mesa": {
    page: "Dividir peça grande",
    run: async (p, ph) => {
      await ph("carregar"); await upload(p); await settle(p);
      await ph("ajuste"); await p.getByRole("button", { name: "Pino quadrado" }).click(); await settle(p);
    },
  },
  molde: {
    page: "Molde a partir de STL",
    run: async (p, ph) => {
      await ph("carregar"); await upload(p); await settle(p);
      await ph("ajuste"); await p.getByLabel("Respiros").fill("2"); await settle(p);
    },
  },
  "miolo-leve": {
    page: "Deixar a peça mais leve",
    run: async (p, ph) => {
      await ph("carregar"); await upload(p); await settle(p);
      await ph("ajuste"); await p.getByRole("group", { name: "Tipo de estrutura" }).getByRole("button", { name: /Voronoi/i }).click(); await settle(p);
    },
  },
  "corte-parcial": {
    page: "Cortar um pedaço com encaixe",
    run: async (p, ph) => {
      await ph("carregar"); await upload(p); await settle(p);
      await ph("ponto");
      await p.getByRole("button", { name: /na parte clicada/ }).click();
      await p.locator(".viewer").click({ position: { x: 360, y: 560 } }); await settle(p);
      await ph("ajuste"); await p.getByRole("button", { name: "Vertical (X)" }).click(); await settle(p);
    },
  },
  textura: {
    page: "Textura na peça",
    run: async (p, ph) => {
      await ph("carregar"); await upload(p); await settle(p);
      await ph("ajuste"); await p.getByRole("button", { name: /Couro/ }).click(); await settle(p);
    },
  },
};

test(`medir travadas: ${TOOL} (${MODEL})`, async ({ page }) => {
  test.skip(!OUT || !TOOL || (MODEL === "pesado" && !existsSync(HEAVY)), "só com STALL_OUT, STALL_TOOL e o arquivo pesado");
  test.setTimeout(LIMIT_MS * 3 + 120_000);
  await page.setViewportSize({ width: 1440, height: 1250 });
  await install(page);
  await openApp(page);
  const sc = SCENARIOS[TOOL];
  await go(page, sc.page);
  await expect(page.getByRole("heading", { name: sc.page })).toBeVisible();
  let error = "";
  try {
    await sc.run(page, (n) => phase(page, n));
  } catch (e) {
    error = String(e).slice(0, 200);
  }
  const hud = (await page.locator(".viewer .hud").first().textContent().catch(() => null)) ?? "";
  const alerts = await page.locator("[role=alert], .alert").allTextContents().catch(() => [] as string[]);
  const worst = await page.evaluate(() => (window as unknown as { __st: { worst: unknown } }).__st.worst);
  appendFileSync(OUT, JSON.stringify({ tool: TOOL, model: MODEL, worst, error, hud, alerts: alerts.map((a) => a.slice(0, 120)).slice(0, 3), when: new Date().toISOString() }) + "\n");
});
