# Chatbot de Atendimento Odontológico — Infraestrutura

Stack completa para o chatbot de atendimento e agendamento via WhatsApp:

| Serviço | Função | Porta |
|---|---|---|
| **Postgres 16** | Banco de dados (bancos `evolution` e `n8n`) | 5432 (somente localhost) |
| **Redis 7** | Cache de sessões da Evolution API | interna |
| **Evolution API v2.3.7** | Gerenciamento dos números de WhatsApp | 8080 |
| **n8n** | Plataforma de automação (workflow do chatbot) | 5678 |

## 1. Pré-requisitos

- Docker e Docker Compose instalados (`docker compose version`)

## 2. Configuração

```bash
# 1. Copie o arquivo de variáveis
cp .env.example .env

# 2. Gere as chaves secretas e cole no .env
openssl rand -hex 32   # use para EVOLUTION_API_KEY
openssl rand -hex 32   # use para N8N_ENCRYPTION_KEY

# 3. Defina uma senha forte em POSTGRES_PASSWORD
```

## 3. Subindo a stack

```bash
docker compose up -d
docker compose ps        # todos devem ficar "running/healthy"
docker compose logs -f evolution-api   # acompanhar inicialização
```

Acessos:
- **Evolution Manager:** http://localhost:8080/manager (login com a `EVOLUTION_API_KEY`)
- **n8n:** http://localhost:5678 (crie a conta de administrador no primeiro acesso)

## 4. Conectando o número de WhatsApp

1. Abra o **Evolution Manager** → *Instances* → **+ Instance**.
2. Nomeie a instância (ex.: `clinica`), canal **Baileys**, e salve.
3. Clique em **Connect** e escaneie o **QR Code** com o WhatsApp do
   número da clínica (WhatsApp → Aparelhos conectados → Conectar aparelho).
4. A instância deve ficar com status **open** (conectada).

> A mesma criação pode ser feita por API:
> ```bash
> curl -X POST http://localhost:8080/instance/create \
>   -H "apikey: $EVOLUTION_API_KEY" \
>   -H "Content-Type: application/json" \
>   -d '{"instanceName": "clinica", "integration": "WHATSAPP-BAILEYS", "qrcode": true}'
> ```

## 5. Ligando a Evolution API ao n8n (webhook)

Cada mensagem recebida no WhatsApp será encaminhada ao n8n. Após criar o
workflow com um nó **Webhook** (ex.: path `whatsapp`), configure na instância:

```bash
curl -X POST http://localhost:8080/webhook/set/clinica \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "http://n8n:5678/webhook/whatsapp",
      "byEvents": false,
      "base64": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

> **Importante:** como os containers estão na mesma rede Docker
> (`chatbot-net`), a Evolution API enxerga o n8n pelo hostname `n8n`
> (não use `localhost` dentro do webhook).

Para o n8n **enviar** mensagens, o workflow chamará a Evolution API em
`http://evolution-api:8080/message/sendText/clinica` com o header
`apikey`.

## 6. Comandos úteis

```bash
docker compose down              # parar tudo (dados preservados nos volumes)
docker compose down -v          # parar e APAGAR todos os dados
docker compose pull && docker compose up -d   # atualizar imagens
docker compose logs -f n8n      # logs do n8n
```

## 7. Produção (VPS)

- Aponte `EVOLUTION_SERVER_URL`, `N8N_HOST` e `N8N_WEBHOOK_URL` para o domínio público (ex.: `https://api.suaclinica.com.br`).
- Coloque um reverse proxy com HTTPS na frente (Traefik, Nginx ou Caddy).
- Altere `N8N_SECURE_COOKIE` para `true` e `N8N_PROTOCOL` para `https`.

## Próximo passo

Importar/criar o **workflow do chatbot no n8n**: Webhook → controle de
sessão → roteamento do menu → integração com Google Gemini → resposta via
Evolution API.
