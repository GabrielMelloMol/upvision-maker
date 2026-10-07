import { Boxes, Factory, FileSpreadsheet, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { getDb } from "../db";
import { productsRepo } from "../db/productsRepo";
import { money } from "../domain/format";
import { productPricing, salePrice, type Product } from "../domain/products";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import LoadError from "../ui/LoadError";
import { errorText, useToast } from "../ui/Toast";
import { takePendingOpen } from "../ui/search";
import { useData } from "../ui/useData";
import { EMPTY_DATA, loadProductsData } from "./products/data";
import { clearProductDraft, peekProductDraft } from "./products/draft";
import ExportSheet from "./products/ExportSheet";
import ProduceSheet from "./products/ProduceSheet";
import ProductEditor from "./products/ProductEditor";

export default function Products() {
  const [data, reload, , error] = useData(loadProductsData, EMPTY_DATA);
  const [editingState, setEditingState] = useState<Partial<Product> | null>(() => peekProductDraft());
  const [searchId, setSearchId] = useState(() => takePendingOpen("products")); // vindo da busca global
  const editing = editingState ?? (searchId !== null ? (data.products.find((p) => p.id === searchId) ?? null) : null);
  const setEditing = (p: Partial<Product> | null) => {
    setSearchId(null);
    setEditingState(p);
  };
  const [producing, setProducing] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const picked = data.products.filter((p) => selected.has(p.id));
  const toggle = (id: number) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const toast = useToast();
  useEffect(clearProductDraft, []);

  const rows = useMemo(
    () =>
      data.products.map((p) => {
        try {
          const { result, warnings } = productPricing(p, data);
          return { p, cost: result.unitCost, price: salePrice(p, result), warn: warnings.length > 0 };
        } catch {
          return { p, cost: null, price: null, warn: true };
        }
      }),
    [data],
  );

  async function remove(p: Product) {
    const usedIn = data.products.filter((k) => k.composition.items.some((i) => i.productId === p.id));
    const msg = usedIn.length ? `"${p.name}" faz parte de ${usedIn.map((k) => k.name).join(", ")}. Excluir mesmo assim?` : `Excluir "${p.name}"?`;
    if (!(await ask(msg, { title: "Excluir produto", kind: "warning", okLabel: "Excluir produto", cancelLabel: "Cancelar" }))) return;
    try {
      await productsRepo.remove(await getDb(), p.id);
      reload();
    } catch (e) {
      toast(`Não foi possível excluir: ${errorText(e)}`, "error");
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Produtos</h1>
          <p className="lead">Seus produtos, com o custo e o preço sempre atualizados.</p>
        </div>
        <div className="row">
          <Button icon={Boxes} onClick={() => setEditing({ kind: "kit" })}>
            Novo kit
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
            Novo produto
          </Button>
        </div>
      </div>

      {picked.length > 0 && (
        <div className="row" style={{ gap: "var(--space-3)", marginBottom: "var(--space-3)" }} role="status">
          <b>
            {picked.length} {picked.length === 1 ? "selecionado" : "selecionados"}
          </b>
          <Button size="sm" icon={FileSpreadsheet} onClick={() => setExporting(true)}>
            Exportar para marketplace
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Package} title="Nenhum produto ainda" action={<Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Cadastrar o primeiro</Button>}>
          Dica: na Calculadora, use “Salvar como produto” para não digitar tudo de novo.
        </EmptyState>
      ) : (
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={picked.length > 0 && picked.length === data.products.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(data.products.map((p) => p.id)) : new Set())}
                />
              </th>
              <th aria-label="Foto" />
              <th>Produto</th>
              <th className="num">Custo</th>
              <th className="num">Preço</th>
              <th className="num">Estoque pronto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, cost, price, warn }) => (
              <tr key={p.id}>
                <td>
                  <input type="checkbox" aria-label={`Selecionar ${p.name}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                </td>
                <td>{data.covers[p.id] ? <img className="thumb" src={data.covers[p.id]} alt="" /> : <span className="thumb empty"><Package size={16} aria-hidden /></span>}</td>
                <td>
                  <b>{p.name}</b> {p.kind === "kit" && <span className="badge ok">kit</span>} {warn && <span className="badge">confira</span>}
                  {p.sku && <div className="muted small">{p.sku}</div>}
                </td>
                <td className="num">{cost === null ? "—" : money(cost)}</td>
                <td className="num">
                  {price === null ? "—" : money(price)}
                  {price !== null && (
                    <div className="muted small">
                      {p.manualPrice !== null ? "preço digitado" : "preço calculado"}
                      <span
                        className="term-tip"
                        aria-hidden
                        data-tip={p.manualPrice !== null ? "Você digitou este preço; ele não muda quando o custo muda." : "Calculado pelo custo e pelos multiplicadores das Preferências; muda quando o custo muda."}
                      />
                    </div>
                  )}
                </td>
                <td className="num">
                  {p.stock.toLocaleString("pt-BR")} {p.minStock > 0 && p.stock <= p.minStock && <span className="badge">baixo</span>}
                </td>
                <td>
                  <div className="list-actions">
                    <Button variant="ghost" size="sm" icon={Factory} onClick={() => setProducing(p)}>
                      Produzir
                    </Button>
                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`} />
                    <Button variant="ghost" size="sm" icon={Trash2} className="danger" onClick={() => remove(p)} aria-label={`Excluir ${p.name}`} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <ProductEditor
          initial={editing}
          data={data}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {exporting && <ExportSheet products={picked} data={data} onClose={() => setExporting(false)} />}
      {producing && (
        <ProduceSheet
          product={producing}
          data={data}
          onClose={() => setProducing(null)}
          onDone={() => {
            setProducing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
