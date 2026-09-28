import { getVersion } from "@tauri-apps/api/app";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import changelogMd from "../../CHANGELOG.md?raw";
import { getDb } from "../db";
import { getSecret, setSecret } from "../db/repo";
import Sheet from "../ui/Sheet";
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
  return (
    <Sheet
      title="O que há de novo"
      icon={Sparkles}
      onClose={onClose}
      footer={
        <button className="primary" onClick={onClose} data-autofocus>
          Entendi
        </button>
      }
    >
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
    </Sheet>
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
