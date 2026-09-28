import Anthropic from "@anthropic-ai/sdk";
import { Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadAiSettings } from "../ai/aiSettings";
import { aiErrorText, ask } from "../ai/claude";
import { RenderCancelled, renderScad } from "../ai/render";
import { extractReply } from "../ai/scad";
import type { Model } from "../geometry/types";
import type { Go } from "../pages";
import Alert from "../ui/Alert";
import ExportButtons from "../ui/ExportButtons";
import Preview3D from "../ui/Preview3D";

type Turn = { role: "user" | "assistant"; text: string; code?: string | null; tokens?: { in: number; out: number }; costUsd?: number | null; renderError?: string };

const MAX_AUTO_FIX = 2;
const usd = (n: number) => `US$ ${n.toFixed(n < 0.01 ? 4 : 3)}`;
const EXAMPLES = ["Porta-copos redondo de 90 mm com a palavra CAFÉ em relevo, base azul e letras brancas", "Suporte de celular para mesa, inclinado a 60°, com furo para o cabo", "Chaveiro de coração com furo para argola e borda em outra cor"];

export default function AskAI({ go }: { go: Go }) {
  const [settings, setSettings] = useState<{ apiKey: string | null; model: string } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<Anthropic.MessageParam[]>([]);
  const [input, setInput] = useState("");
  const [model3d, setModel3d] = useState<Model | null>(null);
  const [phase, setPhase] = useState<null | { kind: "claude"; chars: number } | { kind: "render" }>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<() => void>(() => {});
  const total = turns.reduce((s, t) => s + (t.costUsd ?? 0), 0);

  useEffect(() => {
    loadAiSettings()
      .then(setSettings)
      .catch((e) => setError(aiErrorText(e)));
  }, []);

  /** Uma volta: pergunta ao Claude, renderiza o código e, se o OpenSCAD falhar, pede a correção sozinho (até 2×). */
  async function send(userText: string, base: Anthropic.MessageParam[], fixesLeft = MAX_AUTO_FIX, auto = false) {
    if (!settings?.apiKey) return;
    const hist: Anthropic.MessageParam[] = [...base, { role: "user", content: userText }];
    setTurns((t) => [...t, { role: "user", text: auto ? "(correção automática do erro do OpenSCAD)" : userText }]);
    setError(null);
    const ctrl = new AbortController();
    cancelRef.current = () => ctrl.abort();
    setPhase({ kind: "claude", chars: 0 });
    try {
      const r = await ask(settings.apiKey, settings.model, hist, (chars) => setPhase({ kind: "claude", chars }), ctrl.signal);
      const reply = extractReply(r.text);
      const nextHist: Anthropic.MessageParam[] = [...hist, { role: "assistant", content: r.message.content }];
      setHistory(nextHist);
      const turn: Turn = { role: "assistant", text: reply.explanation, code: reply.code, tokens: { in: r.message.usage.input_tokens + (r.message.usage.cache_read_input_tokens ?? 0) + (r.message.usage.cache_creation_input_tokens ?? 0), out: r.message.usage.output_tokens }, costUsd: r.costUsd };
      setTurns((t) => [...t, turn]);
      if (!reply.code) return;
      setPhase({ kind: "render" });
      const job = renderScad(reply.code, "Peça da IA");
      cancelRef.current = job.cancel;
      try {
        setModel3d(await job.result);
      } catch (e) {
        if (e instanceof RenderCancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setTurns((t) => t.map((x) => (x === turn ? { ...x, renderError: msg } : x)));
        if (fixesLeft > 0) return send(`O OpenSCAD deu este erro ao renderizar:\n${msg}\nCorrija e mande o código completo de novo.`, nextHist, fixesLeft - 1, true);
        setError("O código ainda não renderizou. Descreva o problema com outras palavras ou peça algo mais simples.");
      }
    } catch (e) {
      if (!(e instanceof Anthropic.APIUserAbortError)) setError(aiErrorText(e));
    } finally {
      setPhase(null);
    }
  }

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const t = input.trim();
    if (!t || phase) return;
    setInput("");
    send(t, history);
  }

  if (settings && !settings.apiKey) {
    return (
      <div className="page">
        <h1>Pedir à IA</h1>
        <p className="lead">Descreva a peça em português e o Claude desenha o modelo em OpenSCAD. Você vê em 3D, pede ajustes e exporta o 3MF.</p>
        <div className="card stack" style={{ maxWidth: 560 }}>
          <Alert kind="info">
            Para usar, cadastre uma chave da API da Anthropic em Preferências. O uso é <strong>pago por pedido</strong> (normalmente alguns centavos de dólar), e cada
            pedido mostra o custo estimado.
          </Alert>
          <button className="primary" onClick={() => go("preferences")}>
            Ir para Preferências
          </button>
        </div>
      </div>
    );
  }

  const busyText = phase?.kind === "claude" ? (phase.chars ? `Claude escrevendo… ${phase.chars} caracteres` : "Claude pensando…") : "Renderizando no OpenSCAD…";

  return (
    <div className="page">
      <h1>Pedir à IA</h1>
      <p className="lead">Descreva a peça; peça ajustes na conversa até ficar bom. Cada parte declarada sai como uma cor separada no 3MF.</p>
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack chat" aria-live="polite">
            {turns.length === 0 && (
              <>
                <p className="muted">Exemplos:</p>
                {EXAMPLES.map((ex) => (
                  <button key={ex} className="example" onClick={() => setInput(ex)}>
                    <Sparkles aria-hidden /> {ex}
                  </button>
                ))}
              </>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`turn ${t.role}`}>
                <p>{t.text || (t.code ? "Aqui está o modelo." : "")}</p>
                {t.code && (
                  <details>
                    <summary>Ver código OpenSCAD</summary>
                    <pre>{t.code}</pre>
                  </details>
                )}
                {t.renderError && <Alert kind="warn">Erro no OpenSCAD: {t.renderError}</Alert>}
                {t.tokens && (
                  <span className="hint">
                    {t.tokens.in.toLocaleString("pt-BR")} tokens de entrada · {t.tokens.out.toLocaleString("pt-BR")} de saída · {t.costUsd == null ? "custo não estimado" : `≈ ${usd(t.costUsd)}`}
                  </span>
                )}
              </div>
            ))}
            {phase && (
              <div className="apply-bar">
                <span className="spinner" />
                <span>{busyText}</span>
                <button onClick={() => cancelRef.current()}>
                  <X aria-hidden /> Cancelar
                </button>
              </div>
            )}
            {error && <Alert kind="error">{error}</Alert>}
            <form className="stack" onSubmit={onSubmit}>
              <textarea
                value={input}
                rows={3}
                placeholder={turns.length ? "Peça um ajuste: “aumenta a borda para 3 mm”, “letras mais grossas”…" : "Descreva a peça: tamanho, formato, textos, cores…"}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit()}
              />
              <div className="row">
                <button className="primary" type="submit" disabled={!input.trim() || !!phase}>
                  <Send aria-hidden /> {turns.length ? "Pedir ajuste" : "Criar peça"}
                </button>
                <span className="hint">
                  Modelo: {settings?.model ?? "…"} · gasto nesta conversa ≈ {usd(total)}
                </span>
              </div>
            </form>
          </div>
          <ExportButtons models={model3d ? [model3d] : []} name="peca-ia" busy={!!phase} />
        </div>
        <div className="preview-col">
          <Preview3D models={model3d ? [model3d] : []} busy={phase?.kind === "render"} busyText="Renderizando no OpenSCAD…" emptyText="O modelo aparece aqui depois do primeiro pedido." />
        </div>
      </div>
    </div>
  );
}
