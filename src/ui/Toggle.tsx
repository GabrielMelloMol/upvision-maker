import { useId, type ReactNode } from "react";

type Props = { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: ReactNode };

/**
 * Chave liga/desliga (role="switch"). Para opções de formulário comuns, o checkbox continua valendo.
 * Com `hint`, vira uma linha de Ajustes (.row-control): a ajuda fica fora do rótulo, no aria-describedby.
 */
export default function Toggle({ label, checked, onChange, disabled, hint }: Props) {
  const id = useId();
  const input = (props: object = {}) => (
    <input type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} {...props} />
  );
  if (hint === undefined)
    return (
      <label className="check">
        {input()}
        {label}
      </label>
    );
  return (
    <div className="row-control">
      <label className="row-label" htmlFor={id}>
        {label}
      </label>
      <span className="hint" id={`${id}-hint`}>
        {hint}
      </span>
      {input({ id, "aria-describedby": `${id}-hint` })}
    </div>
  );
}
