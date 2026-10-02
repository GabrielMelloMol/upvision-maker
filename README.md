# UpVision Maker

App gratuito para Mac e Windows para quem vende impressão 3D: calculadora de preço, estoque de filamentos, pedidos, financeiro e ferramentas para criar peças. Seus dados ficam só no seu computador.

## Baixar e instalar

Abra a página da **[versão mais recente](https://github.com/GabrielMelloMol/upvision-maker/releases/latest)** e, em **Assets**, baixe o arquivo do seu sistema.

### Mac

1. Baixe o arquivo que termina em **`.dmg`**. Ele funciona em qualquer Mac, com chip Apple ou Intel.
2. Abra o `.dmg` e arraste o **UpVision Maker** para a pasta **Aplicativos**.
3. Abra o app. Na primeira vez, o Mac avisa que não consegue verificar o desenvolvedor. Clique em **OK** e:
   - vá em **Ajustes do Sistema → Privacidade e Segurança**;
   - role até o fim e clique em **Abrir Mesmo Assim** ao lado de "UpVision Maker";
   - confirme com a sua senha.

Esse aviso só aparece na primeira vez. Se o Mac disser que o app **"está danificado"**, abra o **Terminal**, cole o comando abaixo e aperte Enter:

```
xattr -dr com.apple.quarantine "/Applications/UpVision Maker.app"
```

### Windows

1. Baixe o arquivo que termina em **`-setup.exe`**.
2. Abra o arquivo. Se aparecer **"O Windows protegeu o computador"**, clique em **Mais informações → Executar assim mesmo**.
3. Siga o instalador. O app aparece no menu Iniciar.

Esse aviso aparece porque o app ainda não tem certificado pago, não porque haja algo de errado com ele.

## Atualizações

Você só instala uma vez. Depois disso o app se atualiza sozinho:

- quando sai uma versão nova, aparece um aviso dentro do app. Clique em **Atualizar agora** e ele baixa, instala e reabre;
- para conferir na hora, clique no **número da versão no rodapé** e depois em **Verificar atualizações**;
- seus produtos, pedidos, filamentos e preferências continuam do jeito que estavam.

---

[Para desenvolvedores](docs/DESENVOLVIMENTO.md) · [Licenças de terceiros](docs/LICENCAS.md)
