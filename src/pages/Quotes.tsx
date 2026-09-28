import { ask } from "@tauri-apps/plugin-dialog";
import { ArrowRightLeft, BookImage, FileDown, FileSignature, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { getDb } from "../db";
import { quotesRepo } from "../db/quotesRepo";
import { money } from "../domain/format";
import { orderTotals, todayIso } from "../domain/orders";
import { isExpired, type Quote } from "../domain/quotes";
import { loadPdfFonts } from "../pdf/fonts";
import { quotePdf } from "../pdf/quote";
import "../styles/features.css";
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

const dateBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export default function Quotes({ go }: { go: Go }) {
  const [data, reload] = useData(loadQuotesData, EMPTY_QUOTES);
  const [editing, setEditing] = useState<Quote | "new" | null>(null);
  const [sheet, setSheet] = useState<"contract" | "catalog" | null>(null);
  const toast = useToast();
  const today = todayIso();

  async function pdf(q: Quote) {
    try {
      const r = await quotePdf(await loadPdfFonts(), data.company, q, data.customers.find((c) => c.id === q.customerId));
      const path = await saveFile(`orcamento-${q.id}-${slug(q.customerName)}.pdf`, r.bytes, "pdf", "PDF");
      if (path) toast(r.pixError ? `PDF salvo sem o QR Pix (${r.pixError}) em ${path}` : `Orçamento salvo em ${path}`, r.pixError ? "error" : "ok");
    } catch (e) {
      toast(`Não foi possível gerar o PDF: ${errorText(e)}`, "error");
    }
  }

  async function convert(q: Quote) {
    try {
      const id = await quotesRepo.convert(await getDb(), q);
      toast(`Orçamento nº ${q.id} virou o pedido #${id}.`);
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  async function remove(q: Quote) {
    if (!(await ask(`Excluir o orçamento nº ${q.id}?`, { title: "Excluir orçamento", kind: "warning", okLabel: "Excluir orçamento", cancelLabel: "Cancelar" }))) return;
    await quotesRepo.remove(await getDb(), q.id);
    reload();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Orçamentos</h1>
          <p className="lead">PDF em A4 com logo e QR Pix do valor exato. Aprovado? Vire pedido com um clique.</p>
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
                <td>{q.id}</td>
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
                        <Button variant="ghost" size="sm" icon={Pencil} aria-label={`Editar orçamento ${q.id}`} onClick={() => setEditing(q)} />
                      </>
                    )}
                    <Button variant="ghost" size="sm" icon={Trash2} className="danger" aria-label={`Excluir orçamento ${q.id}`} onClick={() => remove(q)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <QuoteEditor
          data={data}
          quote={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
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
