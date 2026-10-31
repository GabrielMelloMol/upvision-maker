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

export const PEN_DEFAULTS = { zDraw: 4.6, zLift: 10, drawFeed: 1500, zFeed: 600, settleMs: 120, airTest: true };

export const PenSettings = z.object({
  zDraw: z.number().min(3, "Altura ao desenhar: no mínimo 3 mm (abaixo disso a caneta aperta demais).").max(CAL_Z + 1, `Altura ao desenhar: no máximo ${CAL_Z + 1} mm (acima disso a caneta não encosta).`),
  // sempre acima da de desenhar (ela vai no máximo a CAL_Z + 1)
  zLift: z.number().min(CAL_Z + 2, `Altura ao subir: no mínimo ${CAL_Z + 2} mm.`).max(30),
  drawFeed: z.number().min(100).max(6000),
  zFeed: z.number().min(60).max(1200),
  settleMs: z.number().int().min(0).max(2000),
  airTest: z.boolean(),
  });
export type Pen = z.infer<typeof PenSettings>;

/** Quanto o "testar no ar" sobe tudo. */
export const AIR_MM = 10;
export const MARGIN_MM = 5;
const TRAVEL_FEED = 6000;
/** Teto de pontos: acima disso o arquivo fica enorme e a impressora engasga. */
const MAX_POINTS = 200_000;

/** Linhas (Y para cima) escaladas para `widthMm` de largura e centradas na mesa. Erro se não couber com a margem. */
export function placeOnBed(lines: { pts: Pt[]; closed: boolean }[], widthMm: number, bed: { x: number; y: number }): Stroke[] {
  const all = lines.flatMap((l) => l.pts);
  if (!all.length) throw new Error("Nenhum traço no desenho.");
  if (all.length > MAX_POINTS) throw new Error("Desenho com detalhe demais para a caneta. Diminua o Detalhe na Imagem em SVG.");
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [x, y] of all) [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
  if (x1 - x0 <= 0) throw new Error("O desenho não tem largura.");
  const s = widthMm / (x1 - x0);
  const h = (y1 - y0) * s;
  const [maxW, maxH] = [bed.x - 2 * MARGIN_MM, bed.y - 2 * MARGIN_MM];
  if (widthMm > maxW || h > maxH) {
    throw new Error(`O desenho (${Math.round(widthMm)} × ${Math.round(h)} mm) não cabe na mesa de ${bed.x} × ${bed.y} mm com ${MARGIN_MM} mm de margem. Diminua a largura.`);
  }
  const [ox, oy] = [(bed.x - widthMm) / 2, (bed.y - h) / 2];
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

const f = (n: number) => n.toFixed(2);

export type PenJob = { gcode: string; strokes: number; lengthMm: number; minutes: number };

/** G-code da caneta. Valida os ajustes e cada ponto contra a mesa antes de escrever qualquer linha. */
export function penGcode(strokes: Stroke[], pen: Pen, bed: { x: number; y: number }): PenJob {
  const p = PenSettings.parse(pen);
  if (!strokes.length) throw new Error("Nenhum traço no desenho.");
  for (const s of strokes)
    for (const [x, y] of s)
      if (!(x >= 0 && x <= bed.x && y >= 0 && y <= bed.y)) throw new Error(`Ponto fora da mesa (${f(x)}, ${f(y)}): nada foi gerado.`);
  const air = p.airTest ? AIR_MM : 0;
  const [down, up] = [p.zDraw + air, p.zLift + air];
  const settle = p.settleMs > 0 ? [`G4 P${p.settleMs}`] : [];
  const lines = [
    "; UpVision Maker - desenho com caneta",
    p.airTest ? `; TESTE NO AR: a caneta fica ${AIR_MM} mm acima do papel` : "; Supervisione: faça antes o teste no ar",
    "G90 ; coordenadas absolutas",
    "G21 ; milímetros",
    "G28 ; zera os eixos (sem a caneta: a A1 encosta o bico na mesa ao zerar)",
    `G1 Z${f(up + AIR_MM)} F${p.zFeed}`,
    `G0 X${f(bed.x / 2)} Y${f(bed.y / 2)} F${TRAVEL_FEED}`,
    `G1 Z${f(CAL_Z)} F${p.zFeed}`,
    "M400 U1 ; pausa: prenda o suporte, desça a caneta até encostar no papel e toque em Continuar",
    `G1 Z${f(up)} F${p.zFeed}`,
  ];
  let lengthMm = 0;
  for (const s of strokes) {
    lines.push(`G0 X${f(s[0][0])} Y${f(s[0][1])} F${TRAVEL_FEED}`, `G1 Z${f(down)} F${p.zFeed}`, ...settle);
    for (let i = 1; i < s.length; i++) {
      lengthMm += dist(s[i - 1], s[i]);
      lines.push(`G1 X${f(s[i][0])} Y${f(s[i][1])} F${p.drawFeed}`);
    }
    lines.push(`G1 Z${f(up)} F${p.zFeed}`, ...settle);
  }
  // fim: caneta bem alta e cabeçote no canto, longe do papel
  lines.push(`G1 Z${f(up + AIR_MM)} F${p.zFeed}`, `G0 X0 Y${f(bed.y)} F${TRAVEL_FEED}`, "");
  return { gcode: lines.join("\n"), strokes: strokes.length, lengthMm, minutes: lengthMm / p.drawFeed + (strokes.length * 2 * p.settleMs) / 60000 };
}
