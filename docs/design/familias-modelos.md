# Famílias de modelos (#141) — proposta de agrupamento

Para aprovar junto com o redesign (#139). **Nada implementado ainda.**

Hoje a galeria tem **63 modelos soltos**. A proposta junta em **24 famílias**: cada família é 1 card na galeria e,
dentro dela, a pessoa escolhe a **variação** por miniatura (como os estilos de hoje). Nenhuma função some.

## Como fica por baixo (sem migração)

- A família é só uma camada de apresentação: `FAMILIES = [{ id, nome, ícone, variações: [ids de hoje] }]`.
- Cada variação continua sendo o modelo de hoje, com o mesmo `id`. Continuam valendo sem mudar nada: rascunhos e
  últimos projetos (#85), variações salvas (#26), estilos prontos, coleções (Negócio, Mães, Natal…), miniaturas,
  perfil de impressão (#86), aviso de mesa e a varredura de QA (#90).
- Ao trocar de variação, os campos com o mesmo nome (texto, cores, fonte, desenho enviado) vão junto; o resto
  volta ao padrão da variação.
- A busca continua achando pelo nome antigo ("anilha" → Chaveiro, variação Anilha).

## Tabela

| # | Família (card) | Variações (id de hoje) | Dono hoje | Observação |
|---|---|---|---|---|
| 1 | **Placa de balcão** | Pix (`pix`) · QR (`qrPlate`: Wi-Fi, Instagram, WhatsApp, avaliação, link) · Vários QRs (`qrList`) · NFC (`nfcTotem`) | Forja | Todas em pé com suporte, para comércio. Os estilos do `qrPlate` viram sub-escolha da variação QR. |
| 2 | **Placa** | Sinalização (`sign`) · No contorno do desenho (`adaptivePlate`) · Profissão (`profession`) · Painel de nomes (`namesPanel`) | Forja, Torno | Parede, porta ou mesa. Ver pergunta A. |
| 3 | **Cartão de visita** | `businessCard` | Forja | Sozinho (tamanho fixo 85 × 54, pausa para tecido/NFC). |
| 4 | **Tag de identificação** | Pet (`petTag`) · MOLLE (`molle`) | Forja | Nome na frente, dados no verso / rasgos para fita. |
| 5 | **Chaveiro** | Logo (`logoKeychain`) · NFC (`nfc`) · Anilha (`gymKeychain`) · Espelho (`mirror`) · Abridor (`opener`) · Giratório (`spinner`) · Clicker (`clicker`) | Forja | 7 variações em 2 grupos na tela: "Com arte" (logo, NFC, anilha) e "Com função" (espelho, abridor, giratório, clicker). Ver pergunta B (a ferramenta Chaveiros). |
| 6 | **Nomes** | Articulado (`articulatedName`) · Pingentes (`namePendants`) · Topo de lápis (`pencilTopper`) | Forja, Torno | Peças com o nome como assunto principal. |
| 7 | **Troféu** | Placa na base (`trophy`) · Elegante (`trophyElegant`) · No contorno do desenho (`adaptiveTrophy`) | Forja | Estilos, como pede a issue. |
| 8 | **Medalha** | No contorno do desenho (`adaptiveMedal`) | Forja | Ver pergunta B (a ferramenta Medalhas vira a variação "Redonda/formatos"). |
| 9 | **Topo de bolo** | `cake` | Forja | Sozinho; os estilos (15 anos, casamento…) continuam. |
| 10 | **Mesa de doces** | Boleira (`cakeStand`) · Suporte de palitos (`stickStand`) | Torno | |
| 11 | **Enfeite de Natal** | Floco de neve (`snowflake`) | Forja | Card sazonal; próximos enfeites entram aqui. |
| 12 | **Letras e palavras** | Letreiro em camadas (`layeredSign`) · Letras para parede (`wallLetters`) · Letra grande (`bigLetter`) · Letra caixa LED (`ledLetter`) · Palavras encaixadas (`wordDecor`) | Torno, Forja | |
| 13 | **Moldura** | Shaker com janela (`windowFrame`) · Porta-foto (`photoHolder`) | Torno | |
| 14 | **Quadro e desenho** | String art (`stringArt`) · Desenho em pé (`lineArt`) · Plaquinha de colorir (`coloring`) · Quadro de metas (`goalBoard`) | Torno, Forja, Lupa | Peças decorativas planas a partir de desenho/texto. |
| 15 | **Potes e organizadores** | Porta-caneta (`pen`) · Organizador de mesa (`deskOrganizer`) · Caixa com tampa (`lidBox`) · Estojo de rosca (`screwCase`) · Porta-joia NFC (`nfcJewelry`) · Cumbuca no contorno (`outlineBowl`) | Torno, Forja, Lupa | |
| 16 | **Gridfinity** | Caixinha (`gridBin`) · Base (`gridBase`) · Base pela gaveta (`gridDrawerBase`) · Teste de encaixe (`gridTest`) | Torno | Já é uma família na prática. |
| 17 | **Luminária** | `lamp` | Forja | Ver pergunta C (Letra caixa LED). |
| 18 | **Vaso** | `vase` | Torno | |
| 19 | **Brinquedos** | Quebra-cabeça (`puzzle`) · Cubo alfabeto (`alphabetCube`) · Dados de RPG (`rpgDice`) | Torno | |
| 20 | **Marca-página** | `bookmark` | Forja | |
| 21 | **Porta-chave de parede** | `keyHolder` | Forja | |
| 22 | **Carimbos e texturas** | Carimbo (`stamp`) · Molde para carimbo de EVA (`stampMold`) · Rolo de textura (`textureRoller`) | Forja, Lupa | Marcar massa, sabonete, EVA. |
| 23 | **Cortadores e formas** | Cortador + carimbo (`cutterStamp`) · Cortador em grade (`gridCutter`) · Ejetor de brigadeiro (`ejector`) | Forja, Lupa | Ver pergunta B (a ferramenta Cortador de biscoito). |
| 24 | **Clipe de saco** | `bagClip` | Forja | |

Conferência: as 24 famílias somam **63 modelos**, cada id de hoje aparece uma vez só (conferido com a lista `MODELS`).

## Perguntas para o Gabriel e o Quartzo

- **A. Placa: 1 ou 2 famílias?** Proposta: 2 (balcão com QR/Pix/NFC × placa de parede/porta). Numa família só seriam
  8 variações misturando comércio e decoração.
- **B. As ferramentas avulsas entram nas famílias?** Hoje há telas próprias que repetem modelos: **Chaveiros**
  (nome/logo em lote), **Medalhas** (formatos, textos em arco, presets), **Cortador de biscoito** e **QR Code e Pix**.
  Opções: (1) viram a primeira variação da família (Chaveiro → "Nome", Medalha → "Redonda/formatos", Cortadores →
  "Cortador de biscoito", Placa de balcão → "QR/Pix avulso"), com a tela completa ao abrir; (2) continuam como
  ferramentas e a família só mostra um atalho. Proposta: (1) para Chaveiro e Medalha, (2) para o Cortador e o QR
  (que têm usos fora dos Modelos prontos).
- **C. Letra caixa LED** fica em Letras e palavras (proposta) ou em Luminária?
- **D. Nomes dos cards**: curtos e no singular quando possível ("Chaveiro", "Troféu", "Placa"), plural só para
  grupos ("Potes e organizadores").

## Fora do escopo desta proposta

A ordem das famílias na galeria, as miniaturas novas e o visual do seletor de variação ficam com o redesign (#139).
Depois da aprovação: implementar `FAMILIES` + seletor de variação, busca pelo nome antigo e testes (galeria mostra as
24 famílias; abrir um rascunho antigo de `gymKeychain` cai em Chaveiro › Anilha com os mesmos valores).
