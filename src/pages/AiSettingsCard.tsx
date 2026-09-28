import { CircleCheck, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { loadAiSettings, looksLikeKey, saveAiSettings } from "../ai/aiSettings";
import { aiErrorText, testKey } from "../ai/claude";
import { AI_MODELS } from "../ai/cost";
import Alert from "../ui/Alert";
import { errorText, useToast } from "../ui/Toast";

/** Chave da API Anthropic e modelo da ferramenta "Pedir à IA". Nada disso vai para o backup. */
export default function AiSettingsCard() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [model, setModel] = useState<string>(AI_MODELS[0].id);
  const [custom, setCustom] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    loadAiSettings()
      .then((s) => {
        setSaved(!!s.apiKey);
        setModel(s.model);
        setCustom(!AI_MODELS.some((m) => m.id === s.model));
      })
      .catch((e) => toast(`Erro ao ler as preferências de IA: ${errorText(e)}`, "error"));
  }, [toast]);

  async function onSave() {
    const k = key.trim();
    if (k && !looksLikeKey(k)) return setStatus({ kind: "error", text: "Isso não parece uma chave da Anthropic (começa com sk-ant-)." });
    try {
      const current = (await loadAiSettings()).apiKey;
      await saveAiSettings(k || current, model.trim());
      if (k) setSaved(true);
      setKey("");
      setStatus({ kind: "ok", text: "Preferências de IA salvas neste computador." });
    } catch (e) {
      setStatus({ kind: "error", text: errorText(e) });
    }
  }

  async function onTest() {
    setTesting(true);
    setStatus({ kind: "info", text: "Testando…" });
    try {
      const k = key.trim() || (await loadAiSettings()).apiKey;
      if (!k) throw new Error("Cole a chave primeiro.");
      const name = await testKey(k, model.trim());
      setStatus({ kind: "ok", text: `Chave funcionando com ${name}. O teste não gera custo.` });
    } catch (e) {
      setStatus({ kind: "error", text: aiErrorText(e) });
    } finally {
      setTesting(false);
    }
  }

  async function onRemove() {
    await saveAiSettings(null, model);
    setSaved(false);
    setStatus({ kind: "info", text: "Chave removida deste computador." });
  }

  return (
    <div className="card stack">
      <h2 style={{ marginTop: 0 }}>Inteligência artificial (opcional)</h2>
      <Alert kind="warn">
        A ferramenta <strong>Pedir à IA</strong> usa a API da Anthropic, que é <strong>paga por uso</strong> e cobrada no cartão da conta dona da chave. Cada pedido
        mostra os tokens e o custo estimado. A chave fica guardada só neste computador e não entra no backup.
      </Alert>
      <label>
        Chave da API {saved && <span className="badge ok"><CircleCheck size={11} /> salva</span>}
        <input type="password" autoComplete="off" spellCheck={false} placeholder={saved ? "•••••••• (cole outra para trocar)" : "sk-ant-…"} value={key} onChange={(e) => setKey(e.target.value)} />
        <span className="hint">Crie em console.anthropic.com → API Keys.</span>
      </label>
      <label>
        Modelo
        <select
          value={custom ? "custom" : model}
          onChange={(e) => {
            const v = e.target.value;
            setCustom(v === "custom");
            if (v !== "custom") setModel(v);
          }}
        >
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} · US$ {m.input}/{m.output} por milhão de tokens
            </option>
          ))}
          <option value="custom">Outro (digitar ID)</option>
        </select>
      </label>
      {custom && (
        <label>
          ID do modelo
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-…" />
          <span className="hint">Para modelos fora da lista o custo não é estimado.</span>
        </label>
      )}
      {status && <Alert kind={status.kind}>{status.text}</Alert>}
      <div className="row">
        <button className="primary" onClick={onSave}>
          <KeyRound aria-hidden /> Salvar
        </button>
        <button onClick={onTest} disabled={testing}>
          Testar chave
        </button>
        {saved && (
          <button className="danger" onClick={onRemove}>
            Remover chave
          </button>
        )}
      </div>
    </div>
  );
}
