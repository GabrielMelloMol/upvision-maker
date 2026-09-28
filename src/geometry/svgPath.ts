/** Parser mínimo de `d` de caminho SVG (sem arcos), normalizado para comandos absolutos M/L/C/Q/Z. */
export type Vec2 = [number, number];
export type Contour = Vec2[];
export type Cmd = { c: "M" | "L" | "C" | "Q" | "Z"; p: number[] };

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, Z: 0 };
const TOKEN = /([MLHVCSQTZmlhvcsqtz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/gi;

export function parsePath(d: string): Cmd[] {
  if (/[^MLHVCSQTZmlhvcsqtz0-9eE+.,\-\s]/.test(d)) throw new Error("Caminho SVG com comando não suportado.");
  const tokens = [...d.matchAll(TOKEN)].map((m) => m[1] ?? Number(m[2]));
  const out: Cmd[] = [];
  let i = 0;
  let cmd = "";
  let cx = 0, cy = 0, sx = 0, sy = 0; // ponto atual e início do subcaminho
  let lastCtrl: Vec2 | null = null;
  let lastKind = "";
  while (i < tokens.length) {
    if (typeof tokens[i] === "string") cmd = tokens[i++] as string;
    else if (!cmd) throw new Error("Caminho SVG inválido.");
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const n = ARITY[up];
    const a = tokens.slice(i, i + n) as unknown as number[];
    if (a.length < n || a.some((v) => typeof v !== "number")) throw new Error("Caminho SVG inválido.");
    i += n;
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    const pt = (k: number): Vec2 => [a[k] + ox, a[k + 1] + oy];
    const reflect = (kind: string): Vec2 => (lastCtrl && lastKind === kind ? [2 * cx - lastCtrl[0], 2 * cy - lastCtrl[1]] : [cx, cy]);
    let kind = up;
    switch (up) {
      case "M": {
        [cx, cy] = pt(0);
        [sx, sy] = [cx, cy];
        out.push({ c: "M", p: [cx, cy] });
        cmd = rel ? "l" : "L"; // pares extras = lineto
        lastCtrl = null;
        break;
      }
      case "L": case "H": case "V": {
        const x = up === "V" ? cx : a[0] + ox;
        const y = up === "H" ? cy : up === "V" ? a[0] + oy : a[1] + oy;
        [cx, cy] = [x, y];
        out.push({ c: "L", p: [cx, cy] });
        lastCtrl = null;
        break;
      }
      case "C": case "S": {
        const c1 = up === "C" ? pt(0) : reflect("C");
        const c2 = up === "C" ? pt(2) : pt(0);
        const e = up === "C" ? pt(4) : pt(2);
        out.push({ c: "C", p: [...c1, ...c2, ...e] });
        lastCtrl = c2;
        [cx, cy] = e;
        kind = "C";
        break;
      }
      case "Q": case "T": {
        const c1 = up === "Q" ? pt(0) : reflect("Q");
        const e = up === "Q" ? pt(2) : pt(0);
        out.push({ c: "Q", p: [...c1, ...e] });
        lastCtrl = c1;
        [cx, cy] = e;
        kind = "Q";
        break;
      }
      case "Z":
        out.push({ c: "Z", p: [] });
        [cx, cy] = [sx, sy];
        lastCtrl = null;
        cmd = "";
        break;
    }
    lastKind = kind;
    if (up === "Z" && typeof tokens[i] === "number") throw new Error("Caminho SVG inválido.");
  }
  return out;
}

/** Aplica uma função a todos os pontos (inclusive controles). Afins (escala, translação, espelho) preservam a curva. */
export function mapPoints(cmds: Cmd[], f: (p: Vec2) => Vec2): Cmd[] {
  return cmds.map(({ c, p }) => {
    const q: number[] = [];
    for (let k = 0; k < p.length; k += 2) q.push(...f([p[k], p[k + 1]]));
    return { c, p: q };
  });
}

export function serializePath(cmds: Cmd[], precision = 3): string {
  const f = (n: number) => String(Number(n.toFixed(precision)));
  return cmds.map(({ c, p }) => c + p.map(f).join(" ")).join("");
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const MAX_STEPS = 64;

/** Converte em contornos (polígonos) com segmentos de até ~`maxSeg` unidades nas curvas. */
export function flatten(cmds: Cmd[], maxSeg: number): Contour[] {
  const out: Contour[] = [];
  let cur: Contour = [];
  const push = (p: Vec2) => {
    const last = cur.at(-1);
    if (!last || last[0] !== p[0] || last[1] !== p[1]) cur.push(p);
  };
  const close = () => {
    if (cur.length > 1 && dist(cur[0], cur.at(-1)!) < 1e-9) cur.pop();
    if (cur.length >= 3) out.push(cur);
    cur = [];
  };
  for (const { c, p } of cmds) {
    const from = cur.at(-1) ?? [0, 0];
    if (c === "M") {
      close();
      push([p[0], p[1]]);
    } else if (c === "L") push([p[0], p[1]]);
    else if (c === "Z") close();
    else {
      const pts: Vec2[] = [from];
      for (let k = 0; k < p.length; k += 2) pts.push([p[k], p[k + 1]]);
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += dist(pts[k - 1], pts[k]);
      const n = Math.min(MAX_STEPS, Math.max(2, Math.ceil(len / maxSeg)));
      for (let s = 1; s <= n; s++) push(bezier(pts, s / n));
    }
  }
  close();
  return out;
}

function bezier(pts: Vec2[], t: number): Vec2 {
  let q = pts;
  while (q.length > 1) q = q.slice(1).map((p, k) => [q[k][0] + (p[0] - q[k][0]) * t, q[k][1] + (p[1] - q[k][1]) * t]);
  return q[0];
}
