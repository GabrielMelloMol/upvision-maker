import { FolderOpen } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ProjectPatch, ToolProject } from "../../db/toolStateRepo";
import { projectTags } from "../../db/toolStateRepo";
import Field from "../../ui/Field";
import PhotoGallery from "../../ui/PhotoGallery";
import Sheet from "../../ui/Sheet";

type Option = { id: number; label: string };
type Props = { project: ToolProject; products: Option[]; orders: Option[]; onSave: (patch: ProjectPatch) => void; onClose: () => void; onPhotos?: () => void };

const MAX_TAGS = 20;

/** Nome, tags, fotos da peça impressa (#162) e ligação a produto/pedido de um projeto (#161). Tags separadas por vírgula. */
export default function ProjectSheet({ project, products, orders, onSave, onClose, onPhotos }: Props) {
  const [name, setName] = useState(project.name);
  const [tags, setTags] = useState(projectTags(project).join(", "));
  const [productId, setProductId] = useState(project.productId ? String(project.productId) : "");
  const [orderId, setOrderId] = useState(project.orderId ? String(project.orderId) : "");

  function submit(e: FormEvent) {
    e.preventDefault();
    const list = tags.split(",").map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, MAX_TAGS);
    onSave({ name: name.trim(), tags: list, productId: productId ? Number(productId) : null, orderId: orderId ? Number(orderId) : null });
  }

  return (
    <Sheet
      title="Editar projeto"
      wide
      icon={FolderOpen}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary">
            Salvar
          </button>
        </>
      }
    >
      <Field label="Nome">
        <input data-autofocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Tags" hint="Separadas por vírgula: escola, formatura, cliente Ana.">
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      {/* fotos gravam na hora (não esperam o Salvar); a capa vira a miniatura em Meus projetos */}
      <PhotoGallery owner={`project:${project.id}`} onChange={onPhotos} />
      <Field label="Produto">
        <select value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Nenhum</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Pedido">
        <select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          <option value="">Nenhum</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    </Sheet>
  );
}
