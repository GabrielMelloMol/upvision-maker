// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { setSecret } from "../db/repo";
import { session, setSyncEnabled } from "../sync/sync";
import { setupTauri } from "../test/harness";
import { runCloseJob } from "./closeJob";

const t = setupTauri();
const DIR = "C:/Users/ana/OneDrive/UpVision";

beforeEach(async () => {
  session.active = true;
  await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Bambu A1', 100)");
  await setSecret(t.db, "backup_dir", DIR);
  await setSyncEnabled(t.db, true);
});

describe("fechamento do app (M2)", () => {
  test("a sincronização vem antes do backup: é o passo que o outro computador espera", async () => {
    await runCloseJob();

    const sync = t.calls.indexOf("sync_write");
    const backup = t.calls.indexOf("backup_write");
    expect(sync).toBeGreaterThan(-1);
    expect(backup).toBeGreaterThan(sync);
    expect(t.autoBackups.get(DIR)?.has("upvision-sync.lock")).toBe(false); // soltou a trava
  });

  test("com a sincronização desligada só faz o backup", async () => {
    await setSyncEnabled(t.db, false);
    await runCloseJob();
    expect(t.calls).not.toContain("sync_write");
    expect(t.calls).toContain("backup_write");
  });

  test("backup que falha ao fechar não impede o fechamento e fica guardado para avisar na próxima abertura (M13)", async () => {
    t.handlers.backup_write = () => {
      throw new Error("Não consegui gravar: disco cheio");
    };
    await expect(runCloseJob()).resolves.toBeUndefined();
    const [row] = await t.db.select<{ value: string }>("SELECT value FROM secrets WHERE key = 'backup_error'");
    expect(row.value).toContain("disco cheio");
  });
});
