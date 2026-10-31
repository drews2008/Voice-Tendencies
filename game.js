/* Sideline Tendencies — shared game + notes.
   Loaded after the main script in index.html and uses its globals
   (S, blank, FT, TEAM, $, esc, render, refresh, say, speakText, human, lastSay, lastIncomplete).
   Weekly opponent updates only touch index.html; leave this file alone and keep the
   <script src="game.js"> tag and the GAME.* hook lines in index.html.

   How the sync works: every device in a game subscribes to the same relay channel.
   A situation entered on any device (voice, typing + Enter, buttons) is sent to all of them;
   each device with "Voice reply: on" reads it out. Notes go to every device in the game.
   Relay = ntfy.sh (free, no account). Anyone holding the game code can read the channel,
   so the code is random and changes every game. To self-host later, change RELAY. */
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
let devName=get('name','')||(/iPad|Tablet/i.test(ua)||(/Android/i.test(ua)&&!/Mobile/i.test(ua))||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?'Tablet':/iPhone|Mobile|Android/i.test(ua)?'Phone':'Laptop');
let code=null,es=null,lastId=null,status='off',retry=null,soonT=null,pendingNote=null,readNotes=get('readNotes',true),unread=0,wl=null,teamWarned=false,lastSitAt=0;
let notes=[];
const nkey=()=>'notes.'+(code||'solo');
const saveNotes=()=>put(nkey(),notes);
const loadNotes=()=>{notes=get(nkey(),[])};

/* ---------- styles + markup ---------- */
const css=document.createElement('style');
css.textContent=`
#gm{margin:0 0 8px}
#snd{display:none;width:100%;margin:0 0 8px;min-height:56px;font-size:18px;background:var(--run);color:#fff;border-color:var(--run)}
.gb{display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:var(--card);border:1.5px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:8px}
.gb .gt{flex:1 1 180px;font-size:15px}.gb .gt small{display:block;color:var(--mute);font-size:13px}
.gb button{min-height:42px;font-size:15px;padding:6px 12px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 4px 0 2px;background:var(--mute);vertical-align:middle}
.dot.live{background:#2f9e44}.dot.connecting,.dot.reconnecting{background:#e8a317}
#nt{background:var(--card);border:1.5px solid var(--line);border-radius:10px;padding:8px 10px;margin:0}
#nt summary{font:700 19px 'Barlow Condensed',system-ui,sans-serif;color:var(--ink);min-height:36px;display:flex;align-items:center;gap:8px}
#ntc{font:600 13px system-ui,sans-serif;color:var(--mute)}
.badge{background:var(--run);color:#fff;border-radius:10px;padding:1px 8px;font:700 13px system-ui,sans-serif}
.ntin{display:flex;gap:6px;margin:6px 0}
#ntx{flex:1;min-height:52px;font:500 17px Barlow,system-ui,sans-serif;padding:8px;border:1.5px solid var(--ink);border-radius:8px;background:var(--bg);color:var(--ink);resize:vertical}
.ck{display:flex;gap:8px;align-items:center;font-size:14px;color:var(--mute);min-height:36px}
.ck input{width:20px;height:20px}
#ntl{list-style:none;padding:0;margin:6px 0}
#ntl li{border-top:1px solid var(--line);padding:7px 0;display:flex;gap:8px;align-items:flex-start}
#ntl li div{flex:1}#ntl .m{color:var(--mute);font-size:12px}#ntl .x{font-size:16px}
#ntl li.pend .m::after{content:' · not sent yet';color:var(--run)}
#ntl button{min-height:36px;padding:2px 10px;font-size:14px}
.nta{display:flex;gap:6px;flex-wrap:wrap}.nta button{flex:1 1 120px;min-height:42px;font-size:15px}
`;
document.head.appendChild(css);
const box=document.createElement('div');box.id='gm';
box.innerHTML=`<button type="button" id="snd"></button><div class="gb" id="gbar"></div>
<details id="nt"><summary>Notes <span id="ntc"></span></summary>
<div class="ntin"><textarea id="ntx" rows="2" enterkeyhint="send" placeholder="Type a note, Enter sends. Hands-free: say &quot;note&quot; then the note."></textarea><button id="nts" type="button" class="go">Send</button></div>
<label class="ck"><input type="checkbox" id="ntr"> Read notes from other devices out loud (needs Voice reply on)</label>
<ol id="ntl"></ol>
<div class="nta"><button id="ntcp" type="button">Copy / share all</button></div>
</details>`;
document.querySelector('main .row').after(box);

