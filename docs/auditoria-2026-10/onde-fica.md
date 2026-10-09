# Onde fica cada coisa: revisão de arquitetura de informação

Pedido do Gabriel: "confere se os objetos estão nos lugares corretos, tem coisa que não está tão fácil de achar". Revisão feita em 09/10 (v0.11.6), com a skill ui-ux-pro-max (navegação, nomenclatura, microcopy), sem usar o mouse do Mac: o inventário saiu do código e a busca foi testada com 60 termos reais.

Legenda: ✅ aplicado nesta rodada · ❓ precisa de decisão do Gabriel (mudança grande de estrutura, não aplicada).

## 1. O que existe e onde está

### Barra lateral (6 seções)

| Seção | Telas |
|---|---|
| Início | Início |
| Criar | Criar (galeria), Meus projetos, e 17 ferramentas: Imagem → SVG, Cortador de biscoito, Chaveiros, Medalhas, ~~Extrusão 3D~~ Desenho em 3D, QR Code e Pix, Modelos prontos, Litofania e quadro, Pixel art, Organizador de gaveta, Organizador pela foto, Separar 3MF por cor, ~~Decal no seu modelo~~ Nome ou logo no seu modelo, ~~OpenSCAD personalizável~~ Modelo personalizável (OpenSCAD), Buscar modelos, Pedir à IA, ~~Etiquetas de rolo~~ (✅ foi para Estoque) |
| Vender | Pedidos, Orçamentos, Calculadora, Clientes, Produtos |
| Estoque | Filamentos, Materiais extras, Impressoras, ✅ Etiquetas de rolo |
| Resultados | Painel, Financeiro, Custos operacionais |
| Ajustes | Dados da empresa, Preferências (7 seções, #179), Fazer backup, Restaurar backup, O que há de novo, Sugerir ferramenta |

### Modelos prontos: 5 categorias, 30 famílias, 85 modelos (antes: 32 famílias)

| Categoria | Famílias (modelos) |
|---|---|
| Chaveiros (13) | Tag de identificação (2), Chaveiro (8: logo, NFC, anilha, espelho, abridor, apoio de celular, giratório, clicker), Nomes (3) |
| Placas (11) | Cartão de música (1), Placa de balcão (4), Placa (5, com o Mapa estelar), Cartão de visita (1) |
| Festa e esporte (14) | Troféu (3), Medalha (1), Lembrancinhas (2: ímã de geladeira, estampa de camisa), Topo de bolo (1), Enfeite de Natal (2), Letras e palavras (5) |
| Casa (38) | Moldura (3), ✅ Luminárias e abajures (2), Quadro e desenho (7), Potes e organizadores (6), ✅ Organizador modular (Gridfinity) (5), Vaso (1), Brinquedos (4), Porta-copos (1), Suporte de celular e tablet (1), Marca-página (1), Tecla de teclado (1), Porta-chave de parede (1), Utilitários (5) |
| Cozinha (9) | Mesa de doces (2), Carimbos e texturas (3), Cortadores e formas (3), Clipe de saco (1) |

Coleções por ocasião (13): Dia das Mães, Natal, Páscoa, Festa Junina, Dia dos Pais, Dia das Crianças, Aniversário, Formatura, Casamento, Chá de bebê, Profissões, Negócio, Pets.

### Três buscas, três comportamentos diferentes (o problema de fundo)

| Busca | Antes | Hoje |
|---|---|---|
| ⌘K (global) | Só telas, dados e ajuda. **Nenhum Modelo pronto**: "geladeira", "abajur", "tecla", "rpg" não achavam nada | ✅ Acha os 85 modelos (carrega o catálogo só ao abrir a busca) e abre já no modelo |
| Galeria dos Modelos | Frase inteira como pedaço de texto: "porta copos" não achava "Porta-copos"; sem sinônimos; sem ocasião; ordem do catálogo, não de relevância | ✅ Palavras em qualquer ordem, hífen não conta, sinônimos, ocasiões, do que mais combina para o que menos |
| Criar | Igual à galeria | ✅ Mesma regra (código único em `src/tools/models/search.ts`) |

## 2. O que estava no lugar errado ou difícil de achar

Teste com 60 termos reais (ímã, geladeira, abajur, luminária, camisa, gaveta, organizador, dado, RPG, porta-copos, tecla, QR, Pix, Natal, Dia das Mães, foto, relevo, litofania, moldura, quadro, celular, …):

| | Antes | Depois |
|---|---|---|
| Termos sem nenhum resultado na galeria | 19 | 9 |
| Termos sem nenhum resultado no ⌘K | 42 | 8 |

Os 9 que continuam vazios são **coisas que o catálogo não tem** (ideias para issues, seção 5): convite, caneca, bijuteria, brinco, pelúcia, relógio, cabide, cofrinho, e "adesivo" (o ⌘K manda para a ferramenta Nome ou logo no seu modelo).

Exemplos concretos do que a busca não achava e agora acha: camiseta (o modelo é "Estampa de camisa"), porta copos, porta-retrato (é o Porta-foto), porta-chaves, marcador de livro, constelação, litofania (na galeria), Dia das Mães, aniversário, casamento. E "ímã" agora mostra o Ímã de geladeira primeiro, não o Cartão de música que só cita ímã na descrição.

Outros achados:

- **Dois nomes quase iguais para coisas diferentes.** A ferramenta Litofania e quadro tem o modo "Quadro por camadas" (relevo em cores numa placa só); o modelo era "Quadro em camadas (shadowbox)" (placas recortadas empilhadas). ✅ O modelo virou **Shadowbox (placas empilhadas)** e os dois se apontam ("Veja também").
- **Famílias de 1 item.** Eram 14, agora 11. ✅ Luminária + Abajur viraram **Luminárias e abajures**; a Moldura grande dividida entrou na família **Moldura**.
- **Etiquetas de rolo em Criar.** É gestão de estoque (QR por rolo, baixa de gramas). ✅ Foi para **Estoque**, ao lado dos Filamentos.
- **Plaquinha de colorir** estava em "Quadro e desenho" (Casa); é para criança pintar. ✅ Foi para **Brinquedos**.
- **Nomes técnicos que a vendedora não usaria** (✅ trocados; o nome antigo continua achando na busca): Extrusão 3D → **Desenho em 3D**; Decal no seu modelo → **Nome ou logo no seu modelo**; OpenSCAD personalizável → **Modelo personalizável (OpenSCAD)**; Gridfinity → **Organizador modular (Gridfinity)**; Estampa → Estampa de **camisa**.
- **Ferramentas parecidas sem ligação.** ✅ Agora têm "Veja também" (ver tabela).

## 3. Hoje → proposto

### ✅ Aplicado (baixo risco, com testes)

| Hoje | Proposto | Motivo |
|---|---|---|
| ⌘K sem modelos | ⌘K com os 85 modelos, abrindo no modelo | Era a maior lacuna: quem digita "geladeira" não achava o ímã |
| Busca de frase inteira | Palavras em qualquer ordem, sem hífen, com sinônimos e ocasiões | "porta copos", "camiseta", "Dia das Mães" não achavam nada |
| Resultado na ordem do catálogo | Do que mais combina para o que menos; palavra inteira antes de começo ("Pix" → Placa Pix antes de Pixel art) | O certo aparece primeiro |
| Luminária (1) + Abajur de mesa (1) | Luminárias e abajures (2) + atalho Litofania (abajur) | Quem procura um acha o outro |
| Moldura (2) + Moldura grande dividida (1) | Moldura (3) | Família de 1 item |
| Plaquinha de colorir em Quadro e desenho | Brinquedos (Colorir) | É de criança |
| Etiquetas de rolo em Criar | Estoque | É gestão de estoque |
| Quadro em camadas (shadowbox) | Shadowbox (placas empilhadas) | Não confundir com o "Quadro por camadas" da Litofania |
| Extrusão 3D · Decal no seu modelo · OpenSCAD personalizável | Desenho em 3D · Nome ou logo no seu modelo · Modelo personalizável (OpenSCAD) | Nome que a pessoa usa |
| Gridfinity (família) | Organizador modular (Gridfinity) | "Organizador" é a palavra da vendedora |
| Sem ligação entre ferramentas parecidas | "Veja também" (abaixo) | Quem chegou na ferramenta errada acha a certa |

"Veja também" criados:

| Em | Aponta para |
|---|---|
| Litofania e quadro | Shadowbox · Litofania em abajur (Abajur de mesa) · Pixel art |
| Organizador de gaveta | Organizador pela foto · Gridfinity pela gaveta |
| Organizador pela foto | Organizador de gaveta · Gridfinity: caixinha |
| Chaveiros (ferramenta) | Chaveiros prontos (NFC, giratório, abridor…) · Medalhas |
| Modelos › Quadro e desenho · Luminárias e abajures | atalho Litofania |
| Modelos › Lembrancinhas | atalho Pixel art (ímã) |
| Modelos › Organizador modular | atalhos Organizador de gaveta · Pela foto |

## 4. ❓ Para o Gabriel decidir (mudança grande de estrutura, não aplicada)

1. **Casa está grande demais (13 famílias, 38 modelos) e mistura três assuntos:** decoração (Quadro, Moldura, Luminárias, Vaso), organização/utilidade (Organizador modular, Potes, Utilitários, Porta-chave) e coisas de presente/hobby (Brinquedos, Tecla, Marca-página, Porta-copos). Proposta: **separar em "Casa e decoração" e "Organização e utilidades"**. Custo: nova categoria na galeria, nas abas e nos testes de miniatura/categoria.
2. **Uma categoria "Presentes".** Hoje o presente está espalhado: Mapa estelar em Placas; Ímã e Estampa em Festa e esporte; Porta-copos, Marca-página e Brinquedos em Casa; Cartão de música em Placas. As coleções por ocasião resolvem a busca, mas não o "onde eu clico". Proposta: categoria **Presentes e lembrancinhas** com Lembrancinhas, Mapa estelar, Cartão de música, Porta-copos, Marca-página, Estampa. Combina com a decisão 1.
3. **Litofania × Relevo × Quadro por camadas × Shadowbox.** São quatro entradas para "foto/imagem em relevo". Proposta: uma ferramenta **Foto em relevo** com os modos Litofania, Quadro por camadas e Shadowbox (hoje o Shadowbox é um modelo à parte). Custo: mover o gerador do Shadowbox para dentro da ferramenta.
4. **Organizador de gaveta × Organizador pela foto × Gridfinity.** Três portas para "organizar uma gaveta". Proposta: uma ferramenta **Organizadores** com três abas (medir a gaveta, pela foto da ferramenta, caixinhas Gridfinity). Hoje só estão ligadas por "Veja também".
5. **Chaveiros ferramenta × Chaveiros modelos.** O card da ferramenta e o da família aparecem lado a lado na Criar. Proposta: deixar só a família Chaveiro e manter a ferramenta como atalho ("Nome em lote"), que já existe dentro dela.
6. **Barra lateral: Criar abre uma lista de 17 telas.** Proposta: mostrar só as 5 mais usadas (Modelos prontos, Chaveiros, Litofania, Pixel art, QR) e "Todas as ferramentas" (a galeria Criar, que já filtra por tipo).
7. **Mais renomes (nomes ainda técnicos):** Imagem → SVG ("Imagem em desenho (SVG)"), Separar 3MF por cor, Buscar modelos ("Buscar modelos na internet"). Mexem em ~35 arquivos de teste e na ajuda; ficaram de fora por serem decisão de produto.
8. **Famílias de 1 item que sobram (11):** Cartão de música, Cartão de visita, Medalha, Topo de bolo, Vaso, Porta-copos, Suporte de celular, Marca-página, Tecla, Porta-chave de parede, Clipe de saco. Faz sentido se a decisão 1 ou 2 reagrupar.

## 5. Ideias para issues (a busca mostrou o que falta no catálogo)

convite · caneca/copo personalizado · bijuteria e brinco · pelúcia · relógio · cabide · cofrinho. Nenhum desses termos existe hoje; foram os mais digitados como "o que uma vendedora procuraria".

## 6. O que mudou no código

- `src/tools/models/search.ts`: busca única (Criar, galeria, ⌘K), com sinônimos por modelo (`MODEL_ALIASES`) e ocasiões; `src/ui/pageAliases.ts` para as ferramentas; `src/ui/modelSearchItems.ts` (carregado só ao abrir o ⌘K).
- `src/ui/SeeAlso.tsx` e `.see-also` em `components.css`.
- `src/tools/models/families.ts`, `src/pages.tsx`, nomes e blurbs.
- Testes: `search.test.ts` (30 buscas reais), `CommandPalette.test.tsx`, `SeeAlso.test.tsx`, busca da Criar, `onde-fica.e2e.ts` (⌘K, galeria, "Veja também" e atalhos), `search.test.ts` do `rank`.
