import { filaments } from "../db/repo";
import { FILAMENT_CATALOG_ITEMS, filamentFromCatalog } from "../domain/catalog/filaments";
import { MATERIAL_TYPES } from "../domain/entities";
import { Cylinder, FlaskConical } from "lucide-react";
import { useState } from "react";
import Button from "../ui/Button";
import CrudPage from "../ui/CrudPage";
import WasteSheet from "./filaments/WasteSheet";

export default function Filaments() {
  const [waste, setWaste] = useState(false);
  const [version, setVersion] = useState(0); // recarrega a lista depois de uma baixa de amostra ou erro (#189)
  return (
    <>
      <CrudPage
        key={version}
        actions={
          <Button icon={FlaskConical} onClick={() => setWaste(true)}>
            Amostra ou erro de impressão
          </Button>
        }
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
          { key: "td", label: "TD (luz que passa, mm)", kind: "number", optional: true, formOnly: true, advanced: true, hint: "Só para quem usa o HueForge (quadro em camadas de cor): quanto de luz o filamento deixa passar. Deixe vazio se você não usa." },
        ]}
        defaults={{ material: "PLA", color: "", brand: "", pricePerKg: "", spoolG: "1000", stockG: "1 rolo", minG: "200", td: "" }}
        sticky={["material", "brand", "pricePerKg", "spoolG", "minG"]}
        isLow={(r) => Number(r.stockG) <= Number(r.minG)}
        restock={{ qtyLabel: "Quanto comprou", priceLabel: "Preço pago por kg", defaultQty: () => "1 rolo", mass: true }}
        catalog={{ title: "Catálogo de filamentos", icon: Cylinder, items: FILAMENT_CATALOG_ITEMS, toForm: filamentFromCatalog }}
        duplicate={(v) => ({ ...v, color: "", stockG: "1 rolo" })}
      />
      {waste && <WasteSheet onClose={() => setWaste(false)} onChanged={() => setVersion((v) => v + 1)} />}
    </>
  );
}
