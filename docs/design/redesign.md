# Redesign "menos é mais": Fase 1 (#139)

Auditoria, nova navegação e protótipo de 4 telas (Início, Criar, uma ferramenta, Calculadora), claro e escuro.
Tudo está na branch `redesign`. O `main` só mudou o ícone e a marca (#138). **A Fase 2, aplicar em todas as telas, espera a aprovação do Gabriel.**

Antes e depois, lado a lado (em cima claro, embaixo escuro):
[Início](antes-depois-inicio.jpg) · [Criar](antes-depois-criar.jpg) · [Ferramenta (Chaveiros)](antes-depois-ferramenta.jpg) · [Calculadora](antes-depois-calculadora.jpg).
Telas soltas em `antes/` e `depois/`. Para refazer: `SHOTS_REDESIGN=antes|depois npx playwright test tests/e2e/redesign-shots.e2e.ts`.

## 1. Auditoria (o que dá "cara de IA" e onde a pessoa se perde)

| Achado | Onde | Por que incomoda |
|---|---|---|
| **32 itens na barra lateral**: 15 ferramentas, 11 telas de gestão, 2 de preferências e mais 4 ações no rodapé | Barra lateral | Não dá para bater o olho. Cada ferramenta nova piora. |
| **Ícones laranja com gradiente** em todo cartão, e o laranja decorativo usado em 12 lugares | Início, títulos de janela, upload, dicas | É o sinal nº 1 de UI gerada: cor sem significado. O laranja competia com o azul do botão principal. |
| **25 cartões iguais** no Início, cada um com ícone, título e frase | Início | Nenhuma hierarquia: tudo pesa igual e nada é "o que fazer agora". |
| **Subtítulo explicando a tela em 29 páginas** (`.lead`) | Todas | Texto que ninguém lê; a explicação já está no botão **?**. |
| **Sombra em todo cartão** (`--shadow-1` em 26 regras) | Tudo | Sombra é para o que flutua (janelas, menus). Em tudo, vira ruído. |
| **Ícone decorativo em título de cartão** (32 títulos) | Calculadora, Painel, Orçamento… | Mais um elemento por bloco, sem informação. |
| **Rótulos em CAIXA ALTA espaçada** ("LOGO (OPCIONAL)") | Ferramentas, editor de produto | Estilo de template; o macOS usa caixa normal em negrito. |
| **Ajuste fino misturado com o essencial**: espessura, relevo, borda e resina ao lado de nome e fonte | Ferramentas | Formulário longo; quem só quer o nome precisa rolar. |
| **4 botões de exportar com o mesmo peso** (3MF, projeto Bambu, STL, STL por parte) | Todas as ferramentas 3D | Não fica claro qual é "o" botão. |
| **O app não respeita "Reduzir movimento"** do sistema | Global | Falha de acessibilidade: animações rodavam mesmo com a opção ligada. |
| Miniaturas dos modelos com fundo claro numa grade de cartões escuros | Modelos prontos (escuro) | Blocos brancos pesados no tema escuro. |
| Calculadora: painel de resultado denso (dois preços, markup e margem em texto corrido) | Calculadora | Fica para a Fase 2 (ver 6). |

O que já estava bom e fica: fonte do sistema (SF Pro / Segoe UI Variable), tokens de cor com contraste AA nos dois temas, barra lateral translúcida, título grande que encolhe ao rolar, ⌘K e ajuda por tela.

## 2. Nova navegação

Cinco portas e Ajustes. **Só a seção aberta mostra as telas dela**, recuadas e sem ícone, como no Finder e nos Ajustes do macOS. Assim ficam de 6 a 12 itens à vista, contra 32 antes.

| Seção | Abre em | Telas dentro |
|---|---|---|
| **Início** | Início | (nenhuma) |
| **Criar** | Galeria | Todas as ferramentas e os 60+ Modelos prontos. A ferramenta aberta aparece embaixo de Criar. |
| **Vender** | Pedidos | Pedidos, Orçamentos, Calculadora, Clientes, Produtos |
| **Estoque** | Filamentos | Filamentos, Materiais extras, Impressoras |
| **Resultados** | Painel | Painel, Financeiro, Custos operacionais |
| **Ajustes** (rodapé) | Preferências | Dados da empresa, Preferências, Fazer backup, Restaurar, O que há de novo, Sugerir ferramenta |

- **Ferramentas saem da barra lateral** e ficam na galeria **Criar**, com busca sem acento e filtro por *o que a pessoa tem em mãos*: Personalizar · De um desenho ou foto · Arquivos 3D · Ideias. Clicar num modelo pronto abre a ferramenta já nele.
- **Governança:** ferramenta nova entra na galeria, nunca na barra lateral. Isso é automático: `section: "create"` em `pages.tsx`.
- **⌘K continua** achando qualquer tela, registro ou artigo. Ele complementa a barra lateral, não a substitui.
- Produtos ficou em Vender (é o catálogo do que se vende); o estoque pronto dele continua na própria tela.

## 3. Início

Cumprimento, **5 ações** (Chaveiro, Modelo pronto, Calcular preço, Orçamento, Pedidos), **Continuar** (os rascunhos das ferramentas, com "há 2 horas", a partir do #85) e **Esta semana** (pedidos com prazo em 7 dias, atrasados em vermelho, clique abre o pedido). O "Comece por aqui" continua na primeira abertura até a pessoa fechar.

## 4. Template de ferramenta (aplicado em Chaveiros)

- **Prévia grande** à direita, fixa ao rolar, com a altura da janela.
- **Poucos campos essenciais** à esquerda, em grupos com título curto em caixa normal (Texto e fonte · Logo · Base).
- **Opções avançadas** recolhidas (`<details className="advanced">`) com o ajuste fino: espessura, relevo, borda e resina.
- **Um botão cheio só**: Salvar 3MF. Os outros formatos viram uma linha discreta de links ("Outros formatos: Salvar STL"), sempre à vista.
- Recomendação de impressão numa linha de dica, sem caixa.
- Subtítulo de **uma frase** ("Nome e logo em 2 cores, pronto para o AMS."); o passo a passo fica no **?**.

Regras para quem cria ferramenta (combinado com o Torno na #140): `.tool-layout` com `.controls` e `.preview-col`; grupos em `.card stack` com `h3` curto; ajuste fino em `details.advanced`; um primário; sem laranja nem emoji.

## 5. Linguagem visual

| Antes | Depois |
|---|---|
| Laranja decorativo + azul | **Um acento: o azul da marca.** O botão de exportar virou o primário azul. O laranja fica só onde significa algo: o símbolo da marca, a coluna "pronto" dos pedidos, a guia de alinhamento e as favoritas. |
| Sombra em todo cartão | **Linha fina (0,5 px)** nos grupos; sombra só em janela, menu e toast. |
| Ícone colorido em tile | **Ícone de traço, monocromático**, no tamanho do texto; destaque por fundo neutro no hover. |
| Caixa alta espaçada | Caixa normal, semibold. |
| Ícone em título de cartão | Sem ícone; o título basta. |
| Animação sempre | Curta, com mola, e **nenhuma quando "Reduzir movimento" está ligado**. |

Tokens continuam num lugar só (`tokens.css`); a mudança foi de valores (`--action` = acento) e de poucas regras em `components.css`, `tools.css`, `layout.css` e `features.css`.

## Andamento da Fase 2 (aprovada em 30/09/2026)

- **Passo 1 no main:** navegação em 5 seções com data-page, galeria Criar, Início, template em Chaveiros, um primário no ExportButtons, linguagem visual, barra lateral recolhível (⌘⌥S), marca fiel ao site com wordmark, abertura que se imprime e ícone do macOS 26 com variantes (Icon Composer → Assets.car).
- **A Calculadora do protótipo ficou de fora:** o Lupa está nela (#147). Entra combinada com ele.
- **Próximos:** Liquid Glass; template nas outras ferramentas (Forja e Torno) e nas telas de gestão (Lupa); textos (#143) e acessibilidade (#144).

## 6. O que a Fase 2 faz (depois da aprovação)

1. Aplicar o template nas outras 13 ferramentas (Forja e Torno donos da lógica; eu, do layout): tirar os `.lead` longos e recolher o ajuste fino em cada uma.
2. Telas de gestão: título com os controles ao lado (`.title-row`), tabelas com linha fina, sem ícone em título.
3. Calculadora (com o Lupa): um preço em destaque, revenda e venda direta como linhas de tabela, "Qual preço usar?" como link.
4. Backup e restauração no **menu Arquivo nativo** (Tauri), além de Ajustes; Novidades e Sugerir no menu Ajuda.
5. Miniaturas dos modelos com fundo transparente (refazer `npm run thumbs`) para o tema escuro.
6. Ícone do macOS sem a sombra desenhada (o sistema atual põe a dele).
7. E2E e screenshots de todas as telas nos dois temas.

## 7. Perguntas para o Gabriel

1. **Vender abre em Pedidos.** Ela usa mais a Calculadora? Se sim, Vender abre na Calculadora.
2. **As 5 ações do Início** estão certas? (Chaveiro, Modelo pronto, Calcular preço, Orçamento, Pedidos.)
3. **Ferramentas fora da barra lateral**: tudo bem precisar passar por Criar (ou ⌘K)? A ferramenta em uso fica visível embaixo de Criar.
4. Laranja só na marca e no que tem significado: ok, ou ele quer o laranja em mais algum lugar?
