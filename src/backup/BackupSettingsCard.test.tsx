// @vitest-environment happy-dom
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { setSecret } from "../db/repo";
import { renderWithApp, setupTauri } from "../test/harness";
import { ToastProvider } from "../ui/Toast";
import BackupSettingsCard, { backupLabel, BACKUP_DONE_EVENT } from "./BackupSettingsCard";
import { useAutoBackup } from "./useAutoBackup";

const t = setupTauri();
const folder = (dir = "") => [...(t.autoBackups.get(dir)?.keys() ?? [])];

describe("BackupSettingsCard", () => {
  test("mostra a pasta padrão, faz backup agora e lista com data legível", async () => {
    const user = userEvent.setup();
    renderWithApp(<BackupSettingsCard />);
    expect(await screen.findByText("/dados-app/backups/auto")).toBeInTheDocument();
    expect(await screen.findByText("Nenhum backup automático nesta pasta ainda.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fazer backup agora" }));
    await waitFor(() => expect(folder()).toHaveLength(1));
    const [name] = folder();
    expect(JSON.parse(t.autoBackups.get("")!.get(name)!).app).toBe("upvision-maker");
    expect(await screen.findByText(backupLabel(name))).toBeInTheDocument();
    expect(await t.db.select("SELECT key FROM secrets WHERE key = 'backup_last_at'")).toHaveLength(1);
  });

  test("escolher pasta, desligar e mudar quantos dias manter grava a configuração", async () => {
    t.openPath = "C:/Users/ana/OneDrive/UpVision";
    const user = userEvent.setup();
    renderWithApp(<BackupSettingsCard />);
    await user.click(within(screen.getByRole("region", { name: /Backup automático/ })).getByRole("button", { name: /Escolher pasta/ }));
    expect(await screen.findByText("C:/Users/ana/OneDrive/UpVision")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: /Fazer backup sozinho/ }));
    const keep = screen.getByLabelText(/Manter os últimos/);
    await user.clear(keep);
    await user.type(keep, "30");
    await waitFor(async () =>
      expect(Object.fromEntries((await t.db.select<{ key: string; value: string }>("SELECT key, value FROM secrets WHERE key LIKE 'backup_%'")).map((r) => [r.key, r.value]))).toMatchObject({
        backup_dir: "C:/Users/ana/OneDrive/UpVision",
        backup_enabled: "0",
        backup_keep: "30",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Usar a padrão" }));
    expect(await screen.findByText("/dados-app/backups/auto")).toBeInTheDocument();
  });

  test("restaurar pede confirmação com verbo e só restaura se confirmar", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Antiga', 100)");
    const user = userEvent.setup();
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    renderWithApp(<BackupSettingsCard />);
    await user.click(await screen.findByRole("button", { name: "Fazer backup agora" }));
    await t.db.execute("DELETE FROM printers");
    t.askAnswer = false;
    const list = await screen.findByRole("list");
    await user.click(within(list).getByRole("button", { name: /Restaurar/ }));
    expect(await t.db.select("SELECT name FROM printers")).toEqual([]);
    t.askAnswer = true;
    await user.click(within(list).getByRole("button", { name: /Restaurar/ }));
    await waitFor(async () => expect(await t.db.select("SELECT name FROM printers")).toEqual([{ name: "Antiga" }]));
    expect(reload).toHaveBeenCalled();
    expect([...(t.autoBackups.get("") ?? new Map()).keys()].some((k) => k.startsWith("upvision-antes-"))).toBe(true);
    vi.unstubAllGlobals();
  });

  test("erro ao gravar o backup vira aviso", async () => {
    t.handlers.backup_write = () => {
      throw new Error("pasta sem permissão");
    };
    const user = userEvent.setup();
    renderWithApp(<BackupSettingsCard />);
    await user.click(await screen.findByRole("button", { name: "Fazer backup agora" }));
    expect(await screen.findByText(/Não foi possível fazer o backup: pasta sem permissão/)).toBeInTheDocument();
  });

  test("backupLabel", () => {
    expect(backupLabel("upvision-auto-2026-09-28-153000.json")).toBe("28/09/2026 às 15:30");
    expect(backupLabel("upvision-antes-2026-10-05-101500.json")).toBe("05/10/2026 às 10:15 · cópia de antes de restaurar"); // B2
    expect(backupLabel("outro.json")).toBe("outro.json");
  });
});

describe("useAutoBackup", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <ToastProvider>{children}</ToastProvider>;

  test("na abertura faz o backup do dia (nunca feito) e não pede lembrete", async () => {
    const { result } = renderHook(() => useAutoBackup(), { wrapper });
    await waitFor(() => expect(folder()).toHaveLength(1));
    await waitFor(() => expect(result.current.reminderDays).toBeNull());
  });

  test("desligado e sem backup há 9 dias: lembrete com os dias; 'fazer agora' zera", async () => {
    await setSecret(t.db, "backup_enabled", "0");
    await setSecret(t.db, "backup_last_at", new Date(Date.now() - 9 * 86_400_000).toISOString());
    const { result } = renderHook(() => useAutoBackup(), { wrapper });
    await waitFor(() => expect(result.current.reminderDays).toBe(9));
    expect(folder()).toHaveLength(0); // desligado: não fez sozinho
    await act(() => result.current.backupNow());
    await waitFor(() => expect(result.current.reminderDays).toBeNull());
  });

  test("backup feito em outra tela (evento) atualiza o lembrete", async () => {
    await setSecret(t.db, "backup_enabled", "0");
    const { result } = renderHook(() => useAutoBackup(), { wrapper });
    await waitFor(() => expect(result.current.neverBackedUp).toBe(true));
    await setSecret(t.db, "backup_last_at", new Date().toISOString());
    act(() => void window.dispatchEvent(new Event(BACKUP_DONE_EVENT)));
    await waitFor(() => expect(result.current.reminderDays).toBeNull());
  });

  test("ao fechar a janela faz o backup (substitui o do dia)", async () => {
    let onClose: ((e: unknown) => Promise<void>) | undefined;
    t.handlers["plugin:event|listen"] = (a) => {
      if (String(a.event) === "tauri://close-requested") onClose = async (e) => (window as unknown as Record<string, (e: unknown) => Promise<void>>)[`_${a.handler}`]?.(e);
      return 1;
    };
    renderHook(() => useAutoBackup(), { wrapper });
    await waitFor(() => expect(folder()).toHaveLength(1));
    expect(onClose).toBeDefined();
  });
});
