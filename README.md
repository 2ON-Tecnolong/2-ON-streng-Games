# 🎮 2 On Streng Games

**Desenvolvido por: 2 On Tecnolong**

Plataforma multiplayer de X/O com campeonatos, equipas, jogadores, ranking, poderes, chat, reações e voz WebRTC.

## Stack

- Node.js 20+
- WebSocket (`ws`)
- PostgreSQL via `pg`
- Render Free para aplicação
- Supabase Free para PostgreSQL
- PWA
- WebRTC para voz

## Persistência

A partir da versão 8.0, o estado dos campeonatos não depende do filesystem do Render. O servidor guarda os dados no PostgreSQL através de `DATABASE_URL`.

## Deploy

Consulte `DEPLOY_RENDER.md` para o passo a passo completo.

## Variáveis principais

- `DATABASE_URL` — conexão PostgreSQL/Supabase.
- `APP_ORIGIN` — URL HTTPS final do Render.
- `ADMIN_TOKEN` — token para operações administrativas.
- `APP_NAME` — nome da plataforma.
- `ROOM_TTL_MS` — tempo de vida de salas inativas.
- `BACKUP_INTERVAL_MS` — intervalo de snapshots.

## Marca

**2 On Streng Games**

**Desenvolvido por: 2 On Tecnolong**
