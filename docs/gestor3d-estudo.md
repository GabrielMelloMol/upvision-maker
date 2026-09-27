# Estudo: Gestor 3D (gestor3d.pro)

> Estudo de referência para a UpVision construir uma ferramenta gratuita equivalente.
> Data da coleta: 2026-09-26. Fontes: as 48 URLs do `sitemap.xml`, `robots.txt`, `llms.txt`, cabeçalhos HTTP e os bundles JS públicos (`/assets/*.js`).
> **Nenhuma conta foi criada e nenhum dado de pagamento foi informado.** As telas internas não foram vistas. Tudo o que vem só de nomes de rota, endpoints ou strings do bundle JS está marcado como **(inferido)**.

---

## 0. Resumo executivo

- **O que é:** SaaS brasileiro (pt-BR) para quem vende impressão 3D. Diz ter mais de 13.000 makers. Começou como uma calculadora de custo e virou um "mini-ERP" com precificação, produtos, pedidos, estoque, financeiro, orçamentos e contratos. Também oferece ferramentas de arquivo que rodam no navegador (3MF, SVG, QR, modelos paramétricos).
- **Modelo de negócio:** plano grátis permanente com limites mensais e três planos pagos (R$ 15, 30 e 60 por mês). A calculadora é ilimitada em todos os planos e funciona como porta de entrada.
- **O que realmente importa para a namorada do Gabriel:** calculadora de custo, cadastro de filamentos/impressoras, produtos, pedidos com baixa de estoque, orçamento em PDF e um financeiro simples. As ferramentas de arquivo (separador 3MF, modelos paramétricos) dão muito trabalho e têm pouco retorno para uso pessoal.

---

## 1. Inventário de funcionalidades

### 1.1 Calculadora de custo e preço (núcleo). Grátis e ilimitada

**Campos vistos** (páginas públicas + strings do bundle `Calculator-*.js`):

| Campo | Onde apareceu |
|---|---|
| Filamento(s): preço por kg + gramas usados (vários filamentos por peça) | metodologia, FAQ |
| Impressora usada (potência em W) | bundle (`Impressora usada`), metodologia |
| Tempo de impressão | bundle, metodologia |
| Preço do kWh | metodologia ("preço do quilowatt-hora informado"). Fica nas preferências **(inferido)** |
| Tempo de mão de obra + custo de mão de obra | bundle (`Tempo de mão de obra`, `Custo de mão de obra`) |
| Materiais extras (embalagem, tinta, parafusos, ímãs, tags NFC…) | calculadora, estoque |
| Taxa de manutenção (%) | metodologia; exemplo da home usa 5% |
| Quantidade de objetos na mesa (1 a 100.000) | bundle (`Quantidade na mesa`) |
| Valor do frete (opcional) | bundle (`Valor do frete (opcional)`), guia de frete |
| Margem de lucro em marketplace (%) | bundle |
| Botão "Salvar produto" (a calculadora vira cadastro de produto) | bundle |

**Fórmulas publicadas** (página `/metodologia` e guias):

```
filamento_i   = (preco_kg_i / 1000) × gramas_i          # por filamento, somados
energia       = (potencia_W / 1000) × horas × preco_kWh
subtotal      = Σ filamento + extras + energia + mao_de_obra
manutencao    = subtotal × taxa_manutencao%              # "calculada sobre filamento, extras, energia e mão de obra"
custo_total   = subtotal + manutencao
preco_revenda    = custo_total × mult_revenda   (+ frete absorvido + taxas fixas de marketplace)
preco_consumidor = custo_total × mult_consumidor (+ frete absorvido)
margem_%      = (preco_venda − custos_totais_da_venda) / preco_venda × 100
fat_por_hora  = faturamento_pedidos_entregues / horas_impressao_desses_produtos   # receita, não lucro
```

