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
    t.handlers["bambu_project"] = (a, h) => {
      expect(a).toBeInstanceOf(Uint8Array); // o 3MF vai como bytes crus, não como lista de números (M21)
      projectArgs = { pauses: JSON.parse(h!["x-pauses"]), filaments: Number(h!["x-filaments"]) };
      return zipSync({ "Metadata/project_settings.config": strToU8(JSON.stringify({ filament_colour: ["#00AE42"] })) });
    };
    t.handlers["open_in_slicer"] = (a, h) => {
      expect(a).toBeInstanceOf(Uint8Array);
      opened = { model: a, name: decodeURIComponent(h!["x-name"]), slicer: h!["x-slicer"] };
      return "/dados/abrir-no-fatiador/Chaveiro.3mf";
    };
    const r = await openInSlicer([model("#ffffff", "#2563eb")], "Chaveiro", { pauses: [2] });
    expect(r).toMatchObject({ path: "/dados/abrir-no-fatiador/Chaveiro.3mf", slicer: BAMBU, project: true });
    expect(opened).toMatchObject({ name: "Chaveiro", slicer: "bambu" });
    expect(projectArgs.pauses).toEqual([2]);
    const cfg = JSON.parse(strFromU8(unzipSync(opened.model as Uint8Array)["Metadata/project_settings.config"]));
    expect(cfg.filament_colour).toEqual(["#FFFFFF", "#2563EB"]);
  });

  test("Bambu Studio sem BambuStudio.conf legível: o projeto sai com a impressora padrão e o resultado avisa (B13)", async () => {
    t.handlers["slicers_installed"] = () => [BAMBU];
    t.handlers["bambu_project"] = () => zipSync({ "Metadata/project_settings.config": strToU8("{}") });
    t.handlers["bambu_presets_found"] = () => false;
    t.handlers["open_in_slicer"] = () => "/dados/abrir-no-fatiador/Chaveiro.3mf";
    expect(await openInSlicer([model("#ffffff")], "Chaveiro")).toMatchObject({ project: true, defaultPresets: true });
    t.handlers["bambu_presets_found"] = () => true;
    expect(await openInSlicer([model("#ffffff")], "Chaveiro")).toMatchObject({ project: true, defaultPresets: false });
  });

  test("OrcaSlicer escolhido em Ajustes: abre o 3MF com as configurações por objeto, sem passar pelo CLI do Bambu", async () => {
    await saveSettings(t.db, { ...DEFAULT_SETTINGS, slicer: "orca" });
    let opened: Record<string, unknown> = {};
    t.handlers["slicers_installed"] = () => [BAMBU, ORCA];
    t.handlers["bambu_project"] = () => {
      throw new Error("não devia chamar o CLI do Bambu");
    };
    t.handlers["open_in_slicer"] = (a, h) => {
      opened = { model: a, name: decodeURIComponent(h!["x-name"]), slicer: h!["x-slicer"] };
      return "/dados/x.3mf";
    };
    const r = await openInSlicer([model("#ffffff")], "Placa", { profile: { layerHeight: 0.12, walls: 4 } });
    expect(r.slicer).toBe(ORCA);
    expect(r.project).toBe(false);
    const files = unzipSync(opened.model as Uint8Array);
    expect(strFromU8(files["Metadata/model_settings.config"])).toContain('<metadata key="layer_height" value="0.12"/>');
  });

  test("nome com acento e emoji chega inteiro ao Rust pelo cabeçalho (M21)", async () => {
    t.handlers["slicers_installed"] = () => [ORCA];
    let name = "";
    t.handlers["open_in_slicer"] = (_a, h) => {
      name = decodeURIComponent(h!["x-name"]);
      expect(h!["x-name"]).toMatch(/^[\x20-\x7e]*$/); // cabeçalho só aceita ASCII: vai codificado
      return "/dados/x.3mf";
    };
    await openInSlicer([model("#ffffff")], "Chaveiro açaí 😀 / Ana");
    expect(name).toBe("Chaveiro açaí 😀 / Ana");
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
