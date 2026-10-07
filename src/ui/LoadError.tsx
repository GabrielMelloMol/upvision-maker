import { TriangleAlert } from "lucide-react";
import EmptyState from "./EmptyState";
import Button from "./Button";

/**
 * Quando a leitura do banco falha (M15): em vez do estado vazio ("Nenhum pedido ainda", R$ 0), diz que não deu para
 * ler e deixa tentar de novo. Fica no lugar da lista; `error` vem do `useData`.
 */
export default function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <EmptyState icon={TriangleAlert} title="Não foi possível ler os dados" action={<Button onClick={onRetry}>Tentar de novo</Button>}>
      Não foi possível ler os dados: {error}. Seus dados continuam guardados; tente de novo e, se repetir, feche e abra o app.
    </EmptyState>
  );
}
