// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { FieldDef } from "./fields";
import ParamField from "./ParamField";

const choice = (n: number): FieldDef => ({ k: "c", kind: "choice", label: "Cidade", options: Array.from({ length: n }, (_, i) => [`v${i}`, `Opção ${i}`] as const) });

describe("campo de escolha", () => {
  test("até 4 opções: abas; de 5 a 12: pílulas; acima disso: lista para escolher", async () => {
    const { unmount } = render(<ParamField f={choice(3)} value="v0" onChange={() => {}} />);
    expect(screen.queryByRole("combobox")).toBeNull();
    unmount();
    const { unmount: u2 } = render(<ParamField f={choice(12)} value="v0" onChange={() => {}} />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(12);
    u2();
    const onChange = vi.fn();
    render(<ParamField f={choice(13)} value="v2" onChange={onChange} />);
    const list = screen.getByRole("combobox", { name: "Cidade" }) as HTMLSelectElement;
    expect(list.value).toBe("v2");
    expect(list.options).toHaveLength(13);
    await userEvent.selectOptions(list, "v7");
    expect(onChange).toHaveBeenCalledWith("v7");
  });
});
