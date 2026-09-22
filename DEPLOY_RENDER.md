# 2 On Streng Games — Render + Supabase PostgreSQL

**Desenvolvido por: 2 On Tecnolong**

## Arquitetura

- Render Free: Node.js + WebSocket + HTTPS.
- Supabase Free: PostgreSQL para persistir campeonatos, equipas, jogadores, resultados e pontos de poder.
- O filesystem do Render não é usado como banco de dados.
- O serviço usa apenas uma instância do Render, compatível com o plano Free.

## 1. Criar o banco Supabase

1. Abra https://supabase.com/ e crie uma conta.
2. Crie um novo projeto no plano Free.
3. No projeto, abra **Connect** / **Database** e copie a connection string PostgreSQL.
4. Use a connection string como `DATABASE_URL` no Render.
5. Não coloque a senha do banco em arquivos públicos ou no GitHub.

O Supabase Free atualmente inclui PostgreSQL de 500 MB por projeto. Projetos Free podem ser pausados por baixa atividade durante 7 dias; quando pausados, os dados são preservados e o projeto pode ser retomado. Consulte a documentação oficial para as regras atuais.

## 2. Criar o serviço Render

1. Crie um repositório GitHub chamado `2-on-streng-games`.
2. Envie todo o conteúdo deste pacote para o repositório.
3. No Render, escolha **New → Web Service**.
4. Conecte o repositório.
5. Plan: **Free**.
6. Build Command: `npm ci`.
7. Start Command: `npm start`.
8. Health Check Path: `/api/health`.
9. Crie `ADMIN_TOKEN` forte.
10. Adicione `DATABASE_URL` com a connection string do Supabase.
11. Faça o primeiro deploy.
12. Copie a URL final do Render, por exemplo `https://2-on-streng-games.onrender.com`.
13. Defina `APP_ORIGIN` exatamente com essa URL, sem `/` no final.
14. Faça redeploy.

## 3. Primeiro arranque

O servidor cria automaticamente as tabelas:

- `app_state`: estado atual do jogo/campeonatos.
- `app_snapshots`: últimos snapshots administrativos/automáticos.

Se o banco estiver vazio, o servidor inicializa com um campeonato vazio.

## 4. Backup

O endpoint administrativo é:

`POST /api/admin/backup`

Header:

`x-admin-token: SEU_ADMIN_TOKEN`

São mantidos os últimos 7 snapshots no PostgreSQL.

## 5. WebSocket

Com o site em HTTPS, o cliente usa `wss://` automaticamente. O Render fornece TLS e suporta WebSocket em Web Services.

O plano Free pode desligar o serviço após 15 minutos sem tráfego de entrada; mensagens WebSocket recebidas também impedem o desligamento enquanto houver atividade. Ao voltar, pode haver cerca de um minuto de arranque.

## 6. Voz

A voz continua em WebRTC P2P com STUN. O Render fornece apenas o canal de sinalização WebSocket; não funciona como servidor TURN. Para melhorar chamadas em redes muito restritivas, uma futura versão pode adicionar TURN externo.

## 7. Limites importantes

O Render Free tem filesystem efémero e não deve ser usado para persistir dados locais. Esta versão grava o estado no PostgreSQL.

O Supabase Free tem limite de 500 MB por banco e pode pausar projetos com pouca atividade. Antes de uso comercial intenso, migrar para plano pago ou outra infraestrutura persistente.
