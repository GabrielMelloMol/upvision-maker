// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { Model } from "../../geometry/types";
import DrawerView from "./DrawerView";

const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
const organizer: Model[] = [{ name: "Caixa", parts: [{ name: "Caixa", color: "#000000", mesh }] }];

// Auditoria de UX (M15, axe nested-interactive): um role="img" não pode conter o botão "Ver montado".
test("o botão 'Ver montado' não fica dentro de um elemento role=img, e a gaveta continua descrita", () => {
  const { container } = render(<DrawerView width={500} depth={420} height={80} focus="width" organizer={organizer} />);
  const button = screen.getByRole("button", { name: "Ver montado" });
  expect(button.closest('[role="img"]')).toBeNull();
  const view = container.querySelector(".drawer-view")!;
  expect(view.getAttribute("aria-label")).toMatch(/Gaveta de 500 × 420 mm.*medindo a largura.*organizador montado dentro/);
});
