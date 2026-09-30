// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import type { Model } from "../geometry/types";
import { renderWithApp, setupTauri } from "../test/harness";
import ExportButtons from "./ExportButtons";

const t = setupTauri();
const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
const model = (name: string): Model => ({ name, parts: [{ name, color: "#000000", mesh }] });

test("vários objetos: um STL por objeto com o nome no arquivo; 3MF junta tudo", async () => {
  const user = userEvent.setup();
  renderWithApp(<ExportButtons models={[model("Cortador"), model("Carimbo")]} name="Coração Grande" />);
  await user.click(screen.getByRole("button", { name: "STL carimbo" }));
  await waitFor(() => expect(t.files.has("/saida/coracao-grande-carimbo.stl")).toBe(true));
  expect(t.files.get("/saida/coracao-grande-carimbo.stl")!.byteLength).toBe(84 + 50);
  await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
  expect(await screen.findByText("Arquivo salvo em /saida/coracao-grande.3mf")).toBeInTheDocument();
});

test("sem modelos ou ocupado: desabilitado", () => {
  const { rerender } = renderWithApp(<ExportButtons models={[]} name="x" />);
  expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeDisabled();
  rerender(<ExportButtons models={[model("A")]} name="x" busy />);
  expect(screen.getByRole("button", { name: /Salvar STL/ })).toBeDisabled();
});

test("falha ao gravar vira toast de erro", async () => {
  t.handlers["plugin:fs|write_file"] = () => {
    throw new Error("disco cheio");
  };
  const user = userEvent.setup();
  renderWithApp(<ExportButtons models={[model("A")]} name="x" />);
  await user.click(screen.getByRole("button", { name: /Salvar STL/ }));
  expect(await screen.findByText(/Não foi possível salvar: .*disco cheio/)).toBeInTheDocument();
});

test("com pausa: botão do Bambu Studio gera o projeto pelo CLI e troca as cores dos filamentos", async () => {
  const { strFromU8, strToU8, unzipSync, zipSync } = await import("fflate");
  let args: Record<string, unknown> = {};
  t.handlers["bambu_project"] = (a) => {
    args = a as Record<string, unknown>;
    return Array.from(zipSync({ "Metadata/project_settings.config": strToU8(JSON.stringify({ filament_colour: ["#00AE42"], printer_settings_id: "Bambu Lab A1 0.4 nozzle" })) }));
  };
  const user = userEvent.setup();
  const two: Model = { name: "NFC", parts: [{ name: "Base", color: "#ffffff", mesh }, { name: "Texto", color: "#2563eb", mesh }] };
  renderWithApp(<ExportButtons models={[two]} name="Chaveiro NFC" pauses={[2]} />);
  expect(screen.getByRole("button", { name: /Salvar 3MF \(Orca \/ Prusa\)/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Projeto do Bambu Studio/ }));
  expect(await screen.findByText("Arquivo salvo em /saida/chaveiro-nfc-bambu.3mf")).toBeInTheDocument();
  expect(args.pauses).toEqual([2]);
  expect(args.filaments).toBe(2);
  // o 3MF enviado ao CLI já leva a pausa
  expect(unzipSync(Uint8Array.from(args.model as number[]))["Metadata/custom_gcode_per_layer.xml"]).toBeDefined();
  const cfg = JSON.parse(strFromU8(unzipSync(t.files.get("/saida/chaveiro-nfc-bambu.3mf")!)["Metadata/project_settings.config"]));
  expect(cfg.filament_colour).toEqual(["#FFFFFF", "#2563EB"]);
  expect(cfg.printer_settings_id).toBe("Bambu Lab A1 0.4 nozzle");
});

