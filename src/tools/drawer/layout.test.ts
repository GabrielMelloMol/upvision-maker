import { describe, expect, test } from "vitest";
import { addModule, footprint, layoutReport, pasteModules, setFree, canPlace, compartmentsMm, cutsPatch, dividerMm, duplicate, groupModules, innerSize, MIN_COMPARTMENT, moveModules, newModule, removeModules, resizeModule, updateModules, type DrawerLayout } from "./layout";

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

describe("módulos modulares: meia casa e divisórias livres", () => {
  test("tamanho e posição em meia casa; 1,5 + 0,5 enchem 2 casas e uma terceira não cabe por cima", () => {
    let l: DrawerLayout = { cols: 2, rows: 1, modules: [] };
    l = addModule(l, { x: 0, y: 0, w: 1.5, h: 1 })!;
    l = addModule(l, { x: 1.5, y: 0, w: 0.5, h: 1 })!;
    expect(l.modules.map((m) => m.w)).toEqual([1.5, 0.5]);
    expect(addModule(l, { x: 1, y: 0, w: 0.5, h: 1 })).toBeNull();
    expect(addModule(l, { x: 1.5, y: 0, w: 1, h: 1 })).toBeNull(); // passa de 2 casas
    expect(resizeModule(l, l.modules[0].id, 1.7, 1).modules[0].w).toBe(1.5); // arredonda para meia casa (1,7 → 1,5)
    expect(resizeModule(l, l.modules[1].id, 0.2, 1)).toBe(l); // abaixo de meia casa: recusa
    expect(moveModules(l, [l.modules[1].id], -0.5, 0)).toBe(l); // bateria no vizinho
  });

  test("divisórias: posições pedidas viram frações; compartimentos desiguais somam o vão", () => {
    const m = newModule({ x: 0, y: 0, w: 2, h: 1 }, 6);
    const inner = innerSize(m, "x");
    const patch = cutsPatch(m, "x", [20, 55]);
    const next = { ...m, ...patch };
    expect(next.dividersX).toBe(3);
    expect(dividerMm(next, "x")).toEqual([20, 55]);
    const sizes = compartmentsMm(next, "x");
    expect(sizes).toHaveLength(3);
    expect(sizes[0]).toBeCloseTo(20 - 0.6, 1);
    expect(sizes.reduce((a, b) => a + b, 0) + 2 * 1.2).toBeCloseTo(inner, 1);
  });

  test("divisórias não passam das paredes nem ficam coladas: respeitam o compartimento mínimo", () => {
    const m = newModule({ x: 0, y: 0, w: 2, h: 1 }, 6);
    const inner = innerSize(m, "x");
    const out = { ...m, ...cutsPatch(m, "x", [-5, 3, inner + 10]) };
    expect(compartmentsMm(out, "x").every((v) => v >= MIN_COMPARTMENT - 0.6)).toBe(true);
    const mm = dividerMm(out, "x");
    expect(mm[0]).toBeGreaterThan(0);
    expect(mm[mm.length - 1]).toBeLessThan(inner);
  });

  test("módulos só são iguais para imprimir se as divisórias e o encaixe na grade forem iguais", () => {
    let l: DrawerLayout = { cols: 4, rows: 2, modules: [] };
    l = addModule(l, { x: 0, y: 0, w: 1, h: 1 })!;
    l = addModule(l, { x: 1, y: 0, w: 1, h: 1 })!;
    expect(groupModules(l.modules)).toHaveLength(1);
    const ids = [l.modules[1].id];
    expect(groupModules(updateModules(l, ids, cutsPatch(l.modules[1], "x", [18])).modules)).toHaveLength(2);
    expect(groupModules(moveModules(l, ids, 0.5, 0).modules)).toHaveLength(2); // fora da grade: sem pés
  });
});

describe("sem grade, colar e relatório do mapa", () => {
  const two = (): DrawerLayout => {
    let l: DrawerLayout = { cols: 4, rows: 2, modules: [] };
    l = addModule(l, { x: 0, y: 0, w: 1, h: 1 })!;
    return addModule(l, { x: 1, y: 0, w: 1, h: 1 })!;
  };

  test("medida livre em mm ocupa o espaço mínimo (múltiplo de meia casa) e recusa se bater em outra", () => {
    expect(footprint(30)).toBe(1); // 30,5 mm → 1 casa
    expect(footprint(60)).toBe(1.5);
    const l = two();
    const id = l.modules[0].id;
    const ok = setFree(l, id, { w: 30, d: 30 });
    expect(ok.modules[0]).toMatchObject({ freeW: 30, freeD: 30, w: 1, h: 1 });
    expect(setFree(l, id, { w: 70, d: 30 })).toBe(l); // 1,5+ casas bate na vizinha
    const back = setFree(ok, id, null);
    expect(back.modules[0].freeW).toBeUndefined();
  });

  test("colar mantém as posições relativas do grupo e usa o primeiro lugar que cabe", () => {
    const l = two();
    const r = pasteModules(l, l.modules);
    expect(r).toMatchObject({ placed: 2, skipped: 0 });
    expect(r.layout.modules.slice(2).map((m) => [m.x, m.y])).toEqual([[2, 0], [3, 0]]); // primeiro lugar livre, lado a lado como no original
    expect(new Set(r.layout.modules.map((m) => m.id)).size).toBe(4);
  });

  test("colar sem lugar conta o que sobrou, sem sobrepor", () => {
    let l: DrawerLayout = { cols: 2, rows: 1, modules: [] };
    l = addModule(l, { x: 0, y: 0, w: 1, h: 1 })!;
    const r = pasteModules(l, [...l.modules, ...l.modules]);
    expect(r.placed).toBe(1);
    expect(r.skipped).toBe(1);
    expect(layoutReport(r.layout).collisions).toHaveLength(0);
  });

  test("relatório: sobra de casas (conta meias), sobreposição e módulo fora da gaveta", () => {
    const l = two();
    expect(layoutReport(l)).toMatchObject({ collisions: [], outside: [], freeCells: 6 });
    const half = addModule(l, { x: 2, y: 0, w: 0.5, h: 1 })!;
    expect(layoutReport(half).freeCells).toBe(5.5);
    const bad: DrawerLayout = { ...l, modules: [l.modules[0], { ...l.modules[1], x: 0.5 }, { ...l.modules[1], id: "z", x: 3.5 }] };
    const rep = layoutReport(bad);
    expect(rep.collisions).toHaveLength(1);
    expect(rep.outside).toEqual(["z"]);
  });
});
