import { describe, expect, test } from "vitest";
import { addModule, canPlace, duplicate, groupModules, moveModules, newModule, removeModules, resizeModule, type DrawerLayout } from "./layout";

const empty: DrawerLayout = { cols: 4, rows: 3, modules: [] };
const withTwo = () => {
  const a = addModule(empty, { x: 0, y: 0, w: 2, h: 1 })!;
  return addModule(a, { x: 2, y: 0, w: 1, h: 2 })!;
};

describe("layout da gaveta (#140)", () => {
  test("cria módulo onde cabe; recusa fora da grade ou por cima de outro", () => {
    const l = withTwo();
    expect(l.modules).toHaveLength(2);
    expect(l.modules[0]).toMatchObject({ x: 0, y: 0, w: 2, h: 1, u: 3 });
    expect(addModule(l, { x: 1, y: 0, w: 1, h: 1 })).toBeNull(); // em cima do 1º
    expect(addModule(l, { x: 3, y: 2, w: 2, h: 1 })).toBeNull(); // passa da grade
    expect(canPlace(l, { x: 0, y: 1, w: 2, h: 2 })).toBe(true);
  });

  test("mover e redimensionar respeitam a grade e os vizinhos; devolvem layout novo", () => {
    const l = withTwo();
    const id = l.modules[0].id;
    const down = moveModules(l, [id], 0, 1);
    expect(down.modules[0]).toMatchObject({ x: 0, y: 1 });
    expect(l.modules[0].y).toBe(0);
    expect(moveModules(l, [id], 1, 0)).toBe(l); // bateria no vizinho: não mexe
    expect(moveModules(l, [id], -1, 0)).toBe(l); // sai da grade
    expect(resizeModule(l, id, 2, 3).modules[0]).toMatchObject({ w: 2, h: 3 });
    expect(resizeModule(l, id, 3, 1)).toBe(l); // invade o 2º
    expect(resizeModule(l, id, 0, 1)).toBe(l); // tamanho mínimo 1
  });

  test("mover vários juntos: os selecionados não batem entre si", () => {
    const l = withTwo();
    const moved = moveModules(l, l.modules.map((m) => m.id), 0, 1);
    expect(moved.modules.map((m) => m.y)).toEqual([1, 1]);
  });

  test("duplicar põe a cópia no primeiro lugar livre; apagar tira os selecionados", () => {
    const l = withTwo();
    const d = duplicate(l, [l.modules[0].id]);
    expect(d.modules).toHaveLength(3);
    expect(d.modules[2]).toMatchObject({ w: 2, h: 1, x: 0, y: 1 });
    expect(d.modules[2].id).not.toBe(l.modules[0].id);
    expect(removeModules(d, [d.modules[0].id, d.modules[1].id]).modules).toHaveLength(1);
  });

  test("módulos iguais viram uma linha com quantidade (para a lista de impressão)", () => {
    let l: DrawerLayout = { cols: 6, rows: 2, modules: [] };
    for (const x of [0, 1, 2]) l = addModule(l, { x, y: 0, w: 1, h: 1 })!;
    l = addModule(l, { x: 3, y: 0, w: 2, h: 1 })!;
    const groups = groupModules(l.modules);
    expect(groups.map((g) => [g.module.w, g.count])).toEqual([[1, 3], [2, 1]]);
    // mesma forma mas outra etiqueta: grupo separado
    l = { ...l, modules: l.modules.map((m, i) => (i === 0 ? { ...m, label: "Pregos" } : m)) };
    expect(groupModules(l.modules)).toHaveLength(3);
  });

  test("módulo novo segue a altura pedida e nunca passa de uMax", () => {
    expect(newModule({ x: 0, y: 0, w: 1, h: 1 }, 10).u).toBe(3);
    expect(newModule({ x: 0, y: 0, w: 1, h: 1 }, 2).u).toBe(2);
  });
});
