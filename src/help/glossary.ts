/**
 * Termos técnicos com explicação curta (#84): viram o "ⓘ" ao lado do rótulo dos campos e entram na busca (⌘K).
 * `match`: o rótulo do campo começa com uma destas palavras (sem acento/maiúsculas).
 */
export type Term = { id: string; term: string; match: string[]; text: string };

export const GLOSSARY: Term[] = [
  { id: "folga", term: "Folga", match: ["folga"], text: "Espaço entre peças que se encaixam. Justo demais não entra; solto demais balança. 0,2–0,3 mm costuma servir; ajuste pela sua impressora." },
  { id: "relevo", term: "Relevo", match: ["relevo", "altura do relevo"], text: "Quanto o texto ou desenho sobressai da base. 0,6–1 mm dá boa leitura e troca de cor limpa." },
  { id: "densidade", term: "Densidade", match: ["densidade"], text: "Quanto pesa 1 cm³ do filamento (PLA ≈ 1,24 g/cm³). Converte metros de filamento em gramas." },
  { id: "roas", term: "ROAS", match: ["roas"], text: "Retorno do anúncio: vendas ÷ gasto com anúncio. ROAS 5 = R$ 5 vendidos para cada R$ 1 investido." },
  { id: "markup", term: "Multiplicador (markup)", match: ["multiplicador", "markup"], text: "Preço = custo × multiplicador. ×5 é markup de 400 % e margem de 80 % antes das taxas." },
  { id: "margem", term: "Margem", match: ["margem minima", "margem padrao"], text: "Quanto do preço sobra de lucro. Margem de 30 % = R$ 30 de lucro a cada R$ 100 vendidos." },
  { id: "falha", term: "Taxa de falha", match: ["taxa de falha", "falhas"], text: "Parte das impressões que dá errado. O que se perde nelas entra no preço das que dão certo." },
  { id: "potencia", term: "Potência média", match: ["potencia", "potência"], text: "Consumo médio imprimindo, não a potência da fonte (a A1 diz 350 W na etiqueta e gasta ~95 W)." },
  { id: "limiar", term: "Limiar", match: ["limiar"], text: "Até que tom de cinza vira desenho. Mais alto pega mais áreas claras." },
  { id: "espessura", term: "Espessura mínima (litofania)", match: ["espessura mínima", "espessura minima"], text: "A parte mais fina, onde passa mais luz. Menos de 0,6 mm pode furar." },
  { id: "camada", term: "Altura de camada", match: ["altura de camada"], text: "Espessura de cada camada que a impressora deposita. 0,2 mm é o padrão; menor fica mais liso e demora mais." },
  { id: "purga", term: "Purga por troca", match: ["purga por troca"], text: "Filamento descartado a cada troca de cor no AMS. Entra no custo das peças multicor." },
  { id: "acos", term: "ACOS", match: ["acos"], text: "Gasto com anúncio ÷ vendas, em %: o contrário do ROAS. ACOS 20 % = ROAS 5." },
  { id: "kwh", term: "kWh", match: ["preço do kwh", "preco do kwh"], text: "Custo de 1 kWh de energia: total da conta ÷ kWh consumidos no mês." },
];

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** Termo do glossário para um rótulo de campo ("Relevo do texto (mm)" → Relevo); null se não houver. */
export function termFor(label: string): Term | null {
  const l = norm(label);
  return GLOSSARY.find((t) => t.match.some((m) => l.startsWith(norm(m)))) ?? null;
}
