import { ask } from "@tauri-apps/plugin-dialog";
import { ArrowRightLeft, BookImage, FileDown, FileSignature, FileText, Plus, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { getDb } from "../db";
import { quotesRepo } from "../db/quotesRepo";
import { money } from "../domain/format";
import { orderTotals, todayIso } from "../domain/orders";
import { restockStatus } from "../domain/consignments";
import { isExpired, quoteNumber, type Quote } from "../domain/quotes";
import { loadPdfFonts } from "../pdf/fonts";
import { quotePdf } from "../pdf/quote";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import RowActions from "../ui/RowActions";
import EmptyState from "../ui/EmptyState";
import LoadError from "../ui/LoadError";
import { saveFile, slug } from "../ui/saveFile";
import { errorText, useToast } from "../ui/Toast";
import { useData } from "../ui/useData";
import type { Go } from "../pages";
import CatalogSheet from "./quotes/CatalogSheet";
import ConsignmentsSheet from "./quotes/ConsignmentsSheet";
import ContractSheet from "./quotes/ContractSheet";
import { EMPTY_QUOTES, loadQuotesData } from "./quotes/data";
import QuoteEditor from "./quotes/QuoteEditor";
import { clearOpenQuoteDraft, clearQuoteDraft, peekOpenQuoteDraft, peekQuoteDraft } from "./quotes/draft";

const dateBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

const listBr = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}` : xs[0]);

export default function Quotes({ go }: { go: Go }) {
  const [data, reload, loading, error] = useData(loadQuotesData, EMPTY_QUOTES);
  const [draft, setDraft] = useState(peekQuoteDraft);
  const [editing, setEditing] = useState<Quote | "new" | "draft" | null>(() => (peekOpenQuoteDraft() && draft ? "draft" : null));
  useEffect(clearOpenQuoteDraft, []);
  const [sheet, setSheet] = useState<"contract" | "catalog" | "consignments" | null>(null);
  const toast = useToast();
  const today = todayIso();
  const soon = data.consignments.filter((c) => c.active && restockStatus(c, today).soon);
  const num = (q: Quote) => quoteNumber(q, data.company.quotePrefix);
  const c = data.company;
  // o que deixa o PDF com cara de outra empresa (#296); só depois de ler o banco, para não piscar
  const missing = loading ? [] : ([!c.logo && "logo", !c.name && !c.tradeName && "nome", !c.phone && !c.email && !c.instagram && "contato"].filter(Boolean) as string[]);

  async function pdf(q: Quote) {
    try {
      const r = await quotePdf(await loadPdfFonts(), data.company, q, data.customers.find((c) => c.id === q.customerId), data.covers); // capas dos produtos (#162)
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
          <Button icon={Store} onClick={() => setSheet("consignments")}>
            Consignados
          </Button>
          <Button icon={BookImage} onClick={() => setSheet("catalog")}>
            Catálogo PDF
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
            Novo orçamento
          </Button>
        </div>
      </div>
      {missing.length > 0 && (
        <Alert kind="warn">
          O PDF vai sair sem {listBr(missing)} da empresa.{" "}
          <button className="link" onClick={() => go("company")}>
            Completar em Dados da empresa
          </button>
        </Alert>
      )}
      {soon.length > 0 && sheet !== "consignments" && (
        <Alert kind="info">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>
              Consignados: {soon.slice(0, 3).map((c) => `${c.customerName} (${restockStatus(c, today).label})`).join("; ")}
              {soon.length > 3 ? ` e mais ${soon.length - 3}` : ""}.
            </span>
            <Button variant="primary" size="sm" onClick={() => setSheet("consignments")}>
              Ver consignados
            </Button>
          </div>
        </Alert>
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
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : data.quotes.length === 0 ? (
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
                <td>{q.unreadable ? "—" : dateBr(q.validUntil)}</td>
                <td>
                  {q.unreadable ? (
                    <span className="badge" title={q.unreadable}>não pôde ser lido</span>
                  ) : q.convertedOrderId ? (
                    <button className="link" onClick={() => go("orders")}>virou o pedido #{q.convertedOrderId}</button>
                  ) : isExpired(q, today) ? (
                    <span className="badge">vencido</span>
                  ) : (
                    "aberto"
                  )}
                </td>
                <td className="num">{q.unreadable ? "—" : money(orderTotals(q.items, q.freight).total)}</td>
                <td>
                  <div className="list-actions">
                    {!q.unreadable && (
                      <Button variant="ghost" size="sm" icon={FileDown} onClick={() => pdf(q)}>
                        PDF
                      </Button>
                    )}
                    {!q.convertedOrderId && !q.unreadable && (
                      <>
                        <Button variant="ghost" size="sm" icon={ArrowRightLeft} onClick={() => convert(q)}>
                          Virar pedido
                        </Button>
                      </>
                    )}
                    <RowActions subject={`orçamento ${num(q)}`} onEdit={!q.convertedOrderId && !q.unreadable ? () => setEditing(q) : undefined} onDelete={() => void remove(q)} />
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
      {sheet === "contract" && <ContractSheet data={data} onClose={() => setSheet(null)} onSaved={reload} />}
      {sheet === "consignments" && <ConsignmentsSheet data={data} onClose={() => setSheet(null)} onChanged={reload} />}
      {sheet === "catalog" && <CatalogSheet data={data} company={data.company} onClose={() => setSheet(null)} />}
    </div>
  );
}
