import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { qrSvg } from "../domain/qr";
import Alert from "../ui/Alert";
import { errorText, useToast } from "../ui/Toast";
import Toggle from "../ui/Toggle";

type LanStatus = { running: boolean; url: string; code: string; phones: number; locked: boolean };
const OFF: LanStatus = { running: false, url: "", code: "", phones: 0, locked: false };

/** "123456" → "123 456". */
export const groupCode = (c: string) => c.replace(/^(\d{3})(\d{3})$/, "$1 $2");
/** O QR já leva o código: ler com a câmera conecta sem digitar. */
export const pairUrl = (s: LanStatus) => `${s.url}#codigo=${s.code}`;

/**
 * Preferências → Celular na rede de casa (#16). Desligado por padrão (e a cada abertura do app); só a rede local
 * enxerga, e cada celular entra com o código de 6 dígitos da tela.
 */
export default function PhoneSettingsCard() {
  const [status, setStatus] = useState<LanStatus>(OFF);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const refresh = () => invoke<LanStatus>("lan_status").then(setStatus, () => {});
    void refresh();
    const off = listen("lan-changed", refresh); // celular conectou ou o código foi trocado
    return () => void off.then((f) => f()).catch(() => {});
  }, []);

  async function run(cmd: "lan_start" | "lan_stop" | "lan_disconnect_all" | "lan_new_code") {
    setBusy(true);
    try {
      setStatus((await invoke<LanStatus | null>(cmd)) ?? OFF);
      if (cmd === "lan_disconnect_all") toast("Celulares desconectados. Para voltar, use o código novo.");
    } catch (e) {
      toast(`Não foi possível ${cmd === "lan_start" ? "ligar" : "mudar"} o acesso do celular: ${errorText(e)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="group" aria-labelledby="phone-title">
      <h2 className="group-title" id="phone-title">
        Celular na rede de casa
      </h2>
      <div className="rows">
        <Toggle
          label="Deixar o celular ver pedidos e estoque"
          checked={status.running}
          disabled={busy}
          onChange={(on) => run(on ? "lan_start" : "lan_stop")}
          hint="Só funciona no mesmo Wi-Fi e com este computador ligado e o app aberto. Nada fica aberto para a internet; desliga sozinho quando você fecha o app."
        />
      {status.running && (
        <>
          <div className="phone-pair">
            <img className="phone-qr" src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(pairUrl(status), 40))}`} alt="QR Code para abrir no celular" width={180} height={180} />
            <div className="stack">
              <span className="field-label">No celular, leia o QR com a câmera ou abra</span>
              <code className="path">{status.url}</code>
              <span className="field-label">e digite o código</span>
              <strong className="pair-code" aria-label={`Código ${status.code.split("").join(" ")}`}>
                {groupCode(status.code)}
              </strong>
              <span className="hint">O código vale para um celular e troca depois de usado.</span>
              {status.locked && (
                <Alert kind="warn">
                  Alguém errou o código 5 vezes e ninguém consegue entrar agora.{" "}
                  <button type="button" className="link" disabled={busy} onClick={() => run("lan_new_code")}>
                    Gerar código novo
                  </button>
                </Alert>
              )}
            </div>
          </div>
          <div className="row-action">
            <span>Celulares conectados: {status.phones}</span>
            {status.phones > 0 && (
              <button type="button" className="link danger" disabled={busy} onClick={() => run("lan_disconnect_all")}>
                Desconectar todos
              </button>
            )}
          </div>
        </>
      )}
      </div>
    </section>
  );
}
