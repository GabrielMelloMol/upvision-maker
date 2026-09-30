# Voz e textos do UpVision Maker (#143)

O app fala como uma colega de ateliê que entende de impressão 3D: direta, calma, sem pressa de impressionar.
Este guia vale para título, subtítulo, botão, aviso, erro, dica e ajuda.

## Regras

1. **Você.** Nunca "o usuário", nunca "tu".
2. **Verbo no imperativo curto** nos botões e passos: *Salvar 3MF*, *Escolher do catálogo*, *Arraste a imagem*.
3. **Uma ideia por frase.** Subtítulo de tela com **no máximo 1 linha** (cerca de 60 caracteres); o resto vai para o **?**.
4. **Sem exclamação**, sem "incrível", sem "poderoso", sem "facilmente".
5. **Sem cara de IA:** nada de três adjetivos em fila ("rápido, fácil e seguro"), frases genéricas ("tudo o que você precisa") ou emoji como ícone.
6. **Termo técnico com explicação.** Relevo, folga, markup, margem, ROAS etc. têm o ⓘ do glossário (`src/help/glossary.ts`); não explique de novo em cada tela.
7. **Número com unidade** e no formato brasileiro: *0,4 mm*, *R$ 12,90*, *3h20*.
8. **Erro diz o que houve e o que fazer:** *A imagem tem mais de 20 MB. Reduza e tente de novo.* Nada de "Ocorreu um erro".
9. **Aviso não assusta:** diga a consequência e a saída (*Passa da mesa de 256 mm: diminua ou divida em peças*).
10. **Confirmação destrutiva com verbo e objeto:** *Excluir pedido*, nunca só *Sim* ou *OK*.

## Nomes padronizados

| Use | Não use |
|---|---|
| Salvar 3MF | Exportar, Baixar 3MF, Gerar arquivo |
| Salvar STL | Exportar STL |
| Opções avançadas | Mais opções, Configurações avançadas |
| Usar exemplo | Carregar demonstração |
| Filamento | Material (quando é o rolo) |
| Mesa | Placa de impressão, cama |
| Caixinha (organizador) | Módulo, bin |

## Subtítulos das telas

| Tela | Subtítulo |
|---|---|
| Imagem → SVG | Logo ou desenho vira SVG de 1 a 4 cores, em mm. |
| Cortador de biscoito | O contorno vira lâmina; o desenho de dentro, carimbo. |
| Chaveiros | Nome e logo em 2 cores, pronto para o AMS. |
| Medalhas | Formato, textos em arco, imagem e alça, em cores. |
| Extrusão 3D | Dá altura a qualquer desenho, com base se quiser. |
| QR Code e Pix | Pix, link ou Wi-Fi em SVG ou 3MF de 2 cores. |
| Modelos prontos | Escolha, ajuste o texto e salve o 3MF em cores. |
| Etiquetas de rolo | Um QR por rolo para dar baixa pela câmera. |
| Litofania e quadro | Foto em relevo: litofania ou quadro por camadas. |
| Pixel art | Imagem em pixels nas cores dos seus filamentos. |
| Organizador de gaveta | Meça a gaveta, desenhe as caixinhas e imprima. |
| Separar 3MF por cor | 3MF pintado vira uma peça sólida por cor. |
| OpenSCAD personalizável | Arquivo .scad do Customizer vira formulário e 3MF. |
| Buscar modelos | Busque nos principais sites de modelos. |
| Pedir à IA | Descreva a peça e o Claude modela em 3D. |
