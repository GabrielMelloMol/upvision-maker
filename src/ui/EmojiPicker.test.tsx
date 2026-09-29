// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { expect, test } from "vitest";
import EmojiPicker from "./EmojiPicker";

function Harness({ max = 40 }: { max?: number }) {
  const [v, setV] = useState("Ana");
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input aria-label="Texto" ref={ref} value={v} maxLength={max} onChange={(e) => setV(e.target.value)} />
      <EmojiPicker inputRef={ref} value={v} onChange={setV} />
    </>
  );
}

test("insere o emoji no cursor e devolve o foco ao campo", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const input = screen.getByLabelText<HTMLInputElement>("Texto");
  input.setSelectionRange(0, 0);
  await user.click(screen.getByRole("button", { name: "Inserir emoji" }));
  expect(screen.getByRole("dialog", { name: "Emojis" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Emoji 🐶" }));
  expect(input).toHaveValue("🐶Ana");
  await expect.poll(() => document.activeElement).toBe(input);
});

test("Esc fecha e devolve o foco ao botão; clique fora fecha", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const btn = screen.getByRole("button", { name: "Inserir emoji" });
  await user.click(btn);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(btn);
  await user.click(btn);
  await user.click(screen.getByLabelText("Texto"));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("não passa do limite de caracteres do campo", async () => {
  const user = userEvent.setup();
  render(<Harness max={4} />);
  await user.click(screen.getByRole("button", { name: "Inserir emoji" }));
  await user.click(screen.getByRole("button", { name: "Emoji ⭐" }));
  expect(screen.getByLabelText("Texto")).toHaveValue("Ana⭐");
  await user.click(screen.getByRole("button", { name: "Emoji ⭐" }));
  expect(screen.getByLabelText("Texto")).toHaveValue("Ana⭐");
});
