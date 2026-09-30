import Anthropic from "@anthropic-ai/sdk";
import { SlidersHorizontal, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadAiSettings } from "../ai/aiSettings";
import { aiErrorText, ask, countInputTokens } from "../ai/claude";
import { estimateInputCostUsd } from "../ai/cost";
import { imageUrl, MAX_IMAGES, prepareImage, userContent, type RefImage } from "../ai/images";
import { RenderCancelled, renderScad } from "../ai/render";
import { extractReply, parametrizePrompt } from "../ai/scad";
import { getDb } from "../db";
import { parseCustomizer } from "../scad/customizer";
import { OWN_LICENSE, openScadNext, saveScad } from "../scad/library";
import type { Model } from "../geometry/types";
import type { Go } from "../pages";
import Alert from "../ui/Alert";
import ExportButtons from "../ui/ExportButtons";
import Preview3D from "../ui/Preview3D";
import Attachments from "./askai/Attachments";

type Turn = { role: "user" | "assistant"; text: string; images?: string[]; code?: string | null; tokens?: { in: number; out: number }; costUsd?: number | null; renderError?: string };

const MAX_AUTO_FIX = 2;
const ESTIMATE_DEBOUNCE_MS = 600;
const usd = (n: number) => `US$ ${n.toFixed(n < 0.01 ? 4 : 3)}`;
const EXAMPLES = ["Porta-copos redondo de 90 mm com a palavra CAFÉ em relevo, base azul e letras brancas", "Suporte de celular para mesa, inclinado a 60°, com furo para o cabo", "Chaveiro de coração com furo para argola e borda em outra cor"];

