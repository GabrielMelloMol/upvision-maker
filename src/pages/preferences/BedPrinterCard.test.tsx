// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { loadSettings } from "../../db/repo";
import { bedHeight, bedMm, setBed } from "../../geometry/bed";
import type { Model } from "../../geometry/types";
import { renderWithApp, setupTauri } from "../../test/harness";
import { bedWarnings } from "../../tools/models/bedCheck";
import { refreshBed } from "../../tools/bedPrinter";
import BedPrinterCard from "./BedPrinterCard";

const t = setupTauri();
afterEach(() => setBed(null));

/** Caixa w × d × h mm (só os cantos: o aviso olha a caixa envolvente). */
const box = (w: number, d: number, h: number): Model => ({
  name: "Peça",
  parts: [{ name: "Peça", color: "#fff", mesh: { positions: new Float32Array([0, 0, 0, w, d, h]), indices: new Uint32Array([0, 1, 1]) } }],
});

describe("mesa pela impressora escolhida (#119)", () => {
  test("A1 mini (180 mm): peça de 200 mm avisa com o tamanho certo; na A1 não", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Bambu Lab A1 mini', 80)");
    await refreshBed(t.db);
    expect(bedMm()).toBe(180);
    expect(bedWarnings([box(200, 100, 20)], [])).toEqual(['"Peça" tem 200 × 100 × 20 mm e passa da mesa de 180 mm: diminua o tamanho.']);
    expect(bedWarnings([box(170, 100, 190)], [])[0]).toMatch(/passa da altura de 180 mm/);
    await t.db.execute("UPDATE printers SET name = 'Bambu Lab A1'");
    await refreshBed(t.db);
    expect(bedWarnings([box(200, 100, 20)], [])).toEqual([]);
  });

  test("com duas impressoras, escolher nas Preferências grava e muda a mesa das ferramentas", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Bambu Lab A1', 95), ('Bambu Lab A1 mini', 80)");
    const user = userEvent.setup();
    renderWithApp(<BedPrinterCard />);
    expect(await screen.findByText(/256 × 256 × 256 mm \(Bambu Lab A1\)/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Tamanho da mesa pela impressora"), "Bambu Lab A1 mini");
    expect(await screen.findByText(/180 × 180 × 180 mm \(Bambu Lab A1 mini\)/)).toBeInTheDocument();
    await waitFor(() => expect(bedMm()).toBe(180));
    expect(bedHeight()).toBe(180);
    expect((await loadSettings(t.db)).bedPrinterId).toBe(2);
  });

  test("impressora fora do catálogo: avisa e usa 256 mm", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Minha caseira', 120)");
    renderWithApp(<BedPrinterCard />);
    expect(await screen.findByText(/"Minha caseira" não está no catálogo/)).toBeInTheDocument();
    await refreshBed(t.db);
    expect(bedMm()).toBe(256);
  });
});