- O frete e as taxas **fixas** de marketplace **não são multiplicados**. Eles são somados depois do multiplicador (guia de frete, `/informacoes-para-ia`).
- Arredondamento só no final, para o centavo. Valores negativos são tratados com segurança. A lógica fica no backend e tem testes (metodologia).
- Os multiplicadores são configuráveis. **Valores padrão (inferido pelo exemplo da home): revenda ×3, consumidor ×5.**

**Exemplo da home, conferido na mão:** luminária PLA, 120 g, R$ 85/kg, manutenção 5%.
Filamento = 0,085 × 120 = R$ 10,20. Embalagem implícita = R$ 5,00. (10,20 + 5,00) × 1,05 = **R$ 15,96**. Revenda ×3 = R$ 47,88. Consumidor ×5 = R$ 79,80. Lucro = R$ 63,84. Os números batem com o que a página mostra (a embalagem de R$ 5 foi deduzida).

### 1.2 Preferências / Configurações (`/settings`)
Strings do bundle: multiplicador de revenda (> 0), multiplicador ao consumidor (> 0), margem para manutenção (≥ 0), **taxas por canal**: Shopee (percentual + "taxas fixas da Shopee" por faixa de preço), Mercado Livre clássico, TikTok Shop (percentuais de 0 a 100%). Também "base de cálculo configurada nas preferências" e logo para orçamentos (`/api/settings/quote-logo`). Há ainda uma troca de moeda (`CurrencySwitch`) **(inferido)**.

### 1.3 Cadastros
| Cadastro | Campos vistos no bundle / páginas |
|---|---|
| **Filamentos** (`/filaments`) | Material (PLA, PETG…, Nylon, Resina, Outro), Cor, Marca, Preço por kg, Peso do rolo (g), Quantidade de rolos, Quantidade usada (g), Estoque, limite mínimo. Ações: **reposição** (`/restock`, recalcula o **custo médio ponderado**) e **ajuste** (`/adjust`) |
| **Materiais extras** (`/materials`) | Nome, preço, unidade, quantidade. Reposição e ajuste iguais aos do filamento |
| **Impressoras** (`/printers`) | Marca → Modelo, vindos de um **catálogo de impressoras mantido pelo admin** (`/api/printer-catalog`), potência (para energia), custos de manutenção, **parcelas / quitada** (financiamento da máquina), resumo financeiro e "lucro por impressora" |
| **Custos operacionais** (`/operational-costs`) | Descrição, Categoria, Valor, Frequência (Único, Semanal, Mensal, Anual), Impressora vinculada (opcional), Observações. Ex.: salários, impostos, aluguel |
| **Clientes** (`/customers`) | Tipo (Pessoa física / Empresa), Nome, contato preferido (e-mail/telefone), Localidade (CEP via ViaCEP/BrasilAPI, **inferido pelo CSP**), Desconto padrão (0 a 100%), Situação (Ativo/Inativo) |
| **Dados da empresa** (`/dados-da-empresa`) | Usados no cabeçalho de orçamentos e contratos **(inferido)** |

### 1.4 Produtos (`/products`)
- Composição: N filamentos com gramas, materiais extras com quantidade, tempo de impressão, tempo e custo de mão de obra, impressora usada, frete opcional.
- Preços por canal: "Consumidor final (Presencial)", revenda, Shopee, Mercado Livre, TikTok. Há "Preço de venda escolhido" ou "Preço manual" e "Margem de lucro em marketplace (%)".
- **Kits**: produto composto por outros produtos, com custo calculado.
- Até 8 fotos + capa. **Catálogo de produtos em PDF** (só assinantes).
- **Exportação em massa** com campos fiscais e de marketplace: NCM/EX TIPI, FCI, Origem, Unidade tributável, % tributos, peso e dimensões, prazo de postagem, variações 1 e 2, "Imagem por variação", Correios. **Inferido:** gera a planilha de upload em massa da Shopee.
- **Insights**: quantidade vendida no período (dia/semana/mês), estoque atual, estoque recomendado, "produto mais vendido". Disponibilidade depende do plano.
- **Produtos produzidos** (`/produced-products`): estoque de produto acabado, reposição/produção manual, prévia de consumo **(inferido pelos endpoints)**.

