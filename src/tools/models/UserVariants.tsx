import { BookmarkPlus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { getDb } from "../../db";
import { modelVariants, type ModelVariant } from "../../db/modelVariantsRepo";
import { errorText, useToast } from "../../ui/Toast";
import type { Params } from "./fields";
import type { Layer } from "./layers";

/** O que uma variação própria guarda. Validado ao abrir: o JSON vem do banco (pode ser de uma versão antiga). */
const Saved = z.object({ params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])), layers: z.array(z.looseObject({ id: z.string(), kind: z.enum(["art", "text"]) })) });

type Props = { modelId: string; params: Params; layers: Layer[]; onApply: (params: Params, layers: Layer[]) => void };

/** "Minhas variações" do modelo (#26): salvar os campos + camadas atuais com um nome, aplicar e excluir. */
export default function UserVariants({ modelId, params, layers, onApply }: Props) {
  const [list, setList] = useState<ModelVariant[]>([]);
  const [naming, setNaming] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    getDb()
      .then((db) => modelVariants.list(db, modelId))
      .then((v) => alive && setList(v))
      .catch((e) => console.warn("Variações próprias indisponíveis:", e));
    return () => {
      alive = false;
    };
  }, [modelId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const db = await getDb();
      await modelVariants.create(db, { modelId, label: naming ?? "", data: JSON.stringify({ params, layers }), createdAt: new Date().toISOString() });
      setList(await modelVariants.list(db, modelId));
      toast(`Variação “${naming?.trim()}” salva.`);
      setNaming(null);
    } catch (err) {
      toast(errorText(err), "error");
    }
  }

  function apply(v: ModelVariant) {
    try {
      const s = Saved.parse(JSON.parse(v.data));
      onApply(s.params, s.layers as unknown as Layer[]);
    } catch {
      toast("Esta variação não pôde ser aberta.", "error");
    }
  }

  async function remove(v: ModelVariant) {
    try {
      const db = await getDb();
      await modelVariants.remove(db, v.id);
      setList(await modelVariants.list(db, modelId));
    } catch (err) {
      toast(errorText(err), "error");
    }
  }

  return (
    <div className="stack user-variants" style={{ gap: 6 }}>
      {list.length > 0 && (
        <div className="chips" role="group" aria-label="Minhas variações">
          {list.map((v) => (
            <span key={v.id} className="chip-with-x">
              <button type="button" onClick={() => apply(v)}>
                {v.label}
              </button>
              <button type="button" className="chip-x" aria-label={`Excluir variação ${v.label}`} onClick={() => void remove(v)}>
                <X aria-hidden size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {naming === null ? (
        <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setNaming("")}>
          <BookmarkPlus aria-hidden size={14} /> Salvar como variação
        </button>
      ) : (
        <form className="row" onSubmit={save}>
          <input aria-label="Nome da variação" placeholder="Ex.: Placa da loja" value={naming} maxLength={60} autoFocus onChange={(e) => setNaming(e.target.value)} />
          <button type="submit" className="sm primary">
            Salvar
          </button>
          <button type="button" className="sm ghost" onClick={() => setNaming(null)}>
            Cancelar
          </button>
        </form>
      )}
    </div>
  );
}
