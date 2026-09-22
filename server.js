const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");
const { initDB, saveDB, snapshot, health, close: closeDB } = require("./db");

const PORT = Number(process.env.PORT || 3000);
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const APP_ORIGIN = process.env.APP_ORIGIN || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS || 6*60*60*1000);
const BACKUP_INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS || 30*60*1000);
const APP_NAME = process.env.APP_NAME || "2 On Streng Games";
const APP_VERSION = "7.0.0-render";
const HOST = process.env.HOST || "0.0.0.0";
const SEED_DB = {championships:[]};
let db;

const POWER_CATALOG = {
  extra_move:{name:"Movimento extra", icon:"⚡", cost:2, desc:"Permite jogar novamente uma vez."},
  shield:{name:"Escudo", icon:"🛡️", cost:2, desc:"Protege uma casa escolhida contra a próxima jogada adversária."},
  vision:{name:"Visão", icon:"👁️", cost:3, desc:"Revela ao jogador uma casa segura disponível."},
  block:{name:"Bloqueio", icon:"🚫", cost:3, desc:"Bloqueia uma casa livre para o adversário por uma jogada."}
};

function findChamp(idv){return db.championships.find(c=>c.id===idv);}
function findTeam(c,idv){return c?.teams.find(t=>t.id===idv);}
function fixture(c,idv){return c?.fixtures.find(f=>f.id===idv);}
function standings(c){
  const map = {};
  c.teams.forEach(t=>map[t.id]={teamId:t.id,name:t.name,acronym:t.acronym,wins:0,draws:0,losses:0,gf:0,ga:0,gd:0,points:0,powers:t.powerPoints||0});
  for(const f of c.fixtures||[]){
    if(f.status!=="finished" || !f.homeTeamId || !f.awayTeamId) continue;
    const h=map[f.homeTeamId], a=map[f.awayTeamId]; if(!h||!a) continue;
    h.gf+=f.homeScore||0; h.ga+=f.awayScore||0; a.gf+=f.awayScore||0; a.ga+=f.homeScore||0;
    if(f.homeScore>f.awayScore){h.wins++;a.losses++;h.points+=3;}
    else if(f.homeScore<f.awayScore){a.wins++;h.losses++;a.points+=3;}
    else {h.draws++;a.draws++;h.points++;a.points++;}
  }
  return Object.values(map).map(x=>({...x,gd:x.gf-x.ga})).sort((a,b)=>b.points-a.points||b.gd-a.gd||b.gf-a.gf||a.name.localeCompare(b.name));
}
function publicChamp(c){
  return {...c,teams:c.teams.map(t=>({...t,players:t.players?.map(p=>({id:p.id,name:p.name}))||[]})),
    standings:standings(c), powerCatalog:POWER_CATALOG};
}
function roundRobin(teamIds,doubleRound=false){
  let ids=[...teamIds]; if(ids.length%2)ids.push(null);
  const rounds=ids.length-1, half=ids.length/2, out=[];
  for(let r=0;r<rounds;r++){
    for(let i=0;i<half;i++){
      const a=ids[i], b=ids[ids.length-1-i]; if(a&&b) out.push([a,b,r+1]);
    }
    ids=[ids[0],ids[ids.length-1],...ids.slice(1,-1)];
  }
  if(doubleRound) return out.concat(out.map(([a,b,r])=>[b,a,r+rounds]));
  return out;
}
function createFixtures(c){
  if(c.format==="league"){
    return roundRobin(c.teams.map(t=>t.id),!!c.doubleRound).map(([a,b,r],i)=>({id:id("fx"),type:"league",round:r,order:i+1,homeTeamId:a,awayTeamId:b,status:"scheduled",homeScore:null,awayScore:null,roomCode:null}));
  }
  const ids=c.teams.map(t=>t.id);
  const first=[]; for(let i=0;i<ids.length;i+=2) first.push({id:id("fx"),type:"knockout",round:1,order:i/2+1,homeTeamId:ids[i]||null,awayTeamId:ids[i+1]||null,status:"scheduled",homeScore:null,awayScore:null,roomCode:null});
  const rounds=Math.ceil(Math.log2(Math.max(2,ids.length)));
  const all=[...first];
  let slots=Math.ceil(first.length/2);
  for(let r=2;r<=rounds;r++){for(let i=0;i<slots;i++)all.push({id:id("fx"),type:"knockout",round:r,order:i+1,homeTeamId:null,awayTeamId:null,status:"scheduled",homeScore:null,awayScore:null,roomCode:null}); slots=Math.ceil(slots/2);}
  return all;
}
function incrementWinnerPower(c, winnerId, fixtureId){
  const f=fixture(c,fixtureId); if(!f || f.powerAwarded || !winnerId) return;
  const t=findTeam(c,winnerId); if(!t) return;
  t.powerPoints=(t.powerPoints||0)+(c.powerRules?.gainPerWin||1);
  f.powerAwarded=true;
}
function advanceKnockout(c,f){
  if(f.type!=="knockout" || f.status!=="finished") return;
  const winner=f.homeScore>f.awayScore?f.homeTeamId:f.awayScore>f.homeScore?f.awayTeamId:null;
  if(!winner) return;
  const next=c.fixtures.filter(x=>x.type==="knockout"&&x.round===f.round+1).sort((a,b)=>a.order-b.order)[Math.floor((f.order-1)/2)];
  if(!next)return;
  if((f.order-1)%2===0) next.homeTeamId=winner; else next.awayTeamId=winner;
}
function finishFixture(c,f,homeScore,awayScore,source="admin"){
  if(f.status==="finished") return false;
  f.homeScore=Number(homeScore); f.awayScore=Number(awayScore); f.status="finished"; f.finishedAt=now(); f.resultSource=source;
  if(f.homeScore>f.awayScore) incrementWinnerPower(c,f.homeTeamId,f.id);
  else if(f.awayScore>f.homeScore) incrementWinnerPower(c,f.awayTeamId,f.id);
  advanceKnockout(c,f); saveDB(db); return true;
}

