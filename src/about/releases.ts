import { compareVersions } from "../whatsnew/changelog";

/** Releases públicas do app (sem token: 60 req/h por IP; checamos a cada 6 h). */
export const RELEASES_API = "https://api.github.com/repos/GabrielMelloMol/upvision-maker/releases?per_page=50";
export const RELEASES_PAGE = "https://github.com/GabrielMelloMol/upvision-maker/releases";
const TIMEOUT_MS = 10_000;
const MAX_HIGHLIGHTS = 4;

export type Release = { version: string; name: string; body: string; url: string; publishedAt: string };

const SEMVER = /^v?(\d+\.\d+\.\d+)$/;

/** Só releases publicadas e estáveis (sem rascunho, pré-lançamento ou tag fora de vX.Y.Z), da mais nova para a mais antiga. */
export function parseReleases(json: unknown): Release[] {
  if (!Array.isArray(json)) return [];
  return json
    .flatMap((r) => {
      const m = SEMVER.exec(String(r?.tag_name ?? ""));
      if (!m || r.draft || r.prerelease) return [];
      return [{ version: m[1], name: String(r.name || r.tag_name), body: String(r.body ?? ""), url: String(r.html_url ?? RELEASES_PAGE), publishedAt: String(r.published_at ?? "") }];
    })
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** Quantas versões publicadas depois da instalada, qual a última e quais são (mais nova primeiro). */
export function versionsBehind(current: string, releases: Release[]): { count: number; latest: string | null; missing: Release[] } {
  const missing = releases.filter((r) => compareVersions(r.version, current) > 0);
  return { count: missing.length, latest: releases[0]?.version ?? null, missing };
}

/** Primeiros itens de lista do corpo da release, sem markdown (para "o que você está perdendo"). */
export function releaseHighlights(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((l) => /^\s*[-*]\s+(.+)$/.exec(l)?.[1])
    .filter((l): l is string => !!l)
    .map((l) =>
      l
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[*_`]/g, "")
        .trim(),
    )
    .slice(0, MAX_HIGHLIGHTS);
}

/** Busca as releases; erros viram mensagens para a usuária (quem chama cai no latest.json do updater). */
export async function fetchReleases(f: typeof fetch = fetch): Promise<Release[]> {
  let res: Response;
  try {
    res = await f(RELEASES_API, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error("Sem internet para consultar as versões.");
  }
  if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? "O GitHub limitou as consultas por agora; tente mais tarde." : `O GitHub respondeu ${res.status}.`);
  return parseReleases(await res.json());
}
