# Biblioteca de kit cards: Foguete e Trator (projeto no papel)

Segue as regras comuns de `kitcard-aviao-helicoptero.md` (`t` = 1,6 mm, fenda = `t + fit`, janela = aba + `fit`, furo de pino = pino + `pinFit`
por pressão ou `spin` para girar) e a API de `docs/kits/API.md`. Todas as medidas saem de poucos parâmetros e do fator `scale`, então o
modelo escala sem refazer o desenho. Eixos do montado: `x` para a frente, `y` para a esquerda, `z` para cima.

## 1. Foguete (estágios encaixados)

Altura `H` = 140 mm (80 a 145; acima de 145 o app limita e avisa: é o que cabe no maior cartão). Corpo de meia-largura `w0` = 0,09 H (12,6). Cada estágio é um **par de placas em cruz** (uma no plano XZ,
outra no YZ, meia-fenda: a de uma fenda vem de cima, a da outra de baixo, cada uma até a metade do estágio), então cada estágio é
auto-travado e as peças saem inteiras. Os estágios se empilham por **abas** que entram em **encaixes** na borda da peça de cima.

| Nº | Peça | Qtd | Plano | Medidas (H = 140) | Encaixes |
|---|---|---|---|---|---|
| 1 | **Base de lançamento** | 1 | XY | disco com raio `w0 + aleta + 5` e dois rasgos em cruz de `t + fit` × `2 × bocal + fit` | recebe as abas de baixo dos dois lados do estágio 1 |
| 2, 3 | **Estágio 1 (A, B)** | 1+1 | XZ, YZ | de z = 0 a 0,40 H (56): aba de bocal com altura `t`, sino do motor (de 0,72 w0 a w0 em 0,07 H), corpo reto; **aletas** nas duas placas (4 aletas), envergadura `aleta` = 90% de w0, corda 0,32 H, enflechadas | meia-fenda A × B; 2 abas no topo (a ±0,45 w0) |
| 4, 5 | **Estágio 2 (A, B)** | 1+1 | XZ, YZ | de 0,40 H a 0,68 H (39), corpo reto, **janelinhas** redondas opcionais (raio 0,17 w0) | meia-fenda A × B; 2 encaixes embaixo, 2 abas no topo |
| 6, 7 | **Bico (A, B)** | 1+1 | XZ, YZ | de 0,68 H a H (45), ogiva elíptica que termina em 2,5 mm de meia-largura (ponta cega: a fenda deixa pernas de pelo menos 1,6 mm) | meia-fenda A × B; 2 encaixes embaixo |

Total: 7 peças soltas. Cada estágio tem cor própria (Estágio 1, Estágio 2, Bico) e as aletas outra.

Medidas que se calculam: profundidade da fenda de cada placa = metade da altura do estágio (+ 0,5 mm, as duas fendas se sobrepõem 1 mm no
meio), com o mínimo de 8 mm de peça inteira. Aba: largura `max(3, 0,25 w0)`, altura `max(5, 0,05 H)`, no estágio de baixo; o encaixe da peça de cima é a
aba + `fit` por lado. O bocal sai com meia-largura 0,60 w0 (menor que o sino) para o ombro do sino apoiar na base.

Montagem: (1) destacar e lixar; (2) em cada estágio, A e B se cruzam pelas fendas; (3) estágio 2 sobre o 1 (as abas entram nos encaixes), o bico
sobre o 2; (4) o foguete pelo bocal na base de lançamento.

## 2. Trator (rodas grandes atrás, cabine)

Comprimento `L` = 90 mm (60 a 90; acima disso o app limita e avisa, pelo mesmo motivo). As medidas abaixo estão em "u" = L / 100. Duas **laterais** idênticas (XZ) ligadas por travessas que entram em janelas: o conjunto é fechado só
por abas e janelas. As rodas têm pino que entra no furo da lateral (pressão, ou giram com folga `spin`).

| Peça | Qtd | Plano | Medidas (L = 100) | Encaixes |
|---|---|---|---|---|
| **Lateral** | 2 | XZ | longarina de 14 a 24 mm de altura, cabine alta (x 18–52, até z = 52) com janela vazada, capô (x 52–97 até z = 34), bossas nos eixos | janelas das travessas (6 por lado); furo do eixo traseiro (22, 22) e dianteiro (84, 12) |
| **Piso** | 1 | XY | x 31–50, entre as laterais (largura interna 34) | 2 abas por lado |
| **Banco (encosto)** | 1 | YZ | x = 28, de z = 22 a 44 | 2 abas por lado |
| **Para-brisa** | 1 | YZ | x = 50, de z = 20 a 47 | 2 abas por lado |
| **Teto** | 1 | XY | x 20–50, z = 48 | 2 abas por lado |
| **Capô** | 1 | XY | x 52–97, z = 28; furo para o escapamento | 2 abas por lado |
| **Escapamento** | 1 | XZ | 5 × 14 | aba entra no furo do capô |
| **Roda de trás** | 2 | disco | raio 0,22 L (22), com garras na borda (12 por padrão) | pino Ø 4 no furo da lateral |
| **Roda da frente** | 2 | disco | raio 0,12 L (12) | pino Ø 4 no furo da lateral |

Total: 11 peças numeradas (8 modelos). As rodas ficam 0,5 mm afastadas da lateral para girar. Montagem: (1) rodas no furo das laterais, de fora
para dentro; (2) laterais de pé, travessas pelas janelas na ordem piso, encosto, para-brisa, capô, teto; (3) escapamento no furo do capô.

## 3. Conferências (testes)

- Montado sem colisão fora dos pares declarados, com folga dos pares dentro de `fit` (+ 0,08).
- Cada peça é um sólido só, presa à moldura por 2 ou mais pontos de corte, cartão cabe na mesa.
- Muda `scale`, `thickness` e `fit`: continua sem colisão.
