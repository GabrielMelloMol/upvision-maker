import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";

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
