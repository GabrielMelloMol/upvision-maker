import { Camera, ClipboardList, PackageMinus, Warehouse } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { codeFromHash, consumeFilament, filamentFromPhoto, finishOrder, loadSummary, NotPaired, pair } from "./client";
import type { PhoneSummary } from "./types";

type Tab = "pedidos" | "estoque" | "baixa";
const TABS: [Tab, string, typeof ClipboardList][] = [
  ["pedidos", "Pedidos", ClipboardList],
  ["estoque", "Estoque", Warehouse],
  ["baixa", "Baixa", PackageMinus],
];
const grams = (g: number) => `${Math.round(g).toLocaleString("pt-BR")} g`;
const dateBr = (iso: string | null) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "sem prazo");
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Página do celular na rede de casa (#16): pedidos e prazos, estoque e baixa de filamento. */
export default function PhoneApp() {
  const [data, setData] = useState<PhoneSummary | null>(null);
  const [paired, setPaired] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("pedidos");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await loadSummary());
      setPaired(true);
      setError(null);
    } catch (e) {
      if (e instanceof NotPaired) setPaired(false);
      else setError(message(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      const code = codeFromHash(); // leu o QR da tela do computador: conecta sem digitar
      if (code) await pair(code).catch(() => {}); // código vencido cai na tela de código, com o erro do servidor
      await refresh();
    })();
    const onShow = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [refresh]);

  async function act(run: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await run();
      setNote(done);
      await refresh();
    } catch (e) {
      if (e instanceof NotPaired) setPaired(false);
      setError(message(e));
    }
  }

  if (paired === false) return <PairScreen error={error} onPaired={() => (setError(null), refresh())} />;
  return (
    <div className="ph-app">
      <header className="ph-head">
        <h1>{TABS.find((t) => t[0] === tab)![1]}</h1>
        <button className="ph-ghost" onClick={() => void refresh()}>
          Atualizar
        </button>
      </header>
      <main className="ph-main">
        {error && (
          <p className="ph-msg ph-error" role="alert">
            {error}
          </p>
        )}
        {note && (
          <p className="ph-msg ph-ok" role="status">
            {note}
          </p>
        )}
        {!data ? <p className="ph-muted">Carregando…</p> : tab === "pedidos" ? <Orders data={data} onFinish={(id) => act(() => finishOrder(id), `Pedido #${id} marcado como pronto.`)} /> : tab === "estoque" ? <Stock data={data} /> : <Consume data={data} onConsume={(id, g, name) => act(() => consumeFilament(id, g), `Baixa de ${grams(g)} em ${name}.`)} onError={setError} />}
      </main>
      <nav className="ph-tabs" aria-label="Seções">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => (setTab(id), setNote(null))}>
            <Icon aria-hidden /> {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function PairScreen({ error, onPaired }: { error: string | null; onPaired: () => void }) {
  const [code, setCode] = useState("");
  const [fail, setFail] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await pair(code);
      onPaired();
    } catch (err) {
      setFail(message(err));
    }
  }
  return (
    <form className="ph-app ph-pair" onSubmit={submit}>
      <h1>Conectar ao computador</h1>
      <p className="ph-muted">No computador, em Preferências → Celular na rede de casa, aparece um código de 6 dígitos.</p>
      <label>
        Código
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123 456" autoFocus />
      </label>
      {(fail ?? error) && (
        <p className="ph-msg ph-error" role="alert">
          {fail ?? error}
        </p>
      )}
      <button className="ph-primary" disabled={code.replace(/\D/g, "").length !== 6}>
        Conectar
      </button>
    </form>
  );
}

function Orders({ data, onFinish }: { data: PhoneSummary; onFinish: (id: number) => void }) {
  if (!data.orders.length) return <p className="ph-muted">Nenhum pedido em aberto.</p>;
  return (
    <ul className="ph-list">
      {data.orders.map((o) => (
        <li key={o.id} className="ph-card">
          <div className="ph-row">
            <strong>
              #{o.id} {o.customer}
            </strong>
            <span className={o.late ? "ph-badge ph-late" : "ph-badge"}>{o.late ? `atrasado · ${dateBr(o.dueDate)}` : dateBr(o.dueDate)}</span>
          </div>
          <span className="ph-muted">{o.items || "sem itens"}</span>
          <div className="ph-row">
            <span>{o.status}</span>
            {o.canFinish && (
              <button className="ph-primary" onClick={() => onFinish(o.id)}>
                Marcar pronto
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stock({ data }: { data: PhoneSummary }) {
  if (!data.filaments.length) return <p className="ph-muted">Nenhum filamento cadastrado.</p>;
  return (
    <ul className="ph-list">
      {data.filaments.map((f) => (
        <li key={f.id} className="ph-card ph-row">
          <span>{f.name}</span>
          <strong className={f.low ? "ph-late" : undefined}>
            {grams(f.stockG)}
            {f.low && " · acabando"}
          </strong>
        </li>
      ))}
    </ul>
  );
}

function Consume({ data, onConsume, onError }: { data: PhoneSummary; onConsume: (id: number, g: number, name: string) => void; onError: (m: string) => void }) {
  const [id, setId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const chosen = data.filaments.find((f) => f.id === id);
  const g = Number(amount.replace(",", "."));

  async function photo(file: File | undefined) {
    if (!file) return;
    try {
      const found = await filamentFromPhoto(file);
      if (!data.filaments.some((f) => f.id === found)) throw new Error("Esse rolo não está cadastrado neste computador.");
      setId(found);
    } catch (e) {
      onError(message(e));
    }
  }

  return (
    <form
      className="ph-stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (chosen && g > 0) onConsume(chosen.id, g, chosen.name);
        setAmount("");
      }}
    >
      <label className="ph-primary ph-file">
        <Camera aria-hidden /> Ler etiqueta do rolo
        <input type="file" accept="image/*" capture="environment" onChange={(e) => void photo(e.target.files?.[0])} />
      </label>
      <label>
        Filamento
        <select value={id} onChange={(e) => setId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Escolha…</option>
          {data.filaments.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({grams(f.stockG)})
            </option>
          ))}
        </select>
      </label>
      <label>
        Quanto usou (g)
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Ex.: 35" />
      </label>
      <button className="ph-primary" disabled={!chosen || !(g > 0)}>
        Dar baixa
      </button>
    </form>
  );
}
