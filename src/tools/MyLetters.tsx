import { PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { getDb } from "../db";
import { toolState } from "../db/toolStateRepo";
import { logError } from "../diagnostics/log";
import { AlphabetSchema, CHARSET, MAX_VERSIONS, type Alphabet, type Strokes } from "../geometry/handwriting";
import Button from "../ui/Button";
import Sheet from "../ui/Sheet";
import { errorText, useToast } from "../ui/Toast";
import DrawPad from "./DrawPad";

// fica no banco (entra no backup); id com ":" não aparece como rascunho no Início
const ID = "plotter:alfabeto";

export async function loadAlphabet(): Promise<Alphabet> {
  const row = await toolState.get(await getDb(), ID);
  if (!row) return {};
  try {
    return AlphabetSchema.parse(JSON.parse(row.data));
  } catch (e) {
    logError("minha letra", e, "warn");
    return {};
  }
}

async function saveAlphabet(a: Alphabet) {
  await toolState.save(await getDb(), { id: ID, data: JSON.stringify(AlphabetSchema.parse(a)), updatedAt: new Date().toISOString() });
}

/** O alfabeto da pessoa, carregado do banco. */
export function useAlphabet(): [Alphabet, (a: Alphabet) => Promise<void>] {
  const [a, setA] = useState<Alphabet>({});
  useEffect(() => {
    void loadAlphabet().then(setA);
  }, []);
  return [a, async (next) => (await saveAlphabet(next), setA(next))];
}

/** Desenhar a minha letra (#314): uma letra por vez, até 3 versões de cada. */
export default function MyLettersSheet({ alphabet, onSave, onClose }: { alphabet: Alphabet; onSave: (a: Alphabet) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState<Alphabet>(alphabet);
  const [ch, setCh] = useState(CHARSET[0]);
  const [version, setVersion] = useState(0);
  const [strokes, setStrokes] = useState<Strokes>(alphabet[CHARSET[0]]?.[0] ?? []);
  const toast = useToast();
  const versions = draft[ch] ?? [];

  const pick = (c: string, v = 0) => {
    setCh(c);
    setVersion(v);
    setStrokes(draft[c]?.[v] ?? []);
  };

  async function store(next: Alphabet) {
    try {
      await onSave(next);
      setDraft(next);
      return true;
    } catch (e) {
      toast(`Não foi possível guardar: ${errorText(e)}`, "error");
      return false;
    }
  }

  async function saveNext() {
    if (!strokes.length) return;
    const list = [...versions];
    list[version] = strokes;
    if (!(await store({ ...draft, [ch]: list }))) return;
    const next = CHARSET[CHARSET.indexOf(ch) + 1];
    if (next) pick(next, 0);
    else toast("Pronto: todas as letras desenhadas.");
  }

  async function removeVersion() {
    const list = versions.filter((_, i) => i !== version);
    const next = { ...draft };
    if (list.length) next[ch] = list;
    else delete next[ch];
    if (await store(next)) pick(ch, 0);
  }

  const done = Object.keys(draft).length;
  return (
    <Sheet
      wide
      title="Minha letra"
      icon={PenLine}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Pronto</Button>
          <Button variant="primary" disabled={!strokes.length} onClick={saveNext}>
            Guardar e ir para a próxima
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="hint">
          Escolha um caractere e escreva no quadro, em cima da linha de base, com a maiúscula até a linha de cima. Pode tirar a caneta e continuar (pingo do i, corte do t). Desenhe até {MAX_VERSIONS} versões de cada letra: o app sorteia entre elas para letras repetidas não ficarem iguais. As que você não desenhar saem na cursiva do app. {done} de {CHARSET.length} desenhados.
        </p>
        <div className="chips" role="group" aria-label="Caracteres">
          {CHARSET.map((c) => (
            <button key={c} type="button" aria-pressed={c === ch} aria-label={`${c}${draft[c] ? ", desenhada" : ""}`} onClick={() => pick(c)} style={{ minWidth: 32, justifyContent: "center", fontWeight: draft[c] ? 700 : 400, textDecoration: draft[c] ? "underline" : undefined }}>
              {c}
            </button>
          ))}
        </div>
        <div className="row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <DrawPad strokes={strokes} onChange={setStrokes} guides label={`Quadro da letra ${ch}`} />
          <div className="stack">
            <strong style={{ fontSize: 32 }}>{ch}</strong>
            <div className="chips" role="group" aria-label="Versões">
              {Array.from({ length: Math.min(MAX_VERSIONS, versions.length + 1) }, (_, i) => (
                <button key={i} type="button" aria-pressed={i === version} onClick={() => pick(ch, i)}>
                  {i < versions.length ? `Versão ${i + 1}` : "Nova versão"}
                </button>
              ))}
            </div>
            <Button disabled={!strokes.length} onClick={() => setStrokes(strokes.slice(0, -1))}>
              Desfazer traço
            </Button>
            <Button disabled={!strokes.length} onClick={() => setStrokes([])}>
              Limpar o quadro
            </Button>
            {version < versions.length && (
              <Button variant="danger" onClick={removeVersion}>
                Apagar esta versão
              </Button>
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
