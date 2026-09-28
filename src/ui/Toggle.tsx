import type { ReactNode } from "react";

type Props = { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean };

/** Chave liga/desliga (role="switch"). Para opções de formulário comuns, o checkbox continua valendo. */
export default function Toggle({ label, checked, onChange, disabled }: Props) {
  return (
    <label className="check">
      <input type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
