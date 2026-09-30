import { useEffect, useState } from "react";
import { getDb } from "../db";
import { filaments, getSecret, printers, setSecret } from "../db/repo";

/** Fora do Onboarding.tsx: o App decide se mostra a apresentação sem carregar a tela dela (#88). */
export const DONE_KEY = "onboarding_done";

/** true na primeira abertura (sem impressora nem filamento e sem ter visto a apresentação). */
export function useFirstRun(): [boolean, () => void] {
  const [show, setShow] = useState(false);
  useEffect(() => {
    (async () => {
      const db = await getDb();
      if (await getSecret(db, DONE_KEY)) return;
      const empty = (await printers.list(db)).length === 0 && (await filaments.list(db)).length === 0;
      if (empty) setShow(true);
      else await setSecret(db, DONE_KEY, "1"); // quem já usava o app não precisa da apresentação
    })().catch((e) => console.warn("Não foi possível verificar o primeiro uso:", e));
  }, []);
  const close = () => {
    setShow(false);
    getDb()
      .then((db) => setSecret(db, DONE_KEY, "1"))
      .catch((e) => console.warn("Não foi possível registrar a apresentação:", e));
  };
  return [show, close];
}