### 1.5 Pedidos (`/orders`)
- Campos: Cliente (selecionar ou digitar), itens do catálogo com quantidade, **desconto por item**, canal de venda, data de entrega/prazo, observações (cor, acabamento, personalização), forma de pagamento.
- **Status:** pendente → em produção → concluído → entregue / cancelado. Há **histórico de mudanças de status** por pedido.
- **Confirmar o pedido dá baixa no estoque** (filamentos e materiais conforme a composição), numa transação no backend e sem baixar duas vezes. **Excluir o pedido estorna** o estoque e os lançamentos financeiros.
- **A data de entrega define o mês em que a receita é reconhecida** no Financeiro.

### 1.6 Orçamentos (`/orcamentos`)
- Cliente (digitado ou cadastrado), itens do catálogo **ou itens avulsos**, quantidade, desconto, frete, condições comerciais, prazo, logo.
- Prévia em A4 → **PDF pela impressão do navegador** (`window.print`, sem lib de PDF).
- Histórico (planos pagos). **Converter em pedido** uma única vez, aproveitando itens e prazo.

### 1.7 Contrato de consignação (`/contrato-consignacao`)
Dados das partes, produtos do catálogo com quantidade e **valor de repasse sugerido** (campo do produto), condições (período, acerto, perdas, devolução). PDF pela impressão do navegador. Tem aviso jurídico.

### 1.8 Financeiro (`/finance`). Completo só no Premium
Receitas (pedidos entregues), despesas (custos operacionais), lucro, **faturamento por hora de impressão** e insights financeiros. Filtro por período. Gráfico de linha (`LineChart`). Relatórios exportáveis (Premium). Indicadores por produto, canal e impressora.

### 1.9 Dashboard / Visão geral (`/painel`, `/visao-geral`, `/reports`)
Existe (`Dashboard`, `CinematicDashboard`, `/api/dashboard`, `/api/activity`). O conteúdo não foi visto **(inferido: resumo de pedidos, estoque e receita)**.

### 1.10 Ferramentas de arquivo (todas processam no navegador; o servidor só conta o uso)
| Ferramenta | O que faz | Complexidade para replicar |
|---|---|---|
| **Separador 3MF** (`/cortador-3mf`) | Lê um 3MF do Bambu Studio/OrcaSlicer, detecta regiões por cor (tolerância RGB, triângulos conectados), recompõe cada região como sólido, faz **corte planar com pino/cavidade** e exporta um 3MF multi-objeto. Recusa malhas não-manifold | **Muito alta** (three.js + manifold WASM + workers) |
| **Conversor imagem→SVG** (`/conversor-svg`) | Vetoriza logos e silhuetas: preenchimento, inverter fundo, largura em mm. Não embute o bitmap | Média (há libs prontas: potrace/imagetracerjs) |
| **Gerador de QR Code** (`/gerador-qrcode`) | Pix estático (valor aberto, BR Code EMV), link, Wi-Fi, e-mail e telefone → SVG | **Baixa** (lib `qrcode` + payload Pix) |
| **Modelos personalizáveis** (`/personalizados`) | 32 modelos paramétricos: chaveiros (nome, logo, NFC, giratório, abridor), placa Pix, medalhas, troféus, topo de bolo, carimbos de brigadeiro/biscoito, marca-página, porta-caneta, luminária, MOLLE tag… Editor 2D + prévia 3D → exporta 3MF com cores em volumes. Parte deles é "exclusivo para assinantes" | **Muito alta** |
| **Extensão de pesquisa de mercado** (`/extensao`) | Extensão para Chrome/Edge que lê anúncios públicos da Shopee, Mercado Livre e TikTok Shop, estima demanda e margem com as taxas da conta e o custo informado. **Só para assinantes** | Alta, com manutenção constante (scraping) |
| **Buscador de STLs** (`/buscador-stls`) | Rota existe. O CSP permite iframe de `3dsearch.net` **(inferido: busca embutida de modelos)** | Baixa (é um iframe) |

