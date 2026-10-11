// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../../bounds";
import { getManifold } from "../../manifold";
import type { ManifoldToplevel } from "../../manifold";
import type { ModelCtx } from "../../models/common";
import { scoped } from "../../shape2d";
import { assemblySolids, buildKitTemplate, checkAssembly, kitInstances } from "../index";
import type { KitParams, KitTemplate } from "../types";
import { AVIAO } from "./aviao";
import { HELICOPTERO } from "./helicoptero";
import { KIT_CAR } from "./kitCar";
import { KIT_TRUCK } from "./kitTruck";
import { rocketKit } from "./rocket";
import { tractorKit } from "./tractor";

/*
 * Bateria dos kits desenhados (carro, caminhão, avião, helicóptero, foguete, trator): cada campo do modelo nos dois extremos (ou em cada opção) e os
 * parâmetros comuns nos extremos. Para cada variante: montado sem colisão com todos os pares na folga, e cartão com peças presas por
 * 2+ pontos de corte, tudo ligado, dentro da mesa e sem aviso de parte fina.
 */
let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (): ModelCtx => ({ M, art: null, text });
const solid = (m: { positions: Float32Array; indices: Uint32Array }) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

const variantsOf = (tpl: KitTemplate): [string, KitParams][] => {
  const out: [string, KitParams][] = [["padrão", {}]];
  for (const f of tpl.sections.flatMap((s) => s.fields)) {
    if (f.kind === "num") out.push([`${f.k}=${f.min}`, { [f.k]: f.min }], [`${f.k}=${f.max}`, { [f.k]: f.max }]);
    else if (f.kind === "choice") for (const [v] of f.options) out.push([`${f.k}=${v}`, { [f.k]: v }]);
    else if (f.kind === "bool") out.push([`${f.k}=sim`, { [f.k]: true }], [`${f.k}=não`, { [f.k]: false }]);
  }
  const top = tpl.scaleMax ?? 2;
  out.push(["tamanho mínimo", { scale: 0.5 }], [`tamanho máximo ${top}`, { scale: top }], ["espessura 1,2", { thickness: 1.2 }], ["espessura 2", { thickness: 2 }], ["folga 0,1", { fit: 0.1, pinFit: 0.05 }], ["folga 0,4", { fit: 0.4, pinFit: 0.4, spin: 0.4 }], ["cartão de crédito", { cardSize: "credit" }], ["sem compacto", { compact: false }]);
  return out;
};

/** Achados da bateria no carro e no caminhão (da Forja): ficam como falha esperada até serem corrigidos; ao corrigir, o teste avisa para tirar daqui. */
const KNOWN = new Set<string>([
  "trator|tamanho mínimo|montado", // escala 0,5: parabrisa bate no piso e no teto, capô na grade (Quartzo)
]);
const knownTest = (name: string, label: string, kind: string) => (KNOWN.has(`${name}|${label}|${kind}`) ? test.fails : test);

const TEMPLATES: [string, KitTemplate][] = [["carro", KIT_CAR], ["caminhão", KIT_TRUCK], ["avião", AVIAO], ["helicóptero", HELICOPTERO], ["foguete", rocketKit], ["trator", tractorKit]];

describe("bateria dos kits desenhados", { timeout: 900_000 }, () => {
  for (const [name, tpl] of TEMPLATES)
    describe(name, () => {
      for (const [label, params] of variantsOf(tpl)) {
        knownTest(name, label, "montado")(`${label}: montado sem colisão e pares na folga`, () => {
          scoped((k) => {
            const { insts, build, env } = kitInstances(M, k, tpl, params);
            const rep = checkAssembly(M, k, assemblySolids(M, k, insts, build.assembly), build.pairs ?? [], env.fit);
            expect(rep.collisions, JSON.stringify(rep.collisions)).toEqual([]);
            rep.pairs.forEach((q) => expect(q.ok, `${q.a} × ${q.b} (${q.kind}): folga ${q.gap}`).toBe(true));
          });
        });
        test(`${label}: cartão com peças presas, tudo ligado e dentro da mesa`, () => {
          const o = buildKitTemplate(ctx(), tpl, { ...params, showAssembled: false, title: name });
          o.meta!.gatesPerPiece.forEach((n) => expect(n).toBeGreaterThanOrEqual(2));
          const real = o.models.filter((m) => !m.previewOnly)[0];
          expect(M.Manifold.union(real.parts.map((q) => solid(q.mesh))).decompose().length).toBe(1);
          const b = meshBounds(real.parts.map((q) => q.mesh))!;
          expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(256);
          expect(b.max[1] - b.min[1]).toBeLessThanOrEqual(256);
          expect(o.warnings!.join(" ")).not.toMatch(/mais finas que o bico|menos de 2 pontos/);
        });
      }
    });
});
