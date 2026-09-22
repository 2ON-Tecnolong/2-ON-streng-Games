# X/O Arena V6 — Deploy Production

## Requisitos
- VPS Linux (Ubuntu 22.04/24.04 ou equivalente)
- Docker + Docker Compose plugin
- Um domínio apontado para o IP da VPS
- Portas 80/443 abertas
- Para voz entre redes difíceis: servidor TURN/coturn e portas UDP apropriadas

## 1. Preparar
```bash
cp .env.example .env
```
Edite `.env`:
- `APP_ORIGIN=https://SEU-DOMINIO`
- `ADMIN_TOKEN=<token-forte-e-aleatorio>`

Edite `Caddyfile` e troque `SEU-DOMINIO.example`.

## 2. Subir
```bash
docker compose up -d --build
docker compose ps
docker compose logs -f xo
```

O Caddy solicita/renova automaticamente o certificado TLS quando DNS e portas estão corretos.

## 3. Testar
```bash
curl https://SEU-DOMINIO.example/api/health
```
Deve devolver JSON com `ok:true` e `version:"6.0.0"`.

Abra o domínio no telemóvel e teste:
1. criar campeonato;
2. criar equipas;
3. gerar campeonato;
4. abrir partida;
5. chat/reação;
6. microfone;
7. poderes.

## 4. Backup
O servidor cria backups rotativos no volume `xo_data`.
Backup manual:
```bash
curl -X POST https://SEU-DOMINIO.example/api/admin/backup   -H 'x-admin-token: SEU_ADMIN_TOKEN'
```

Para produção séria, copie os backups também para armazenamento externo.

## 5. Voz WebRTC
A aplicação já usa STUN. Para confiabilidade real entre operadoras móveis, CGNAT e redes restritas, configure TURN/coturn.

Não coloque chaves TURN fixas no código. Em produção, gere credenciais temporárias e injete a configuração no frontend/endpoint de configuração.

## 6. Segurança
- Não publique `.env`.
- Use um `ADMIN_TOKEN` longo e aleatório.
- Mantenha Docker/host atualizados.
- Restrinja SSH por chave.
- Firewall: 22 apenas onde necessário; 80/443 públicos.
- TURN: abrir somente as portas necessárias.
- Faça backup externo.
- O servidor não precisa de IP do jogador para a lógica da aplicação; logs do host/proxy podem existir fora da aplicação.

## 7. Escala
Esta V6 usa JSON para dados de campeonato e é adequada para uma primeira implantação pequena.
Para crescimento real, a próxima etapa deve migrar dados persistentes para PostgreSQL e usar Redis para presença/salas distribuídas.

## 8. Importante
A V6 está preparada para deploy, mas "colocar online" exige uma VPS, domínio e credenciais que pertencem ao proprietário do projeto. O pacote não inclui nem inventa essas credenciais.
