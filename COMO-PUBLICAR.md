# Como colocar o site do VS Instituto no ar (grátis)

Você vai usar três serviços gratuitos:

| Serviço | Para quê | Custo |
|---|---|---|
| **GitHub** | Guardar o código do site | Grátis |
| **Neon** | Banco de dados (agendamentos, serviços, equipe) | Grátis (0,5 GB, sobra para um salão) |
| **Render** | Deixar o site no ar com um endereço `https://...onrender.com` | Grátis |

Os planos gratuitos não exigem cartão de crédito para começar. Leva uns 20 minutos na primeira vez.

> **Importante sobre o plano grátis do Render:** se ninguém acessar o site por 15 minutos, ele "cochila". A próxima visita demora cerca de 1 minuto para abrir. Veja no passo 6 como evitar isso de graça.

---

## 1. Banco de dados no Neon

1. Acesse **https://neon.com** e clique em **Sign up** (dá para entrar com a conta Google).
2. Crie um projeto:
   - **Project name:** `vs-instituto`
   - **Postgres version:** a que vier marcada
   - **Region:** escolha a mais próxima do Brasil que aparecer (ex.: São Paulo; se não houver, *US East*).
3. Na tela do projeto, clique em **Connect**.
4. Copie a **connection string**. Ela é parecida com:
   `postgresql://neondb_owner:xxxx@ep-xxxx.sa-east-1.aws.neon.tech/neondb?sslmode=require`
5. Guarde esse texto: ele é o `DATABASE_URL`. **Não compartilhe** (é a senha do banco).

As tabelas são criadas sozinhas quando o site liga pela primeira vez.

## 2. Código no GitHub

1. Acesse **https://github.com** e crie uma conta (ou entre).
2. Clique em **+ → New repository**.
   - **Repository name:** `vs-instituto`
   - Marque **Private** (privado).
   - Clique em **Create repository**.
3. Descompacte o ZIP `vs-instituto-site.zip` no seu computador.
4. Na página do repositório, clique em **uploading an existing file**.
5. Abra a pasta `vs-instituto` descompactada, selecione **tudo o que está dentro dela** e arraste para a página do GitHub.
   - O GitHub aceita até 100 arquivos por envio. Se reclamar, envie em duas vezes: primeiro tudo **menos** a pasta `lib`, clique em **Commit changes**; depois repita o passo 4 e envie a pasta `lib`.
   - Arquivos que começam com ponto (`.gitignore`, `.dockerignore`, `.npmrc`) às vezes ficam ocultos no Windows/Mac. Ative "mostrar arquivos ocultos" para enviá-los também.
6. Clique em **Commit changes**.

> Alternativa mais fácil se tiver muitos arquivos: instale o **GitHub Desktop** (https://desktop.github.com), use *File → Add local repository* na pasta descompactada e clique em **Publish repository**.

## 3. Site no Render

1. Acesse **https://render.com** e clique em **Get Started** → entre **com a conta do GitHub**.
2. No painel, clique em **New + → Blueprint**.
3. Autorize o Render a ver o repositório `vs-instituto` e selecione-o.
4. O Render lê o arquivo `render.yaml` e mostra o serviço **vs-instituto (Free)**. Ele vai pedir três valores:
   - `DATABASE_URL` → cole a connection string do Neon (passo 1).
   - `ADMIN_EMAIL` → o e-mail da administração, ex.: `administracao@seusalao.com`.
   - `ADMIN_PASSWORD` → a senha inicial da administração (mínimo 8 caracteres).
   - `SESSION_SECRET` é gerado sozinho, não precisa preencher.
5. Clique em **Apply** / **Deploy Blueprint**.
6. Aguarde o build (5 a 10 minutos na primeira vez). Quando aparecer **Live**, o endereço do site fica no topo, algo como `https://vs-instituto.onrender.com`.

## 4. Primeiro acesso

1. Abra `https://SEU-ENDERECO.onrender.com/entrar` (ou clique em **Área da equipe** no rodapé do site).
2. Entre com o `ADMIN_EMAIL` e o `ADMIN_PASSWORD` do passo 3.
3. Cadastre nesta ordem:
   1. **Salão** — nome, WhatsApp, endereço, Instagram, texto de apresentação e a % do salão (padrão 30%).
   2. **Serviços** — nome, preço e duração de cada um.
   3. **Equipe → Nova profissional** — nome, horário e dias de atendimento.
   4. **Equipe → Novo acesso** (opcional) — e-mail e senha para cada profissional ver a própria agenda.
4. Em **Minha conta**, troque a senha da administração se quiser.
5. Faça um agendamento de teste pela página inicial e confira em **Visão geral**.

Pronto: compartilhe o endereço com as clientes (Instagram, WhatsApp, Google Meu Negócio).

## 5. Como fazer mudanças depois

- Qualquer alteração enviada ao GitHub (novo commit) faz o Render publicar de novo sozinho.
- Serviços, preços, equipe e informações do salão **não precisam de código**: mude pelo painel.

## 6. (Opcional) Evitar a demora de 1 minuto

O plano grátis do Render dá 750 horas por mês: o suficiente para deixar **um** site ligado o mês inteiro.

1. Crie uma conta grátis em **https://cron-job.org**.
2. **Create cronjob**:
   - **URL:** `https://SEU-ENDERECO.onrender.com/api/healthz`
   - **Schedule:** a cada 10 minutos.
3. Salve. O site deixa de "cochilar".

## 7. (Opcional) Endereço próprio, ex. `agenda.vsinstituto.com.br`

Se tiver um domínio, no Render abra o serviço → **Settings → Custom Domains → Add**, e siga as instruções de DNS. O certificado HTTPS é gratuito e automático.

## 8. Esqueci a senha da administração

1. No Render, abra o serviço → **Environment**.
2. Altere `ADMIN_PASSWORD` para a nova senha e adicione `ADMIN_RESET_PASSWORD` = `true`.
3. Salve (o site reinicia). Entre com a nova senha.
4. **Apague** a variável `ADMIN_RESET_PASSWORD` depois.

Senha de profissional esquecida: a administração define uma nova em **Equipe → Acessos → editar**.

## 9. Limites do plano grátis

- **Render:** cochila após 15 min sem acesso (resolva com o passo 6); 750 h/mês.
- **Neon:** 0,5 GB de dados (milhares de agendamentos) e 100 horas de processamento por mês; o banco também dorme quando não é usado e acorda em cerca de 1 segundo.
- Se um dia precisar de mais, os dois têm planos pagos baratos, sem precisar mudar o código.

---

## Para quem for programar

Requisitos: Node.js 22.9+ e pnpm (`corepack enable`).

```bash
cp .env.example .env         # preencha DATABASE_URL etc.
pnpm install
pnpm run dev:api             # API em http://localhost:8080 (lê o .env)
pnpm run dev:site            # site em http://localhost:5173 (encaminha /api)
pnpm run typecheck
pnpm run build && pnpm start # produção: site + API na mesma porta
```

Estrutura:

- `artifacts/api-server` — API Express (rotas em `src/routes`, login em `src/lib/auth.ts`).
- `artifacts/vs-instituto` — site React/Vite (páginas em `src/pages`).
- `lib/db` — tabelas (Drizzle) e criação automática (`src/migrate.ts`).
- `lib/api-spec/openapi.yaml` — contrato da API; `pnpm run codegen` regenera `lib/api-zod` e `lib/api-client-react`.
- `Dockerfile` e `render.yaml` — publicação.
