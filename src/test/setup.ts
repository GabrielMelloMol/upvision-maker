import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach } from "vitest";
import { syncTuning } from "../sync/tuning";

// Espera por condição (findBy/waitFor) sem pressa: o padrão de 1 s desistia com a máquina carregada (outros agentes,
// build em paralelo) mesmo com o app certo. Só alonga a espera: se a condição nunca vem, o teste continua falhando.
beforeAll(async () => {
  if (typeof document === "undefined") return;
  const { configure } = await import("@testing-library/react");
  configure({ asyncUtilTimeout: 10_000 });
});

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

