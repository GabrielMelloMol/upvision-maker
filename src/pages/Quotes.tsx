import { ask } from "@tauri-apps/plugin-dialog";
import { ArrowRightLeft, BookImage, FileDown, FileSignature, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getDb } from "../db";
import { quotesRepo } from "../db/quotesRepo";
import { money } from "../domain/format";
import { orderTotals, todayIso } from "../domain/orders";
import { isExpired, quoteNumber, type Quote } from "../domain/quotes";
import { loadPdfFonts } from "../pdf/fonts";
import { quotePdf } from "../pdf/quote";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import { saveFile, slug } from "../ui/saveFile";
import { errorText, useToast } from "../ui/Toast";
import { useData } from "../ui/useData";
import type { Go } from "../pages";
import CatalogSheet from "./quotes/CatalogSheet";
import ContractSheet from "./quotes/ContractSheet";
import { EMPTY_QUOTES, loadQuotesData } from "./quotes/data";
import QuoteEditor from "./quotes/QuoteEditor";
import { clearOpenQuoteDraft, clearQuoteDraft, peekOpenQuoteDraft, peekQuoteDraft } from "./quotes/draft";

const dateBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export default function Quotes({ go }: { go: Go }) {
  const [data, reload, loading] = useData(loadQuotesData, EMPTY_QUOTES);
  const [draft, setDraft] = useState(peekQuoteDraft);
  const [editing, setEditing] = useState<Quote | "new" | "draft" | null>(() => (peekOpenQuoteDraft() && draft ? "draft" : null));
  useEffect(clearOpenQuoteDraft, []);
  const [sheet, setSheet] = useState<"contract" | "catalog" | null>(null);
  const toast = useToast();
  const today = todayIso();
  const num = (q: Quote) => quoteNumber(q, data.company.quotePrefix);

  async function pdf(q: Quote) {
    try {
      const r = await quotePdf(await loadPdfFonts(), data.company, q, data.customers.find((c) => c.id === q.customerId));
      const path = await saveFile(`${num(q)}-${slug(q.customerName)}.pdf`, r.bytes, "pdf", "PDF");
      if (path) toast(r.pixError ? `PDF salvo sem o QR Pix (${r.pixError}) em ${path}` : `Orçamento salvo em ${path}`, r.pixError ? "error" : "ok");
    } catch (e) {
      toast(`Não foi possível gerar o PDF: ${errorText(e)}`, "error");
    }
  }

  async function convert(q: Quote) {
    try {
      const id = await quotesRepo.convert(await getDb(), q);
      toast(`Orçamento ${num(q)} virou o pedido #${id}.`);
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  async function remove(q: Quote) {
    if (!(await ask(`Excluir o orçamento ${num(q)}?`, { title: "Excluir orçamento", kind: "warning", okLabel: "Excluir orçamento", cancelLabel: "Cancelar" }))) return;
    try {
      await quotesRepo.remove(await getDb(), q.id);
      reload();
    } catch (e) {
      toast(`Não foi possível excluir: ${errorText(e)}`, "error");
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Orçamentos</h1>
          <p className="lead">PDF com logo e QR Pix do valor.</p>
        </div>
        <div className="row">
          <Button icon={FileSignature} onClick={() => setSheet("contract")}>
            Contrato de consignação
          </Button>
          <Button icon={BookImage} onClick={() => setSheet("catalog")}>
            Catálogo PDF
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
            Novo orçamento
          </Button>
        </div>
      </div>
      {!data.company.name && !data.company.tradeName && (
        <p className="hint">
          Dica: preencha os <button className="link" onClick={() => go("company")}>Dados da empresa</button> (logo, contatos e chave Pix) para o PDF sair completo.
        </p>
      )}
      {draft && editing !== "draft" && (
        <Alert kind="info">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>
              Rascunho da calculadora: <b>{draft.items.length} {draft.items.length === 1 ? "item" : "itens"}</b>
            </span>
            <div className="row">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearQuoteDraft();
                  setDraft(null);
                }}
              >
                Descartar
              </Button>
              <Button variant="primary" size="sm" onClick={() => setEditing("draft")}>
                Abrir rascunho
              </Button>
            </div>
          </div>
        </Alert>
      )}
      {data.quotes.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum orçamento ainda" action={<Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Fazer um orçamento</Button>} />
      ) : (
        <table>
          <thead>
            <tr><th>Nº</th><th>Cliente</th><th>Validade</th><th>Situação</th><th className="num">Total</th><th /></tr>
          </thead>
          <tbody>
            {data.quotes.map((q) => (
              <tr key={q.id}>
                <td>{num(q)}</td>
                <td>{q.customerName}</td>
                <td>{dateBr(q.validUntil)}</td>
                <td>
                  {q.convertedOrderId ? (
                    <button className="link" onClick={() => go("orders")}>virou o pedido #{q.convertedOrderId}</button>
                  ) : isExpired(q, today) ? (
                    <span className="badge">vencido</span>
                  ) : (
                    "aberto"
                  )}
                </td>
                <td className="num">{money(orderTotals(q.items, q.freight).total)}</td>
                <td>
                  <div className="list-actions">
                    <Button variant="ghost" size="sm" icon={FileDown} onClick={() => pdf(q)}>
                      PDF
                    </Button>
                    {!q.convertedOrderId && (
                      <>
                        <Button variant="ghost" size="sm" icon={ArrowRightLeft} onClick={() => convert(q)}>
                          Virar pedido
                        </Button>
                        <Button variant="ghost" size="sm" icon={Pencil} aria-label={`Editar orçamento ${num(q)}`} onClick={() => setEditing(q)} />
                      </>
                    )}
                    <Button variant="ghost" size="sm" icon={Trash2} className="danger" aria-label={`Excluir orçamento ${num(q)}`} onClick={() => remove(q)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {/* só depois da 1ª leitura: o editor guarda validade e condições da empresa ao abrir */}
      {editing && !loading && (
        <QuoteEditor
          data={data}
          quote={editing === "new" || editing === "draft" ? undefined : editing}
          draft={editing === "draft" && draft ? draft : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            if (editing === "draft") {
              clearQuoteDraft();
              setDraft(null);
            }
            setEditing(null);
            reload();
          }}
        />
      )}
      {sheet === "contract" && <ContractSheet data={data} onClose={() => setSheet(null)} />}
      {sheet === "catalog" && <CatalogSheet data={data} company={data.company} onClose={() => setSheet(null)} />}
    </div>
  );
}
