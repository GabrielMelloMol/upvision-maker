import { useState } from "react";
import { fetchScannable, ScannableError } from "../../domain/spotifyCode";
import { getManifold } from "../../geometry/manifold";
import { codeWidthMm } from "../../geometry/models/musicCard";
import { SHORT_LINK_HELP, spotifyUri, type CodeKind } from "../../geometry/models/musicCode";
import { testQrReading } from "../../geometry/models/musicCodeTest";
import Alert from "../../ui/Alert";
import Field from "../../ui/Field";
import Segmented from "../../ui/Segmented";
import Toggle from "../../ui/Toggle";
import type { Params } from "./fields";

const KINDS = [
  ["spotify", "Spotify"],
  ["qr", "QR Code"],
  ["none", "Nenhum"],
] as const;

type Props = { label: string; params: Params; patch: (next: Params) => void };

/** Largura que cada código pede (mm): o QR lê bem com 44 e as barras do Spotify só ficam grossas com 64 ou mais. */
const QR_WIDTH = 44;
const SPOTIFY_WIDTH = 70;

/**
 * Código para chegar à música (Cartão de música), três opções lado a lado: o código do Spotify (buscado uma vez e
 * guardado no projeto), o QR code com o link de qualquer serviço (com teste de leitura da vista de cima) ou nenhum.
 * Colar um link do Spotify já seleciona o Spotify; o QR é o jeito para links de outros serviços. Se a busca falhar,
 * volta ao QR com o link.
 */
export default function MusicCodeField({ label, params, patch }: Props) {
  const code = String(params.code ?? "qr") as CodeKind;
  const link = String(params.codeLink ?? "");
  const uri = spotifyUri(link);
  const saved = !!params.spotifySvg && !!uri && params.spotifyUri === uri;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scan, setScan] = useState<{ link: string; ok: boolean } | null>(null);
  const result = scan && scan.link === link ? scan : null; // a conferência é do link de agora

  /** Trocar de código leva junto a largura padrão dele (a que a pessoa já mexeu fica como está). */
  const pick = (kind: CodeKind): Params => {
    const size = Number(params.codeSize);
    if (kind === "spotify" && size === QR_WIDTH) return { code: kind, codeSize: SPOTIFY_WIDTH };
    if (kind === "qr" && size === SPOTIFY_WIDTH) return { code: kind, codeSize: QR_WIDTH };
    return { code: kind };
  };

  /** O link mudou: virar um link do Spotify seleciona o Spotify; sair dele (estando no Spotify) volta ao QR. "Nenhum" é respeitado. */
  function changeLink(next: string) {
    const wasSpotify = !!spotifyUri(link);
    const isSpotify = !!spotifyUri(next);
    const mode: Params = code === "none" ? {} : isSpotify && !wasSpotify ? pick("spotify") : !isSpotify && wasSpotify && code === "spotify" ? pick("qr") : {};
    patch({ codeLink: next, ...mode });
    setError("");
  }

  async function findSpotify() {
    setError("");
    if (!uri) return setError(/spotify\.link/i.test(link) ? SHORT_LINK_HELP : "Cole o link da música do Spotify (open.spotify.com/track/…) ou o código spotify:track:…");
    setBusy(true);
    try {
      patch({ spotifySvg: await fetchScannable(uri), spotifyUri: uri });
    } catch (e) {
      const why = e instanceof ScannableError ? e.message : "Não consegui buscar o código do Spotify.";
      setError(`${why} Voltei para o QR code com o link: ele leva à mesma música. Tente o Spotify de novo quando puder.`);
      patch(pick("qr"));
    } finally {
      setBusy(false);
    }
  }

  async function testReading() {
    const M = await getManifold();
    try {
      setScan({ link, ok: testQrReading(M, link, codeWidthMm(params as never)).ok });
    } catch {
      setScan({ link, ok: false });
    }
  }

  return (
    <div className="span-2 stack">
      <span className="field-label">{label}</span>
      <Segmented label={label} value={code} options={KINDS} onChange={(v) => patch(pick(v))} full />
      {code !== "none" && (
        <Field label="Link da música" hint="Do Spotify, YouTube, Deezer… qualquer serviço.">
          <input type="url" inputMode="url" autoComplete="off" value={link} placeholder="https://" onChange={(e) => changeLink(e.target.value)} />
        </Field>
      )}
      {code === "qr" && (
        <>
          <button type="button" disabled={!link.trim()} onClick={() => void testReading()}>
            Testar a leitura da vista de cima
          </button>
          {result && <Alert kind={result.ok ? "info" : "warn"}>{result.ok ? "Leitura ok: a vista de cima do código lê o mesmo link. Teste também com o celular." : "A vista de cima não leu o código: aumente a largura do código ou use um link mais curto."}</Alert>}
        </>
      )}
      {code === "spotify" && (
        <>
          <Toggle label="Incluir o logo do Spotify" checked={params.spotifyLogo !== false} onChange={(v) => patch({ spotifyLogo: v })} />
          <button type="button" disabled={busy || !link.trim()} onClick={() => void findSpotify()}>
            {busy ? "Buscando…" : saved ? "Buscar de novo" : "Buscar o código"}
          </button>
          {saved && !error && <p className="hint">Código guardado neste projeto: não precisa mais de internet.</p>}
          {!saved && !error && <p className="hint">Falta buscar o código (precisa de internet só desta vez). Enquanto isso o cartão leva o QR code do link.</p>}
          <p className="hint">O código traz o logo do Spotify: vender peças com marca de terceiros pode violar direitos de marca.</p>
        </>
      )}
      {error && <Alert kind="warn">{error}</Alert>}
    </div>
  );
}
