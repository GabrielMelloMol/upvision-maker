import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type CS, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { buildOrnamentSpinner, DEFAULT_ORNAMENT_SPINNER as D, type OrnamentSpinnerParams } from "./ornamentSpinner";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const textFn = (s: string, h: number): CS | null => (s.trim() ? M.CrossSection.square([0.5 * h * s.length, h], true) : null);
/** Texto de teste em arco: um bloco que acompanha o raio pedido, em cima do disco. */
const arcFn = (s: string, h: number, r: number): CS | null => (s.trim() ? M.CrossSection.square([0.5 * h * s.length, h], false).translate([-0.25 * h * s.length, r]) : null);
const ctx = (extra: Partial<ModelCtx> = {}): ModelCtx => ({ M, art: null, artLayers: null, text: textFn, arc: arcFn, ...extra });
const build = (p: Partial<OrnamentSpinnerParams> = {}, c: ModelCtx = ctx()) => buildOrnamentSpinner(c, { ...D, ...p });
const part = (out: ReturnType<typeof build>, name: string) => out.models[0].parts.find((x) => x.name === name)?.mesh;
const bounds = (m: NonNullable<ReturnType<typeof part>>) => meshBounds([m])!;

describe("enfeite giratório (#107)", { timeout: 60_000 }, () => {
  test("aro, disco e texto: 3 cores; o disco cabe no aro com a folga pedida", () => {
    const out = build();
    expect(out.models[0].parts.map((x) => x.name)).toEqual(["Aro", "Disco", "Texto"]);
    expect(out.models[0].parts.map((x) => x.color)).toEqual([D.frameColor, D.diskColor, D.artColor]);
    const disk = bounds(part(out, "Disco")!);
    const Ri = D.diameter / 2 - 4; // parede do aro
    expect((disk.max[0] - disk.min[0]) / 2).toBeCloseTo(Ri - D.gap, 1);
    expect(disk.min[2]).toBeCloseTo(0);
    expect(disk.max[2]).toBeCloseTo(D.thickness);
  });

  test("gancho de pendurar em cima, sem argola de chaveiro: o aro passa do diâmetro só pelo olhal", () => {
    const frame = bounds(part(build({ trim: "none" }), "Aro")!);
    expect(frame.max[1]).toBeCloseTo(D.diameter / 2 + 1 + 2 * 4.5, 1); // aro + afastamento + olhal de 4,5 mm de raio
    expect(frame.min[1]).toBeCloseTo(-D.diameter / 2, 1);
  });

  test("enfeites do aro: sem enfeite o aro é menor; estrela, bolinha e sino alargam e pesam mais", () => {
    const base = volume(part(build({ trim: "none" }), "Aro")!);
    for (const trim of ["star", "dot", "bell"] as const) {
      const out = build({ trim });
      expect(volume(part(out, "Aro")!), trim).toBeGreaterThan(base);
      const b = bounds(part(out, "Aro")!);
      expect(b.max[0], trim).toBeGreaterThan(D.diameter / 2);
    }
  });

  test("nenhum enfeite encosta no gancho e a quantidade muda o peso do aro", () => {
    const few = volume(part(build({ trimCount: 4 }), "Aro")!);
    const many = volume(part(build({ trimCount: 12 }), "Aro")!);
    expect(many).toBeGreaterThan(few);
  });

  test("a arte rente na face de baixo: a arte e o furo no disco têm o mesmo volume", () => {
    const art = M.CrossSection.circle(10, 64);
    const withArt = build({ text: "" }, ctx({ art }));
    expect(withArt.models[0].parts.map((x) => x.name)).toEqual(["Aro", "Disco", "Arte"]);
    const a = part(withArt, "Arte")!;
    expect(bounds(a).min[2]).toBeCloseTo(0);
    expect(bounds(a).max[2]).toBeCloseTo(D.inlay);
    const plain = volume(part(build({ text: "" }), "Disco")!);
    expect(plain - volume(part(withArt, "Disco")!)).toBeCloseTo(volume(a), 0);
  });

  test("arte colorida vira uma parte por cor", () => {
    const art = M.CrossSection.circle(10, 64);
    const layers = [{ color: "#ff0000", cs: M.CrossSection.circle(10, 64).subtract(M.CrossSection.circle(5, 64)) }, { color: "#0000ff", cs: M.CrossSection.circle(5, 64) }];
    const out = build({}, ctx({ art, artLayers: layers }));
    expect(out.models[0].parts.filter((x) => x.name.startsWith("Arte")).map((x) => x.color)).toEqual(["#ff0000", "#0000ff"]);
  });

  test("sem fonte em arco usa o texto reto; texto vazio e sem arte deixa só aro e disco", () => {
    expect(build({}, ctx({ arc: undefined })).models[0].parts.map((x) => x.name)).toContain("Texto");
    expect(build({ text: " " }).models[0].parts.map((x) => x.name)).toEqual(["Aro", "Disco"]);
  });

  test("avisa a face para baixo e enfeite grande demais", () => {
    expect(build().warnings?.join(" ")).toMatch(/face da arte para baixo/);
    expect(build({ trimSize: 12 }).warnings?.join(" ")).toMatch(/Enfeites grandes/);
    expect(build({ trimSize: 7 }).warnings?.join(" ")).not.toMatch(/Enfeites grandes/);
  });
});
