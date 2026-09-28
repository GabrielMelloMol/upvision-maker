// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { setupTauri } from "./test/harness";
import { findUpdate, installUpdate } from "./updater";

const t = setupTauri();
const META = { rid: 7, currentVersion: "0.3.0", version: "0.4.0", date: "2026-09-28", body: "", rawJson: {} };

describe("updater", () => {
  test("sem release nova devolve null", async () => {
    expect(await findUpdate()).toBeNull();
  });

  test("com release nova devolve a versão anunciada", async () => {
    t.handlers["plugin:updater|check"] = () => META;

    const u = await findUpdate();

    expect(u?.version).toBe("0.4.0");
  });

  test("falha na verificação (offline) vira null com aviso no console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    t.handlers["plugin:updater|check"] = () => {
      throw new Error("offline");
    };

    expect(await findUpdate()).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("instalar baixa, instala e reinicia o app nessa ordem", async () => {
    t.handlers["plugin:updater|check"] = () => META;
    t.handlers["plugin:updater|download_and_install"] = () => null;
    t.handlers["plugin:process|restart"] = () => null;
    const u = (await findUpdate())!;

    await installUpdate(u);

    const i = t.calls.indexOf("plugin:updater|download_and_install");
    expect(i).toBeGreaterThan(-1);
    expect(t.calls.indexOf("plugin:process|restart")).toBeGreaterThan(i);
  });

  test("erro no download não reinicia", async () => {
    t.handlers["plugin:updater|check"] = () => META;
    t.handlers["plugin:updater|download_and_install"] = () => {
      throw new Error("sem espaço");
    };
    t.handlers["plugin:process|restart"] = () => null;
    const u = (await findUpdate())!;

    await expect(installUpdate(u)).rejects.toThrow();
    expect(t.calls).not.toContain("plugin:process|restart");
  });
});
