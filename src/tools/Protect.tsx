import { Copy, FileDown, FileJson, ShieldCheck, Sticker } from "lucide-react";
import { useEffect, useState } from "react";
import { getDb } from "../db";
import { loadCompany } from "../db/customersRepo";
import type { Company } from "../domain/customers";
import { bytesLabel, certificateJson, groupedHash, localStamp, normalizeHash, parseCertificateJson, parsePayload, proofCode, sha256Hex, verify, type Certificate } from "../domain/fileProof";
import { fileCertificatePdf } from "../pdf/fileCertificate";
import { loadPdfFonts } from "../pdf/fonts";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Dropzone from "../ui/Dropzone";
import Field from "../ui/Field";
import { requestNavigate } from "../ui/navigate";
import { saveFile, slug } from "../ui/saveFile";
import { errorText, useToast } from "../ui/Toast";
import QrScanner from "./QrScanner";

type Hashed = { name: string; size: number; sha256: string };
type Expected = { source: string; sha256: string; cert?: Certificate };

/** Lê o arquivo inteiro e calcula o SHA-256 (nada sai do computador). */
async function hashFile(file: File): Promise<Hashed> {
  return { name: file.name, size: file.size, sha256: await sha256Hex(await file.arrayBuffer()) };
}

/** Proteger arquivo (#228): hash SHA-256, certificado em PDF com data e QR, e conferência offline de um arquivo contra o certificado. */
export default function Protect() {
  const toast = useToast();
  const [file, setFile] = useState<Hashed | null>(null);
  const [hashing, setHashing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [author, setAuthor] = useState("");
  const [title, setTitle] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);

  // o nome da loja já vem dos Dados da empresa, se houver
  useEffect(() => {
    let alive = true;
    getDb()
      .then(loadCompany)
      .then((c) => {
        if (!alive) return;
        // autor e contato vêm dos Dados da empresa, e o PDF leva o logo e o nome como o orçamento
        setCompany(c);
        setAuthor((cur) => cur || c.tradeName || c.name || "");
        setContact((cur) => cur || [c.phone, c.email, c.instagram && `@${c.instagram.replace(/^@/, "")}`, c.website].filter(Boolean).join(" · "));
      })
      .catch((e) => console.warn("Sem dados da empresa para o certificado:", e));
    return () => {
      alive = false;
    };
  }, []);

  async function pick(f: File) {
    setError(null);
    setHashing(true);
    try {
      setFile(await hashFile(f));
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setFile(null);
      setError(`Não consegui ler o arquivo: ${errorText(e)}`);
    } finally {
      setHashing(false);
    }
  }

  const certificate = (): Certificate => ({ version: 1, sha256: file!.sha256, name: file!.name, size: file!.size, at: new Date().toISOString(), author: author.trim(), title: title.trim(), contact: contact.trim(), note: note.trim() });

  async function savePdf() {
    if (!file) return;
    setSaving(true);
    try {
      const c = certificate();
      const { bytes } = await fileCertificatePdf(await loadPdfFonts(), c, company ?? undefined);
      const p = await saveFile(`certificado-${slug(file.name)}.pdf`, bytes, "pdf", "PDF");
      if (p) toast(`Certificado salvo em ${p}`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveJson() {
    if (!file) return;
    try {
      const p = await saveFile(`certificado-${slug(file.name)}.json`, certificateJson(certificate()), "json", "Certificado (.json)");
      if (p) toast(`Dados do certificado salvos em ${p}`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Hash copiado.");
    } catch {
      toast("Não consegui copiar: selecione o hash e copie à mão.", "error");
    }
  }

  return (
    <div className="page">
      <h1>Proteger arquivo</h1>
      <p className="lead">Hash SHA-256 e certificado em PDF do seu arquivo.</p>
      <div className="controls stack">
        <div className="card stack">
          <h3>1. Escolha o arquivo</h3>
          <p className="hint">Qualquer pessoa pode conferir depois, sem internet, se o arquivo é o mesmo.</p>
          <Dropzone accept="*/*" label={file ? file.name : "Arraste o arquivo ou clique para escolher"} hint="STL, 3MF, OBJ ou qualquer arquivo. Ele não sai do seu computador." onFile={(f) => void pick(f)} />
          {hashing && (
            <span className="hint" role="status">
              Calculando o hash…
            </span>
          )}
          {error && <Alert kind="error">{error}</Alert>}
          {file && (
            <div className="stack" aria-label="Arquivo escolhido">
              <p>
                <strong>{file.name}</strong> · {bytesLabel(file.size)}
              </p>
              <div className="hash-box">
                <span className="field-label">SHA-256</span>
                <code aria-label="Hash SHA-256 do arquivo">{groupedHash(file.sha256, 2).map((l) => <span key={l} className="hash-line">{l}</span>)}</code>
                <Button variant="secondary" size="sm" icon={Copy} onClick={() => void copy(file.sha256)}>
                  Copiar hash
                </Button>
              </div>
              <span className="hint">Código do certificado: {proofCode(file.sha256)}. Mudou um byte do arquivo, muda o hash.</span>
            </div>
          )}
        </div>

        <div className="card stack">
          <h3>2. Dados do certificado</h3>
          <div className="grid two">
            <Field label="Obra ou peça">
              <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Autor ou loja">
              <input value={author} maxLength={80} onChange={(e) => setAuthor(e.target.value)} />
            </Field>
            <Field label="Contato (e-mail, site ou @)">
              <input value={contact} maxLength={80} onChange={(e) => setContact(e.target.value)} />
            </Field>
            <Field label="Observação (opcional)" wide>
              <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <div className="row">
            <Button variant="action" icon={FileDown} disabled={!file || saving} onClick={() => void savePdf()}>
              Salvar certificado (PDF)
            </Button>
            <Button icon={FileJson} disabled={!file} onClick={() => void saveJson()}>
              Salvar dados para conferir depois (.json)
            </Button>
          </div>
          <span className="hint">O certificado mostra que o arquivo é exatamente este na data de hoje, pelo relógio deste computador. Não é um carimbo de tempo independente: guarde o PDF e o arquivo juntos.</span>
          <div className="row">
            <Button variant="link" icon={Sticker} onClick={() => requestNavigate("owndecal")}>
              Gravar seu nome ou logo na própria peça
            </Button>
          </div>
        </div>

        <Verify />
      </div>
    </div>
  );
}

/** Conferir um arquivo contra um certificado (hash digitado, QR lido ou arquivo .json salvo). */
function Verify() {
  const [file, setFile] = useState<Hashed | null>(null);
  const [expected, setExpected] = useState<Expected | null>(null);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<string | null>(null);

  async function pickFile(f: File) {
    try {
      setFile(await hashFile(f));
      setNote(null);
    } catch (e) {
      setFile(null);
      setNote(`Não consegui ler o arquivo: ${errorText(e)}`);
    }
  }

  async function pickCert(f: File) {
    const cert = parseCertificateJson(await f.text());
    if (!cert) {
      setExpected(null);
      setNote("Esse arquivo não é um certificado do UpVision Maker (.json salvo na emissão).");
      return;
    }
    setNote(null);
    setExpected({ source: `certificado ${f.name}`, sha256: cert.sha256, cert });
  }

  function typedHash(v: string) {
    setTyped(v);
    const h = normalizeHash(v);
    setExpected(h ? { source: "hash digitado", sha256: h } : null);
    setNote(v.trim() && !h ? "O hash precisa ter 64 letras e números (0 a 9 e a a f)." : null);
  }

  function onCode(text: string) {
    const p = parsePayload(text);
    if (!p) {
      setNote("Esse QR não é de um certificado do UpVision Maker.");
      return;
    }
    setNote(null);
    setExpected({ source: "QR do certificado", sha256: p.sha256 });
  }

  const verdict = file && expected ? verify(file.sha256, expected.sha256) : null;

  return (
    <div className="card stack">
      <h3>Conferir um arquivo</h3>
      <p className="hint">Já tem um certificado? Escolha o arquivo e diga o hash dele: digitando, lendo o QR ou abrindo o .json salvo na emissão.</p>
      <Dropzone accept="*/*" label={file ? file.name : "Arquivo a conferir"} hint="O mesmo arquivo que recebeu o certificado." onFile={(f) => void pickFile(f)} compact={!!file} />
      <Field label="Hash do certificado" hint="Pode colar com espaços e maiúsculas.">
        <input value={typed} onChange={(e) => typedHash(e.target.value)} spellCheck={false} />
      </Field>
      <Dropzone accept=".json,application/json" label={expected?.cert ? `Certificado: ${expected.cert.title || expected.cert.name}` : "Ou abra o certificado (.json)"} onFile={(f) => void pickCert(f)} compact />
      <details>
        <summary>Ler o QR do certificado</summary>
        <QrScanner onCode={onCode} />
      </details>
      {note && <Alert kind="warn">{note}</Alert>}
      {verdict?.ok && (
        <Alert kind="ok">
          <strong>Confere.</strong> O arquivo é exatamente o do certificado ({expected!.source}).
          {expected?.cert && ` Emitido em ${localStamp(expected.cert.at)} por ${expected.cert.author || "autor não informado"}.`}
        </Alert>
      )}
      {verdict && !verdict.ok && (
        <Alert kind="error">
          <strong>Não confere.</strong> {verdict.reason}
        </Alert>
      )}
      {!verdict && file && !expected && <span className="hint"><ShieldCheck aria-hidden size={14} /> Falta o hash do certificado para comparar.</span>}
    </div>
  );
}
