import { printers } from "../db/repo";
import { Printer } from "lucide-react";
import CrudPage from "../ui/CrudPage";

export default function Printers() {
  return (
    <CrudPage
      pageId="printers"
      title="Impressoras"
      singular="Impressora"
      lead="A potência média de cada impressora entra no custo de energia da calculadora."
      empty={{ icon: Printer, text: "Cadastre sua impressora e a potência média dela para a calculadora incluir a energia no preço." }}
      repo={printers}
      fields={[
        { key: "name", label: "Nome", kind: "text", placeholder: "Ex.: Bambu Lab A1" },
        { key: "watts", label: "Potência média (W)", kind: "number", placeholder: "Ex.: 120", hint: "Média durante a impressão, não a máxima da fonte." },
      ]}
      defaults={{ name: "", watts: "" }}
    />
  );
}
