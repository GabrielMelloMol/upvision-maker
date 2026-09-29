// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri, type TauriState } from "../test/harness";
import { setPendingOpen } from "../ui/search";
import Products from "./Products";
import { setProductDraft } from "./products/draft";

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
      INSERT INTO product_photos (productId, position, dataUrl) VALUES (1, 0, 'data:image/png;base64,AAA');`);
    renderWithApp(<Products />);
    const lum = await screen.findByRole("row", { name: /Luminária/ });
    expect(lum).toHaveTextContent("R$ 15,96"); // custo por peça (mesmo exemplo do E2E)
    expect(lum).toHaveTextContent("R$ 79,80");
    expect(lum).toHaveTextContent("LUM-1");
    expect(lum).toHaveTextContent("baixo");
    expect(lum.querySelector("img.thumb")).toHaveAttribute("src", "data:image/png;base64,AAA");
    const chav = screen.getByRole("row", { name: /Chaveiro/ });
    expect(chav).toHaveTextContent("R$ 15,00");
    expect(chav).toHaveTextContent("manual");
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
      INSERT INTO product_photos (productId, position, dataUrl) VALUES (1, 0, 'data:image/png;base64,AAA');`);
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
    expect(await t.db.select("SELECT id FROM product_photos")).toEqual([]);
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
    expect(await t.db.select("SELECT productId, position, dataUrl FROM product_photos")).toEqual([{ productId: 1, position: 0, dataUrl: `data:image/jpeg;base64,${btoa("b.png")}` }]);
  });

  test("fotos de produto salvo: adiciona, troca a capa e exclui direto no banco", async () => {
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate) VALUES ('Vaso', 'simple', '${COMP()}', 1);
      INSERT INTO product_photos (productId, position, dataUrl) VALUES (1, 0, 'data:image/png;base64,UM');`);
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Editar Vaso" }));
    const sheet = await dialog("Editar Vaso");
    expect(await within(sheet).findByAltText("Foto 1 de Vaso")).toHaveAttribute("src", "data:image/png;base64,UM");
    expect(within(sheet).queryByRole("button", { name: "Usar como capa" })).not.toBeInTheDocument(); // a capa já é a 1ª
    await user.upload(sheet.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "x.png", { type: "image/png" }));
    expect(await within(sheet).findByAltText("Foto 2 de Vaso")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Usar como capa" }));
    await waitFor(() => expect(within(sheet).getByAltText("Foto 1 de Vaso")).toHaveAttribute("src", `data:image/jpeg;base64,${btoa("x.png")}`));
    await user.click(within(sheet).getAllByRole("button", { name: "Excluir foto" })[0]);
    await waitFor(async () => expect(await t.db.select("SELECT dataUrl FROM product_photos")).toEqual([{ dataUrl: "data:image/png;base64,UM" }]));

    t.handlers["plugin:sql|execute"] = () => {
      throw new Error("banco travado");
    };
    await user.click(within(sheet).getByRole("button", { name: "Excluir foto" }));
    expect(await screen.findByText("Não foi possível alterar a foto: banco travado")).toBeInTheDocument();
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

  test("com 8 fotos some o botão de adicionar", async () => {
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate) VALUES ('Vaso', 'simple', '${COMP()}', 1)`);
    for (let i = 0; i < 8; i++) t.raw.exec(`INSERT INTO product_photos (productId, position, dataUrl) VALUES (1, ${i}, 'data:image/png;base64,A${i}')`);
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Editar Vaso" }));
    const sheet = await dialog("Editar Vaso");
    await within(sheet).findByAltText("Foto 8 de Vaso");
    expect(sheet.querySelector('input[type="file"]')).toBeNull(); // limite de 8
  });

  test("erro ao carregar fotos vira aviso", async () => {
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate) VALUES ('Vaso', 'simple', '${COMP()}', 1)`);
    const user = userEvent.setup();
    renderWithApp(<Products />);
    await user.click(await screen.findByRole("button", { name: "Editar Vaso" }));
    t.raw.exec("DROP TABLE product_photos");
    await user.click(within(await dialog("Editar Vaso")).getByRole("button", { name: "Cancelar" }));
    await user.click(await screen.findByRole("button", { name: "Editar Vaso" }));
    expect(await screen.findByText(/Erro ao carregar fotos/)).toBeInTheDocument();
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
