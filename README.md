# 2 On Streng Games — v9.1

Versão profissional e executável do MVP multiplayer X/O.

## Interface
- HTML5 sem framework
- CSS3 responsivo com sidebar, cards, estados, modal e dashboard
- Gráfico de atividade construído em CSS, sem biblioteca externa
- Layout pensado para desktop e telemóvel

## Multiplayer
- Node.js + WebSocket
- Salas por código
- Partidas sincronizadas em tempo real
- Chat de sala
- Nova ronda
- Health endpoint

## Executar
```bash
npm install
npm start
```
Abra `http://localhost:3000`.

## Próxima camada
PostgreSQL, autenticação, ranking persistente, campeonatos, poderes e WebRTC/TURN podem ser ligados sem alterar a estrutura visual principal.
