// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import KitGallery, { KIT_IDS } from "./KitGallery";
import { familyOf } from "./families";

afterEach(cleanup);

describe("galeria de kits de montar", () => {
  test("mostra um card por kit da família e marca o aberto", () => {
    render(<KitGallery id="kitBau" onPick={() => {}} />);
    const cards = screen.getAllByRole("button");
    expect(cards).toHaveLength(KIT_IDS.length);
    expect(familyOf("kitBau").variants.map((v) => v.id).sort()).toEqual([...KIT_IDS].sort());
    expect(screen.getByRole("button", { name: /Baú/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Bicho/ }).getAttribute("aria-pressed")).toBe("false");
  });
  test("escolher outro kit avisa; o já aberto não faz nada", async () => {
    const onPick = vi.fn();
    render(<KitGallery id="kitBau" onPick={onPick} />);
    await userEvent.click(screen.getByRole("button", { name: /Baú/ }));
    expect(onPick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Bicho/ }));
    expect(onPick).toHaveBeenCalledWith("kitBicho");
  });
});
