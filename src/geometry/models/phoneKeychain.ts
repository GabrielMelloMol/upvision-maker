import { scoped } from "../shape2d";
import type { Solid } from "../manifold";
import type { Part } from "../types";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { buildOpener } from "./opener";
import { STAND_CLEARANCE } from "./phoneStand";

export type PhoneKeychainParams = {
  text: string;
  thickness: number; // da placa; a fenda do aparelho precisa de fundo
  deviceThickness: number; // aparelho com a capinha
  angle: number; // inclinação do aparelho em relação à mesa
  relief: number;
  bodyColor: string;
  artColor: string;
};

export const DEFAULT_PHONE_KEYCHAIN: PhoneKeychainParams = { text: "Ana", thickness: 12, deviceThickness: 11, angle: 65, relief: 1, bodyColor: "#1c1c1e", artColor: "#f5c542" };

const FLOOR = 3; // fundo mínimo sob a fenda
const SLOT_X = 8; // centro da fenda no topo, entre a arte e a rampa do abridor de lata (mm a partir do meio da placa)
const MIN_DEPTH = 4; // abaixo disso a fenda não segura a quina do aparelho
const FREE_FROM = -3; // trecho livre entre a arte (termina em −5) e a rampa (começa em 21), com folga
const FREE_TO = 19;

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Chaveiro 3 em 1 (#192): a placa do abridor de lata (rampa e fenda para o anel numa ponta, argola na outra, arte na
 * face) com uma fenda inclinada no meio onde o celular se apoia em pé, escorado para o lado da argola. Reaproveita o
 * abridor e a folga do suporte de celular.
 */
export function buildPhoneKeychain(ctx: ModelCtx, p: PhoneKeychainParams): ModelOutput {
  const open = buildOpener(ctx, { kind: "can", thickness: p.thickness, relief: p.relief, text: p.text, bodyColor: p.bodyColor, artColor: p.artColor });
  const { M } = ctx;
  const width = p.deviceThickness + STAND_CLEARANCE;
  const tilt = rad(90 - p.angle);
  // o canto mais baixo do fundo da fenda (inclinado) fica `FLOOR` acima da mesa; a fenda é medida a partir do centro do fundo
  const bottomZ = FLOOR + (width / 2) * Math.sin(tilt);
  const depth = p.thickness - bottomZ;
  const footprint = width / Math.cos(tilt);
  const warnings: string[] = [];
  if (depth < MIN_DEPTH) warnings.push(`A fenda fica com só ${Math.max(depth, 0).toFixed(1).replace(".", ",")} mm de fundo no centro: aumente a espessura da placa para ${Math.ceil(bottomZ + MIN_DEPTH)} mm ou mais.`);
  if (footprint > FREE_TO - FREE_FROM) warnings.push(`Aparelho grosso demais para a fenda caber entre a arte e a ponta do abridor (cabem até ${Math.floor((FREE_TO - FREE_FROM) * Math.cos(tilt) - STAND_CLEARANCE)} mm com a capinha, nesse ângulo): tire a capinha ou aumente o ângulo.`);
  return scoped((k) => {
    const [body, ...rest] = open.models[0].parts;
    const solid = k(M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: body.mesh.positions, triVerts: body.mesh.indices })));
    // fenda: caixa larga de um lado a outro da placa, inclinada para o lado da argola; o fundo fica `FLOOR` acima da mesa
    const slot: Solid = k(k(k(M.Manifold.cube([width, 60, depth + 20], false)).translate([-width / 2, -30, 0])).rotate([0, -(90 - p.angle), 0]));
    const topShift = depth * Math.tan(tilt); // a fenda recua para o lado da argola ao subir
    const cut = k(slot.translate([SLOT_X + topShift, 0, bottomZ]));
    const carved = k(solid.subtract(cut));
    const parts: Part[] = [{ ...body, mesh: solidMesh(carved) }, ...rest];
    return {
      models: [{ name: "Chaveiro suporte de celular", parts }],
      pauses: open.pauses,
      warnings: [...(open.warnings ?? []), ...warnings, `Apoie o celular na fenda, inclinado ${p.angle}° para o lado da argola. Imprima deitado, como sai no arquivo.`],
    };
  });
}