export default function AskAI({ go }: { go: Go }) {
  const [settings, setSettings] = useState<{ apiKey: string | null; model: string } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<Anthropic.MessageParam[]>([]);
  const [input, setInput] = useState("");
  const [model3d, setModel3d] = useState<Model | null>(null);
  const [modelCode, setModelCode] = useState<string | null>(null); // código da peça na tela (para "Virar modelo", #97)
  const [phase, setPhase] = useState<null | { kind: "claude"; chars: number } | { kind: "render" }>(null);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<RefImage[]>([]); // referências do próximo pedido (#89)
  // estimativa do próximo pedido, guardada com a "assinatura" do pedido que foi contado
  const [estimate, setEstimate] = useState<{ sig: string; tokens: number; usd: number | null } | { sig: string; error: true } | null>(null);
  const cancelRef = useRef<() => void>(() => {});
  const total = turns.reduce((s, t) => s + (t.costUsd ?? 0), 0);

  useEffect(() => {
    loadAiSettings()
      .then(setSettings)
      .catch((e) => setError(aiErrorText(e)));
  }, []);

  // custo do próximo pedido com as imagens, contado pela API antes de enviar (gratuito), com espera para não contar a cada tecla
  const sig = `${settings?.model}|${history.length}|${input.trim()}|${images.map((i) => i.id + i.caption).join(",")}`;
  useEffect(() => {
    const key = settings?.apiKey;
    if (!key || (!input.trim() && !images.length) || phase) return;
    const t = setTimeout(() => {
      const hist: Anthropic.MessageParam[] = [...history, { role: "user", content: userContent(input.trim() || "(sem texto)", images) }];
      countInputTokens(key, settings.model, hist)
        .then((tokens) => setEstimate({ sig, tokens, usd: estimateInputCostUsd(settings.model, tokens) }))
        .catch((e) => {
          console.warn("Não deu para estimar o custo do pedido:", e);
          setEstimate({ sig, error: true });
        });
    }, ESTIMATE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [settings, input, images, history, phase, sig]);
  const shown = estimate?.sig === sig && !phase ? estimate : null;

  async function addImages(files: Blob[], png = false) {
    const room = MAX_IMAGES - images.length;
    const left = files.length - room;
    if (left > 0) setError(`Até ${MAX_IMAGES} imagens por pedido: ${left} ${left === 1 ? "ficou" : "ficaram"} de fora.`);
    for (const f of files.slice(0, Math.max(0, room))) {
      try {
        const img = await prepareImage(f, { png });
        setImages((cur) => (cur.length < MAX_IMAGES ? [...cur, img] : cur));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  /** Uma volta: pergunta ao Claude, renderiza o código e, se o OpenSCAD falhar, pede a correção sozinho (até 2×). */
  async function send(userText: string, base: Anthropic.MessageParam[], fixesLeft = MAX_AUTO_FIX, auto = false, refs: RefImage[] = []) {
    if (!settings?.apiKey) return;
    const hist: Anthropic.MessageParam[] = [...base, { role: "user", content: userContent(userText, refs) }];
    setTurns((t) => [...t, { role: "user", text: auto ? "(correção automática do erro do OpenSCAD)" : userText, images: refs.map(imageUrl) }]);
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
        setModelCode(reply.code);
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

  /** "Virar modelo" (#97): 1 pedido ao Claude expõe as medidas como parâmetros; guarda em Meus modelos e abre o formulário. */
  async function makeModel() {
    if (!settings?.apiKey || !modelCode || phase) return;
    setError(null);
    const ctrl = new AbortController();
    cancelRef.current = () => ctrl.abort();
    setPhase({ kind: "claude", chars: 0 });
    try {
      const r = await ask(settings.apiKey, settings.model, [{ role: "user", content: parametrizePrompt(modelCode) }], (chars) => setPhase({ kind: "claude", chars }), ctrl.signal);
      const code = extractReply(r.text).code;
      const tokens = { in: r.message.usage.input_tokens + (r.message.usage.cache_read_input_tokens ?? 0) + (r.message.usage.cache_creation_input_tokens ?? 0), out: r.message.usage.output_tokens };
      setTurns((t) => [...t, { role: "assistant", text: "Modelo com parâmetros criado.", code, tokens, costUsd: r.costUsd }]);
      if (!code || !parseCustomizer(code).length) throw new Error("A IA não devolveu parâmetros no formato do Customizer. Tente de novo.");
      setPhase({ kind: "render" });
      const job = renderScad(code, "Modelo da IA");
      cancelRef.current = job.cancel;
      await job.result; // confere que renderiza antes de guardar
      const firstAsk = turns.find((t) => t.role === "user")?.text ?? "Peça da IA";
      const saved = { name: firstAsk.slice(0, 40), source: code, license: OWN_LICENSE.id, credit: "Feito no Pedir à IA", values: {} };
      await saveScad(await getDb(), saved);
      openScadNext(saved);
      go("scad");
    } catch (e) {
      if (e instanceof RenderCancelled || e instanceof Anthropic.APIUserAbortError) return;
      setError(aiErrorText(e));
    } finally {
      setPhase(null);
    }
  }

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const t = input.trim();
    if ((!t && !images.length) || phase) return;
    setInput("");
    const refs = images;
    setImages([]);
    send(t || "Faça uma peça como na(s) imagem(ns).", history, MAX_AUTO_FIX, false, refs);
  }

  if (settings && !settings.apiKey) {
    return (
      <div className="page">
        <h1>Pedir à IA</h1>
        <p className="lead">Descreva a peça e o Claude modela em 3D.</p>
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
      <p className="lead">Peça ajustes na conversa; cada parte sai numa cor.</p>
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
                {t.images && t.images.length > 0 && (
                  <div className="ref-sent">
                    {t.images.map((src, n) => (
                      <img key={n} src={src} alt={`Imagem ${n + 1} enviada`} />
                    ))}
                  </div>
                )}
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
            <form
              className="stack"
              onSubmit={onSubmit}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
                if (!files.length) return;
                e.preventDefault();
                void addImages(files);
              }}
            >
              <textarea
                onPaste={(e) => {
                  const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
                  if (!files.length) return;
                  e.preventDefault();
                  void addImages(files);
                }}
                value={input}
                rows={3}
                placeholder={turns.length ? "Peça um ajuste: “aumenta a borda para 3 mm”, “letras mais grossas”…" : "Descreva a peça: tamanho, formato, textos, cores…"}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit()}
              />
              <Attachments images={images} onChange={setImages} onAdd={(f, png) => void addImages(f, png)} disabled={!!phase} />
              <div className="row">
                <button className="primary" type="submit" disabled={(!input.trim() && !images.length) || !!phase}>
                  <Send aria-hidden /> {turns.length ? "Pedir ajuste" : "Criar peça"}
                </button>
                <span className="hint">
                  Modelo: {settings?.model ?? "…"} · gasto nesta conversa ≈ {usd(total)}
                  {shown &&
                    ("error" in shown
                      ? " · estimativa do próximo pedido indisponível"
                      : ` · próximo pedido: ${shown.tokens.toLocaleString("pt-BR")} tokens de entrada${images.length ? " com as imagens" : ""}${shown.usd == null ? "" : ` ≈ ${usd(shown.usd)}`} + resposta`)}
                </span>
              </div>
            </form>
          </div>
          <ExportButtons models={model3d ? [model3d] : []} name="peca-ia" busy={!!phase} />
          {model3d && modelCode && (
            <div className="card stack">
              <button type="button" disabled={!!phase} onClick={() => void makeModel()}>
                <SlidersHorizontal aria-hidden /> Virar modelo
              </button>
              <span className="hint">1 pedido ao Claude transforma as medidas e textos em campos. Depois, ajustar pelo formulário não custa nada.</span>
            </div>
          )}
        </div>
        <div className="preview-col">
          <Preview3D models={model3d ? [model3d] : []} busy={phase?.kind === "render"} busyText="Renderizando no OpenSCAD…" emptyText="O modelo aparece aqui depois do primeiro pedido." />
        </div>
      </div>
    </div>
  );
}
