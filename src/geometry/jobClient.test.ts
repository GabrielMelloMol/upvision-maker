import { describe, expect, test } from "vitest";
import { createJobRunner } from "./jobClient";
import { fileKey, JobCancelled } from "./jobs";

// sem Worker (ambiente de teste): o runner roda `inline` na mesma thread, com o mesmo contrato
const slow = createJobRunner<number, number>({
  spawn: () => {
    throw new Error("sem worker");
  },
  inline: async (n, hooks) => {
    for (let i = 1; i <= 3; i++) {
      await new Promise((r) => setTimeout(r, 5));
      if (hooks.cancelled?.()) throw new JobCancelled();
      hooks.progress?.(i / 3, `etapa ${i}`);
    }
    return n * 2;
  },
});

describe("createJobRunner (sem Worker)", () => {
  test("devolve o resultado e avisa o progresso por etapa", async () => {
    const seen: string[] = [];
    const out = await slow(21, (_f, stage) => seen.push(stage)).promise;
    expect(out).toBe(42);
    expect(seen).toEqual(["etapa 1", "etapa 2", "etapa 3"]);
  });

  test("Cancelar interrompe o cálculo com JobCancelled", async () => {
    const job = slow(1);
    job.cancel();
    await expect(job.promise).rejects.toBeInstanceOf(JobCancelled);
  });

  test("pedido novo cancela o anterior", async () => {
    const first = slow(1);
    const second = slow(2);
    await expect(first.promise).rejects.toBeInstanceOf(JobCancelled);
    await expect(second.promise).resolves.toBe(4);
  });
});

describe("fileKey", () => {
  test("muda com o nome, o tamanho ou o conteúdo", () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    expect(fileKey("a.stl", a)).toBe(fileKey("a.stl", a.slice()));
    expect(fileKey("a.stl", a)).not.toBe(fileKey("b.stl", a));
    expect(fileKey("a.stl", a)).not.toBe(fileKey("a.stl", new Uint8Array([1, 2, 3, 5])));
    expect(fileKey("a.stl", a)).not.toBe(fileKey("a.stl", new Uint8Array([1, 2, 3])));
  });
});
