# Biblioteca de kit cards: Avião e Helicóptero (projeto no papel)

Pedido do Gabriel: em vez de gerar o kit card de qualquer imagem, uma **biblioteca de kit cards projetados e personalizáveis**. A Forja faz a base comum (`KitTemplate`); este documento projeta os dois primeiros modelos (avião e helicóptero) antes de implementar, como o Engineer3D faz: lista de peças, medidas, encaixes e ordem de montagem. Todas as medidas saem de poucos parâmetros, então o modelo escala sem refazer o desenho.

## 1. Regras comuns

| Parâmetro | Padrão | Faixa | Para que serve |
|---|---|---|---|
| `L` | 110 mm | 70 a 160 | comprimento total do modelo montado; toda medida abaixo é uma fração de `L` |
| `t` | 1,6 mm | 1,2 a 2 | espessura de todas as placas (um filete de 0,4 mm × 4) |
| `fit` | 0,2 mm | 0 a 0,5 | folga somada à espessura nas fendas e janelas: **fenda = t + fit** (1,8 mm) |
| `spin` | 0,3 mm | 0,2 a 0,5 | folga do furo de peça que gira (hélice, rotores): furo = pino + spin |
| `press` | 0,15 mm | 0,1 a 0,25 | folga do furo de encaixe por pressão (rodas, trava): furo = pino + press |
| `pin` | 3,0 mm | 2,4 a 4 | diâmetro dos pinos (no mínimo 6 × o bico para não quebrar) |

Os três jeitos de encaixar (os mesmos do modo figura e do modo veículo do Kit card de hoje):

- **Meia a meia (cruzado):** duas placas que se cruzam, cada uma com uma fenda até o meio, uma aberta por cima e a outra por baixo. A largura da fenda é `t + fit`.
- **Lingueta e janela:** uma lingueta de largura `w` entra numa janela de `w + fit` × `t + fit` na placa vizinha. A janela é `fit` maior que a lingueta nas duas medidas, então encaixa sem forçar, com folga de 0,1 mm por lado.
- **Pino e furo:** o pino é cilindro de diâmetro `pin` impresso em pé (eixo ao longo do Z do cartão), com o disco (cubo) da peça que gira. Peça que gira: furo de `pin + spin`, presa por uma **trava** (disco de Ø 3 × `pin` com furo de `pin − 0,1`, apertado na ponta do pino). Peça fixa (roda): furo de `pin + press`, sem trava.

Cada peça sai **inteira** (um sólido só), presa ao galho do cartão por 2 ou mais pontos de corte, com o **número gravado no próprio galho** dela. Peças pequenas (pinos, travas) vão juntas num galho próprio.

Convenções de eixo no modelo montado: `x` para a frente (nariz), `y` para a esquerda, `z` para cima. "Plano XZ" é uma placa vertical no sentido do voo; "plano YZ", vertical atravessada; "plano XY", horizontal.

## 2. Avião (monoplano de asa baixa, com hélice)

Comprimento `L` = 110 mm; envergadura 0,95 L = 104 mm.

### 2.1 Lista de peças (12)

