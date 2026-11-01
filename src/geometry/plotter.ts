/**
 * Desenhar com caneta (#303): linhas do desenho viram G-code para a impressora mover uma caneta presa no cabeçote.
 * Sem aquecer nada e sem extrusão: só G0/G1 em X, Y e Z. Nenhuma coordenada sai da mesa.
 */
import { z } from "zod";

export type Pt = [number, number];
/** Linha em mm; a fechada repete o primeiro ponto no fim. */
export type Stroke = Pt[];

/**
 * Altura do bico na pausa de montar a caneta: a ponta é ajustada para encostar no papel com o bico aqui, 5 mm acima
 * (folga para a folha de plástico e o papel). "Altura ao desenhar" abaixo disso = a caneta aperta o papel.
 */
export const CAL_Z = 5;

export const PEN_DEFAULTS = { zDraw: 4.6, zLift: 10, drawFeed: 1500, zFeed: 600, settleMs: 120, airTest: true, offX: 0, offY: 0 };

export const PenSettings = z.object({
  zDraw: z.number().min(3, "Altura ao desenhar: no mínimo 3 mm (abaixo disso a caneta aperta demais).").max(CAL_Z + 1, `Altura ao desenhar: no máximo ${CAL_Z + 1} mm (acima disso a caneta não encosta).`),
  // sempre acima da de desenhar (ela vai no máximo a CAL_Z + 1)
  zLift: z.number().min(CAL_Z + 2, `Altura ao subir: no mínimo ${CAL_Z + 2} mm.`).max(30),
  drawFeed: z.number().min(100).max(6000),
  zFeed: z.number().min(60).max(1200),
  settleMs: z.number().int().min(0).max(2000),
  airTest: z.boolean(),
  /** Ponta da caneta = bico + deslocamento (o suporte prende a caneta ao lado do bico). */
  offX: z.number().min(-80, "Deslocamento X: no máximo 80 mm.").max(80, "Deslocamento X: no máximo 80 mm.").default(0),
  offY: z.number().min(-80, "Deslocamento Y: no máximo 80 mm.").max(80, "Deslocamento Y: no máximo 80 mm.").default(0),
});
export type Pen = z.input<typeof PenSettings>;

/** Quanto o "testar no ar" sobe tudo. */
export const AIR_MM = 10;
export const MARGIN_MM = 5;
const TRAVEL_FEED = 6000;
/** Teto de pontos: acima disso o arquivo fica enorme e a impressora engasga. */
const MAX_POINTS = 200_000;

export type Area = { x0: number; y0: number; x1: number; y1: number };

/** Onde a PONTA da caneta alcança: a mesa, menos a faixa em que o bico sairia dela por causa do deslocamento. */
export const reach = (bed: { x: number; y: number }, off: { offX?: number; offY?: number } = {}): Area => {
  const [ox, oy] = [off.offX ?? 0, off.offY ?? 0];
  return { x0: Math.max(0, ox), y0: Math.max(0, oy), x1: Math.min(bed.x, bed.x + ox), y1: Math.min(bed.y, bed.y + oy) };
};

/** Folhas comuns (mm, em pé). */
export const PAPERS = { a4: [210, 297], a5: [148, 210], a6: [105, 148], card: [100, 150] } as const;
export type Paper = { size: keyof typeof PAPERS | "bed" | "custom"; w: number; h: number; landscape: boolean };
export const PaperSchema = z.object({ size: z.enum(["a4", "a5", "a6", "card", "bed", "custom"]), w: z.number().min(20, "Folha: no mínimo 20 mm.").max(500, "Folha: no máximo 500 mm."), h: z.number().min(20, "Folha: no mínimo 20 mm.").max(500, "Folha: no máximo 500 mm."), landscape: z.boolean() });
export const PAPER_DEFAULT: Paper = { size: "a5", w: 148, h: 210, landscape: false };

/** Medidas da folha (deitada troca largura e altura); "bed" = sem folha, a mesa toda. */
export function paperSize(p: Paper): [number, number] | null {
  if (p.size === "bed") return null;
  const [w, h] = p.size === "custom" ? [p.w, p.h] : PAPERS[p.size];
  return p.landscape ? [h, w] : [w, h];
}

/**
 * Onde dá para desenhar: a folha centrada no ponto da pausa (o meio de onde a caneta alcança), cortada pelo que a
 * caneta alcança. `cut` = a folha é maior que isso (ex.: A4 numa mesa de 256 mm).
 */
