import { useCallback, useEffect, useRef, useState } from "react";
import { getDb } from "../db";
import { toolProjects, toolState, type ToolProject } from "../db/toolStateRepo";
import { snapshotPreview } from "../ui/Preview3D";
import { errorText, useToast } from "../ui/Toast";
import { useHistory } from "../ui/useHistory";

/** Espera depois da última mudança para gravar o rascunho no banco. */
const AUTOSAVE_MS = 800;

type Envelope = { v: number; state: unknown };

type Options<T> = {
  /** Muda quando o formato do estado muda: rascunho de outra versão é ignorado (não quebra a ferramenta). */
  version?: number;
  /** Nome curto da ferramenta para os avisos ("O chaveiro ficou guardado…"). */
  label: string;
  /** Converte o estado para JSON (ex.: File → dataURL) e de volta; padrão = o próprio objeto. */
  save?: (s: T) => unknown | Promise<unknown>;
  load?: (raw: unknown) => T | null | Promise<T | null>;
};

// File vira "{}" e bytes viram listas enormes no JSON: compara por identidade barata (nome, tamanho, data / tamanho)
const byteIds = new WeakMap<Uint8Array, number>(); // mesmos bytes (mesma referência) = mesmo id
let nextByteId = 0;
const fileKey = (_k: string, v: unknown) => {
  if (typeof File !== "undefined" && v instanceof File) return `file:${v.name}:${v.size}:${v.lastModified}`;
  if (v instanceof Uint8Array) {
    if (!byteIds.has(v)) byteIds.set(v, nextByteId++);
    return `bytes:${v.length}:${byteIds.get(v)}`;
  }
  return v;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a, fileKey) === JSON.stringify(b, fileKey);

/**
 * Estado de uma ferramenta que não se perde (#85): desfazer/refazer (⌘Z / ⇧⌘Z fora de campos de texto), rascunho
 * gravado sozinho no banco (entra no backup), "Continuar de onde parou" ao voltar e os últimos projetos exportados.
 * Troque os useState do estado "de trabalho" por um objeto aqui; `field(k)` dá o onChange de cada campo.
 */
export function useToolState<T extends object>(toolId: string, initial: T | (() => T), opts: Options<T>) {
  const hist = useHistory<T>(initial);
  const state = hist.value;
  const version = opts.version ?? 1;
  const toast = useToast();
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const [draft, setDraft] = useState<{ state: T; at: string } | null>(null);
  const [projects, setProjects] = useState<ToolProject[]>([]);
  const baseline = useRef<T>(state); // o que está na tela sem trabalho novo (inicial, rascunho aceito ou projeto aberto)
  const exported = useRef(true); // nada novo desde o último arquivo salvo
  const loaded = useRef(false);

  const decode = useCallback(async (json: string): Promise<T | null> => {
    try {
      const env = JSON.parse(json) as Envelope;
      if (env.v !== version) return null;
      return (await optsRef.current.load?.(env.state)) ?? (optsRef.current.load ? null : (env.state as T));
    } catch {
      return null;
    }
  }, [version]);
  const encode = useCallback(async (s: T) => JSON.stringify({ v: version, state: (await optsRef.current.save?.(s)) ?? s } satisfies Envelope), [version]);

  // abrir: rascunho guardado (oferece continuar) e últimos projetos
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const db = await getDb();
        const [row, list] = await Promise.all([toolState.get(db, toolId), toolProjects.list(db, toolId)]);
        if (!alive) return;
        setProjects(list);
        const s = row ? await decode(row.data) : null;
        if (alive && s && !same(s, baseline.current)) setDraft({ state: s, at: row!.updatedAt });
      } catch (e) {
        console.warn(`Rascunho de ${toolId} indisponível:`, e);
      } finally {
        loaded.current = true;
      }
    })();
    return () => {
      alive = false;
    };
  }, [toolId, decode]);

  // gravar o rascunho sozinho; mexer na ferramenta com o "Continuar" aberto é começar do zero
  useEffect(() => {
    if (!loaded.current || same(state, baseline.current)) return;
    exported.current = false;
    setDraft(null);
    const t = setTimeout(async () => {
      try {
        const db = await getDb();
        await toolState.save(db, { id: toolId, data: await encode(state), updatedAt: new Date().toISOString() });
      } catch (e) {
        console.warn(`Não deu para guardar o rascunho de ${toolId}:`, e);
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [state, toolId, encode]);

  // aviso ao sair com trabalho não exportado: nada se perde, fica guardado para o "Continuar"
  useEffect(
    () => () => {
      if (!exported.current) toast(`${optsRef.current.label}: seu trabalho ficou guardado. Ao voltar, é só tocar em Continuar.`);
    },
    [toast],
  );

  // ⌘Z / ⇧⌘Z fora de campos de texto (dentro deles vale o desfazer do próprio campo)
  const { undo, redo } = hist;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const set = hist.set;
  /** Setter de um campo (valor ou função do valor anterior, como o do useState): digitar seguido no mesmo campo é um passo só. */
  const field = useCallback(
    <K extends keyof T>(k: K) =>
      (v: T[K] | ((prev: T[K]) => T[K])) =>
        set((cur) => ({ ...cur, [k]: typeof v === "function" ? (v as (prev: T[K]) => T[K])(cur[k]) : v }), String(k)),
    [set],
  );

  async function reload() {
    setProjects(await toolProjects.list(await getDb(), toolId));
  }

  /** Preenchimento automático (ex.: dados da empresa ao abrir): muda o estado sem passo de desfazer e sem contar como trabalho novo. */
  const { reset } = hist;
  const adopt = useCallback(
    (fn: (cur: T) => T) => {
      const next = fn(baseline.current);
      baseline.current = next;
      reset(next);
    },
    [reset],
  );

  return {
    state,
    adopt,
    /** Um passo de desfazer (ou atualização de uma função). Com `key`, junta mudanças seguidas do mesmo campo. */
    set,
    field,
    undo,
    redo,
    canUndo: hist.canUndo,
    canRedo: hist.canRedo,
    /** Rascunho guardado de antes, esperando "Continuar" ou "Começar do zero". */
    draft: draft && {
      at: draft.at,
      resume() {
        baseline.current = draft.state;
        hist.reset(draft.state);
        setDraft(null);
      },
      async discard() {
        setDraft(null);
        try {
          await toolState.remove(await getDb(), toolId);
        } catch (e) {
          toast(errorText(e), "error");
        }
      },
    },
    projects,
    /** Chamar depois de salvar o arquivo: guarda o projeto (com miniatura da prévia) nos últimos 10. */
    async exported(name: string) {
      exported.current = true;
      try {
        const db = await getDb();
        await toolProjects.add(db, { toolId, name, data: await encode(state), thumb: snapshotPreview(), at: new Date().toISOString() });
        await reload();
      } catch (e) {
        console.warn(`Projeto de ${toolId} não entrou no histórico:`, e);
      }
    },
    /** Reabre um projeto (um passo de desfazer: dá para voltar ao que estava na tela). */
    async open(p: ToolProject) {
      const s = await decode(p.data);
      if (!s) return toast("Este projeto é de outra versão do app e não pôde ser aberto.", "error");
      set(s);
    },
    async removeProject(p: ToolProject) {
      try {
        await toolProjects.remove(await getDb(), p.id);
        await reload();
      } catch (e) {
        toast(errorText(e), "error");
      }
    },
  };
}

export type ToolSession = ReturnType<typeof useToolState<object>>;
