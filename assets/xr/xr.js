/* Dahrooj on Meta Quest: WebXR VR and AR for the 3D modes and Duel. Aboden Games.
   The courts are built in game metres; the headset shows them smaller (VR at a half, AR as a model on a
   surface you pick) and speeds time up to match, so falls look like real gravity.
   Dahrooj waits by your hand: grab with the trigger (or a pinch), swing and let go, or pull him back in
   the slingshot. Flip or raise the left hand for the menu. */
(() => {
  'use strict';
  const VR_SCALE=2, AR_SCALE=8, AR_MIN=3, AR_MAX=24, REAL_G=9.8;
  // Throw speed per metre per second of hand speed, slingshot speed per metre of pull, and limits (m/s, m).
  const GAIN=1.5, SLING_K=17, SLING_MIN=.06, SLING_MAX=.65, MIN_THROW=1, MAX_SPEED=34, SPAN=.04;
  // Duel runs on the server in game time: its shots use game speed per real metre per second.
  const DUEL_GAIN=2;
  const MODES=[['goal','مرمى'],['hoop','سلة'],['window','شباك'],['cans','علب'],['opponent','مبارزة']];
  const STYLES=[['jelly','جيلي'],['fabric','قماش'],['clay','صلصال'],['fur','فرو'],['bubble','فقاعة']];
  const XR_MODES=new Set(MODES.map(m=>m[0]));
  const LABEL=Object.fromEntries(MODES);
  const INK='#2c2d3d',PAPER='#fffaf2';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  window.createDahroojXR=g=>{
    const {T,renderer,scene,camera,S,BR,V}=g;
    let session=null,kind=null,lastTime=0,holder=null,holdT=0,clock=0,paper='',arScale=AR_SCALE;
    let throwStyle='hand',parked=false,placing=false,anchor=null,placedFor='',menuOpen=false,intro=null;
    const rig=new T.Group();rig.name='xr-rig';
    const ray=new T.Raycaster(),wp=V(0,0,0),wq=new T.Quaternion(),fwd=V(0,0,0),eye=V(0,0,0),UP=V(0,1,0);
    const scaleNow=()=>rig.scale.x;
    // Game seconds per real second, so a ball falls at 9.8 m/s² in the room. Duel keeps the server's clock.
    const timeK=()=>g.stage().networked?1:Math.sqrt(REAL_G*scaleNow()/g.GRAV);
    // Where the eyes are and which way they look, in room metres.
    function headLocal(){
      camera.getWorldPosition(eye);camera.getWorldDirection(fwd);
      const a=rig.worldToLocal(eye.clone()),dir=rig.worldToLocal(eye.clone().add(fwd)).sub(a);
      dir.y=0;if(dir.lengthSq()<1e-6)dir.set(0,0,-1);dir.normalize();
      return {pos:a,dir};
    }

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
    let ballModel=null;const actorModels=[];
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
      const key=placing?'placing':[t.title,t.count,turn,t.toast,name].join('|');if(key===hud.key)return;hud.key=key;
      const c=hud.ctx;c.clearRect(0,0,1024,300);c.textAlign='center';c.direction='rtl';
      if(placing){
        c.fillStyle='rgba(255,252,246,.88)';round(c,62,30,900,230,46);c.fill();c.fillStyle=INK;
        c.font=font(800,52);c.fillText('وجّه على سطح واضغط الزناد للتثبيت',512,125);
        c.font=font(700,40);c.fillStyle='rgba(44,45,61,.7)';c.fillText('العصا للأعلى والأسفل تكبّر وتصغّر',512,200);
      }else{
        c.fillStyle='rgba(255,252,246,.82)';round(c,212,8,600,190,40);c.fill();
        c.fillStyle=INK;c.font=font(800,92);c.fillText(t.title||t.count||'0',512,118);
        c.font=font(700,40);c.fillStyle='rgba(44,45,61,.7)';c.fillText(turn||name,512,172);
        if(t.toast){c.font=font(700,40);const w=Math.min(980,c.measureText(t.toast).width+70);c.fillStyle=INK;round(c,512-w/2,214,w,72,36);c.fill();c.fillStyle=PAPER;c.fillText(t.toast,512,264);}
      }
      hud.tex.needsUpdate=true;
    }

    // The menu rides on the left hand: flip it palm-up or raise it. Point with the right hand to pick.
    const MENU_W=.46,MENU_H=MENU_W*720/1024;
    const menu=panel(MENU_W,MENU_H,1024,720);rig.add(menu.mesh);menu.mesh.visible=false;menu.mesh.scale.setScalar(.01);menu.mesh.name='xr-menu';
    const buttons=[];
    MODES.forEach(([id,label],i)=>buttons.push({kind:'mode',id,label,x:24+i*197,y:80,w:185,h:112}));
    STYLES.forEach(([id,label],i)=>buttons.push({kind:'style',id,label,x:24+i*197,y:272,w:185,h:112}));
    buttons.push({kind:'throw',id:'hand',label:'يد',x:24,y:472,w:232,h:104});
    buttons.push({kind:'throw',id:'sling',label:'نبيطة',x:268,y:472,w:232,h:104});
    buttons.push({kind:'place',id:'place',label:'',x:524,y:472,w:232,h:104});
    buttons.push({kind:'exit',id:'exit',label:'خروج',x:768,y:472,w:232,h:104});
    function drawMenu(hover){
      const key=[g.mode(),g.style(),throwStyle,kind,hover.join(',')].join('|');if(key===menu.key)return;menu.key=key;
      const c=menu.ctx;c.clearRect(0,0,1024,720);
      c.fillStyle='rgba(255,252,246,.94)';round(c,4,4,1016,712,46);c.fill();
      c.strokeStyle='rgba(44,45,61,.18)';c.lineWidth=4;c.stroke();
      c.textAlign='center';c.direction='rtl';c.fillStyle='rgba(44,45,61,.55)';c.font=font(700,34);
      c.fillText('النمط',512,62);c.fillText('الستايل',512,254);c.fillText('الرمي',262,454);
      c.font=font(600,30);c.fillText('زر A أو X يرجّع دحروج فورًا · الزناد أثناء الطيران يرجّعه ليدك',512,650);
      buttons.forEach((b,i)=>{
        const label=b.kind==='place'?(kind==='immersive-ar'?'ثبّت من جديد':'توسيط'):b.label;
        const on=(b.kind==='mode'&&b.id===g.mode())||(b.kind==='style'&&b.id===g.style())||(b.kind==='throw'&&b.id===throwStyle),hot=hover.includes(i);
        c.fillStyle=on?INK:hot?'rgba(44,45,61,.14)':'rgba(44,45,61,.05)';round(c,b.x,b.y,b.w,b.h,b.h/2);c.fill();
        c.fillStyle=on?PAPER:INK;c.font=font(800,label.length>8?32:40);c.fillText(label,b.x+b.w/2,b.y+b.h/2+14);
      });
      menu.tex.needsUpdate=true;
    }
    function menuHit(uv){
      const x=uv.x*1024,y=(1-uv.y)*720;
      return buttons.findIndex(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
    }
    function menuAction(i){
      const b=buttons[i];if(!b)return;
      if(b.kind==='mode'){holder=null;g.setMode(b.id);}
      else if(b.kind==='style')g.setStyle(b.id);
      else if(b.kind==='throw'){holder=null;throwStyle=b.id;}
      else if(b.kind==='exit')session?.end();
      else if(b.kind==='place'){if(kind==='immersive-ar'){holder=null;placing=true;}else place();}
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
      const key='start|'+hot;if(start.key===key)return;start.key=key;
      const c=start.ctx;c.clearRect(0,0,1024,512);c.textAlign='center';c.direction='rtl';
      c.fillStyle='rgba(255,252,246,.94)';round(c,6,6,1012,500,70);c.fill();
      c.fillStyle=INK;c.font=font(800,120);c.fillText('دحروج',512,170);
      c.fillStyle=hot?'#44465a':INK;round(c,212,250,600,170,85);c.fill();
      c.fillStyle=PAPER;c.font=font(800,66);c.fillText('بدء اللعبة',540,358);
      c.beginPath();c.moveTo(300,300);c.lineTo(300,370);c.lineTo(352,335);c.closePath();c.fill();
      start.tex.needsUpdate=true;
    }
    function beginIntro(){
      const {pos,dir}=headLocal(),yaw=Math.atan2(dir.x,-dir.z);
      intro={t:0,balls:[],ready:false,leaving:0};
      for(let i=0;i<14;i++){
        const a=yaw+(Math.random()-.5)*2.6,dist=.6+Math.random()*1.3,style=INTRO_STYLES[i%5];
        const m=models?models.make(style):null;if(m)introGroup.add(m.group);
        intro.balls.push({m,p:V(pos.x+Math.sin(a)*dist,pos.y+.9+Math.random()*.9,pos.z-Math.cos(a)*dist),v:V((Math.random()-.5)*.6,0,(Math.random()-.5)*.6),
          delay:i*.16,d:0,dv:0,hit:0,blink:0,next:1+Math.random()*3});
      }
    }
    function endIntro(){
      if(!intro||intro.leaving)return;
      intro.leaving=.001;start.mesh.visible=false;
      placing=kind==='immersive-ar';g.respawn();
    }
    // Simple room physics in metres: gravity, the floor, and the balls pushing each other.
    function stepIntro(dt){
      const I=intro;I.t+=dt;
      if(I.leaving){
        I.leaving+=dt;const k=Math.max(0,1-I.leaving/.35);introGroup.scale.setScalar(INTRO_R/BR*Math.max(.001,k));
        if(k<=0){for(const b of I.balls)if(b.m)introGroup.remove(b.m.group);intro=null;introGroup.scale.setScalar(INTRO_R/BR);}
        return;
      }
      const live=I.balls.filter(b=>I.t>=b.delay);
      for(const b of live){
        b.v.y-=REAL_G*dt;b.v.multiplyScalar(Math.pow(.8,dt));b.p.addScaledVector(b.v,dt);
        if(b.p.y<INTRO_R){
          const sp=-b.v.y;b.p.y=INTRO_R;
          if(sp>.6){b.v.y=sp*.55;b.v.x*=.85;b.v.z*=.85;b.dv-=sp*2.2;b.hit=.25;if(g.bump)g.bump(Math.min(1,sp/6)*.6);}
          else{b.v.y=0;b.v.x*=Math.pow(.2,dt);b.v.z*=Math.pow(.2,dt);}
        }
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
      if(!I.ready&&I.t>3.2){
        I.ready=true;const {pos,dir}=headLocal();
        start.mesh.position.set(pos.x+dir.x*1.05,pos.y-.12,pos.z+dir.z*1.05);start.mesh.visible=true;
      }
      if(I.ready){camera.getWorldPosition(eye);start.mesh.lookAt(eye);}
    }
    function drawIntro(){
      if(!intro)return;
      camera.getWorldPosition(eye);
      for(const b of intro.balls){
        if(!b.m)continue;
        b.m.group.visible=intro.t>=b.delay;
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
      const u=velocity(h).multiplyScalar(GAIN/s);
      return u.length()<MIN_THROW?null:u;
    }
    // Real speed to game speed: the world is s times smaller and its time runs timeK times faster.
    const toGame=u=>{const v=u.clone().multiplyScalar(scaleNow()/timeK());if(v.length()>MAX_SPEED)v.setLength(MAX_SPEED);return v;};

    function press(h){
      if(!session)return;
      if(h.hover>=0){menuAction(h.hover);return;}
      if(intro){if(h.onStart)endIntro();return;}
      if(menuOpen&&h===leftHand())return;
      if(placing){if(anchor){placing=false;g.respawn();}return;}
      const st=g.stage();
      if(st.networked){
        if(st.xrAim&&st.xrAim()){h.charging=true;return;}
        if(st.xrDistract){const r=rayOf(h);st.xrDistract(r.origin,r.dir);}
        return;
      }
      if(h===forkHand())return; // this hand holds the slingshot
      if(S.shot)g.recall(); // the trigger mid-flight calls Dahrooj straight back
      if(!holder&&g.canHold()){holder=h;holdT=0;parked=false;S.held=true;S.vel.set(0,0,0);S.shot=false;}
    }
    function release(h,lost){
      if(holder===h){
        holder=null;
        const u=lost?null:launch(h,S.pos);
        if(u)g.throwWith(toGame(u));else parked=true;
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
      if(S.shot){holder=null;g.recall();}
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

    /* ---------- session ---------- */
    async function enter(mode,{opening=false}={}){
      if(session||!navigator.xr)return;
      if(!XR_MODES.has(g.mode()))g.setMode('goal');
      const options=mode==='immersive-ar'
        ?{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking','hit-test','plane-detection']}
        :{optionalFeatures:['local-floor','bounded-floor','hand-tracking']};
      const s=await navigator.xr.requestSession(mode,options);
      session=s;kind=mode;anchor=null;placing=mode==='immersive-ar';
      renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');
      scene.add(rig);rig.add(camera);place();
      floor.visible=mode==='immersive-vr';
      s.addEventListener('end',onEnd);
      await renderer.xr.setSession(s);
      lastTime=0;renderer.setAnimationLoop(loop);
      g.respawn();
      if(opening){placing=false;beginIntro();}
    }
    function onEnd(){
      renderer.setAnimationLoop(null);
      for(const s of hitSources.values())s.cancel?.();hitSources.clear();
      if(intro){for(const b of intro.balls)if(b.m)introGroup.remove(b.m.group);intro=null;}start.mesh.visible=false;
      holder=null;parked=false;placing=false;S.held=false;g.respawn();
      session=null;kind=null;
      rig.remove(camera);scene.remove(rig);
      scene.background=null;floor.visible=false;ballSprite.visible=false;
      for(const a of actorSprites)a.visible=false;for(const d of dots)d.visible=false;
      if(ballModel)ballModel.group.visible=false;for(const m of actorModels)if(m)m.group.visible=false;
      renderer.xr.enabled=false;
      g.resize();g.onExit?.();
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
        L.grip.getWorldQuaternion(wq);const up=V(0,1,0).applyQuaternion(wq).y,y=L.grip.position.y,hy=headLocal().pos.y;
        // Flipped palm-up or raised to the face; a little slack to close so it doesn't flicker.
        want=menuOpen?(up<.15||y>hy-.25):(up<-.3||y>hy-.15);
        if(want){menu.mesh.position.copy(L.grip.position).add(V(0,.2,0));camera.getWorldPosition(eye);menu.mesh.lookAt(eye);}
      }
      menuOpen=want;
      const k=clamp(menu.mesh.scale.x+(want?1:-1)*dt*7,.01,1);menu.mesh.scale.setScalar(k);menu.mesh.visible=k>.02;
    }
    function loop(time,frame){
      const dt=lastTime?clamp((time-lastTime)/1000,0,.05):1/72;lastTime=time;clock+=dt;
      const st=g.stage();
      if(kind==='immersive-vr'){const p=g.paper();if(p!==paper){paper=p;floor.material.color.set(p);scene.background=new T.Color(p);}}
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
      const hover=[],F=forkHand();let startHot=false;
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
        if(pad){const now=[4,5].map(i=>!!pad.buttons[i]?.pressed);if(now.some((b,i)=>b&&!h.buttons[i]))recall();h.buttons=now;}
        // Duel: either thumbstick moves Dahrooj sideways.
        if(st.xrMove&&axes&&axes.length>2&&Math.abs(axes[2])>.35&&clock-h.lastMove>.1){h.lastMove=clock;st.xrMove(axes[2]);}
        // AR: thumbstick up makes the court bigger, down makes it smaller. The pinned spot stays.
        if(kind==='immersive-ar'&&axes&&axes.length>3&&Math.abs(axes[3])>.4&&!holder){
          arScale=clamp(arScale*Math.exp(axes[3]*dt*.9),AR_MIN,AR_MAX);place();
        }
      }
      fork.visible=!!F?.source;if(F?.source&&fork.parent!==F.grip)F.grip.add(fork);
      drawMenu(hover);drawHud();if(start.mesh.visible)drawStart(startHot);
      if(intro){stepIntro(dt);drawIntro();}
      hud.mesh.visible=!intro;
      camera.getWorldPosition(eye);hud.mesh.lookAt(eye);
      // Dahrooj waits by your hand (or in the slingshot) between throws.
      if(st.networked){if(parked||(S.held&&!holder)){parked=false;S.held=false;}}
      else if(!S.shot&&!holder&&!placing&&!intro)parked=true;
      if(parked){S.held=true;S.pos.lerp(updateParkSpot(F),1-Math.exp(-dt*10));S.vel.set(0,0,0);S.grounded=false;}
      // The held ball rides in front of the hand (in the pouch with the slingshot), easing in.
      if(holder){
        holdT+=dt;holder.grip.getWorldPosition(wp);holder.grip.getWorldQuaternion(wq);
        fwd.set(0,0,-1).applyQuaternion(wq);
        const target=F?.source?wp:wp.addScaledVector(fwd,BR*1.05);
        S.pos.lerp(target,holdT<.15?.35:1);S.vel.set(0,0,0);S.grounded=false;
      }
      // Slingshot bands follow the pouch: Dahrooj, the pulling hand in Duel, or the rest spot.
      if(F?.source){
        const puller=hands.find(h=>h.charging);
        if(!st.networked&&(holder||parked))wp.copy(S.pos);else if(puller)puller.grip.getWorldPosition(wp);else pouch.getWorldPosition(wp);
        const end=rig.worldToLocal(wp.clone());
        tips.forEach((o,i)=>{o.getWorldPosition(wp);stretch(bands[i],rig.worldToLocal(wp.clone()),end);});
      }else for(const b of bands)b.visible=false;
      // The flight preview while pulling.
      const u=holder&&F?.source?launch(holder,S.pos):null;
      if(u){
        const v=toGame(u),p=S.pos.clone(),step=.05,r=.012*scaleNow();
        for(const d of dots){
          for(let k=0;k<3;k++){v.y-=g.GRAV*step/3;v.multiplyScalar(Math.pow(.9,step/3));p.addScaledVector(v,step/3);}
          d.position.copy(p);d.scale.setScalar(r);d.visible=p.y>0;
        }
      }else for(const d of dots)d.visible=false;
      g.step(dt*timeK());
      // Dahrooj, the Duel opponent and small balls.
      const d=S.d,shown=(!st.playerVisible||st.playerVisible())&&!((placing||intro)&&!st.networked),actors=st.xrActors?st.xrActors():[];
      const face=parked&&!(S.mood&&S.moodT>0)?'open':g.ballFace();
      if(models){
        ballModel=model(ballModel,g.style(),true);
        ballModel.update({pos:S.pos,toward:eye,faceName:face,blink:S.blink>0,squash:[1+d*.75,1-d]});
        ballModel.group.visible=shown;
        actors.forEach((a,i)=>{
          const m=actorModels[i]=model(actorModels[i],a.style,a.face!=='none'),k=a.r/BR;
          m.update({pos:a.pos,toward:eye,faceName:a.face,blink:a.blink,squash:[k,k]});
        });
        for(let i=actors.length;i<actorModels.length;i++)if(actorModels[i])actorModels[i].group.visible=false;
      }else{
        showSprite(ballSprite,S.pos,BR,g.style(),face,S.blink>0,1+d*.75,1-d);ballSprite.visible=shown;
        while(actorSprites.length<actors.length)actorSprites.push(makeSprite());
        actorSprites.forEach((s,i)=>{const a=actors[i];if(a)showSprite(s,a.pos,a.r,a.style,a.face,a.blink);else s.visible=false;});
      }
      g.render();
    }

    return {enter,get presenting(){return !!session;},get kind(){return kind;},get holding(){return !!holder;},
      get placing(){return placing;},get opening(){return !!intro;},get parked(){return parked;},get menuOpen(){return menuOpen;},get throwStyle(){return throwStyle;},
      // For tests: what each hand reports.
      inspect:()=>hands.map(h=>({connected:!!h.source,hand:h.source?.handedness,samples:h.hist.length,velocity:velocity(h).toArray()}))};
  };
})();
