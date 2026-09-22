const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const toast=m=>{const t=$("#toast");t.textContent=m;t.style.display="block";setTimeout(()=>t.style.display="none",2200)};
async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opt});const d=await r.json();if(!r.ok)throw Error(d.error||"Erro");return d}
function page(id){$$(".page").forEach(x=>x.classList.remove("active"));$("#"+id).classList.add("active")}
$$("[data-page]").forEach(b=>b.onclick=()=>{page(b.dataset.page);if(b.dataset.page==="championships")loadCups();if(b.dataset.page==="ranking")loadRanking()});
$("#newCup").onclick=$("#newCup2").onclick=()=>page("create");
$("#quickRoom").onclick=async()=>{const d=await api("/api/championships",{method:"POST",body:JSON.stringify({name:"Partida rápida",format:"knockout",powersEnabled:false})});const c=d.championship;await api(`/api/championships/${c.id}/team`,{method:"POST",body:JSON.stringify({name:"Jogador X",acronym:"X"})});await api(`/api/championships/${c.id}/team`,{method:"POST",body:JSON.stringify({name:"Jogador O",acronym:"O"})});await api(`/api/championships/${c.id}/generate`,{method:"POST",body:"{}"});const s=await api(`/api/championships/${c.id}`);openManage(s.championship)};

$("#cupForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target), powers=$$('input[name="p"]:checked').map(x=>x.value);
try{const d=await api("/api/championships",{method:"POST",body:JSON.stringify({name:f.get("name"),description:f.get("description"),format:f.get("format"),doubleRound:f.has("doubleRound"),powersEnabled:f.has("powersEnabled"),enabledPowers:powers,powerGainPerWin:f.get("gain"),chatEnabled:f.has("chat"),voiceEnabled:f.has("voice"),reactionsEnabled:f.has("reactions")})});openManage(d.championship)}catch(err){toast(err.message)}};

