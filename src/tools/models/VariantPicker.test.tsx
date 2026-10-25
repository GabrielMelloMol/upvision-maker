// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import VariantPicker from "./VariantPicker";
import { TOOL_THUMBS } from "./thumbs";

test("atalho de ferramenta com foto mostra a foto e a seta de outra tela num selo (#286)", () => {
  render(<VariantPicker id="stamp" onPick={() => {}} />);
  const tool = screen.getByRole("button", { name: "Carimbo seco" });
  expect(tool.querySelector("img")).toHaveAttribute("src", TOOL_THUMBS.stamp);
  expect(tool.querySelector(".model-variant-badge svg")).not.toBeNull();
});
