// @vitest-environment happy-dom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { setupTauri } from "../test/harness";
import { useAutoBackup } from "./useAutoBackup";

const t = setupTauri();

describe("backup automático na abertura (M13)", () => {
  test("falhou: o motivo aparece na hora, sem esperar os 7 dias do lembrete", async () => {
    t.handlers.backup_write = () => {
      throw new Error("Não consegui gravar: pasta sem permissão");
    };

    const { result } = renderHook(() => useAutoBackup());

    await waitFor(() => expect(result.current.backupError).toContain("pasta sem permissão"));
  });

  test("deu certo: sem erro, e um erro antigo guardado some", async () => {
    await t.db.execute("INSERT INTO secrets (key, value) VALUES ('backup_error', 'erro de ontem')");

    const { result } = renderHook(() => useAutoBackup());

    await waitFor(() => expect(t.calls).toContain("backup_write"));
    await waitFor(() => expect(result.current.backupError).toBeNull());
  });
});
