import { Factory } from "lucide-react";
import { useMemo, useState } from "react";
import { applyStock, planToMovements } from "../../db/stock";
import { parseDecimal } from "../../domain/format";
import { planConsumption, type Product } from "../../domain/products";
import Alert from "../../ui/Alert";
import Button from "../../ui/Button";
import Sheet from "../../ui/Sheet";
import { errorText, useToast } from "../../ui/Toast";
import type { ProductsData } from "./data";

/** Registra produção: baixa os insumos e soma ao estoque pronto, numa transação só. */
export default function ProduceSheet({ product, data, onClose, onDone }: { product: Product; data: ProductsData; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState(String(product.piecesPerPlate));
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const n = parseDecimal(qty);
  const valid = Number.isFinite(n) && n > 0;

  const plan = useMemo(() => {
    if (!valid) return null;
    try {
      return planConsumption(product.id, n, data, { useOwnStock: false });
    } catch (e) {
      return errorText(e);
    }
  }, [product.id, n, valid, data]);

  const rows =
    plan && typeof plan !== "string"
      ? [
          ...Object.entries(plan.filaments).map(([id, g]) => {
            const f = data.filaments.find((x) => x.id === Number(id));
            return { key: `f${id}`, label: f ? [f.material, f.color, f.brand].filter(Boolean).join(" · ") : "Filamento excluído", amount: `${g.toLocaleString("pt-BR")} g`, low: f ? f.stockG - g < 0 : true };
          }),
          ...Object.entries(plan.materials).map(([id, q]) => {
            const m = data.materials.find((x) => x.id === Number(id));
            return { key: `m${id}`, label: m?.name ?? "Material excluído", amount: `${q.toLocaleString("pt-BR")} ${m?.unit ?? ""}`, low: m ? m.stock - q < 0 : true };
          }),
          ...Object.entries(plan.products).map(([id, q]) => ({ key: `p${id}`, label: `${data.products.find((x) => x.id === Number(id))?.name ?? "Produto"} (pronto)`, amount: `${q} un`, low: false })),
        ]
      : [];

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!plan || typeof plan === "string") return;
    setBusy(true);
    try {
      await applyStock([...planToMovements(plan, -1), { kind: "product", id: product.id, delta: n }]);
      toast(`${n} × ${product.name} no estoque pronto.`);
      onDone();
    } catch (err) {
      toast(`Não foi possível registrar: ${errorText(err)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`Produzir ${product.name}`}
      icon={Factory}
      onClose={onClose}
      onSubmit={confirm}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" disabled={!valid || busy || typeof plan === "string"}>
            Registrar produção
          </Button>
        </>
      }
    >
      <label>
        Quantas unidades ficaram prontas?
        <input data-autofocus inputMode="numeric" value={qty} aria-invalid={!valid} onChange={(e) => setQty(e.target.value)} />
      </label>
      {typeof plan === "string" && <Alert kind="error">{plan}</Alert>}
      {rows.length > 0 && (
        <>
          <p className="muted small">Vai sair do estoque:</p>
          <table>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="num">
                    {r.amount} {r.low && <span className="badge">falta</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.some((r) => r.low) && <Alert kind="warn">Algum insumo vai ficar negativo. Registre mesmo assim se ele já foi usado, ou reponha antes.</Alert>}
        </>
      )}
    </Sheet>
  );
}
