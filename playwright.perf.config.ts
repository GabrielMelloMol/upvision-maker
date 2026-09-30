import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";

// Medição de desempenho (#88): build de produção servido pelo `vite preview` (o que o app instalado carrega),
// um teste de cada vez para a memória medida ser só a deste navegador. Uso: `npm run perf`.
const free = "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})";
process.env.PERF_PORT ??= execFileSync(process.execPath, ["-e", free], { encoding: "utf8" }).trim();
const PORT = Number(process.env.PERF_PORT);

export default defineConfig({
  testDir: "tests/perf",
  testMatch: "**/*.perf.ts",
  timeout: 300_000,
  expect: { timeout: 120_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, channel: process.env.PW_CHANNEL || undefined },
  webServer: { command: `npx vite build && npx vite preview --port ${PORT} --strictPort`, port: PORT, timeout: 300_000 },
});
