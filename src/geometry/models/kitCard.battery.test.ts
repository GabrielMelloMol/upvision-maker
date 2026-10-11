// @vitest-environment happy-dom
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import opentype from "opentype.js";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { cutout } from "../../vectorize/cutout";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { textToCrossSection } from "../text";
import type { ModelCtx } from "./common";
import { checkKitCard, type Check } from "./kitBattery/checks";
import { CASES, EXPECTED_CUTOUT, rasterize, type ImageCase } from "./kitBattery/images";
import { artFromImage } from "./kitBattery/pipeline";
import { drawMask, drawRaster, encodePng, fillRect, newImg, renderModels, type Img } from "./kitBattery/render";
import { buildKitCard, DEFAULT_KIT_CARD, type KitCardParams, type KitMeta, type KitMode } from "./kitCard";

vi.mock("../../vectorize/client", () => ({ loadRaster: vi.fn(), trace: vi.fn() })); // designInput importa; aqui a vetorização roda direto

/*
 * Bateria do Kit card (#193): 24 imagens próprias (silhuetas, linhas, ícones, fotos com fundo liso e bagunçado, contorno fino, texto,
 * várias figuras, de frente, animal, veículo, avião) × os 2 modos (figura e veículo). Para cada uma verifica peças inteiras, presas à
 * moldura, sem sobreposição, cartão na mesa, montado sem colisão com as fendas casando e números junto das peças.
 *
 *   npx vitest run src/geometry/models/kitCard.battery.test.ts                  amostra de 6 imagens (roda no push)
 *   KITCARD_BATERIA=1 npx vitest run src/geometry/models/kitCard.battery.test.ts   as 24 + painel visual em
 *                                                  ~/Downloads/upvision-aprovar/kitcard-bateria/ (um PNG por caso + indice.html/md)
 *
 * KNOWN lista o que a bateria já achou quebrado no Kit card (com o motivo) para a suíte não ficar vermelha enquanto a Forja corrige:
 * falha nova = teste vermelho; item que passou a passar aparece no relatório como "resolvido, tire da lista".
 */
const FULL = process.env.KITCARD_BATERIA === "1";
const OUT = process.env.KITCARD_SAIDA ?? join(homedir(), "Downloads", "upvision-aprovar", "kitcard-bateria");
const SAMPLE = ["01-circulo", "09-aviao-foto-liso", "18-carro-frente", "19-cachorro", "21-caminhao", "23-aviao-cacador"];
const MODES: KitMode[] = ["figure", "vehicle"];
const MODE_NAME: Record<KitMode, string> = { figure: "figura (costelas)", vehicle: "veículo (rodas)" };

/** "caso:modo:verificação" → o que está quebrado. */
const KNOWN: Record<string, string> = {
  "13-cachorro-fundo-bagunca:figure:fendas": "as costelas não encostam nas laterais com a folga pedida (silhueta do recorte errado: fundo bagunçado)",
};

let M: ManifoldToplevel;
let font: opentype.Font;
beforeAll(async () => {
  M = await getManifold();
  const b = readFileSync(resolve(__dirname, "../../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff"));
  font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
});

type Status = "ok" | "atenção" | "ruim";
type Row = { c: ImageCase; mode: KitMode; checks: Check[]; warnings: string[]; cutWarning: string | null; coverage: number; uncertain: boolean; meta?: KitMeta; error?: string; status: Status; reasons: string[]; fixed: string[]; models?: ReturnType<typeof buildKitCard>["models"] };
const rows: Row[] = [];
const MONTAR = /^Para montar:/;

describe("recorte do fundo (fixture para a interface)", () => {
  for (const c of CASES)
    test(`${c.id}: cutout dá o resultado esperado`, async () => {
      const r = rasterize(c);
      const got = await cutout(r.rgba, r.w, r.h, { segment: async () => { throw new Error("sem MediaPipe no Node"); } });
      const want = EXPECTED_CUTOUT[c.id];
      expect(got.method).toBe(want.method);
      expect(got.uncertain).toBe(want.uncertain);
      expect(Math.abs(got.coverage - want.coverage)).toBeLessThanOrEqual(0.03);
      expect(Boolean(got.warning)).toBe(want.uncertain);
    });
});