### 1.11 Outros
- **Sorteios** (`/sorteios`, admin com `/draw`): giveaways para a comunidade **(inferido)**.
- **Programa de afiliados**: comissão via Pix sobre faturas pagas durante N meses, com saque mínimo.
- **Suporte**: formulário com tickets (`/api/support-tickets`), e-mail e grupo de WhatsApp.
- **Integração direta com marketplaces** (autorizar conta, sincronizar pedidos, etiqueta de envio, catálogo): só aparece em endpoints `/api/admin/marketplaces/*` e **não é anunciada publicamente**. **Inferido:** está em desenvolvimento ou beta interno.
- Guias de conteúdo (14) e páginas de comparação (4), feitos para SEO. Tem um `llms.txt` com 840 perguntas para indexação por IA.

---

## 2. Planos e preços (home, 2026-09-26)

| | **Gratuito** | **Básico, R$ 15/mês** | **Pro, R$ 30/mês** (mais popular) | **Premium, R$ 60/mês** |
|---|---|---|---|---|
| Calculadora de preços | Ilimitada | Ilimitada | Ilimitada **(inferido)** | Ilimitada |
| Pedidos, custos, orçamentos e contratos | 10/mês (cada) | 20/mês | 40/mês | Ilimitados |
| Separador 3MF | 1/mês | 2/mês | 4/mês | Ilimitado |
| Modelos personalizáveis | 1 geração/modelo/mês | 5 | 10 | Ilimitado |
| Conversor SVG | 5/mês | Ilimitado | Ilimitado | Ilimitado |
| QR Code | 5/mês | 10/mês | 20/mês | Ilimitado |
| Histórico | 30 dias | 60 dias | 120 dias | Completo **(inferido)** |
| Financeiro completo, relatórios exportáveis, indicadores por produto/canal/impressora | — | — | — | ✔ |
| Extensão de mercado | — | "assinatura elegível" (plano mínimo não informado) | ? | ✔ **(inferido)** |
| Catálogo PDF, modelos "exclusivos" | — | ✔ (assinante) | ✔ | ✔ |

- Sem cartão no grátis e sem expiração. Cancelamento pela própria plataforma.
- Pagamento: **Stripe** (cartão) e **Woovi/OpenPix** (assinatura por **Pix**), conforme endpoints e termos.
- **Conclusão:** o paywall aperta principalmente em **volume de pedidos (10/mês)**, **histórico de 30 dias** e **Financeiro**. Para uma pessoa com poucos pedidos, o grátis quase dá conta. O que falta é histórico e financeiro, e é isso que a nossa versão deve dar sem limite.

---

## 3. Fluxos e telas principais

**Mapa de rotas do app** (do `robots.txt` e dos nomes de chunks). As telas não foram vistas.

```
Auth:      /login  /register (e-mail+senha ou Google)  /forgot-password  /reset-password  /confirm-email
Início:    /painel  /visao-geral  /reports
Precificar:/calculator
Cadastros: /products  /produced-products  /filaments  /materials  /printers  /operational-costs  /customers  /dados-da-empresa
Vendas:    /orders  /orcamentos  /contrato-consignacao  /marketplaces
Dinheiro:  /finance
Ferram.:   /cortador-3mf  /conversor-svg  /gerador-qrcode  /personalizados  /buscador-stls  /extensao  /sorteios
Conta:     /settings  /advanced  /subscription  /affiliate
Admin:     /admin (planos, afiliados, sorteios, catálogo de impressoras, tickets, reembolsos Woovi, aviso de manutenção)
```

