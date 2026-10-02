import { round2 } from "./types";

const SUPPORT = /^Support/i; // Support, Support interface, Support transition
const TOWER = /^(Prime|Wipe) tower/i;

/**
 * Gramas de suporte e de torre de limpeza no G-code do Bambu Studio/Orca (#147), pelos tipos de linha
 * ("; FEATURE: Support", "; FEATURE: Prime tower"). Soma só extrusão com movimento em X/Y: retração e a purga parada
 * no bico (que vai para a rampa) ficam fora. Conferido no G-code real da A1: a soma de todos os tipos dá 7,08 g para
 * as 7,04 g do cabeçalho. Ambos já estão dentro das gramas do fatiador; aqui é só para mostrar de onde vêm.
 */
export function featureGrams(chunks: string[], density: (tool: number) => number, diameterMm = 1.75): { support: number; tower: number } {
  const mm3PerMm = Math.PI * (diameterMm / 2) ** 2;
  const sum = { support: 0, tower: 0 };
  let kind: keyof typeof sum | null = null;
  let tool = 0;
  let relative = true;
  let lastE = 0;
  for (const chunk of chunks) {
    for (const line of chunk.split("\n")) {
      if (line.startsWith("; FEATURE:")) {
        const f = line.slice(10).trim();
        kind = SUPPORT.test(f) ? "support" : TOWER.test(f) ? "tower" : null;
      } else if (line.startsWith("M83")) relative = true;
      else if (line.startsWith("M82")) relative = false;
      else if (line.startsWith("G92")) lastE = Number(/E(-?[\d.]+)/.exec(line)?.[1] ?? lastE);
      else if (line.startsWith("M620 S") || line.startsWith("T")) {
        const t = Number(/^(?:M620 S(\d+)A|T(\d+))/.exec(line)?.slice(1).find(Boolean));
        if (Number.isFinite(t) && t < 255) tool = t;
      } else if (/^G[0-3] /.test(line)) {
        const code = line.split(";")[0];
        const m = /E(-?[\d.]+)/.exec(code);
        if (!m) continue;
        const e = relative ? Number(m[1]) : Number(m[1]) - lastE;
        if (!relative) lastE = Number(m[1]);
        if (kind && e > 0 && /[XY]/.test(code)) sum[kind] += ((e * mm3PerMm) / 1000) * density(tool);
      }
    }
  }
  return { support: round2(sum.support), tower: round2(sum.tower) };
}