| Nº | Peça | Qtd | Plano | Medidas (em `L` = 110) | Encaixes |
|---|---|---|---|---|---|
| 1 | **Fuselagem** | 1 | XZ | perfil de lado: comprimento L, altura 0,20 L no meio (22), nariz arredondado, cauda subindo até a **deriva** (leme vertical) de 0,17 L (19) de altura | 3 fendas por cima (cruzado com os cavernames), 2 línguetas embaixo (asa), 1 fenda horizontal aberta por trás (estabilizador); o pino da hélice não fica nela, fica no cavername do nariz |
| 2 | **Cavername do nariz** | 1 | YZ | oval 0,17 L × 0,19 L (19 × 21), no x = +0,36 L | fenda por baixo (cruzado com a fuselagem); **furo do pino da hélice** Ø pin + spin no centro |
| 3 | **Cavername da cabine** | 1 | YZ | oval 0,20 L × 0,21 L (22 × 23), em x = +0,06 L | fenda por baixo |
| 4 | **Cavername da cauda** | 1 | YZ | oval 0,10 L × 0,12 L (11 × 13), em x = −0,28 L | fenda por baixo |
| 5 | **Asa** | 1 | XY | envergadura 0,95 L (104), corda na raiz 0,24 L (26), na ponta 0,13 L (14), enflechamento 0,06 L, espessura t | 2 janelas no centro (as das línguetas da fuselagem), 2 fendas curtas para as pernas do trem em y = ±0,16 L |
| 6 | **Estabilizador horizontal** | 1 | XY | envergadura 0,36 L (40), corda 0,14 L (15) na raiz e 0,08 L (9) na ponta | passa inteiro pela fenda horizontal da deriva (sem fenda própria) |
| 7, 8 | **Perna do trem** | 2 | XZ | altura 0,13 L (14), largura 0,07 L (8), inclinada 10° para fora; lingueta de 8 mm no topo | lingueta na fenda da asa; furo do eixo da roda (Ø pin + press) |
| 9, 10 | **Roda** | 2 | disco | Ø 0,10 L (11), espessura t, cubo + pino de comprimento `t + t + 1` | pino no furo da perna (pressão) |
| 11 | **Hélice** | 1 | disco (YZ montada) | duas pás de 0,48 L (53) de ponta a ponta, largura 0,07 L (8) afinando para as pontas; cubo Ø 0,07 L (8) | pino do cubo atravessa o cavername do nariz (gira) |
| 12 | **Trava** | 1 | disco | Ø 8 × t, furo `pin − 0,1` | aperta na ponta do pino da hélice, atrás do cavername |
| – | **Patim de cauda** | (da fuselagem) | | ponta de 6 mm da própria fuselagem, abaixo da deriva | não é peça separada |

Total: 12 peças soltas no cartão, cada uma com seu galho e número. O patim de cauda faz parte da fuselagem.

### 2.2 Medidas que se calculam (com `L`, `t`, `fit`)

- Fenda dos cavernames: `slot = t + fit`. Na fuselagem, cada fenda vem de cima até **a metade da altura** do perfil naquela posição; no cavername, de baixo até a metade da altura dele.
- Línguetas da asa: 2 de 0,06 L de largura (7), 0,10 L de distância entre os centros (11) e comprimento `t + 1,0` abaixo da barriga; janelas da asa = `0,06 L + fit` × `t + fit`.
- Fenda do estabilizador: altura `t + fit`, aberta pela borda de trás da deriva, comprimento = corda da raiz + fit (15,2), na altura 0,72 da deriva; o estabilizador para na ponta da fenda (a borda de ataque da raiz encosta).
- Eixo da roda: a 0,05 L (5,5) acima do fundo da perna; raio da roda = 0,05 L, então a roda encosta no chão 0,5 mm abaixo da ponta da perna.
- Pino da hélice: comprimento = `t` (cubo) `+ t` (cavername) `+ t` (trava) `+ 1,0` (folga e ponta). Fica 1 mm de folga entre cubo e cavername para a hélice girar.

### 2.3 Ordem de montagem

1. Destacar as peças dobrando os pontos de corte e lixar os restos.
2. Fuselagem em pé na mesa; descer os **cavernames 2, 3 e 4** pelas fendas de cima (o cavername entra "de baixo para cima" no sentido da fenda dele: virado de cabeça para baixo, desce até o meio e gira, como as costelas do modo figura).
3. Empurrar as duas línguetas da fuselagem pelas janelas da **asa** (a asa fica sob a fuselagem).
4. Passar o **estabilizador** de trás para a frente pela fenda da deriva até parar.
5. Encaixar as **pernas do trem** nas fendas da asa e apertar as **rodas** no furo de cada perna, de fora para dentro.
6. **Hélice:** pino pelo furo do cavername do nariz, de frente para trás; apertar a **trava** na ponta.

