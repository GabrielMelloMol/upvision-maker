import { printers } from "../db/repo";
import CrudPage from "../ui/CrudPage";

export default function Printers() {
  return (
    <CrudPage
      title="Impressoras"
      singular="Impressora"
      repo={printers}
      fields={[
        { key: "name", label: "Nome", kind: "text" },
        { key: "watts", label: "Potência média (W)", kind: "number" },
      ]}
      defaults={{ name: "", watts: "" }}
    />
  );
}
