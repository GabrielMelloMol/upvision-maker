import { bedMm } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type PhoneStandParams = {
  angle: number; // inclinação do apoio em relação à mesa, 45 a 75°
  deviceThickness: number; // espessura do aparelho com a capinha
  width: number;
  height: number; // altura do apoio, na vertical
  lip: number; // altura do lábio frontal acima da base
  cable: number; // largura da passagem do cabo (0 = sem)
  text: string; // nome ou logo em relevo na frente
  textHeight: number;
  relief: number;
  bodyColor: string;
  textColor: string;
};

export const DEFAULT_PHONE_STAND: PhoneStandParams = {
  angle: 60,
  deviceThickness: 12,
  width: 80,
  height: 90,
  lip: 14,
  cable: 16,
  text: "",
  textHeight: 8,
  relief: 0.8,
  bodyColor: "#1c1c1e",
  textColor: "#f8f8f6",
};

export const STAND_BASE = 5; // espessura da base
export const STAND_BACK = 5; // espessura do apoio inclinado
export const STAND_LIP = 5; // espessura do lábio
export const STAND_CLEARANCE = 1; // folga na espessura do aparelho
const TAIL = 4; // a base passa um pouco do topo do apoio, para não tombar para trás
const GROOVE = 3.2; // altura do canal do cabo embaixo
const LIP_EXTRA = 3; // o lábio passa um pouco do canto da frente do aparelho
const FACE_MARGIN = 3;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Medidas do perfil (vista de lado: y para a frente, z para cima), com o ponto de apoio S do aparelho em (0, STAND_BASE). */
export function standProfile(p: PhoneStandParams) {
  const a = rad(p.angle);
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  const lipFront = (p.deviceThickness + STAND_CLEARANCE) * sin + STAND_LIP; // y da frente do lábio
  const lipHeight = Math.max(p.lip, p.deviceThickness * cos + LIP_EXTRA); // o lábio alcança o canto da frente do aparelho
  const rest = p.height / Math.tan(a); // quanto o topo do apoio recua
  const back = Math.min(-rest - STAND_BACK * sin, -STAND_BACK * sin) - TAIL; // fim da base atrás
  return { sin, cos, lipRear: (p.deviceThickness + STAND_CLEARANCE) * sin, lipFront, lipHeight, rest, back, depth: lipFront - back };
}

const quad = (M: ManifoldToplevel, pts: [number, number][]): CS => {
  const area = pts.reduce((s, [x, y], i) => s + (x * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y), 0);
  return new M.CrossSection([area >= 0 ? pts : [...pts].reverse()], "NonZero");
};

/** Perfil de lado (x = y do mundo, y = z do mundo): base, apoio inclinado e lábio. */
function profile(M: ManifoldToplevel, p: PhoneStandParams): CS {
  const g = standProfile(p);
  const Lb = p.height / g.sin; // comprimento do apoio ao longo da inclinação
  const d: [number, number] = [-g.cos, g.sin]; // sobe e recua
  const n: [number, number] = [g.sin, g.cos]; // para a frente e para cima (de onde vem o aparelho)
  const S: [number, number] = [0, STAND_BASE];
  const P = (o: [number, number], dir: [number, number], t: number): [number, number] => [o[0] + dir[0] * t, o[1] + dir[1] * t];
  const faceTop = P(S, d, Lb);
  const backBottom = P(S, n, -STAND_BACK);
  const backTop = P(faceTop, n, -STAND_BACK);
  const parts = [
    quad(M, [[g.back, 0], [g.lipFront, 0], [g.lipFront, STAND_BASE], [g.back, STAND_BASE]]),
    quad(M, [S, faceTop, backTop, backBottom]),
    quad(M, [[g.lipRear, 0], [g.lipFront, 0], [g.lipFront, STAND_BASE + g.lipHeight], [g.lipRear, STAND_BASE + g.lipHeight]]),
  ];
  return scoped((k) => M.CrossSection.union(parts.map(k)));
}

/** O perfil extrudado na largura, com o eixo X para o lado, Y para a frente e Z para cima, centrado em X. */
const alongX = (width: number): Parameters<Solid["transform"]>[0] => [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, -width / 2, 0, 0, 1];

/**
 * Suporte de celular e tablet: base, apoio inclinado (45 a 75°) e lábio frontal, com a fenda na medida do aparelho,
 * passagem de cabo (furo sob o aparelho e canal embaixo) e nome ou logo em relevo na frente. Imprime de pé na base,
 * sem suporte (o apoio inclinado fica a partir de 45° da mesa).
 */
export function buildPhoneStand(ctx: ModelCtx, p: PhoneStandParams): ModelOutput {
  const { M } = ctx;
  const g = standProfile(p);
  const warnings: string[] = [];
  if (p.lip < g.lipHeight - 1e-6) warnings.push(`Lábio aumentado para ${g.lipHeight.toFixed(1)} mm: com esse aparelho e esse ângulo ele precisa alcançar o canto da frente.`);
  if (p.angle < 50) warnings.push("Ângulo baixo: o apoio fica quase deitado, e o aparelho escorrega para trás se o lábio for baixo.");
  if (p.deviceThickness > 16) warnings.push("Tablet ou aparelho grosso: use largura de 100 mm ou mais e 4 paredes (já vão no perfil) para o suporte aguentar o peso.");
  if (g.depth > bedMm() || p.width > bedMm()) warnings.push(`O suporte passa da mesa de ${bedMm()} mm: diminua a largura ou a altura do apoio.`);
  warnings.push("Imprima de pé na base, como sai no arquivo: o apoio inclinado não precisa de suporte (45° ou mais).");
  return scoped((k) => {
    const body = k(k(k(profile(M, p)).extrude(p.width)).transform(alongX(p.width)));
    let shell: Solid = body;
    if (p.cable > 0) {
      const c = Math.min(p.cable, p.width - 20); // sobra parede dos dois lados
      const seat = k(k(M.Manifold.cube([c, g.lipRear - 1.2, STAND_BASE + 2], false)).translate([-c / 2, 0.6, -1])); // furo sob o aparelho
      const groove = k(k(M.Manifold.cube([c, g.lipRear - g.back + 0.6, GROOVE + 1], false)).translate([-c / 2, g.back - 1, -1])); // canal até atrás
      shell = k(k(body.subtract(seat)).subtract(groove));
    }
    // a frente dos modelos do app é −Y (a prévia e as miniaturas olham de lá): a conta acima usa a frente em +Y, então gira 180° em Z no fim
    const front = (o: Solid) => solidMesh(k(o.rotate([0, 0, 180])));
    const parts: Part[] = [{ name: "Suporte", color: p.bodyColor, mesh: front(shell) }];
    const faceH = STAND_BASE + g.lipHeight;
    const art = ctx.art ?? (p.text.trim() ? ctx.text(p.text, p.textHeight) : null);
    if (art) {
      const fit = k(fitInto(ctx.art ? art : k(art), p.width * 0.8, Math.min(p.textHeight, faceH - 2 * FACE_MARGIN), 0)); // o desenho enviado é de quem chamou: só o texto gerado aqui é apagado
      // visto de frente (olhando para −Y) a direita é −X: o texto lê certo com x → −X, y → Z, e sai para +Y
      const mark = k(k(fit.extrude(p.relief)).transform([-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, g.lipFront, faceH / 2, 1]));
      parts.push({ name: "Texto", color: p.textColor, mesh: front(mark) });
    }
    const model: Model = { name: "Suporte de celular", parts };
    return { models: [model], warnings };
  });
}