export function drawArea(bed: { x: number; y: number }, off: { offX?: number; offY?: number }, paper: Paper | null): { area: Area; sheet: Area | null; cut: boolean } {
  const a = reach(bed, off);
  const size = paper && paperSize(paper);
  if (!size) return { area: a, sheet: null, cut: false };
  const [cx, cy] = [(a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2];
  const sheet = { x0: cx - size[0] / 2, y0: cy - size[1] / 2, x1: cx + size[0] / 2, y1: cy + size[1] / 2 };
  const area = { x0: Math.max(a.x0, sheet.x0), y0: Math.max(a.y0, sheet.y0), x1: Math.min(a.x1, sheet.x1), y1: Math.min(a.y1, sheet.y1) };
  return { area, sheet, cut: area.x1 - area.x0 < size[0] - 0.01 || area.y1 - area.y0 < size[1] - 0.01 };
}

/** Linhas (Y para cima) escaladas para `widthMm` de largura e centradas na folha (ou onde a caneta alcança). Erro se não couber com a margem. */
export function placeOnBed(lines: { pts: Pt[]; closed: boolean }[], widthMm: number, bed: { x: number; y: number }, off: { offX?: number; offY?: number } = {}, paper: Paper | null = null): Stroke[] {
  const all = lines.flatMap((l) => l.pts);
  if (!all.length) throw new Error("Nenhum traço no desenho.");
  if (all.length > MAX_POINTS) throw new Error("Desenho com detalhe demais para a caneta. Diminua o Detalhe na Imagem em SVG.");
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [x, y] of all) [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
  if (x1 - x0 <= 0) throw new Error("O desenho não tem largura.");
  const s = widthMm / (x1 - x0);
  const h = (y1 - y0) * s;
  const { area: a, sheet } = drawArea(bed, off, paper);
  const [maxW, maxH] = [a.x1 - a.x0 - 2 * MARGIN_MM, a.y1 - a.y0 - 2 * MARGIN_MM];
  if (widthMm > maxW || h > maxH) {
    const where = sheet ? `na folha (${Math.round(a.x1 - a.x0)} × ${Math.round(a.y1 - a.y0)} mm que dá para usar)` : a.x1 - a.x0 < bed.x || a.y1 - a.y0 < bed.y ? `na área que a caneta alcança (${Math.round(a.x1 - a.x0)} × ${Math.round(a.y1 - a.y0)} mm)` : `na mesa de ${bed.x} × ${bed.y} mm`;
    throw new Error(`O desenho (${Math.round(widthMm)} × ${Math.round(h)} mm) não cabe ${where} com ${MARGIN_MM} mm de margem. Diminua a largura.`);
  }
  const [ox, oy] = [a.x0 + (a.x1 - a.x0 - widthMm) / 2, a.y0 + (a.y1 - a.y0 - h) / 2];
  return lines
    .filter((l) => l.pts.length >= 2)
    .map((l) => {
      const pts = l.pts.map(([x, y]): Pt => [ox + (x - x0) * s, oy + (y - y0) * s]);
      return l.closed ? [...pts, pts[0]] : pts;
    });
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Ordem que encurta o caminho com a caneta no ar: sempre a linha mais perto (por qualquer ponta) da posição atual. */
// shortcut: vizinho mais próximo é O(n²) e linha fechada só começa no próprio início; trocar por grade espacial se passar de ~5 mil linhas
export function orderStrokes(strokes: Stroke[]): Stroke[] {
  const left = [...strokes];
  const out: Stroke[] = [];
  let at: Pt = [0, 0];
  while (left.length) {
    let best = 0;
    let rev = false;
    let bestD = Infinity;
    left.forEach((s, i) => {
      const [dStart, dEnd] = [dist(at, s[0]), dist(at, s[s.length - 1])];
      if (dStart < bestD) [best, rev, bestD] = [i, false, dStart];
      if (dEnd < bestD) [best, rev, bestD] = [i, true, dEnd];
    });
    const [s] = left.splice(best, 1);
    const next = rev ? [...s].reverse() : s;
    out.push(next);
    at = next[next.length - 1];
  }
  return out;
}

export const FILL_MODES = ["outline", "both", "fill"] as const;
export type FillMode = (typeof FILL_MODES)[number];
export const FillSettings = z.object({
  mode: z.enum(FILL_MODES),
  spacing: z.number().min(0.2, "Espaço entre as linhas: no mínimo 0,2 mm.").max(5, "Espaço entre as linhas: no máximo 5 mm."),
  angle: z.union([z.literal(0), z.literal(45), z.literal(90), z.literal(135)]),
  cross: z.boolean(),
});
export type Fill = z.infer<typeof FillSettings>;
export const FILL_DEFAULTS: Fill = { mode: "outline", spacing: 0.6, angle: 45, cross: false };

/**
 * Linhas paralelas dentro das formas fechadas (regra par-ímpar: o furo de um "O" fica vazio), a cada `spacing` mm,
 * no ângulo dado. Linhas abertas (traço único) não têm dentro e ficam de fora.
 */
// shortcut: cada linha de varredura testa todas as arestas (arestas × linhas); trocar por tabela de arestas ordenada se ficar lento em imagens grandes
export function hatch(strokes: Stroke[], spacing: number, angleDeg: number): Stroke[] {
  const a = (angleDeg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const rot = ([x, y]: Pt): Pt => [x * c + y * s, -x * s + y * c];
  const back = ([x, y]: Pt): Pt => [x * c - y * s, x * s + y * c];
  const closed = strokes.filter((st) => st.length > 3 && dist(st[0], st[st.length - 1]) < 1e-9);
  const edges = closed.flatMap((st) => {
    const r = st.map(rot);
    return r.slice(1).map((q, i) => [r[i], q] as const);
  });
  if (!edges.length) return [];
  let [y0, y1] = [Infinity, -Infinity]; // laço, não Math.min(...): imagem grande estoura a pilha
  for (const [p, q] of edges) [y0, y1] = [Math.min(y0, p[1], q[1]), Math.max(y1, p[1], q[1])];
  const out: Stroke[] = [];
  for (let y = y0 + spacing / 2; y < y1; y += spacing) {
    const xs = edges
      .filter(([p, q]) => p[1] <= y !== q[1] <= y)
      .map(([p, q]) => p[0] + ((y - p[1]) * (q[0] - p[0])) / (q[1] - p[1]))
      .sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1e-6) out.push([back([xs[i], y]), back([xs[i + 1], y])]);
  }
  return out;
}

/** Contorno, preenchimento ou os dois, conforme a escolha. */
export function withFill(strokes: Stroke[], fill: Fill): Stroke[] {
  if (fill.mode === "outline") return strokes;
  const lines = [...hatch(strokes, fill.spacing, fill.angle), ...(fill.cross ? hatch(strokes, fill.spacing, fill.angle + 90) : [])];
  return fill.mode === "fill" ? [...lines, ...strokes.filter((st) => dist(st[0], st[st.length - 1]) >= 1e-9)] : [...strokes, ...lines];
}

const f = (n: number) => n.toFixed(2);

export type PenJob = { gcode: string; strokes: number; lengthMm: number; minutes: number };

/** G-code da caneta. Valida os ajustes e cada ponto contra a mesa antes de escrever qualquer linha. */
export function penGcode(strokes: Stroke[], pen: Pen, bed: { x: number; y: number }): PenJob {
  const p = PenSettings.parse(pen);
  if (!strokes.length) throw new Error("Nenhum traço no desenho.");
  const a = reach(bed, p);
  for (const s of strokes)
    for (const [x, y] of s)
      if (!(x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1)) throw new Error(`A caneta não alcança o ponto (${f(x)}, ${f(y)}): nada foi gerado.`);
  // o G-code move o BICO: ponta − deslocamento
  const nx = (x: number) => f(x - p.offX);
  const ny = (y: number) => f(y - p.offY);
  const air = p.airTest ? AIR_MM : 0;
  const [down, up] = [p.zDraw + air, p.zLift + air];
  const settle = p.settleMs > 0 ? [`G4 P${p.settleMs}`] : [];
  const lengthMm = strokes.reduce((t, s) => t + s.slice(1).reduce((u, q, i) => u + dist(s[i], q), 0), 0);
  const minutes = lengthMm / p.drawFeed + (strokes.length * 2 * p.settleMs) / 60000;
  const lines = [
    // cabeçalho que a tela das Bambu lê (tempo e camadas); o resto são comentários
    "; HEADER_BLOCK_START",
    `; model printing time: ${Math.ceil(minutes)}m; total estimated time: ${Math.ceil(minutes)}m`,
    "; total layer number: 1",
    "; HEADER_BLOCK_END",
    "; UpVision Maker - desenho com caneta",
    p.airTest ? `; TESTE NO AR: a caneta fica ${AIR_MM} mm acima do papel` : "; Supervisione: faça antes o teste no ar",
    "G90 ; coordenadas absolutas",
    "G21 ; milímetros",
    "G28 ; zera os eixos (sem a caneta: a A1 encosta o bico na mesa ao zerar)",
    `G1 Z${f(up + AIR_MM)} F${p.zFeed}`,
    `G0 X${nx((a.x0 + a.x1) / 2)} Y${ny((a.y0 + a.y1) / 2)} F${TRAVEL_FEED} ; ponta da caneta no meio da folha`,
    `G1 Z${f(CAL_Z)} F${p.zFeed}`,
    "M400 U1 ; pausa: prenda o suporte, desça a caneta até encostar no papel e toque em Continuar",
    `G1 Z${f(up)} F${p.zFeed}`,
  ];
  for (const s of strokes) {
    lines.push(`G0 X${nx(s[0][0])} Y${ny(s[0][1])} F${TRAVEL_FEED}`, `G1 Z${f(down)} F${p.zFeed}`, ...settle);
    for (let i = 1; i < s.length; i++) {
      lines.push(`G1 X${nx(s[i][0])} Y${ny(s[i][1])} F${p.drawFeed}`);
    }
    lines.push(`G1 Z${f(up)} F${p.zFeed}`, ...settle);
  }
  // fim: caneta bem alta e cabeçote no canto, longe do papel
  lines.push(`G1 Z${f(up + AIR_MM)} F${p.zFeed}`, `G0 X0 Y${f(bed.y)} F${TRAVEL_FEED}`, "");
  return { gcode: lines.join("\n"), strokes: strokes.length, lengthMm, minutes };
}