describe("bateria do Kit card", () => {
  for (const c of CASES.filter((x) => FULL || SAMPLE.includes(x.id)))
    test(c.id, { timeout: 300_000 }, async () => {
      const raster = rasterize(c);
      const art = await artFromImage(raster);
      const bad: string[] = [];
      for (const mode of MODES) {
        const ctx: ModelCtx = { M, art: art.cs, art2: null, text: (s, h) => (s.trim() ? textToCrossSection(M, font, s, h) : null) };
        const p: KitCardParams = { ...DEFAULT_KIT_CARD, mode, title: "" }; // sem título: tudo o que está gravado é número de peça
        const row: Row = { c, mode, checks: [], warnings: [], cutWarning: art.cut.warning, coverage: art.cut.coverage, uncertain: art.cut.uncertain, status: "ok", reasons: [], fixed: [] };
        try {
          const out = buildKitCard(ctx, p);
          row.models = out.models;
          row.meta = out.meta;
          row.warnings = (out.warnings ?? []).filter((w) => !MONTAR.test(w));
          row.checks = checkKitCard(M, out, p);
        } catch (e) {
          row.error = e instanceof Error ? e.message : String(e);
        }
        for (const k of row.checks) {
          const key = `${c.id}:${mode}:${k.id}`;
          if (!k.ok && !KNOWN[key]) bad.push(`${key} → ${k.detail}`);
          if (k.ok && KNOWN[key]) row.fixed.push(key);
        }
        if (row.error) bad.push(`${c.id}:${mode} → erro: ${row.error}`);
        rows.push(finish(row));
        if (FULL) writeRow(c, raster, art.cut.mask);
      }
      expect(bad).toEqual([]);
    });
});

function finish(r: Row): Row {
  const hard = r.checks.filter((k) => !k.ok);
  r.reasons = [
    ...(r.error ? [`não gerou: ${r.error}`] : []),
    ...hard.map((k) => `${k.label}: ${k.detail}`),
    ...(r.uncertain && r.cutWarning ? [`recorte incerto: ${r.cutWarning}`] : []),
    ...r.warnings.map((w) => `aviso: ${w}`),
  ];
  r.status = r.error || hard.length || r.uncertain ? "ruim" : r.warnings.length ? "atenção" : "ok";
  return r;
}

// ---------- painel visual ----------
const PANEL_W = 480, PANEL_H = 320, GAP = 12, BAR = 8;
const BG: [number, number, number] = [244, 244, 242];
const STATUS_RGB: Record<Status, [number, number, number]> = { ok: [60, 160, 90], atenção: [230, 170, 40], ruim: [210, 60, 55] };

