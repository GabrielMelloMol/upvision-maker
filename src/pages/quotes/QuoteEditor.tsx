import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { getDb } from "../../db";
import { quotesRepo } from "../../db/quotesRepo";
import { todayIso, type OrderInput } from "../../domain/orders";
import { addDays, quoteNumber, type Quote } from "../../domain/quotes";
import Button from "../../ui/Button";
import { photoToDataUrl } from "../../ui/photo";
import { errorText, useToast } from "../../ui/Toast";
import OrderEditor from "../orders/OrderEditor";
import type { QuotesData } from "./data";

const nowLocal = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/** Orçamento = pedido + validade + condições. Reaproveita o formulário do pedido. */
/** `draft`: itens vindos da calculadora para um orçamento novo. */
export default function QuoteEditor({ data, quote, draft, onClose, onSaved }: { data: QuotesData; quote?: Quote; draft?: Partial<OrderInput>; onClose: () => void; onSaved: (id: number) => void }) {
  const [validUntil, setValidUntil] = useState(quote?.validUntil ?? addDays(todayIso(), data.company.quoteValidityDays));
  const [terms, setTerms] = useState(quote?.terms ?? data.company.quoteTerms);
  const [refImage, setRefImage] = useState(quote?.refImage ?? "");
  const [refColor, setRefColor] = useState(quote?.refColor ?? "");
  const [refSize, setRefSize] = useState(quote?.refSize ?? "");
  const toast = useToast();

  async function onRefImage(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    try {
      setRefImage(await photoToDataUrl(f)); // JPEG até 1024 px: o PDF sempre aceita
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  async function saveAs(input: OrderInput): Promise<number> {
    const db = await getDb();
    const full = { ...input, validUntil, terms, refImage, refColor, refSize };
    if (quote) {
      await quotesRepo.update(db, quote, full);
      toast("Orçamento atualizado.");
      return quote.id;
    }
    const id = await quotesRepo.create(db, full, nowLocal());
    const created = (await quotesRepo.list(db)).find((q) => q.id === id);
    toast(`Orçamento ${created ? quoteNumber(created, data.company.quotePrefix) : id} criado.`);
    return id;
  }

  return (
    <OrderEditor
      data={data}
      draft={quote ?? draft}
      title={quote ? `Orçamento ${quoteNumber(quote, data.company.quotePrefix)}` : "Novo orçamento"}
      submitLabel={quote ? "Salvar orçamento" : "Criar orçamento"}
      saveAs={saveAs}
      onClose={onClose}
      onSaved={onSaved}
    >
      <div className="grid">
        <label>
          Válido até
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </label>
        <label className="span2">
          Condições comerciais
          <textarea value={terms} maxLength={2000} rows={2} onChange={(e) => setTerms(e.target.value)} />
        </label>
      </div>
      <fieldset className="plain">
        <legend>Referência do projeto 3D (opcional)</legend>
        <span className="hint">Sai no PDF com a imagem grande, a cor e o tamanho. Deixe vazio se não precisar.</span>
        <div className="row" style={{ alignItems: "center" }}>
          {refImage ? <img className="logo-preview" src={refImage} alt="Imagem de referência" /> : <span className="muted small">Sem imagem</span>}
          <label className="button-like">
            <span className="btn-inline">
              <ImagePlus size={16} aria-hidden /> {refImage ? "Trocar imagem" : "Escolher imagem de referência"}
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => onRefImage(e.target.files)} />
          </label>
          {refImage && (
            <Button variant="link" className="danger" onClick={() => setRefImage("")}>
              Remover imagem
            </Button>
          )}
        </div>
        <div className="grid">
          <label>
            Cor
            <input value={refColor} maxLength={60} placeholder="Ex.: Dourado, a definir" onChange={(e) => setRefColor(e.target.value)} />
          </label>
          <label>
            Tamanho
            <input value={refSize} maxLength={60} placeholder="Ex.: 25 cm" onChange={(e) => setRefSize(e.target.value)} />
          </label>
        </div>
      </fieldset>
    </OrderEditor>
  );
}