test("Bambu Studio não instalado: erro do comando vira toast", async () => {
  t.handlers["bambu_project"] = () => {
    throw "Bambu Studio não encontrado. Instale-o ou abra o 3MF no OrcaSlicer, que já lê a pausa.";
  };
  const user = userEvent.setup();
  renderWithApp(<ExportButtons models={[model("A")]} name="x" pauses={[2]} />);
  await user.click(screen.getByRole("button", { name: /Projeto do Bambu Studio/ }));
  expect(await screen.findByText(/Bambu Studio não encontrado/)).toBeInTheDocument();
});

test("sem pausa não aparece o botão do Bambu Studio", () => {
  renderWithApp(<ExportButtons models={[model("A")]} name="x" />);
  expect(screen.queryByRole("button", { name: /Projeto do Bambu Studio/ })).not.toBeInTheDocument();
});

describe("como vai imprimir", () => {
  const stacked = (z0: number, z1: number, x = 0) => ({ positions: new Float32Array([x, 0, z0, x + 1, 0, z0, x, 1, z1]), indices: new Uint32Array([0, 1, 2]) });
  const two: Model = { name: "Placa", parts: [{ name: "Base", color: "#000000", mesh: stacked(0, 2) }, { name: "Texto", color: "#ffffff", mesh: stacked(2, 3) }] };
  const side: Model = { name: "Placa", parts: [{ name: "A", color: "#000000", mesh: stacked(0, 2) }, { name: "B", color: "#ffffff", mesh: stacked(0, 2, 5) }] };
  const extruders = (f: Uint8Array) => new Set([...strFromU8(unzipSync(f)["Metadata/model_settings.config"]).matchAll(/key="extruder" value="(\d)"/g)].map((m) => m[1]));

  test("1 cor só aparece com 2+ cores; troca manual vira pausas e 1 filamento, com o projeto do Bambu", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithApp(<ExportButtons models={[model("A")]} name="x" />);
    expect(screen.queryByRole("group", { name: "Como vai imprimir" })).not.toBeInTheDocument();
    rerender(<ExportButtons models={[two]} name="placa" />);
    await user.click(screen.getByRole("button", { name: "Trocando o filamento" }));
    expect(screen.getByText(/Z = 2,20 mm: a impressora pausa, troque para/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Projeto do Bambu Studio/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/placa.3mf")).toBe(true));
    const f = t.files.get("/saida/placa.3mf")!;
    expect(extruders(f)).toEqual(new Set(["1"]));
    expect(strFromU8(unzipSync(f)["Metadata/custom_gcode_per_layer.xml"])).toContain('top_z="2.2"');
  });

  test("troca manual com cores lado a lado: aviso e salvar bloqueado; 1 cor salva num filamento", async () => {
    const user = userEvent.setup();
    renderWithApp(<ExportButtons models={[side]} name="lado" />);
    await user.click(screen.getByRole("button", { name: "Trocando o filamento" }));
    expect(screen.getByText(/cores lado a lado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "1 cor" }));
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/lado.3mf")).toBe(true));
    expect(extruders(t.files.get("/saida/lado.3mf")!)).toEqual(new Set(["1"]));
  });
});

test("com configuração recomendada: mostra na tela e grava por objeto no 3MF (#86)", async () => {
  const user = userEvent.setup();
  renderWithApp(<ExportButtons models={[model("Abridor")]} name="abridor" profile={{ layerHeight: 0.2, walls: 4, infill: 40, support: false, notes: ["Faz força."] }} />);
  expect(screen.getByLabelText("Configuração recomendada")).toHaveTextContent("Imprima com: camada 0,2 mm · 4 paredes · 40% de preenchimento · sem suporte");
  expect(screen.getByText("Faz força.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
  await waitFor(() => expect(t.files.has("/saida/abridor.3mf")).toBe(true));
  const cfg = strFromU8(unzipSync(t.files.get("/saida/abridor.3mf")!)["Metadata/model_settings.config"]);
  expect(cfg).toContain('<metadata key="wall_loops" value="4"/>');
  expect(cfg).toContain('<metadata key="sparse_infill_density" value="40%"/>');
});