## 3. Helicóptero (cabine com janelas, rotor e rotor de cauda que giram)

Comprimento total `L` = 110 mm (cabine 0,42 L = 46, cauda 0,50 L = 55); largura da cabine 0,22 L = 24 mm, altura 0,26 L = 29 mm.

### 3.1 Lista de peças (14)

| Nº | Peça | Qtd | Plano | Medidas (em `L` = 110) | Encaixes |
|---|---|---|---|---|---|
| 1, 2 | **Lateral** | 2 | XZ | perfil da cabine: comprimento 0,42 L (46), altura 0,26 L (29), nariz inclinado (para-brisa a 60°); **duas janelas vazadas** (a do para-brisa 0,16 L × 0,12 L e a lateral 0,12 L × 0,12 L, com cantos arredondados de 2 mm; montantes de pelo menos 3 mm entre vazados) | 2 línguetas embaixo (piso), 2 línguetas em cima (teto), 2 fendas cruzadas com os anteparos |
| 3 | **Piso** | 1 | XY | 0,42 L × 0,22 L (46 × 24), cantos de 3 mm | 4 janelas (línguetas das laterais) e 4 janelas dos esquis (fendas de `t + fit` × 0,05 L) |
| 4 | **Teto** | 1 | XY | 0,40 L × 0,22 L (44 × 24), cantos de 3 mm | 4 janelas (línguetas das laterais); **furo do mastro** Ø pin + spin no centro |
| 5 | **Anteparo da frente** | 1 | YZ | altura da cabine na posição (22), largura 0,22 L − 2t (21) | cruzado com as laterais (fenda por baixo) |
| 6 | **Anteparo de trás** | 1 | YZ | altura 0,22 L (24), largura 21 | cruzado com as laterais; **janela da cauda** vertical de `t + fit` × 0,07 L, no centro |
| 7 | **Cauda** | 1 | XZ | lança de 0,50 L (55): altura 0,08 L (9) na raiz e 0,15 L (16) na **deriva** do fim, perfil afinando | lingueta na raiz entra na janela do anteparo de trás; furo do eixo do rotor de cauda perto do fim |
| 8 | **Rotor principal** | 1 | disco (XY montada) | 2 pás de 0,86 L (95) de ponta a ponta, largura 0,06 L (6,6), cubo Ø 0,09 L (10); **ou 4 pás** (opção) | pino do cubo pelo furo do teto (gira) |
| 9 | **Rotor de cauda** | 1 | disco (XZ montada) | 2 pás de 0,16 L (18), largura 0,03 L (3,3), cubo Ø 0,05 L (5,5) | pino do cubo pelo furo da cauda (gira) |
| 10, 11 | **Esqui** | 2 | XZ | comprimento 0,50 L (55), duas escoras de 0,09 L (10) de altura com línguetas em cima, ponta frontal curvada para cima | línguetas nas janelas dos esquis do piso |
| 12 | **Trava do rotor** | 1 | disco | Ø 8 × t | na ponta do pino do rotor, por baixo do teto |
| 13 | **Trava do rotor de cauda** | 1 | disco | Ø 6 × t | na ponta do pino da cauda |
| 14 | **Janelas** (opcional) | | | vazadas na lateral | quando a cor das janelas for outra, vira peça separada (transparente) |

Total: 13 peças com galho e número (a 14 só existe se a pessoa pedir janelas em outra cor).

### 3.2 Medidas que se calculam

- Distância entre as laterais: `d = 0,22 L − t` (22,4); as laterais ficam em y = ±`d/2`.
- Línguetas das laterais: 2 em cima e 2 embaixo, de 0,08 L (9) de largura e comprimento `t + 0,5`; janelas do piso e do teto de `0,08 L + fit` × `t + fit`.
- Esquis: escoras nos mesmos x das línguetas do piso (±0,14 L do centro); as janelas dos esquis ficam em y = ±`d/2 + 0,05 L`, fora das laterais.
- Pino do rotor principal: comprimento = `t` (cubo) `+ t` (teto) `+ t` (trava) `+ 1,0` (folga). O rotor fica 1 mm acima do teto.
- Pino do rotor de cauda: igual, atravessando a cauda de fora para dentro.
- Anteparos entram nas fendas das laterais: fenda lateral por cima até a metade da altura, fenda do anteparo por baixo.

