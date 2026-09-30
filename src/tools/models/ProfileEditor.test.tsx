// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import ProfileEditor from "./ProfileEditor";

function Harness({ initial = "30, 40, 35, 20" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return <ProfileEditor label="Perfil" value={v} onChange={setV} min={5} max={120} />;
}

test("setas mudam o raio do ponto (Shift: 5 mm) dentro dos limites; texto mostra os raios (#92)", async () => {
  render(<Harness />);
  const p2 = screen.getByRole("slider", { name: "Ponto 2 (de baixo para cima)" });
  expect(p2).toHaveAttribute("aria-valuenow", "40");
  fireEvent.keyDown(p2, { key: "ArrowRight" });
  fireEvent.keyDown(p2, { key: "ArrowRight", shiftKey: true });
  expect(screen.getByRole("textbox", { name: /Raios/ })).toHaveValue("30, 46, 35, 20");
  const p4 = screen.getByRole("slider", { name: "Ponto 4 (de baixo para cima)" });
  for (let i = 0; i < 5; i++) fireEvent.keyDown(p4, { key: "ArrowLeft", shiftKey: true });
  expect(p4).toHaveAttribute("aria-valuenow", "5"); // não passa do mínimo
});

test("acrescenta e tira pontos entre 4 e 8; digitar os raios também vale", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.getByRole("button", { name: "Tirar um ponto" })).toBeDisabled();
  for (let i = 0; i < 4; i++) await user.click(screen.getByRole("button", { name: "Acrescentar um ponto" }));
  expect(screen.getAllByRole("slider")).toHaveLength(8);
  expect(screen.getByRole("button", { name: "Acrescentar um ponto" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Tirar um ponto" }));
  expect(screen.getAllByRole("slider")).toHaveLength(7);
  const box = screen.getByRole("textbox", { name: /Raios/ });
  await user.clear(box);
  await user.type(box, "10, 20, 30, 40, 50");
  expect(screen.getAllByRole("slider")).toHaveLength(5);
});
