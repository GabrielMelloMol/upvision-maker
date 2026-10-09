import Menu, { type MenuItem } from "./Menu";

type Props = {
  /** O que a linha é, para o nome acessível: "Ações de PLA Preto". */
  subject: string;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  /** Outras ações da linha, entre Duplicar e Excluir. */
  extra?: MenuItem[];
};

/**
 * Ações secundárias de uma linha de tabela (#180): menu ⋯ com Editar, Duplicar e Excluir, na mesma ordem em todas as
 * telas (Excluir por último, em vermelho e separado). A ação principal da linha (Repor, Produzir…) fica ao lado, em texto.
 */
export default function RowActions({ subject, onEdit, onDuplicate, onDelete, extra = [] }: Props) {
  const items: MenuItem[] = [
    ...(onEdit ? [{ label: "Editar", onSelect: onEdit }] : []),
    ...(onDuplicate ? [{ label: "Duplicar", onSelect: onDuplicate }] : []),
    ...extra,
    ...(onDelete ? [{ label: "Excluir", onSelect: onDelete, danger: true }] : []),
  ];
  if (!items.length) return null;
  return <Menu label={`Ações de ${subject}`} items={items} />;
}
