/**
 * Pintura por triângulo dos 3MF do Bambu Studio / OrcaSlicer (`paint_color`) e do PrusaSlicer
 * (`slic3rpe:mmu_segmentation`): cada triângulo guarda uma árvore de subdivisão serializada em hex.
 * Segue o TriangleSelector do BambuStudio (deserialize / perform_split):
 * - a string é lida de trás para frente, 1 caractere = 1 nibble;
 * - nibble do nó: bits 0–1 = lados divididos (0 = folha); bits 2–3 = lado especial (nó dividido) ou estado (folha);
 *   estado 3 = "leia mais nibbles": 15 repetido soma 15 cada, e o último soma + 3;
 * - os filhos vêm em ordem inversa; a geometria de cada divisão usa pontos médios das arestas.
 * Estado 0 = sem pintura (vale a cor do volume); estado k = filamento k.
 */
export type Vec3 = [number, number, number];
export type Tri = [Vec3, Vec3, Vec3];
export type PaintNode = { state: number } | { sides: 1 | 2 | 3; special: number; children: PaintNode[] };
export type PaintLeaf = { tri: Tri; state: number };

const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/** Filhos de um triângulo dividido, na ordem do Bambu (perform_split). */
export function splitTriangle(t: Tri, sides: number, special: number): Tri[] {
  const [a, b, c] = [t[special % 3], t[(special + 1) % 3], t[(special + 2) % 3]];
  if (sides === 1) {
    const m = mid(c, b);
    return [
      [a, b, m],
      [m, c, a],
    ];
  }
  if (sides === 2) {
    const m01 = mid(b, a), m20 = mid(a, c);
    return [
      [a, m01, m20],
      [m01, b, m20],
      [b, c, m20],
    ];
  }
  const m01 = mid(b, a), m12 = mid(c, b), m20 = mid(a, c);
  return [
    [a, m01, m20],
    [m01, b, m12],
    [m12, c, m20],
    [m01, m12, m20],
  ];
}

const MAX_DEPTH = 32;

/** Folhas pintadas do triângulo `t` (ordem dos filhos do Bambu). String vazia ou inválida = triângulo sem cor. */
export function decodePaint(hex: string, t: Tri): PaintLeaf[] {
  const nibbles: number[] = [];
  for (let i = hex.length - 1; i >= 0; i--) {
    const v = parseInt(hex[i], 16);
    if (Number.isNaN(v)) return [{ tri: t, state: 0 }];
    nibbles.push(v);
  }
  if (!nibbles.length) return [{ tri: t, state: 0 }];
  let pos = 0;
  const next = () => {
    if (pos >= nibbles.length) throw new Error("fim");
    return nibbles[pos++];
  };
  const read = (tri: Tri, depth: number): PaintLeaf[] => {
    if (depth > MAX_DEPTH) throw new Error("fundo demais");
    const code = next();
    const sides = code & 0b11;
    if (!sides) {
      if ((code & 0b1100) !== 0b1100) return [{ tri, state: code >> 2 }];
      let n = next(), extra = 0;
      while (n === 0b1111) {
        extra += 15;
        n = next();
      }
      return [{ tri, state: n + extra + 3 }];
    }
    const kids = splitTriangle(tri, sides, code >> 2);
    const out: PaintLeaf[][] = new Array(kids.length);
    for (let i = kids.length - 1; i >= 0; i--) out[i] = read(kids[i], depth + 1); // gravados do último para o primeiro
    return out.flat();
  };
  try {
    return read(t, 0);
  } catch {
    return [{ tri: t, state: 0 }];
  }
}

/** Serializa uma árvore no mesmo formato (para testes e para gravar pintura). */
export function encodePaint(node: PaintNode): string {
  const nibbles: number[] = [];
  const write = (n: PaintNode) => {
    if ("state" in n) {
      if (n.state < 3) nibbles.push(n.state << 2);
      else {
        nibbles.push(0b1100);
        let s = n.state - 3;
        while (s >= 15) {
          nibbles.push(15);
          s -= 15;
        }
        nibbles.push(s);
      }
      return;
    }
    nibbles.push(n.sides | (n.special << 2));
    for (let i = n.children.length - 1; i >= 0; i--) write(n.children[i]);
  };
  write(node);
  return nibbles
    .reverse()
    .map((v) => v.toString(16).toUpperCase())
    .join("");
}
