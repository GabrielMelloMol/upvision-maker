# Passada de polimento (v0.9.x)

30 telas × claro/escuro × 1100/1440 px, com dados de teste e com o banco vazio. As comparações estão em `docs/design/polimento/antes-depois-*.jpg`; as 150 + 150 fotos ficam fora do git. Para fotografar de novo, rode
`POLISH=depois npx playwright test tests/e2e/polimento-shots.e2e.ts`. Com `POLISH_EMPTY=1`, as fotos saem com o banco vazio.

## Corrigido (design system, Quartzo)

| O que estava errado | Correção |
|---|---|
| Um botão principal desabilitado aparecia azul cheio no escuro e parecia clicável | Agora fica cinza nos dois modos (`base.css`). |
| Estado vazio: ícone em quadrado colorido com um ponto laranja, e dois botões azuis na tela (o do título e o do vazio) | O ícone fica neutro e o ponto laranja saiu. O botão do vazio fica em azul suave, então só sobra um botão cheio. |
| As telas de Estoque abriam já roladas até o formulário, com o título encolhido (Impressoras vazio) | O formulário ganha o foco sem rolar a tela. |
| Tabelas passavam da tela a 1100 px (Filamentos) e o link Editar ficava cortado | As ações da linha ocupam até 2 linhas (`.row-actions` no CrudPage). |
| O Financeiro passava 54 px da tela a 1100 px | Os cartões e as barras podem encolher (`min-width: 0`). |
| Os cartões e as colunas do Painel e dos Pedidos ficavam cortados a 1100 px | O Painel usa `auto-fit` e as colunas dos Pedidos têm no mínimo 190 px. |
| No escuro, as miniaturas brancas dos modelos e o xadrez das prévias ofuscavam | Brilho das miniaturas reduzido e xadrez escuro no modo escuro. |
| Área de soltar arquivo era uma caixa dentro de outra caixa | O cartão em volta some quando só tem a área de soltar. |
| "Opções avançadas" desalinhadas do resto | Espaçamento igual ao dos cartões. |
| 4 a 6 linhas de configuração de impressão embaixo do Salvar 3MF | Agora é uma linha ("Imprima com: …"). O resto foi para "Dicas de impressão", que fica fechado. |
| Descrições das ferramentas em Criar cortadas com "…" numa linha | Agora cabem duas linhas. |
| "OpenSCAD personalizável" quebrava de linha na barra lateral | O nome termina em reticências e aparece inteiro na dica ao passar o mouse. |
| Buscar modelos: ícone no título, sites como vários cartões soltos, rótulo longo | Um único cartão com separadores, título sem ícone e o rótulo "Só modelos grátis". |
| Cor preta invisível nas amostras em cartão escuro | As amostras ganharam um anel `--border-strong`. |
| O Início ocupava a largura toda a 1440 px | A largura máxima agora é 880 px. |

## Depende de outros devs

### Forja (ferramentas 3D) — feito em 91d4446 (Gaveta, Pixel art e Litofania ficaram com o Torno)
- **Imagem → SVG:** tem dois botões cheios, "Aplicar" e "Salvar SVG". "Aplicar" deveria virar secundário ou ser aplicado sozinho. No escuro, o painel "SVG vetorizado" continua branco; o "Original" já usa o xadrez escuro.
- **QR Code e Pix:** tem dois botões principais, "Salvar SVG" e o Salvar 3MF do ExportButtons. Um deles deveria usar `secondary`.
- **Pedir à IA:** "Criar peça" e o ExportButtons são dois botões principais. A caixa de informação cinza fica dentro de um cartão.
- **Organizador de gaveta:** no escuro, a peça cinza-escura fica sobre fundo escuro e as células somem. Falta cor ou contorno no escuro.
- **Medalhas:** o rótulo "Altura: em arco, em cima (mm)" quebra de linha e desalinha o campo ao lado. Um rótulo mais curto resolve.
- **Etiquetas de rolo:** "Etiquetadora 50 × 30" quebra dentro do seletor.
- **Pixel art:** sem imagem, a tela não mostra tela de desenho nem estado vazio.
- **OpenSCAD:** o texto da área de soltar mostra sintaxe de dev ("[min:passo:max], /* [Abas] */"). Isso deveria ir para a Ajuda.
- **Cartões sem título na coluna de controles:**
  - Cortador (linha 78)
  - Extrusão (a tela inteira)
  - Litofania (linha 126)
  - Pixel art (linhas 113 e 129)
  - Separar 3MF (linha 100)
  - Pedir à IA (linha 183)

### Torno (Modelos prontos e catálogo) — feito em 1fbd7d4. A prévia cortada era a altura do `.viewer`, corrigida em bc2f81c
- **Modelos prontos:**
  - As 11 pílulas de ocasião ocupam 3 linhas a 1100 px. Dá para mostrar as 5 mais usadas e esconder o resto em "Mais".
  - O texto de baixo da plaquinha ("Ateliê da Ana") sai da prévia. Falta enquadrar pelo tamanho real da peça.
  - O cartão da linha 328 não tem título.
- **Buscar modelos:** "Buscar em todos (5 abas)" parece desabilitado no claro e aparece azul cheio no escuro com a busca vazia. O botão deveria ficar desabilitado de verdade sem termo.

### Lupa (gestão, calculadora, banco)
- **Financeiro:** o lucro negativo aparece em vermelho ao lado de "▲ 77%" em verde. A seta deveria mostrar se o resultado melhorou ou piorou, não só a direção do número.
- **Painel:** a 1100 px, os nomes da tabela "Mais vendidos" quebram em duas linhas. Cortar o nome com reticências e mostrar o nome inteiro na dica.
- **Preferências e Impressoras:** muitos campos têm de 3 a 8 linhas de ajuda. O texto pode ir para o ⓘ e ficar só uma linha à vista.
- **Estoque:** o formulário de adicionar fica sempre aberto. O template pede um botão "Adicionar" na linha do título, que abre o formulário.
- **Ações das linhas:** algumas tabelas usam botões de ícone e outras usam links de texto. É preciso escolher um padrão, e a sugestão é o link de texto, como em Filamentos.
- **Dados da empresa:** a seção Endereço é uma caixa cinza dentro do cartão.
- **Início:** o estado vazio é uma linha cinza sem botão. Falta uma ação, por exemplo "Criar a primeira peça".
- **Orçamentos:** a semente do teste visual (`tests/visual/seed.ts`) não cria orçamentos, então a tabela não aparece nas fotos.
