import { CircleCheck, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { loadAiSettings, looksLikeKey, looksLikeWorkspace, saveAiSettings } from "../ai/aiSettings";
import { aiError, type AiErrorInfo, testKey } from "../ai/claude";
import { AI_MODELS } from "../ai/cost";
import AiErrorAlert from "../tools/askai/AiErrorAlert";
import Alert from "../ui/Alert";
import { errorText, useToast } from "../ui/Toast";

/** Chave da API Anthropic e modelo da ferramenta "Pedir à IA". Nada disso vai para o backup. */
export default function AiSettingsCard() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [model, setModel] = useState<string>(AI_MODELS[0].id);
  const [custom, setCustom] = useState(false);
  const [workspace, setWorkspace] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [apiError, setApiError] = useState<AiErrorInfo | null>(null);
  const [testing, setTesting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    loadAiSettings()
      .then((s) => {
        setSaved(!!s.apiKey);
        setModel(s.model);
        setCustom(!AI_MODELS.some((m) => m.id === s.model));
        setWorkspace(s.workspaceId ?? "");
      })
      .catch((e) => toast(`Erro ao ler as preferências de IA: ${errorText(e)}`, "error"));
  }, [toast]);

  async function onSave() {
    const k = key.trim();
    const w = workspace.trim();
    setApiError(null);
    if (k && !looksLikeKey(k)) return setStatus({ kind: "error", text: "Isso não parece uma chave da Anthropic (começa com sk-ant-)." });
    if (w && !looksLikeWorkspace(w)) return setStatus({ kind: "error", text: "O ID do workspace começa com wrkspc_ (copie em console.anthropic.com → Settings → Workspaces)." });
    try {
      const current = (await loadAiSettings()).apiKey;
      await saveAiSettings(k || current, model.trim(), w || null);
      if (k) setSaved(true);
      setKey("");
      setStatus({ kind: "ok", text: "Preferências de IA salvas neste computador." });
    } catch (e) {
      setStatus({ kind: "error", text: errorText(e) });
    }
  }

  async function onTest() {
    const w = workspace.trim();
    setApiError(null);
    if (w && !looksLikeWorkspace(w)) return setStatus({ kind: "error", text: "O ID do workspace começa com wrkspc_ (copie em console.anthropic.com → Settings → Workspaces)." });
    setTesting(true);
    setStatus({ kind: "info", text: "Testando…" });
    try {
      const k = key.trim() || (await loadAiSettings()).apiKey;
      if (!k) throw new Error("Cole a chave primeiro.");
      const name = await testKey({ apiKey: k, workspaceId: w || null }, model.trim());
      setStatus({ kind: "ok", text: `Chave funcionando com ${name}. O teste não gera custo.` });
    } catch (e) {
      setStatus(null);
      setApiError(aiError(e));
    } finally {
      setTesting(false);
    }
  }

  async function onRemove() {
    await saveAiSettings(null, model, workspace.trim() || null);
    setSaved(false);
    setStatus({ kind: "info", text: "Chave removida deste computador." });
  }

  return (
    <form
      className="group"
      aria-labelledby="ai-title"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void onSave();
      }}
    >
      <h2 className="group-title" id="ai-title">
        Inteligência artificial (opcional)
      </h2>
      <div className="rows">
        <label>
          <span>
            Chave da API {saved && <span className="badge ok"><CircleCheck size={11} /> salva</span>}
          </span>
          <input type="password" autoComplete="off" spellCheck={false} placeholder={saved ? "•••••••• (cole outra para trocar)" : "sk-ant-…"} value={key} onChange={(e) => setKey(e.target.value)} />
          <span className="hint">Crie a chave no site console.anthropic.com, dentro de um workspace: Settings (Configurações) → Workspaces → escolha o workspace → API keys (chaves de API) → Create key (criar chave).</span>
        </label>
        <label>
          ID do workspace (opcional)
          <input spellCheck={false} autoComplete="off" placeholder="wrkspc_…" value={workspace} onChange={(e) => setWorkspace(e.target.value)} />
          <span className="hint">Só para chave que não é de um workspace só. Fica em console.anthropic.com → Settings → Workspaces.</span>
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
      </div>
      <p className="hint group-note">
        A ferramenta <strong>Pedir à IA</strong> usa o Claude, da Anthropic, por uma chave de acesso (a "API"), que é <strong>paga por uso</strong> e cobrada no cartão da conta dona da chave. Cada pedido
        mostra os tokens e o custo estimado. A chave fica guardada só neste computador e não entra no backup.
      </p>
      {status && <Alert kind={status.kind}>{status.text}</Alert>}
      {apiError && <AiErrorAlert info={apiError} />}
      <div className="row">
        {/* botão comum: o principal da página é o Salvar preferências (#165) */}
        <button type="submit">
          <KeyRound aria-hidden /> Salvar
        </button>
        <button type="button" onClick={onTest} disabled={testing}>
          Testar chave
        </button>
        {saved && (
          <button type="button" className="danger" onClick={onRemove}>
            Remover chave
          </button>
        )}
      </div>
    </form>
  );
}