const clients = new Map(); // ephemeral connection metadata only
const rooms = new Map();
const chatRate = new Map();
function rate(key,limit=12,windowMs=10000){
  const t=Date.now(); let a=chatRate.get(key)||[]; a=a.filter(x=>t-x<windowMs);
  if(a.length>=limit){chatRate.set(key,a);return false;} a.push(t); chatRate.set(key,a); return true;
}
function send(ws,obj){if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(obj));}
function broadcastRoom(room,obj,filter=()=>true){for(const ws of room.sockets)if(filter(ws))send(ws,obj);}
function validPower(c,p){return c.powerRules?.enabled && c.powerRules.enabledPowers.includes(p) && POWER_CATALOG[p];}

function usePower(room, ws, power){ room.lastActivity=Date.now();
  const meta=clients.get(ws); const c=findChamp(room.championshipId); const t=findTeam(c,meta?.teamId);
  if(!c||!t||!validPower(c,power)) return send(ws,{type:"error",message:"Poder indisponível."});
  const cost=POWER_CATALOG[power].cost;
  if((t.powerPoints||0)<cost)return send(ws,{type:"error",message:"A equipa não tem pontos de poder suficientes."});
  if(room.powerUsed?.[meta.teamId]?.[power]) return send(ws,{type:"error",message:"Este poder já foi usado nesta partida."});
  room.powerUsed ||= {}; room.powerUsed[meta.teamId] ||= {};
  room.powerUsed[meta.teamId][power]=true; t.powerPoints-=cost; saveDB(db);
  if(power==="extra_move"){room.extraMoveFor=meta.symbol; room.turn=meta.symbol;}
  if(power==="shield"){room.shieldFor=meta.symbol; room.pendingShield=room.pendingShield||[]; room.pendingShield.push(room.nextShieldCell ?? -1);}
  if(power==="vision"){const free=room.board.map((v,i)=>v?null:i).filter(x=>x!==null); send(ws,{type:"power-result",power,cell:free.length?free[Math.floor(Math.random()*free.length)]:null});}
  if(power==="block"){room.blockFor=meta.symbol; room.blockNext=true;}
  broadcastRoom(room,{type:"state",state:publicRoom(room)});
}
function publicRoom(r){
  return {code:r.code,board:r.board,turn:r.turn,winner:r.winner,winningLine:r.winningLine,score:r.score,
    players:{X:!!r.players.X,O:!!r.players.O},fixtureId:r.fixtureId,championshipId:r.championshipId,
    homeTeamId:r.homeTeamId,awayTeamId:r.awayTeamId,powerUsed:r.powerUsed||{}};
}
function checkWinner(b){
  const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for(const l of lines)if(b[l[0]]&&b[l[0]]===b[l[1]]&&b[l[0]]===b[l[2]])return {winner:b[l[0]],line:l};
  if(b.every(Boolean))return {winner:"draw",line:[]}; return null;
}
function playMove(room,ws,cell){ room.lastActivity=Date.now();
  const meta=clients.get(ws); if(!meta?.symbol || room.winner)return;
  if(meta.symbol!==room.turn)return send(ws,{type:"error",message:"Não é a tua vez."});
  cell=Number(cell); if(!Number.isInteger(cell)||cell<0||cell>8||room.board[cell])return send(ws,{type:"error",message:"Jogada inválida."});
  if(room.blockNext && room.blockFor===meta.symbol && room.blockCell===cell)return send(ws,{type:"error",message:"Esta casa está bloqueada."});
  room.board[cell]=meta.symbol;
  const result=checkWinner(room.board);
  if(result){
    room.winner=result.winner; room.winningLine=result.line;
    if(result.winner==="X")room.score.X++; else if(result.winner==="O")room.score.O++;
    if(room.fixtureId){
      const c=findChamp(room.championshipId), f=fixture(c,room.fixtureId);
      if(c&&f&&f.status!=="finished"){
        if(result.winner==="X") finishFixture(c,f,1,0,"game");
        else if(result.winner==="O") finishFixture(c,f,0,1,"game");
        else finishFixture(c,f,0,0,"game");
      }
    }
  } else {
    if(room.extraMoveFor===meta.symbol){room.extraMoveFor=null;}
    else room.turn=meta.symbol==="X"?"O":"X";
    room.blockNext=false; room.blockCell=null;
  }
  broadcastRoom(room,{type:"state",state:publicRoom(room)});
}

