import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";

// Regressão visual (#142): `npm run visual`. Referências por plataforma (as fontes do sistema mudam entre Mac e
// Windows), geradas no CI (workflow visual) e guardadas em tests/visual/referencia/<plataforma>.
const free = "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})";
process.env.VISUAL_PORT ??= execFileSync(process.execPath, ["-e", free], { encoding: "utf8" }).trim();
const PORT = Number(process.env.VISUAL_PORT);

export default defineConfig({
  testDir: "tests/visual",
  testMatch: "**/*.visual.ts",
  snapshotPathTemplate: "{testDir}/referencia/{platform}/{arg}{ext}",
  timeout: 15 * 60_000,
  expect: { timeout: 30_000, toHaveScreenshot: { maxDiffPixelRatio: 0.003, threshold: 0.2, animations: "disabled", caret: "hide" } },
  fullyParallel: true,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/visual", open: "never" }]],
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined },
  webServer: { command: `npx vite --port ${PORT} --strictPort`, port: PORT },
});
