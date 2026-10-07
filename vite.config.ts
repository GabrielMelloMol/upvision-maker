/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import process from "node:process";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

const host = process.env.TAURI_DEV_HOST;
/** Testes pesados de verdade: malhas com o manifold (3D), a varredura de QA, a estimativa e o processamento de fotos. */
const GEOMETRY_TESTS = [
  "src/geometry/**/*.test.{ts,tsx}",
  "src/tools/**/*.test.{ts,tsx}",
  "src/qa/**/*.test.{ts,tsx}",
  "src/vectorize/regression.test.ts",
  "src/domain/estimate.test.ts",
  "src/ui/EstimateCard.test.tsx",
  "src/ui/heavy.test.ts",
  "src/App.test.tsx",
  "src/organizer/**/*.test.{ts,tsx}", // foto → contornos (renderiza imagens de 1600 × 1200) e decodificação HEIC em WASM
];

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), wasm()],
  // Data do build (tela Sobre, #18).
  // Versão do app (abertura completa na 1ª abertura depois de cada atualização, #153).
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)), __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version) },
  // WASM (vtracer) usa top-level await; WebView2 e WKWebView (Safari 16+) suportam.
  // phone.html: página leve que o app serve para o celular na rede de casa (#16, src-tauri/src/lan.rs)
  build: { target: "es2022", rollupOptions: { input: { main: "index.html", phone: "phone.html" } } },
  worker: { format: "es" as const, plugins: () => [wasm()] },
  // Escaneia todas as páginas (lazy) e workers na partida: sem isso o Vite descobre dependências
  // só quando a tela abre e recarrega a página no meio do uso (bug B10 do QA, derrubava os E2E).
  optimizeDeps: { entries: ["index.html", "phone.html", "src/**/*.tsx", "src/**/*.worker.ts"] },
  test: {
    setupFiles: ["src/test/setup.ts"],
    // #127: geometria 3D (manifold) é pesada e, com a máquina carregada, passava dos 5 s. Fica num projeto com
    // tempo maior; o resto do app continua com 5 s para teste lento comum ainda aparecer.
    projects: [
      { extends: true, test: { name: "geometria", include: GEOMETRY_TESTS, testTimeout: 60_000, hookTimeout: 60_000, setupFiles: ["src/test/setupGeometry.ts"] } },
      { extends: true, test: { name: "app", include: ["src/**/*.test.{ts,tsx}", "services/**/*.test.ts"], exclude: [...GEOMETRY_TESTS, "**/node_modules/**"] } },
    ],
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      // Fora da cobertura unitária: workers e MediaPipe só rodam no navegador (cobertos pelos E2E), bootstrap e o próprio harness.
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.worker.ts", "src/vectorize/segment.ts", "src/main.tsx", "src/env.d.ts", "src/test/**"],
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    // 3. tell Vite to ignore watching `src-tauri`
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
