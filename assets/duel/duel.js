/* Online arrow duel — Aboden Games. Room owner is authoritative. */
(function(){
  'use strict';
  const R=window.DahroojDuelRules;
  window.createDahroojDuel=function(bridge){
    const root=document.createElement('section');root.id='duel';root.hidden=true;root.setAttribute('aria-label','مواجهة دحروج أونلاين');
    root.innerHTML=`<canvas aria-label="اسحب لأعلى لتوجيه السهم وتحديد قوته؛ أو استخدم أدوات التصويب أسفل الشاشة"></canvas>
      <button class="duel-exit">رجوع</button>
      <div class="duel-hud" hidden><div>أنت<div class="duel-hearts" id="duel-mine"></div></div><div><div id="duel-turn" role="status"></div><div id="duel-round"></div></div><div>المنافس<div class="duel-hearts" id="duel-other"></div></div></div>
      <div class="duel-card"><h1>مواجهة دحروج</h1><p id="duel-description">٣ قلوب · ٦ جولات<br>سهم لك وسهم لمنافسك في كل جولة</p>
      <div id="duel-setup"><div>اختر ستايلك</div><div class="duel-row" id="duel-styles"></div><button id="duel-create" class="primary">إنشاء غرفة</button><p>أو ادخل رمز غرفة صاحبك</p><input id="duel-code" type="text" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="رمز الغرفة"><div class="duel-row"><button id="duel-join">دخول الغرفة</button></div></div>
      <div id="duel-invite" hidden><p>رمز الغرفة: <strong id="duel-room" dir="ltr"></strong></p><button id="duel-copy">نسخ رابط الدعوة</button><input id="duel-link" type="text" readonly hidden aria-label="رابط الدعوة"></div>
      <p id="duel-status" role="status" aria-live="polite"></p><button id="duel-retry" hidden>غرفة جديدة</button><button id="duel-rematch" class="primary" hidden>العب مرة ثانية</button></div>
      <div class="duel-controls" hidden><p id="duel-hint">اسحب لأعلى: الاتجاه للتوجيه وطول السحب للقوة</p><div class="duel-row"><label>الاتجاه<input id="duel-aim" type="range" min="-100" max="100" value="0"></label><label>القوة<input id="duel-power" type="range" min="0" max="100" value="46"></label><button id="duel-fire" class="primary">إطلاق</button></div></div>
      <div class="duel-credit">ABODEN GAMES · DAHROOJ</div>`;
    document.body.appendChild(root);
    const $=s=>root.querySelector(s),canvas=$('canvas'),ctx=canvas.getContext('2d');
    const card=$('.duel-card'),hud=$('.duel-hud'),controls=$('.duel-controls'),status=$('#duel-status');
    let active=false,peer=null,conn=null,host=false,me=0,state=null,selected='jelly',room='',generation=0;
    let timer=null,flightTimer=null,heartbeat=null,lastSeen=0,ready=false,localAgain=false,remoteAgain=false;
    let flightStart=0,shotKey='',popped=false,drag=null,width=0,height=0,ratio=1;
    const sprites=new Map();
    const sprite=(style,face='focus')=>{const k=style+face;if(!sprites.has(k))sprites.set(k,bridge.sprite(style,face));return sprites.get(k);};
    const styleNames={jelly:'جيلي',fabric:'قماش',clay:'طين',fur:'فرو',bubble:'فقاعة'};
    for(const style of R.STYLES){
      const b=document.createElement('button');b.setAttribute('aria-label',styleNames[style]);b.dataset.style=style;
      const img=new Image();img.src=sprite(style).toDataURL();img.alt='';b.appendChild(img);
      b.onclick=()=>choose(style);$('#duel-styles').appendChild(b);
    }
    function choose(style){selected=R.STYLES.includes(style)?style:'jelly';for(const b of $('#duel-styles').children)b.setAttribute('aria-pressed',b.dataset.style===selected);}
    function send(msg){if(conn?.open){try{conn.send(msg);return true;}catch(_){fail('تعذّر إرسال الحركة. افتحوا غرفة جديدة.');}}return false;}
    function cleanup(){
      generation++;clearTimeout(timer);clearTimeout(flightTimer);clearInterval(heartbeat);
      const old=conn;conn=null;old?.close();const p=peer;peer=null;p?.destroy();
      ready=false;drag=null;state=null;shotKey='';localAgain=remoteAgain=false;
    }
    function lobby(){
      cleanup();hud.hidden=controls.hidden=true;card.hidden=false;$('#duel-setup').hidden=false;
      $('#duel-invite').hidden=$('#duel-retry').hidden=$('#duel-rematch').hidden=true;
      $('#duel-link').hidden=true;$('#duel-create').disabled=$('#duel-join').disabled=false;
      $('h1').textContent='مواجهة دحروج';$('#duel-description').hidden=false;status.textContent='';
    }
    function fail(message){
      if(!active)return;cleanup();card.hidden=false;hud.hidden=controls.hidden=true;
      $('h1').textContent='المواجهة متوقفة';$('#duel-description').hidden=true;
      $('#duel-setup').hidden=$('#duel-invite').hidden=$('#duel-rematch').hidden=true;
      $('#duel-retry').hidden=false;status.textContent=message;
    }
    function invite(){const url=new URL(location.href);url.searchParams.set('duel',room);url.hash='';return url.href;}
    function id(){const a=new Uint32Array(2);crypto.getRandomValues(a);return Array.from(a,n=>n.toString(36)).join('-');}
    function code(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',a=new Uint8Array(8);crypto.getRandomValues(a);return Array.from(a,n=>chars[n%32]).join('');}
    function seed(){return crypto.getRandomValues(new Uint32Array(1))[0];}
    function newMatch(){localAgain=remoteAgain=false;apply(R.create(id(),[selected,conn.metadata.style],seed()));broadcast();}
    function broadcast(){send({type:'state',state});}
    function apply(next){
      if(!R.valid(next))return;
      if(state&&next.id===state.id&&next.revision<=state.revision)return;
      if(state&&next.id!==state.id){localAgain=remoteAgain=false;}
      clearTimeout(timer);state=next;ready=true;card.hidden=state.phase!=='done';hud.hidden=controls.hidden=false;
      if(state.phase==='flying'){
        const key=state.id+':'+state.turn;if(key!==shotKey){shotKey=key;flightStart=performance.now();popped=false;}
      }
      $('#duel-mine').textContent='♥'.repeat(state.hearts[me])+'♡'.repeat(3-state.hearts[me]);
      $('#duel-other').textContent='♥'.repeat(state.hearts[1-me])+'♡'.repeat(3-state.hearts[1-me]);
      $('#duel-mine').setAttribute('aria-label',`قلوبك ${state.hearts[me]} من ٣`);
      $('#duel-other').setAttribute('aria-label',`قلوب المنافس ${state.hearts[1-me]} من ٣`);
      $('#duel-round').textContent=`الجولة ${R.round(state)} من ٦`;
      $('#duel-turn').textContent=state.phase==='done'?'انتهت المواجهة':state.phase==='flying'?'السهم بالطريق…':state.turn%2===me?'دورك':'دور المنافس';
      const can=state.phase==='aim'&&state.turn%2===me;
      for(const e of controls.querySelectorAll('button,input'))e.disabled=!can;
      $('#duel-hint').textContent=can?'اسحب لأعلى: الاتجاه للتوجيه وطول السحب للقوة':'انتظر رمية المنافس';
      if(state.phase==='done'){
        controls.hidden=true;$('h1').textContent=state.winner==='tie'?'تعادل!':state.winner===me?'فزت بالمواجهة!':'فاز المنافس';
        $('#duel-description').hidden=true;$('#duel-setup').hidden=$('#duel-invite').hidden=true;
        $('#duel-rematch').hidden=false;$('#duel-rematch').disabled=false;
        status.textContent=state.hearts.includes(0)?'انتهت القلوب الثلاثة':'اكتملت الجولات الست';
      }
    }
    function acceptShot(player,request){
      if(!host||!ready||!state)return;
      const next=R.fire(state,player,request);if(!next)return;
      apply(next);broadcast();const match=state.id,turn=state.turn,token=generation;
      flightTimer=setTimeout(()=>{
        if(token!==generation||!state||state.id!==match||state.turn!==turn)return;
        apply(R.settle(state));broadcast();
      },2200);
    }
    function fire(){
      if(!state||!ready||state.phase!=='aim'||state.turn%2!==me)return;
      const request={id:state.id,turn:state.turn,aim:Number($('#duel-aim').value)/100,power:Number($('#duel-power').value)/100};
      drag=null;if(host)acceptShot(me,request);else{send({type:'shot',request});$('#duel-fire').disabled=true;}
    }
    function wire(c,token){
      conn=c;lastSeen=Date.now();
      c.on('open',()=>{
        if(token!==generation)return;clearTimeout(timer);lastSeen=Date.now();
        if(host)newMatch();
        else timer=setTimeout(()=>{if(token===generation&&!ready)fail('لم تبدأ المواجهة. افتحوا غرفة جديدة.');},12000);
        heartbeat=setInterval(()=>{if(Date.now()-lastSeen>20000)fail('انقطع اتصال المنافس. أنشئوا غرفة جديدة للمحاولة.');else send({type:'ping'});},4000);
      });
      c.on('data',msg=>{
        if(token!==generation||!msg||typeof msg!=='object')return;lastSeen=Date.now();
        if(msg.type==='ping'){send({type:'pong'});return;}if(msg.type==='pong')return;
        if(host){
          if(msg.type==='shot')acceptShot(1,msg.request);
          if(msg.type==='again'&&state?.phase==='done'&&msg.id===state.id){remoteAgain=true;if(localAgain)newMatch();else status.textContent='المنافس جاهز لمواجهة ثانية';}
        }else if(msg.type==='state'&&R.valid(msg.state)){
          if(state&&msg.state.id!==state.id&&!(localAgain&&state.phase==='done'))return;
          apply(msg.state);
        }
      });
      c.on('close',()=>{if(token===generation)fail('غادر المنافس أو انقطع الاتصال. أنشئوا غرفة جديدة.');});
      c.on('error',()=>{if(token===generation)fail('تعذّر الاتصال بالمنافس. جرّبوا غرفة جديدة أو شبكة ثانية.');});
    }
    async function loadPeer(){
      if(window.Peer)return;
      await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./vendor/peerjs/peerjs-1.5.5.min.js';script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});
      if(!window.Peer)throw new Error('Peer unavailable');
    }
    async function connect(create){
      const typed=$('#duel-code').value.trim().toUpperCase();
      if(!create&&!/^[A-HJ-NP-Z2-9]{8}$/.test(typed)){status.textContent='أدخل رمز الغرفة المكوّن من ٨ أحرف وأرقام.';return;}
      cleanup();host=create;me=create?0:1;room=create?code():typed;const token=generation;
      $('#duel-create').disabled=$('#duel-join').disabled=true;status.textContent='جاري الاتصال…';
      timer=setTimeout(()=>{if(token===generation)fail('لم يكتمل الاتصال. تأكدوا من الرمز وبقاء الغرفة مفتوحة، أو جرّبوا شبكة ثانية.');},25000);
      try{
        await loadPeer();if(token!==generation)return;
        // Optional deployment config may supply a private signaling server / TURN.
        const options={debug:0,...(window.DAHROOJ_PEER_OPTIONS||{})};
        peer=host?new Peer('dahrooj-v1-'+room,options):new Peer(options);
        peer.on('open',()=>{
          if(token!==generation)return;
          if(host){clearTimeout(timer);$('#duel-setup').hidden=true;$('#duel-invite').hidden=false;$('#duel-room').textContent=room;status.textContent='بانتظار صاحبك… أرسل له رابط الدعوة';}
          else wire(peer.connect('dahrooj-v1-'+room,{reliable:true,serialization:'json',metadata:{v:1,style:selected}}),token);
        });
        peer.on('connection',c=>{
          if(token!==generation||!host||conn||c.metadata?.v!==1||!R.STYLES.includes(c.metadata?.style)){
            c.on('open',()=>c.close());return;
          }
          wire(c,token);timer=setTimeout(()=>{if(token===generation&&!ready)fail('لم يكتمل اتصال المنافس. افتحوا غرفة جديدة.');},25000);
        });
        peer.on('error',e=>{if(token===generation)fail(e.type==='peer-unavailable'?'الغرفة غير موجودة أو صاحبها أغلقها.':e.type==='unavailable-id'?'رمز الغرفة مستخدم. أنشئ غرفة جديدة.':'تعذّر الاتصال. جرّب شبكة ثانية أو أعد المحاولة.');});
        peer.on('disconnected',()=>{if(token===generation&&!ready)fail('انقطع الاتصال بخدمة الغرف. أعد المحاولة.');});
      }catch(_){if(token===generation)fail('تعذّر تحميل الاتصال الأونلاين. أعد المحاولة.');}
    }
    $('#duel-create').onclick=()=>connect(true);$('#duel-join').onclick=()=>connect(false);
    $('#duel-code').onkeydown=e=>{if(e.key==='Enter'&&!$('#duel-join').disabled)connect(false);};
    $('#duel-retry').onclick=lobby;$('#duel-fire').onclick=fire;
    $('#duel-rematch').onclick=()=>{
      if(state?.phase!=='done')return;localAgain=true;$('#duel-rematch').disabled=true;status.textContent='بانتظار موافقة المنافس…';
      if(host){if(remoteAgain)newMatch();}else send({type:'again',id:state.id});
    };
    $('#duel-copy').onclick=async()=>{
      try{await navigator.clipboard.writeText(invite());status.textContent='تم نسخ الرابط — أرسله لصاحبك';}
      catch(_){const input=$('#duel-link');input.hidden=false;input.value=invite();input.focus();input.select();status.textContent='انسخ الرابط المحدد وأرسله لصاحبك';}
    };
    $('.duel-exit').onclick=()=>bridge.exit();
    canvas.onpointerdown=e=>{
      if(!ready||!state||state.phase!=='aim'||state.turn%2!==me||drag)return;
      drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
    };
    function aim(e){if(!drag||drag.id!==e.pointerId)return;
      $('#duel-aim').value=Math.round(Math.max(-1,Math.min(1,(e.clientX-drag.x)/(width*.4)))*100);
      $('#duel-power').value=Math.round(Math.max(0,Math.min(1,(drag.y-e.clientY)/(height*.42)))*100);
    }
    canvas.onpointermove=aim;canvas.onpointerup=e=>{if(!drag||drag.id!==e.pointerId)return;const distance=drag.y-e.clientY;aim(e);drag=null;if(distance>18)fire();};
    canvas.onpointercancel=canvas.onlostpointercapture=()=>{drag=null;};
    function resize(){width=innerWidth;height=innerHeight;ratio=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);}
    addEventListener('resize',resize);
    const unit=()=>Math.min(width*.2,height*.14);
    function project(p){const scale=1/(1+p.z*.18);return {x:width/2+p.x*unit()*scale,y:height*.76-p.z*height*.021-p.y*unit()*scale,r:unit()*.6*scale};}
    function drawBall(p,style,face,scale=1){const q=project(p),r=q.r*scale;ctx.drawImage(sprite(style,face),q.x-r*1.4,q.y-r*1.4,r*2.8,r*2.8);}
    function arrow(p,previous){const q=project(p),old=project(previous);ctx.save();ctx.translate(q.x,q.y);ctx.rotate(Math.atan2(q.y-old.y,q.x-old.x));ctx.strokeStyle='#5f5042';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-24,0);ctx.lineTo(0,0);ctx.stroke();ctx.fillStyle='#2c2d3d';ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(-6,-4);ctx.lineTo(-6,4);ctx.fill();ctx.strokeStyle='#98485a';ctx.beginPath();ctx.moveTo(-18,0);ctx.lineTo(-24,-5);ctx.moveTo(-18,0);ctx.lineTo(-24,5);ctx.stroke();ctx.restore();}
    function render(now){
      if(!active)return;if(width!==innerWidth||height!==innerHeight)resize();ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
      if(!state)return;
      const target=R.target(state),mine={x:0,y:1.3,z:0},other=target,shooter=state.turn%2;
      const shotTime=state.phase==='flying'?(now-flightStart)/1000:0,result=state.phase==='flying'?R.outcome(state,state.shot):null;
      const hit=result?.hit&&shotTime>=result.t,hitPlayer=1-shooter;
      if(hit&&!popped){popped=true;bridge.pop();}
      for(const [p,i] of [[other,1-me],[mine,me]]){
        const q=project({...p,y:0});ctx.fillStyle='#2c2d3d12';ctx.beginPath();ctx.ellipse(q.x,q.y,q.r*1.15,q.r*.24,0,0,Math.PI*2);ctx.fill();
        if(hit&&i===hitPlayer){
          const t=shotTime-result.t;
          if(t<.55){const center=project(p);ctx.save();ctx.globalAlpha=1-t/.55;ctx.fillStyle='#98485a';for(let j=0;j<12;j++){const a=j*Math.PI/6,d=center.r*(1+t*5);ctx.beginPath();ctx.arc(center.x+Math.cos(a)*d,center.y+Math.sin(a)*d,3*(1-t/.7),0,Math.PI*2);ctx.fill();}ctx.restore();}
          else if(state.hearts[i]>1)drawBall(p,state.styles[i],'wide',Math.min(1,(t-.55)*5));
        }else drawBall(p,state.styles[i],state.phase==='done'?(state.winner===i?'joy':'squint'):i===shooter?'focus':'wide');
      }
      if(state.phase==='flying'&&shotTime<=result.t){
        const transform=p=>shooter===me?p:{x:target.x-p.x,y:p.y,z:12-p.z};
        arrow(transform(R.point(state.shot,shotTime)),transform(R.point(state.shot,Math.max(0,shotTime-.015))));
      }
      if(state.phase==='aim'&&shooter===me){
        const shot={aim:Number($('#duel-aim').value)/100,power:Number($('#duel-power').value)/100};
        ctx.fillStyle='#2c2d3d55';for(let t=.08;t<.58;t+=.07){const p=project(R.point(shot,t));ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill();}
        arrow(R.point(shot,.04),R.point(shot,0));
      }
    }
    addEventListener('pagehide',()=>{if(active)cleanup();});
    return {open(style){active=true;root.hidden=false;choose(style);resize();lobby();const code=new URL(location.href).searchParams.get('duel');if(code)$('#duel-code').value=code.toUpperCase();$('#duel-create').focus();},
      close(){active=false;cleanup();root.hidden=true;},render};
  };
})();
