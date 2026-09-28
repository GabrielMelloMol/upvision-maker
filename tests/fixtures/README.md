# Imagens de referência (testes de regressão)

- `logo.jpg`, `desenho.jpg`: geradas para este projeto (script em Python/PIL), sem direitos de terceiros.
- `foto-pessoa.jpg`: retrato oficial de Sally Ride, NASA, 1984 (S84-37256). **Domínio público** (obra do governo dos EUA). Fonte: https://commons.wikimedia.org/wiki/File:Sally_Ride_(1984).jpg — reduzida para 640×800.
- `foto-pessoa.seg.gz`: máscara (1 = pessoa, 960×1200, gzip) que o MediaPipe Selfie Segmenter gera no app para `foto-pessoa.jpg` reamostrada. Usada no teste do modo Silhueta, já que o MediaPipe não roda no Node.
