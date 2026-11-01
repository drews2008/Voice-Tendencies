/* Sideline Tendencies — shared game + notes.
   Loaded after the main script in index.html and uses its globals
   (S, blank, FT, TEAM, $, esc, sim, needsDist, render, refresh, say, speakText, human, lastSay, lastIncomplete, speakOn).
   Weekly opponent updates only touch index.html; leave this file alone and keep the
   <script src="game.js"> tag and the GAME.* hook lines in index.html.

   How the sync works: every device in a game subscribes to the same relay channel.
   A situation entered on any device (voice, typing, buttons) is sent to all of them;
   each device with "Voice reply: on" reads it out. Notes go to every device in the game.
   Each device carries a person's name, so notes can be sent to one person or saved for later.
   Relay = ntfy.sh (free, no account). Anyone holding the game code can read the channel,
   so the code is random and changes every game. To self-host later, change RELAY.

   Voice / typed commands:
     note 22 is limping                      -> note to everyone
     send note to Mike 22 is limping         -> note for Mike only (read out on Mike's devices)
     save note for later check the punt team -> saved for later, never read out during the game
     what notes do I have / read my notes    -> reads your unread notes
     read all my notes / what's saved for later / read all notes */
const SL_VERSION='talk-5';
window.addEventListener('error',e=>{try{const h=document.getElementById('heard');if(h)h.textContent='⚠ App error ('+SL_VERSION+'): '+(e.message||e)+'. Send Drew a screenshot.'}catch(x){}});
(()=>{
const RELAY='https://ntfy.sh/';
const PREFIX='kcs-sideline-';
const AB='23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const FRESH_MS=20000;                       // older messages (replayed on join) update the screen but are never spoken
const rid=n=>{const a=new Uint32Array(n);crypto.getRandomValues(a);return Array.from(a,x=>AB[x%AB.length]).join('')};
const get=(k,d)=>{try{const v=localStorage.getItem('sl.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}};
const put=(k,v)=>{try{localStorage.setItem('sl.'+k,JSON.stringify(v))}catch(e){}};
const me=get('me',null)||(()=>{const id=rid(8);put('me',id);return id})();
const ua=navigator.userAgent;
const devType=(/iPad|Tablet/i.test(ua)||(/Android/i.test(ua)&&!/Mobile/i.test(ua))||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1))?'Tablet':/iPhone|Mobile|Android/i.test(ua)?'Phone':'Laptop';
let devName=get('name','')||devType;
const named=()=>!!get('name','');
let code=null,es=null,lastId=null,status='off',retry=null,soonT=null,pending=null,readNotes=get('readNotes',true),unread=0,wl=null,teamWarned=false,lastSitAt=0,saidHi=false;
let notes=[],roster=[],view='all';
let readIds=new Set(get('readIds',[]));
const markRead=list=>{list.forEach(n=>readIds.add(n.id));put('readIds',[...readIds].slice(-800))};
const nkey=()=>'notes.'+(code||'solo');
const saveNotes=()=>put(nkey(),notes);
const loadNotes=()=>{notes=get(nkey(),[]);roster=code?get('roster.'+code,[]):[]};
const norm=s=>String(s||'').trim().toLowerCase();
const sameName=(a,b)=>{a=norm(a);b=norm(b);return !!a&&!!b&&(a===b||a.split(/\s+/)[0]===b.split(/\s+/)[0])};
const forMe=n=>!!n.to&&sameName(n.to,devName);
const mineLater=n=>n.later&&(n.from===me||sameName(n.by,devName));
const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;

/* ---------- styles + markup ---------- */
const css=document.createElement('style');
css.textContent=`
#gm{margin:0 0 8px}
#snd{display:none;width:100%;margin:0 0 8px;min-height:56px;font-size:18px;background:var(--run);color:#fff;border-color:var(--run)}
.gb{display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:var(--card);border:1.5px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:8px}
.gb .gt{flex:1 1 180px;font-size:15px}.gb .gt small{display:block;color:var(--mute);font-size:13px}
.gb button{min-height:42px;font-size:15px;padding:6px 12px}
.gb .nm{color:inherit;font-weight:700}.gb .nm.need{color:var(--run)}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 4px 0 2px;background:var(--mute);vertical-align:middle}
.dot.live{background:#2f9e44}.dot.connecting,.dot.reconnecting{background:#e8a317}
#nt{background:var(--card);border:1.5px solid var(--line);border-radius:10px;padding:8px 10px;margin:0}
#nt summary{font:700 19px 'Barlow Condensed',system-ui,sans-serif;color:var(--ink);min-height:36px;display:flex;align-items:center;gap:8px}
#ntc{font:600 13px system-ui,sans-serif;color:var(--mute)}
.badge{background:var(--run);color:#fff;border-radius:10px;padding:1px 8px;font:700 13px system-ui,sans-serif}
.ntto{display:flex;gap:8px;align-items:center;font-size:14px;color:var(--mute);margin-top:6px}
.ntto select{flex:1;min-height:44px;font:600 16px system-ui,sans-serif;border:1.5px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);padding:4px 8px}
.ntin{display:flex;gap:6px;margin:6px 0}
#ntx{flex:1;min-height:52px;font:500 17px Barlow,system-ui,sans-serif;padding:8px;border:1.5px solid var(--ink);border-radius:8px;background:var(--bg);color:var(--ink);resize:vertical}
.ck{display:flex;gap:8px;align-items:center;font-size:14px;color:var(--mute);min-height:36px}
.ck input{width:20px;height:20px}
#ntl{list-style:none;padding:0;margin:6px 0}
#ntl li{border-top:1px solid var(--line);padding:7px 0;display:flex;gap:8px;align-items:flex-start}
#ntl li div{flex:1}#ntl .m,.nb .m{color:var(--mute);font-size:12px}#ntl .x{font-size:16px}
#ntl li.pend .m::after,.nb.pend .m::after{content:' · not sent yet';color:var(--run)}
#ntl button{min-height:36px;padding:2px 10px;font-size:14px}
.tag{display:inline-block;border-radius:6px;padding:0 6px;margin-right:4px;font:700 12px system-ui,sans-serif;background:var(--line);color:var(--ink)}
.tag.me{background:var(--run);color:#fff}.tag.lt{background:var(--pass);color:#fff}
li.forme,.nb.forme{border-left:4px solid var(--run);padding-left:8px!important}
.nta{display:flex;gap:6px;flex-wrap:wrap}.nta button{flex:1 1 120px;min-height:42px;font-size:15px}
#nall{position:fixed;inset:0;z-index:50;background:var(--bg);overflow-y:auto;display:none;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}
#nall .in{max-width:600px;margin:0 auto;padding:14px 14px 56px}
#nall .top{display:flex;gap:8px;align-items:center;position:sticky;top:0;background:var(--bg);padding:6px 0 8px;z-index:1}
#nall .top h2{flex:1;margin:0;font:700 24px 'Barlow Condensed',system-ui,sans-serif}
.vw{display:flex;gap:6px;margin-bottom:8px}.vw button{flex:1;min-height:44px;font-size:15px}
#nf{width:100%;min-height:46px;font:500 17px Barlow,system-ui,sans-serif;padding:8px 10px;border:1.5px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);margin-bottom:10px}
.ng{background:var(--card);border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:10px}
.ng .gh{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.ng .gh b{flex:1;font:700 19px 'Barlow Condensed',system-ui,sans-serif}.ng .gh span{color:var(--mute);font-size:13px}
.ng .nb{border-top:1px solid var(--line);padding:7px 0}
.ng .ga{display:flex;gap:6px;margin-top:6px}.ng .ga button{flex:1;min-height:40px;font-size:14px}
#nbt.hot{background:var(--run);color:#fff;border-color:var(--run)}
`;
document.head.appendChild(css);
const box=document.createElement('div');box.id='gm';
box.innerHTML=`<button type="button" id="snd"></button><div class="gb" id="gbar"></div>
<details id="nt"><summary>Quick note <span id="ntc"></span></summary>
<label class="ntto">To <select id="nto"></select></label>
<div class="ntin"><textarea id="ntx" rows="2" enterkeyhint="send" placeholder="Type a note, Enter sends. Hands-free: &quot;note…&quot;, &quot;send note to Mike…&quot;, &quot;save note for later…&quot;"></textarea><button id="nts" type="button" class="go">Send</button></div>
<label class="ck"><input type="checkbox" id="ntr"> Read everyone-notes out loud too (notes sent to you are always read)</label>
<ol id="ntl"></ol>
<div class="nta"><button id="ntcp" type="button">Copy / share all</button></div>
</details>`;
document.querySelector('main .row').after(box);
const nb=document.createElement('button');nb.type='button';nb.id='nbt';nb.textContent='Notes';
document.querySelector('main .row').appendChild(nb);
const ov=document.createElement('div');ov.id='nall';ov.setAttribute('role','dialog');ov.setAttribute('aria-label','All notes');
ov.innerHTML=`<div class="in"><div class="top"><h2>Notes</h2><button type="button" class="go" id="nx">Close</button></div>
<div class="vw" id="nvw"><button type="button" data-v="all">All</button><button type="button" data-v="me">For me</button><button type="button" data-v="later">For later</button></div>
<input id="nf" type="search" placeholder="Search notes (number, formation, name…)" autocomplete="off">
<div id="nlist"></div>
<div class="foot">Notes are saved in this browser on this device. Every device in a game gets a copy of that game's notes. Clearing browser data or switching browsers removes them, so share or copy a game's notes after it ends to keep them.</div></div>`;
document.body.appendChild(ov);

/* ---------- names ---------- */
function askName(){
  const n=(prompt('Your name, so people can send notes to you (first name is fine):',named()?devName:'')||'').trim().slice(0,24);
  if(!n)return false;
  devName=n;put('name',n);addRoster(n);bar();drawNotes();if(code)pub({t:'hi'});return true;
}
function addRoster(n){
  n=String(n||'').trim();if(!n||!code||/^(Phone|Tablet|Laptop)$/.test(n))return;
  if(roster.some(x=>norm(x)===norm(n)))return;
  roster.push(n);put('roster.'+code,roster);drawTo();
}
function drawTo(){
  const sel=$('nto'),cur=sel.value;
  const others=roster.filter(x=>!sameName(x,devName));
  sel.innerHTML='<option value="">Everyone</option><option value="@later">For later (just me)</option>'+others.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if([...sel.options].some(o=>o.value===cur))sel.value=cur;
}

/* ---------- game bar ---------- */
const fmt=c=>c.slice(0,4)+'-'+c.slice(4);
function bar(){
  const b=$('gbar');
  if(!code){
    b.innerHTML=`<div class="gt"><b>This device only</b><small>Start a game to link your phone, tablet, and other coaches.</small></div>
<button type="button" class="go" id="gst">Start game</button><button type="button" id="gjn">Join game</button>`;
    $('gst').onclick=()=>{if(!named())askName();join(rid(8));share()};
    $('gjn').onclick=()=>{const c=(prompt('Game code (from the other device):')||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length>=6){if(!named())askName();join(c)}else if(c)alert('That code is too short.')};
  }else{
    const st={live:'Live',connecting:'Connecting…',reconnecting:'Reconnecting…'}[status]||status;
    const who=named()?`You: <a href="#" id="gnm" class="nm">${esc(devName)}</a> · tap to rename`:`<a href="#" id="gnm" class="nm need">Tap to set your name</a> so notes can be sent to you`;
    b.innerHTML=`<div class="gt"><b>Game ${fmt(code)}</b> <span class="dot ${status}"></span>${st}<small>${who}${roster.length?' · In game: '+roster.map(esc).join(', '):''}</small></div>
<button type="button" class="go" id="gsh">Add a device</button><button type="button" id="gts">Test sound</button><button type="button" id="glv">Leave</button>`;
    $('gts').onclick=()=>{const ok=say('Sound test.');pub({t:'ping'});$('heard').textContent='Sound test sent to every device in the game.'+(ok?'':' This device has Voice reply off.')};
    $('gsh').onclick=share;
    $('glv').onclick=()=>{if(confirm('Leave game '+fmt(code)+'? Notes stay saved on this device.'))leave()};
    $('gnm').onclick=e=>{e.preventDefault();askName()};
  }
  banner();
}
function link(){return location.origin+location.pathname+'#game='+code}
async function share(){
  const url=link(),text='Sideline Tendencies game '+fmt(code)+' — open on your device to join.';
  try{if(navigator.share){await navigator.share({title:'Sideline game',text,url});return}}catch(e){if(e&&e.name==='AbortError')return}
  try{await navigator.clipboard.writeText(url);alert('Link copied. Send it to the other device, or type code '+fmt(code)+' under Join game.')}
  catch(e){prompt('Send this link to the other device:',url)}
}

/* ---------- connection ---------- */
function setStatus(s){if(status!==s){status=s;bar()}}
function join(c){
  if(es){es.close();es=null}
  code=c;lastId=null;teamWarned=false;lastSitAt=0;saidHi=false;put('game',{code,at:Date.now()});
  if(!get('gmeta.'+code,null))put('gmeta.'+code,{team:TEAM,at:Date.now()});
  history.replaceState(null,'',location.pathname+location.search+'#game='+code);
  loadNotes();if(named())addRoster(devName);drawTo();drawNotes();connect();lock();
}
function leave(){
  if(es){es.close();es=null}clearTimeout(retry);
  code=null;status='off';put('game',null);
  history.replaceState(null,'',location.pathname+location.search);
  try{wl&&wl.release()}catch(e){}wl=null;
  loadNotes();drawTo();drawNotes();bar();
}
function connect(){
  if(!code)return;
  setStatus(lastId?'reconnecting':'connecting');
  const since=lastId||'12h';
  try{es=new EventSource(RELAY+PREFIX+code+'/sse?since='+encodeURIComponent(since))}catch(e){retryLater();return}
  es.onopen=()=>{setStatus('live');if(!saidHi&&named()){saidHi=true;pub({t:'hi'})}flush()};
  es.onmessage=e=>{let m,p;try{m=JSON.parse(e.data)}catch(x){return}
    if(m.event&&m.event!=='message')return;if(m.id)lastId=m.id;
    try{p=JSON.parse(m.message)}catch(x){return}
    handle(p,(m.time||0)*1000)};
  es.onerror=()=>{if(es){es.close();es=null}retryLater()};
}
function retryLater(){setStatus('reconnecting');clearTimeout(retry);retry=setTimeout(connect,3000)}
window.addEventListener('online',()=>{if(code&&!es)connect()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(code&&(!es||es.readyState===2))connect();if(code)lock()});
async function lock(){try{if(navigator.wakeLock&&!wl){wl=await navigator.wakeLock.request('screen');wl.addEventListener('release',()=>{wl=null})}}catch(e){}}
function pub(p){
  if(!code)return Promise.resolve(false);
  p.from=me;p.by=devName;p.named=named();p.team=TEAM;p.v=2;
  return fetch(RELAY+PREFIX+code,{method:'POST',body:JSON.stringify(p)}).then(r=>r.ok).catch(()=>false);
}
// resend notes that never made it (dead spot, network blip)
function flush(){notes.filter(n=>n.from===me&&n.pend).forEach(n=>pub({t:'note',n:strip(n)}).then(ok=>{if(ok){n.pend=false;saveNotes();drawNotes()}}))}
const strip=n=>({id:n.id,text:n.text,sit:n.sit,team:n.team,by:n.by,from:n.from,at:n.at,to:n.to||'',later:!!n.later});

/* ---------- incoming ---------- */
function handle(p,t){
  if(!p||!p.t)return;
  const fresh=Date.now()-t<FRESH_MS;
  if(p.named)addRoster(p.by);
  if(p.from===me){if(p.t==='note'){const n=notes.find(x=>x.id===p.n.id);if(n&&n.pend){n.pend=false;saveNotes();drawNotes()}}return}
  if(p.team&&p.team!==TEAM&&!teamWarned){teamWarned=true;$('heard').textContent=p.by+' is on '+p.team+' data and this device is on '+TEAM+'. Reload the page on the older one.'}
  if(p.t==='sit'){
    if(t<lastSitAt)return;lastSitAt=t;
    S=unpack(p.s);lastIncomplete=!!p.inc;$('q').value=speakText(S);refresh();render();
    $('heard').textContent='From '+p.by+': '+(human(S)||'cleared');
    if(fresh&&p.say)$('heard').textContent+=say(p.say)?'  🔊':'  🔇 sound is off on this device';
  }else if(p.t==='note'&&p.n&&p.n.id){
    if(notes.some(x=>x.id===p.n.id))return;
    const n=strip(p.n);notes.push(n);notes.sort((a,b)=>a.at-b.at);saveNotes();
    const mine=forMe(n);
    if(!$('nt').open&&(mine||(!n.to&&!n.later)))unread++;
    drawNotes();
    if(!fresh||n.later)return;
    if(mine){
      try{navigator.vibrate&&navigator.vibrate([80,60,80])}catch(e){}
      $('heard').textContent='📩 Note for you from '+n.by+': '+n.text;
      if(say('Note for you from '+n.by+'. '+n.text))markRead([n]);
    }else if(!n.to){
      try{navigator.vibrate&&navigator.vibrate(80)}catch(e){}
      if(readNotes)say('Note from '+n.by+'. '+n.text);
    }
  }else if(p.t==='ping'){
    if(!fresh)return;
    const ok=say('Sound test from '+p.by+'.');
    $('heard').textContent='Sound test from '+p.by+(ok?'  🔊':'  🔇 sound is off on this device — tap the red button');
  }else if(p.t==='del'){
    const i=notes.findIndex(x=>x.id===p.id);if(i>=0){notes.splice(i,1);saveNotes();drawNotes()}
  }
}
const pack=o=>({...o,form:o.form?o.form.name:null});
const unpack=p=>{const o=Object.assign(blank(),p||{});o.form=p&&p.form?FT.find(f=>f.name===p.form)||null:null;return o};

/* ---------- outgoing situation ---------- */
function pushSit(text){clearTimeout(soonT);soonT=null;pub({t:'sit',s:pack(S),inc:!!lastIncomplete,say:text||''})}
function pushSoon(){clearTimeout(soonT);soonT=setTimeout(()=>{say(lastSay);pushSit(lastSay)},1200)}
// typed situation with no Enter: once typing stops and the situation is complete, read it and send it
function typing(){
  clearTimeout(soonT);soonT=null;
  const v=$('q').value.trim();if(!v||isNote(v))return;
  soonT=setTimeout(()=>{const done=S.pt||S.fp||S.goal||(S.down&&!needsDist(S));if(done){say(lastSay);pushSit(lastSay)}},1800);
}

/* ---------- sound on/off banner ---------- */
let unlocked=false,failed=false;
function banner(){
  const b=$('snd');
  if(failed&&speakOn){b.textContent="🔇 Sound didn't play on this device — tap here";b.style.display='block'}
  else if(code&&!speakOn){b.textContent='🔇 Sound is off on this device — tap to turn on';b.style.display='block'}
  else if(code&&speakOn&&!unlocked){b.textContent='🔈 Tap here once to wake up sound on this device';b.style.display='block'}
  else b.style.display='none';
}
function sound(ok){if(ok===true){unlocked=true;failed=false}else if(ok===false){failed=true}banner()}
$('snd').addEventListener('click',()=>{failed=false;if(!speakOn){$('spk').click();return}try{speechSynthesis.cancel()}catch(e){}say('Sound on.');banner()});
// any first tap on the page wakes speech on iPhone/iPad, silently
document.addEventListener('pointerdown',()=>{if(unlocked||!speakOn||!window.speechSynthesis)return;try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;u.onend=()=>{unlocked=true;banner()};speechSynthesis.speak(u)}catch(e){}},{capture:true});

/* ---------- notes ---------- */
function addNote(text,opt){
  opt=opt||{};
  text=String(text||'').trim().slice(0,1500);if(!text)return null;
  const n={id:Date.now().toString(36)+rid(4),text:cap(text),sit:human(S)||'',team:TEAM,by:devName,from:me,at:Date.now(),to:opt.to||'',later:!!opt.later,pend:!!code};
  notes.push(n);markRead([n]);saveNotes();drawNotes();
  if(code)pub({t:'note',n:strip(n)}).then(ok=>{if(ok){n.pend=false;saveNotes();drawNotes()}});
  return n;
}
function confirmText(n){
  if(n.later)return['Saved for later.','Saved for later'];
  if(n.to)return code?['Sent to '+n.to+'.','Sent to '+n.to]:['Saved. Start a game to send it to '+n.to+'.','Saved, not sent (no game)'];
  return['Noted.','Note saved'+(code?' and sent':'')];
}
const tm=at=>new Date(at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const tags=n=>(n.later?'<span class="tag lt">Later</span>':'')+(n.to?`<span class="tag${forMe(n)?' me':''}">→ ${forMe(n)?'You':esc(n.to)}</span>`:'');
function drawNotes(){
  drawAll();
  $('ntc').innerHTML=notes.length+(notes.length==1?' note':' notes')+(code?' in this game':' on this device')+(unread?' <span class="badge">'+unread+' new</span>':'');
  $('ntl').innerHTML=notes.slice().reverse().map(n=>`<li class="${n.pend?'pend ':''}${forMe(n)?'forme':''}"><div><div class="m">${tm(n.at)} · ${esc(n.by)}${n.sit?' · '+esc(n.sit):''}</div><div class="x">${tags(n)}${esc(n.text)}</div></div>${n.from===me?`<button type="button" data-del="${esc(n.id)}" aria-label="Delete note">✕</button>`:''}</li>`).join('')||'<li><div class="m">No notes yet.</div></li>';
}
$('nt').addEventListener('toggle',()=>{if($('nt').open&&unread){unread=0;drawNotes()}});
$('ntr').checked=readNotes;
$('ntr').addEventListener('change',e=>{readNotes=e.target.checked;put('readNotes',readNotes)});
const send=()=>{
  const v=$('nto').value,opt=v==='@later'?{later:true}:{to:v};
  const n=addNote($('ntx').value,opt);if(!n)return;
  $('ntx').value='';$('heard').textContent=confirmText(n)[1]+'.';
};
$('nts').addEventListener('click',send);
$('ntx').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
$('ntl').addEventListener('click',e=>{const id=e.target.getAttribute&&e.target.getAttribute('data-del');if(!id||!confirm('Delete this note on every device?'))return;
  const i=notes.findIndex(x=>x.id===id);if(i>=0){notes.splice(i,1);saveNotes();drawNotes()}if(code)pub({t:'del',id})});
const noteLine=n=>tm(n.at)+' · '+n.by+(n.to?' → '+n.to:'')+(n.later?' · for later':'')+(n.sit?' · '+n.sit:'')+'\n'+n.text;
$('ntcp').addEventListener('click',async()=>{
  const head='Sideline notes · '+TEAM+(code?' · game '+fmt(code):'')+' · '+new Date().toLocaleDateString();
  const txt=head+'\n\n'+notes.map(noteLine).join('\n\n');
  try{if(navigator.share){await navigator.share({title:'Sideline notes',text:txt});return}}catch(e){if(e&&e.name==='AbortError')return}
  try{await navigator.clipboard.writeText(txt);alert('Notes copied.')}catch(e){prompt('Copy your notes:',txt)}
});

/* ---------- commands (voice + typed) ---------- */
const NOTE_RE=/^\s*(?:(?:send|save|take|make|leave|write|give) (?:a |me a |him a |her a )?(?:note|message)s?|coach'?s? note|notes?|noted|message)\b[\s,:.-]*(.*)$/i;
const LATER_RE=/^\s*(?:save|keep|put) (?:this |that |it )?for later\b[\s,:.-]*(.*)$/i;
const QUERY_RE=/^\s*(?:(?:what|which|any|read|check|play|give me|tell me|do i have|have i got|got any|are there)\b.*\b(?:notes?|messages?|saved|later)\b|(?:my )?notes for me\b|what'?s (?:saved )?for later\b)/i;
const SOUNDS_LIKE=/^\s*(?:know|knows|not|nope|nate|nodes?)\b/i;
const STOP=new Set('the a an this that it they he she we you them their his her our my your team safety corner linebacker backer end tackle guard center qb rb tb fb wb te wr wrs slot slots wing wide pro trips spread tight split i formation play run pass sweep power dive motion left right middle hash first second third fourth goal red zone punt kick kickoff return defense offense number no yes on at in of to and is are was'.split(' '));
FT.forEach(f=>f.name.toLowerCase().split(/\s+/).forEach(w=>STOP.add(w)));
// "to Mike 22 is limping" -> {to:'Mike', text:'22 is limping'}
function splitName(rest){
  const t=rest.trim().replace(/^[,:;.\s-]+/,'').split(/\s+/).map(w=>w.replace(/[,:;.!?]+$/,''));
  if(/^(me|myself)$/i.test(t[0]))return{to:devName,text:t.slice(1).join(' ')};
  let best=null;
  roster.forEach(name=>{const w=norm(name).split(/\s+/);
    [w.length,1].forEach(k=>{if(k>t.length)return;const said=t.slice(0,k).join('').toLowerCase().replace(/'s$/,''),target=(k===1?w[0]:w.join(''));
      const v=said===target?2:sim(said,target);if(v>=0.75&&(!best||v>best.v))best={name,k,v}})});
  if(best)return{to:best.name,text:t.slice(best.k).join(' ')};
  const w=t[0].toLowerCase().replace(/'s$/,'');
  if(/^[a-z]{2,}$/.test(w)&&!STOP.has(w))return{to:cap(w),text:t.slice(1).join(' ')};
  return null;
}
const tidy=s=>String(s||'').replace(/^\s*(?:that|saying|says|to say|tell (?:him|her|them))\b[\s,:]*/i,'').trim();
// what phone recognizers write instead of the command words
const FIXES=[
  [/^\s*(?:send|sent|sin|sen|set)(?: a| an)? (?:no|know|knows|now|nope|nodes?|not|knot)\b/i,'send note'],
  [/^\s*senate\b/i,'send note'],
  [/^\s*(?:safe|say|saved|sale)(?: a)? (?:note|no|know|nope|not)\b/i,'save note'],
  [/^\s*(?:take|make)(?: a)? (?:no|know|nope|not)\b/i,'take note'],
  [/^\s*(?:no|know|nope|not) (?:for|to) (later|\w+)/i,'note for $1'],
  [/\b(?:four|4) later\b/ig,'for later'],[/\b(?:too|2) later\b/ig,'to later'],
  [/\b(?:knows|nodes|notice)\b/ig,'notes']
];
function fix(s){s=String(s||'').trim().replace(/[.!?]+$/,'');FIXES.forEach(([re,to])=>{s=s.replace(re,to)});return s}
function parseCmd(raw){
  const s=fix(raw);if(!s)return null;
  if(/^\s*(?:show|open|see|pull up) (?:me )?(?:my |the |all |saved )*notes\b/i.test(s))return{kind:'query',scope:/later/i.test(s)?'later':'all',show:true};
  if(/^\s*(?:my|saved|all|game) notes$/i.test(s))return{kind:'query',scope:/^\s*my/i.test(s)?'me':'any',all:/^\s*my/i.test(s)?false:true};
  if(QUERY_RE.test(s)){
    const scope=/later/i.test(s)?'later':/\b(all|every)\b/i.test(s)&&!/\bmy\b|\bme\b|\bi\b/i.test(s)?'all':/\bsaved\b/i.test(s)?'any':'me';
    return{kind:'query',scope,all:/\b(all|every|old)\b/i.test(s)};
  }
  let m=s.match(LATER_RE);if(m)return{kind:'note',later:true,text:tidy(m[1])};
  m=s.match(NOTE_RE);if(!m)return null;
  let rest=m[1].trim();
  const lt=rest.match(/^(?:for|to) later\b[\s,:.-]*(.*)$/i);if(lt)return{kind:'note',later:true,text:tidy(lt[1])};
  const to=rest.match(/^(?:for|to)\s+(.+)$/i);
  if(to){const r=splitName(to[1]);if(r)return{kind:'note',to:r.to,text:tidy(r.text)}}
  return{kind:'note',text:tidy(rest)};
}
function runQuery(q){
  const pool=notes;
  let list,label;
  if(q.show){view=q.scope==='later'?'later':'all';openAll();$('heard').textContent='Notes open.';return}
  if(q.scope==='any'){q.scope='all'}
  if(q.scope==='later'){list=pool.filter(mineLater);label='saved for later'}
  else if(q.scope==='all'){list=pool.filter(n=>!n.later||mineLater(n)).slice(-8);label='in this game'}
  else{const all=pool.filter(forMe);list=q.all?all:all.filter(n=>!readIds.has(n.id));label=q.all?'for you':'new for you';
    if(!list.length){
      const recent=pool.filter(n=>!n.later||mineLater(n)).slice(-5);
      if(all.length||!recent.length){const msg=all.length?'No new notes for you. You have '+all.length+' older. Say read all my notes.':'No notes yet.';$('heard').textContent=msg;say(msg);return}
      list=recent;label='in this game, none sent to you directly';
    }}
  if(!list.length){const msg='No notes '+label+'.';$('heard').textContent=msg;say(msg);return}
  const shown=list.slice(-6);
  const spoken='You have '+list.length+' note'+(list.length==1?'':'s')+' '+label+'. '+shown.map(n=>(q.scope==='later'||n.from===me||sameName(n.by,devName)?'':'From '+n.by+'. ')+n.text).join('. ')+(list.length>shown.length?'. And '+(list.length-shown.length)+' more on the Notes screen.':'');
  $('heard').textContent=list.length+' note'+(list.length==1?'':'s')+' '+label+' — tap Notes to see them.';
  if(say(spoken)||!speakOn)markRead(list);
  if(!speakOn){view=q.scope==='later'?'later':q.scope==='me'?'me':'all';openAll()}
  drawNotes();
}
function doNote(c){
  if(!c.text){
    pending={to:c.to||'',later:!!c.later,t:setTimeout(()=>{pending=null},15000)};
    const who=c.later?'Note for later':c.to?'Note for '+c.to:'Note';
    $('heard').textContent=who+': go ahead, I\'m listening…';say('Go ahead.');return;
  }
  const n=addNote(c.text,{to:c.to,later:c.later});if(!n)return;
  const [sp,tx]=confirmText(n);
  $('heard').textContent=tx+': "'+n.text+'"';say(sp);
}
function voice(alts){
  if(pending){
    clearTimeout(pending.t);const p=pending;pending=null;
    const t=alts[0];
    if(/^(cancel|never ?mind|forget it|nothing)\b/i.test(t)){$('heard').textContent='Note canceled.';say('Canceled.');return true}
    doNote({text:t,to:p.to,later:p.later});return true;
  }
  let c=parseCmd(alts[0]);
  if(!c&&SOUNDS_LIKE.test(alts[0]))alts.slice(1).some(a=>(c=parseCmd(a)));
  if(!c)return false;
  if(c.kind==='query')runQuery(c);else doNote(c);
  return true;
}
function typed(v){
  clearTimeout(soonT);soonT=null;
  const c=parseCmd(v);if(!c)return false;
  if(c.kind==='note'&&!c.text)return false;
  $('q').value='';
  if(c.kind==='query')runQuery(c);else doNote(c);
  return true;
}
const isNote=v=>!!parseCmd(v);

/* ---------- notes screen (every game saved on this device) ---------- */
function allGames(){
  const out=[];
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k||!k.startsWith('sl.notes.'))continue;
    const g=k.slice(9),list=get('notes.'+g,[]);if(!list.length)continue;
    const meta=get('gmeta.'+g,null)||{};
    const team=meta.team||(list.find(n=>n.team)||{}).team||'';
    out.push({g,list,team,last:Math.max(...list.map(n=>n.at))})}}catch(e){}
  return out.sort((a,b)=>b.last-a.last);
}
const day=at=>new Date(at).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});
const gameText=G=>'Sideline notes · '+(G.team||'')+(G.g==='solo'?' · this device':' · game '+fmt(G.g))+' · '+day(G.last)+'\n\n'+G.list.map(noteLine).join('\n\n');
const inView=n=>view==='me'?forMe(n):view==='later'?mineLater(n):true;
function drawAll(){
  const f=$('nf').value.trim().toLowerCase(),games=allGames();
  const total=games.reduce((a,G)=>a+G.list.length,0);
  const newMe=notes.filter(n=>forMe(n)&&!readIds.has(n.id)).length;
  nb.textContent='Notes ('+total+')'+(newMe?' · '+newMe+' for you':'');
  nb.classList.toggle('hot',!!newMe);
  if(ov.style.display!=='block')return;
  [...$('nvw').children].forEach(b=>b.setAttribute('aria-pressed',String(b.getAttribute('data-v')===view)));
  const shownMe=[];
  const html=games.map(G=>{
    const list=G.list.filter(n=>inView(n)&&(!f||(n.text+' '+n.sit+' '+n.by+' '+(n.to||'')).toLowerCase().includes(f)));if(!list.length)return'';
    list.forEach(n=>{if(forMe(n))shownMe.push(n)});
    const title=(G.team?esc(G.team)+' · ':'')+day(G.last)+(G.g===code?' · this game':'');
    return `<section class="ng"><div class="gh"><b>${title}</b><span>${G.g==='solo'?'not in a game':'game '+fmt(G.g)} · ${list.length} of ${G.list.length}</span></div>`+
      list.slice().reverse().map(n=>`<div class="nb${forMe(n)?' forme':''}${n.pend?' pend':''}"><div class="m">${tm(n.at)} · ${esc(n.by)}${n.sit?' · '+esc(n.sit):''}${forMe(n)&&!readIds.has(n.id)?' · <b>new</b>':''}</div><div>${tags(n)}${esc(n.text)}</div></div>`).join('')+
      `<div class="ga"><button type="button" data-gs="${esc(G.g)}">Share / copy</button><button type="button" data-gd="${esc(G.g)}">Delete from this device</button></div></section>`}).join('');
  const empty=view==='me'?'No notes sent to you yet.':view==='later'?'Nothing saved for later. Say "save note for later…".':total?'No notes match.':'No notes saved yet. Say "note …" or use Quick note.';
  $('nlist').innerHTML=html||`<div class="ng">${f?'No notes match.':empty}</div>`;
  if(view==='me'&&shownMe.some(n=>!readIds.has(n.id)))setTimeout(()=>{markRead(shownMe);drawNotes()},1500);
}
function openAll(){ov.style.display='block';document.body.style.overflow='hidden';drawAll()}
nb.addEventListener('click',()=>{view=notes.some(n=>forMe(n)&&!readIds.has(n.id))?'me':view;openAll()});
$('nx').addEventListener('click',()=>{ov.style.display='none';document.body.style.overflow='';drawNotes()});
$('nvw').addEventListener('click',e=>{const v=e.target.getAttribute&&e.target.getAttribute('data-v');if(v){view=v;drawAll()}});
$('nf').addEventListener('input',drawAll);
$('nlist').addEventListener('click',async e=>{
  const gs=e.target.getAttribute&&e.target.getAttribute('data-gs'),gd=e.target.getAttribute&&e.target.getAttribute('data-gd');
  if(gs){const G=allGames().find(x=>x.g===gs);if(!G)return;const txt=gameText(G);
    try{if(navigator.share){await navigator.share({title:'Sideline notes',text:txt});return}}catch(x){if(x&&x.name==='AbortError')return}
    try{await navigator.clipboard.writeText(txt);alert('Notes copied.')}catch(x){prompt('Copy your notes:',txt)}}
  if(gd&&confirm('Delete these notes from this device only? Other devices keep their copy.')){
    try{localStorage.removeItem('sl.notes.'+gd)}catch(x){}if(gd===(code||'solo')){notes=[];drawNotes()}drawAll()}
});
/* ---------- natural speech: every spoken reply goes through here ----------
   Lives in game.js so it survives the weekly index.html rewrite. Add shorthand to ABBR as new sheets use it. */
const ABBR={tb:'tailback',fb:'fullback',wb:'wingback',hb:'halfback',sb:'slotback',qb:'quarterback',rb:'running back',
  te:'tight end',tes:'tight ends',wr:'wide receiver',wrs:'wide receivers',rte:'route',rtes:'routes',
  ol:'line',lb:'linebacker',lbs:'linebackers',cb:'corner',fs:'free safety',ss:'strong safety',de:'defensive end',dt:'defensive tackle',
  pa:'play action',rpo:'R P O',ctr:'counter',opt:'option',qbs:'quarterbacks',
  '2pt':'two point',int:'interception',td:'touchdown',fg:'field goal',yds:'yards',yd:'yard'};
const ORDW={'1st':'first','2nd':'second','3rd':'third','4th':'fourth'};
function words(t){
  return t.replace(/\b(\d?[A-Za-z]+)\b/g,w=>{
    if(w==='L')return'left';if(w==='R')return'right';
    const k=w.toLowerCase();
    if(ABBR[k]&&(w===w.toUpperCase()||k.length>=2&&!/^(int|opt|pa|de|ss|ol|ctr|yd|yds)$/.test(k)))return ABBR[k];
    return w.length>=2&&w===w.toUpperCase()&&!/^[A-Z]$/.test(w)?k:w;   // SWEEP -> sweep, so it isn't spelled out letter by letter
  });
}
const pct=x=>Math.round(+x);
function natural(t){
  t=String(t||'');if(!t.trim())return t;
  t=t.replace(/\b(1st|2nd|3rd|4th)\b/g,m=>ORDW[m]).replace(/\b2-point\b/gi,'two point');
  t=t.replace(/\bOpp 1(?:-| to )20\b/g,'red zone').replace(/\bOpp 21(?:-| to )40\b/g,'plus territory')
     .replace(/\bOwn 1(?:-| to )20\b/g,'backed up').replace(/\bOwn 21(?:-| to )40\b/g,'own territory');
  t=t.replace(/\b(Left|Middle|Right) hash\b/g,m=>m.toLowerCase());
  t=t.replace(/No matching plays in the log\. Sheet: /g,'Nothing in the play log, but the scouting sheet has ');
  t=t.replace(/No plays logged for that\./g,'Nothing logged for that.');
  // "100% pass over 1 play. Top call: X, then Y."
  t=t.replace(/(\d+(?:\.\d+)?)% (run|pass) over (\d+) plays?\.(?: Top call: ([^.]+?)(?:, then ([^.]+?))?\.)?/g,(m,p,k,n,c1,c2)=>{
    p=pct(p);n=+n;const ran=k==='run';let out;
    if(n===1)out='Only one play, '+(ran?'a run':'a pass')+(c1?', '+c1:'')+'.';
    else{
      if(p>=100)out=(ran?'They ran it ':'They threw it ')+(n===2?'both times.':'all '+n+' times.');
      else if(p===50)out='Even split, half run, half pass, on '+n+' plays.';
      else out=(ran?'They run it ':'They throw it ')+p+' percent, on '+n+' plays.';
      if(c1)out+=' Most common is '+c1+(c2?', then '+c2:'')+'.';
    }
    return out;
  });
  t=t.replace(/ Small sample\./g,' Small sample, just a lean.');
  t=t.replace(/(\d+(?:\.\d+)?)%/g,(m,x)=>pct(x)+' percent');
  t=t.replace(/: /g,'. ').replace(/\s+·\s+/g,', ');
  t=words(t).replace(/\bFirst play of drive\b/g,'First play of the drive');
  return t.replace(/(^|[.!?]\s+)([a-z])/g,(m,a,b)=>a+b.toUpperCase());
}
if(typeof window.say==='function'&&!window.say._nat){const raw=window.say;window.say=function(t){return raw(natural(t))};window.say._nat=true}

document.getElementById('foot').textContent+=' · '+SL_VERSION;
window.GAME={push:pushSit,pushSoon,voice,typed,isNote,typing,sound};

/* ---------- start ---------- */
const hm=location.hash.match(/game=([A-Za-z0-9-]+)/);
const prev=get('game',null);
if(hm)join(hm[1].toUpperCase().replace(/[^A-Z0-9]/g,''));
else if(prev&&prev.code&&Date.now()-prev.at<12*3600e3)join(prev.code);
else{loadNotes();drawTo();drawNotes();bar()}
})();
