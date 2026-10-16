import type { JobControl } from "./useJobControl";

/**
 * Barra de progresso com Cancelar e, depois de cancelar, o botão "Calcular de novo" (#222, #248). Um componente só para todas as
 * ferramentas que calculam em Web Worker. `busy` = a ferramenta está calculando; `error` = o erro da tela (para saber se cancelaram).
 */
export default function WorkProgress({ control, busy, error, title = "Calculando" }: { control: JobControl; busy: boolean; error: string | null; title?: string }) {
  const { progress } = control;
  return (
    <>
      {busy && progress && (
        <div className="card stack" role="status" aria-live="polite">
          <label className="stack">
            <span>
              {title}: {progress.stage} ({Math.round(progress.fraction * 100)}%)
            </span>
            <progress value={progress.fraction} max={1} aria-label={`Progresso: ${title.toLowerCase()}`} />
          </label>
          <button type="button" className="sm" onClick={control.cancel}>
            Cancelar
          </button>
        </div>
      )}
      {error && /cancelado/i.test(error) && (
        <button type="button" className="sm primary" onClick={control.retry}>
          Calcular de novo
        </button>
      )}
    </>
  );
}
