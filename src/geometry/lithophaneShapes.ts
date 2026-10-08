import { flip, signedVolume } from "./heightfield";
import type { Mesh } from "./types";

/*
 * Formatos da litofania além da plana (#101): cilindro (abajur), coração e círculo. Aqui ficam as partes puras,
 * sem manifold: a malha do cilindro, a emenda sem salto e o corte da foto na proporção da peça.
 */

/**
 * Tubo fechado de um campo de alturas que dá a volta: `cols` pontos em torno do eixo (a última coluna encosta na
 * primeira, sem coluna repetida, então não há faces coincidentes na emenda), `rows` do topo (linha 0) para baixo.
 * `cell` é o passo no arco e na vertical; `radius` o raio externo. O lado de fora é liso e o relevo vai para dentro
 * (raio `radius − t`), que é de onde vem a luz do abajur. Em pé, de z = 0 (embaixo) até (rows − 1) × cell.
 */
export function cylinderMesh(t: Float32Array, cols: number, rows: number, cell: number, radius: number): Mesh {
  if (cols < 3 || rows < 2) throw new Error("Imagem pequena demais.");
  const n = cols * rows;
  const H = (rows - 1) * cell;
  const positions = new Float32Array(n * 2 * 3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const a = (2 * Math.PI * c) / cols;
      const z = H - r * cell;
      positions.set([radius * Math.cos(a), radius * Math.sin(a), z], i * 3);
      positions.set([(radius - t[i]) * Math.cos(a), (radius - t[i]) * Math.sin(a), z], (n + i) * 3);
    }
  }
  const out = (r: number, c: number) => r * cols + (c % cols);
  const inn = (r: number, c: number) => n + out(r, c);
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const [a, b, d, e] = [out(r, c), out(r, c + 1), out(r + 1, c), out(r + 1, c + 1)];
      idx.push(a, d, b, b, d, e); // parede de fora (normal para fora)
      const [A, B, D, E] = [inn(r, c), inn(r, c + 1), inn(r + 1, c), inn(r + 1, c + 1)];
      idx.push(A, B, D, B, E, D); // parede de dentro (normal para o eixo)
    }
  }
  for (let c = 0; c < cols; c++) {
    idx.push(out(0, c), out(0, c + 1), inn(0, c + 1), out(0, c), inn(0, c + 1), inn(0, c)); // borda de cima
    const b = rows - 1;
    idx.push(out(b, c), inn(b, c + 1), out(b, c + 1), out(b, c), inn(b, c), inn(b, c + 1)); // borda de baixo
  }
  const mesh = { positions, indices: new Uint32Array(idx) };
  return signedVolume(mesh) < 0 ? flip(mesh) : mesh;
}

/**
 * Emenda sem salto: as `overlap` colunas que sobram depois do fim se misturam com o começo, e o último ponto passa a
 * ser vizinho do primeiro. Devolve a grade com `cols − overlap` colunas.
 */
export function loopSeam(luma: Float32Array, cols: number, rows: number, overlap: number): { luma: Float32Array; cols: number } {
  const n = Math.max(0, Math.min(overlap, Math.floor(cols / 3)));
  const outCols = cols - n;
  const out = new Float32Array(outCols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < outCols; c++) {
      const head = luma[r * cols + c];
      // nas n primeiras colunas, entra aos poucos o trecho que passaria do fim
      out[r * outCols + c] = c < n ? (1 - c / n) * luma[r * cols + outCols + c] + (c / n) * head : head;
    }
  }
  return { luma: out, cols: outCols };
}

/** Recorte central da grade na proporção `aspect` (largura ÷ altura), sem esticar a foto. */
export function fitAspect(luma: Float32Array, w: number, h: number, aspect: number): { luma: Float32Array; w: number; h: number } {
  let cw = w, ch = h;
  if (w / h > aspect) cw = Math.max(2, Math.round(h * aspect));
  else ch = Math.max(2, Math.round(w / aspect));
  const x0 = Math.floor((w - cw) / 2), y0 = Math.floor((h - ch) / 2);
  const out = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out[y * cw + x] = luma[(y0 + y) * w + x0 + x];
  return { luma: out, w: cw, h: ch };
}
