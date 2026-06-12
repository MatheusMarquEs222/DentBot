// =====================================================================
// Infrastructure as Code — Railway
// Provisiona toda a stack do chatbot: 2x Postgres, Redis,
// Evolution API (WhatsApp) e n8n (automação).
//
// Uso:
//   railway login
//   railway init   (ou railway link, se o projeto já existir)
//   railway plan   -> mostra o que será criado
//   railway apply  -> cria/atualiza os serviços
//
// Após o apply, faltam apenas 3 ajustes manuais (ver README-railway.md):
//   1. Definir os segredos AUTHENTICATION_API_KEY e N8N_ENCRYPTION_KEY
//      (marcados como preserve() — gere com: openssl rand -hex 32)
//   2. Adicionar os volumes:  evolution-api -> /evolution/instances
//                             n8n           -> /home/node/.n8n
//   3. Gerar os domínios públicos (Networking -> Generate Domain):
//      evolution-api porta 8080  |  n8n porta 5678
// =====================================================================

import {
  defineRailway,
  group,
  image,
  postgres,
  preserve,
  project,
  redis,
  service,
} from "railway/iac";

export default defineRailway(() => {
  // ------------------------------------------------------------------
  // Bancos gerenciados
  // ------------------------------------------------------------------
  const dbEvolution = postgres("Postgres");        // banco da Evolution API
  const dbN8n       = postgres("Postgres-n8n");    // banco do n8n
  const cache       = redis("Redis");              // cache da Evolution API

  // ------------------------------------------------------------------
  // Evolution API — gerenciamento dos números de WhatsApp
  // ------------------------------------------------------------------
  const evolutionApi = service("evolution-api", {
    source: image("evoapicloud/evolution-api:v2.3.7"),
    env: {
      // Servidor
      SERVER_TYPE: "http",
      SERVER_PORT: "8080",
      SERVER_URL: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
      LANGUAGE: "pt-BR",
      DEL_INSTANCE: "false",

      // Autenticação — defina uma vez no painel; o IaC preserva o valor
      AUTHENTICATION_API_KEY: preserve(),
      AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES: "true",

      // Banco de dados (rede privada)
      DATABASE_ENABLED: "true",
      DATABASE_PROVIDER: "postgresql",
      DATABASE_CONNECTION_URI: "${{Postgres.DATABASE_URL}}?schema=public",
      DATABASE_CONNECTION_CLIENT_NAME: "evolution",
      DATABASE_SAVE_DATA_INSTANCE: "true",
      DATABASE_SAVE_DATA_NEW_MESSAGE: "true",
      DATABASE_SAVE_MESSAGE_UPDATE: "true",
      DATABASE_SAVE_DATA_CONTACTS: "true",
      DATABASE_SAVE_DATA_CHATS: "true",
      DATABASE_SAVE_DATA_LABELS: "true",
      DATABASE_SAVE_DATA_HISTORIC: "true",

      // Cache (rede privada)
      CACHE_REDIS_ENABLED: "true",
      CACHE_REDIS_URI: cache.env.REDIS_URL,
      CACHE_REDIS_PREFIX_KEY: "evolution",
      CACHE_REDIS_SAVE_INSTANCES: "false",
      CACHE_LOCAL_ENABLED: "false",

      // Logs
      LOG_LEVEL: "ERROR,WARN,INFO",
      LOG_COLOR: "true",
    },
  });

  // ------------------------------------------------------------------
  // n8n — plataforma de automação (workflow do chatbot)
  // ------------------------------------------------------------------
  const n8n = service("n8n", {
    source: image("docker.n8n.io/n8nio/n8n:latest"),
    env: {
      // Banco de dados (rede privada)
      DB_TYPE: "postgresdb",
      DB_POSTGRESDB_HOST: "${{Postgres-n8n.RAILWAY_PRIVATE_DOMAIN}}",
      DB_POSTGRESDB_PORT: "5432",
      DB_POSTGRESDB_DATABASE: "${{Postgres-n8n.PGDATABASE}}",
      DB_POSTGRESDB_USER: "${{Postgres-n8n.PGUSER}}",
      DB_POSTGRESDB_PASSWORD: "${{Postgres-n8n.PGPASSWORD}}",

      // Segurança — defina uma vez no painel e NUNCA mude depois
      N8N_ENCRYPTION_KEY: preserve(),

      // URLs públicas (Railway entrega HTTPS automaticamente)
      N8N_HOST: "${{RAILWAY_PUBLIC_DOMAIN}}",
      N8N_PORT: "5678",
      N8N_PROTOCOL: "https",
      WEBHOOK_URL: "https://${{RAILWAY_PUBLIC_DOMAIN}}/",

      // Integração com a Evolution API (rede privada)
      EVOLUTION_API_URL: "http://${{evolution-api.RAILWAY_PRIVATE_DOMAIN}}:8080",

      // Localização
      GENERIC_TIMEZONE: "America/Sao_Paulo",
      TZ: "America/Sao_Paulo",
    },
  });

  // ------------------------------------------------------------------
  // Organização no canvas
  // ------------------------------------------------------------------
  const dados     = group("Dados", [dbEvolution, dbN8n, cache]);
  const aplicacao = group("Aplicação", [evolutionApi, n8n]);

  return project("chatbot-clinica", {
    resources: [dados, aplicacao],
  });
});
