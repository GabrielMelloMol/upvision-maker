import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";

// Porta do Vite do E2E. Sem E2E_PORT, pega uma porta livre a cada execução: duas pastas (worktrees) rodando
// ao mesmo tempo não se atrapalham e nunca testam o servidor da outra. O valor vai para process.env para os
// workers (que reimportam esta config) usarem a mesma porta. Com E2E_PORT explícito, reaproveita um Vite já aberto nela.
const explicitPort = !!process.env.E2E_PORT && !process.env.E2E_PORT_AUTO;
if (!process.env.E2E_PORT) {
  const free = "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})";
  process.env.E2E_PORT = execFileSync(process.execPath, ["-e", free], { encoding: "utf8" }).trim();
  process.env.E2E_PORT_AUTO = "1";
}
const PORT = Number(process.env.E2E_PORT);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    // PW_CHANNEL=msedge roda no Edge instalado (o motor do WebView2 no Windows).
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: { command: `npx vite --port ${PORT} --strictPort`, port: PORT, reuseExistingServer: explicitPort },
});