**Fluxo principal** (descrito em `/sobre` e nos guias):

```
Configurar preferências (kWh, multiplicadores, manutenção %, taxas de marketplace)
   → Cadastrar impressoras, filamentos, materiais
   → Calculadora → "Salvar produto" (composição + preços por canal)
   → Orçamento (PDF) → converter em Pedido
   → Pedido: status pendente → produção → concluído → entregue   [baixa de estoque na confirmação]
   → Entrega registra a receita no mês → Financeiro (receita − custos − despesas, R$/hora de máquina)
   → Insights: mais vendidos e estoque recomendado → reposição de filamento (custo médio)
```

---

## 4. Stack técnica perceptível

| Camada | Evidência | Conclusão |
|---|---|---|
| Frontend | `createRoot`, `jsx-runtime`, `rolldown-runtime`, `VITE_API_URL`, chunks por rota | **React + Vite (bundler Rolldown)**, SPA com páginas públicas **pré-renderizadas** (`prerendered-path`, `prerender-route-guard.js`) |
| Validação | mensagens de erro do Zod no chunk `schemas` | **Zod** |
| HTTP | "There is no suitable adapter to dispatch the request", `maxBodyLength` | **axios** |
| Ícones | `createLucideIcon` | **lucide-react** |
| CSS | classes `btn btn-gold`, `l-btn`, `alert error` | CSS próprio, sem Tailwind |
| 3D / geometria | `three-runtime`, `manifold`, `modelingWorkerClient`, `exportWorkerClient`, CSP `wasm-unsafe-eval` | **three.js + manifold-3d (WASM) em Web Workers** |
| QR | `qrcode` no bundle | lib `qrcode` |
| API | CSP `connect-src https://api.gestor3d.pro`, ~130 rotas `/api/*` REST | Backend separado. **Linguagem desconhecida** |
| Auth | cookies de sessão HttpOnly + CSRF (termos), Google Identity Services | Sessão por cookie + login Google. Extensão usa access/refresh token com rotação |
| Pagamentos | `/api/stripe/checkout`, `/api/stripe/portal`, `/api/woovi/subscriptions` | **Stripe + Woovi (Pix recorrente)** |
| CEP | CSP libera `viacep.com.br`, `brasilapi.com.br` | Autopreenchimento de endereço |
| Hospedagem | `server: cloudflare`, `cf-cache-status` | **Cloudflare** (Pages ou proxy **inferido**) |
| Segurança | CSP restrita, HSTS, `X-Frame-Options: DENY`, COOP | Configuração caprichada |
| Marketing | Meta Custom Audiences por e-mail (política de privacidade), afiliados | — |

---

## 5. Proposta de MVP gratuito para a UpVision

### Princípios
- **Uma usuária, uso pessoal.** Não precisa de multi-tenant, planos, afiliados, admin nem marketplace.
- **Offline-first e grátis para sempre.** Começa só com armazenamento local e sincroniza depois, se fizer falta.
- Copiar o **modelo de cálculo** (é público e está verificado acima) e não copiar as ferramentas 3D pesadas.

### Stack sugerida
| Opção | Quando usar |
|---|---|
| **Next.js (ou Vite + React) + IndexedDB via Dexie + deploy estático na Vercel/Cloudflare Pages** ✅ recomendada | Custo zero, sem backend, funciona como PWA no celular. Backup/restauração em JSON cobre a perda do dispositivo |
| + **Supabase** (Postgres + Auth + RLS), fase 2 | Só se ela quiser usar em dois dispositivos ao mesmo tempo. Free tier basta. Exige RLS por `user_id` |

Ferramentas: Zod para validar os formulários, `qrcode` para QR/Pix, `window.print()` + CSS `@page A4` para PDFs (é o que o Gestor 3D faz), Recharts para o gráfico do financeiro. **Sem lib de PDF e sem backend no MVP.**

### Prioridades

