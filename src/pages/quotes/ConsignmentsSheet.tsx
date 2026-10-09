import { ask } from "@tauri-apps/plugin-dialog";
import { Store } from "lucide-react";
import { useState } from "react";
import { getDb } from "../../db";
import { consignmentsRepo } from "../../db/consignmentsRepo";
import { restockStatus, type Consignment } from "../../domain/consignments";
import { todayIso } from "../../domain/orders";
import Button from "../../ui/Button";
import Sheet from "../../ui/Sheet";
import { errorText, useToast } from "../../ui/Toast";
import type { QuotesData } from "./data";
import RestockSheet from "./RestockSheet";

const dateBr = (iso: string) => iso.split("-").reverse().join("/");

/** Lojas com contrato de consignação (#184): quando é a próxima reposição, registrar a reposição, encerrar ou excluir. */
export default function ConsignmentsSheet({ data, onClose, onChanged }: { data: QuotesData; onClose: () => void; onChanged: () => void }) {
  const [restocking, setRestocking] = useState<Consignment | null>(null);
  const toast = useToast();
  const today = todayIso();

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      onChanged();
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  async function remove(c: Consignment) {
    if (!(await ask(`Excluir o contrato de ${c.customerName} da lista? Os pedidos já feitos continuam.`, { title: "Excluir consignado", kind: "warning", okLabel: "Excluir", cancelLabel: "Voltar" }))) return;
    await run(async () => consignmentsRepo.remove(await getDb(), c.id));
  }

  return (
    <>
      <Sheet wide title="Consignados" icon={Store} onClose={onClose} footer={<Button onClick={onClose}>Fechar</Button>}>
        {data.consignments.length === 0 ? (
          <p className="muted">Nenhum contrato acompanhado ainda. Ao salvar um contrato de consignação, deixe marcado "Acompanhar a reposição" e ele aparece aqui.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Loja</th><th>Peças</th><th>Próxima reposição</th><th /></tr>
            </thead>
            <tbody>
              {data.consignments.map((c) => {
                const s = restockStatus(c, today);
                return (
                  <tr key={c.id}>
                    <td>
                      {c.customerName}
                      {!c.active && <span className="muted small"> · encerrado</span>}
                    </td>
                    <td>{c.items.length}</td>
                    <td>
                      {c.active ? (
                        <>
                          {dateBr(s.due)} <span className={s.days < 0 ? "badge" : "muted small"}>{s.label}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num">
                      <div className="row">
                        {c.active && (
                          <Button size="sm" aria-label={`Registrar reposição de ${c.customerName}`} onClick={() => setRestocking(c)}>
                            Registrar reposição
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" aria-label={`${c.active ? "Encerrar" : "Reativar"} ${c.customerName}`} onClick={() => void run(async () => consignmentsRepo.setActive(await getDb(), c.id, !c.active))}>
                          {c.active ? "Encerrar" : "Reativar"}
                        </Button>
                        <Button size="sm" variant="ghost" className="danger" aria-label={`Excluir contrato de ${c.customerName}`} onClick={() => void remove(c)}>
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Sheet>
      {restocking && (
        <RestockSheet
          consignment={restocking}
          data={data}
          onClose={() => setRestocking(null)}
          onDone={() => {
            setRestocking(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}
