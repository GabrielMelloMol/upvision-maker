/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import process from "node:process";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), wasm()],
  // Data do build (tela Sobre, #18).
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  // WASM (vtracer) usa top-level await; WebView2 e WKWebView (Safari 16+) suportam.
  // phone.html: página leve que o app serve para o celular na rede de casa (#16, src-tauri/src/lan.rs)
  build: { target: "es2022", rollupOptions: { input: { main: "index.html", phone: "phone.html" } } },
  worker: { format: "es" as const, plugins: () => [wasm()] },
  // Escaneia todas as páginas (lazy) e workers na partida: sem isso o Vite descobre dependências
  // só quando a tela abre e recarrega a página no meio do uso (bug B10 do QA, derrubava os E2E).
  optimizeDeps: { entries: ["index.html", "phone.html", "src/**/*.tsx", "src/**/*.worker.ts"] },
  test: {
    setupFiles: ["src/test/setup.ts"],
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