**P0: o que resolve o dia a dia (1ª entrega)**
1. **Configurações:** preço do kWh, multiplicadores de revenda e consumidor (padrão 3 e 5), % de manutenção, custo/hora de mão de obra, taxas de marketplace (Shopee %+fixa, ML %, TikTok %).
2. **Cadastros:** impressoras (nome + potência W), filamentos (material, cor, marca, preço/kg, saldo em g, mínimo) e materiais extras (preço/unidade, saldo).
3. **Calculadora** com as fórmulas da seção 1.1: vários filamentos, extras, energia, mão de obra, manutenção %, quantidade na mesa, frete somado depois do multiplicador, preço por canal e margem líquida por marketplace. Mostrar o **detalhamento por componente**. Botão "Salvar como produto".
4. **Produtos:** composição salva, recalculada quando o preço de um insumo muda, com foto opcional.
5. **Pedidos:** cliente (texto livre), itens, desconto por item, canal, prazo, status (pendente → produção → concluído → entregue / cancelado), **baixa de estoque ao confirmar e estorno ao cancelar ou excluir**.
6. **Alerta de filamento abaixo do mínimo** e **reposição com custo médio ponderado**.
7. **Backup/restauração em JSON** (obrigatório com armazenamento local).

**P1: organização e visão de resultado**
8. **Orçamento em PDF** (A4, logo, itens do catálogo ou avulsos, frete, desconto, validade) → converter em pedido.
9. **Clientes** (nome, contato, desconto padrão).
10. **Financeiro simples:** receita por mês (pela data de entrega), custo dos produtos vendidos, custos operacionais recorrentes (mensal/anual/único), lucro e **R$/hora de impressão**. Um gráfico de linha.
11. **Gerador de QR Code Pix/Link em SVG** (barato de fazer e útil para placas Pix, que são um produto comum).
12. **Painel inicial:** pedidos por status, prazos da semana, filamentos acabando.

**P2: bom de ter**
13. Kits (produto feito de produtos) e estoque de produto acabado.
14. Contrato de consignação (reaproveita o template do orçamento).
15. Insights: mais vendidos por período e estoque recomendado.
16. Catálogo de produtos em PDF (vitrine para mandar no WhatsApp).
17. Conversor imagem→SVG (lib pronta de tracing).
18. Sincronização entre dispositivos (Supabase).

**Fora de escopo (custo alto, pouco retorno para uso pessoal):** Separador 3MF, modelos 3D paramétricos, extensão de marketplace, integração com APIs de marketplace, planos/pagamentos, afiliados e sorteios.

### Modelo de dados mínimo (P0/P1)
```
settings(kwh_price, labor_hour_cost, maintenance_pct, mult_resale, mult_consumer, fees{shopee_pct, shopee_fixed, ml_pct, tiktok_pct})
printers(id, name, watts)
filaments(id, material, color, brand, price_per_kg, stock_g, min_g)            # custo médio recalculado na reposição
materials(id, name, unit, unit_price, stock, min)
products(id, name, photo?, printer_id, print_minutes, labor_minutes, freight?, filaments[{filament_id, grams}], materials[{material_id, qty}], manual_prices{channel: value}?)
customers(id, name, phone?, email?, default_discount_pct)
orders(id, customer_id|name, channel, due_date, delivered_at?, status, items[{product_id, qty, unit_price, discount}], notes, stock_applied: bool)
quotes(id, …igual a order…, valid_until, converted_order_id?)
operational_costs(id, description, category, amount, frequency, printer_id?)
```

### Riscos e cuidados
- **Armazenamento local se perde** se o navegador for limpo. Por isso o backup em JSON é P0, com lembrete periódico.
- **Não copiar textos, marca nem layout** do Gestor 3D. Só as fórmulas (matemática de domínio público) e a lista de funcionalidades servem de referência.
- As taxas de marketplace mudam: deixar tudo editável e não usar valores fixos no código.