function writeRow(c: ImageCase, raster: ReturnType<typeof rasterize>, mask: Uint8Array): void {
  const mine = rows.filter((r) => r.c.id === c.id);
  if (mine.length < MODES.length) return;
  const img: Img = newImg(BAR + GAP + 3 * PANEL_W + 3 * GAP, GAP + MODES.length * (PANEL_H + GAP), BG);
  mine.forEach((r, i) => {
    const y = GAP + i * (PANEL_H + GAP);
    fillRect(img, 0, y, BAR, PANEL_H, STATUS_RGB[r.status]);
    const x0 = BAR + GAP;
    fillRect(img, x0, y, PANEL_W, PANEL_H, [255, 255, 255]);
    drawRaster(img, raster, x0, y, PANEL_W, PANEL_H);
    drawMask(img, mask, raster.w, raster.h, x0, y, PANEL_W, PANEL_H); // o recorte, em azul sobre a foto
    if (r.models) {
      const card = r.models.filter((m) => !m.previewOnly), asm = r.models.filter((m) => m.previewOnly);
      renderModels(img, card, "top", x0 + PANEL_W + GAP, y, PANEL_W, PANEL_H, [255, 255, 255]);
      renderModels(img, asm, "iso", x0 + 2 * (PANEL_W + GAP), y, PANEL_W, PANEL_H, [255, 255, 255]);
    } else fillRect(img, x0 + PANEL_W + GAP, y, 2 * PANEL_W + GAP, PANEL_H, [250, 225, 225]);
  });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${c.id}.png`), encodePng(img));
}

const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);

afterAll(() => {
  if (!FULL || !rows.length) return;
  mkdirSync(OUT, { recursive: true });
  const ids = [...new Set(rows.map((r) => r.c.id))];
  const worst = (id: string): Status => (rows.filter((r) => r.c.id === id).some((r) => r.status === "ruim") ? "ruim" : rows.filter((r) => r.c.id === id).some((r) => r.status === "atenção") ? "atenção" : "ok");
  const count = (s: Status) => ids.filter((id) => worst(id) === s).length;
  const bullets = (id: string) => rows.filter((r) => r.c.id === id).flatMap((r) => r.reasons.map((x) => `${MODE_NAME[r.mode]}: ${x}`));
  const fixed = rows.flatMap((r) => r.fixed);
  const html = `<!doctype html><meta charset="utf-8"><title>Bateria do Kit card</title><style>body{font:14px system-ui;margin:24px;background:#fafaf8;color:#222}h1{margin:0 0 4px}.sum{margin:0 0 20px}.card{background:#fff;border-radius:10px;box-shadow:0 0 0 1px #ddd;margin:0 0 18px;padding:12px}.card img{max-width:100%}.b{display:inline-block;padding:1px 9px;border-radius:99px;color:#fff;font-weight:600}.ok{background:#3ca05a}.atenção{background:#e6aa28}.ruim{background:#d23c37}ul{margin:6px 0 0 18px;padding:0}li{margin:2px 0}small{color:#666}</style><h1>Bateria do Kit card</h1><p class="sum">${ids.length} imagens × 2 modos. <b>${count("ok")}</b> ok · <b>${count("atenção")}</b> com atenção · <b>${count("ruim")}</b> ruins. Em cada imagem: foto com o recorte em azul · cartão visto de cima · modelo montado. A faixa da esquerda é o estado (verde, amarelo, vermelho) de cada modo: figura em cima, veículo embaixo.</p>${ids
    .map((id) => {
      const c = CASES.find((x) => x.id === id)!;
      return `<div class="card"><h3>${esc(c.name)} <span class="b ${worst(id)}">${worst(id)}</span> <small>${id} · ${esc(c.group)}</small></h3><img src="${id}.png" alt="${esc(c.name)}">${bullets(id).length ? `<ul>${bullets(id).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>`;
    })
    .join("")}${fixed.length ? `<p>Resolvidos (tire de KNOWN): ${fixed.join(", ")}</p>` : ""}`;
  writeFileSync(join(OUT, "indice.html"), html);
  const md = [`# Bateria do Kit card`, ``, `${ids.length} imagens × 2 modos: ${count("ok")} ok, ${count("atenção")} com atenção, ${count("ruim")} ruins.`, ``, `| Caso | Estado | Por quê |`, `|---|---|---|`, ...ids.map((id) => `| ${CASES.find((x) => x.id === id)!.name} (${id}) | ${worst(id)} | ${bullets(id).map((x) => x.replace(/\|/g, "/")).join("<br>") || "–"} |`), ...(fixed.length ? [``, `Resolvidos (tire de KNOWN): ${fixed.join(", ")}`] : [])].join("\n");
  writeFileSync(join(OUT, "indice.md"), md);
  writeFileSync(join(OUT, "resumo.json"), JSON.stringify(rows.map((r) => ({ caso: r.c.id, modo: r.mode, estado: r.status, falhas: r.checks.filter((k) => !k.ok).map((k) => ({ id: k.id, detalhe: k.detail })), motivos: r.reasons, meta: r.meta })), null, 1));
});
