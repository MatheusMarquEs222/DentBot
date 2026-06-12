# Deploy no Railway — Passo a Passo

O Railway **não executa o docker-compose diretamente**: cada serviço do
compose vira um serviço separado no canvas do projeto, e Postgres/Redis
devem usar os **bancos gerenciados** do Railway (com backup e painel).

> ## ⚡ Caminho rápido — Infrastructure as Code (recomendado)
>
> O projeto inclui o arquivo `.railway/railway.ts`, que descreve toda a
> stack (2x Postgres, Redis, Evolution API e n8n, já com as variáveis e
> referências entre serviços). Para provisionar tudo de uma vez:
>
> ```bash
> npm i -g @railway/cli   # ou: brew install railway
> railway login
> railway init            # cria o projeto (ou railway link, se já existir)
> railway plan            # pré-visualiza o que será criado
> railway apply           # cria todos os serviços
> ```
>
> Depois do `apply`, finalize no painel (3 ajustes que o IaC não cobre):
> 1. **Segredos:** defina `AUTHENTICATION_API_KEY` (evolution-api) e
>    `N8N_ENCRYPTION_KEY` (n8n) — gere com `openssl rand -hex 32`.
>    Eles estão como `preserve()`, então o IaC nunca vai sobrescrevê-los.
> 2. **Volumes:** evolution-api → `/evolution/instances` e
>    n8n → `/home/node/.n8n` (Settings → Volumes).
> 3. **Domínios públicos:** Generate Domain na evolution-api (porta 8080)
>    e no n8n (porta 5678) — domínios gerados não entram no arquivo IaC.
>
> Em seguida, pule direto para o **Passo 4** (conectar o WhatsApp).
>
> Alternativa sem CLI: arraste o `docker-compose.yml` para o canvas do
> projeto — o Railway importa os serviços como mudanças sugeridas — mas
> você ainda precisará trocar as variáveis pelos arquivos desta pasta.

---

## Caminho manual (sem IaC)

A stack final no Railway fica assim:

```
┌─────────────────────────── Projeto Railway ───────────────────────────┐
│                                                                        │
│  [Postgres]            [Redis]              [Postgres-n8n]             │
│   (gerenciado)          (gerenciado)         (gerenciado)              │
│       ▲                    ▲                      ▲                    │
│       │  rede privada      │                      │                    │
│  [evolution-api] ◄────────┘                  [n8n]                     │
│   imagem Docker      webhook (rede privada)   imagem Docker            │
│   vol: /evolution/instances ───────────────►  vol: /home/node/.n8n     │
│   🌐 https://evolution-xxx.up.railway.app    🌐 https://n8n-xxx...     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Passo 1 — Criar o projeto e os bancos

1. Em [railway.com](https://railway.com) → **New Project** → *Empty Project*.
2. **+ New → Database → PostgreSQL** → renomeie para `Postgres`
   (banco da Evolution API).
3. **+ New → Database → PostgreSQL** → renomeie para `Postgres-n8n`
   (banco do n8n).
4. **+ New → Database → Redis** → mantenha o nome `Redis`.

> Os nomes importam: as variáveis de referência usam a sintaxe
> `${{NomeDoServico.VARIAVEL}}`. Se renomear, ajuste os arquivos `.env`.

## Passo 2 — Serviço Evolution API

1. **+ New → Docker Image** → `evoapicloud/evolution-api:v2.3.7`
   → renomeie o serviço para `evolution-api`.
2. **Settings → Volumes → + Volume** → mount path: `/evolution/instances`.
3. **Settings → Networking → Generate Domain** → porta **8080**.
4. **Variables → Raw Editor** → cole o conteúdo de
   `variables-evolution-api.env` (gere antes a `AUTHENTICATION_API_KEY`
   com `openssl rand -hex 32`).
5. Deploy. Acesse `https://<dominio-evolution>/manager` e faça login
   com a API key.

## Passo 3 — Serviço n8n

1. **+ New → Docker Image** → `docker.n8n.io/n8nio/n8n:latest`
   → renomeie para `n8n`.
2. **Settings → Volumes → + Volume** → mount path: `/home/node/.n8n`.
3. **Settings → Networking → Generate Domain** → porta **5678**.
4. **Variables → Raw Editor** → cole o conteúdo de `variables-n8n.env`
   (gere a `N8N_ENCRYPTION_KEY` e **guarde** — ela criptografa as
   credenciais; se perder, perde as credenciais salvas).
5. Deploy. Acesse `https://<dominio-n8n>` e crie a conta admin.

## Passo 4 — Conectar o WhatsApp

No **Evolution Manager** (`/manager`): *Instances* → **+ Instance** →
nome `clinica`, canal **Baileys** → **Connect** → escaneie o QR Code com
o WhatsApp da clínica (Aparelhos conectados → Conectar aparelho).

## Passo 5 — Webhook Evolution → n8n (rede privada)

Os serviços se enxergam pela rede privada do Railway no formato
`<serviço>.railway.internal` — tráfego interno, sem custo de egress e
sem sair para a internet:

```bash
curl -X POST https://<dominio-evolution>/webhook/set/clinica \
  -H "apikey: SUA_AUTHENTICATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "http://n8n.railway.internal:5678/webhook/whatsapp",
      "byEvents": false,
      "base64": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

E no sentido contrário, o workflow do n8n envia mensagens chamando:
`http://evolution-api.railway.internal:8080/message/sendText/clinica`
com o header `apikey`.

> Se preferir testar primeiro com as URLs públicas (https), também
> funciona — a rede privada é apenas mais rápida e econômica.

## Passo 6 — Verificações

- `https://<dominio-evolution>` deve responder com o status da API.
- No Manager, a instância `clinica` deve estar **open**.
- No n8n, um workflow com nó *Webhook* (path `whatsapp`, método POST)
  ativado deve receber um JSON a cada mensagem enviada ao número.

## Custos e dicas

- Tudo roda no plano Hobby; monitore o uso em *Usage*.
- O Railway reinicia serviços em novos deploys — os dados persistem
  porque estão nos volumes e nos bancos gerenciados.
- Para domínio próprio (ex.: `bot.suaclinica.com.br`), use
  *Settings → Networking → Custom Domain* no serviço n8n/evolution.
