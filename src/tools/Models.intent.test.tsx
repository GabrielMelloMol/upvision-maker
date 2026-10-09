// @vitest-environment happy-dom
import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { openWith } from "./intent";
import Models from "./Models";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
/** Um campo que falha na primeira tentativa de desenhar (o React tenta de novo, uma vez, antes de desistir). */
const flaky = vi.hoisted(() => ({ failOnce: false, suspendOnce: false }));
vi.mock("./models/ParamField", async (orig) => {
  const real = await orig<typeof import("./models/ParamField")>();
  return {
    ...real,
    default: (props: Parameters<typeof real.default>[0]) => {
      if (flaky.suspendOnce) {
        flaky.suspendOnce = false;
        throw new Promise((resolve) => setTimeout(resolve, 400)); // o React espera e desenha a tela de novo do zero
      }
      if (flaky.failOnce) {
        flaky.failOnce = false;
        throw new Error("falha passageira ao desenhar o campo");
      }
      return real.default(props);
    },
  };
});

setupTauri();

describe("Modelos prontos abrem no modelo pedido mesmo se o 1º desenho da tela falhar (cartões da Criar)", () => {
  test("o pedido do cartão não se perde na nova tentativa do React (antes caía na Placa Pix)", async () => {
    flaky.failOnce = true;
    openWith("models", { id: "starMap" });
    renderWithApp(<Models />);
    expect(await screen.findByRole("heading", { name: "Mapa estelar de uma data", level: 2 }, { timeout: 20_000 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Placa Pix", level: 2 })).not.toBeInTheDocument();
  }, 30_000);

  test("o mesmo se a tela suspender na 1ª vez e só voltar mais tarde (Suspense): o pedido ainda está lá", async () => {
    flaky.suspendOnce = true;
    openWith("models", { id: "starMap" });
    renderWithApp(<Models />);
    expect(await screen.findByRole("heading", { name: "Mapa estelar de uma data", level: 2 }, { timeout: 20_000 })).toBeInTheDocument();
  }, 30_000);
});
