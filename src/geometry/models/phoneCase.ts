import { bedMm } from "../bed";
import type { CS, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { roundedRect, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type PhoneCaseParams = {
  phoneL: number;
  phoneW: number;
  phoneT: number;
  /** Raio dos cantos do aparelho. */
  cornerR: number;
  /** Folga em volta do aparelho: TPU estica, então é pequena. */
  clearance: number;
  wall: number;
  floor: number;
  /** Quanto a borda da capa cobre a frente do aparelho. */
  lip: number;
  /** Câmera (recorte nas costas), a partir do canto de cima à esquerda visto de trás: x, y, largura, altura, raio. */
  camX: number;
  camY: number;
  camW: number;
  camH: number;
  camR: number;
  /** Recortes dos botões nos lados: "lado, posição, comprimento" (lado: esquerda ou direita; posição: do topo, mm), um por linha. */
  buttons: string;
  pattern: "smooth" | "hex" | "cross";
  name: string;
  /** "test": só um trecho de 25 mm do canto inferior para experimentar no aparelho. */
  print: "case" | "test";
  color: string;
};

export const DEFAULT_PHONE_CASE: PhoneCaseParams = {
  phoneL: 147.6,
  phoneW: 71.6,
  phoneT: 7.8,
  cornerR: 11,
  clearance: 0.15,
  wall: 1.6,
  floor: 1.4,
  lip: 1.6,
  camX: 4,
  camY: 4,
  camW: 34,
  camH: 34,
  camR: 9,
  buttons: "direita, 40, 22\nesquerda, 28, 28",
  pattern: "hex",
  name: "",
  print: "case",
  color: "#111827",
};

const GROOVE_W = 0.8, GROOVE_D = 0.6;
const HEX_R = 7; // raio de cada hexágono do padrão
const LIP_STEPS = 4;
const TEST_LEN = 25;
const num = (s: string) => Number(s.trim().replace(",", "."));

export type ButtonCut = { side: "left" | "right"; pos: number; len: number };
/** "lado, posição, comprimento" por linha; lado em português ou inglês. */
export function parseButtons(s: string): { cuts: ButtonCut[]; bad: string[] } {
  const cuts: ButtonCut[] = [], bad: string[] = [];
  for (const line of s.split(/\n|;/).map((t) => t.trim()).filter(Boolean)) {
    const [side, pos, len] = line.split(",").map((t) => t.trim());
    const sd = ({ esquerda: "left", direita: "right", left: "left", right: "right" } as const)[side?.toLowerCase() as "left"];
    if (sd && Number.isFinite(num(pos ?? "")) && Number.isFinite(num(len ?? "")) && num(len) > 0 && num(pos) >= 0) cuts.push({ side: sd, pos: num(pos), len: num(len) });
    else bad.push(line);
  }
  return { cuts, bad };
}

/**
 * Capa de celular em TPU (#232): bolso do tamanho do aparelho (+ folga), fundo, laterais e uma borda que cobre a frente, com
 * recorte da câmera, dos botões, desenho nas costas e nome. Sai de costas para a mesa. Ela só encaixa se as medidas forem as do
 * seu aparelho: o app traz a peça de teste e avisa para conferir antes de imprimir a capa inteira.
 */
export function buildPhoneCase(ctx: ModelCtx, p: PhoneCaseParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const { cuts, bad } = parseButtons(p.buttons);
    if (bad.length) warnings.push(`Recorte de botão ignorado (use "lado, posição, comprimento"): ${bad.join(" | ")}`);
    const test = p.print === "test";
    const pl = p.phoneL + 2 * p.clearance, pw = p.phoneW + 2 * p.clearance;
    const R = p.cornerR + p.clearance;
    const outerL = pl + 2 * p.wall, outerW = pw + 2 * p.wall;
    const H = p.floor + p.phoneT + p.clearance; // altura até a frente do aparelho
    // coordenadas: x e y como o aparelho visto de frente (tela para cima), centro na origem; costas na mesa (z = 0)
    const pocket = k(roundedRect(M, pw, pl, R));
    const outer = k(roundedRect(M, outerW, outerL, R + p.wall));
    let body: Solid = k(k(outer.extrude(H)).subtract(k(k(pocket.extrude(H)).translate([0, 0, p.floor]))));
    // borda sobre a frente: degraus de 45° por baixo (sem suporte), a cada passo o furo da frente encolhe um pouco
    const dz = p.lip / LIP_STEPS;
    for (let i = 0; i < LIP_STEPS; i++) {
      const inset = (p.lip * (i + 1)) / LIP_STEPS;
      const ring = k(pocket.subtract(k(pocket.offset(-inset, "Round"))));
      body = k(body.add(k(k(ring.extrude(dz + 0.01)).translate([0, 0, H - p.lip + i * dz - 0.01]))));
    }
    // recorte da câmera nas costas (atravessa o fundo): coordenadas a partir do canto de cima à esquerda, visto de trás
    if (p.camW > 0 && p.camH > 0) {
      const cx = p.phoneW / 2 - p.camX - p.camW / 2, cy = p.phoneL / 2 - p.camY - p.camH / 2; // o canto de cima à esquerda visto de trás é o de cima à direita visto de frente
      const cam = k(k(roundedRect(M, p.camW, p.camH, Math.min(p.camR, p.camW / 2, p.camH / 2))).translate([cx, cy]));
      body = k(body.subtract(k(k(cam.extrude(p.floor + 2)).translate([0, 0, -1]))));
      if (p.camX + p.camW > p.phoneW || p.camY + p.camH > p.phoneL) warnings.push("O recorte da câmera sai do aparelho: confira x, y, largura e altura.");
    }
    // recortes dos botões nas laterais (atravessam a parede)
    for (const c of cuts) {
      const x = c.side === "right" ? 1 : -1; // direita e esquerda como se vê o aparelho de frente (tela para você)
      const yTop = p.phoneL / 2 - c.pos - c.len / 2;
      const cut = k(k(M.Manifold.cube([p.wall + 3, c.len, p.phoneT * 0.8 + p.clearance + 2], true)).translate([x * (pw / 2 + p.wall / 2), yTop, p.floor + p.phoneT / 2 + 1]));
      body = k(body.subtract(cut));
      if (c.pos + c.len > p.phoneL) warnings.push("Um recorte de botão passa do comprimento do aparelho.");
    }
    // desenho e nome gravados nas costas, pelo lado da mesa (rasos: não furam o fundo)
    const grooves: CS[] = [];
    const line = (a: [number, number], b: [number, number]) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      return k(k(k(M.CrossSection.square([len, GROOVE_W], true)).rotate((Math.atan2(dy, dx) * 180) / Math.PI)).translate([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]));
    };
    const inner = k(pocket.offset(-4, "Round"));
    if (p.pattern === "hex" && !test) {
      const w = Math.sqrt(3) * HEX_R, h = 1.5 * HEX_R;
      for (let row = -Math.ceil(pl / h / 2); row <= Math.ceil(pl / h / 2); row++)
        for (let col = -Math.ceil(pw / w / 2) - 1; col <= Math.ceil(pw / w / 2) + 1; col++) {
          const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * h;
          const ring = k(k(M.CrossSection.circle(HEX_R, 6).rotate(30)).translate([cx, cy]));
          grooves.push(k(ring.subtract(k(ring.offset(-GROOVE_W, "Miter")))));
        }
    } else if (p.pattern === "cross" && !test) {
      grooves.push(line([-pw / 2 + 6, -pl / 2 + 6], [pw / 2 - 6, pl / 2 - 6]), line([-pw / 2 + 6, pl / 2 - 6], [pw / 2 - 6, -pl / 2 + 6]));
    }
    let groove2d: CS | null = grooves.length ? k(k(M.CrossSection.union(grooves)).intersect(inner)) : null;
    if (groove2d && p.camW > 0) {
      const cx = p.phoneW / 2 - p.camX - p.camW / 2, cy = p.phoneL / 2 - p.camY - p.camH / 2;
      groove2d = k(groove2d.subtract(k(k(roundedRect(M, p.camW + 6, p.camH + 6, p.camR + 3)).translate([cx, cy]))));
    }
    if (!test && p.name.trim()) {
      const raw = ctx.text(p.name, 8);
      if (raw) {
        const t = k(fitInto(k(raw), pw * 0.6, 12, 0));
        const mirrored = k(t.mirror([1, 0])); // gravado de fora: espelhado para ler certo olhando as costas
        groove2d = k(M.CrossSection.union([...(groove2d ? [groove2d] : []), k(mirrored.translate([0, -pl * 0.28]))]));
      }
    }
    if (groove2d && !groove2d.isEmpty()) body = k(body.subtract(k(k(groove2d.extrude(GROOVE_D + 0.01)).translate([0, 0, -0.01]))));

    // peça de teste: só um trecho do canto de baixo (a lateral inteira e o canto), para experimentar no aparelho
    if (test) {
      const keep = k(k(M.Manifold.cube([outerW + 2, TEST_LEN + 1, H + 2], false)).translate([-outerW / 2 - 1, -outerL / 2 - 1, -1]));
      body = k(body.intersect(keep));
    }
    if (p.clearance > 0.3) warnings.push("Folga grande para TPU: a capa fica frouxa. Costuma servir de 0,1 a 0,2 mm.");
    if (Math.max(outerL, outerW) > bedMm()) warnings.push("A capa passa da mesa.");
    warnings.push(test ? "Peça de teste: experimente no aparelho. Se apertar demais ou sobrar, ajuste a folga e as medidas e imprima outra, antes da capa inteira." : "Confira as medidas no seu aparelho (comprimento, largura, espessura, raio do canto e a câmera) e imprima antes a peça de teste. As medidas dos modelos prontos são aproximadas e variam por versão e fabricante: a capa só encaixa se as medidas forem as do seu aparelho. TPU 95A, devagar e sem retração.");
    return { models: [{ name: test ? "Peça de teste" : "Capa de celular", parts: [{ name: "Capa", color: p.color, mesh: solidMesh(body) }] }], warnings };
  });
}
