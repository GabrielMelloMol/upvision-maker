/**
 * Buscador de modelos 3D (#77): só monta a URL de busca de cada site e abre no navegador. Nada de scraping.
 * URLs conferidas em set/2026. `free`: o site tem filtro de "só grátis" na própria URL.
 */
export type Site = { id: string; name: string; blurb: string; host: string; free: boolean; search: (q: string, onlyFree: boolean) => string };

const enc = encodeURIComponent;

export const SITES: Site[] = [
  { id: "printables", name: "Printables", blurb: "Da Prusa. Tudo grátis; a licença varia por modelo.", host: "printables.com", free: false, search: (q) => `https://www.printables.com/search/models?q=${enc(q)}` },
  { id: "makerworld", name: "MakerWorld", blurb: "Da Bambu Lab. Muitos já vêm com o projeto pronto para o Bambu Studio.", host: "makerworld.com", free: false, search: (q) => `https://makerworld.com/en/search/models?keyword=${enc(q)}` },
  { id: "thingiverse", name: "Thingiverse", blurb: "O acervo mais antigo. Grátis; muitos são não comerciais (NC).", host: "thingiverse.com", free: false, search: (q) => `https://www.thingiverse.com/search?q=${enc(q)}&type=things&sort=relevant` },
  { id: "cults3d", name: "Cults3D", blurb: "Grátis e pagos; os pagos costumam permitir venda da peça.", host: "cults3d.com", free: true, search: (q, onlyFree) => `https://cults3d.com/pt/busca?q=${enc(q)}${onlyFree ? "&only_free=true" : ""}` },
  { id: "thangs", name: "Thangs", blurb: "Busca em vários acervos ao mesmo tempo. Grátis e pagos.", host: "thangs.com", free: false, search: (q) => `https://thangs.com/search/${enc(q)}?scope=all` },
];

/** Site de um link colado (null se não for de nenhum dos cinco). */
export function siteOfUrl(url: string): Site | null {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./, "");
    return SITES.find((s) => host === s.host || host.endsWith(`.${s.host}`)) ?? null;
  } catch {
    return null;
  }
}

/** Link colado seguro para abrir: só http(s) de um dos sites conhecidos. */
export function safeModelUrl(url: string): string | null {
  const site = siteOfUrl(url);
  if (!site) return null;
  const u = new URL(url.trim());
  return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
}

export type LicenseVerdict = { sell: "yes" | "no" | "check"; text: string };

/** O que cada licença comum deixa fazer com a peça impressa. Não é consultoria jurídica: confira sempre na página do modelo. */
export const LICENSES: { id: string; label: string; verdict: LicenseVerdict }[] = [
  { id: "cc0", label: "CC0 / domínio público", verdict: { sell: "yes", text: "Pode vender a peça, sem precisar dar crédito." } },
  { id: "by", label: "CC BY", verdict: { sell: "yes", text: "Pode vender a peça dando crédito ao autor (nome e link na descrição do produto)." } },
  { id: "by-sa", label: "CC BY-SA", verdict: { sell: "yes", text: "Pode vender dando crédito; se modificar e divulgar o arquivo, ele vai com a mesma licença." } },
  { id: "by-nd", label: "CC BY-ND", verdict: { sell: "yes", text: "Pode vender dando crédito, mas sem modificar o modelo." } },
  { id: "nc", label: "CC BY-NC (e NC-SA, NC-ND)", verdict: { sell: "no", text: "NC = não comercial: não pode vender a peça impressa. Peça autorização ao autor (muitos vendem uma licença comercial)." } },
  { id: "standard", label: "Licença padrão do site / uso pessoal", verdict: { sell: "no", text: "Em geral é só para uso pessoal. Veja se o autor oferece licença comercial." } },
  { id: "commercial", label: "Licença comercial / modelo pago", verdict: { sell: "check", text: "Costuma permitir vender a peça, às vezes com limite de quantidade. Leia os termos na página." } },
];

export const RECENT_MAX = 8;

/** Guarda a busca no topo, sem repetir (ignora maiúsculas) e sem passar do limite. */
export function pushRecent(list: string[], q: string): string[] {
  const t = q.trim();
  if (!t) return list;
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
}
