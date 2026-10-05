import { BookImage } from "lucide-react";
import { useState } from "react";
import { productPricing, salePrice } from "../../domain/products";
import { catalogPdf } from "../../pdf/catalog";
import { loadPdfFonts } from "../../pdf/fonts";
import Alert from "../../ui/Alert";
import Button from "../../ui/Button";
import { saveFile } from "../../ui/saveFile";
import Segmented from "../../ui/Segmented";
import Sheet from "../../ui/Sheet";
import { errorText, useToast } from "../../ui/Toast";
import type { ProductsData } from "../products/data";
import type { Company } from "../../domain/customers";

/** Catálogo em PDF (12 por página) para mandar no WhatsApp: escolhe produtos e qual preço mostrar. */
export default function CatalogSheet({ data, company, onClose }: { data: ProductsData; company: Company; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(data.products.map((p) => p.id)));
  const [price, setPrice] = useState<"consumer" | "resale">("consumer");
  const [title, setTitle] = useState("Catálogo");
  const [busy, setBusy] = useState(false);
  const [noPrice, setNoPrice] = useState<string[]>([]);
  const toast = useToast();

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    const missing: string[] = [];
    const items = data.products
      .filter((p) => selected.has(p.id))
      .map((p) => {
        let value: number | null = p.manualPrice;
        try {
          const r = productPricing(p, data).result;
          value = price === "consumer" ? salePrice(p, r) : r.resale;
        } catch {
          // custo que não dá para calcular (kit dentro de si mesmo, composição ilegível): só o preço manual serve
        }
        if (value === null) missing.push(p.name);
        return { name: p.name, price: value ?? 0, photo: data.covers[p.id], sku: p.sku };
      });
    // M17: nada de "R$ 0,00" para o cliente; a pessoa desmarca ou põe um preço manual no produto
    setNoPrice(missing);
    if (missing.length) return;
    setBusy(true);
    try {
      const { bytes } = await catalogPdf(await loadPdfFonts(), company, items, title.trim() || "Catálogo");
      const path = await saveFile(`${title.trim() || "catalogo"}.pdf`.toLowerCase().replace(/\s+/g, "-"), bytes, "pdf", "PDF");
      if (path) {
        toast(`Catálogo salvo em ${path}`);
        onClose();
      }
    } catch (err) {
      toast(`Não foi possível gerar: ${errorText(err)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: number) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <Sheet
      title="Catálogo em PDF"
      icon={BookImage}
      onClose={onClose}
      onSubmit={generate}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="action" type="submit" disabled={busy || selected.size === 0}>
            Salvar PDF ({selected.size})
          </Button>
        </>
      }
    >
      {noPrice.length > 0 && (
        <Alert kind="error">Sem preço para mostrar: {noPrice.join(", ")}. O custo não dá para calcular e não há preço manual: desmarque ou ponha um preço manual no produto.</Alert>
      )}
      <label>
        Título
        <input data-autofocus value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <Segmented
        label="Preço mostrado"
        value={price}
        options={[
          ["consumer", "Venda direta (consumidor final)"],
          ["resale", "Para lojista (revenda)"],
        ]}
        onChange={setPrice}
      />
      <div className="row">
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(data.products.map((p) => p.id)))}>
          Marcar todos
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
          Desmarcar todos
        </Button>
      </div>
      <div className="check-list">
        {data.products.map((p) => (
          <label key={p.id} className="check">
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /> {p.name}
            {!data.covers[p.id] && <span className="muted small"> (sem foto)</span>}
          </label>
        ))}
      </div>
    </Sheet>
  );
}
