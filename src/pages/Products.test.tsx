// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri, type TauriState } from "../test/harness";
import { setPendingOpen } from "../ui/search";
import Products from "./Products";
import { setProductDraft } from "./products/draft";
import { readWorkbook } from "../domain/marketplace/xlsx";

const photo = vi.hoisted(() => ({ fail: false }));
vi.mock("../ui/photo", () => ({
  photoToDataUrl: async (f: File) => {
    if (photo.fail) throw new Error("Não consegui abrir esta imagem.");
    return `data:image/jpeg;base64,${btoa(f.name)}`;
  },
}));

const t = setupTauri();

type Mv = { kind: "filament" | "material" | "product"; id: number; delta: number };
/** Mesmo contrato do comando Rust apply_stock (src-tauri/src/stock.rs), sobre o SQLite do teste. */
function installApplyStock(s: TauriState) {
  const col = { filament: ["filaments", "stockG"], material: ["materials", "stock"], product: ["products", "stock"] } as const;
  s.handlers["apply_stock"] = ({ movements }) => {
    s.raw.exec("BEGIN");
    try {
      for (const mv of movements as Mv[]) {
        const [tb, c] = col[mv.kind];
        if (s.raw.prepare(`UPDATE ${tb} SET ${c} = ${c} + ? WHERE id = ?`).run(mv.delta, mv.id).changes === 0) throw `Item de estoque não encontrado (${tb} #${mv.id}).`;
      }
      s.raw.exec("COMMIT");
    } catch (e) {
      s.raw.exec("ROLLBACK");
      throw e;
    }
    return null;
  };
}

const COMP = (f: [number, number][] = [], m: [number, number][] = [], items: [number, number][] = []) =>
  JSON.stringify({ filaments: f.map(([filamentId, grams]) => ({ filamentId, grams })), materials: m.map(([materialId, qty]) => ({ materialId, qty })), items: items.map(([productId, qty]) => ({ productId, qty })) });

