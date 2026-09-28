import { ImagePlus, Package, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getDb } from "../../db";
import { MAX_PHOTOS, photosRepo, productsRepo, type Photo } from "../../db/productsRepo";
import { money, parseDecimal } from "../../domain/format";
import { EMPTY_PRODUCT, productPricing, type Product, type ProductInput } from "../../domain/products";
import Alert from "../../ui/Alert";
import Button from "../../ui/Button";
import { fieldErrors } from "../../ui/fieldErrors";
import { photoToDataUrl } from "../../ui/photo";
import Segmented from "../../ui/Segmented";
import Sheet from "../../ui/Sheet";
import { errorText, useToast } from "../../ui/Toast";
import type { ProductsData } from "./data";

type Line = { id: string; qty: string };
type Props = { initial: Partial<Product>; data: ProductsData; onClose: () => void; onSaved: () => void };

const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const num = (s: string) => parseDecimal(s);
const opt = (s: string) => (s.trim() === "" ? null : num(s));

export default function ProductEditor({ initial, data, onClose, onSaved }: Props) {
  const base = { ...EMPTY_PRODUCT, ...initial };
  const [name, setName] = useState(base.name);
  const [kind, setKind] = useState(base.kind);
  const [sku, setSku] = useState(base.sku);
  const [notes, setNotes] = useState(base.notes);
  const [printerId, setPrinterId] = useState(base.printerId ? String(base.printerId) : "");
  const [n, setN] = useState({
    printH: str(Math.floor(base.printMinutes / 60)),
    printMin: str(Math.round(base.printMinutes % 60)),
    laborMin: str(base.laborMinutes),
    pieces: str(base.piecesPerPlate),
    freight: str(base.freight),
    manualPrice: str(base.manualPrice),
    consignmentPrice: str(base.consignmentPrice),
    stock: str(base.stock),
    minStock: str(base.minStock),
  });
  const [fil, setFil] = useState<Line[]>(base.composition.filaments.map((l) => ({ id: String(l.filamentId), qty: str(l.grams) })));
  const [mat, setMat] = useState<Line[]>(base.composition.materials.map((l) => ({ id: String(l.materialId), qty: str(l.qty) })));
  const [items, setItems] = useState<Line[]>(base.composition.items.map((l) => ({ id: String(l.productId), qty: str(l.qty) })));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pending, setPending] = useState<string[]>([]); // fotos de produto ainda não salvo
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const setNum = (k: keyof typeof n) => (e: React.ChangeEvent<HTMLInputElement>) => setN({ ...n, [k]: e.target.value });

  useEffect(() => {
    if (!initial.id) return;
    getDb()
      .then((db) => photosRepo.list(db, initial.id!))
      .then(setPhotos)
      .catch((e) => toast(`Erro ao carregar fotos: ${errorText(e)}`, "error"));
  }, [initial.id, toast]);

  const lines = (ls: Line[]) => ls.filter((l) => l.id);
  const input: ProductInput = {
    name,
    kind,
    sku,
    notes,
    printerId: printerId ? Number(printerId) : null,
    printMinutes: (num(n.printH) || 0) * 60 + (num(n.printMin) || 0),
    laborMinutes: num(n.laborMin) || 0,
    piecesPerPlate: num(n.pieces),
    freight: num(n.freight) || 0,
    manualPrice: opt(n.manualPrice),
    consignmentPrice: opt(n.consignmentPrice),
    stock: num(n.stock) || 0,
    minStock: num(n.minStock) || 0,
    composition: {
      filaments: lines(fil).map((l) => ({ filamentId: Number(l.id), grams: num(l.qty) || 0 })),
      materials: lines(mat).map((l) => ({ materialId: Number(l.id), qty: num(l.qty) || 0 })),
      items: kind === "kit" ? lines(items).map((l) => ({ productId: Number(l.id), qty: num(l.qty) || 0 })) : [],
    },
  };

  const pricing = livePricing(input, initial.id ?? -1, data);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    try {
      const urls = await Promise.all([...files].slice(0, MAX_PHOTOS).map(photoToDataUrl));
      if (initial.id) {
        const db = await getDb();
        for (const u of urls) await photosRepo.add(db, initial.id, u);
        setPhotos(await photosRepo.list(db, initial.id));
      } else setPending([...pending, ...urls].slice(0, MAX_PHOTOS));
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  async function photoAction(p: Photo, action: "cover" | "remove") {
    const db = await getDb();
    if (action === "cover") await photosRepo.makeCover(db, p.productId, p.id);
    else await photosRepo.remove(db, p.id);
    setPhotos(await photosRepo.list(db, p.productId));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const db = await getDb();
      if (initial.id) await productsRepo.update(db, initial.id, input);
      else {
        const id = await productsRepo.insert(db, input);
        for (const u of pending) await photosRepo.add(db, id, u);
      }
      toast(initial.id ? "Produto atualizado." : "Produto salvo.");
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
    } finally {
      setSaving(false);
    }
  }

  const others = data.products.filter((p) => p.id !== initial.id);
  const shownPhotos: { key: string; url: string; photo?: Photo }[] = initial.id ? photos.map((p) => ({ key: String(p.id), url: p.dataUrl, photo: p })) : pending.map((u, i) => ({ key: `p${i}`, url: u }));

  return (
    <Sheet
      wide
      title={initial.id ? `Editar ${base.name}` : kind === "kit" ? "Novo kit" : "Novo produto"}
      icon={Package}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {initial.id ? "Salvar alterações" : "Salvar produto"}
          </Button>
        </>
      }
    >
      <div className="product-editor">
        <div className="stack">
          <div className="grid two">
            <label>
              Nome
              <input data-autofocus value={name} maxLength={120} aria-invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <span className="error">{errors.name}</span>}
            </label>
            <label>
              Código (SKU, opcional)
              <input value={sku} maxLength={60} onChange={(e) => setSku(e.target.value)} />
            </label>
          </div>
          <Segmented
            label="Tipo"
            value={kind}
            options={[
              ["simple", "Produto impresso"],
              ["kit", "Kit (produto de produtos)"],
            ]}
            onChange={setKind}
          />

          {kind === "kit" && (
            <fieldset>
              <legend>Produtos do kit (por unidade do kit)</legend>
              <LineEditor lines={items} setLines={setItems} options={others.map((p) => ({ id: p.id, label: p.name }))} qtyLabel="Quantidade" emptyLabel="Escolha o produto" />
            </fieldset>
          )}
          <fieldset>
            <legend>Filamentos (mesa inteira)</legend>
            <LineEditor lines={fil} setLines={setFil} options={data.filaments.map((f) => ({ id: f.id, label: [f.material, f.color, f.brand].filter(Boolean).join(" · ") }))} qtyLabel="Gramas" emptyLabel="Escolha o filamento" />
          </fieldset>
          <fieldset>
            <legend>Materiais extras (mesa inteira)</legend>
            <LineEditor lines={mat} setLines={setMat} options={data.materials.map((m) => ({ id: m.id, label: `${m.name} (${m.unit})` }))} qtyLabel="Quantidade" emptyLabel="Escolha o material" />
          </fieldset>
          <fieldset>
            <legend>Impressão</legend>
            <div className="grid">
              <label>
                Impressora
                <select value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
                  <option value="">Nenhuma</option>
                  {data.printers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>Tempo (h)<input inputMode="decimal" value={n.printH} onChange={setNum("printH")} /></label>
              <label>+ minutos<input inputMode="decimal" value={n.printMin} onChange={setNum("printMin")} /></label>
              <label>Mão de obra (min)<input inputMode="decimal" value={n.laborMin} onChange={setNum("laborMin")} /></label>
              <label>
                Peças na mesa
                <input inputMode="numeric" value={n.pieces} aria-invalid={!!errors.piecesPerPlate} onChange={setNum("pieces")} />
                {errors.piecesPerPlate && <span className="error">Use 1 ou mais.</span>}
              </label>
              <label>Frete absorvido por peça (R$)<input inputMode="decimal" value={n.freight} onChange={setNum("freight")} /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Venda e estoque</legend>
            <div className="grid">
              <label>
                Preço manual (R$)
                <input inputMode="decimal" placeholder={pricing && "result" in pricing ? str(pricing.result.consumer) : ""} value={n.manualPrice} onChange={setNum("manualPrice")} />
                <span className="hint">Vazio = preço calculado</span>
              </label>
              <label>
                Repasse em consignação (R$)
                <input inputMode="decimal" value={n.consignmentPrice} onChange={setNum("consignmentPrice")} />
              </label>
              <label>Estoque pronto (un)<input inputMode="decimal" value={n.stock} onChange={setNum("stock")} /></label>
              <label>Estoque mínimo (un)<input inputMode="decimal" value={n.minStock} onChange={setNum("minStock")} /></label>
            </div>
            <label>
              Observações
              <textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </label>
          </fieldset>
          {errors._ && <Alert kind="error">{errors._}</Alert>}
        </div>

        <aside className="stack">
          <section className="card">
            <h3>Preço com os custos de hoje</h3>
            {"error" in pricing ? (
              <Alert kind="error">{pricing.error}</Alert>
            ) : (
              <>
                <table>
                  <tbody>
                    <tr><td>Custo por peça</td><td className="num"><b>{money(pricing.result.unitCost)}</b></td></tr>
                    <tr><td>Revenda (×{data.settings.multResale})</td><td className="num">{money(pricing.result.resale)}</td></tr>
                    <tr><td>Consumidor (×{data.settings.multConsumer})</td><td className="num">{money(pricing.result.consumer)}</td></tr>
                    {pricing.result.channels.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td className="num">{c.price === null ? "—" : money(c.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pricing.warnings.map((w) => (
                  <Alert key={w} kind="warn">
                    {w}
                  </Alert>
                ))}
              </>
            )}
          </section>
          <section className="card">
            <h3>
              Fotos <span className="muted small">{shownPhotos.length}/{MAX_PHOTOS} · a 1ª é a capa</span>
            </h3>
            <div className="photo-grid">
              {shownPhotos.map((p, i) => (
                <figure key={p.key}>
                  <img src={p.url} alt={`Foto ${i + 1} de ${name || "produto"}`} />
                  {p.photo && (
                    <figcaption>
                      {i > 0 && (
                        <button type="button" className="ghost icon-only" aria-label="Usar como capa" onClick={() => photoAction(p.photo!, "cover")}>
                          <Star aria-hidden />
                        </button>
                      )}
                      <button type="button" className="ghost icon-only danger" aria-label="Excluir foto" onClick={() => photoAction(p.photo!, "remove")}>
                        <Trash2 aria-hidden />
                      </button>
                    </figcaption>
                  )}
                  {!p.photo && (
                    <figcaption>
                      <button type="button" className="ghost icon-only danger" aria-label="Tirar foto" onClick={() => setPending(pending.filter((_, j) => j !== i))}>
                        <Trash2 aria-hidden />
                      </button>
                    </figcaption>
                  )}
                </figure>
              ))}
              {shownPhotos.length < MAX_PHOTOS && (
                <label className="photo-add">
                  <ImagePlus aria-hidden />
                  <span>Adicionar</span>
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
                </label>
              )}
            </div>
          </section>
        </aside>
      </div>
    </Sheet>
  );
}

/** Preço do rascunho, como se já estivesse salvo (o próprio produto entra no contexto para checar kits circulares). */
function livePricing(input: ProductInput, id: number, data: ProductsData) {
  const self: Product = { ...input, id, piecesPerPlate: Math.max(1, Math.floor(input.piecesPerPlate) || 1) };
  try {
    return productPricing(self, { ...data, products: [...data.products.filter((p) => p.id !== id), self] });
  } catch (e) {
    return { error: errorText(e) };
  }
}

function LineEditor(props: { lines: Line[]; setLines: (l: Line[]) => void; options: { id: number; label: string }[]; qtyLabel: string; emptyLabel: string }) {
  const { lines, setLines } = props;
  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="stack">
      {lines.map((l, i) => (
        <div className="row line" key={i}>
          <label>
            Item
            <select value={l.id} onChange={(e) => update(i, { id: e.target.value })}>
              <option value="">{props.emptyLabel}</option>
              {props.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {props.qtyLabel}
            <input inputMode="decimal" value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} />
          </label>
          <button type="button" className="link danger" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
            Remover
          </button>
        </div>
      ))}
      {props.options.length === 0 ? (
        <span className="hint">Nada cadastrado ainda.</span>
      ) : (
        <Button size="sm" icon={Plus} onClick={() => setLines([...lines, { id: "", qty: "" }])}>
          Adicionar
        </Button>
      )}
    </div>
  );
}