/* ---------- game bar ---------- */
const fmt=c=>c.slice(0,4)+'-'+c.slice(4);
function bar(){
  const b=$('gbar');
  if(!code){
    b.innerHTML=`<div class="gt"><b>This device only</b><small>Start a game to link your phone, tablet, and other coaches.</small></div>
<button type="button" class="go" id="gst">Start game</button><button type="button" id="gjn">Join game</button>`;
    $('gst').onclick=()=>{join(rid(8));share()};
    $('gjn').onclick=()=>{const c=(prompt('Game code (from the other device):')||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length>=6)join(c);else if(c)alert('That code is too short.')};
  }else{
    const st={live:'Live',connecting:'Connecting…',reconnecting:'Reconnecting…'}[status]||status;
    b.innerHTML=`<div class="gt"><b>Game ${fmt(code)}</b> <span class="dot ${status}"></span>${st}<small>This device: <b>${esc(devName)}</b> · <a href="#" id="gnm" style="color:inherit">rename</a></small></div>
<button type="button" class="go" id="gsh">Add a device</button><button type="button" id="gts">Test sound</button><button type="button" id="glv">Leave</button>`;
    $('gts').onclick=()=>{const ok=say('Sound test.');pub({t:'ping'});$('heard').textContent='Sound test sent to every device in the game.'+(ok?'':' This device has Voice reply off.')};
    $('gsh').onclick=share;
    $('glv').onclick=()=>{if(confirm('Leave game '+fmt(code)+'? Notes stay saved on this device.'))leave()};
    $('gnm').onclick=e=>{e.preventDefault();const n=(prompt('Name for this device (shows on notes):',devName)||'').trim().slice(0,24);if(n){devName=n;put('name',n);bar()}};
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
  code=c;lastId=null;teamWarned=false;lastSitAt=0;put('game',{code,at:Date.now()});
  history.replaceState(null,'',location.pathname+location.search+'#game='+code);
  loadNotes();drawNotes();connect();lock();
}
function leave(){
  if(es){es.close();es=null}clearTimeout(retry);
  code=null;status='off';put('game',null);
  history.replaceState(null,'',location.pathname+location.search);
  try{wl&&wl.release()}catch(e){}wl=null;
  loadNotes();drawNotes();bar();
}
function connect(){
  if(!code)return;
  setStatus(lastId?'reconnecting':'connecting');
  const since=lastId||'12h';
  try{es=new EventSource(RELAY+PREFIX+code+'/sse?since='+encodeURIComponent(since))}catch(e){retryLater();return}
  es.onopen=()=>{setStatus('live');flush()};
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
  p.from=me;p.by=devName;p.team=TEAM;p.v=1;
  return fetch(RELAY+PREFIX+code,{method:'POST',body:JSON.stringify(p)}).then(r=>r.ok).catch(()=>false);
}
// resend notes that never made it (dead spot, network blip)
function flush(){notes.filter(n=>n.from===me&&n.pend).forEach(n=>pub({t:'note',n:strip(n)}).then(ok=>{if(ok){n.pend=false;saveNotes();drawNotes()}}))}
const strip=n=>({id:n.id,text:n.text,sit:n.sit,by:n.by,from:n.from,at:n.at});

/* ---------- incoming ---------- */
function handle(p,t){
  if(!p||!p.t)return;
  const fresh=Date.now()-t<FRESH_MS;
  if(p.from===me){if(p.t==='note'){const n=notes.find(x=>x.id===p.n.id);if(n&&n.pend){n.pend=false;saveNotes();drawNotes()}}return}
  if(p.team&&p.team!==TEAM&&!teamWarned){teamWarned=true;$('heard').textContent=p.by+' is on '+p.team+' data and this device is on '+TEAM+'. Reload the page on the older one.'}
  if(p.t==='sit'){
    if(t<lastSitAt)return;lastSitAt=t;
    S=unpack(p.s);lastIncomplete=!!p.inc;$('q').value=speakText(S);refresh();render();
    $('heard').textContent='From '+p.by+': '+(human(S)||'cleared');
    if(fresh&&p.say)$('heard').textContent+=say(p.say)?'  🔊':'  🔇 sound is off on this device';
  }else if(p.t==='note'&&p.n&&p.n.id){
    if(notes.some(x=>x.id===p.n.id))return;
    notes.push(strip(p.n));notes.sort((a,b)=>a.at-b.at);saveNotes();
    if(!$('nt').open)unread++;drawNotes();
    if(fresh){try{navigator.vibrate&&navigator.vibrate(80)}catch(e){}
      if(readNotes)say('Note from '+p.n.by+'. '+p.n.text)}
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
document.addEventListener('pointerdown',()=>{if(unlocked||!speakOn||!window.speechSynthesis)return;try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;u.onend=()=>{unlocked=true;banner()};speechSynthesis.speak(u)}catch(e){}},{capture:true})

/* ---------- notes ---------- */
function addNote(text){
  text=String(text||'').trim().slice(0,1500);if(!text)return null;
  text=text[0].toUpperCase()+text.slice(1);
  const n={id:Date.now().toString(36)+rid(4),text,sit:human(S)||'',by:devName,from:me,at:Date.now(),pend:!!code};
  notes.push(n);saveNotes();drawNotes();
  if(code)pub({t:'note',n:strip(n)}).then(ok=>{if(ok){n.pend=false;saveNotes();drawNotes()}});
  return n;
}
const tm=at=>new Date(at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
function drawNotes(){
  $('ntc').innerHTML=notes.length+(notes.length==1?' note':' notes')+(code?' in this game':' on this device')+(unread?' <span class="badge">'+unread+' new</span>':'');
  $('ntl').innerHTML=notes.slice().reverse().map(n=>`<li${n.pend?' class="pend"':''}><div><div class="m">${tm(n.at)} · ${esc(n.by)}${n.sit?' · '+esc(n.sit):''}</div><div class="x">${esc(n.text)}</div></div>${n.from===me?`<button type="button" data-del="${esc(n.id)}" aria-label="Delete note">✕</button>`:''}</li>`).join('')||'<li><div class="m">No notes yet.</div></li>';
}
$('nt').addEventListener('toggle',()=>{if($('nt').open&&unread){unread=0;drawNotes()}});
$('ntr').checked=readNotes;
$('ntr').addEventListener('change',e=>{readNotes=e.target.checked;put('readNotes',readNotes)});
const send=()=>{if(addNote($('ntx').value)){$('ntx').value='';$('heard').textContent='Note saved'+(code?' and sent.':'.')}};
$('nts').addEventListener('click',send);
$('ntx').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
$('ntl').addEventListener('click',e=>{const id=e.target.getAttribute&&e.target.getAttribute('data-del');if(!id||!confirm('Delete this note on every device?'))return;
  const i=notes.findIndex(x=>x.id===id);if(i>=0){notes.splice(i,1);saveNotes();drawNotes()}if(code)pub({t:'del',id})});
$('ntcp').addEventListener('click',async()=>{
  const head='Sideline notes · '+TEAM+(code?' · game '+fmt(code):'')+' · '+new Date().toLocaleDateString();
  const txt=head+'\n\n'+notes.map(n=>tm(n.at)+' · '+n.by+(n.sit?' · '+n.sit:'')+'\n'+n.text).join('\n\n');
  try{if(navigator.share){await navigator.share({title:'Sideline notes',text:txt});return}}catch(e){if(e&&e.name==='AbortError')return}
  try{await navigator.clipboard.writeText(txt);alert('Notes copied.')}catch(e){prompt('Copy your notes:',txt)}
});

/* ---------- note keyword (voice + typed) ---------- */
const NOTE_RE=/^\s*(?:take (?:a )?note|coach'?s? note|notes?|noted)\b[\s,:.-]*(.*)$/i;
const SOUNDS_LIKE=/^\s*(?:know|knows|not|nope|nate|nodes?)\b/i;
function voice(alts){
  if(pendingNote){
    clearTimeout(pendingNote);pendingNote=null;
    const t=alts[0];
    if(/^(cancel|never ?mind|forget it|nothing)\b/i.test(t)){$('heard').textContent='Note canceled.';say('Canceled.');return true}
    addNote(t);$('heard').textContent='Note saved: "'+t+'"';say('Noted.');return true;
  }
  let m=alts[0].match(NOTE_RE);
  if(!m&&SOUNDS_LIKE.test(alts[0]))alts.slice(1).some(a=>(m=a.match(NOTE_RE)));
  if(!m)return false;
  const text=m[1].trim();
  if(!text){pendingNote=setTimeout(()=>{pendingNote=null},15000);$('heard').textContent='Note: go ahead, I\'m listening…';say('Go ahead.');return true}
  addNote(text);$('heard').textContent='Note saved: "'+text+'"';say('Noted.');return true;
}
function typed(v){clearTimeout(soonT);soonT=null;const m=String(v||'').match(NOTE_RE);if(!m||!m[1].trim())return false;addNote(m[1]);$('q').value='';$('heard').textContent='Note saved'+(code?' and sent.':'.');return true}
const isNote=v=>NOTE_RE.test(String(v||''));

window.GAME={push:pushSit,pushSoon,voice,typed,isNote,typing,sound};

/* ---------- start ---------- */
const hm=location.hash.match(/game=([A-Za-z0-9-]+)/);
const prev=get('game',null);
if(hm)join(hm[1].toUpperCase().replace(/[^A-Z0-9]/g,''));
else if(prev&&prev.code&&Date.now()-prev.at<12*3600e3)join(prev.code);
else{loadNotes();drawNotes();bar()}
})();
