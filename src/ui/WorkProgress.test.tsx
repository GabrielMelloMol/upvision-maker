// @vitest-environment happy-dom
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { JobCancelled, type Job } from "../geometry/jobs";
import { CANCELLED_TEXT, useJobControl } from "./useJobControl";
import WorkProgress from "./WorkProgress";

const never = (): Job<number> => {
  let reject: (e: Error) => void = () => {};
  const promise = new Promise<number>((_, rej) => (reject = rej));
  return { promise, cancel: () => reject(new JobCancelled()) };
};

describe("useJobControl", () => {
  test("Cancelar rejeita com a mensagem de cancelado", async () => {
    const { result } = renderHook(() => useJobControl(["a"]));
    let outcome: Promise<number> = Promise.resolve(0);
    act(() => {
      outcome = result.current.run(() => never());
    });
    act(() => result.current.cancel());
    await expect(outcome).rejects.toThrow(CANCELLED_TEXT);
  });

  test("Cancelar antes de o cálculo começar (na espera) faz o próximo run falhar sem calcular", async () => {
    const { result } = renderHook(() => useJobControl(["a"]));
    act(() => result.current.cancel());
    let started = false;
    await expect(
      result.current.run(() => {
        started = true;
        return never();
      }),
    ).rejects.toThrow(CANCELLED_TEXT);
    expect(started).toBe(false);
  });

  test("mudar a entrada cancela o cálculo em andamento", async () => {
    const { result, rerender } = renderHook(({ k }) => useJobControl([k]), { initialProps: { k: 1 } });
    let outcome: Promise<number> = Promise.resolve(0);
    act(() => {
      outcome = result.current.run(() => never());
    });
    rerender({ k: 2 });
    await expect(outcome).rejects.toThrow(CANCELLED_TEXT);
  });
});

describe("WorkProgress", () => {
  test("mostra o progresso com Cancelar e, depois de cancelar, 'Calcular de novo'", async () => {
    function Harness({ error }: { error: string | null }) {
      const ctl = useJobControl(["a"]);
      return (
        <>
          <button type="button" onClick={() => void ctl.run(() => never()).catch(() => {})}>
            Iniciar
          </button>
          <WorkProgress control={ctl} busy error={error} title="Cortando" />
        </>
      );
    }
    const user = userEvent.setup();
    const { rerender } = render(<Harness error={null} />);
    await user.click(screen.getByRole("button", { name: "Iniciar" }));
    expect(await screen.findByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByText(/Cortando: Começando \(0%\)/)).toBeInTheDocument();
    rerender(<Harness error={CANCELLED_TEXT} />);
    expect(screen.getByRole("button", { name: "Calcular de novo" })).toBeInTheDocument();
  });
});
