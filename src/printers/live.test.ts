// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { setupTauri } from "../test/harness";

const sent: string[] = [];
vi.mock("@tauri-apps/plugin-notification", () => ({ isPermissionGranted: async () => true, requestPermission: async () => "granted", sendNotification: (n: { body: string }) => sent.push(n.body) }));

const { forget, loadLinks, merge, noticeFor, onReport, printersNow, summarize, watch } = await import("./live");
const t = setupTauri();
const PIN = "a".repeat(64);
const LINK = { ip: "192.168.68.59", serial: "03900D611528416", code: "12345678", pin: "", name: "A1" };

// relatório completo como a A1 manda depois do pushall (campos que usamos)
const FULL = {
  gcode_state: "RUNNING", subtask_name: "chaveiro", mc_percent: 45, mc_remaining_time: 83, layer_num: 30, total_layer_num: 120,
  nozzle_temper: 219.6, bed_temper: 60, print_error: 0,
  ams: { ams: [{ id: "0", tray: [{ id: "0", tray_type: "PLA", tray_color: "FF5500FF", remain: 80 }, { id: "1" }, { id: "2", tray_type: "PETG", tray_color: "000000FF", remain: -1 }] }] },
  vt_tray: { tray_type: "", tray_color: "00000000" },
};

beforeEach(() => {
  sent.length = 0;
  t.handlers["printer_watch"] = () => PIN;
  t.handlers["printer_unwatch"] = () => null;
});

describe("impressora ao vivo (#15)", () => {
  test("junta relatórios parciais e resume o que importa", () => {
    const raw = merge(merge({}, FULL), { mc_percent: 46, ams: { tray_now: "0" } });
    expect((raw.ams as { ams: unknown[] }).ams).toHaveLength(1);
    expect(summarize(raw)).toEqual({
      state: "RUNNING", label: "Imprimindo", job: "chaveiro", percent: 46, remainingMin: 83, layer: 30, layers: 120, nozzle: 219.6, bed: 60, error: false,
      trays: [{ hex: "#ff5500", type: "PLA", remain: 80 }, { hex: "#000000", type: "PETG", remain: null }],
    });
    expect(summarize({ gcode_state: "IDLE", mc_percent: 100, subtask_name: "velho" })).toMatchObject({ label: "Parada", percent: null, job: "" });
    expect(summarize({})).toMatchObject({ state: "IDLE", trays: [] });
  });

  test("avisa só quando muda para terminou, erro ou pausa", () => {
    const run = summarize(FULL);
    expect(noticeFor("A1", undefined, run)).toBeNull();
    expect(noticeFor("A1", run, summarize({ ...FULL, gcode_state: "FINISH" }))).toBe("A1 terminou: chaveiro. Pode tirar a peça.");
    expect(noticeFor("A1", run, summarize({ ...FULL, gcode_state: "FAILED" }))).toContain("parou com erro");
    expect(noticeFor("A1", run, summarize({ ...FULL, gcode_state: "PAUSE" }))).toContain("pausou");
    expect(noticeFor("A1", run, run)).toBeNull();
  });

  test("conectar guarda a impressão digital; relatórios atualizam e o fim vira aviso; esquecer apaga", async () => {
    await watch(LINK);
    expect(await loadLinks(t.db)).toEqual([{ ...LINK, pin: PIN }]);
    onReport(LINK.serial, JSON.stringify({ print: FULL }));
    onReport(LINK.serial, "lixo{");
    onReport("OUTRA", JSON.stringify({ print: FULL }));
    expect(printersNow()).toHaveLength(1);
    expect(printersNow()[0].now).toMatchObject({ percent: 45, job: "chaveiro" });
    onReport(LINK.serial, JSON.stringify({ print: { gcode_state: "FINISH" } }));
    await vi.waitFor(() => expect(sent).toEqual(["A1 terminou: chaveiro. Pode tirar a peça."]));
    await forget(LINK.serial);
    expect(printersNow()).toEqual([]);
    expect(await loadLinks(t.db)).toEqual([]);
  });

  test("erro ao conectar fica na impressora e não guarda nada", async () => {
    t.handlers["printer_watch"] = () => {
      throw "Código de acesso errado.";
    };
    await expect(watch(LINK)).rejects.toBe("Código de acesso errado.");
    expect(printersNow()[0]).toMatchObject({ online: false, error: "Código de acesso errado." });
    expect(await loadLinks(t.db)).toEqual([]);
    await forget(LINK.serial);
  });
});
