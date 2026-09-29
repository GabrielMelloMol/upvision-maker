import { ImagePlus, Package, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getDb } from "../../db";
import { MAX_PHOTOS, photosRepo, productsRepo, type Photo } from "../../db/productsRepo";
import { money, parseDecimal } from "../../domain/format";
import MoneyField from "../../ui/MoneyField";
import { formatDuration, formatMoneyInput, parseDuration, parseMoney } from "../../ui/parse";
import TimeField from "../../ui/TimeField";
import { EMPTY_PRODUCT, productPricing, type Product, type ProductInput } from "../../domain/products";
import Alert from "../../ui/Alert";
import Button from "../../ui/Button";
import { fieldErrors } from "../../ui/fieldErrors";
import { photoToDataUrl } from "../../ui/photo";
import Segmented from "../../ui/Segmented";
import Sheet from "../../ui/Sheet";
import { errorText, useToast } from "../../ui/Toast";
import type { ProductsData } from "./data";
import type { Printer } from "../../domain/entities";
import PrinterCatalogButton from "../calculator/PrinterCatalogButton";

type Line = { id: string; qty: string };
type Props = { initial: Partial<Product>; data: ProductsData; onClose: () => void; onSaved: () => void };

const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const num = (s: string) => parseDecimal(s);
/** Preço opcional: vazio = sem preço manual. */
const optMoney = (s: string) => (s.trim() === "" ? null : parseMoney(s));
const brl = (v: number) => formatMoneyInput(String(v));

export default function ProductEditor({ initial, data, onClose, onSaved }: Props) {
  const base = { ...EMPTY_PRODUCT, ...initial };
  const [name, setName] = useState(base.name);
  const [kind, setKind] = useState(base.kind);
  const [sku, setSku] = useState(base.sku);
  const [notes, setNotes] = useState(base.notes);
  const [printerId, setPrinterId] = useState(base.printerId ? String(base.printerId) : "");
  // impressoras cadastradas pelo catálogo aqui mesmo (os dados da página só recarregam ao fechar)
  const [added, setAdded] = useState<Printer[]>([]);
  const printerList = [...data.printers, ...added];
  const [n, setN] = useState({
    time: base.printMinutes > 0 ? formatDuration(base.printMinutes) : "",
    labor: base.laborMinutes > 0 ? formatDuration(base.laborMinutes) : "",
    pieces: str(base.piecesPerPlate),
    freight: base.freight ? brl(base.freight) : "",
    manualPrice: base.manualPrice != null ? brl(base.manualPrice) : "",
    consignmentPrice: base.consignmentPrice != null ? brl(base.consignmentPrice) : "",
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
  const setText = (k: keyof typeof n) => (v: string) => setN((cur) => ({ ...cur, [k]: v }));

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
    printMinutes: parseDuration(n.time) || 0,
    laborMinutes: parseDuration(n.labor, "min") || 0,
    piecesPerPlate: num(n.pieces),
    freight: parseMoney(n.freight) || 0,
    manualPrice: optMoney(n.manualPrice),
    consignmentPrice: optMoney(n.consignmentPrice),
    stock: num(n.stock) || 0,
    minStock: num(n.minStock) || 0,
    composition: {
      filaments: lines(fil).map((l) => ({ filamentId: Number(l.id), grams: num(l.qty) || 0 })),
      materials: lines(mat).map((l) => ({ materialId: Number(l.id), qty: num(l.qty) || 0 })),
      items: kind === "kit" ? lines(items).map((l) => ({ productId: Number(l.id), qty: num(l.qty) || 0 })) : [],
    },
  };

  const pricing = livePricing(input, initial.id ?? -1, { ...data, printers: printerList });

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
    try {
      const db = await getDb();
      if (action === "cover") await photosRepo.makeCover(db, p.productId, p.id);
      else await photosRepo.remove(db, p.id);
      setPhotos(await photosRepo.list(db, p.productId));
    } catch (e) {
      toast(`Não foi possível alterar a foto: ${errorText(e)}`, "error");
    }
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
              <div className="stack" style={{ gap: 4 }}>
                <label>
                  Impressora
                  <select value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
                    <option value="">Nenhuma</option>
                    {printerList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <PrinterCatalogButton
                  printers={printerList}
                  onPicked={(p) => {
                    if (!printerList.some((x) => x.id === p.id)) setAdded((a) => [...a, p]);
                    setPrinterId(String(p.id));
                  }}
                />
              </div>
              <TimeField label="Tempo de impressão" value={n.time} onChange={setText("time")} />
              <TimeField label="Mão de obra" bare="min" value={n.labor} onChange={setText("labor")} placeholder="15 min" hint="Ex.: 15 (minutos), 1h10" />
              <label>
                Peças na mesa
                <input inputMode="numeric" value={n.pieces} aria-invalid={!!errors.piecesPerPlate} onChange={setNum("pieces")} />
                {errors.piecesPerPlate && <span className="error">Use 1 ou mais.</span>}
              </label>
              <MoneyField label="Frete absorvido por peça" value={n.freight} onChange={setText("freight")} />
            </div>
          </fieldset>
          <fieldset>
            <legend>Venda e estoque</legend>
            <div className="grid">
              <MoneyField
                label="Preço manual"
                placeholder={pricing && "result" in pricing ? brl(pricing.result.consumer) : ""}
                value={n.manualPrice}
                onChange={setText("manualPrice")}
                hint="Vazio = preço calculado"
              />
              <MoneyField label="Repasse em consignação" value={n.consignmentPrice} onChange={setText("consignmentPrice")} />
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
                    <tr><td>Para lojista (×{data.settings.multResale})</td><td className="num">{money(pricing.result.resale)}</td></tr>
                    <tr><td>Venda direta (×{data.settings.multConsumer})</td><td className="num">{money(pricing.result.consumer)}</td></tr>
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
