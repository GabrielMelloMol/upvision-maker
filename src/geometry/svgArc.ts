/**
 * Caminho SVG sem arcos (#183). O leitor do three.js transforma arco elíptico por atalhos que erram quando o arco tem
 * rotação própria e o grupo tem escala desigual (a elipse sai com a proporção trocada: "arte torta"). Com o arco já em
 * Béziers, qualquer transformação é exata. A saída tem só M, L, C, Q e Z, absolutos.
 */

const NUM = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/;
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const TAU = Math.PI * 2;
const fmt = (n: number) => String(Number(n.toFixed(5)));

/** Arco (forma de ponto final do SVG, F.6.5) → cúbicas de até 90° cada, como "C x1 y1 x2 y2 x y". */
function arcToCubics(x0: number, y0: number, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, x: number, y: number): string[] {
  if (x0 === x && y0 === y) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry) return [`L ${fmt(x)} ${fmt(y)}`];
  const phi = (rotDeg * Math.PI) / 180;
  const [cosP, sinP] = [Math.cos(phi), Math.sin(phi)];
  const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
  const x1 = cosP * dx + sinP * dy, y1 = -sinP * dx + cosP * dy;
  const grow = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (grow > 1) {
    rx *= Math.sqrt(grow);
    ry *= Math.sqrt(grow);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
  const cx = cosP * cx1 - sinP * cy1 + (x0 + x) / 2, cy = sinP * cx1 + cosP * cy1 + (y0 + y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const th1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dth = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dth > 0) dth -= TAU;
  if (sweep && dth < 0) dth += TAU;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9));
  const step = dth / n;
  const t = (4 / 3) * Math.tan(step / 4);
  const point = (a: number): [number, number] => [cx + rx * Math.cos(a) * cosP - ry * Math.sin(a) * sinP, cy + rx * Math.cos(a) * sinP + ry * Math.sin(a) * cosP];
  const deriv = (a: number): [number, number] => [-rx * Math.sin(a) * cosP - ry * Math.cos(a) * sinP, -rx * Math.sin(a) * sinP + ry * Math.cos(a) * cosP];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = th1 + i * step, b = a + step;
    const [p, q] = [point(a), point(b)];
    const [dp, dq] = [deriv(a), deriv(b)];
    const end = i === n - 1 ? [x, y] : q;
    out.push(`C ${fmt(p[0] + t * dp[0])} ${fmt(p[1] + t * dp[1])} ${fmt(q[0] - t * dq[0])} ${fmt(q[1] - t * dq[1])} ${fmt(end[0])} ${fmt(end[1])}`);
  }
  return out;
}

/** `d` sem os comandos de arco (e em comandos absolutos); se não der para ler, devolve o próprio `d`. */
export function pathWithoutArcs(d: string): string {
  const out: string[] = [];
  let i = 0;
  let cmd = "";
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let lastCtrl: [number, number] | null = null;
  let lastKind = "";
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++;
  };
  const num = (): number | null => {
    skip();
    const m = NUM.exec(d.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const flag = (): boolean | null => {
    skip();
    if (d[i] !== "0" && d[i] !== "1") return null;
    return d[i++] === "1";
  };
  while (true) {
    skip();
    if (i >= d.length) break;
    if (/[A-Za-z]/.test(d[i])) {
      cmd = d[i++];
      if (!(cmd.toUpperCase() in ARITY)) return d;
    } else if (!cmd || cmd.toUpperCase() === "Z") return d;
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    if (up === "Z") {
      out.push("Z");
      [cx, cy] = [sx, sy];
      lastCtrl = null;
      lastKind = "Z";
      continue;
    }
    const a: number[] = [];
    for (let k = 0; k < ARITY[up]; k++) {
      const v = up === "A" && (k === 3 || k === 4) ? flag() : num();
      if (v === null) return d;
      a.push(Number(v));
    }
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    const reflect = (kind: string): [number, number] => (lastCtrl && lastKind === kind ? [2 * cx - lastCtrl[0], 2 * cy - lastCtrl[1]] : [cx, cy]);
    switch (up) {
      case "M":
        [cx, cy] = [a[0] + ox, a[1] + oy];
        [sx, sy] = [cx, cy];
        out.push(`M ${fmt(cx)} ${fmt(cy)}`);
        cmd = rel ? "l" : "L"; // pares extras viram linhas
        lastCtrl = null;
        break;
      case "L":
        [cx, cy] = [a[0] + ox, a[1] + oy];
        out.push(`L ${fmt(cx)} ${fmt(cy)}`);
        lastCtrl = null;
        break;
      case "H":
        cx = a[0] + ox;
        out.push(`L ${fmt(cx)} ${fmt(cy)}`);
        lastCtrl = null;
        break;
      case "V":
        cy = a[0] + oy;
        out.push(`L ${fmt(cx)} ${fmt(cy)}`);
        lastCtrl = null;
        break;
      case "C": {
        const [c1, c2]: [number, number][] = [[a[0] + ox, a[1] + oy], [a[2] + ox, a[3] + oy]];
        [cx, cy] = [a[4] + ox, a[5] + oy];
        out.push(`C ${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(cx)} ${fmt(cy)}`);
        lastCtrl = c2;
        break;
      }
      case "S": {
        const c1 = reflect("C");
        const c2: [number, number] = [a[0] + ox, a[1] + oy];
        [cx, cy] = [a[2] + ox, a[3] + oy];
        out.push(`C ${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(cx)} ${fmt(cy)}`);
        lastCtrl = c2;
        break;
      }
      case "Q": {
        const c1: [number, number] = [a[0] + ox, a[1] + oy];
        [cx, cy] = [a[2] + ox, a[3] + oy];
        out.push(`Q ${fmt(c1[0])} ${fmt(c1[1])} ${fmt(cx)} ${fmt(cy)}`);
        lastCtrl = c1;
        break;
      }
      case "T": {
        const c1 = reflect("Q");
        [cx, cy] = [a[0] + ox, a[1] + oy];
        out.push(`Q ${fmt(c1[0])} ${fmt(c1[1])} ${fmt(cx)} ${fmt(cy)}`);
        lastCtrl = c1;
        break;
      }
      case "A": {
        const [x, y] = [a[5] + ox, a[6] + oy];
        out.push(...arcToCubics(cx, cy, a[0], a[1], a[2], a[3] === 1, a[4] === 1, x, y));
        [cx, cy] = [x, y];
        lastCtrl = null;
        break;
      }
    }
    lastKind = up === "S" ? "C" : up === "T" ? "Q" : up;
  }
  return out.join(" ");
}
