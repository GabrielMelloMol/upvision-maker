# Worker de sugestões (#83)

Recebe o "Sugerir ferramenta" e o diagnóstico do app e repassa para você. Nada fica guardado no Worker além dos contadores do limite de envio (5 por hora por instalação, 30 por dia por IP). Tudo cabe no plano gratuito da Cloudflare e do Resend.

Você escolhe como receber: **e-mail** (Resend, com a imagem anexada), **issue num repositório privado** do GitHub, ou os dois.

Enquanto o Worker não existir, o app já funciona com **WhatsApp** (se o número estiver configurado) e **Copiar texto**.

## Passo a passo (uma vez só, ~20 minutos)

Precisa do Node instalado. Rode os comandos nesta pasta (`services/feedback-worker`).

1. **Conta na Cloudflare** (grátis): crie em https://dash.cloudflare.com/sign-up.
2. **Entrar pelo terminal:**
   ```sh
   npm install
   npx wrangler login
   ```
3. **Criar o KV dos contadores:**
   ```sh
   npx wrangler kv namespace create RATE
   ```
   Copie o `id` que aparecer para o lugar de `COLE_AQUI_O_ID_DO_KV` no `wrangler.toml`.
4. **Inventar o token do app** (uma senha longa qualquer). Exemplo para gerar uma:
   ```sh
   node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
   ```
   Guarde o valor: ele vai no Worker (passo 5) e no GitHub Actions do app (passo 8).
5. **Guardar o token no Worker:**
   ```sh
   npx wrangler secret put APP_TOKEN
   ```
6. **Escolher como receber** (pode ser os dois):
   - **E-mail pelo Resend:** crie conta em https://resend.com e uma API key. Para mandar de um endereço seu, verifique o domínio no Resend. Sem domínio próprio, use `onboarding@resend.dev` como remetente: ele só entrega para o e-mail da sua conta do Resend. Depois:
     ```sh
     npx wrangler secret put RESEND_API_KEY
     ```
     e preencha `FEEDBACK_TO` (seu e-mail) e `FEEDBACK_FROM` (ex.: `UpVision <onboarding@resend.dev>`) no `wrangler.toml`.
   - **Issue privada no GitHub:** crie um repositório **privado** (ex.: `upvision-suporte`). Crie um token fine-grained em GitHub → Settings → Developer settings, só para esse repositório, com **Issues: Read and write**. Depois:
     ```sh
     npx wrangler secret put GITHUB_TOKEN
     ```
     e preencha `GITHUB_REPO` (ex.: `GabrielMelloMol/upvision-suporte`) no `wrangler.toml`. Crie no repositório os rótulos `sugestão` e `diagnóstico`.
7. **Publicar:**
   ```sh
   npx wrangler deploy
   ```
   O comando mostra o endereço, algo como `https://upvision-feedback.SEU-USUARIO.workers.dev`. O endereço do app é esse + `/feedback`.
8. **Ligar no app:** no GitHub do app, em Settings → Secrets and variables → Actions, crie:
   - `FEEDBACK_URL` = `https://upvision-feedback.SEU-USUARIO.workers.dev/feedback`
   - `FEEDBACK_TOKEN` = o token do passo 4
   - `FEEDBACK_WHATSAPP` (opcional) = seu número com DDI e DDD, só números, ex.: `5521999990000`

   A próxima versão publicada já envia pelo app. Para testar no seu computador, crie `.env.local` na raiz do app (arquivo ignorado pelo git) com as mesmas três linhas, prefixadas com `VITE_` (`VITE_FEEDBACK_URL=...`).
9. **Conferir** (troque o endereço e o token):
   ```sh
   curl -X POST https://upvision-feedback.SEU-USUARIO.workers.dev/feedback \
     -H "Content-Type: application/json" -H "X-App-Token: SEU_TOKEN" \
     -d '{"kind":"Sugestão","title":"Teste","description":"Funcionou?","appVersion":"teste","platform":"curl","installId":"teste-0001"}'
   ```
   A resposta deve ser `{"ok":true,"id":"..."}`, e a mensagem chega no e-mail ou vira issue.

## Se usar um domínio próprio

O app só aceita conectar em `*.workers.dev` (CSP em `src-tauri/tauri.conf.json`, `connect-src`). Com domínio próprio, acrescente o endereço lá.

## Segurança

- O token do app vai dentro do instalador, então ele **não é um segredo forte**: é um freio contra spam, somado ao limite por instalação e por IP. Se começar a chegar lixo, troque o token (passos 4, 5 e 8) e publique uma versão nova.
- O Worker não guarda as mensagens nem registra IP ou conteúdo; só conta envios por algumas horas.
- O diagnóstico já sai do app sem e-mails, telefones, documentos e nomes.
- O token do GitHub deve valer só para o repositório privado de suporte, só com permissão de issues.

## Testes

Os testes do Worker (`src/handler.test.ts`) rodam junto com os do app (`npm test` na raiz). Eles cobrem token, validação, limite, entrega e CORS, sem precisar da Cloudflare.
