// @vitest-environment happy-dom
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { saveSettings } from "../db/repo";
import { DEFAULT_SETTINGS } from "../domain/settings";
import type { Model } from "../geometry/types";
import { setupTauri } from "../test/harness";
import { openInSlicer, OpenSlicerError, pickSlicer, type InstalledSlicer } from "./openInSlicer";

const t = setupTauri();
const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
const model = (...colors: string[]): Model => ({ name: "Placa", parts: colors.map((color, i) => ({ name: `P${i}`, color, mesh })) });
const BAMBU: InstalledSlicer = { id: "bambu", name: "Bambu Studio", path: "/Applications/BambuStudio.app" };
const ORCA: InstalledSlicer = { id: "orca", name: "OrcaSlicer", path: "/Applications/OrcaSlicer.app" };
const PRUSA: InstalledSlicer = { id: "prusa", name: "PrusaSlicer", path: "/Applications/PrusaSlicer.app" };

describe("abrir no fatiador (#160)", () => {
  test("escolha: o de Ajustes se estiver instalado; senão Bambu, Orca, Prusa nessa ordem", () => {
    expect(pickSlicer([PRUSA, ORCA], null)).toBe(ORCA);
    expect(pickSlicer([PRUSA, ORCA, BAMBU], "prusa")).toBe(PRUSA);
    expect(pickSlicer([ORCA], "bambu")).toBe(ORCA);
    expect(pickSlicer([], null)).toBeNull();
  });

  test("Bambu Studio: abre o projeto (presets, cores dos slots do AMS e pausas) pelo comando do app", async () => {
    let opened: Record<string, unknown> = {};
    let projectArgs: Record<string, unknown> = {};
    t.handlers["slicers_installed"] = () => [ORCA, BAMBU];
    t.handlers["bambu_project"] = (a) => {
      projectArgs = a as Record<string, unknown>;
      return Array.from(zipSync({ "Metadata/project_settings.config": strToU8(JSON.stringify({ filament_colour: ["#00AE42"] })) }));
    };
    t.handlers["open_in_slicer"] = (a) => {
      opened = a as Record<string, unknown>;
      return "/dados/abrir-no-fatiador/Chaveiro.3mf";
    };
    const r = await openInSlicer([model("#ffffff", "#2563eb")], "Chaveiro", { pauses: [2] });
    expect(r).toMatchObject({ path: "/dados/abrir-no-fatiador/Chaveiro.3mf", slicer: BAMBU, project: true });
    expect(opened).toMatchObject({ name: "Chaveiro", slicer: "bambu" });
    expect(projectArgs.pauses).toEqual([2]);
    const cfg = JSON.parse(strFromU8(unzipSync(Uint8Array.from(opened.model as number[]))["Metadata/project_settings.config"]));
    expect(cfg.filament_colour).toEqual(["#FFFFFF", "#2563EB"]);
  });

  test("OrcaSlicer escolhido em Ajustes: abre o 3MF com as configurações por objeto, sem passar pelo CLI do Bambu", async () => {
    await saveSettings(t.db, { ...DEFAULT_SETTINGS, slicer: "orca" });
    let opened: Record<string, unknown> = {};
    t.handlers["slicers_installed"] = () => [BAMBU, ORCA];
    t.handlers["bambu_project"] = () => {
      throw new Error("não devia chamar o CLI do Bambu");
    };
    t.handlers["open_in_slicer"] = (a) => {
      opened = a as Record<string, unknown>;
      return "/dados/x.3mf";
    };
    const r = await openInSlicer([model("#ffffff")], "Placa", { profile: { layerHeight: 0.12, walls: 4 } });
    expect(r.slicer).toBe(ORCA);
    expect(r.project).toBe(false);
    const files = unzipSync(Uint8Array.from(opened.model as number[]));
    expect(strFromU8(files["Metadata/model_settings.config"])).toContain('<metadata key="layer_height" value="0.12"/>');
  });

  test("CLI do Bambu falhou: abre o 3MF mesmo assim", async () => {
    t.handlers["slicers_installed"] = () => [BAMBU];
    t.handlers["bambu_project"] = () => {
      throw new Error("Bambu Studio não gerou o projeto");
    };
    t.handlers["open_in_slicer"] = () => "/dados/x.3mf";
    expect((await openInSlicer([model("#ffffff")], "Placa")).project).toBe(false);
  });

  test("sem fatiador instalado: erro claro (a tela mostra os links para baixar)", async () => {
    t.handlers["slicers_installed"] = () => [];
    await expect(openInSlicer([model("#ffffff")], "Placa")).rejects.toThrow(OpenSlicerError);
    await expect(openInSlicer([model("#ffffff")], "Placa")).rejects.toThrow(/Nenhum fatiador encontrado/);
  });
});
