export type Address = { street: string; district: string; city: string; uf: string };

const TIMEOUT_MS = 6000;

/** Endereço pelo CEP (ViaCEP, gratuito). Sem internet, a pessoa digita à mão. */
export async function lookupCep(cep: string, fetchFn: typeof fetch = fetch): Promise<Address> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) throw new Error("O CEP tem 8 números.");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetchFn(`https://viacep.com.br/ws/${digits}/json/`, { signal: ctrl.signal });
    if (!r.ok) throw new Error("Não consegui consultar o CEP agora.");
    const j = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (j.erro || !j.localidade) throw new Error("CEP não encontrado.");
    return { street: j.logradouro ?? "", district: j.bairro ?? "", city: j.localidade, uf: j.uf ?? "" };
  } catch (e) {
    if (e instanceof Error && /CEP/.test(e.message)) throw e;
    throw new Error("Sem conexão para buscar o CEP. Preencha o endereço à mão.");
  } finally {
    clearTimeout(t);
  }
}
