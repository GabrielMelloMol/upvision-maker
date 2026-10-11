# Biblioteca de kit cards: Bicho de 4 patas e Baú

Projeto dos dois kits sobre a base `KitTemplate` (`docs/kits/API.md`). Tudo em mm. `t` = espessura (padrão 1,6), `f` = folga da fenda (0,2),
`n` = bico (`nozzleMm()`), `s = t + f` = largura de toda fenda. Código: `src/geometry/kit/designs/` (`bicho.ts` e `bau.ts` são só geometria 2D;
`bichoKit.ts` e `bauKit.ts` são os KitTemplate; testes ao lado). Registro: `src/tools/models/catalog/kits.ts`, família "Kits de montar".

Regras dos dois: nenhum traço menor que `2n` (testado com 0,2, 0,4 e 0,6); cantos de fenda com a folga da base; peças planas no cartão com galhos,
pontos de corte e números (base); o "Montado" é só prévia. A conferência de pares (`checkAssembly`) passa: sem colisão, com as folgas declaradas.

## 1. Bicho de 4 patas (fatias encaixadas)

Parâmetros: comprimento do corpo `L` (50 a 120, padrão 80), fatias `N` (2 a 6, padrão 4), cabeça (cachorro, gato, dinossauro), cauda (curta, longa, erguida),
seção das fatias (oval ou quase retangular). Corpo `H = 0,40 L`, largura `W = 0,36 L`, pernas `P = 0,28 L`, largura da perna `max(6, 0,1 L)`.
O cartão limita as fatias pelo comprimento (6 até 90 mm, 5 até 110, 4 acima): se pedir mais, o kit usa as que cabem e avisa.

| Peça | Forma |
|------|-------|
| Coluna | perfil lateral: cápsula `L × H`, bloco do pescoço (frente) e de apoio da cauda (atrás) com um soquete de rabo de andorinha cada, e uma fenda por fatia aberta por baixo (profundidade `H/2`) |
| Fatia de perna (2, a 18% e 82% de `L`) | seção do corpo + duas pernas que entram na seção; fenda por cima, profundidade `H/2` |
| Fatia de corpo (`N − 2`, igualmente espaçadas) | só a seção do corpo, mesma fenda |
| Cabeça | perfil de lado do tipo escolhido, com a espiga de rabo de andorinha para baixo |
| Cauda | barra afilada com a mesma espiga |

Encaixes: meia-fenda coluna × fatia (largura `s`, cada uma metade da altura de encontro); rabo de andorinha da cabeça e da cauda (a espiga é 0,15 menor por lado, desce de cima).
Montagem: vire a coluna de cabeça para baixo, encaixe as fatias (as das pontas são as de perna), desvire e desça a cabeça e a cauda.
"Silhueta da pessoa" como opção: segue pelo Kit card por imagem (modo figura), que já faz a coluna a partir da imagem; fica fora desta versão.

## 2. Baú (caixa com tampa de dobradiça de pino)

Medidas de dentro: largura × profundidade × altura. Pequeno 44×30×22, médio 56×38×26 (padrão), grande 64×42×28; limites 36–68, 26–46 e 18–32
(o que cabe no maior cartão, 240×160). Pino 3 mm (ou 4 mm para bico de 0,6 ou mais). Tampa com `max(14, 0,32 H)` de altura.

| Peça | Observação |
|------|------------|
| Frente e fundo (2 iguais) | ficam entre as laterais; abas nas bordas verticais atravessam as laterais; fendas para as abas do piso |
| Lateral (2 iguais) | fendas para as abas da frente e do fundo e do piso; orelha atrás com o furo do pino (o eixo fica 2 mm atrás do fundo, a `r + 3,2 + 0,5` mm abaixo da borda) |
| Piso | abas nos 4 lados, a 2 mm da borda de baixo |
| Topo da tampa | abas para as laterais e a frente da tampa, recuado 2 mm da borda |
| Frente da tampa, laterais da tampa (2) | a tampa abraça a caixa com folga 0,3; a lateral da tampa também tem a orelha com o furo |
| Pino (2) | disco de cabeça (⌀ pino + 4,4) com o pino em pé; comprimento `2t + 0,3 + 0,6` |

A tampa não tem parede de trás: o eixo fica atrás do fundo da caixa, então a tampa gira para trás sem encostar (testado de 0° a 100° em vista lateral).
Montagem: encaixe a frente e o fundo nas laterais e ponha o piso; monte a tampa de cabeça para baixo (frente e laterais no topo); pouse a tampa,
alinhe os furos atrás e empurre um pino de cada lado.

## 3. Pendências

- O cartão é o limite do tamanho (as paredes são largas e a arrumação é em fileiras): pedimos à base girar peças, `group` e/ou redução automática.
- Legenda do montado mostra o id da peça (`fatiaPerna#1`) em vez do rótulo.
