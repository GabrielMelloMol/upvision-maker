import { Trash2 } from "lucide-react";
import type { ToolOutline } from "../../organizer/types";
import { toolSize } from "./SheetPreview";

/**
 * Ferramenta do projeto: o número é o mesmo na foto, na folha, na lista e no mapa da gaveta. `label` é o nome que vai
 * para a peça (nunca vazio); `name` é o que a pessoa digitou (pode ficar vazio enquanto ela reescreve).
 */
export type ProjectTool = ToolOutline & { num: number; label: string; name?: string };

const mm = (n: number) => n.toFixed(0);

type Props = { tools: ProjectTool[]; onRename?: (id: string, name: string) => void; onRemove?: (id: string) => void };

/**
 * Lista de ferramentas do projeto (#169): número, nome (renomeia no próprio nome), medida e altura de cada uma, com
 * as ferramentas de todas as fotos somadas. Sem `onRename`/`onRemove` (exemplos), só mostra.
 */
export default function ToolList({ tools, onRename, onRemove }: Props) {
  return (
    <ol className="photo-list tool-list" aria-label="Ferramentas">
      {tools.map((t) => (
        <li key={t.id}>
          <span className="tool-num" aria-hidden>
            {t.num}
          </span>
          <span className="tool-list-name">
            {onRename ? (
              <input className="tool-name" aria-label={`Nome da ferramenta ${t.num}`} value={t.name ?? t.label} placeholder={`Ferramenta ${t.num}`} maxLength={40} onChange={(e) => onRename(t.id, e.target.value)} />
            ) : (
              <b>{t.label}</b>
            )}
            <span>
              {toolSize(t).map(mm).join(" × ")} mm · {t.heightMm ? `${mm(t.heightMm)} mm de altura` : "sem altura"}
            </span>
          </span>
          {onRemove && (
            <button type="button" className="ghost icon-only danger" aria-label={`Remover ${t.label}`} onClick={() => onRemove(t.id)}>
              <Trash2 aria-hidden size={16} />
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