function json(res,status,obj){const s=JSON.stringify(obj);res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(s);}
function body(req){return new Promise((resolve,reject)=>{let d="";req.on("data",x=>{d+=x;if(d.length>1e6)req.destroy();});req.on("end",()=>{try{resolve(d?JSON.parse(d):{})}catch(e){reject(e)}});});}
async function api(req,res,url){
  if(req.method==="GET"&&url.pathname==="/api/health"){ const dbOk=await health(); return json(res,dbOk?200:503,{ok:dbOk,version:APP_VERSION,appName:APP_NAME,time:now(),rooms:rooms.size,championships:db.championships.length,database:dbOk?"ok":"error"}); }
  if(req.method==="GET"&&url.pathname==="/api/ready"){ const dbOk=await health(); return json(res,dbOk?200:503,{ready:dbOk,database:dbOk?"ok":"error"}); }
  if(req.method==="POST"&&url.pathname==="/api/admin/backup"){
    if(!ADMIN_TOKEN || req.headers["x-admin-token"]!==ADMIN_TOKEN)return json(res,401,{error:"Não autorizado"});
    const row=await backupDB(); return json(res,200,{ok:true,snapshotId:String(row.id),createdAt:row.created_at});
  }
  if(req.method==="GET"&&url.pathname==="/api/championships")return json(res,200,{championships:db.championships.map(publicChamp)});
  if(req.method==="GET"&&url.pathname.startsWith("/api/championships/")){
    const c=findChamp(url.pathname.split("/")[3]); if(!c)return json(res,404,{error:"Campeonato não encontrado"});
    return json(res,200,{championship:publicChamp(c)});
  }
  if(req.method==="POST"&&url.pathname==="/api/championships"){
    const b=await body(req); const c={id:id("cup"),code:code(7),name:clean(b.name,80),description:clean(b.description,300),format:b.format==="knockout"?"knockout":"league",doubleRound:!!b.doubleRound,status:"setup",createdAt:now(),teams:[],fixtures:[],powerRules:{enabled:!!b.powersEnabled,gainPerWin:Math.max(1,Math.min(10,Number(b.powerGainPerWin)||1)),enabledPowers:(Array.isArray(b.enabledPowers)?b.enabledPowers:[]).filter(x=>POWER_CATALOG[x])},chatEnabled:b.chatEnabled!==false,voiceEnabled:b.voiceEnabled!==false,reactionsEnabled:b.reactionsEnabled!==false};
    db.championships.push(c);saveDB(db);return json(res,201,{championship:publicChamp(c)});
  }
  const m=req.method==="POST"?url.pathname.match(/^\/api\/championships\/([^/]+)\/([^/]+)$/):null;
  if(m){
    const c=findChamp(m[1]); if(!c)return json(res,404,{error:"Campeonato não encontrado"}); const action=m[2],b=await body(req);
    if(c.status!=="setup"&&["team","generate"].includes(action))return json(res,409,{error:"Configuração já bloqueada."});
    if(action==="team"){
      const t={id:id("team"),name:clean(b.name,60),acronym:clean(b.acronym||b.name,8).toUpperCase(),joinCode:code(8),powerPoints:0,players:[]};
      c.teams.push(t);saveDB(db);return json(res,201,{team:t});
    }
    if(action==="player"){
      const t=findTeam(c,b.teamId);if(!t)return json(res,404,{error:"Equipa não encontrada"});
      t.players.push({id:id("pl"),name:clean(b.name,60)});saveDB(db);return json(res,201,{team:t});
    }
    if(action==="generate"){
      if(c.teams.length<2)return json(res,400,{error:"Adicione pelo menos duas equipas."});
      c.fixtures=createFixtures(c);c.status="active";saveDB(db);return json(res,200,{championship:publicChamp(c)});
    }
    if(action==="close"){c.status="closed";saveDB(db);return json(res,200,{championship:publicChamp(c)});}
    if(action==="result"){
      const f=fixture(c,b.fixtureId);if(!f)return json(res,404,{error:"Partida não encontrada"});
      if(!finishFixture(c,f,b.homeScore,b.awayScore,"admin"))return json(res,409,{error:"Resultado já registado"});
      return json(res,200,{championship:publicChamp(c)});
    }
    if(action==="room"){
      const f=fixture(c,b.fixtureId);if(!f)return json(res,404,{error:"Partida não encontrada"});
      if(!f.homeTeamId||!f.awayTeamId)return json(res,409,{error:"Partida ainda não tem duas equipas."});
      const rc=code(7);f.roomCode=rc;saveDB(db);
      rooms.set(rc,{code:rc,championshipId:c.id,fixtureId:f.id,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,board:Array(9).fill(null),turn:"X",winner:null,winningLine:[],score:{X:0,O:0},players:{X:null,O:null},sockets:new Set(),powerUsed:{}});
      return json(res,200,{roomCode:rc});
    }
  }
  if(req.method==="GET"&&url.pathname==="/api/ranking/players"){
    const rows=[]; for(const c of db.championships)for(const t of c.teams)for(const p of t.players||[])rows.push({name:p.name,team:t.name,wins:standings(c).find(x=>x.teamId===t.id)?.wins||0,powers:t.powerPoints||0});
    rows.sort((a,b)=>b.wins-a.wins||b.powers-a.powers);return json(res,200,{ranking:rows});
  }
  return false;
}
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host||"localhost"}`);
  try{if(u.pathname.startsWith("/api/")){const done=await api(req,res,u);if(done!==false)return;} }catch(e){return json(res,500,{error:"Erro interno"});}
  let p=path.join(PUBLIC_DIR,u.pathname==="/"?"index.html":u.pathname);if(!p.startsWith(PUBLIC_DIR)||!fs.existsSync(p))p=path.join(PUBLIC_DIR,"index.html");
  const ext=path.extname(p);const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".webmanifest":"application/manifest+json",".svg":"image/svg+xml"};
  res.writeHead(200,{"Content-Type":types[ext]||"application/octet-stream","Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer",
    "Permissions-Policy":"microphone=(self), camera=(), geolocation=()",
    "Content-Security-Policy":"default-src 'self'; connect-src 'self' ws: wss:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:;"});fs.createReadStream(p).pipe(res);
});
const wss=new WebSocket.Server({server,maxPayload:32*1024});
wss.on("connection",(ws,req)=>{
  if(APP_ORIGIN){
    const origin=req.headers.origin||"";
    if(origin!==APP_ORIGIN){ws.close(1008,"Origin not allowed");return;}
  }
  clients.set(ws,{id:id("conn"),symbol:null,teamId:null});
  ws.on("message",raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    const meta=clients.get(ws);
    if(m.type==="join"){
      const room=rooms.get(clean(m.roomCode,20));if(!room)return send(ws,{type:"error",message:"Sala não encontrada."});
      let symbol=room.players.X?(!room.players.O?"O":null):"X"; if(!symbol)return send(ws,{type:"spectator",state:publicRoom(room)});
      const c=findChamp(room.championshipId); const teamId=m.teamId||null;
      if(teamId && !findTeam(c,teamId))return send(ws,{type:"error",message:"Equipa inválida."});
      meta.symbol=symbol;meta.teamId=teamId;meta.room=room;room.players[symbol]=ws;room.sockets.add(ws); room.lastActivity=Date.now();
      send(ws,{type:"joined",symbol,state:publicRoom(room),championship:publicChamp(c)});
      broadcastRoom(room,{type:"presence",players:{X:!!room.players.X,O:!!room.players.O}});
    }
    else if(m.type==="move"&&meta.room)playMove(meta.room,ws,m.cell);
    else if(m.type==="power"&&meta.room)usePower(meta.room,ws,m.power);
    else if(m.type==="chat"){
      const room=meta.room; if(!room)return; const c=findChamp(room.championshipId);if(!c?.chatEnabled||!rate(meta.id,8,10000))return send(ws,{type:"error",message:"Chat temporariamente limitado."});
      const text=clean(m.text,500);if(!text)return;
      const channel=m.channel==="team"?"team":"match";
      const teamOnly=channel==="team"&&meta.teamId;
      const msg={id:id("msg"),channel,text,emoji:clean(m.emoji,8),from:meta.symbol,at:Date.now()};
      broadcastRoom(room,{type:"chat",message:msg},sock=>{const cm=clients.get(sock);return !teamOnly||cm?.teamId===meta.teamId;});
    }
    else if(m.type==="voice-signal"&&meta.room){
      const room=meta.room;if(!room)return; broadcastRoom(room,{type:"voice-signal",from:meta.symbol,data:m.data},sock=>sock!==ws);
    }
    else if(m.type==="reaction"&&meta.room){
      const room=meta.room;if(!room)return;const emoji=["👍","❤️","😂","🔥","😮","👏","🎉","😢"].includes(m.emoji)?m.emoji:null;if(!emoji)return;
      broadcastRoom(room,{type:"reaction",emoji,from:meta.symbol});
    }
  });
  ws.on("close",()=>{const meta=clients.get(ws);if(meta?.room){meta.room.sockets.delete(ws);if(meta.symbol)meta.room.players[meta.symbol]=null;}clients.delete(ws);});
});
setInterval(()=>{
  const cutoff=Date.now()-ROOM_TTL_MS;
  for(const [k,r] of rooms){ if((r.lastActivity||0)<cutoff && r.sockets.size===0) rooms.delete(k); }
}, Math.min(15*60*1000, ROOM_TTL_MS));
let backupTimer;
async function start(){
  db = await initDB(SEED_DB);
  backupTimer = setInterval(() => { backupDB().catch(() => {}); }, BACKUP_INTERVAL_MS);
  server.listen(PORT,HOST,()=>console.log(`${APP_NAME} ${APP_VERSION} em http://${HOST}:${PORT}`));
}
async function shutdown(){
  if(backupTimer) clearInterval(backupTimer);
  server.close(async()=>{ await closeDB(); process.exit(0); });
}
process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);
start().catch(err=>{console.error("startup:",err);process.exit(1);});
