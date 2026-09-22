let ws=null, roomCode="", mySymbol=null, current=null;
const $=id=>document.getElementById(id);
function view(id){document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));}
function toast(t){$("toast").textContent=t;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",2200);}
function connect(code,name){roomCode=code;view("room");$("roomTitle").textContent=`Sala #${code}`;if(ws)ws.close();
  const proto=location.protocol==="https:"?"wss":"ws";ws=new WebSocket(`${proto}://${location.host}`);
  ws.onopen=()=>ws.send(JSON.stringify({type:"join",roomCode:code,name}));
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==="joined"||m.type==="state"){if(m.symbol)mySymbol=m.symbol;render(m.state)}if(m.type==="presence"){current.players=m.players;render(current)}if(m.type==="chat"){addMessage(m.message)}if(m.type==="error")toast(m.message)};
  ws.onclose=()=>{if($("room").classList.contains("active"))$("status").textContent="Ligação perdida. Tenta entrar novamente."};
}
function render(s){current=s;$("px").textContent=s.players.X?"Ligado":"Aguardando";$("po").textContent=s.players.O?"Ligado":"Aguardando";
  $("status").textContent=s.winner?(s.winner==="draw"?"Empate!":`Vitória do jogador ${s.winner}`):(s.players.X&&s.players.O?(s.turn===mySymbol?"É a tua vez":"Vez do adversário"):"Aguardando outro jogador…");
  $("board").innerHTML="";s.board.forEach((v,i)=>{const b=document.createElement("button");b.className="cell "+(v?v.toLowerCase():"");b.textContent=v||"";b.disabled=!!v||!!s.winner||!mySymbol||s.turn!==mySymbol||!s.players.X||!s.players.O;b.onclick=()=>ws.send(JSON.stringify({type:"move",cell:i}));if(s.winningLine?.includes(i))b.classList.add("win");$("board").appendChild(b)});
  $("messages").innerHTML="";s.messages?.forEach(addMessage);
}
function addMessage(m){const d=document.createElement("div");d.className="message";d.innerHTML=`<b>${escapeHtml(m.name)}:</b>${escapeHtml(m.text)}`;$("messages").appendChild(d);$("messages").scrollTop=$("messages").scrollHeight}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function create(){const r=await fetch("/api/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Partida rápida"})});const d=await r.json();const name=prompt("Qual é o teu nome?","Jogador")||"Jogador";connect(d.roomCode,name);toast(`Sala criada: ${d.roomCode}`)}
$("quick").onclick=create;$("joinOpen").onclick=()=>view("join");
$("joinForm").onsubmit=e=>{e.preventDefault();connect($("joinCode").value.toUpperCase(),$("joinName").value)};
$("copyRoom").onclick=()=>{toast(`Código da sala: ${roomCode}`)};
$("restart").onclick=()=>ws?.send(JSON.stringify({type:"restart"}));
$("leave").onclick=()=>{ws?.close();mySymbol=null;current=null;view("home")};
$("chatForm").onsubmit=e=>{e.preventDefault();const t=$("chatInput").value.trim();if(t&&ws){ws.send(JSON.stringify({type:"chat",text:t}));$("chatInput").value=""}};
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>view(b.dataset.view));
