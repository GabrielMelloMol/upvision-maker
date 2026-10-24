import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";

// Fotos realistas (#251): o path tracing precisa da GPU de verdade (o headless padrão cai no SwiftShader, 100× mais
// lento). Usa o Chrome instalado com ANGLE/Metal. Uso: `npm run photos`.
const free = "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})";
process.env.PHOTO_PORT ??= execFileSync(process.execPath, ["-e", free], { encoding: "utf8" }).trim();
const PORT = Number(process.env.PHOTO_PORT);
process.env.E2E_PORT = String(PORT);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/photos.e2e.ts",
  timeout: 600_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    channel: process.env.PW_CHANNEL || "chrome",
    launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-features=Vulkan"] },
  },
  webServer: { command: `npx vite --port ${PORT} --strictPort`, port: PORT },
});