### 3.3 Ordem de montagem

1. Destacar as peças, lixar os restos.
2. **Rotor principal:** pino pelo furo do **teto**, de cima para baixo, e apertar a **trava** por baixo (antes de fechar a cabine).
3. **Piso** deitado: encaixar as **laterais** pelas línguetas de baixo.
4. Descer os **anteparos** (frente e trás) nas fendas das laterais.
5. Fechar a cabine com o **teto** (línguetas de cima nas janelas do teto; o rotor já está nele).
6. **Cauda:** lingueta pela janela do anteparo de trás; **rotor de cauda** com o pino de fora para dentro e a **trava**.
7. **Esquis:** línguetas nas janelas do piso, por baixo.

## 4. O que a base `KitTemplate` precisa oferecer (pedido à Forja)

1. **Peças planas com polígonos arbitrários e furos** (`CrossSection` por peça), com número, nome e cor; a base cuida de arrumar no cartão, dos galhos e dos pontos de corte (o que já faz hoje).
2. **Peças com pino** (disco + cilindro, como as rodas do veículo): `body`, `pinR`, `pinLen`, e o pino sai em pé no cartão.
3. **Peça pequena sem galho dedicado** (trava, pino) que a base junta num galho comum.
4. **Montagem 3D por transformação:** cada peça diz onde fica no modelo montado como matriz (rotação + translação) a partir do plano em que foi impressa (XY → XZ ou YZ). A prévia monta com isso, sem lógica própria por modelo.
5. **Pares intencionais:** uma lista de pares (pino × furo, lingueta × janela, fenda × fenda) que o teste de colisão deve ignorar mas cuja folga confere (`≤ fit`, `≤ spin`, `≤ press`).
6. **Parâmetros do modelo** declarados com faixa e rótulo (como os `num` dos Modelos prontos): `L`, `t`, `fit`, `spin`, `press`, número de pás, estilo da janela, cores por grupo de peças.
7. **Verificações da bateria** (`kitBattery`) aplicáveis a qualquer template: peças inteiras, presas à moldura, sem sobreposição, cartão na mesa, montado sem colisão, folgas dos pares e número junto de cada peça.
8. **Avisos** próprios do modelo (peça mais fina que o bico, montante de janela fino demais, cartão pequeno para `L`).

## 5. Tamanho no cartão (conferir na implementação)

- Avião: maior peça é a asa (104 × 26) e depois a fuselagem (110 × 22); cabem em 3 fileiras num cartão **grande** (180 × 120). Num cartão médio (120 × 85), `L` cai para uns 75 mm.
- Helicóptero: maior peça é o rotor principal (95 × 7) e a cauda (55 × 16); cabem em 3 fileiras no cartão grande.

## 6. Riscos e decisões

- **Montantes e pás finas:** pá de 3,3 mm (rotor de cauda) tem 8 filetes de bico 0,4: ok; abaixo de `L` = 80 as pás do rotor de cauda ficam com menos de 2,4 mm e o aviso de peça fina deve aparecer.
- **Janelas da cabine:** montante mínimo de 3 mm; abaixo disso a base avisa e a janela encolhe.
- **Hélice e rotores girando:** pino e furo com 0,3 mm de folga, trava de pressão; testar impresso na A1 (peça de teste do pino antes do cartão inteiro).
- **Asa baixa presa só pelas línguetas:** é frágil em `t` = 1,2; sugerir 1,6 mm ou mais e cola, e aviso quando `t` < 1,6.
- Decisão em aberto para o Gabriel: **asa baixa** (como projetado) ou **asa alta** com cabine passando por dentro de uma janela; a baixa é mais simples de imprimir e de montar.
