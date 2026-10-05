// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { exportBackup } from "../db/backup";
import { SCHEMA_VERSION } from "../db/migrations";
import { setSecret } from "../db/repo";
import { renderWithApp, setupTauri } from "../test/harness";
import { dataHash, session, setSyncEnabled } from "./sync";
import SyncBanner from "./SyncBanner";
import SyncSettingsCard from "./SyncSettingsCard";

const t = setupTauri();
const DIR = "C:/Users/ana/OneDrive/UpVision";
const folder = () => t.autoBackups.get(DIR);
const printers = async () => (await t.db.select<{ name: string }>("SELECT name FROM printers ORDER BY id")).map((p) => p.name);
const recent = () => new Date(Date.now() - 30_000).toISOString();

async function otherComputerSaves(name: string, schemaVersion?: number) {
  const b = { ...(await exportBackup(t.db)), ...(schemaVersion ? { schemaVersion } : {}) };
  const tables = { ...b.tables, printers: [{ ...b.tables.printers[0], name }] };
  const sync = { device: "outro", deviceName: "NOTE-ANA", savedAt: recent(), hash: await dataHash({ ...b, tables }) };
  t.autoBackups.set(DIR, new Map([...(folder() ?? []), ["upvision-sync.json", JSON.stringify({ ...b, tables, sync })]]));
}

beforeEach(async () => {
  session.active = true;
  await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Bambu A1', 100)");
});
afterEach(() => vi.unstubAllGlobals());

describe("Dois computadores (#16)", () => {
  test("na pasta padrão a chave fica desligada e 'Escolher pasta…' abre o seletor do backup", async () => {
    const onChooseDir = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<SyncSettingsCard dir="" onChooseDir={onChooseDir} />);
    const toggle = await screen.findByRole("switch", { name: /Sincronizar com outro computador/ });
    await waitFor(() => expect(toggle).toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Escolher pasta…" }));
    expect(onChooseDir).toHaveBeenCalled();
  });

  test("ligar com a pasta vazia envia os dados daqui e mostra a última sincronização; desligar solta a trava", async () => {
    await setSecret(t.db, "backup_dir", DIR);
    const user = userEvent.setup();
    renderWithApp(<SyncSettingsCard dir={DIR} onChooseDir={() => {}} />);
    const toggle = await screen.findByRole("switch", { name: /Sincronizar com outro computador/ });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    expect(await screen.findByText(/Última sincronização: hoje/)).toBeInTheDocument();
    expect(JSON.parse(folder()!.get("upvision-sync.json")!).sync.deviceName).toBe("ESTE-PC");
    expect(folder()!.has("upvision-sync.lock")).toBe(true);
    await user.click(toggle);
    await waitFor(() => expect(folder()!.has("upvision-sync.lock")).toBe(false));
  });

  test("a pasta já tem dados do outro computador: pergunta e traz os de lá", async () => {
    await setSecret(t.db, "backup_dir", DIR);
    await otherComputerSaves("Ender 3");
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const user = userEvent.setup();
    renderWithApp(<SyncSettingsCard dir={DIR} onChooseDir={() => {}} />);
    const toggle = await screen.findByRole("switch", { name: /Sincronizar com outro computador/ });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(await printers()).toEqual(["Ender 3"]);
  });

  test("…ou mantém os daqui, e os de lá viram cópia de conflito", async () => {
    await setSecret(t.db, "backup_dir", DIR);
    await otherComputerSaves("Ender 3");
    t.askAnswer = false;
    const user = userEvent.setup();
    renderWithApp(<SyncSettingsCard dir={DIR} onChooseDir={() => {}} />);
    const toggle = await screen.findByRole("switch", { name: /Sincronizar com outro computador/ });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    await waitFor(() => expect([...folder()!.keys()].some((k) => k.startsWith("upvision-conflito-"))).toBe(true));
    expect(await printers()).toEqual(["Bambu A1"]);
  });
});

describe("faixa da sincronização (#16)", () => {
  beforeEach(async () => {
    await setSecret(t.db, "backup_dir", DIR);
    await setSyncEnabled(t.db, true);
  });

  test("em uso no outro computador: avisa; Assumir pega a trava", async () => {
    t.autoBackups.set(DIR, new Map([["upvision-sync.lock", JSON.stringify({ device: "outro", deviceName: "NOTE-ANA", since: recent(), heartbeat: recent() })]]));
    const user = userEvent.setup();
    renderWithApp(<SyncBanner onImported={() => {}} onOpenBackups={() => {}} />);
    expect(await screen.findByText(/Em uso no computador NOTE-ANA desde hoje/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Assumir" }));
    await waitFor(() => expect(JSON.parse(folder()!.get("upvision-sync.lock")!).deviceName).toBe("ESTE-PC"));
    expect(screen.queryByText(/Em uso no computador/)).not.toBeInTheDocument();
  });

  test("Continuar sem sincronizar some com a faixa e para de sincronizar nesta sessão", async () => {
    t.autoBackups.set(DIR, new Map([["upvision-sync.lock", JSON.stringify({ device: "outro", deviceName: "NOTE-ANA", since: recent(), heartbeat: recent() })]]));
    const user = userEvent.setup();
    renderWithApp(<SyncBanner onImported={() => {}} onOpenBackups={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Continuar sem sincronizar" }));
    expect(screen.queryByText(/Em uso no computador/)).not.toBeInTheDocument();
    expect(session.active).toBe(false);
  });

  test("conflito: avisa e leva para Restaurar backup", async () => {
    await setSecret(t.db, "sync_local_hash", "antigo");
    await setSecret(t.db, "sync_remote_hash", "antigo");
    await otherComputerSaves("Ender 3");
    const onOpenBackups = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<SyncBanner onImported={() => {}} onOpenBackups={onOpenBackups} />);
    expect(await screen.findByText(/Os dois computadores mudaram os dados/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver em Restaurar backup" }));
    expect(onOpenBackups).toHaveBeenCalled();
  });

  test("o outro computador está numa versão mais nova: avisa para atualizar este e Ok esconde o aviso (C2)", async () => {
    // Arrange
    await setSecret(t.db, "sync_local_hash", "antigo");
    await setSecret(t.db, "sync_remote_hash", "antigo");
    await otherComputerSaves("Ender 3", SCHEMA_VERSION + 1);
    const user = userEvent.setup();

    // Act
    renderWithApp(<SyncBanner onImported={() => {}} onOpenBackups={() => {}} />);

    // Assert
    expect(await screen.findByText(/NOTE-ANA está com uma versão mais nova do app/)).toBeInTheDocument();
    expect(await printers()).toEqual(["Bambu A1"]);
    await user.click(screen.getByRole("button", { name: "Ok" }));
    expect(screen.queryByText(/versão mais nova/)).not.toBeInTheDocument();
  });

  test("o outro computador salvou e este não mudou: traz e remonta a página", async () => {
    const b = await exportBackup(t.db);
    const mine = await dataHash(b);
    await setSecret(t.db, "sync_local_hash", mine);
    await setSecret(t.db, "sync_remote_hash", mine);
    await otherComputerSaves("Ender 3");
    const onImported = vi.fn();
    renderWithApp(<SyncBanner onImported={onImported} onOpenBackups={() => {}} />);
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(await screen.findByText(/Dados atualizados com o que NOTE-ANA salvou/)).toBeInTheDocument();
    expect(await printers()).toEqual(["Ender 3"]);
  });
});
