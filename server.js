const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const APP_NAME = process.env.APP_NAME || "2 On Streng Games";
const rooms = new Map();
const clients = new Map();

const publicDir = path.join(__dirname, "public");
fs.mkdirSync(publicDir, { recursive: true });

const id = (p) => `${p}_${crypto.randomBytes(4).toString("hex")}`;
const clean = (v, n=120) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0,n);
const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
const state = (room) => ({
  code: room.code, board: room.board, turn: room.turn, winner: room.winner,
  winningLine: room.winningLine, players: { X: !!room.players.X, O: !!room.players.O },
  score: room.score, messages: room.messages.slice(-50), lastActivity: room.lastActivity
});
function result(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const line of lines) if (board[line[0]] && board[line[0]] === board[line[1]] && board[line[1]] === board[line[2]])
    return { winner: board[line[0]], line };
  return board.every(Boolean) ? { winner: "draw", line: [] } : null;
}
function broadcast(room, data) { for (const ws of room.sockets) send(ws, data); }
function newRoom(name="Partida rápida") {
  const code = crypto.randomBytes(3).toString("hex").toUpperCase();
  const room = { code, name: clean(name,80), board:Array(9).fill(null), turn:"X", winner:null,
    winningLine:[], players:{X:null,O:null}, sockets:new Set(), score:{X:0,O:0}, messages:[],
    lastActivity:Date.now() };
  rooms.set(code, room); return room;
}
function serve(req,res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/health") {
    return json(res,200,{ok:true,version:"9.0.0",appName:APP_NAME,rooms:rooms.size,players:clients.size});
  }
  if (url.pathname === "/api/rooms" && req.method === "POST") {
    let body=""; req.on("data",c=>body+=c); req.on("end",()=> {
      let data={}; try { data=body?JSON.parse(body):{}; } catch {}
      const room=newRoom(data.name);
      json(res,201,{roomCode:room.code});
    }); return;
  }
  let file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  file = path.join(publicDir,file);
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
    file = path.join(publicDir,"index.html");
  const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".webmanifest":"application/manifest+json"};
  res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});
  fs.createReadStream(file).pipe(res);
}
function json(res,status,data){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(data));}
const server=http.createServer(serve);
const wss=new WebSocket.Server({server,maxPayload:16*1024});
wss.on("connection",(ws)=>{
  const meta={room:null,symbol:null,name:"Jogador"};
  clients.set(ws,meta);
  ws.on("message",(raw)=>{
    let m; try { m=JSON.parse(raw); } catch { return; }
    if(m.type==="join"){
      const code=clean(m.roomCode,20).toUpperCase(), room=rooms.get(code);
      if(!room) return send(ws,{type:"error",message:"Sala não encontrada."});
      const symbol=!room.players.X?"X":!room.players.O?"O":null;
      meta.room=room; meta.name=clean(m.name,40)||"Jogador";
      if(symbol){ meta.symbol=symbol; room.players[symbol]=ws; room.sockets.add(ws); }
      else room.sockets.add(ws);
      room.lastActivity=Date.now();
      send(ws,{type:"joined",symbol,state:state(room)});
      broadcast(room,{type:"presence",players:{X:!!room.players.X,O:!!room.players.O}});
      return;
    }
    const room=meta.room; if(!room) return;
    room.lastActivity=Date.now();
    if(m.type==="move"){
      if(!meta.symbol || room.winner || meta.symbol!==room.turn) return send(ws,{type:"error",message:"Não é a tua vez."});
      const cell=Number(m.cell);
      if(!Number.isInteger(cell)||cell<0||cell>8||room.board[cell]) return send(ws,{type:"error",message:"Jogada inválida."});
      room.board[cell]=meta.symbol;
      const r=result(room.board);
      if(r){ room.winner=r.winner; room.winningLine=r.line; if(r.winner==="X"||r.winner==="O")room.score[r.winner]++; }
      else room.turn=meta.symbol==="X"?"O":"X";
      broadcast(room,{type:"state",state:state(room)}); return;
    }
    if(m.type==="chat"){
      const text=clean(m.text,300); if(!text)return;
      const msg={id:id("msg"),name:meta.name,symbol:meta.symbol,text,at:Date.now()};
      room.messages.push(msg); broadcast(room,{type:"chat",message:msg}); return;
    }
    if(m.type==="restart"){
      room.board=Array(9).fill(null); room.turn="X"; room.winner=null; room.winningLine=[];
      broadcast(room,{type:"state",state:state(room)}); return;
    }
  });
  ws.on("close",()=>{const room=meta.room;if(room){room.sockets.delete(ws);if(meta.symbol&&room.players[meta.symbol]===ws)room.players[meta.symbol]=null;broadcast(room,{type:"presence",players:{X:!!room.players.X,O:!!room.players.O}});}clients.delete(ws);});
});
setInterval(()=>{const cutoff=Date.now()-6*60*60*1000;for(const [k,r] of rooms)if(!r.sockets.size&&r.lastActivity<cutoff)rooms.delete(k);},15*60*1000);
server.listen(PORT,HOST,()=>console.log(`${APP_NAME} v9.0 em ${HOST}:${PORT}`));
