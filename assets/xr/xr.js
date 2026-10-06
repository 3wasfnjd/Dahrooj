/* Dahrooj on Meta Quest: WebXR VR and AR for the 3D modes and Duel. Aboden Games.
   The courts are built in game metres; the headset shows them smaller (VR at a half, AR as a model on a
   surface you pick) and speeds time up to match, so falls look like real gravity.
   Dahrooj waits by your hand: grab with the trigger (or a pinch), swing and let go, or pull him back in
   the slingshot, and grab again at once for the next throw. Flip or raise the left hand for the menu. */
(() => {
  'use strict';
  const VR_SCALE=2, AR_SCALE=8, AR_MIN=3, AR_MAX=24, REAL_G=9.8;
  // Throw speed per metre per second of hand speed, slingshot speed per metre of pull, and limits (m/s, m).
  const GAIN=1.5, SLING_K=17, SLING_MIN=.06, SLING_MAX=.65, MIN_THROW=1, MAX_SPEED=34, SPAN=.04;
  // Duel runs on the server in game time: its shots use game speed per real metre per second.
  const DUEL_GAIN=2;
  // Duel is paused in the headset for now.
  // Headset texts in Arabic and English: [id, Arabic, English].
  const MODES=[['goal','مرمى','Goal'],['hoop','سلة','Hoop'],['window','شباك','Window'],['cans','علب','Cans'],['bowling','بولينغ','Bowling'],['climb','الجبل','Summit']];
  const STYLES=[['jelly','جيلي','Jelly'],['fabric','قماش','Fabric'],['clay','صلصال','Clay'],['fur','فرو','Fur'],['bubble','فقاعة','Bubble']];
  const XR_MODES=new Set(MODES.map(m=>m[0]));
  let lang='ar';try{if(localStorage.getItem('dahrooj-lang')==='en')lang='en';}catch(_){}
  const tr=(ar,en)=>lang==='en'?en:ar;
  const LABEL=id=>{const m=MODES.find(m=>m[0]===id);return m?tr(m[1],m[2]):'';};
  const INK='#2c2d3d',PAPER='#fffaf2';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  window.createDahroojXR=g=>{
    const {T,renderer,scene,camera,S,BR,V}=g;
    let session=null,kind=null,lastTime=0,holder=null,holdT=0,clock=0,paper='',arScale=AR_SCALE,popT=1,frames=0;
    // Throw styles: 'trigger' (aim, hold to charge, let go), 'hand' (a real swing), 'sling'.
    let throwStyle='trigger',menuToggled=false,parked=false,placing=false,anchor=null,placedFor='',menuOpen=false,intro=null;
    // Summit: a model mountain on the table (AR) or on a plinth in front of you (VR).
    // The Summit's size in metres per game unit: life-size in the VR world, tabletop in AR; the right stick changes it.
    const CLIMB_Z=-11,CLIMB_VR=.09,CLIMB_AR=.022;
    let climbOn=false,climb3=null,climbSpot=null,climbUnit=CLIMB_AR;
    const modeNow=()=>climbOn?'climb':g.mode();
    const rig=new T.Group();rig.name='xr-rig';
    const ray=new T.Raycaster(),wp=V(0,0,0),wq=new T.Quaternion(),fwd=V(0,0,0),eye=V(0,0,0),UP=V(0,1,0);
    const scaleNow=()=>rig.scale.x;
    // Game seconds per real second, so a ball falls at 9.8 m/s² in the room. Duel keeps the server's clock.
    const timeK=()=>g.stage().networked?1:Math.sqrt(REAL_G*scaleNow()/g.GRAV);
    // The eyes in world space, from the last headset pose. Three r128 stores the XR camera's world pose
    // in its local position, so getWorldPosition would apply the rig twice; matrixWorld is right.
    const eyeNow=()=>eye.setFromMatrixPosition(camera.matrixWorld);
    // Where the eyes are and which way they look, in room metres.
    function headLocal(){
      eyeNow();fwd.set(0,0,-1).transformDirection(camera.matrixWorld);
      const a=rig.worldToLocal(eye.clone()),dir=rig.worldToLocal(eye.clone().add(fwd)).sub(a);
      dir.y=0;if(dir.lengthSq()<1e-6)dir.set(0,0,-1);dir.normalize();
      return {pos:a,dir};
    }

    // VR: grass, trees, sky, day and night, rain and snow (paper floor as a fallback). AR shows the room.
    let nature=null;
    const natureOn=()=>!!nature&&kind==='immersive-vr';
    const TIMES=[['auto','تلقائي','Auto'],['day','نهار','Day'],['dusk','غروب','Dusk'],['night','ليل','Night'],['dawn','فجر','Dawn']];
    const WEATHERS=[['auto','تلقائي','Auto'],['clear','صافي','Clear'],['rain','مطر','Rain'],['snow','ثلج','Snow']];
    const named=(list,id)=>{const e=list.find(x=>x[0]===id);return e?tr(e[1],e[2]):'';};
    // A paper floor for VR; AR shows the room through passthrough instead.
    const floor=new T.Mesh(new T.CircleGeometry(40,64),new T.MeshBasicMaterial({color:0xddd2c1}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.004;floor.visible=false;scene.add(floor);

    /* ---------- Dahrooj and the Duel actors: 3D models (sprites as a fallback) ---------- */
    const textures=new Map();
    function texture(style,face,blink){
      const key=style+'/'+face+'/'+(blink?1:0);
      if(!textures.has(key)){const t=new T.CanvasTexture(g.sprite(style,face,blink));t.anisotropy=4;textures.set(key,t);}
      return textures.get(key);
    }
    function makeSprite(){const s=new T.Sprite(new T.SpriteMaterial({transparent:true,depthWrite:false}));s.visible=false;s.renderOrder=2;scene.add(s);return s;}
    const ballSprite=makeSprite(),actorSprites=[];
    const models=window.createDahrooj3D?window.createDahrooj3D(T,{radius:BR,drawFace:g.drawFace,renderer}):null;
    let ballModel=null;const actorModels=[],volleyModels=[];
    function model(slot,style,face){
      if(!slot||slot.style!==style||slot.face!==face){
        if(slot){scene.remove(slot.group);models.forget?.(slot.group);}
        slot=models.make(style,{face});slot.face=face;scene.add(slot.group);
      }
      slot.group.visible=true;return slot;
    }
    function showSprite(s,pos,r,style,face,blink,sx=1,sy=1){
      const map=texture(style,face,blink);
      if(s.material.map!==map){s.material.map=map;s.material.needsUpdate=true;}
      s.position.copy(pos);s.scale.set(r*2.8*sx,r*2.8*sy,1);s.visible=true;
    }

    /* ---------- floating panels drawn on canvases ---------- */
    function panel(w,h,px,py){
      const canvas=document.createElement('canvas');canvas.width=px;canvas.height=py;
      const tex=new T.CanvasTexture(canvas);
      const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,transparent:true,depthTest:false}));
      mesh.renderOrder=3;return {canvas,ctx:canvas.getContext('2d'),tex,mesh,key:''};
    }
    function round(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
    const font=(w,s)=>`${w} ${s}px "Baloo Bhaijaan 2","Grandstander",Tahoma,sans-serif`;

    // Score and messages, above the court and facing you.
    const hud=panel(1,.3,1024,300);rig.add(hud.mesh);
    function drawHud(){
      const t=g.texts(),name=LABEL(g.mode()),turn=t.turn==='Your turn'?tr('دورك','Your turn'):t.turn?tr('دور الخصم','Their turn'):'';
      const ch=climbOn&&climb3?climb3.hud():null;
      const key=placing?'placing':ch?['climb',ch.hearts,ch.height,ch.checkpoint,ch.again,t.title,t.toast].join('|'):[t.title,t.count,turn,t.toast,name,lang].join('|');if(key===hud.key)return;hud.key=key;
      const c=hud.ctx;c.clearRect(0,0,1024,300);c.textAlign='center';c.direction=tr('rtl','ltr');
      if(placing){
        c.fillStyle='rgba(255,252,246,.88)';round(c,62,30,900,230,46);c.fill();c.fillStyle=INK;
        c.font=font(800,52);c.fillText(tr('وجّه على سطح واضغط الزناد للتثبيت','Aim at a surface and pull the trigger to pin'),512,125);
        c.font=font(700,40);c.fillStyle='rgba(44,45,61,.7)';c.fillText(tr('العصا للأعلى والأسفل تكبّر وتصغّر','Stick up and down: bigger and smaller'),512,200);
      }else if(ch){
        c.fillStyle='rgba(255,252,246,.82)';round(c,212,8,600,190,40);c.fill();
        c.font=font(800,70);for(let i=0;i<ch.max;i++){c.fillStyle=i<ch.hearts?'#c8584b':'rgba(44,45,61,.2)';c.fillText('♥',422+i*90,98);}
        c.font=font(700,44);c.fillStyle='rgba(44,45,61,.75)';c.fillText(ch.again?tr('A للتسلق من جديد','A to climb again'):t.title||tr(`${ch.height} م`,`${ch.height} m`),512,170);
        if(t.toast){c.font=font(700,40);const w=Math.min(980,c.measureText(t.toast).width+70);c.fillStyle=INK;round(c,512-w/2,214,w,72,36);c.fill();c.fillStyle=PAPER;c.fillText(t.toast,512,264);}
      }else{
        c.fillStyle='rgba(255,252,246,.82)';round(c,212,8,600,190,40);c.fill();
        c.fillStyle=INK;c.font=font(800,92);c.fillText(t.title||t.count||'0',512,118);
        c.font=font(700,40);c.fillStyle='rgba(44,45,61,.7)';c.fillText(turn||name,512,172);
        if(t.toast){c.font=font(700,40);const w=Math.min(980,c.measureText(t.toast).width+70);c.fillStyle=INK;round(c,512-w/2,214,w,72,36);c.fill();c.fillStyle=PAPER;c.fillText(t.toast,512,264);}
      }
      hud.tex.needsUpdate=true;
    }

    // The menu rides on the left hand: flip it palm-up or raise it. Point with the right hand to pick.
    // A tall pane of frosted glass in Dahrooj's ink and paper: the world shows faintly through it.
    const MW=768,MH=1200,MENU_W=.24,MENU_H=MENU_W*MH/MW;
    const menu=panel(MENU_W,MENU_H,MW,MH);rig.add(menu.mesh);menu.mesh.visible=false;menu.mesh.scale.setScalar(.01);menu.mesh.name='xr-menu';
    const buttons=[],PAD=36,IN=MW-PAD*2;
    // Positions go right to left in Arabic and left to right in English (see layoutMenu).
    MODES.forEach(([id,ar,en],i)=>buttons.push({kind:'mode',id,ar,en,i,y:182+Math.floor(i/3)*108,w:220,h:96}));
    STYLES.forEach(([id,ar,en],i)=>buttons.push({kind:'style',id,ar,en,i,y:462,w:128,h:140}));
    [['trigger','زناد','Trigger'],['hand','يد','Hand'],['sling','نبيطة','Sling']].forEach(([id,ar,en],i)=>buttons.push({kind:'throw',id,ar,en,i,y:676,w:224,h:92}));
    buttons.push({kind:'time',id:'time',i:0,y:842,w:342,h:92});
    buttons.push({kind:'weather',id:'weather',i:1,y:842,w:342,h:92});
    buttons.push({kind:'place',id:'place',i:0,y:962,w:224,h:92});
    buttons.push({kind:'lang',id:'lang',i:1,y:962,w:224,h:92});
    buttons.push({kind:'exit',id:'exit',ar:'خروج',en:'Exit',i:2,y:962,w:224,h:92});
    function layoutMenu(){
      const rtl=lang!=='en';
      for(const b of buttons){
        const step=b.kind==='mode'?232:b.kind==='style'?142:b.kind==='throw'||b.kind==='place'||b.kind==='lang'||b.kind==='exit'?236:354,
          n=b.kind==='mode'?3:b.kind==='style'?5:b.kind==='time'||b.kind==='weather'?2:3,col=b.kind==='mode'?b.i%3:b.i;
        b.x=PAD+(rtl?n-1-col:col)*step;
      }
    }
    layoutMenu();
    let chOpen=false;const MENU_LEAN=new T.Quaternion().setFromEuler(new T.Euler(-1.3,0,0));
    const STYLE_DOTS={jelly:['#6b6f7a','#3a3d45'],fabric:['#a8405e','#5e1d31'],clay:['#b07a52','#6b4429'],fur:['#fffaf2','#d9cfc0'],bubble:['#e9f6ff','#9fcbe8']};
    function drawMenu(hover){
      const sky=nature?nature.settings:{time:'auto',weather:'auto'};
      // Padel isn't in the headset, so neither is its challenge.
      const chs=(g.challenges?g.challenges():[]).filter(c=>c.id!=='rally10');
      const key=[modeNow(),g.style(),throwStyle,kind,sky.time,sky.weather,hover.join(','),chOpen,lang,chs.map(c=>c.value).join(',')].join('|');if(key===menu.key)return;menu.key=key;
      const c=menu.ctx;c.clearRect(0,0,MW,MH);
      // Glass: a soft paper tint, brighter at the top, a white rim and a faint diagonal sheen.
      let gr=c.createLinearGradient(0,0,0,MH);gr.addColorStop(0,'rgba(255,252,246,.78)');gr.addColorStop(1,'rgba(240,234,224,.62)');
      c.fillStyle=gr;round(c,6,6,MW-12,MH-12,64);c.fill();
      c.save();round(c,6,6,MW-12,MH-12,64);c.clip();
      gr=c.createLinearGradient(0,0,MW,MH*.55);gr.addColorStop(0,'rgba(255,255,255,.55)');gr.addColorStop(.35,'rgba(255,255,255,0)');gr.addColorStop(.62,'rgba(255,255,255,0)');gr.addColorStop(.7,'rgba(255,255,255,.18)');gr.addColorStop(.78,'rgba(255,255,255,0)');
      c.fillStyle=gr;c.fillRect(0,0,MW,MH);c.restore();
      c.lineWidth=4;c.strokeStyle='rgba(255,255,255,.85)';round(c,8,8,MW-16,MH-16,62);c.stroke();
      c.lineWidth=2;c.strokeStyle='rgba(44,45,61,.16)';round(c,4,4,MW-8,MH-8,66);c.stroke();
      // Title and section labels.
      c.textAlign='center';c.direction=tr('rtl','ltr');c.fillStyle=INK;c.font=font(800,60);c.fillText(tr('دحروج','Dahrooj'),MW/2,92);
      c.fillStyle='rgba(44,45,61,.12)';c.fillRect(PAD+40,120,IN-80,2);
      if(chOpen){
        // The challenges, with progress, in place of the options.
        const done=chs.filter(x=>x.value>=x.goal).length;
        c.font=font(700,30);c.fillStyle='rgba(44,45,61,.62)';c.fillText(tr(`التحديات · ${done} من ${chs.length}`,`Challenges · ${done} of ${chs.length}`),MW/2,164);
        const rowH=Math.min(64,760/Math.max(1,chs.length));
        chs.forEach((x,k)=>{
          const y=186+k*rowH,ok=x.value>=x.goal;
          c.fillStyle=ok?'rgba(44,45,61,.9)':'rgba(255,255,255,.55)';round(c,PAD,y,IN,rowH-8,(rowH-8)/2);c.fill();
          const title=lang==='en'&&x.en?x.en:x.title,rtl=lang!=='en';
          c.textAlign=rtl?'right':'left';c.fillStyle=ok?PAPER:INK;c.font=font(700,Math.min(28,rowH*.46));c.fillText((ok?'✓ ':'')+title,rtl?MW-PAD-24:PAD+24,y+rowH*.5+2);
          c.textAlign=rtl?'left':'right';c.font=font(800,Math.min(26,rowH*.42));c.fillText(`${x.value}/${x.goal}`,rtl?PAD+22:MW-PAD-22,y+rowH*.5+2);
          c.textAlign='center';
        });
      }else{
      c.font=font(700,30);c.fillStyle='rgba(44,45,61,.62)';
      for(const [t,y] of [[tr('النمط','Mode'),164],[tr('الستايل','Style'),444],[tr('الرمي','Throw'),658],[tr('العالم','World'),824]])c.fillText(t,MW/2,y);
      }
      buttons.forEach((b,i)=>{
        if(chOpen)return;
        const label=b.kind==='lang'?(lang==='en'?'العربية':'English'):b.kind==='place'?(kind==='immersive-ar'?tr('ثبّت من جديد','Re-pin'):tr('توسيط','Recentre'))
          :b.kind==='time'?tr('الوقت: ','Time: ')+named(TIMES,sky.time):b.kind==='weather'?tr('الطقس: ','Weather: ')+named(WEATHERS,sky.weather):tr(b.ar,b.en);
        // Time and weather belong to the VR world; the room has its own.
        if((b.kind==='time'||b.kind==='weather')&&!natureOn())c.globalAlpha=.35;
        const on=(b.kind==='mode'&&b.id===modeNow())||(b.kind==='style'&&b.id===g.style())||(b.kind==='throw'&&b.id===throwStyle),hot=hover.includes(i);
        const r=b.kind==='style'?36:b.h/2;
        // Glass buttons: lighter panes with a white edge; the chosen one is solid ink.
        if(on){c.fillStyle=INK;round(c,b.x,b.y,b.w,b.h,r);c.fill();}
        else{
          const bg=c.createLinearGradient(0,b.y,0,b.y+b.h);bg.addColorStop(0,hot?'rgba(255,255,255,.95)':'rgba(255,255,255,.62)');bg.addColorStop(1,hot?'rgba(255,255,255,.7)':'rgba(255,255,255,.3)');
          c.fillStyle=bg;round(c,b.x,b.y,b.w,b.h,r);c.fill();
          c.lineWidth=2.5;c.strokeStyle=hot?'rgba(44,45,61,.35)':'rgba(255,255,255,.9)';c.stroke();
        }
        if(b.kind==='style'){
          // A little Dahrooj in that style: a shaded body with two eyes.
          const [a,d]=STYLE_DOTS[b.id]||['#888','#444'],cx=b.x+b.w/2,cy=b.y+52;
          const bg=c.createRadialGradient(cx-10,cy-12,4,cx,cy,32);bg.addColorStop(0,a);bg.addColorStop(1,d);
          c.fillStyle=bg;c.beginPath();c.arc(cx,cy,30,0,7);c.fill();c.lineWidth=2;c.strokeStyle='rgba(44,45,61,.25)';c.stroke();
          for(const ex of [-9,9]){c.fillStyle='#fff';c.beginPath();c.arc(cx+ex,cy-3,6.5,0,7);c.fill();c.fillStyle=INK;c.beginPath();c.arc(cx+ex,cy-2,3.3,0,7);c.fill();}
          c.fillStyle=on?PAPER:INK;c.font=font(800,28);c.fillText(label,cx,b.y+122);
        }else{
          c.fillStyle=on?PAPER:INK;c.font=font(800,label.length>10?32:38);c.fillText(label,b.x+b.w/2,b.y+b.h/2+13);
        }
        c.globalAlpha=1;
      });
      c.textAlign='center';c.fillStyle='rgba(44,45,61,.66)';c.font=font(600,27);
      const hint=chOpen?[tr('X لإغلاق التحديات','X closes the challenges'),'']
        :climbOn?[tr('العصا اليسار للحركة · A أو X للقفز','Left stick to move · A or X to jump'),tr('الزناد للرمي · Y للقائمة','Trigger to throw · Y for the menu')]
        :throwStyle==='sling'?[tr('اسحب دحروج بالزناد اليمين ثم أفلت','Pull Dahrooj back with the right trigger, let go'),tr('A يرجّع دحروج · Y للقائمة · X للتحديات','A calls him back · Y menu · X challenges')]
        :[tr('الزناد اليمين للرمي · اليسار يفجّر','Right trigger throws · left trigger pops'),tr('A يرجّع دحروج · Y للقائمة · X للتحديات','A calls him back · Y menu · X challenges')];
      c.fillText(hint[0],MW/2,1110);c.fillText(hint[1],MW/2,1152);
      menu.tex.needsUpdate=true;
    }
    function menuHit(uv){
      const x=uv.x*MW,y=(1-uv.y)*MH;
      return chOpen?-1:buttons.findIndex(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
    }
    function menuAction(i){
      const b=buttons[i];if(!b)return;
      if(b.kind==='mode'){holder=null;if(b.id==='climb')setClimb(true);else{setClimb(false);g.setMode(b.id);}}
      else if(b.kind==='style')g.setStyle(b.id);
      else if(b.kind==='throw'){holder=null;throwStyle=b.id;}
      else if(b.kind==='exit')session?.end();
      else if(b.kind==='lang'){lang=lang==='en'?'ar':'en';try{localStorage.setItem('dahrooj-lang',lang);}catch(_){}g.setLang?.(lang);layoutMenu();menu.key=hud.key=start.key='';}
      else if(b.kind==='time'&&natureOn()){const i=TIMES.findIndex(t=>t[0]===nature.settings.time);nature.set({time:TIMES[(i+1)%TIMES.length][0]});}
      else if(b.kind==='weather'&&natureOn()){const i=WEATHERS.findIndex(t=>t[0]===nature.settings.weather);nature.set({weather:WEATHERS[(i+1)%WEATHERS.length][0]});}
      else if(b.kind==='place'){if(kind==='immersive-ar'){holder=null;placing=true;}else{climbSpot=null;place();}}
    }

    /* ---------- the slingshot, held in the left hand ---------- */
    const wood=new T.MeshStandardMaterial({color:0x8a5a34,roughness:.75}),rubber=new T.MeshStandardMaterial({color:0xc8442f,roughness:.5});
    const fork=new T.Group();fork.visible=false;fork.name='xr-slingshot';
    function stick(a,b,r,mat){
      const m=new T.Mesh(new T.CylinderGeometry(r,r,1,10),mat),d=b.clone().sub(a);
      m.position.copy(a).add(b).multiplyScalar(.5);m.scale.y=d.length();m.quaternion.setFromUnitVectors(UP,d.normalize());return m;
    }
    const tipL=V(-.04,.15,-.045),tipR=V(.04,.15,-.045),crotch=V(0,.07,-.03);
    fork.add(stick(V(0,-.06,-.01),crotch,.012,wood),stick(crotch,tipL,.009,wood),stick(crotch,tipR,.009,wood));
    const point=p=>{const o=new T.Object3D();o.position.copy(p);fork.add(o);return o;};
    const tips=[point(tipL),point(tipR)],pouch=point(V(0,.14,.02)),forkCenter=point(V(0,.15,-.045));
    const bands=[0,1].map(()=>{const m=new T.Mesh(new T.CylinderGeometry(.0045,.0045,1,6),rubber);m.visible=false;rig.add(m);return m;});
    function stretch(m,a,b){const d=b.clone().sub(a),l=d.length();m.position.copy(a).add(b).multiplyScalar(.5);m.scale.y=Math.max(l,1e-4);if(l>1e-6)m.quaternion.setFromUnitVectors(UP,d.divideScalar(l));m.visible=true;}
    // Dotted flight preview while pulling the slingshot.
    const DOTS=26,dots=[];
    for(let i=0;i<DOTS;i++){const d=new T.Mesh(new T.SphereGeometry(1,8,6),new T.MeshBasicMaterial({color:0x2c2d3d,transparent:true,opacity:.55}));d.visible=false;scene.add(d);dots.push(d);}

    /* ---------- AR: find surfaces and pin the court on one ---------- */
    const reticle=new T.Mesh(new T.RingGeometry(.07,.09,40).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:0xfffaf2,transparent:true,opacity:.9,depthTest:false}));
    reticle.renderOrder=4;reticle.visible=false;rig.add(reticle);
    const planesGroup=new T.Group();rig.add(planesGroup);
    const planeLines=new Map(),hitSources=new Map();

    /* ---------- the opening: Dahrooj balls rain into the room, then a start button ---------- */
    const INTRO_R=.11,INTRO_STYLES=['jelly','fabric','clay','fur','bubble'];
    const introGroup=new T.Group();introGroup.name='xr-intro';introGroup.scale.setScalar(INTRO_R/BR);rig.add(introGroup);
    const start=panel(.56,.28,1024,512);start.mesh.name='xr-start';start.mesh.visible=false;rig.add(start.mesh);
    function drawStart(hot){
      const popped=intro?intro.popped:0,key='start|'+hot+'|'+popped;if(start.key===key)return;start.key=key;
      const c=start.ctx;c.clearRect(0,0,1024,512);c.textAlign='center';c.direction=tr('rtl','ltr');
      c.fillStyle='rgba(255,252,246,.94)';round(c,6,6,1012,500,70);c.fill();
      c.fillStyle=INK;c.font=font(800,120);c.fillText(tr('دحروج','Dahrooj'),512,170);
      c.fillStyle=hot?'#44465a':INK;round(c,212,250,600,170,85);c.fill();
      c.fillStyle=PAPER;c.font=font(800,66);c.fillText(tr('بدء اللعبة','Play'),540,358);
      c.beginPath();c.moveTo(300,300);c.lineTo(300,370);c.lineTo(352,335);c.closePath();c.fill();
      c.fillStyle='rgba(44,45,61,.6)';c.font=font(700,34);c.fillText(popped?tr(`فجّرت ${popped}`,`Popped ${popped}`):tr('وجّه يدك واضغط الزناد لتفجير الكور','Aim and pull the trigger to pop the balls'),512,470);
      start.tex.needsUpdate=true;
    }
    function beginIntro(){const st=g.stage();if(st&&st.grp)st.grp.visible=false;intro={t:0,frames:0,balls:[],shots:[],sparks:[],ready:false,leaving:0,popped:0,spawned:false,gap:0};}
    const INTRO_COUNT=40,ROOM=2.6,FRONT=1.1,SHOT_R=.02,SPARK=new T.SphereGeometry(1,8,6);
    const STYLE_COLORS={jelly:0x4b4e56,fabric:0x7c2941,clay:0x825637,fur:0xf1ebe1,bubble:0xcfe8ff};
    // A wave of balls rains all around the player once the headset has reported a few poses.
    function spawnIntro(){
      const {pos,dir}=headLocal(),yaw=Math.atan2(dir.x,-dir.z);intro.spawned=true;intro.gap=0;intro.wall=intro.wall||performance.now();
      for(let i=0;i<INTRO_COUNT;i++){
        // In front of the player, across the room.
        const a=yaw+(Math.random()-.5)*FRONT*2,dist=.6+Math.random()*2,style=INTRO_STYLES[i%5],sp=.25+Math.random()*.45,dirA=Math.random()*Math.PI*2;
        const m=models?models.make(style,{lite:true}):null;if(m)introGroup.add(m.group);
        intro.balls.push({m,style,p:V(pos.x+Math.sin(a)*dist,pos.y+.7+Math.random()*1.1,pos.z-Math.cos(a)*dist),v:V(0,0,0),
          born:intro.t+i*.09,gx:Math.cos(dirA)*sp,gz:Math.sin(dirA)*sp,hop:.5+Math.random()*2.5,d:0,dv:0,hit:0,blink:0,next:1+Math.random()*3});
      }
    }
    function endIntro(){
      if(!intro||intro.leaving)return;
      intro.leaving=.001;start.mesh.visible=false;
      for(const s of [...intro.shots,...intro.sparks])rig.remove(s.m);intro.shots.length=intro.sparks.length=0;
      placing=kind==='immersive-ar';g.respawn();
      const st=g.stage();if(st&&st.grp&&!climbOn)st.grp.visible=true;
    }
    function clearIntro(){
      if(!intro)return;
      for(const b of intro.balls)if(b.m)introGroup.remove(b.m.group);
      for(const s of [...intro.shots,...intro.sparks])rig.remove(s.m);
      intro=null;introGroup.scale.setScalar(INTRO_R/BR);
      const st=g.stage();if(st&&st.grp&&!climbOn)st.grp.visible=true;
    }
    // The trigger fires a small shot along the hand's ray; a hit pops the ball.
    function fireIntro(h){
      const I=intro;if(!I||I.leaving||clock-(h.lastShot||0)<.12)return;h.lastShot=clock;
      const d=V(0,0,-1).applyQuaternion(h.target.quaternion).normalize();
      // Each shot is a small eyeless Dahrooj in the next style; it rolls once it lands.
      const style=INTRO_STYLES[(I.fired=(I.fired||0)+1)%INTRO_STYLES.length];
      const model=models?models.make(style,{face:false,lite:true}):null,m=model?model.group:new T.Mesh(SPARK,new T.MeshBasicMaterial({color:STYLE_COLORS[style]}));
      if(!model)m.scale.setScalar(SHOT_R);rig.add(m);
      I.shots.push({m,model,style,p:h.target.position.clone().addScaledVector(d,.08),v:d.multiplyScalar(9),t:0,q:new T.Quaternion()});
      g.whoosh(.2);
    }
    function popBall(b){
      const I=intro;I.balls.splice(I.balls.indexOf(b),1);I.popped++;if(b.m)introGroup.remove(b.m.group);
      for(let k=0;k<12;k++){
        const m=new T.Mesh(SPARK,new T.MeshBasicMaterial({color:k%3?STYLE_COLORS[b.style]:0xfffaf2,transparent:true}));m.scale.setScalar(.012+Math.random()*.01);rig.add(m);
        const a=Math.random()*Math.PI*2,e=Math.random()*Math.PI-Math.PI/2,v=1+Math.random()*1.6;
        I.sparks.push({m,p:b.p.clone(),v:V(Math.cos(a)*Math.cos(e)*v,Math.sin(e)*v+1,Math.sin(a)*Math.cos(e)*v),t:0,max:.45+Math.random()*.3});
      }
      g.popSound?.();
    }
    // Room physics in metres: gravity, the floor, wandering and hopping, and the balls pushing each other.
    function stepIntro(dt){
      const I=intro;
      if(I.leaving){
        I.leaving+=dt;const k=Math.max(0,1-I.leaving/.35);introGroup.scale.setScalar(INTRO_R/BR*Math.max(.001,k));
        if(k<=0)clearIntro();
        return;
      }
      if(!I.spawned){if(++I.frames>=3)spawnIntro();return;}
      I.t+=dt;
      // All popped: a new wave a moment later.
      if(!I.balls.length){I.gap+=dt;if(I.gap>1)spawnIntro();}
      const live=I.balls.filter(b=>I.t>=b.born),{pos:head,dir:face}=headLocal();
      for(const b of live){
        const grounded=b.p.y<=INTRO_R+.001&&Math.abs(b.v.y)<.01;
        b.v.y-=REAL_G*dt;
        if(grounded){
          b.v.x+=(b.gx-b.v.x)*Math.min(1,dt*2);b.v.z+=(b.gz-b.v.z)*Math.min(1,dt*2);
          b.hop-=dt;if(b.hop<=0){b.v.y=1.6+Math.random()*1.6;b.hop=1+Math.random()*2.5;b.dv-=3;
            if(Math.random()<.5){const a=Math.random()*Math.PI*2,sp=.25+Math.random()*.45;b.gx=Math.cos(a)*sp;b.gz=Math.sin(a)*sp;}}
        }
        b.p.addScaledVector(b.v,dt);
        if(b.p.y<INTRO_R){
          const sp=-b.v.y;b.p.y=INTRO_R;
          if(sp>.6){b.v.y=sp*.5;b.dv-=sp*2.2;b.hit=.2;if(sp>2&&g.bump)g.bump(Math.min(1,sp/6)*.4);}
          else b.v.y=0;
        }
        // Wander in front of the player: past the edge of the view or the room, head back in.
        const ox=b.p.x-head.x,oz=b.p.z-head.z,od=Math.hypot(ox,oz)||1;
        const off=Math.atan2(ox*face.z-oz*face.x,ox*face.x+oz*face.z);
        if(od>ROOM||od<.45||Math.abs(off)>FRONT){
          const a=Math.atan2(face.x,-face.z)+(Math.random()-.5)*FRONT,r=.7+Math.random()*1.6,sp=.3+Math.random()*.4;
          const tx=head.x+Math.sin(a)*r-b.p.x,tz=head.z-Math.cos(a)*r-b.p.z,tl=Math.hypot(tx,tz)||1;b.gx=tx/tl*sp;b.gz=tz/tl*sp;
        }
        if(od>ROOM+.4){b.p.x=head.x+ox/od*(ROOM+.4);b.p.z=head.z+oz/od*(ROOM+.4);}
        b.dv+=(-b.d*320-b.dv*12)*dt;b.d=clamp(b.d+b.dv*dt,-.3,.45);
        b.hit=Math.max(0,b.hit-dt);b.next-=dt;if(b.next<=0){b.blink=.14;b.next=2+Math.random()*3;}b.blink=Math.max(0,b.blink-dt);
      }
      for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
        const a=live[i],b=live[j],n=b.p.clone().sub(a.p),l=n.length();
        if(l>0&&l<INTRO_R*2){
          n.divideScalar(l);const push=(INTRO_R*2-l)/2;a.p.addScaledVector(n,-push);b.p.addScaledVector(n,push);
          const rel=b.v.clone().sub(a.v).dot(n);if(rel<0){a.v.addScaledVector(n,rel*.8);b.v.addScaledVector(n,-rel*.8);}
        }
      }
      // Shots fly, bounce and roll like Dahrooj, popping the balls they touch.
      for(let k=I.shots.length-1;k>=0;k--){
        const s=I.shots[k];s.t+=dt;s.v.y-=REAL_G*dt*(s.t<.3?.12:1);s.p.addScaledVector(s.v,dt); // flies true along the ray, then drops
        if(s.p.y<SHOT_R){s.p.y=SHOT_R;if(s.v.y<-.8)s.v.y*=-.45;else s.v.y=0;s.v.x*=Math.pow(.55,dt);s.v.z*=Math.pow(.55,dt);}
        const sp=Math.hypot(s.v.x,s.v.z);
        if(sp>.01){const axis=V(s.v.z,0,-s.v.x).normalize();s.q.premultiply(new T.Quaternion().setFromAxisAngle(axis,sp/SHOT_R*dt));}
        if(s.model){s.model.update({pos:s.p.clone().multiplyScalar(1)});s.m.scale.setScalar(SHOT_R/BR);}
        s.m.position.copy(s.p);s.m.quaternion.copy(s.q);
        const hit=live.find(b=>I.balls.includes(b)&&b.p.distanceTo(s.p)<INTRO_R+SHOT_R);
        if(hit){popBall(hit);s.v.multiplyScalar(.6);}
        if(s.t>5){rig.remove(s.m);I.shots.splice(k,1);}
      }
      for(let k=I.sparks.length-1;k>=0;k--){
        const s=I.sparks[k];s.t+=dt;s.v.y-=REAL_G*.5*dt;s.p.addScaledVector(s.v,dt);s.m.position.copy(s.p);s.m.material.opacity=1-s.t/s.max;
        if(s.t>=s.max){rig.remove(s.m);s.m.material.dispose();I.sparks.splice(k,1);}
      }
      if(!I.ready&&(I.t>3.2||performance.now()-I.wall>3200)){
        I.ready=true;const {pos,dir}=headLocal();
        start.mesh.position.set(pos.x+dir.x*1.05,pos.y-.12,pos.z+dir.z*1.05);start.mesh.visible=true;
      }
      if(I.ready){eyeNow();start.mesh.lookAt(eye);}
    }
    function drawIntro(){
      if(!intro)return;
      eyeNow();
      for(const b of intro.balls){
        if(!b.m)continue;
        b.m.group.visible=intro.t>=b.born;
        const falling=b.p.y>INTRO_R+.02&&b.v.y<-1.5;
        b.m.update({pos:V(b.p.x,b.p.y-INTRO_R*Math.max(0,b.d),b.p.z).multiplyScalar(BR/INTRO_R),toward:eye,
          faceName:b.hit>0?'closed':falling?'wide':'open',blink:b.blink>0,squash:[1+b.d*.75,1-b.d]});
      }
    }

    /* ---------- controllers and hands ---------- */
    const hands=[0,1].map(i=>{
      const target=renderer.xr.getController(i),grip=renderer.xr.getControllerGrip(i);
      rig.add(target,grip);
      const h={i,target,grip,source:null,hist:[],charging:false,hover:-1,lastMove:0,buttons:[]};
      h.line=new T.Line(new T.BufferGeometry().setFromPoints([V(0,0,0),V(0,0,-1)]),new T.LineBasicMaterial({color:0x2c2d3d,transparent:true,opacity:.5}));
      target.add(h.line);
      h.dot=new T.Mesh(new T.SphereGeometry(.02,14,10),new T.MeshStandardMaterial({color:0xfffaf2,roughness:.5}));grip.add(h.dot);
      target.addEventListener('connected',e=>{
        const src=e.data;h.source=src;
        if(kind==='immersive-ar'&&session?.requestHitTestSource&&src.targetRaySpace)
          session.requestHitTestSource({space:src.targetRaySpace}).then(s=>{if(h.source===src)hitSources.set(h,s);else s.cancel();},()=>{});
      });
      target.addEventListener('disconnected',()=>{release(h,true);h.source=null;hitSources.get(h)?.cancel();hitSources.delete(h);});
      target.addEventListener('selectstart',()=>press(h,'trigger'));
      target.addEventListener('selectend',()=>release(h));
      target.addEventListener('squeezestart',()=>press(h));
      target.addEventListener('squeezeend',()=>release(h));
      return h;
    });
    const leftHand=()=>hands.find(h=>h.source?.handedness==='left');
    // The hand holding the slingshot (the left), when the slingshot is chosen.
    const forkHand=()=>throwStyle==='sling'?leftHand():null;
    function rayOf(h){
      h.target.getWorldPosition(wp);h.target.getWorldQuaternion(wq);
      return {origin:wp.clone(),dir:V(0,0,-1).applyQuaternion(wq).normalize()};
    }
    // Hand velocity in world units: the fastest ~40 ms stretch of the last 200 ms. Players often
    // let go just after the peak of a swing, so the latest instant alone would feel weak.
    function velocity(h){
      const hist=h.hist,n=hist.length,best=V(0,0,0);if(n<2)return best;
      const now=hist[n-1].t,v=V(0,0,0);
      for(let i=n-1,j=n-1;i>0;i--){
        if(now-hist[i].t>.2)break;
        j=Math.min(j,i-1);while(j>0&&hist[i].t-hist[j].t<SPAN)j--;
        const dt=hist[i].t-hist[j].t;if(dt<.008)continue;
        v.copy(hist[i].p).sub(hist[j].p).divideScalar(dt);
        if(v.lengthSq()>best.lengthSq())best.copy(v);
      }
      return best;
    }
    // Launch velocity in real metres per second (world directions), or null for too gentle a release.
    function launch(h,from){
      const s=scaleNow(),F=forkHand();
      if(F&&F!==h&&F.source){
        forkCenter.getWorldPosition(wp);const pull=wp.clone().sub(from).divideScalar(s);
        if(pull.length()<SLING_MIN)return null;
        if(pull.length()>SLING_MAX)pull.setLength(SLING_MAX);
        return pull.multiplyScalar(SLING_K);
      }
      if(throwStyle==='trigger'){
        // Along the hand's ray, as fast as the charge: real metres per second.
        const d=V(0,0,-1).applyQuaternion(h.target.getWorldQuaternion(wq)).normalize();
        return d.multiplyScalar(CHARGE_MIN+(CHARGE_MAX-CHARGE_MIN)*chargePower(h));
      }
      const u=velocity(h).multiplyScalar(GAIN/s);
      return u.length()<MIN_THROW?null:u;
    }
    // Holding the trigger charges the throw; the power rises and falls so you can pick your moment.
    const CHARGE_MIN=2.2,CHARGE_MAX=11,CHARGE_TIME=1.1;
    function chargePower(h){const p=((h.chargeT||0)/CHARGE_TIME)%2;return Math.max(.08,p<1?p:2-p);}
    // Real speed to game speed: the world is s times smaller and its time runs timeK times faster.
    const toGame=u=>{const v=u.clone().multiplyScalar(scaleNow()/timeK());if(v.length()>MAX_SPEED)v.setLength(MAX_SPEED);return v;};

    function press(h,how){
      if(!session)return;
      if(h.hover>=0){menuAction(h.hover);return;}
      if(intro){if(h.onStart)endIntro();else fireIntro(h);return;}
      if(menuOpen&&h===leftHand())return;
      // Controllers: the left trigger is a blaster that pops the Dahroojs around the modes.
      if(how==='trigger'&&h===leftHand()&&h.source?.gamepad&&!placing&&!climbOn&&!forkHand()&&!g.stage().networked){fireBlast(h);return;}
      if(placing){if(anchor){placing=false;g.respawn();}return;}
      if(climbOn){if(h===leftHand())climb3.jump();else climb3.throwBall();return;}
      const st=g.stage();
      if(st.networked){
        if(st.xrAim&&st.xrAim()){h.charging=true;return;}
        if(st.xrDistract){const r=rayOf(h);st.xrDistract(r.origin,r.dir);}
        return;
      }
      if(h===forkHand())return; // this hand holds the slingshot
      // Dahrooj in flight keeps going and a fresh one comes to the hand: throw them back to back.
      if(S.shot&&!g.another())g.recall();
      // Dahrooj appears straight in the hand with a little pop, rather than flying over to it.
      if(!holder&&g.canHold()){holder=h;holdT=0;popT=0;h.chargeT=0;parked=false;S.held=true;S.vel.set(0,0,0);S.shot=false;}
    }
    function release(h,lost){
      if(holder===h){
        holder=null;
        const u=lost?null:launch(h,S.pos);
        if(u)g.throwWith(toGame(u));else{parked=true;popT=0;S.pos.copy(updateParkSpot(forkHand()));}
      }
      if(h.charging){
        h.charging=false;const st=g.stage();
        h.grip.getWorldPosition(wp);
        const u=lost?null:launch(h,wp.clone());
        if(u&&st.xrAim&&st.xrAim())duelShot(st,u.multiplyScalar(DUEL_GAIN));
      }
    }
    // Duel is server-authoritative: turn the throw into a shot the server accepts.
    function duelShot(st,v){
      const p=S.pos,z=st.aimZ;
      let t=v.z<-.5?(z-p.z)/v.z:1.6;t=clamp(t,.8,1.6);
      const target=[clamp(p.x+v.x*t,-9,9),clamp(p.y+v.y*t-.5*g.GRAV*t*t,.35,6),z];
      if(st.submitShot&&st.submitShot({target,flight:t,curve:0}))g.whoosh(Math.min(1,v.length()/18));
    }
    /* ---------- the left-hand blaster ---------- */
    // Small eyeless Dahroojs fly along the left ray, as on the start page, and pop the Dahroojs they
    // touch: the ones resting in the world, earlier throws still in the air, and the one in flight.
    // They knock into Motri's props too, and set off the crates.
    const blast={shots:[],sparks:[],popped:0,fired:0};
    function fireBlast(h){
      if(clock-(h.lastShot||0)<.12)return;h.lastShot=clock;
      const {origin,dir}=rayOf(h),k=scaleNow(),style=INTRO_STYLES[++blast.fired%INTRO_STYLES.length];
      const model=models?models.make(style,{face:false,lite:true}):null,m=model?model.group:new T.Mesh(SPARK,new T.MeshBasicMaterial({color:STYLE_COLORS[style]}));
      scene.add(m);
      blast.shots.push({m,model,p:origin.addScaledVector(dir,.08*k),v:dir.multiplyScalar(9*k),t:0,q:new T.Quaternion()});
      g.whoosh(.2);
    }
    function burst(p,style){
      const k=scaleNow();
      for(let i=0;i<14;i++){
        const m=new T.Mesh(SPARK,new T.MeshBasicMaterial({color:i%3?STYLE_COLORS[style]||0xfffaf2:0xfffaf2,transparent:true}));m.scale.setScalar((.012+Math.random()*.012)*k);scene.add(m);
        const a=Math.random()*Math.PI*2,e=Math.random()*Math.PI-Math.PI/2,v=(1.2+Math.random()*1.8)*k;
        blast.sparks.push({m,p:p.clone(),v:V(Math.cos(a)*Math.cos(e)*v,Math.sin(e)*v+k,Math.sin(a)*Math.cos(e)*v),t:0,max:.45+Math.random()*.3});
      }
      blast.popped++;g.popSound?.();g.chAdd?.('pop20');
    }
    function stepBlast(dt){
      if(!blast.shots.length&&!blast.sparks.length)return;
      const k=scaleNow(),R=SHOT_R*k,G=REAL_G*k;
      for(let i=blast.shots.length-1;i>=0;i--){
        const s=blast.shots[i];s.t+=dt;s.v.y-=G*dt*(s.t<.3?.12:1);s.p.addScaledVector(s.v,dt);
        if(s.p.y<R){s.p.y=R;if(s.v.y<-.8*k)s.v.y*=-.45;else s.v.y=0;s.v.x*=Math.pow(.55,dt);s.v.z*=Math.pow(.55,dt);}
        if(natureOn()&&nature.props)nature.props.collide(s.p,s.v,R);
        roomCollide(s.p,s.v,R,dt);
        const sp=Math.hypot(s.v.x,s.v.z);
        if(sp>.01){const axis=V(s.v.z,0,-s.v.x).normalize();s.q.premultiply(new T.Quaternion().setFromAxisAngle(axis,sp/R*dt));}
        if(s.model){s.model.update({pos:s.p.clone()});s.m.scale.setScalar(R/BR);}else s.m.scale.setScalar(R);
        s.m.position.copy(s.p);s.m.quaternion.copy(s.q);
        // What it touches pops.
        const near=p=>p.distanceTo(s.p)<BR+R;let hit=false;
        for(let j=rests.length-1;j>=0;j--)if(near(rests[j].p)){const r=rests[j];burst(r.p,r.style);if(r.m){scene.remove(r.m.group);models.forget?.(r.m.group);}rests.splice(j,1);hit=true;}
        const vol=g.volley();for(let j=vol.length-1;j>=0;j--)if(near(vol[j].pos)){burst(vol[j].pos,g.style());vol.splice(j,1);hit=true;}
        if(S.shot&&!S.held&&near(S.pos)){burst(S.pos,g.style());holder=null;g.recall();hit=true;}
        if(hit)s.v.multiplyScalar(.6);
        if(s.t>5){scene.remove(s.m);blast.shots.splice(i,1);}
      }
      for(let i=blast.sparks.length-1;i>=0;i--){
        const s=blast.sparks[i];s.t+=dt;s.v.y-=G*.5*dt;s.p.addScaledVector(s.v,dt);s.m.position.copy(s.p);s.m.material.opacity=1-s.t/s.max;
        if(s.t>=s.max){scene.remove(s.m);s.m.material.dispose();blast.sparks.splice(i,1);}
      }
    }
    function clearBlast(){for(const s of [...blast.shots,...blast.sparks])scene.remove(s.m);blast.shots.length=blast.sparks.length=0;}
    // A or X: Dahrooj comes back at once.
    function recall(){
      const st=g.stage();
      if(st.networked){st.xrRecall?.();return;}
      g.clearVolley();if(S.shot){holder=null;g.recall();}
    }

    /* ---------- placing the world ---------- */
    // The point of the court pinned to the surface: the target (goal mouth, hoop, window, cans, opponent).
    const targetPoint=()=>V(0,0,g.stage().aimZ||-10);
    function place(){
      const A=targetPoint();placedFor=g.mode();
      if(kind!=='immersive-ar'){
        rig.scale.setScalar(VR_SCALE);rig.rotation.set(0,0,0);rig.position.set(0,0,.5*VR_SCALE);
        hud.mesh.position.set(0,1.85,-3.2);hud.mesh.scale.setScalar(1);return;
      }
      if(!anchor){const {pos,dir}=headLocal();anchor={P:V(pos.x+dir.x*1.6,0,pos.z+dir.z*1.6),theta:Math.atan2(dir.x,-dir.z)};}
      // The physical spot P becomes the target point, with the court facing the player.
      const s=arScale;rig.scale.setScalar(s);rig.rotation.set(0,anchor.theta,0);
      rig.position.copy(A).sub(anchor.P.clone().multiplyScalar(s).applyAxisAngle(UP,anchor.theta));
      hud.mesh.position.copy(anchor.P).add(V(0,.32+2.6/s,0));hud.mesh.scale.setScalar(.55);
    }
    function aimAtSurface(frame){
      // The headset's own surfaces (hit test) first, the floor otherwise.
      const h=hands.find(x=>x.source&&x!==leftHand())||hands.find(x=>x.source);if(!h)return null;
      const src=hitSources.get(h),space=renderer.xr.getReferenceSpace();
      if(frame&&src&&space){
        const res=frame.getHitTestResults(src);
        if(res.length){const tf=res[0].getPose(space)?.transform;
          if(tf){const q=tf.orientation,n=V(0,1,0).applyQuaternion(new T.Quaternion(q.x,q.y,q.z,q.w));return {P:V(tf.position.x,tf.position.y,tf.position.z),n};}}
      }
      const o=h.target.position,d=V(0,0,-1).applyQuaternion(h.target.quaternion);
      if(d.y<-.05){const t=-o.y/d.y;if(t<8)return {P:o.clone().addScaledVector(d,t),n:V(0,1,0)};}
      return null;
    }
    // Where the court goes for a spot on a surface. On a wall (its normal lies flat) the court stands on
    // the floor below with its back against the wall: the goal's net or the hoop's board touches it.
    function anchorFrom(P,n){
      if(Math.abs(n.y)<.5){
        const f=V(n.x,0,n.z).normalize(),st=g.stage(),box=new T.Box3().setFromObject(st.grp);
        const back=Math.max(0,((st.aimZ||-10)-box.min.z))/arScale+.03;
        return {P:V(P.x,0,P.z).addScaledVector(f,back),theta:Math.atan2(-f.x,f.z),wall:true};
      }
      const {pos}=headLocal(),dx=P.x-pos.x,dz=P.z-pos.z;
      return {P,theta:Math.hypot(dx,dz)>.05?Math.atan2(dx,-dz):anchor?.theta||0};
    }
    // Outline the surfaces the headset found while choosing a spot.
    /* ---------- mixed reality: the real room's walls and furniture as colliders (AR) ---------- */
    // The headset's detected planes (walls, tables, sofa, ceiling...) are turned into game space every
    // frame. A ball is tested along the path it moved this frame, so a fast throw can't slip through a
    // wall between two frames. The real floor stays the game's own floor.
    const roomPlanes=new Map(),lp=V(0,0,0),lq=V(0,0,0),rn=V(0,0,0);
    function updateRoom(frame){
      if(kind!=='immersive-ar'){if(roomPlanes.size)for(const [k,e] of roomPlanes)if(!e.test)roomPlanes.delete(k);return;}
      const planes=frame&&frame.detectedPlanes,space=renderer.xr.getReferenceSpace();if(!planes||!space)return;
      rig.updateMatrixWorld();const seen=new Set();
      for(const plane of planes){
        const label=(plane.semanticLabel||'').toLowerCase();if(label==='floor')continue;
        const pose=frame.getPose(plane.planeSpace,space);if(!pose)continue;seen.add(plane);
        let e=roomPlanes.get(plane);if(!e){e={m:new T.Matrix4(),inv:new T.Matrix4()};roomPlanes.set(plane,e);}
        if(e.t!==plane.lastChangedTime){e.t=plane.lastChangedTime;e.poly=plane.polygon.map(q=>[q.x,q.z]);}
        e.label=label;e.m.fromArray(pose.transform.matrix).premultiply(rig.matrixWorld);e.inv.copy(e.m).invert();
      }
      for(const [k,e] of roomPlanes)if(!e.test&&!seen.has(k))roomPlanes.delete(k);
    }
    function inPoly(x,z,poly){
      let inside=false;
      for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,zi]=poly[i],[xj,zj]=poly[j];
        if(((zi>z)!==(zj>z))&&(x<(xj-xi)*(z-zi)/(zj-zi)+xi))inside=!inside;}
      return inside;
    }
    // Sphere (game units) against every room plane; bounces off like the game's own walls.
    function roomCollide(p,v,R,step){
      if(!roomPlanes.size)return 0;
      let hit=0;const s=rig.scale.x,r=R/s;
      for(const e of roomPlanes.values()){
        lp.copy(p).applyMatrix4(e.inv);lq.copy(p).addScaledVector(v,-step).applyMatrix4(e.inv);
        const crossed=(lp.y>0)!==(lq.y>0);
        if(!crossed&&Math.abs(lp.y)>=r)continue;
        // Where the path met the plane (or the nearest point), inside the surface's outline?
        const t=crossed?lq.y/(lq.y-lp.y):1,cx=lq.x+(lp.x-lq.x)*t,cz=lq.z+(lp.z-lq.z)*t;
        if(!inPoly(cx,cz,e.poly))continue;
        // Back onto the side it came from, touching the surface, and a bounce that loses a little.
        const side=(crossed?lq.y:lp.y)>=0?1:-1;
        rn.set(0,side,0).transformDirection(e.m);
        if(crossed)p.copy(lp.set(cx,side*r*1.001,cz).applyMatrix4(e.m));
        else p.addScaledVector(rn,(r-Math.abs(lp.y))*s);
        const vn=v.dot(rn);if(vn<0){v.addScaledVector(rn,-1.55*vn);v.multiplyScalar(.92);hit=Math.max(hit,-vn);}
      }
      return hit;
    }
    // For tests: a stand-in wall (matrix in rig space, outline in its own x/z).
    function addTestPlane(matrixArray,poly){rig.updateMatrixWorld();const m=new T.Matrix4().fromArray(matrixArray).premultiply(rig.matrixWorld);
      roomPlanes.set({},{test:true,m,inv:m.clone().invert(),poly,label:'wall'});}
    function showPlanes(frame){
      const planes=frame&&frame.detectedPlanes,space=renderer.xr.getReferenceSpace(),seen=new Set();
      if(placing&&planes&&space)for(const plane of planes){
        seen.add(plane);let e=planeLines.get(plane);
        if(!e||e.t!==plane.lastChangedTime){
          if(e)planesGroup.remove(e.line);
          const line=new T.LineLoop(new T.BufferGeometry().setFromPoints(plane.polygon.map(p=>V(p.x,p.y,p.z))),new T.LineBasicMaterial({color:0xfffaf2,transparent:true,opacity:.6}));
          line.matrixAutoUpdate=false;planesGroup.add(line);e={line,t:plane.lastChangedTime};planeLines.set(plane,e);
        }
        const pose=frame.getPose(plane.planeSpace,space);
        if(pose){e.line.matrix.fromArray(pose.transform.matrix);e.line.visible=true;}else e.line.visible=false;
      }
      for(const [plane,e] of planeLines)if(!seen.has(plane)){planesGroup.remove(e.line);planeLines.delete(plane);}
    }

    /* ---------- Summit ---------- */
    function setClimb(on){
      if(on&&!climb3){
        if(!window.createDahroojClimb3D||!g.climbCore)return;
        climb3=window.createDahroojClimb3D(T,{core:g.climbCore,models,BR,renderer,unit:climbUnit});rig.add(climb3.group);climb3.start();
      }
      climbOn=!!on&&!!climb3;
      if(climb3)climb3.show(climbOn);
      const st=g.stage();if(st&&st.grp)st.grp.visible=!climbOn;
      holder=null;parked=false;S.held=false;g.clearVolley();hud.key='';
      if(!climbOn&&session)place();
    }
    // The mountain stands on the pinned surface (AR) or on a plinth just in front of you (VR).
    function placeClimb(){
      let P,theta;
      if(kind==='immersive-ar'&&anchor){P=anchor.P;theta=anchor.theta;}
      else{
        // VR: the mountain stands on the ground where the goal stands, facing you, like the other modes.
        // A few centimetres up, so its own ground doesn't flicker against the stone floor.
        if(!climbSpot)climbSpot={P:V(0,.04,(CLIMB_Z-rig.position.z)/rig.scale.x),theta:0};
        P=climbSpot.P;theta=climbSpot.theta;
      }
      climb3.group.position.copy(P);climb3.group.rotation.set(0,-theta,0);
      climb3.setBase(kind==='immersive-ar'?0:P.y);
      hud.mesh.position.copy(P).add(V(0,24*climbUnit+.12,0));hud.mesh.scale.setScalar(.5);
    }
    function climbEvent(e){
      if(e.type==='land'){if(e.power>.08)g.bump?.(e.power*.8);}
      else if(e.type==='launch')g.whoosh(e.power);
      else if(e.type==='throw')g.whoosh(.25);
      else if(e.type==='hurt')g.bump?.(1);
      g.climbEvent?.(e);
    }

    /* ---------- session ---------- */
    async function enter(mode,{opening=false,climb=false}={}){
      if(session||!navigator.xr)return;
      if(!XR_MODES.has(g.mode()))g.setMode('goal');
      const options=mode==='immersive-ar'
        ?{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking','hit-test','plane-detection']}
        :{optionalFeatures:['local-floor','bounded-floor','hand-tracking']};
      const s=await navigator.xr.requestSession(mode,options);
      session=s;kind=mode;anchor=null;placing=mode==='immersive-ar';menuToggled=false;
      renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');
      scene.add(rig);rig.add(camera);place();
      if(mode==='immersive-vr'&&!nature&&window.createDahroojNature)nature=window.createDahroojNature(T,{scene,hemi:g.hemi,sun:g.sun,lineMat:g.lineMat});
      // A crate going up throws every Dahrooj nearby into the air.
      if(nature?.props&&!nature.props.onExplode)nature.props.onExplode=(at,R)=>{
        g.boom?.();g.chAdd?.('crates5');
        const blast=(p,v)=>{const d=V(p.x-at.x,0,p.z-at.z),l=d.length();if(l>R)return;const k=1-l/R;
          if(l>.01)v.addScaledVector(d.divideScalar(l),9*k);v.y+=6*k;p.y=Math.max(p.y,BR+.01);};
        for(const r of rests)blast(r.p,r.v);
        for(const b of g.volley())blast(b.pos,b.vel);
        if(S.shot&&!S.held)blast(S.pos,S.vel);
      };
      if(nature)nature.enable(mode==='immersive-vr');
      floor.visible=mode==='immersive-vr'&&!nature;
      s.addEventListener('end',onEnd);
      await renderer.xr.setSession(s);
      lastTime=0;frames=0;renderer.setAnimationLoop(loop);
      g.respawn();
      if(opening){placing=false;beginIntro();}
      climbSpot=null;climbUnit=mode==='immersive-ar'?CLIMB_AR:CLIMB_VR;climb3?.setUnit(climbUnit);if(climb)setClimb(true);
    }
    function onEnd(){
      renderer.setAnimationLoop(null);
      for(const s of hitSources.values())s.cancel?.();hitSources.clear();
      clearIntro();start.mesh.visible=false;
      setClimb(false);holder=null;parked=false;placing=false;S.held=false;g.clearVolley();g.respawn();
      session=null;kind=null;
      rig.remove(camera);scene.remove(rig);
      if(nature)nature.enable(false);
      scene.background=null;floor.visible=false;ballSprite.visible=false;
      for(const a of actorSprites)a.visible=false;for(const d of dots)d.visible=false;
      if(ballModel)ballModel.group.visible=false;for(const m of [...actorModels,...volleyModels])if(m)m.group.visible=false;
      clearRests();clearBlast();
      renderer.xr.enabled=false;
      g.resize();g.onExit?.();
    }

    /* ---------- thrown balls stay in the world ---------- */
    // When a throw is over, that Dahrooj stays where he stopped instead of vanishing: he rolls on,
    // bumps into the others and now and then sets off on his own. The oldest go when there are many.
    const RESTS_MAX=36,REST_ROOM=26,rests=[];
    g.setRestHook?.((pos,vel)=>{
      if(!session||g.stage().networked||climbOn)return;
      const m=models?models.make(g.style(),{lite:true}):null;if(m)scene.add(m.group);
      rests.push({m,style:g.style(),p:pos.clone(),v:vel.clone(),d:0,dv:0,wander:1.5+Math.random()*4,blink:0,next:1+Math.random()*3,mood:null,moodT:0,petT:0});
      if(rests.length>RESTS_MAX){const o=rests.shift();if(o.m){scene.remove(o.m.group);models.forget?.(o.m.group);}}
    });
    function clearRests(){for(const r of rests)if(r.m){scene.remove(r.m.group);models.forget?.(r.m.group);}rests.length=0;}
    // Tracks on the grass, snow and ground wherever a ball touches down or rolls.
    function markBall(p,v){
      if(!natureOn()||p.y>BR*1.2)return;
      const sp=Math.hypot(v.x,v.z),hit=Math.abs(v.y);
      if(sp<.25&&hit<1)return;
      nature.mark(p.x,p.z,BR*(.85+Math.min(.8,hit*.08)),Math.min(.6,.12+sp*.04+hit*.06));
    }
    function stepRests(dt){
      const G=g.GRAV,cx=0,cz=-10;
      for(const r of rests){
        const p=r.p,v=r.v;v.y-=G*dt;p.addScaledVector(v,dt);
        let grounded=false;
        if(p.y<BR){p.y=BR;if(v.y<-1.4){r.dv-=Math.min(8,-v.y);v.y*=-.45;}else{v.y=0;grounded=true;}}
        if(grounded){
          const f=Math.pow(.75,dt);v.x*=f;v.z*=f;
          // A life of their own: every few seconds a roll in a random direction, sometimes a hop.
          r.wander-=dt;
          if(r.wander<=0){const a=Math.random()*Math.PI*2,sp=.6+Math.random()*1.8;v.x+=Math.cos(a)*sp;v.z+=Math.sin(a)*sp;if(Math.random()<.35){v.y=2+Math.random()*2;r.dv-=3;}r.wander=3+Math.random()*7;}
        }
        // Stay on the field.
        const ox=p.x-cx,oz=p.z-cz,od=Math.hypot(ox,oz);if(od>REST_ROOM){v.x-=ox/od*dt*4;v.z-=oz/od*dt*4;}
        r.dv+=(-r.d*300-r.dv*12)*dt;r.d=clamp(r.d+r.dv*dt,-.3,.45);
        r.next-=dt;if(r.next<=0){r.blink=.14;r.next=2+Math.random()*3;}r.blink=Math.max(0,r.blink-dt);
        markBall(p,v);
      }
      for(let i=0;i<rests.length;i++)for(let j=i+1;j<rests.length;j++){
        const a=rests[i],b=rests[j],n=b.p.clone().sub(a.p),l=n.length();
        if(l>0&&l<BR*2){n.divideScalar(l);const push=(BR*2-l)/2;a.p.addScaledVector(n,-push);b.p.addScaledVector(n,push);
          const rel=b.v.clone().sub(a.v).dot(n);if(rel<0){a.v.addScaledVector(n,rel*.9);b.v.addScaledVector(n,-rel*.9);}}
      }
    }
    /* ---------- Dahrooj feels you: pat one and he giggles; shake the one in your hand and he gets dizzy ---------- */
    const handAt=V(0,0,0);
    function feelHands(dt){
      for(const r of rests){r.moodT=Math.max(0,r.moodT-dt);r.petT=Math.max(0,r.petT-dt);}
      for(const h of hands){
        if(!h.source)continue;h.grip.getWorldPosition(handAt);
        for(const r of rests){
          if(r.petT>0||handAt.distanceTo(r.p)>BR*1.7)continue;
          r.petT=1.4;r.mood='joy';r.moodT=1.3;r.dv-=4;if(r.p.y<=BR*1.05)r.v.y=2.2;r.blink=0;
          g.squeak?.(1+Math.random()*.3);g.chAdd?.('pet5');
        }
      }
      // Shaking: the holding hand travels a long way over a quarter second but stays in one place.
      if(holder&&holder.hist.length>4){
        const k=scaleNow(),hs=holder.hist;let path=0;for(let i=1;i<hs.length;i++)path+=hs[i].p.distanceTo(hs[i-1].p);
        const net=hs[hs.length-1].p.distanceTo(hs[0].p);
        if(path/k>.55&&net/k<.18&&!(S.mood==='dizzy'&&S.moodT>0)){S.mood='dizzy';S.moodT=1.8;S.moodNext=null;g.squeak?.(.7);}
      }
    }
    function drawRests(){
      for(const r of rests){
        if(!r.m)continue;r.m.group.visible=!climbOn&&!intro;
        const sp=Math.hypot(r.v.x,r.v.z);
        r.m.update({pos:V(r.p.x,r.p.y-BR*Math.max(0,r.d),r.p.z),toward:eye,faceName:r.moodT>0?r.mood:sp>5?'wide':'open',blink:r.blink>0,squash:[1+r.d*.75,1-r.d]});
      }
    }

    /* ---------- per frame ---------- */
    const parkSpot=V(0,0,0);
    // Between throws Dahrooj sits in the slingshot, or floats just in front of you at chest height.
    function updateParkSpot(F){
      if(F?.source){pouch.getWorldPosition(parkSpot);return parkSpot;}
      const {pos,dir}=headLocal();
      parkSpot.set(pos.x+dir.x*.38-dir.z*.1,Math.max(.45,pos.y-.38),pos.z+dir.z*.38+dir.x*.1);
      rig.localToWorld(parkSpot);parkSpot.y=Math.max(parkSpot.y,BR);return parkSpot;
    }
    function updateMenu(dt){
      const L=leftHand();let want=false;
      if(L){
        // Controllers: the Y button. Hands (no buttons): turn the palm up.
        want=menuToggled;
        if(L.source?.hand){L.grip.getWorldQuaternion(wq);const up=V(0,1,0).applyQuaternion(wq).y;want=menuOpen?up<.15:up<-.3;}
        if(want){
          if(L.source?.hand){menu.mesh.position.copy(L.grip.position).add(V(0,.23,0));eyeNow();menu.mesh.lookAt(eye);}
          else{
            // With a controller the pane rises from the wrist, like a hologram from a watch: it tilts with
            // the hand and leans back toward you.
            const q=L.grip.quaternion;
            menu.mesh.position.copy(L.grip.position).add(V(0,.13,.08).applyQuaternion(q));
            menu.mesh.quaternion.copy(q).multiply(MENU_LEAN);
          }
        }
      }
      menuOpen=want;
      const k=clamp(menu.mesh.scale.x+(want?1:-1)*dt*7,.01,1);menu.mesh.scale.setScalar(k);menu.mesh.visible=k>.02;
    }
    function loop(time,frame){
      const dt=lastTime?clamp((time-lastTime)/1000,0,.05):1/72;lastTime=time;clock+=dt;frames++;
      const st=g.stage();
      if(natureOn()){eyeNow();nature.setPitch?.(g.stage().farZ??targetPoint().z);nature.update(dt,eye);}
      else if(kind==='immersive-vr'){const p=g.paper();if(p!==paper){paper=p;floor.material.color.set(p);scene.background=new T.Color(p);}}
      // Jelly Dahroojs show the world around them: refresh their capture of it (VR only; AR has no world to capture).
      models?.updateProbe?.(renderer,scene,S.pos,{sun:g.sun,on:natureOn()&&g.style()==='jelly',dt});
      if(placedFor!==g.mode())place();
      updateMenu(dt);
      // AR placement: aim at a surface and the court follows; the trigger pins it.
      if(placing){
        const hit=aimAtSurface(frame);
        if(hit){
          anchor=anchorFrom(hit.P,hit.n);place();
          reticle.position.copy(hit.P);reticle.quaternion.setFromUnitVectors(V(0,1,0),hit.n);reticle.visible=true;
        }
      }else reticle.visible=false;
      if(kind==='immersive-ar')showPlanes(frame);
      updateRoom(frame);
      const hover=[],F=climbOn?null:forkHand();let startHot=false,stickX=0;
      for(const h of hands){
        h.grip.getWorldPosition(wp);h.hist.push({p:wp.clone(),t:clock});
        while(h.hist.length&&clock-h.hist[0].t>.25)h.hist.shift();
        const r=rayOf(h);ray.set(r.origin,r.dir);
        const hit=menu.mesh.visible&&h!==leftHand()?ray.intersectObject(menu.mesh,false)[0]:null;
        h.hover=hit?menuHit(hit.uv):-1;if(h.hover>=0)hover.push(h.hover);
        h.onStart=!hit&&start.mesh.visible&&!!ray.intersectObject(start.mesh,false)[0];if(h.onStart)startHot=true;
        h.line.scale.z=(hit?hit.distance:.6*scaleNow())/scaleNow();
        h.line.visible=h.dot.visible=!!h.source&&holder!==h&&h!==F;
        const pad=h.source?.gamepad,axes=pad?.axes;
        if(pad){
          const now=[4,5].map(i=>!!pad.buttons[i]?.pressed),edge=now.map((b,i)=>b&&!h.buttons[i]);h.buttons=now;
          // Summit: A or X jumps, B or Y throws. Elsewhere either calls Dahrooj back.
          // Y (left) opens and closes the menu, X (left) the challenges. Summit: A or X jumps, B throws. Elsewhere A or B calls Dahrooj back.
          if(h===leftHand()&&edge[1]){menuToggled=!menuToggled;if(menuToggled)chOpen=false;menu.key='';}
          // X (left) opens the challenges; again closes them. (On the Summit X still jumps.)
          else if(h===leftHand()&&edge[0]&&!climbOn){if(menuToggled&&chOpen)menuToggled=false;else{menuToggled=true;chOpen=true;}menu.key='';}
          else if(climbOn){if(edge[0])climb3.jump();if(edge[1])climb3.throwBall();}
          else if(edge.some(Boolean))recall();
        }
        if(climbOn&&axes&&axes.length>3){
          if(h===leftHand()||!leftHand())stickX=Math.abs(axes[2])>.25?axes[2]:stickX;
          // The right stick up and down resizes the mountain.
          if(h!==leftHand()&&Math.abs(axes[3])>.4){climbUnit=clamp(climbUnit*Math.exp(-axes[3]*dt*.9),.012,.2);climb3.setUnit(climbUnit);hud.key='';}
          continue;
        }
        // Duel: either thumbstick moves Dahrooj sideways.
        if(st.xrMove&&axes&&axes.length>2&&Math.abs(axes[2])>.35&&clock-h.lastMove>.1){h.lastMove=clock;st.xrMove(axes[2]);}
        // AR: thumbstick up makes the court bigger, down makes it smaller. The pinned spot stays.
        if(kind==='immersive-ar'&&axes&&axes.length>3&&Math.abs(axes[3])>.4&&!holder){
          arScale=clamp(arScale*Math.exp(axes[3]*dt*.9),AR_MIN,AR_MAX);place();
        }
      }
      if(climbOn){climb3.setDir(stickX);placeClimb();}
      fork.visible=!!F?.source;if(F?.source&&fork.parent!==F.grip)F.grip.add(fork);
      drawMenu(hover);drawHud();if(start.mesh.visible)drawStart(startHot);
      if(intro){stepIntro(dt);drawIntro();}
      stepBlast(dt);
      hud.mesh.visible=!intro;
      eyeNow();hud.mesh.lookAt(eye);
      // Dahrooj waits by your hand (or in the slingshot) between throws.
      if(st.networked){if(parked||(S.held&&!holder)){parked=false;S.held=false;}}
      // Only once the headset has reported a few poses, so he doesn't appear somewhere else first.
      else if(!S.shot&&!holder&&!placing&&!intro&&!climbOn&&!parked&&frames>3){parked=true;popT=0;S.pos.copy(updateParkSpot(F));}
      if(parked){S.held=true;S.pos.lerp(updateParkSpot(F),1-Math.exp(-dt*10));S.vel.set(0,0,0);S.grounded=false;}
      popT+=dt;
      // The held ball rides in front of the hand (in the pouch with the slingshot), easing in.
      if(holder){
        holdT+=dt;holder.grip.getWorldPosition(wp);holder.grip.getWorldQuaternion(wq);
        fwd.set(0,0,-1).applyQuaternion(wq);
        const target=F?.source?wp:wp.addScaledVector(fwd,BR*1.05);
        S.pos.copy(target);S.vel.set(0,0,0);S.grounded=false;
      }
      // Slingshot bands follow the pouch: Dahrooj, the pulling hand in Duel, or the rest spot.
      if(F?.source){
        const puller=hands.find(h=>h.charging);
        if(!st.networked&&(holder||parked))wp.copy(S.pos);else if(puller)puller.grip.getWorldPosition(wp);else pouch.getWorldPosition(wp);
        const end=rig.worldToLocal(wp.clone());
        tips.forEach((o,i)=>{o.getWorldPosition(wp);stretch(bands[i],rig.worldToLocal(wp.clone()),end);});
      }else for(const b of bands)b.visible=false;
      // The flight preview while pulling.
      if(holder)holder.chargeT=(holder.chargeT||0)+dt;
      const u=holder&&(F?.source||throwStyle==='trigger')?launch(holder,S.pos):null;
      if(u){
        const v=toGame(u),p=S.pos.clone(),step=.05,r=.012*scaleNow();
        for(const d of dots){
          for(let k=0;k<3;k++){v.y-=g.GRAV*step/3;v.multiplyScalar(Math.pow(.9,step/3));p.addScaledVector(v,step/3);}
          d.position.copy(p);d.scale.setScalar(r);d.visible=p.y>0;
        }
      }else for(const d of dots)d.visible=false;
      if(climbOn){eyeNow();climb3.update(dt,{style:g.style(),eye,onEvent:climbEvent});}
      else{
        g.step(dt*timeK());
        stepRests(dt*timeK());feelHands(dt);
        if(!S.held)markBall(S.pos,S.vel);
        for(const b of g.volley())markBall(b.pos,b.vel);
        // Motri's props: Dahrooj bounces off poles and benches, shoves lanterns and sets off crates.
        // Mixed reality: the real walls and furniture.
        if(roomPlanes.size){
          const k=dt*timeK();
          if(S.shot&&!S.held){const h=roomCollide(S.pos,S.vel,BR,k);if(h>1)g.bump(Math.min(1,h/12));}
          for(const b of g.volley())roomCollide(b.pos,b.vel,BR,k);
          for(const r of rests)roomCollide(r.p,r.v,BR,k);
        }
        if(natureOn()&&nature.props){
          const P=nature.props;
          if(S.shot&&!S.held&&P.collide(S.pos,S.vel,BR))g.bump(Math.min(1,Math.hypot(S.vel.x,S.vel.z)/12));
          for(const b of g.volley())P.collide(b.pos,b.vel,BR);
          for(const r of rests)P.collide(r.p,r.v,BR);
        }
      }
      // Dahrooj, the Duel opponent and small balls.
      // Dahrooj shows only while the trigger holds him or he flies; waiting, he's out of sight (in the slingshot he waits in the pouch).
      const d=S.d,shown=(!st.playerVisible||st.playerVisible())&&!((placing||intro||climbOn||!((parked&&F?.source)||holder||S.shot))&&!st.networked),actors=st.xrActors?st.xrActors():[];
      const face=parked&&!(S.mood&&S.moodT>0)?'open':g.ballFace();
      if(models){
        ballModel=model(ballModel,g.style(),true);
        ballModel.update({pos:S.pos,toward:eye,faceName:face,blink:S.blink>0,squash:[1+d*.75,1-d]});
        // Pop in: grow from small with a slight overshoot.
        if(popT<.25){const k=popT/.25,e=1+2.2*Math.pow(k-1,3)+1.2*Math.pow(k-1,2);ballModel.group.scale.multiplyScalar(Math.max(.05,e));}
        ballModel.group.visible=shown;
        actors.forEach((a,i)=>{
          const m=actorModels[i]=model(actorModels[i],a.style,a.face!=='none'),k=a.r/BR;
          m.update({pos:a.pos,toward:eye,faceName:a.face,blink:a.blink,squash:[k,k]});
        });
        for(let i=actors.length;i<actorModels.length;i++)if(actorModels[i])actorModels[i].group.visible=false;
        // Earlier throws still in the air.
        drawRests();
        const flying=g.volley();
        flying.forEach((b,i)=>{
          const m=volleyModels[i]=model(volleyModels[i],g.style(),true);
          m.update({pos:b.pos,toward:eye,faceName:b.hitT>0?'closed':b.mood&&b.moodT>0?b.mood:'wide',blink:false,squash:[1+b.d*.75,1-b.d]});
        });
        for(let i=flying.length;i<volleyModels.length;i++)if(volleyModels[i])volleyModels[i].group.visible=false;
      }else{
        showSprite(ballSprite,S.pos,BR,g.style(),face,S.blink>0,1+d*.75,1-d);ballSprite.visible=shown;
        while(actorSprites.length<actors.length)actorSprites.push(makeSprite());
        actorSprites.forEach((s,i)=>{const a=actors[i];if(a)showSprite(s,a.pos,a.r,a.style,a.face,a.blink);else s.visible=false;});
      }
      g.render();
    }

    return {enter,get presenting(){return !!session;},get kind(){return kind;},get holding(){return !!holder;},
      get placing(){return placing;},get rests(){return rests;},get ballShown(){return !!ballModel?.group.visible;},get challengesOpen(){return chOpen;},get lang(){return lang;},get roomPlanes(){return roomPlanes.size;},addTestPlane,
      // For tests: pin the court as if the hit test found this spot and surface normal.
      testPin(P,n){anchor=anchorFrom(V(...P),V(...n));place();placing=false;g.respawn();},get anchor(){return anchor;},get menuLayout(){return {w:MW,h:MH,buttons:buttons.map(b=>({...b}))};},get blast(){return blast;},get nature(){return nature;},get climbing(){return climbOn;},get climb(){return climb3;},get opening(){return !!intro;},get popped(){return intro?intro.popped:0;},get parked(){return parked;},get menuOpen(){return menuOpen;},get throwStyle(){return throwStyle;},
      // For tests: what each hand reports.
      inspect:()=>hands.map(h=>({connected:!!h.source,hand:h.source?.handedness,samples:h.hist.length,velocity:velocity(h).toArray()}))};
  };
})();