async function seedSupplies() {
  t.raw.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 85, 1000, 1000, 0);
    INSERT INTO materials (name, unit, unitPrice, stock, min) VALUES ('Embalagem', 'un', 5, 50, 0);
    INSERT INTO settings (id, data) VALUES (1, '{"maintenancePct":5,"failurePct":0}');`);
}

const dialog = (name: string | RegExp) => screen.findByRole("dialog", { name });

describe("Produtos: lista", () => {
  test("UX B4: o subtítulo diz o que se faz na tela, sem 'insumos'", async () => {
    renderWithApp(<Products />);
    expect(await screen.findByText("Seus produtos, com o custo e o preço sempre atualizados.")).toBeInTheDocument();
    expect(screen.queryByText(/insumos/)).not.toBeInTheDocument();
  });

  test("vazio mostra o estado vazio com atalho para cadastrar", async () => {
    const user = userEvent.setup();
    renderWithApp(<Products />);
    expect(await screen.findByText("Nenhum produto ainda")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cadastrar o primeiro" }));
    expect(await dialog("Novo produto")).toBeInTheDocument();
  });

  test("mostra custo, preço (manual), kit, SKU, estoque baixo e capa", async () => {
    await seedSupplies();
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate, stock, minStock, sku, manualPrice) VALUES
      ('Luminária', 'simple', '${COMP([[1, 120]], [[1, 1]])}', 1, 2, 5, 'LUM-1', NULL),
      ('Chaveiro', 'simple', '${COMP([[1, 10]])}', 1, 10, 0, '', 15),
      ('Kit', 'kit', '${COMP([], [], [[2, 2]])}', 1, 0, 0, '', NULL),
      ('Órfão', 'simple', '${COMP([[99, 10]])}', 1, 0, 0, '', NULL);
      INSERT INTO photos (owner, position, dataUrl, createdAt) VALUES ('product:1', 0, 'data:image/png;base64,AAA', '2026-10-01T10:00:00Z');`);
    renderWithApp(<Products />);
    const lum = await screen.findByRole("row", { name: /Luminária/ });
    expect(lum).toHaveTextContent("R$ 15,96"); // custo por peça (mesmo exemplo do E2E)
    expect(lum).toHaveTextContent("R$ 79,80");
    expect(lum).toHaveTextContent("preço calculado"); // UX B9: a legenda diz de onde vem o preço
    expect(lum.querySelector(".term-tip")).toHaveAttribute("data-tip", expect.stringContaining("muda quando o custo muda"));
    expect(lum).toHaveTextContent("LUM-1");
    expect(lum).toHaveTextContent("baixo");
    expect(lum.querySelector("img.thumb")).toHaveAttribute("src", "data:image/png;base64,AAA");
    const chav = screen.getByRole("row", { name: /Chaveiro/ });
    expect(chav).toHaveTextContent("R$ 15,00");
    expect(chav).toHaveTextContent("preço digitado");
    expect(chav).not.toHaveTextContent("preço calculado");
    expect(chav.querySelector(".term-tip")).toHaveAttribute("data-tip", expect.stringContaining("não muda quando o custo muda"));
    expect(chav).not.toHaveTextContent("baixo");
    expect(screen.getByRole("row", { name: /Kit/ })).toHaveTextContent("kit");
    expect(screen.getByRole("row", { name: /Órfão/ })).toHaveTextContent("confira");
  });

  test("kit circular não derruba a lista: custo e preço viram —", async () => {
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate) VALUES ('Loop', 'kit', '${COMP([], [], [[1, 1]])}', 1)`);
    renderWithApp(<Products />);
    const row = await screen.findByRole("row", { name: /Loop/ });
    expect(row).toHaveTextContent("—");
    expect(row).toHaveTextContent("confira");
  });

  test("excluir avisa se o produto está em um kit; cancelar mantém, confirmar apaga com as fotos", async () => {
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate) VALUES ('Peça', 'simple', '${COMP()}', 1), ('Kit festa', 'kit', '${COMP([], [], [[1, 2]])}', 1);
      INSERT INTO photos (owner, position, dataUrl, createdAt) VALUES ('product:1', 0, 'data:image/png;base64,AAA', '2026-10-01T10:00:00Z');`);
    const messages: string[] = [];
    t.handlers["plugin:dialog|message"] = (a) => {
      messages.push(String(a.message));
      return t.askAnswer ? "Excluir produto" : "Cancelar";
    };
    const user = userEvent.setup();
    renderWithApp(<Products />);
    t.askAnswer = false;
    await user.click(await screen.findByRole("button", { name: "Excluir Peça" }));
    await waitFor(() => expect(messages).toEqual(['"Peça" faz parte de Kit festa. Excluir mesmo assim?']));
    expect(await t.db.select("SELECT name FROM products ORDER BY id")).toHaveLength(2);

    t.askAnswer = true;
    await user.click(screen.getByRole("button", { name: "Excluir Kit festa" }));
    await waitFor(() => expect(screen.queryByRole("row", { name: /Kit festa/ })).not.toBeInTheDocument());
    expect(messages[1]).toBe('Excluir "Kit festa"?');
    await user.click(screen.getByRole("button", { name: "Excluir Peça" }));
    await waitFor(async () => expect(await t.db.select("SELECT id FROM products")).toEqual([]));
    expect(await t.db.select("SELECT id FROM photos")).toEqual([]);
  });

  test("erro do banco ao excluir vira aviso", async () => {
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate) VALUES ('Peça', 'simple', '${COMP()}', 1)`);
    t.handlers["plugin:sql|execute"] = () => {
      throw new Error("disco cheio");
    };
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Excluir Peça" }));
    expect(await screen.findByText("Não foi possível excluir: disco cheio")).toBeInTheDocument();
  });

  test("rascunho da calculadora abre o editor já preenchido (uma vez só)", async () => {
    setProductDraft({ name: "Vaso", piecesPerPlate: 2 });
    const { unmount } = renderWithApp(<Products />);
    const sheet = await dialog("Novo produto");
    expect(within(sheet).getByLabelText("Nome")).toHaveValue("Vaso");
    expect(within(sheet).getByLabelText("Peças na mesa")).toHaveValue("2");
    unmount();
    renderWithApp(<Products />);
    await screen.findByText("Nenhum produto ainda");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("busca global abre o produto em edição", async () => {
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate) VALUES ('Peça', 'simple', '${COMP()}', 1)`);
    setPendingOpen({ pageId: "products", recordId: 1 });
    renderWithApp(<Products />);
    expect(await dialog("Editar Peça")).toBeInTheDocument();
  });
});

