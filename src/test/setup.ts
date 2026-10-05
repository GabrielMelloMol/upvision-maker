import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { syncTuning } from "../sync/tuning";

// Limpa o DOM entre testes de componente (arquivos com @vitest-environment happy-dom).
afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});

// Tour guiado (#158) desligado nos testes de componente: ele abriria um balão por cima das telas.
beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.setItem("upvision:tours", '["*"]');
});

// Trava da sincronização (M5): sem a espera de 3 s da nuvem nos testes.
beforeEach(() => {
  syncTuning.settleMs = 0;
  syncTuning.tickMs = 60_000;
});

