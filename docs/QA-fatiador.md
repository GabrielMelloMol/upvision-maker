# QA no fatiador (#90) — rodada da v0.10.2

Validação de **todos os Modelos prontos e ferramentas** fatiando de verdade o que o app exporta, em 2026-10-02,
sobre a v0.10.2. A tabela completa, caso a caso, está em [QA-modelos.md](QA-modelos.md) (gerada pelo script).

## Como repetir

```sh
brew install --cask orcaslicer          # uma vez; o Bambu Studio já fica em /Applications
scripts/validate-models --jobs 4        # tudo (~15–40 min, conforme a carga da máquina)
scripts/validate-models --ids keychain,nfc --jobs 4   # só alguns
```

O script gera cada caso (padrão, todos os campos no mínimo, todos no máximo, e variantes das ferramentas), confere a
geometria e fatia em três caminhos, com perfil Bambu Lab A1 0.4 + 0.20mm Standard + Bambu PLA Basic e **um filamento
por cor, cada um com a sua cor**:

| Caminho | O que é | Pausa |
|---|---|---|
| **Bambu** | Bambu Studio CLI 02.08.02.61 com o 3MF do app | `--load-custom-gcodes`, como o botão do app |
| **Orca** | OrcaSlicer CLI 2.4.2 com o 3MF do app | lida do próprio 3MF |
| **Projeto Bambu** | botão "Projeto do Bambu Studio": o CLI exporta o projeto, o app troca as cores, e o projeto é fatiado | já no projeto |

Em cada caminho: fatiou, gramas > 0, **cada cor com filamento gasto no G-code** (a parte saiu na extrusora certa),
pausas `M400 U1` no Z pedido. Peça maior que a mesa do A1 com o aviso do app na tela conta como aviso.
Os testes de unidade do script estão em `src/qa/report.test.ts` (leitura do G-code) e rodam na suíte normal.

## Resultado

**75 modelos/ferramentas, 228 casos: 175 ok · 52 com aviso · 1 com falha.** 195 casos passaram nos três
caminhos e 32 (uma cor, sem pausa) em Bambu e Orca. 16 casos com pausa: todas no Z certo nos três caminhos.

Os 52 avisos são, em ordem de quantidade:
- peça ou conjunto maior que a mesa de 256 mm nos valores máximos, que o app já avisa na tela;
- **torre de purga** no CLI (21 casos com 2+ cores): veja "Limites dos fatiadores" abaixo;
- conjunto que ocupa mais de uma placa (gaveta, talheres, Gridfinity, luminária, letra LED) ou passa de 24 h;
- traço/cor mais fino que a linha do bico no mínimo, com o aviso do app (medalha, troféu, placa QR, cortador em grade, separar por cor).

A falha que sobra é **Letras para parede no máximo** (-52): o `--arrange` do CLI não acomoda 80+ peças grandes num 3MF
só; cada peça fatia sozinha. Já analisada na #132.

## O que falhava e foi corrigido

1. **"Projeto do Bambu Studio" com 2+ cores não fatiava** (`Failed slicing the model`, código -100). O CLI exporta o
   projeto com 1 cor e a matriz de purga 4×4 do perfil; o app trocava só `filament_colour` para N cores e o projeto
   ficava inconsistente. Correção em `withFilamentColors` (src/geometry/bambuProject.ts): a matriz de purga vira N×N e
   o `filament_map` ganha N entradas. Teste em `bambuProject.test.ts`; os 196 casos com projeto agora fatiam.
2. **Separar 3MF por cor com profundidade < 0,4 mm**: a cor pintada nas laterais virava parede de 0,2 mm e sumia no
   fatiador sem aviso (cor 3 do cubo de teste com 0 g nos três fatiadores). Agora o app avisa (src/geometry/colorSplit.ts).
   O mínimo de 0,2 mm continua: pintura em cima com 0,2 mm é uma camada e imprime.
3. **Cortador em grade no mínimo**: o texto das abas encolhia até ~1 mm e a cor do texto não saía no G-code, sem
   aviso. Agora usa o mesmo aviso de traço fino da medalha/troféu (`thinLineWarning`, src/geometry/models/gridCutter.ts).
4. **A varredura não conferia as cores**: fatiava com um filamento só (a nota antiga falava de queda 139 do CLI com 2+
   filamentos). O que acontecia: com filamentos iguais o CLI junta todos no filamento 1. Com uma cor por filamento os
   dois CLIs leem a extrusora de cada parte do 3MF simples, e a varredura passou a conferir cor por cor.
5. **OrcaSlicer** entrou na varredura (antes "não instalado"). Confirmado: o Orca lê a pausa do 3MF do app sozinho.

## Limites dos fatiadores (não são defeito dos modelos)

- **Torre de purga no CLI** (2+ cores): o `--arrange` dos dois CLIs só reserva espaço para a torre quando os filamentos
  vêm por objeto (STL com `--load-filament-ids`); com 3MF e mesa cheia a torre cai em cima de uma peça (-101). E na
  posição padrão do CLI (y = 220) a torre passa da mesa quando a camada pede 2 trocas de cor, como no Totem NFC e no
  Chaveiro de profissão no mínimo, com camada de 0,08 mm (-104 no Bambu, -102 no Orca). O próprio CLI diz que é mais
  conservador que a tela; na tela, Arrumar reserva a torre e dá para arrastá-la. Conta como aviso.
- **Bambu 02.08**: placa que só usa o filamento 2 sai com o peso vazio no cabeçalho do G-code; a varredura lê a linha
  `; filament:` e o total do `result.json`.
- **Orca** grava o G-code das placas boas mesmo quando uma placa falha; a varredura olha o código de saída.

## Pendente / decisões para o Gabriel

- **Torre de purga no "Projeto do Bambu Studio"** (padrão adotado: só registrar). O projeto sai com as peças arrumadas
  pelo CLI, sem lugar para a torre: em conjuntos de mesa cheia com 2+ cores (gaveta, talheres, quebra-cabeça no máximo),
  quem abre o projeto precisa arrastar a torre ou usar Arrumar antes de fatiar. Dá para o app reservar a torre
  (posição `wipe_tower_x/y` no projeto) se isso aparecer na prática.
- Validação só por CLI: o comportamento da **tela** do Bambu Studio/Orca (Arrumar, torre, abrir 3MF de terceiros) não
  foi conferido aqui. **PrusaSlicer** não está na varredura.
