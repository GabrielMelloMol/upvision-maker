import { materials } from "../db/repo";
import { Package } from "lucide-react";
import CrudPage from "../ui/CrudPage";

export default function Materials() {
  return (
    <CrudPage
      pageId="materials"
      title="Materiais extras"
      singular="Material"
      lead="Embalagens, argolas, ímãs e tudo mais que vai junto com a peça."
      empty={{ icon: Package, text: "Embalagem, argola de chaveiro, ímã… cadastre o que entra no custo de cada peça." }}
      repo={materials}
      fields={[
        { key: "name", label: "Nome", kind: "text", placeholder: "Ex.: Argola de chaveiro" },
        { key: "unit", label: "Unidade", kind: "text", placeholder: "un, pacote, m…" },
        { key: "unitPrice", label: "Preço por unidade", kind: "money" },
        { key: "stock", label: "Estoque", kind: "number" },
        { key: "min", label: "Mínimo", kind: "number" },
      ]}
      defaults={{ name: "", unit: "un", unitPrice: "", stock: "0", min: "0" }}
      sticky={["unit"]}
      isLow={(r) => Number(r.stock) <= Number(r.min)}
      restock={{ qtyLabel: "Quantidade comprada", priceLabel: "Preço pago por unidade", defaultQty: () => 1 }}
    />
  );
}
