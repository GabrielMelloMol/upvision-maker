import { useEffect, useRef } from "react";
import { PREF_SECTIONS, type PrefSection } from "./sections";

type Props = { current: PrefSection; onPick: (s: PrefSection) => void; flagged: readonly PrefSection[] };

/** Lista de seções das Preferências (#179): ao lado em telas largas, em faixa rolável nas estreitas. */
export default function PrefsNav({ current, onPick, flagged }: Props) {
  const active = useRef<HTMLButtonElement>(null);
  // na faixa horizontal, a seção escolhida por atalho ou por erro precisa aparecer na faixa
  useEffect(() => {
    active.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [current]);
  return (
    <nav className="prefs-nav" aria-label="Seções das Preferências">
      <ul>
        {PREF_SECTIONS.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <button type="button" className="prefs-item" ref={id === current ? active : undefined} aria-current={id === current ? "page" : undefined} onClick={() => onPick(id)}>
              <Icon aria-hidden />
              <span>{label}</span>
              {flagged.includes(id) && <span className="prefs-flag">Corrigir</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
