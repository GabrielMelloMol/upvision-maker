// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { loadBackup, saveBackup } from "./backupActions";
import { setupTauri } from "./test/harness";

const t = setupTauri();
const text = (path: string) => new TextDecoder().decode(t.files.get(path));

describe("saveBackup", () => {
  test("grava um JSON com os dados no caminho escolhido e devolve o caminho", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Ender', 150)");

    const path = await saveBackup();

    expect(path).toMatch(/^\/saida\/upvision-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
    const json = JSON.parse(text(path!));
    expect(json.app).toBe("upvision-maker");
    expect(json.tables.printers).toEqual([expect.objectContaining({ name: "Ender", watts: 150 })]);
  });

  test("cancelar o diálogo não grava nada e devolve null", async () => {
    t.savePath = () => null;

    expect(await saveBackup()).toBeNull();
    expect(t.files.size).toBe(0);
  });
});

describe("loadBackup", () => {
  test("cancelar o diálogo devolve null sem mexer no banco", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Ender', 150)");
    t.openPath = null;

    expect(await loadBackup()).toBeNull();
    expect(await t.db.select("SELECT name FROM printers")).toEqual([{ name: "Ender" }]);
  });

  test("guarda cópia dos dados atuais e restaura o backup", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Antiga', 100)");
    const saved = (await saveBackup())!;
    await t.db.execute("DELETE FROM printers");
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Nova', 200)");
    t.openPath = saved;

    const r = await loadBackup();

    expect(r?.safetyCopy).toMatch(/^\/dados-app\/backups\/antes-de-restaurar-.+\.json$/);
    expect(JSON.parse(text(r!.safetyCopy)).tables.printers).toEqual([expect.objectContaining({ name: "Nova" })]);
    expect(await t.db.select("SELECT name, watts FROM printers")).toEqual([{ name: "Antiga", watts: 100 }]);
    expect(t.calls).toContain("plugin:fs|mkdir");
  });

  test("arquivo que não é backup falha antes de apagar qualquer dado", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Ender', 150)");
    t.files.set("/x.json", new TextEncoder().encode('{"foo":1}'));
    t.openPath = "/x.json";

    await expect(loadBackup()).rejects.toThrow("não é um backup");
    expect(await t.db.select("SELECT name FROM printers")).toEqual([{ name: "Ender" }]);
  });
});
