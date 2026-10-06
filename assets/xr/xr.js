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
  const MODES=[['goal','مرمى'],['hoop','سلة'],['window','شباك'],['cans','علب'],['bowling','بولينغ'],['climb','الجبل']];
  const STYLES=[['jelly','جيلي'],['fabric','قماش'],['clay','صلصال'],['fur','فرو'],['bubble','فقاعة']];
  const XR_MODES=new Set(MODES.map(m=>m[0]));
  const LABEL=Object.fromEntries(MODES);
  const INK='#2c2d3d',PAPER='#fffaf2';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  window.createDahroojXR=g=>{
    const {T,renderer,scene,camera,S,BR,V}=g;
    let session=null,kind=null,lastTime=0,holder=null,holdT=0,clock=0,paper='',arScale=AR_SCALE,popT=1,frames=0;
    // Throw styles: 'trigger' (aim, hold to charge, let go), 'hand' (a real swing), 'sling'.
    let throwStyle='trigger',menuToggled=false,parked=false,placing=false,anchor=null,placedFor='',menuOpen=false,intro=null;
    // Summit: a model mountain on the table (AR) or on a plinth in front of you (VR).
    let climbOn=false,climb3=null,climbSpot=null,climbUnit=.022;
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
    const TIMES=[['auto','تلقائي'],['day','نهار'],['dusk','غروب'],['night','ليل'],['dawn','فجر']];
    const WEATHERS=[['auto','تلقائي'],['clear','صافي'],['rain','مطر'],['snow','ثلج']];
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
        if(slot)scene.remove(slot.group);
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
      const t=g.texts(),name=LABEL[g.mode()]||'',turn=t.turn==='Your turn'?'دورك':t.turn?'دور الخصم':'';
      const ch=climbOn&&climb3?climb3.hud():null;
      const key=placing?'placing':ch?['climb',ch.hearts,ch.height,ch.checkpoint,ch.again,t.title,t.toast].join('|'):[t.title,t.count,turn,t.toast,name].join('|');if(key===hud.key)return;hud.key=key;
      const c=hud.ctx;c.clearRect(0,0,1024,300);c.textAlign='center';c.direction='rtl';
      if(placing){
        c.fillStyle='rgba(255,252,246,.88)';round(c,62,30,900,230,46);c.fill();c.fillStyle=INK;
        c.font=font(800,52);c.fillText('وجّه على سطح واضغط الزناد للتثبيت',512,125);
        c.font=font(700,40);c.fillStyle='rgba(44,45,61,.7)';c.fillText('العصا للأعلى والأسفل تكبّر وتصغّر',512,200);
      }else if(ch){
        c.fillStyle='rgba(255,252,246,.82)';round(c,212,8,600,190,40);c.fill();
        c.font=font(800,70);for(let i=0;i<ch.max;i++){c.fillStyle=i<ch.hearts?'#c8584b':'rgba(44,45,61,.2)';c.fillText('♥',422+i*90,98);}
        c.font=font(700,44);c.fillStyle='rgba(44,45,61,.75)';c.fillText(ch.again?'A للتسلق من جديد':t.title||`${ch.height} م`,512,170);
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
    const MENU_W=.46,MENU_H=MENU_W*820/1024;
    const menu=panel(MENU_W,MENU_H,1024,820);rig.add(menu.mesh);menu.mesh.visible=false;menu.mesh.scale.setScalar(.01);menu.mesh.name='xr-menu';
    const buttons=[];
    MODES.forEach(([id,label],i)=>buttons.push({kind:'mode',id,label,x:24+i*164,y:80,w:152,h:112}));
    STYLES.forEach(([id,label],i)=>buttons.push({kind:'style',id,label,x:24+i*197,y:272,w:185,h:112}));
    buttons.push({kind:'throw',id:'trigger',label:'زناد',x:24,y:472,w:152,h:104});
    buttons.push({kind:'throw',id:'hand',label:'يد',x:184,y:472,w:152,h:104});
    buttons.push({kind:'throw',id:'sling',label:'نبيطة',x:344,y:472,w:152,h:104});
    buttons.push({kind:'place',id:'place',label:'',x:524,y:472,w:232,h:104});
    buttons.push({kind:'exit',id:'exit',label:'خروج',x:768,y:472,w:232,h:104});
    buttons.push({kind:'time',id:'time',label:'',x:24,y:612,w:476,h:100});
    buttons.push({kind:'weather',id:'weather',label:'',x:524,y:612,w:476,h:100});
    function drawMenu(hover){
      const sky=nature?nature.settings:{time:'auto',weather:'auto'};
      const key=[modeNow(),g.style(),throwStyle,kind,sky.time,sky.weather,hover.join(',')].join('|');if(key===menu.key)return;menu.key=key;
      const c=menu.ctx;c.clearRect(0,0,1024,820);
      c.fillStyle='rgba(255,252,246,.94)';round(c,4,4,1016,812,46);c.fill();
      c.strokeStyle='rgba(44,45,61,.18)';c.lineWidth=4;c.stroke();
      c.textAlign='center';c.direction='rtl';c.fillStyle='rgba(44,45,61,.55)';c.font=font(700,34);
      c.fillText('النمط',512,62);c.fillText('الستايل',512,254);c.fillText('الرمي',260,454);
      c.font=font(600,30);c.fillText(climbOn?'العصا اليسار للحركة · A أو X للقفز · الزناد للرمي · Y للقائمة':'اضغط الزناد مطوّلًا للقوة ثم أفلت · A يرجّع دحروج · Y للقائمة',512,770);
      buttons.forEach((b,i)=>{
        const label=b.kind==='place'?(kind==='immersive-ar'?'ثبّت من جديد':'توسيط')
          :b.kind==='time'?'الوقت: '+Object.fromEntries(TIMES)[sky.time]:b.kind==='weather'?'الطقس: '+Object.fromEntries(WEATHERS)[sky.weather]:b.label;
        // Time and weather belong to the VR world; the room has its own.
        if((b.kind==='time'||b.kind==='weather')&&!natureOn())c.globalAlpha=.35;
        const on=(b.kind==='mode'&&b.id===modeNow())||(b.kind==='style'&&b.id===g.style())||(b.kind==='throw'&&b.id===throwStyle),hot=hover.includes(i);
        c.fillStyle=on?INK:hot?'rgba(44,45,61,.14)':'rgba(44,45,61,.05)';round(c,b.x,b.y,b.w,b.h,b.h/2);c.fill();
        c.fillStyle=on?PAPER:INK;c.font=font(800,label.length>8&&b.w<400?32:40);c.fillText(label,b.x+b.w/2,b.y+b.h/2+14);c.globalAlpha=1;
      });
      menu.tex.needsUpdate=true;
    }
    function menuHit(uv){
      const x=uv.x*1024,y=(1-uv.y)*820;
      return buttons.findIndex(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
    }
    function menuAction(i){
      const b=buttons[i];if(!b)return;
      if(b.kind==='mode'){holder=null;if(b.id==='climb')setClimb(true);else{setClimb(false);g.setMode(b.id);}}
      else if(b.kind==='style')g.setStyle(b.id);
      else if(b.kind==='throw'){holder=null;throwStyle=b.id;}
      else if(b.kind==='exit')session?.end();
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
    const introGroup=new T.Group();introGroup.scale.setScalar(INTRO_R/BR);rig.add(introGroup);
    const start=panel(.56,.28,1024,512);start.mesh.name='xr-start';start.mesh.visible=false;rig.add(start.mesh);
    function drawStart(hot){
      const popped=intro?intro.popped:0,key='start|'+hot+'|'+popped;if(start.key===key)return;start.key=key;
      const c=start.ctx;c.clearRect(0,0,1024,512);c.textAlign='center';c.direction='rtl';
      c.fillStyle='rgba(255,252,246,.94)';round(c,6,6,1012,500,70);c.fill();
      c.fillStyle=INK;c.font=font(800,120);c.fillText('دحروج',512,170);
      c.fillStyle=hot?'#44465a':INK;round(c,212,250,600,170,85);c.fill();
      c.fillStyle=PAPER;c.font=font(800,66);c.fillText('بدء اللعبة',540,358);
      c.beginPath();c.moveTo(300,300);c.lineTo(300,370);c.lineTo(352,335);c.closePath();c.fill();
      c.fillStyle='rgba(44,45,61,.6)';c.font=font(700,34);c.fillText(popped?`فجّرت ${popped}`:'وجّه يدك واضغط الزناد لتفجير الكور',512,470);
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
      target.addEventListener('selectstart',()=>press(h));
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

    function press(h){
      if(!session)return;
      if(h.hover>=0){menuAction(h.hover);return;}
      if(intro){if(h.onStart)endIntro();else fireIntro(h);return;}
      if(menuOpen&&h===leftHand())return;
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
        if(res.length){const p=res[0].getPose(space)?.transform.position;if(p)return V(p.x,p.y,p.z);}
      }
      const o=h.target.position,d=V(0,0,-1).applyQuaternion(h.target.quaternion);
      if(d.y<-.05){const t=-o.y/d.y;if(t<8)return o.clone().addScaledVector(d,t);}
      return null;
    }
    // Outline the surfaces the headset found while choosing a spot.
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
        if(!climbSpot){const {pos,dir}=headLocal();climbSpot={P:V(pos.x+dir.x*.7,Math.max(.5,pos.y-.75),pos.z+dir.z*.7),theta:Math.atan2(dir.x,-dir.z)};}
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
        g.boom?.();
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
      climbSpot=null;if(climb)setClimb(true);
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
      clearRests();
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
      rests.push({m,p:pos.clone(),v:vel.clone(),d:0,dv:0,wander:1.5+Math.random()*4,blink:0,next:1+Math.random()*3});
      if(rests.length>RESTS_MAX){const o=rests.shift();if(o.m)scene.remove(o.m.group);}
    });
    function clearRests(){for(const r of rests)if(r.m)scene.remove(r.m.group);rests.length=0;}
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
    function drawRests(){
      for(const r of rests){
        if(!r.m)continue;r.m.group.visible=!climbOn&&!intro;
        const sp=Math.hypot(r.v.x,r.v.z);
        r.m.update({pos:V(r.p.x,r.p.y-BR*Math.max(0,r.d),r.p.z),toward:eye,faceName:sp>5?'wide':'open',blink:r.blink>0,squash:[1+r.d*.75,1-r.d]});
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
        if(want){menu.mesh.position.copy(L.grip.position).add(V(0,.2,0));eyeNow();menu.mesh.lookAt(eye);}
      }
      menuOpen=want;
      const k=clamp(menu.mesh.scale.x+(want?1:-1)*dt*7,.01,1);menu.mesh.scale.setScalar(k);menu.mesh.visible=k>.02;
    }
    function loop(time,frame){
      const dt=lastTime?clamp((time-lastTime)/1000,0,.05):1/72;lastTime=time;clock+=dt;frames++;
      const st=g.stage();
      if(natureOn()){eyeNow();nature.setPitch?.(g.stage().farZ??targetPoint().z);nature.update(dt,eye);}
      else if(kind==='immersive-vr'){const p=g.paper();if(p!==paper){paper=p;floor.material.color.set(p);scene.background=new T.Color(p);}}
      if(placedFor!==g.mode())place();
      updateMenu(dt);
      // AR placement: aim at a surface and the court follows; the trigger pins it.
      if(placing){
        const P=aimAtSurface(frame);
        if(P){
          const {pos}=headLocal(),dx=P.x-pos.x,dz=P.z-pos.z;
          anchor={P,theta:Math.hypot(dx,dz)>.05?Math.atan2(dx,-dz):anchor?.theta||0};place();
          reticle.position.copy(P);reticle.visible=true;
        }
      }else reticle.visible=false;
      if(kind==='immersive-ar')showPlanes(frame);
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
          // Y (left) opens and closes the menu. Summit: A or X jumps, B throws. Elsewhere A, B or X calls Dahrooj back.
          if(h===leftHand()&&edge[1]){menuToggled=!menuToggled;}
          else if(climbOn){if(edge[0])climb3.jump();if(edge[1])climb3.throwBall();}
          else if(edge.some(Boolean))recall();
        }
        if(climbOn&&axes&&axes.length>3){
          if(h===leftHand()||!leftHand())stickX=Math.abs(axes[2])>.25?axes[2]:stickX;
          // The right stick up and down resizes the mountain.
          if(h!==leftHand()&&Math.abs(axes[3])>.4){climbUnit=clamp(climbUnit*Math.exp(-axes[3]*dt*.9),.012,.06);climb3.setUnit(climbUnit);hud.key='';}
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
        stepRests(dt*timeK());
        if(!S.held)markBall(S.pos,S.vel);
        for(const b of g.volley())markBall(b.pos,b.vel);
        // Motri's props: Dahrooj bounces off poles and benches, shoves lanterns and sets off crates.
        if(natureOn()&&nature.props){
          const P=nature.props;
          if(S.shot&&!S.held&&P.collide(S.pos,S.vel,BR))g.bump(Math.min(1,Math.hypot(S.vel.x,S.vel.z)/12));
          for(const b of g.volley())P.collide(b.pos,b.vel,BR);
          for(const r of rests)P.collide(r.p,r.v,BR);
        }
      }
      // Dahrooj, the Duel opponent and small balls.
      const d=S.d,shown=(!st.playerVisible||st.playerVisible())&&!((placing||intro||climbOn||!(parked||holder||S.shot))&&!st.networked),actors=st.xrActors?st.xrActors():[];
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
      get placing(){return placing;},get rests(){return rests;},get nature(){return nature;},get climbing(){return climbOn;},get climb(){return climb3;},get opening(){return !!intro;},get popped(){return intro?intro.popped:0;},get parked(){return parked;},get menuOpen(){return menuOpen;},get throwStyle(){return throwStyle;},
      // For tests: what each hand reports.
      inspect:()=>hands.map(h=>({connected:!!h.source,hand:h.source?.handedness,samples:h.hist.length,velocity:velocity(h).toArray()}))};
  };
})();