async function loadCups(){const d=await api("/api/championships");$("#cups").innerHTML=d.championships.map(c=>`<div class="cup"><h3>${esc(c.name)}</h3><p>${esc(c.description||"")}</p><p class="small">Código: <b>${c.code}</b> · ${c.status} · Poderes: ${c.powerRules.enabled?"ATIVADOS":"desativados"}</p><button onclick='openManage(${JSON.stringify(c)})'>Abrir</button></div>`).join("")||"<p>Nenhum campeonato.</p>"}
async function openManage(c){page("manage");renderManage(c)}
function renderManage(c){
$("#manageBox").innerHTML=`<div class="playtop"><h2>${esc(c.name)}</h2><button onclick="page('championships');loadCups()">Voltar</button></div>
<div class="grid three"><div class="panel"><b>Código</b><h2>${c.code}</h2><p>${c.description||""}</p></div><div class="panel"><b>⚡ Poderes</b><p>${c.powerRules.enabled?"Ativos":"Desativados"}</p><p>+${c.powerRules.gainPerWin} por vitória</p></div><div class="panel"><b>💬 Comunicação</b><p>Chat: ${c.chatEnabled?"sim":"não"} · Voz: ${c.voiceEnabled?"sim":"não"}</p></div></div>
${c.status==="setup"?`<div class="card"><h3>Adicionar equipa</h3><form onsubmit="addTeam(event,'${c.id}')"><input name="name" placeholder="Nome da equipa" required><input name="acronym" placeholder="Sigla"><button class="primary">Adicionar</button></form></div>`:""}
<div class="teamlist">${c.teams.map(t=>`<div class="team"><b>${esc(t.name)}</b> <span class="small">(${esc(t.acronym)})</span><div>⚡ ${t.powerPoints||0} pontos de poder · código ${t.joinCode}</div><div class="small">${(t.players||[]).map(p=>esc(p.name)).join(", ")||"Sem jogadores"}</div>${c.status==="setup"?`<form onsubmit="addPlayer(event,'${c.id}','${t.id}')"><input name="name" placeholder="Nome do jogador" required><button>Adicionar jogador</button></form>`:""}</div>`).join("")}</div>
${c.status==="setup"?`<button class="primary" onclick="generate('${c.id}')">Gerar campeonato e bloquear regras</button>`:""}
${c.status!=="setup"?`<h3>Classificação</h3>${standTable(c.standings)}<h3>Calendário</h3><div class="fixtures">${c.fixtures.map(f=>fixtureHTML(c,f)).join("")}</div>`:""}`;
}
function standTable(a){return `<table class="table"><tr><th>#</th><th>Equipa</th><th>V</th><th>E</th><th>D</th><th>Pts</th><th>⚡</th></tr>${a.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${x.wins}</td><td>${x.draws}</td><td>${x.losses}</td><td>${x.points}</td><td>${x.powers}</td></tr>`).join("")}</table>`}
function fixtureHTML(c,f){const h=c.teams.find(t=>t.id===f.homeTeamId),a=c.teams.find(t=>t.id===f.awayTeamId);return `<div class="fixture"><b>${h?.name||"A definir"} × ${a?.name||"A definir"}</b><div>${f.status==="finished"?`Resultado: ${f.homeScore}-${f.awayScore}`:"Agendada"}</div>${f.status!=="finished"&&h&&a?`<button onclick="startFixture('${c.id}','${f.id}')">Entrar na partida</button><button onclick="manualResult('${c.id}','${f.id}')">Registar resultado</button>`:""}</div>`}
async function addTeam(e,cid){e.preventDefault();const f=new FormData(e.target);await api(`/api/championships/${cid}/team`,{method:"POST",body:JSON.stringify({name:f.get("name"),acronym:f.get("acronym")})}).then(d=>renderManage(d.championship))}
async function addPlayer(e,cid,tid){e.preventDefault();const f=new FormData(e.target);await api(`/api/championships/${cid}/player`,{method:"POST",body:JSON.stringify({teamId:tid,name:f.get("name")})}).then(d=>api(`/api/championships/${cid}`).then(x=>renderManage(x.championship)))}
async function generate(cid){try{const d=await api(`/api/championships/${cid}/generate`,{method:"POST",body:"{}"});renderManage(d.championship)}catch(e){toast(e.message)}}
async function manualResult(cid,fid){const h=prompt("Golos/pontos da equipa da casa:","1"),a=prompt("Golos/pontos da equipa visitante:","0");if(h===null||a===null)return;const d=await api(`/api/championships/${cid}/result`,{method:"POST",body:JSON.stringify({fixtureId:fid,homeScore:Number(h),awayScore:Number(a)})});renderManage(d.championship)}
async function startFixture(cid,fid){const d=await api(`/api/championships/${cid}/room`,{method:"POST",body:JSON.stringify({fixtureId:fid})});openPlay(d.roomCode,cid,fid)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

let sock, roomState, currentChamp, mySymbol, myTeam;
function openPlay(roomCode,cid,fid){page("play");api(`/api/championships/${cid}`).then(d=>{currentChamp=d.championship;const f=currentChamp.fixtures.find(x=>x.id===fid);myTeam=prompt(`Código da equipa (${f.homeTeamId===currentChamp.teams[0]?.id?"exemplo":""}). Deixe vazio para espectador:`)||null;connect(roomCode,myTeam)})}
function connect(roomCode,teamId){sock=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);sock.onopen=()=>sock.send(JSON.stringify({type:"join",roomCode,teamId}));sock.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==="joined"||m.type==="state"){roomState=m.state;if(m.championship)currentChamp=m.championship;if(m.symbol)mySymbol=m.symbol;renderPlay()}else if(m.type==="chat")addMsg(m.message);else if(m.type==="reaction")toast(`${m.from} reagiu ${m.emoji}`);
else if(m.type==="voice-signal")handleVoiceSignal(m);else if(m.type==="power-result")toast(m.cell===null?"Nenhuma casa livre.":`👁️ Visão: tenta a casa ${m.cell+1}`);else if(m.type==="error")toast(m.message);};sock.onclose=()=>toast("Ligação encerrada.")}

function renderPlay(){const s=roomState,c=currentChamp;$("#playBox").innerHTML=`<div class="playtop"><div><h2>Partida ${s.code}</h2><div class="status">Tu és <b>${mySymbol||"espectador"}</b> · ${s.winner?("Fim: "+s.winner):"Vez: "+s.turn}</div></div><button onclick="page('home')">Sair</button></div>
<div class="board">${s.board.map((v,i)=>`<button class="cell" onclick="move(${i})">${v||""}</button>`).join("")}</div>
${c?.powerRules?.enabled?`<div class="panel"><b>⚡ Poderes</b><div class="powerbar">${c.powerRules.enabledPowers.map(p=>{const q=POWER_CATALOG[p];return `<button onclick="power('${p}')">${q.icon} ${q.name} · ${q.cost}</button>`}).join("")}</div></div>`:""}
<div class="grid three"><div class="panel chat"><b>💬 Chat da partida</b><div id="messages" class="messages"></div><div class="emojirow">${["👍","❤️","😂","🔥","😮","👏","🎉"].map(e=>`<button onclick="react('${e}')">${e}</button>`).join("")}</div><div class="composer"><input id="chatInput" placeholder="Escreve uma mensagem…" onkeydown="if(event.key==='Enter')chat()"><button onclick="chat()">Enviar</button></div></div>
<div class="panel"><b>🎙️ Voz</b><p class="small">O áudio é direto entre navegadores. Precisa de HTTPS ou localhost e permissão do microfone.</p><button onclick="toggleMic()" id="micBtn">🎙️ Ativar microfone</button><audio id="remoteAudio" autoplay></audio></div>
<div class="panel"><b>ℹ️ Regras</b><p>${c?.powerRules?.enabled?"Poderes ativos. Cada vitória acrescenta "+c.powerRules.gainPerWin+" ponto(s) à equipa vencedora.":"Poderes desativados neste campeonato."}</p><p class="small">O chat não é guardado no ficheiro do campeonato.</p></div></div>`}
function move(i){sock?.send(JSON.stringify({type:"move",cell:i}))}
function power(p){sock?.send(JSON.stringify({type:"power",power:p}))}
function chat(){const i=$("#chatInput");if(i?.value.trim())sock.send(JSON.stringify({type:"chat",channel:"match",text:i.value.trim()}));if(i)i.value=""}
function react(e){sock?.send(JSON.stringify({type:"reaction",emoji:e}))}
function addMsg(m){const box=$("#messages");if(!box)return;const d=document.createElement("div");d.className="msg";d.textContent=`${m.from||"•"}: ${m.text}`;box.appendChild(d);box.scrollTop=box.scrollHeight}
let micStream=null,pc=null;
async function toggleMic(){try{if(!micStream){micStream=await navigator.mediaDevices.getUserMedia({audio:true});$("#micBtn").textContent="🔇 Desligar microfone";startVoice(micStream)}else{micStream.getTracks().forEach(t=>t.stop());micStream=null;$("#micBtn").textContent="🎙️ Ativar microfone"}}catch(e){toast("Não foi possível ativar o microfone.")}}
async function startVoice(stream){
 if(!sock)return;
 pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
 stream.getTracks().forEach(t=>pc.addTrack(t,stream));
 pc.onicecandidate=e=>{if(e.candidate)sock.send(JSON.stringify({type:"voice-signal",data:{candidate:e.candidate}}))};
 pc.ontrack=e=>$("#remoteAudio").srcObject=e.streams[0];
 const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
 sock.send(JSON.stringify({type:"voice-signal",data:{description:pc.localDescription}}));
}
async function handleVoiceSignal(m){
 if(!sock)return;
 if(!pc) {
   if(!micStream) return; // responder must grant microphone first
   pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
   micStream.getTracks().forEach(t=>pc.addTrack(t,micStream));
   pc.onicecandidate=e=>{if(e.candidate)sock.send(JSON.stringify({type:"voice-signal",data:{candidate:e.candidate}}))};
   pc.ontrack=e=>$("#remoteAudio").srcObject=e.streams[0];
 }
 try{
   if(m.data?.description?.type==="offer"){
     await pc.setRemoteDescription(m.data.description);
     const answer=await pc.createAnswer(); await pc.setLocalDescription(answer);
     sock.send(JSON.stringify({type:"voice-signal",data:{description:pc.localDescription}}));
   } else if(m.data?.description?.type==="answer"){
     await pc.setRemoteDescription(m.data.description);
   } else if(m.data?.candidate){
     await pc.addIceCandidate(m.data.candidate);
   }
 }catch(e){console.warn("WebRTC signal:",e)}
}
async function loadRanking(){const d=await api("/api/ranking/players");$("#rankingBox").innerHTML=`<table class="table"><tr><th>#</th><th>Jogador</th><th>Equipa</th><th>Vitórias da equipa</th><th>⚡</th></tr>${d.ranking.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${esc(x.team)}</td><td>${x.wins}</td><td>${x.powers}</td></tr>`).join("")}</table>`}
const POWER_CATALOG={extra_move:{name:"Movimento extra",cost:2},shield:{name:"Escudo",cost:2},vision:{name:"Visão",cost:3},block:{name:"Bloqueio",cost:3}};
loadCups();
