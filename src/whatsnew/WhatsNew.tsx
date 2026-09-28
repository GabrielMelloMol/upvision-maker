import { getVersion } from "@tauri-apps/api/app";
import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import changelogMd from "../../CHANGELOG.md?raw";
import { getDb } from "../db";
import { getSecret, setSecret } from "../db/repo";
import { entriesToShow, parseChangelog, type ChangelogEntry } from "./changelog";

const LAST_SEEN = "last_seen_version";
export const CHANGELOG = parseChangelog(changelogMd);

/** Converte **negrito** do changelog sem injetar HTML. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part))}
    </>
  );
}

export function WhatsNewModal({ entries, onClose }: { entries: ChangelogEntry[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal stack" role="dialog" aria-modal="true" aria-labelledby="wn-title">
        <header>
          <h2 id="wn-title">
            <Sparkles size={18} color="var(--brand-orange)" aria-hidden /> O que há de novo
          </h2>
          <button className="link" aria-label="Fechar" onClick={onClose}>
            <X />
          </button>
        </header>
        {entries.map((e) => (
          <section key={e.version}>
            <h3>
              Versão {e.version} <span className="muted small">{e.date}</span>
            </h3>
            <ul className="changes">
              {e.items.map((it) => (
                <li key={it}>
                  <Rich text={it} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <button className="primary" onClick={onClose} autoFocus>
          Entendi
        </button>
      </div>
    </div>
  );
}

/** Após uma atualização, mostra as novidades uma vez. Na primeira instalação só registra a versão. */
export function useWhatsNewAfterUpdate(): [ChangelogEntry[], () => void] {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  useEffect(() => {
    (async () => {
      const current = await getVersion();
      const db = await getDb();
      const lastSeen = await getSecret(db, LAST_SEEN);
      const show = entriesToShow(CHANGELOG, lastSeen, current);
      await setSecret(db, LAST_SEEN, current);
      setEntries(show);
    })().catch((e) => console.warn("Não foi possível verificar as novidades:", e));
  }, []);
  return [entries, () => setEntries([])];
}
