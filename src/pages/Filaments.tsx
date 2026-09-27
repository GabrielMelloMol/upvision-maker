import { filaments } from "../db/repo";
import { MATERIAL_TYPES } from "../domain/entities";
import CrudPage from "../ui/CrudPage";

export default function Filaments() {
  return (
    <CrudPage
      title="Filamentos"
      singular="Filamento"
      repo={filaments}
      fields={[
        { key: "material", label: "Material", kind: "select", options: MATERIAL_TYPES },
        { key: "color", label: "Cor", kind: "text" },
        { key: "brand", label: "Marca", kind: "text" },
        { key: "pricePerKg", label: "Preço por kg", kind: "money" },
        { key: "spoolG", label: "Peso do rolo (g)", kind: "number" },
        { key: "stockG", label: "Estoque (g)", kind: "number" },
        { key: "minG", label: "Mínimo (g)", kind: "number" },
      ]}
      defaults={{ material: "PLA", color: "", brand: "", pricePerKg: "", spoolG: "1000", stockG: "0", minG: "200" }}
      isLow={(r) => Number(r.stockG) <= Number(r.minG)}
      restock={{ qtyLabel: "Gramas compradas", priceLabel: "Preço pago por kg", defaultQty: (r) => Number(r.spoolG) }}
    />
  );
}
