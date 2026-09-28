import { filaments } from "../db/repo";
import { MATERIAL_TYPES } from "../domain/entities";
import { Cylinder } from "lucide-react";
import CrudPage from "../ui/CrudPage";

export default function Filaments() {
  return (
    <CrudPage
      pageId="filaments"
      title="Filamentos"
      singular="Filamento"
      lead="Estoque em gramas, aviso de mínimo e custo médio atualizado a cada reposição."
      empty={{ icon: Cylinder, text: "Cadastre os rolos que você tem: o app avisa quando o estoque passar do mínimo e usa o preço na calculadora." }}
      repo={filaments}
      fields={[
        { key: "material", label: "Material", kind: "select", options: MATERIAL_TYPES },
        { key: "color", label: "Cor", kind: "color" },
        { key: "brand", label: "Marca", kind: "text", placeholder: "Ex.: Voolt, 3D Fila, Bambu" },
        { key: "pricePerKg", label: "Preço por kg", kind: "money" },
        { key: "spoolG", label: "Peso do rolo (g)", kind: "number" },
        { key: "stockG", label: "Estoque", kind: "mass" },
        { key: "minG", label: "Avisar abaixo de", kind: "mass", hint: "Avisa quando o estoque chegar aqui." },
      ]}
      defaults={{ material: "PLA", color: "", brand: "", pricePerKg: "", spoolG: "1000", stockG: "1 rolo", minG: "200" }}
      sticky={["material", "brand", "pricePerKg", "spoolG", "minG"]}
      isLow={(r) => Number(r.stockG) <= Number(r.minG)}
      restock={{ qtyLabel: "Quanto comprou", priceLabel: "Preço pago por kg", defaultQty: () => "1 rolo", mass: true }}
    />
  );
}
