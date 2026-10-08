import { expect, test } from "vitest";
import { AMS_NEED, worksWithoutAms } from "./amsTable";
import { MODELS } from "./defs";

/** Modelos que pedem foto ou SVG e por isso saem sem selo (a tabela é gerada no padrão, sem entrada do usuário). */
const SEM_SELO = new Set<string>([]);

// #118: o selo e o filtro "funciona sem AMS" da galeria leem esta tabela; modelo novo sem rodar `npm run ams-table`
// ficaria sem selo e fora do filtro sem ninguém perceber.
test("todo modelo pronto tem entrada na tabela de AMS (e a tabela não tem modelo que não existe mais)", () => {
  const ids = MODELS.map((m) => m.id);
  expect(ids.filter((id) => AMS_NEED[id] === undefined && !SEM_SELO.has(id)), "rode `npm run ams-table`").toEqual([]);
  expect(Object.keys(AMS_NEED).filter((id) => !ids.includes(id)), "entradas de modelos removidos").toEqual([]);
});

test("worksWithoutAms: 1 cor e troca manual funcionam sem AMS; só 'ams' precisa; sem entrada não vale", () => {
  const por = (v: string) => Object.entries(AMS_NEED).find(([, x]) => x === v)?.[0];
  expect(worksWithoutAms(por("uma-cor")!)).toBe(true);
  expect(worksWithoutAms(por("troca-manual")!)).toBe(true);
  expect(worksWithoutAms(por("ams")!)).toBe(false);
  expect(worksWithoutAms("modelo-que-nao-existe")).toBe(false);
});