describe("Produtos: editor", () => {
  test("impressora do catálogo no produto (#21): cadastra na hora, entra na energia e fica escolhida", async () => {
    await seedSupplies();
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Novo produto" }));
    const sheet = await dialog("Novo produto");
    await user.click(within(sheet).getByRole("button", { name: "Escolher do catálogo" }));
    const cat = await dialog("Catálogo de impressoras");
    await user.type(within(cat).getByRole("combobox", { name: "Buscar no catálogo" }), "bambu a1 mini");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(within(sheet).getByLabelText("Impressora")).toHaveDisplayValue("Bambu Lab A1 mini"));
    expect(await t.db.select("SELECT name, watts FROM printers")).toEqual([{ name: "Bambu Lab A1 mini", watts: 80 }]);
  });

  test("novo produto com filamento e material: preço ao vivo e composição gravada", async () => {
    await seedSupplies();
    t.raw.exec("INSERT INTO printers (name, watts) VALUES ('A1', 100)");
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Novo produto" }));
    const sheet = await dialog("Novo produto");
    await user.type(within(sheet).getByLabelText("Nome"), "Luminária");
    await user.type(within(sheet).getByLabelText("Código (SKU, opcional)"), "LUM");

    const fil = within(sheet).getByRole("group", { name: "Filamentos (mesa inteira)" });
    await user.click(within(fil).getByRole("button", { name: "Adicionar" }));
    await user.selectOptions(within(fil).getByLabelText("Item"), "PLA · Azul · X");
    await user.type(within(fil).getByLabelText("Gramas"), "120");
    const mat = within(sheet).getByRole("group", { name: "Materiais extras (mesa inteira)" });
    await user.click(within(mat).getByRole("button", { name: "Adicionar" }));
    await user.selectOptions(within(mat).getByLabelText("Item"), "Embalagem (un)");
    await user.type(within(mat).getByLabelText("Quantidade"), "1");

    const price = within(sheet).getByRole("row", { name: /Custo por peça/ });
    expect(price).toHaveTextContent("R$ 15,96");
    expect(within(sheet).getByLabelText(/Preço manual/)).toHaveAttribute("placeholder", "79,80");

    await user.selectOptions(within(sheet).getByLabelText("Impressora"), "A1");
    await user.type(within(sheet).getByLabelText("Tempo de impressão"), "1h30");
    await user.clear(within(sheet).getByLabelText("Estoque mínimo (un)"));
    await user.type(within(sheet).getByLabelText("Estoque mínimo (un)"), "3");
    await user.type(within(sheet).getByLabelText("Observações"), "frágil");
    await user.click(within(sheet).getByRole("button", { name: "Salvar produto" }));

    expect(await screen.findByText("Produto salvo.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [row] = await t.db.select<Record<string, unknown>>("SELECT name, sku, printerId, printMinutes, minStock, notes, composition FROM products");
    expect(row).toEqual({
      name: "Luminária",
      sku: "LUM",
      printerId: 1,
      printMinutes: 90,
      minStock: 3,
      notes: "frágil",
      composition: COMP([[1, 120]], [[1, 1]]),
    });
  });

  test("gramas com ponto de milhar na composição (A5): 1.200 g gravado como 1200; quantidade ilegível bloqueia o salvar", async () => {
    await seedSupplies();
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Novo produto" }));
    const sheet = await dialog("Novo produto");
    await user.type(within(sheet).getByLabelText("Nome"), "Vaso");
    const fil = within(sheet).getByRole("group", { name: "Filamentos (mesa inteira)" });
    await user.click(within(fil).getByRole("button", { name: "Adicionar" }));
    await user.selectOptions(within(fil).getByLabelText("Item"), "PLA · Azul · X");
    const grams = within(fil).getByLabelText("Gramas");
    await user.type(grams, "abc");
    await user.click(within(sheet).getByRole("button", { name: "Salvar produto" }));
    expect(await within(sheet).findByText(/Confira as quantidades/)).toBeInTheDocument();
    expect(await t.db.select("SELECT id FROM products")).toEqual([]);
    await user.clear(grams);
    await user.type(grams, "1.200");
    await user.click(within(sheet).getByRole("button", { name: "Salvar produto" }));
    expect(await screen.findByText("Produto salvo.")).toBeInTheDocument();
    const [row] = await t.db.select<{ composition: string }>("SELECT composition FROM products");
    expect(JSON.parse(row.composition).filaments).toEqual([{ filamentId: 1, grams: 1200 }]);
  });

  test("remover linha da composição e 'Nada cadastrado ainda' sem insumos", async () => {
    await seedSupplies();
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Novo produto" }));
    const sheet = await dialog("Novo produto");
    const fil = within(sheet).getByRole("group", { name: "Filamentos (mesa inteira)" });
    await user.click(within(fil).getByRole("button", { name: "Adicionar" }));
    expect(within(fil).getByLabelText("Item")).toBeInTheDocument();
    await user.click(within(fil).getByRole("button", { name: "Remover" }));
    expect(within(fil).queryByLabelText("Item")).not.toBeInTheDocument();
    // tipo kit mostra "Produtos do kit", sem outros produtos cadastrados
    await user.click(within(sheet).getByRole("button", { name: "Kit (produto de produtos)" }));
    expect(within(within(sheet).getByRole("group", { name: /Produtos do kit/ })).getByText("Nada cadastrado ainda.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Novo kit" })).toBeInTheDocument();
  });

  test("validação: nome obrigatório e peças na mesa ≥ 1", async () => {
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Novo produto" }));
    const sheet = await dialog("Novo produto");
    await user.clear(within(sheet).getByLabelText("Peças na mesa"));
    await user.type(within(sheet).getByLabelText("Peças na mesa"), "0");
    await user.click(within(sheet).getByRole("button", { name: "Salvar produto" }));
    expect(await within(sheet).findByText("Obrigatório.")).toBeInTheDocument();
    expect(within(sheet).getByText("Use 1 ou mais.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText(/^Nome/)).toHaveAttribute("aria-invalid", "true");
    expect(await t.db.select("SELECT id FROM products")).toEqual([]);
  });

  test("novo kit: componente com custo; kit dentro de si mesmo mostra erro no preço", async () => {
    await seedSupplies();
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate) VALUES ('Chaveiro', 'simple', '${COMP([[1, 100]])}', 1)`);
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Novo kit" }));
    const sheet = await dialog("Novo kit");
    await user.type(within(sheet).getByLabelText("Nome"), "Kit festa");
    const kit = within(sheet).getByRole("group", { name: /Produtos do kit/ });
    await user.click(within(kit).getByRole("button", { name: "Adicionar" }));
    await user.selectOptions(within(kit).getByLabelText("Item"), "Chaveiro");
    await user.type(within(kit).getByLabelText("Quantidade"), "2");
    const cost = within(sheet).getByRole("row", { name: /Custo por peça/ }).textContent;
    expect(cost).not.toContain("R$ 0,00");
    await user.click(within(sheet).getByRole("button", { name: "Salvar produto" }));
    await screen.findByText("Produto salvo.");
    const kitRow = (await t.db.select<{ kind: string; composition: string }>("SELECT kind, composition FROM products WHERE name = 'Kit festa'"))[0];
    expect(kitRow).toEqual({ kind: "kit", composition: COMP([], [], [[1, 2]]) });

    // Chaveiro vira kit contendo o Kit festa (que contém o Chaveiro): circular
    await user.click(await screen.findByRole("button", { name: "Editar Chaveiro" }));
    const ed = await dialog("Editar Chaveiro");
    await user.click(within(ed).getByRole("button", { name: "Kit (produto de produtos)" }));
    const items = within(ed).getByRole("group", { name: /Produtos do kit/ });
    await user.click(within(items).getByRole("button", { name: "Adicionar" }));
    await user.selectOptions(within(items).getByLabelText("Item"), "Kit festa");
    await user.type(within(items).getByLabelText("Quantidade"), "1");
    expect(within(ed).getByText(/está dentro de si mesmo/)).toBeInTheDocument();
  });

  test("editar: mostra aviso de insumo excluído e salva alterações", async () => {
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate, printMinutes, manualPrice) VALUES ('Peça', 'simple', '${COMP([[7, 10]])}', 2, 75, 12.5)`);
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Editar Peça" }));
    const sheet = await dialog("Editar Peça");
    expect(within(sheet).getByLabelText("Tempo de impressão")).toHaveValue("1h15");
    expect(within(sheet).getByLabelText(/Preço manual/)).toHaveValue("12,50");
    expect(within(sheet).getByText("Um filamento da composição foi excluído do cadastro.")).toBeInTheDocument();
    await user.clear(within(sheet).getByLabelText(/Preço manual/));
    await user.type(within(sheet).getByLabelText(/Repasse em consignação/), "8,5");
    await user.click(within(sheet).getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Produto atualizado.")).toBeInTheDocument();
    expect(await t.db.select("SELECT manualPrice, consignmentPrice FROM products")).toEqual([{ manualPrice: null, consignmentPrice: 8.5 }]);
  });

  test("A4: composição ilegível avisa no editor e não deixa salvar por cima do original", async () => {
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate) VALUES ('Velho', 'simple', '{"filaments":[{"filamentId":"x"}]}', 1)`);
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Editar Velho" }));
    const sheet = await dialog("Editar Velho");
    expect(within(sheet).getByText(/Não consegui ler a composição do produto "Velho"/)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
    expect(await t.db.select("SELECT composition FROM products")).toEqual([{ composition: '{"filaments":[{"filamentId":"x"}]}' }]);
  });

  test("A6: com variações, salvar sem mexer nelas mantém o estoque pronto baixado pelos pedidos e avisa a diferença", async () => {
    const variants = JSON.stringify([{ name: "Azul", sku: "", stock: 5, price: null, swaps: [] }, { name: "Verde", sku: "", stock: 5, price: null, swaps: [] }]);
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate, stock, variants) VALUES ('Vaso', 'simple', '${COMP([])}', 1, 7, '${variants}')`);
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Editar Vaso" }));
    const sheet = await dialog("Editar Vaso");
    expect(within(sheet).getByText(/As variações somam 10, mas o estoque pronto é 7/)).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText("Observações"), "nova descrição");
    await user.click(within(sheet).getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Produto atualizado.")).toBeInTheDocument();
    expect(await t.db.select("SELECT stock FROM products")).toEqual([{ stock: 7 }]);
  });

  test("fotos de produto novo ficam pendentes e são gravadas ao salvar; dá para tirar antes", async () => {
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Novo produto" }));
    const sheet = await dialog("Novo produto");
    await user.type(within(sheet).getByLabelText("Nome"), "Vaso");
    const input = sheet.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })]);
    expect(await within(sheet).findByAltText("Foto 2 de Vaso")).toBeInTheDocument();
    expect(within(sheet).getByText(/2\/8/)).toBeInTheDocument();
    await user.click(within(sheet).getAllByRole("button", { name: "Tirar foto" })[0]);
    expect(within(sheet).queryByAltText("Foto 2 de Vaso")).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Salvar produto" }));
    await screen.findByText("Produto salvo.");
    expect(await t.db.select("SELECT CAST(substr(owner, 9) AS INTEGER) AS productId, position, dataUrl FROM photos")).toEqual([{ productId: 1, position: 0, dataUrl: `data:image/jpeg;base64,${btoa("b.png")}` }]);
  });

  test("produto salvo: as fotos dele na galeria comum do app (#162), sem as de outros donos", async () => {
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate) VALUES ('Vaso', 'simple', '${COMP()}', 1);
      INSERT INTO photos (owner, position, dataUrl, createdAt) VALUES ('product:1', 0, 'data:image/png;base64,UM', '2026-10-01T10:00:00Z'),
        ('product:1', 1, 'data:image/png;base64,DOIS', '2026-10-01T10:00:00Z'), ('print:1', 0, 'data:image/png;base64,FICHA', '2026-10-01T10:00:00Z');`);
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Editar Vaso" }));
    const gallery = within(await dialog("Editar Vaso")).getByRole("list", { name: "Fotos" });
    expect(await within(gallery).findByAltText("Capa")).toHaveAttribute("src", "data:image/png;base64,UM");
    expect(within(gallery).getByAltText("Foto 2")).toHaveAttribute("src", "data:image/png;base64,DOIS");
    expect(within(gallery).getAllByRole("img")).toHaveLength(2); // a da ficha (print:1) não entra
  });

  test("M18: foto que falha ao gravar depois do produto não deixa o formulário aberto como novo (Salvar de novo duplicaria)", async () => {
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Novo produto" }));
    const sheet = await dialog("Novo produto");
    await user.type(within(sheet).getByLabelText("Nome"), "Vaso");
    await user.upload(sheet.querySelector<HTMLInputElement>('input[type="file"]')!, [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })]);
    expect(await within(sheet).findByAltText("Foto 2 de Vaso")).toBeInTheDocument();
    t.handlers["plugin:sql|execute"] = (args) => {
      if (String(args.query).startsWith("INSERT INTO photos")) throw new Error("foto enorme");
      const r = t.raw.prepare(String(args.query)).run(...((args.values as never[]) ?? []));
      return [Number(r.changes), Number(r.lastInsertRowid)];
    };
    await user.click(within(sheet).getByRole("button", { name: "Salvar produto" }));
    expect(await screen.findByText(/Produto salvo, mas 2 fotos não entraram: foto enorme/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); // não fica "novo" para salvar de novo
    expect(await t.db.select("SELECT name FROM products")).toEqual([{ name: "Vaso" }]);
  });

  test("foto que não abre vira aviso", async () => {
    photo.fail = true;
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Novo produto" }));
    const sheet = await dialog("Novo produto");
    await user.upload(sheet.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "x.png", { type: "image/png" }));
    expect(await screen.findByText("Não consegui abrir esta imagem.")).toBeInTheDocument();
    photo.fail = false;
  });
});

describe("Produtos: produzir", () => {
  test("baixa os insumos e soma ao estoque pronto numa transação", async () => {
    await seedSupplies();
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate, stock) VALUES ('Luminária', 'simple', '${COMP([[1, 120]], [[1, 2]])}', 2, 1)`);
    installApplyStock(t);
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Produzir" }));
    const sheet = await dialog("Produzir Luminária");
    const qty = within(sheet).getByLabelText("Quantas unidades ficaram prontas?");
    expect(qty).toHaveValue("2"); // peças na mesa
    await user.clear(qty);
    await user.type(qty, "4");
    expect(within(sheet).getByRole("row", { name: /PLA · Azul · X/ })).toHaveTextContent("240 g");
    expect(within(sheet).getByRole("row", { name: /Embalagem/ })).toHaveTextContent("4 un");
    await user.click(within(sheet).getByRole("button", { name: "Registrar produção" }));
    expect(await screen.findByText("4 × Luminária no estoque pronto.")).toBeInTheDocument();
    expect(await t.db.select("SELECT stockG FROM filaments")).toEqual([{ stockG: 760 }]);
    expect(await t.db.select("SELECT stock FROM materials")).toEqual([{ stock: 46 }]);
    await waitFor(() => expect(screen.getByRole("row", { name: /Luminária/ })).toHaveTextContent("5"));
  });

  test("B10: produzir '1.000' unidades é mil, não uma", async () => {
    await seedSupplies();
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate, stock) VALUES ('Botão', 'simple', '${COMP([[1, 10]])}', 1, 0)`);
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Produzir" }));
    const sheet = await dialog("Produzir Botão");
    const qty = within(sheet).getByLabelText("Quantas unidades ficaram prontas?");
    await user.clear(qty);
    await user.type(qty, "1.000");
    expect(within(sheet).getByRole("row", { name: /PLA · Azul · X/ })).toHaveTextContent("10.000 g");
  });

  test("quantidade inválida desabilita; insumo insuficiente avisa 'falta'; erro do Rust vira aviso", async () => {
    t.raw.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PETG', '', '', 100, 1000, 5, 0);
      INSERT INTO products (name, kind, composition, piecesPerPlate) VALUES ('Peça', 'simple', '${COMP([[1, 10], [9, 1]], [[9, 1]])}', 1)`);
    t.handlers["apply_stock"] = () => {
      throw "Item de estoque não encontrado (filaments #9).";
    };
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Produzir" }));
    const sheet = await dialog("Produzir Peça");
    const qty = within(sheet).getByLabelText("Quantas unidades ficaram prontas?");
    await user.clear(qty);
    await user.type(qty, "0");
    expect(within(sheet).getByRole("button", { name: "Registrar produção" })).toBeDisabled();
    await user.clear(qty);
    await user.type(qty, "1");
    expect(within(sheet).getByRole("row", { name: /PETG/ })).toHaveTextContent("falta");
    expect(within(sheet).getByRole("row", { name: /Filamento excluído/ })).toHaveTextContent("falta");
    expect(within(sheet).getByRole("row", { name: /Material excluído/ })).toBeInTheDocument();
    expect(within(sheet).getByText(/Algum insumo vai ficar negativo/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Registrar produção" }));
    expect(await screen.findByText("Não foi possível registrar: Item de estoque não encontrado (filaments #9).")).toBeInTheDocument();
    expect(await t.db.select("SELECT stockG FROM filaments")).toEqual([{ stockG: 5 }]);
  });

  test("kit produzido consome o estoque pronto dos componentes; kit circular mostra erro e bloqueia", async () => {
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate, stock) VALUES ('Chaveiro', 'simple', '${COMP()}', 1, 10),
      ('Kit', 'kit', '${COMP([], [], [[1, 3]])}', 1, 0), ('Loop', 'kit', '${COMP([], [], [[3, 1]])}', 1, 0)`);
    installApplyStock(t);
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(within(await screen.findByRole("row", { name: /Kit/ })).getByRole("button", { name: "Produzir" }));
    const sheet = await dialog("Produzir Kit");
    expect(within(sheet).getByRole("row", { name: /Chaveiro \(pronto\)/ })).toHaveTextContent("3 un");
    await user.click(within(sheet).getByRole("button", { name: "Registrar produção" }));
    await screen.findByText("1 × Kit no estoque pronto.");
    expect(await t.db.select("SELECT name, stock FROM products ORDER BY id")).toEqual([
      { name: "Chaveiro", stock: 7 },
      { name: "Kit", stock: 1 },
      { name: "Loop", stock: 0 },
    ]);

    await user.click(within(screen.getByRole("row", { name: /Loop/ })).getByRole("button", { name: "Produzir" }));
    const loop = await dialog("Produzir Loop");
    expect(within(loop).getByText(/está dentro de si mesmo/)).toBeInTheDocument();
    expect(within(loop).getByRole("button", { name: "Registrar produção" })).toBeDisabled();
    await user.click(within(loop).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("Produtos: planilha de upload em massa (#78)", () => {
  const seed = async () => {
    await seedSupplies();
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate, sku, stock) VALUES ('Luminária de lua', 'simple', '${COMP([[1, 120]], [[1, 1]])}', 1, 'LUM-1', 3),
      ('Chaveiro', 'simple', '${COMP([[1, 20]])}', 1, '', 10);`);
  };

  test("anúncio e fiscal no editor: gravados no produto; NCM com tamanho errado avisa", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Editar Luminária de lua" }));
    const sheet = await dialog(/Luminária de lua/);
    await user.click(within(sheet).getByText("Anúncio e fiscal (opcional)"));
    expect(within(sheet).getByLabelText(/^Peso embalado/)).toHaveAttribute("placeholder", "120 g de filamento + embalagem");
    await user.type(within(sheet).getByLabelText("Descrição do anúncio"), "Luminária impressa em 3D");
    await user.type(within(sheet).getByLabelText(/^NCM/), "1234");
    await user.click(within(sheet).getByRole("button", { name: /Salvar/ }));
    expect(await within(sheet).findByText("O NCM tem 8 números.")).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText(/^NCM/), "5000");
    await user.type(within(sheet).getByLabelText(/^Peso embalado/), "180");
    await user.click(within(sheet).getByRole("button", { name: /Salvar/ }));
    await waitFor(async () =>
      expect((await t.db.select("SELECT description, ncm, weightG FROM products WHERE id = 1"))[0]).toEqual({ description: "Luminária impressa em 3D", ncm: "12345000", weightG: 180 }),
    );
  });

  test("exportar com o escopo do fs do app instalado: planilha e fotos na pasta escolhida, sem 'forbidden path' (A12)", async () => {
    await seed();
    await t.db.execute("INSERT INTO photos (owner, position, dataUrl, createdAt) VALUES ('product:1', 0, 'data:image/jpeg;base64,/9j/', '2026-10-01')");
    t.fsScope = true; // como no app: o diálogo libera só o que devolveu
    t.openPath = "/Documentos/loja";
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar todos" }));
    await user.click(screen.getByRole("button", { name: "Exportar para marketplace" }));
    const sheet = await dialog("Exportar para marketplace");
    await user.click(within(sheet).getByRole("button", { name: "Salvar planilha" }));
    expect(await screen.findByText(/Planilha salva em \/Documentos\/loja\/shopee-upload-em-massa-.*\.xlsx\. .*1 foto salva na mesma pasta/)).toBeInTheDocument();
    const saved = [...t.files.keys()].filter((p) => p.startsWith("/Documentos/loja/"));
    expect(saved.some((p) => p.endsWith(".xlsx"))).toBe(true);
    expect(saved.some((p) => /-1\.jpg$/.test(p))).toBe(true);
  });

  test("selecionar e exportar: prévia do que falta e planilha salva com uma linha por produto", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("checkbox", { name: "Selecionar todos" }));
    expect(screen.getByRole("status")).toHaveTextContent("2 selecionados");
    await user.click(screen.getByRole("button", { name: "Exportar para marketplace" }));
    const sheet = await dialog("Exportar para marketplace");
    expect(within(sheet).getByLabelText("Preço do canal")).toHaveValue("Shopee");
    expect(sheet).toHaveTextContent("2 produtos · faltando: descrição (2), NCM (2), categoria (2)");
    await user.type(within(sheet).getByLabelText(/^Categoria/), "101152");
    expect(sheet).toHaveTextContent("faltando: descrição (2), NCM (2)");
    t.openPath = "/saida"; // a pasta da planilha e das fotos (A12)
    await user.click(within(sheet).getByRole("button", { name: "Salvar planilha" }));
    expect(await screen.findByText(/Planilha salva em .*shopee-upload-em-massa-.*\.xlsx/)).toBeInTheDocument();
    const [path, bytes] = [...t.files.entries()].find(([p]) => p.endsWith(".xlsx"))!;
    expect(path).toMatch(/shopee/);
    const rows = readWorkbook(bytes)[0].rows;
    expect(rows).toHaveLength(3);
    const lum = rows.find((r) => r[1] === "Luminária de lua")!;
    expect(lum[0]).toBe("101152");
    expect(lum[rows[0].indexOf("Preço")]).toBe("39.92");
    expect(lum[rows[0].indexOf("Peso")]).toBe("0.15"); // 120 g + 30 g de embalagem
  });
});
