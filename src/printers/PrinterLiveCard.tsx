import { invoke } from "@tauri-apps/api/core";
import { Radio, Search, Wifi } from "lucide-react";
import { useState, type FormEvent } from "react";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Field from "../ui/Field";
import Sheet from "../ui/Sheet";
import { errorText, useToast } from "../ui/Toast";
import { forget, usePrinters, watch, type Live, type PrinterNow } from "./live";

type Found = { ip: string; serial: string; model: string; name: string };
const EMPTY = { ip: "", serial: "", code: "", name: "" };

export const remaining = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`);

function Status({ now }: { now: PrinterNow }) {
  const parts = [
    now.percent !== null && `${now.percent}%`,
    now.remainingMin !== null && now.remainingMin > 0 && `faltam ${remaining(now.remainingMin)}`,
    now.layer !== null && now.layers ? `camada ${now.layer} de ${now.layers}` : null,
  ].filter(Boolean);
  return (
    <div className="stack">
      <span>
        <strong>{now.label}</strong>
        {now.job && ` · ${now.job}`}
        {parts.length > 0 && ` · ${parts.join(" · ")}`}
      </span>
      {now.percent !== null && <progress max={100} value={now.percent} aria-label="Andamento da impressão" />}
      <span className="hint">
        {[now.nozzle !== null && `Bico ${Math.round(now.nozzle)} °C`, now.bed !== null && `Mesa ${Math.round(now.bed)} °C`].filter(Boolean).join(" · ")}
      </span>
      {now.trays.length > 0 && (
        <span className="row" aria-label="Filamentos carregados">
          {now.trays.map((t, i) => (
            <span key={i} className="hint" title={`${t.type}${t.remain !== null ? `, ${t.remain}% no rolo` : ""}`}>
              <span aria-hidden style={{ display: "inline-block", width: 12, height: 12, borderRadius: 6, marginRight: 4, verticalAlign: "middle", background: t.hex ?? "transparent", border: "1px solid var(--line, #ccc)" }} />
              {t.type}
              {t.remain !== null && ` ${t.remain}%`}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function Row({ p }: { p: Live }) {
  const toast = useToast();
  return (
    <div className="row-action">
      <div className="stack" style={{ flex: 1 }}>
        <span className="field-label">
          {p.link.name || p.link.serial} {!p.online && "(sem conexão)"}
        </span>
        {p.error && <Alert kind="warn">{p.error}</Alert>}
        {p.now ? <Status now={p.now} /> : p.online && <span className="hint">Esperando a impressora mandar o estado…</span>}
      </div>
      <button type="button" className="link danger" onClick={() => forget(p.link.serial).catch((e) => toast(errorText(e), "error"))}>
        Esquecer
      </button>
    </div>
  );
}

/** Impressoras → acompanhar uma Bambu pela rede de casa (#15), só leitura. */
export default function PrinterLiveCard() {
  const printers = [...usePrinters().values()];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [found, setFound] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  async function search() {
    setBusy(true);
    setError("");
    try {
      const list = await invoke<Found[]>("printer_discover");
      setFound(list);
      if (list.length === 1) setForm((f) => ({ ...f, ip: list[0].ip, serial: list[0].serial, name: f.name || list[0].name }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function connect(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await watch({ ip: form.ip.trim(), serial: form.serial.trim(), code: form.code.trim(), pin: "", name: form.name.trim() });
      toast("Impressora conectada.");
      setOpen(false);
      setForm(EMPTY);
      setFound(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const close = () => (setOpen(false), setError(""));
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <Card title="Acompanhar pela rede" icon={Radio}>
      <div className="stack">
        <p className="hint">
          Veja na hora o que a sua Bambu está imprimindo, quanto falta e os filamentos carregados, e receba um aviso quando ela terminar, pausar ou parar com erro. Só leitura: o app não manda nenhum comando para a impressora.
        </p>
        {printers.map((p) => (
          <Row key={p.link.serial} p={p} />
        ))}
        <Button icon={Wifi} onClick={() => setOpen(true)} style={{ justifySelf: "start" }}>
          Conectar uma Bambu
        </Button>
      </div>
      {open && (
        <Sheet
          title="Conectar uma Bambu"
          icon={Wifi}
          onClose={close}
          onSubmit={connect}
          footer={
            <>
              <Button onClick={close}>Cancelar</Button>
              <Button variant="primary" type="submit" disabled={busy || !form.ip || !form.serial || !form.code}>
                Conectar
              </Button>
            </>
          }
        >
          <div className="stack">
            <Button icon={Search} onClick={search} disabled={busy} style={{ justifySelf: "start" }}>
              {busy && found === null ? "Procurando…" : "Procurar na rede"}
            </Button>
            {found?.length === 0 && <Alert kind="warn">Nenhuma Bambu respondeu. Ela está ligada e no mesmo Wi-Fi? Dá para preencher o IP e a série à mão.</Alert>}
            {found && found.length > 1 && (
              <div className="row">
                {found.map((f) => (
                  <button key={f.serial} type="button" className="link" onClick={() => setForm({ ...form, ip: f.ip, serial: f.serial, name: form.name || f.name })}>
                    {f.name || f.serial} ({f.ip})
                  </button>
                ))}
              </div>
            )}
            <div className="grid-2">
              <Field label="Endereço IP">
                <input value={form.ip} onChange={set("ip")} placeholder="192.168.0.20" inputMode="decimal" autoComplete="off" />
              </Field>
              <Field label="Número de série">
                <input value={form.serial} onChange={set("serial")} autoComplete="off" />
              </Field>
              <Field label="Código de acesso" hint="Na tela da impressora: Configurações → Rede (WLAN). Fica só neste computador.">
                <input value={form.code} onChange={set("code")} type="password" autoComplete="off" />
              </Field>
              <Field label="Nome (opcional)">
                <input value={form.name} onChange={set("name")} maxLength={80} placeholder="A1 da sala" />
              </Field>
            </div>
            {error && <Alert kind="error">{error}</Alert>}
          </div>
        </Sheet>
      )}
    </Card>
  );
}
