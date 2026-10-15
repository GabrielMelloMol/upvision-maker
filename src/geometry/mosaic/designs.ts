import { parseDesign, type MosaicGrid } from "./grid";

/*
 * Cartões de inspiração (#206): desenhos prontos para montar no tabuleiro, escritos em texto (ver `parseDesign`).
 * Cada casa são dois caracteres, cor + formato; ".." é casa vazia.
 */
export type MosaicDesign = { id: string; name: string; grid: MosaicGrid };

const make = (id: string, name: string, rows: string[]): MosaicDesign => ({ id, name, grid: parseDesign(rows) });

export const DESIGNS: MosaicDesign[] = [
  make("butterfly", "Borboleta", [
    ".. .. k2 .. .. k1 .. ..",
    ".. p2 p# k# k# p# p1 ..",
    "p2 p# p# k# k# p# p# p1",
    "p# p# p# k# k# p# p# p#",
    "y# y# y# k# k# y# y# y#",
    "y3 y# y# k# k# y# y# y4",
    ".. y3 y# k# k# y# y4 ..",
    ".. .. .. k3 k4 .. .. ..",
  ]),
  make("bird", "Pássaro", [
    ".. .. b2 b# b1 .. .. ..",
    ".. b2 b# b# b# b1 .. ..",
    "oB b# we b# b# b# b1 ..",
    ".. b# b# b# b# b# b# b1",
    ".. b3 b# b# b# b# b# b4",
    ".. .. b3 b# b# b# b4 ..",
    ".. .. .. o# .. o# .. ..",
    ".. .. o# o# .. o# o# ..",
  ]),
  make("frog", "Sapo", [
    ".. we .. .. .. .. we ..",
    ".. g# g# g# g# g# g# ..",
    "g2 g# g# g# g# g# g# g1",
    "g# g# g# g# g# g# g# g#",
    "g# g# r3 r# r# r4 g# g#",
    "g3 g# g# g# g# g# g# g4",
    ".. g# g# .. .. g# g# ..",
    ".. g# .. .. .. .. g# ..",
  ]),
  make("tulip", "Tulipa", [
    ".. rA .. rA rB .. rB ..",
    ".. r# r# r# r# r# r# ..",
    ".. r# r# r# r# r# r# ..",
    ".. r3 r# r# r# r# r4 ..",
    ".. .. r3 g# g# r4 .. ..",
    ".. g2 g# g# g# .. .. ..",
    ".. .. g# g# g1 .. .. ..",
    ".. .. .. g# .. .. .. ..",
  ]),
  make("cat", "Gato", [
    ".. oA .. .. .. .. oB ..",
    ".. o# o# o# o# o# o# ..",
    ".. o# we o# o# we o# ..",
    ".. o# o# k3 k4 o# o# ..",
    ".. o# o# o# o# o# o# ..",
    ".. o3 o# o# o# o# o4 ..",
    ".. .. o3 o# o# o4 .. ..",
    ".. .. .. .. .. .. .. ..",
  ]),
  make("fish", "Peixe", [
    ".. .. .. .. .. .. .. ..",
    ".. .. .. b2 b# b1 .. ..",
    "bA .. b2 b# b# b# b1 ..",
    "b# b# b# b# b# we b# b1",
    "bB b# b# b# b# b# b# b4",
    ".. .. b3 b# b# b# b4 ..",
    ".. .. .. b3 b4 .. .. ..",
    ".. .. .. .. .. .. .. ..",
  ]),
  make("heart", "Coração", [
    ".. r2 r# .. .. r# r1 ..",
    "r2 r# r# r1 r2 r# r# r1",
    "r# r# r# r# r# r# r# r#",
    "r3 r# r# r# r# r# r# r4",
    ".. r3 r# r# r# r# r4 ..",
    ".. .. r3 r# r# r4 .. ..",
    ".. .. .. r3 r4 .. .. ..",
    ".. .. .. .. .. .. .. ..",
  ]),
  make("house", "Casa", [
    ".. .. .. rB rA .. .. ..",
    ".. .. rB r# r# rA .. ..",
    ".. rB r# r# r# r# rA ..",
    "rB r# r# r# r# r# r# rA",
    ".. y# b# y# y# b# y# ..",
    ".. y# y# y# y# y# y# ..",
    ".. y# y# n# n# y# y# ..",
    ".. y# y# n# n# y# y# ..",
  ]),
  make("flower", "Flor", [
    ".. .. .. po po .. .. ..",
    ".. .. po po po po .. ..",
    ".. .. po yo yo po .. ..",
    ".. po po yo yo po po ..",
    ".. .. po po po po .. ..",
    ".. .. .. g# g# .. .. ..",
    ".. g2 g# g# g# .. .. ..",
    ".. .. .. g# g# g1 .. ..",
  ]),
  make("sun", "Sol", [
    ".. .. .. oo oo .. .. ..",
    ".. oo .. y# y# .. oo ..",
    ".. .. y2 y# y# y1 .. ..",
    "oo .. y# y# y# y# .. oo",
    "oo .. y# y# y# y# .. oo",
    ".. .. y3 y# y# y4 .. ..",
    ".. oo .. y# y# .. oo ..",
    ".. .. .. oo oo .. .. ..",
  ]),
];

export const designById = (id: string) => DESIGNS.find((d) => d.id === id);
