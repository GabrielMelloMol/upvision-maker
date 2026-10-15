// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { Preset } from "../fields";
import PresetBar from "./PresetBar";

const presets: Preset[] = [
  { id: "screws", label: "Parafusos", blurb: "Nichos pequenos para parafusos.", patch: { cols: 6, rows: 4 } },
  { id: "tools", label: "Ferramentas", blurb: "Poucos nichos e grandes.", patch: { cols: 2 } },
];

describe("PresetBar", () => {
  test("marca como pressionado o preset cujos campos batem e mostra a frase dele", () => {
    render(<PresetBar presets={presets} params={{ cols: 6, rows: 4 }} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: "Parafusos" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Ferramentas" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Nichos pequenos para parafusos.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comece pelo uso" })).toBeInTheDocument();
  });

  test("chama onPick com o preset clicado e aceita outro título", async () => {
    const onPick = vi.fn();
    render(<PresetBar presets={presets} params={{}} label="Para que é?" onPick={onPick} />);
    await userEvent.click(screen.getByRole("button", { name: "Ferramentas" }));
    expect(onPick).toHaveBeenCalledWith(presets[1]);
    expect(screen.getByRole("heading", { name: "Para que é?" })).toBeInTheDocument();
  });

  test("o foco no chip mostra a frase dele, e sem preset ativo a frase some", async () => {
    render(<PresetBar presets={presets} params={{ cols: 9 }} onPick={() => {}} />);
    expect(screen.queryByText("Poucos nichos e grandes.")).toBeNull();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Ferramentas" })).toHaveFocus();
    expect(screen.getByText("Poucos nichos e grandes.")).toBeInTheDocument();
  });
});
