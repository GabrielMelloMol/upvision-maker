// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import KitGallery from "./KitGallery";
import { familyOf } from "./families";

afterEach(cleanup);

describe("galeria de kits de montar", () => {
  test("mostra um card por kit da família e marca o aberto", () => {
    render(<KitGallery id="kitBau" onPick={() => {}} />);
    const cards = screen.getAllByRole("button");
    expect(cards).toHaveLength(familyOf("kitBau").variants.length);
    expect(familyOf("kitBau").id).toBe("assembleKits");
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
