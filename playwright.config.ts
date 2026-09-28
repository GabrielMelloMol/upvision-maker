import { defineConfig, devices } from "@playwright/test";

// Porta própria para não disputar com o `tauri dev` (1420).
const PORT = 1430;

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
  webServer: { command: `npx vite --port ${PORT} --strictPort`, port: PORT, reuseExistingServer: true },
});
