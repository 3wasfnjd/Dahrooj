/* Aboden Games — six alternating rounds, online or against a fallible AI. */
(function(){
'use strict';
const R=window.DahroojDuelRules;
const icon=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const icons={back:icon('<path d="m14 6-6 6 6 6"/>'),play:icon('<path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="none"/>'),invite:icon('<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M19 7v6M16 10h6"/>'),join:icon('<path d="M14 4h5v16h-5M3 12h12m-5-5 5 5-5 5"/>'),copy:icon('<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M15 4H7a3 3 0 0 0-3 3v8"/>'),again:icon('<path d="M20 7v5h-5M19 12a7 7 0 1 0-2 5M20 12l-3-5"/>')};
window.createDahroojDuel=function(bridge){
  const root=document.createElement('section');root.id='duel';root.hidden=true;root.dir='rtl';root.setAttribute('aria-label','مواجهة دحروج');
  root.innerHTML=`<button class="duel-exit duel-icon" aria-label="رجوع" title="رجوع">${icons.back}</button>
    <div class="duel-heading">مواجهة</div><div id="duel-round" hidden aria-label="الجولات الست">${Array.from({length:6},()=>'<i></i>').join('')}</div>
    <div id="duel-turn" class="duel-sr" role="status"></div><div id="duel-styles" aria-label="ستايل دحروج"></div>
    <div id="duel-lobby"><div id="duel-actions"><button id="duel-create" class="duel-icon" aria-label="دعوة صاحبك" title="دعوة صاحبك">${icons.invite}</button><button id="duel-bot" class="duel-icon duel-play" aria-label="العب ضد الكمبيوتر" title="العب ضد الكمبيوتر">${icons.play}</button><button id="duel-enter" class="duel-icon" aria-label="دخول غرفة" title="دخول غرفة">${icons.join}</button></div>
    <div id="duel-join-row" hidden><input id="duel-code" type="text" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="رمز الغرفة" aria-label="رمز الغرفة"><button id="duel-join" class="duel-icon" aria-label="دخول" title="دخول">${icons.join}</button></div>
    <div id="duel-invite" hidden><span id="duel-room" dir="ltr"></span><button id="duel-copy" class="duel-icon" aria-label="نسخ الدعوة" title="نسخ الدعوة">${icons.copy}</button><button id="duel-wait-bot" class="duel-icon" aria-label="العب ضد الكمبيوتر بدل الانتظار" title="العب ضد الكمبيوتر">${icons.play}</button><input id="duel-link" type="text" readonly hidden aria-label="رابط الدعوة"></div></div>
    <div id="duel-result" hidden><h1></h1><button id="duel-rematch" class="duel-icon" aria-label="مواجهة جديدة" title="مواجهة جديدة">${icons.again}</button></div>
    <div id="duel-status" role="status" aria-live="polite"></div><button id="duel-retry" class="duel-icon" aria-label="إعادة المحاولة" title="إعادة المحاولة" hidden>${icons.again}</button>
    <div class="duel-credit">ABODEN GAMES</div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s),status=$('#duel-status'),arena=window.createDahroojArena(root,bridge),canvas=arena.canvas;
  let active=false,peer=null,conn=null,host=false,me=0,state=null,selected='jelly',room='',generation=0,bot=false;
  let timer=null,flightTimer=null,botTimer=null,heartbeat=null,lastSeen=0,ready=false,localAgain=false,remoteAgain=false,drag=null,aimValue=0,powerValue=.457,pending=false;
  const names={jelly:'جيلي',fabric:'قماش',clay:'طين',fur:'فرو',bubble:'فقاعة'};
  for(const style of R.STYLES){const b=document.createElement('button');b.dataset.style=style;b.setAttribute('aria-label',names[style]);b.title=names[style];const img=new Image();img.src=bridge.sprite(style,'open').toDataURL();img.alt='';b.appendChild(img);b.onclick=()=>choose(style);$('#duel-styles').appendChild(b);}
  function choose(s){selected=R.STYLES.includes(s)?s:'jelly';bridge.style?.(selected);for(const b of $('#duel-styles').children)b.setAttribute('aria-pressed',b.dataset.style===selected);}
  function send(msg){if(conn?.open){try{conn.send(msg);return true;}catch(_){fail('انقطع الاتصال');}}return false;}
  function cleanup(){
    generation++;clearTimeout(timer);clearTimeout(flightTimer);clearTimeout(botTimer);clearInterval(heartbeat);
    const old=conn;conn=null;old?.close();const p=peer;peer=null;p?.destroy();ready=false;drag=null;state=null;localAgain=remoteAgain=false;pending=false;bot=false;arena.clear();
  }
  function lobby(){
    cleanup();root.classList.remove('playing');$('#duel-lobby').hidden=$('#duel-styles').hidden=false;
    for(const id of ['duel-round','duel-invite','duel-join-row','duel-result','duel-retry','duel-link'])$('#'+id).hidden=true;
    $('#duel-actions').hidden=false;$('#duel-create').disabled=$('#duel-join').disabled=false;status.textContent='';
  }
  function fail(message){if(!active)return;cleanup();root.classList.remove('playing');$('#duel-lobby').hidden=$('#duel-round').hidden=$('#duel-result').hidden=true;$('#duel-retry').hidden=false;status.textContent=message;}
  const random=()=>crypto.getRandomValues(new Uint32Array(1))[0];
  const id=()=>random().toString(36)+'-'+random().toString(36);
  const code=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');
  function invite(){const url=new URL(location.href);url.searchParams.set('duel',room);url.hash='';return url.href;}
  function newMatch(){
    localAgain=remoteAgain=false;const opponent=bot?R.STYLES[(R.STYLES.indexOf(selected)+1+random()%4)%5]:conn.metadata.style;
    apply(R.create(id(),[selected,opponent],random()));broadcast();
  }
  function startBot(){bridge.interact?.();cleanup();bot=host=true;me=0;newMatch();}
  function broadcast(){if(!bot)send({type:'state',state});}
  function scheduleBot(){
    clearTimeout(botTimer);if(!bot||state?.phase!=='aim'||state.turn%2!==1)return;
    const match=state.id,turn=state.turn,token=generation;
    botTimer=setTimeout(()=>{
      if(token!==generation||state?.id!==match||state.turn!==turn)return;
      // Same projectile physics as the player. No health/difficulty-dependent cheating.
      const randomUnit=()=>random()/0xffffffff,wide=randomUnit()<.26;
      const aim=R.target(state).x/5.76+(randomUnit()-.5)*(wide?.52:.16);
      const power=3.2/7+(randomUnit()-.5)*(wide?.32:.10);
      acceptShot(1,{id:match,turn,aim:Math.max(-1,Math.min(1,aim)),power:Math.max(0,Math.min(1,power))});
    },900+random()%650);
  }
  function apply(next){
    if(!R.valid(next))return;if(state&&next.id===state.id&&next.revision<=state.revision)return;
    if(state&&next.id!==state.id)localAgain=remoteAgain=false;
    clearTimeout(timer);state=next;ready=true;pending=false;drag=null;root.classList.add('playing');
    $('#duel-lobby').hidden=$('#duel-styles').hidden=$('#duel-retry').hidden=true;$('#duel-round').hidden=false;status.textContent='';
    $('#duel-result').hidden=state.phase!=='done';
    const round=R.round(state);for(const [i,dot] of Array.from($('#duel-round').children).entries()){dot.className=i+1<round?'past':i+1===round?'current':'';}
    $('#duel-round').setAttribute('aria-label',`الجولة ${round} من ٦`);
    $('#duel-turn').textContent=state.phase==='done'?'انتهت المواجهة':state.phase==='flying'?'':state.turn%2===me?'دورك':bot?'دور الكمبيوتر':'دور المنافس';
    canvas.style.cursor=state.phase==='aim'&&state.turn%2===me?'grab':'default';
    if(state.phase==='done'){$('h1').textContent=state.winner==='tie'?'تعادل':state.winner===me?'فزت!':'المرة الجاية';$('#duel-rematch').disabled=false;}
    else scheduleBot();
  }
  function acceptShot(player,request){
    if(!host||!ready||!state)return;const next=R.fire(state,player,request);if(!next)return;
    apply(next);broadcast();const match=state.id,turn=state.turn,token=generation;
    flightTimer=setTimeout(()=>{if(token!==generation||state?.id!==match||state.turn!==turn)return;apply(R.settle(state));broadcast();},2200);
  }
  function fire(){
    if(!state||!ready||pending||state.phase!=='aim'||state.turn%2!==me)return;
    const request={id:state.id,turn:state.turn,aim:aimValue,power:powerValue};drag=null;
    bridge.sound?.(.1);if(host)acceptShot(me,request);else{pending=send({type:'shot',request});}
  }
  function wire(c,token){
    conn=c;lastSeen=Date.now();c.on('open',()=>{
      if(token!==generation)return;clearTimeout(timer);lastSeen=Date.now();
      if(host)newMatch();else timer=setTimeout(()=>{if(token===generation&&!ready)fail('لم تبدأ المواجهة');},12000);
      heartbeat=setInterval(()=>{if(Date.now()-lastSeen>20000)fail('انقطع اتصال المنافس');else send({type:'ping'});},4000);
    });
    c.on('data',msg=>{
      if(token!==generation||!msg||typeof msg!=='object')return;lastSeen=Date.now();
      if(msg.type==='ping'){send({type:'pong'});return;}if(msg.type==='pong')return;
      if(host){
        if(msg.type==='shot')acceptShot(1,msg.request);
        if(msg.type==='again'&&state?.phase==='done'&&msg.id===state.id){remoteAgain=true;if(localAgain)newMatch();else $('#duel-rematch').classList.add('ready');}
      }else if(msg.type==='state'&&R.valid(msg.state)){if(state&&msg.state.id!==state.id&&!(localAgain&&state.phase==='done'))return;apply(msg.state);}
    });
    c.on('close',()=>{if(token===generation)fail('غادر المنافس');});c.on('error',()=>{if(token===generation)fail('تعذّر الاتصال بالمنافس');});
  }
  async function loadPeer(){if(window.Peer)return;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./vendor/peerjs/peerjs-1.5.5.min.js';script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});if(!window.Peer)throw Error('Peer unavailable');}
  async function connect(create){
    bridge.interact?.();
    const typed=$('#duel-code').value.trim().toUpperCase();if(!create&&!/^[A-HJ-NP-Z2-9]{8}$/.test(typed)){status.textContent='رمز الغرفة: ٨ أحرف وأرقام';return;}
    cleanup();host=create;me=create?0:1;room=create?code():typed;const token=generation;
    $('#duel-create').disabled=$('#duel-join').disabled=true;status.textContent='…';
    timer=setTimeout(()=>{if(token===generation)fail('تعذّر الاتصال. جرّب شبكة ثانية');},25000);
    try{
      await loadPeer();if(token!==generation)return;const options={debug:0,...(window.DAHROOJ_PEER_OPTIONS||{})};peer=host?new Peer('dahrooj-v2-'+room,options):new Peer(options);
      peer.on('open',()=>{
        if(token!==generation)return;
        if(host){clearTimeout(timer);$('#duel-actions').hidden=$('#duel-join-row').hidden=true;$('#duel-invite').hidden=false;$('#duel-room').textContent=room;status.textContent='بانتظار صاحبك';}
        else wire(peer.connect('dahrooj-v2-'+room,{reliable:true,serialization:'json',metadata:{v:2,style:selected}}),token);
      });
      peer.on('connection',c=>{if(token!==generation||!host||conn||c.metadata?.v!==2||!R.STYLES.includes(c.metadata?.style)){c.on('open',()=>c.close());return;}wire(c,token);timer=setTimeout(()=>{if(token===generation&&!ready)fail('لم يكتمل الاتصال');},25000);});
      peer.on('error',e=>{if(token===generation)fail(e.type==='peer-unavailable'?'الغرفة غير موجودة':e.type==='unavailable-id'?'أنشئ غرفة جديدة':'تعذّر الاتصال. الكمبيوتر متاح بدون اتصال');});
      peer.on('disconnected',()=>{if(token===generation&&!ready)fail('انقطع الاتصال بخدمة الغرف');});
    }catch(_){if(token===generation)fail('تعذّر الاتصال. الكمبيوتر متاح بدون اتصال');}
  }
  $('#duel-bot').onclick=$('#duel-wait-bot').onclick=startBot;
  $('#duel-create').onclick=()=>connect(true);$('#duel-join').onclick=()=>connect(false);
  $('#duel-enter').onclick=()=>{$('#duel-join-row').hidden=!$('#duel-join-row').hidden;if(!$('#duel-join-row').hidden)$('#duel-code').focus();};
  $('#duel-code').onkeydown=e=>{if(e.key==='Enter'&&!$('#duel-join').disabled)connect(false);};$('#duel-retry').onclick=lobby;
  $('#duel-rematch').onclick=()=>{if(state?.phase!=='done')return;if(bot){newMatch();return;}localAgain=true;$('#duel-rematch').disabled=true;status.textContent='بانتظار المنافس';if(host){if(remoteAgain)newMatch();}else send({type:'again',id:state.id});};
  $('#duel-copy').onclick=async()=>{try{await navigator.clipboard.writeText(invite());status.textContent='تم نسخ الدعوة';}catch(_){const input=$('#duel-link');input.hidden=false;input.value=invite();input.focus();input.select();}};
  $('.duel-exit').onclick=()=>bridge.exit();
  canvas.onpointerdown=e=>{
    if(!ready||!state||state.phase!=='aim'||state.turn%2!==me||pending||drag||e.clientY<innerHeight*.42)return;
    bridge.interact?.();drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.focus();canvas.style.cursor='grabbing';
  };
  function aim(e){if(!drag||drag.id!==e.pointerId)return;aimValue=Math.max(-1,Math.min(1,(e.clientX-drag.x)/(innerWidth*.4)));powerValue=Math.max(0,Math.min(1,(drag.y-e.clientY)/(innerHeight*.42)));}
  canvas.onpointermove=aim;canvas.onpointerup=e=>{if(!drag||drag.id!==e.pointerId)return;const distance=drag.y-e.clientY;aim(e);drag=null;if(distance>18)fire();else canvas.style.cursor='grab';};canvas.onpointercancel=canvas.onlostpointercapture=()=>{drag=null;};
  canvas.onkeydown=e=>{
    if(!state||state.phase!=='aim'||state.turn%2!==me)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();
    if(e.key==='ArrowLeft')aimValue=Math.max(-1,aimValue-.035);if(e.key==='ArrowRight')aimValue=Math.min(1,aimValue+.035);
    if(e.key==='ArrowUp')powerValue=Math.min(1,powerValue+.02);if(e.key==='ArrowDown')powerValue=Math.max(0,powerValue-.02);if(e.key===' ')fire();
  };
  addEventListener('pagehide',()=>{if(active)cleanup();});
  return {open(style){active=true;root.hidden=false;choose(style);arena.resize();lobby();const code=new URL(location.href).searchParams.get('duel');if(code){$('#duel-code').value=code.toUpperCase();$('#duel-join-row').hidden=false;}$('#duel-bot').focus();},close(){active=false;cleanup();root.hidden=true;},render(now){if(active)arena.render(now,{state,me,selected,aim:aimValue,power:powerValue,drag,waiting:!!peer});}};
};
})();
