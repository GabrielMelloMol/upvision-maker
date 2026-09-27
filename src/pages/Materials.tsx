import { materials } from "../db/repo";
import CrudPage from "../ui/CrudPage";

export default function Materials() {
  return (
    <CrudPage
      title="Materiais extras"
      singular="Material"
      repo={materials}
      fields={[
        { key: "name", label: "Nome", kind: "text" },
        { key: "unit", label: "Unidade", kind: "text" },
        { key: "unitPrice", label: "Preço por unidade", kind: "money" },
        { key: "stock", label: "Estoque", kind: "number" },
        { key: "min", label: "Mínimo", kind: "number" },
      ]}
      defaults={{ name: "", unit: "un", unitPrice: "", stock: "0", min: "0" }}
      isLow={(r) => Number(r.stock) <= Number(r.min)}
      restock={{ qtyLabel: "Quantidade comprada", priceLabel: "Preço pago por unidade", defaultQty: () => 1 }}
    />
  );
}
