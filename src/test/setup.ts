import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Limpa o DOM entre testes de componente (arquivos com @vitest-environment happy-dom).
afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
