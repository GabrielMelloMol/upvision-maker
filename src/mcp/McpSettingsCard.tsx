import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { getDb } from "../db";
import { deleteSecret, getSecret, setSecret } from "../db/repo";
import { errorText, useToast } from "../ui/Toast";
import Toggle from "../ui/Toggle";

// a chave fica na tabela local de segredos, fora do backup e da sincronização (como a chave da IA)
const KEY = "mcp_token";
const URL = "http://127.0.0.1:47821/mcp";

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

export const claudeCodeCommand = (token: string) => `claude mcp add --transport http upvision ${URL} --header "Authorization: Bearer ${token}"`;
export const desktopConfig = (token: string) =>
  JSON.stringify({ mcpServers: { upvision: { command: "npx", args: ["-y", "mcp-remote", URL, "--header", `Authorization: Bearer ${token}`] } } }, null, 2);

export const codexConfig = (token: string) => `[mcp_servers.upvision]\nurl = "${URL}"\nhttp_headers = { Authorization = "Bearer ${token}" }`;

/** Na abertura do app: se o conector estava ligado, liga de novo (a IA configurada continua funcionando). */
export async function startMcpIfOn(): Promise<void> {
  const token = await getSecret(await getDb(), KEY);
  if (token) await invoke("mcp_start", { token });
}

/** Preferências → IA no app (MCP, #304): desligado por padrão; só este computador, com a chave. */
export default function McpSettingsCard() {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    void getDb().then((db) => getSecret(db, KEY)).then(setToken, () => {});
  }, []);

  async function turn(on: boolean, fresh = false) {
    setBusy(true);
    try {
      const db = await getDb();
      if (on) {
        const t = fresh || !token ? newToken() : token;
        await invoke("mcp_start", { token: t });
        await setSecret(db, KEY, t);
        setToken(t);
        if (fresh) toast("Chave nova criada. Copie a configuração de novo na sua IA.");
      } else {
        await invoke("mcp_stop");
        await deleteSecret(db, KEY);
        setToken(null);
      }
    } catch (e) {
      toast(`Não foi possível ${on ? "ligar" : "desligar"} o conector: ${errorText(e)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copiado.");
    } catch (e) {
      toast(`Não consegui copiar: ${errorText(e)}`, "error");
    }
  }

  return (
    <section className="group" aria-labelledby="mcp-title">
      <h2 className="group-title" id="mcp-title">
        IA no app (MCP)
      </h2>
      <div className="rows">
        <Toggle
          label="Deixar uma IA deste computador usar o app"
          checked={!!token}
          disabled={busy}
          onChange={(on) => turn(on)}
          hint="Para o Claude (ou outra IA com MCP) ver pedidos, estoque, clientes, orçamentos e o financeiro, e criar clientes e orçamentos. Ela não apaga nada nem muda pedidos. Atenção: o que a IA lê (inclusive nome e telefone de clientes) vai para a empresa da IA. Só funciona com o app aberto."
        />
        {token && (
          <div className="stack">
            <span className="field-label">Claude Code: rode no Terminal</span>
            <code className="path">{claudeCodeCommand(token)}</code>
            <button type="button" className="link" onClick={() => copy(claudeCodeCommand(token))}>
              Copiar comando
            </button>
            <span className="field-label">Claude Desktop: em Configurações → Desenvolvedor → Editar configuração, cole (precisa do Node instalado)</span>
            <code className="path">{desktopConfig(token)}</code>
            <button type="button" className="link" onClick={() => copy(desktopConfig(token))}>
              Copiar configuração
            </button>
            <span className="field-label">Codex (OpenAI): cole no fim do arquivo config.toml da pasta .codex (no Mac, ~/.codex; no Windows, C:\Users\seu-nome\.codex) e abra o Codex de novo</span>
            <code className="path">{codexConfig(token)}</code>
            <button type="button" className="link" onClick={() => copy(codexConfig(token))}>
              Copiar para o Codex
            </button>
            <span className="hint">A chave é como uma senha: não mande para ninguém. Se vazou, gere outra; a antiga para de valer na hora.</span>
            <button type="button" className="link danger" disabled={busy} onClick={() => turn(true, true)}>
              Gerar chave nova
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
