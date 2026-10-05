/* Dahrooj on Meta Quest: WebXR VR and AR for the 3D modes. Aboden Games.
   VR is life size (the courts are built in metres). AR shrinks the world to a fifth so it fits a room.
   Press the trigger (or pinch) to take Dahrooj into your hand, swing and let go to throw. */
(() => {
  'use strict';
  const AR_SCALE=5, MAX_SPEED=22, SPAN=.04, MIN_THROW=2;
  const GAIN={'immersive-vr':1.9,'immersive-ar':.7};
  const MODES=[['goal','مرمى'],['hoop','سلة'],['window','شباك'],['padel','بادل'],['cans','علب'],['opponent','مبارزة']];
  const STYLES=[['jelly','جيلي'],['fabric','قماش'],['clay','صلصال'],['fur','فرو'],['bubble','فقاعة']];
  const LABEL=Object.fromEntries(MODES);
  const INK='#2c2d3d',PAPER='#fffaf2';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  window.createDahroojXR=g=>{
    const {T,renderer,scene,camera,S,BR,V}=g;
    let session=null,kind=null,lastTime=0,holder=null,holdT=0,clock=0,paper='';
    const rig=new T.Group();rig.name='xr-rig';
    const ray=new T.Raycaster(),wp=V(0,0,0),wq=new T.Quaternion(),fwd=V(0,0,0);
    const scaleNow=()=>rig.scale.x;

    // A paper floor for VR; AR shows the room through passthrough instead.
    const floor=new T.Mesh(new T.CircleGeometry(40,64),new T.MeshBasicMaterial({color:0xddd2c1}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.004;floor.visible=false;scene.add(floor);

    /* ---------- sprites: the same artwork as the 2D game, always facing the eyes ---------- */
    const textures=new Map();
    function texture(style,face,blink){
      const key=style+'/'+face+'/'+(blink?1:0);
      if(!textures.has(key)){const t=new T.CanvasTexture(g.sprite(style,face,blink));t.anisotropy=4;textures.set(key,t);}
      return textures.get(key);
    }
    function makeSprite(){const s=new T.Sprite(new T.SpriteMaterial({transparent:true,depthWrite:false}));s.visible=false;s.renderOrder=2;scene.add(s);return s;}
    const ballSprite=makeSprite(),actorSprites=[];
    // Real 3D Dahrooj models (sprites remain as a fallback).
    const models=window.createDahrooj3D?window.createDahrooj3D(T,{radius:BR,drawFace:g.drawFace}):null;
    let ballModel=null;const actorModels=[];
    const eye=V(0,0,0);
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
      const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,transparent:true}));
      mesh.renderOrder=3;return {canvas,ctx:canvas.getContext('2d'),tex,mesh,key:''};
    }
    function round(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
    const font=(w,s)=>`${w} ${s}px "Baloo Bhaijaan 2","Grandstander",Tahoma,sans-serif`;

    // Score and messages, above the court.
    const hud=panel(1.1,.32,1024,300);hud.mesh.position.set(0,1.95,-2.4);rig.add(hud.mesh);
    function drawHud(){
      const t=g.texts(),name=LABEL[g.mode()]||'',turn=t.turn==='Your turn'?'دورك':t.turn?'دور الخصم':'';
      const key=[t.title,t.count,turn,t.toast,name].join('|');if(key===hud.key)return;hud.key=key;
      const c=hud.ctx;c.clearRect(0,0,1024,300);c.textAlign='center';c.direction='rtl';
      c.fillStyle='rgba(255,252,246,.82)';round(c,212,8,600,190,40);c.fill();
      c.fillStyle=INK;c.font=font(800,92);c.fillText(t.title||t.count||'0',512,118);
      c.font=font(700,40);c.fillStyle='rgba(44,45,61,.7)';c.fillText(turn||name,512,172);
      if(t.toast){c.font=font(700,40);const w=Math.min(980,c.measureText(t.toast).width+70);c.fillStyle=INK;round(c,512-w/2,214,w,72,36);c.fill();c.fillStyle=PAPER;c.fillText(t.toast,512,264);}
      hud.tex.needsUpdate=true;
    }

    // Menu at the left hand: modes, styles, exit. Pick with the controller ray or a pinch.
    const menu=panel(.62,.36,1024,594);
    menu.mesh.position.set(-.48,.98,-.4);menu.mesh.rotation.set(-.55,Math.PI/4,0,'YXZ');rig.add(menu.mesh);
    const buttons=[];
    MODES.forEach(([id,label],i)=>buttons.push({kind:'mode',id,label,x:24+i*164,y:90,w:152,h:120}));
    STYLES.forEach(([id,label],i)=>buttons.push({kind:'style',id,label,x:24+i*197,y:290,w:185,h:110}));
    buttons.push({kind:'exit',id:'exit',label:'خروج',x:24,y:466,w:300,h:104});
    buttons.push({kind:'recenter',id:'recenter',label:'توسيط',x:700,y:466,w:300,h:104});
    function drawMenu(hover){
      const key=g.mode()+'|'+g.style()+'|'+hover.join(',');if(key===menu.key)return;menu.key=key;
      const c=menu.ctx;c.clearRect(0,0,1024,594);
      c.fillStyle='rgba(255,252,246,.9)';round(c,4,4,1016,586,46);c.fill();
      c.strokeStyle='rgba(44,45,61,.18)';c.lineWidth=4;c.stroke();
      c.textAlign='center';c.direction='rtl';c.fillStyle='rgba(44,45,61,.55)';c.font=font(700,34);
      c.fillText('النمط',512,68);c.fillText('الستايل',512,268);
      buttons.forEach((b,i)=>{
        const on=(b.kind==='mode'&&b.id===g.mode())||(b.kind==='style'&&b.id===g.style()),hot=hover.includes(i);
        c.fillStyle=on?INK:hot?'rgba(44,45,61,.12)':'rgba(44,45,61,.05)';round(c,b.x,b.y,b.w,b.h,b.h/2);c.fill();
        c.fillStyle=on?PAPER:INK;c.font=font(800,b.kind==='mode'?40:38);c.fillText(b.label,b.x+b.w/2,b.y+b.h/2+14);
      });
      menu.tex.needsUpdate=true;
    }
    function menuHit(uv){
      const x=uv.x*1024,y=(1-uv.y)*594;
      return buttons.findIndex(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
    }
    function menuAction(i){
      const b=buttons[i];if(!b)return;
      drop();
      if(b.kind==='mode')g.setMode(b.id);
      else if(b.kind==='style')g.setStyle(b.id);
      else if(b.kind==='exit')session?.end();
      else if(b.kind==='recenter')place();
    }

    /* ---------- controllers and hands ---------- */
    const racketGeo=new T.CylinderGeometry(.13,.13,.025,28),racketMat=new T.MeshStandardMaterial({color:0x2c2d3d,roughness:.6});
    const hands=[0,1].map(i=>{
      const target=renderer.xr.getController(i),grip=renderer.xr.getControllerGrip(i);
      rig.add(target,grip);
      const h={i,target,grip,source:null,hist:[],charging:false,hover:-1,lastSwing:0,lastMove:0};
      h.line=new T.Line(new T.BufferGeometry().setFromPoints([V(0,0,0),V(0,0,-1)]),new T.LineBasicMaterial({color:0x2c2d3d,transparent:true,opacity:.5}));
      target.add(h.line);
      h.dot=new T.Mesh(new T.SphereGeometry(.02,14,10),new T.MeshStandardMaterial({color:0xfffaf2,roughness:.5}));grip.add(h.dot);
      h.racket=new T.Group();
      const face=new T.Mesh(racketGeo,racketMat);face.rotation.x=Math.PI/2;face.position.set(0,0,-.2);
      const handle=new T.Mesh(new T.CylinderGeometry(.015,.015,.14,10),racketMat);handle.rotation.x=Math.PI/2;handle.position.set(0,0,-.05);
      h.racket.add(face,handle);h.racket.visible=false;grip.add(h.racket);
      target.addEventListener('connected',e=>{h.source=e.data;});
      target.addEventListener('disconnected',()=>{release(h,true);h.source=null;});
      target.addEventListener('selectstart',()=>press(h));
      target.addEventListener('selectend',()=>release(h));
      target.addEventListener('squeezestart',()=>press(h));
      target.addEventListener('squeezeend',()=>release(h));
      return h;
    });
    function rayOf(h){
      h.target.getWorldPosition(wp);h.target.getWorldQuaternion(wq);
      return {origin:wp.clone(),dir:V(0,0,-1).applyQuaternion(wq).normalize()};
    }
    // Throw velocity: the fastest ~40 ms stretch of the last 200 ms, in world units. Players often
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
    function drop(){if(holder){holder=null;S.held=false;g.respawn();}}
    function press(h){
      if(!session)return;
      if(h.hover>=0){menuAction(h.hover);return;}
      const st=g.stage();
      if(st.shot)return; // padel: the controller is the racket; swing to hit
      if(st.networked){
        if(st.xrAim&&st.xrAim()){h.charging=true;return;}
        if(st.xrDistract){const r=rayOf(h);st.xrDistract(r.origin,r.dir);}
        return;
      }
      if(!holder&&g.canHold()){holder=h;holdT=0;S.held=true;S.vel.set(0,0,0);S.shot=false;}
    }
    function release(h,lost){
      const v=velocity(h).multiplyScalar(GAIN[kind]||1.9);
      if(v.length()>MAX_SPEED)v.setLength(MAX_SPEED);
      if(holder===h){
        holder=null;
        if(!lost&&v.length()>=MIN_THROW)g.throwWith(v);else{S.held=false;g.respawn();}
      }
      if(h.charging){
        h.charging=false;const st=g.stage();
        if(!lost&&v.length()>=MIN_THROW&&st.xrAim&&st.xrAim())duelShot(st,v);
      }
    }
    // Duel is server-authoritative: turn the hand's velocity into a shot the server accepts.
    function duelShot(st,v){
      const p=S.pos,z=st.aimZ;
      let t=v.z<-.5?(z-p.z)/v.z:1.6;t=clamp(t,.8,1.6);
      const target=[clamp(p.x+v.x*t,-9,9),clamp(p.y+v.y*t-.5*g.GRAV*t*t,.35,6),z];
      if(st.submitShot&&st.submitShot({target,flight:t,curve:0}))g.whoosh(Math.min(1,v.length()/18));
    }

    /* ---------- session ---------- */
    function place(){
      // Stand just behind the ball, facing the court. AR shrinks the world around you.
      const s=kind==='immersive-ar'?AR_SCALE:1;
      rig.scale.setScalar(s);rig.position.set(0,0,kind==='immersive-ar'?1.6:1.05);rig.rotation.set(0,0,0);
    }
    async function enter(mode){
      if(session||!navigator.xr)return;
      const options=mode==='immersive-ar'
        ?{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking']}
        :{optionalFeatures:['local-floor','bounded-floor','hand-tracking']};
      const s=await navigator.xr.requestSession(mode,options);
      session=s;kind=mode;
      renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');
      scene.add(rig);rig.add(camera);place();
      floor.visible=mode==='immersive-vr';
      s.addEventListener('end',onEnd);
      await renderer.xr.setSession(s);
      lastTime=0;renderer.setAnimationLoop(loop);
      g.respawn();
    }
    function onEnd(){
      renderer.setAnimationLoop(null);
      drop();session=null;kind=null;
      rig.remove(camera);scene.remove(rig);
      scene.background=null;floor.visible=false;ballSprite.visible=false;
      for(const a of actorSprites)a.visible=false;
      if(ballModel)ballModel.group.visible=false;for(const m of actorModels)if(m)m.group.visible=false;
      renderer.xr.enabled=false;
      g.resize();
    }

    /* ---------- per frame ---------- */
    function loop(time){
      const dt=lastTime?clamp((time-lastTime)/1000,0,.05):1/72;lastTime=time;clock+=dt;
      const st=g.stage(),racket=!!st.shot;
      if(kind==='immersive-vr'){const p=g.paper();if(p!==paper){paper=p;floor.material.color.set(p);scene.background=new T.Color(p);}}
      // Menu hover and pointer lines.
      const hover=[];
      for(const h of hands){
        h.grip.getWorldPosition(wp);h.hist.push({p:wp.clone(),t:clock});
        while(h.hist.length&&clock-h.hist[0].t>.25)h.hist.shift();
        const r=rayOf(h);ray.set(r.origin,r.dir);
        const hit=ray.intersectObject(menu.mesh,false)[0];
        h.hover=hit?menuHit(hit.uv):-1;if(h.hover>=0)hover.push(h.hover);
        h.line.scale.z=(hit?hit.distance:.6*scaleNow())/scaleNow();
        h.line.visible=!!h.source&&holder!==h;
        h.racket.visible=racket&&!!h.source;h.dot.visible=!!h.source&&!racket&&holder!==h;
        // Padel: a fast forward swing hits when the ball is in reach.
        if(racket&&h.source&&clock-h.lastSwing>.45){
          const v=velocity(h).divideScalar(scaleNow()),forward=-v.z;
          if(forward>1.8&&forward>Math.abs(v.y)){
            h.lastSwing=clock;
            st.shot({dx:v.x*120,dy:-forward*120,len:Math.hypot(v.x,forward)*120,sp:Math.hypot(v.x,forward)*450});
          }
        }
        // Duel: either thumbstick moves Dahrooj sideways.
        const axes=h.source?.gamepad?.axes;
        if(st.xrMove&&axes&&axes.length>2&&Math.abs(axes[2])>.35&&clock-h.lastMove>.1){h.lastMove=clock;st.xrMove(axes[2]);}
      }
      drawMenu(hover);drawHud();
      // The held ball rides in front of the hand, easing in from where it was.
      if(holder){
        holdT+=dt;holder.grip.getWorldPosition(wp);holder.grip.getWorldQuaternion(wq);
        fwd.set(0,0,-1).applyQuaternion(wq);
        const target=wp.addScaledVector(fwd,BR*1.05);
        S.pos.lerp(target,holdT<.15?.35:1);S.vel.set(0,0,0);S.grounded=false;
      }
      g.step(dt);
      // Dahrooj, the Duel opponent and small balls: 3D models facing you (sprites as a fallback).
      const d=S.d,shown=!st.playerVisible||st.playerVisible(),actors=st.xrActors?st.xrActors():[];
      if(models){
        camera.getWorldPosition(eye);
        ballModel=model(ballModel,g.style(),true);
        ballModel.update({pos:S.pos,toward:eye,faceName:g.ballFace(),blink:S.blink>0,squash:[1+d*.75,1-d]});
        ballModel.group.visible=shown;
        actors.forEach((a,i)=>{
          const m=actorModels[i]=model(actorModels[i],a.style,a.face!=='none'),k=a.r/BR;
          m.update({pos:a.pos,toward:eye,faceName:a.face,blink:a.blink,squash:[k,k]});
        });
        for(let i=actors.length;i<actorModels.length;i++)if(actorModels[i])actorModels[i].group.visible=false;
      }else{
        showSprite(ballSprite,S.pos,BR,g.style(),g.ballFace(),S.blink>0,1+d*.75,1-d);ballSprite.visible=shown;
        while(actorSprites.length<actors.length)actorSprites.push(makeSprite());
        actorSprites.forEach((s,i)=>{const a=actors[i];if(a)showSprite(s,a.pos,a.r,a.style,a.face,a.blink);else s.visible=false;});
      }
      g.render();
    }

    return {enter,get presenting(){return !!session;},get kind(){return kind;},get holding(){return !!holder;},
      // For tests: what each hand reports.
      inspect:()=>hands.map(h=>({connected:!!h.source,hand:h.source?.handedness,samples:h.hist.length,velocity:velocity(h).toArray()}))};
  };
})();
