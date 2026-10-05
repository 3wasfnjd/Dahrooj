/* Summit in the headset: the climb as a small model mountain on a table. Aboden Games.
   The same rules as the phone (DahroojClimbCore); this file only builds and moves the 3D pieces.
   Everything is in room metres inside `group`; one ball radius is `unit` metres. */
(() => {
  'use strict';
  const THEMES=['#7f9a5b','#a38b74','#77728a','#e8f1f5'];
  const INK=0x2c2d3d,DEPTH=3,VIEW=22,BELOW=3;

  window.createDahroojClimb3D=(T,{core:C,models,BR,width=16.25,unit=.022})=>{
    const V=(x,y,z)=>new T.Vector3(x,y,z);
    const group=new T.Group();group.name='xr-climb';group.visible=false;
    const scaler=new T.Group();group.add(scaler);        // one ball radius = 1 inside
    const world=new T.Group();scaler.add(world);          // scrolls down as Dahrooj climbs
    scaler.scale.setScalar(unit);
    const std=(color,o={})=>new T.MeshStandardMaterial({color,roughness:.8,...o});
    const ink=std(INK,{roughness:.9}),ice=std(0xd6ecf5,{roughness:.25}),white=std(0xfffaf2),red=std(0xc8584b);
    const themeMats=THEMES.map(c=>std(c));
    const box=new T.BoxGeometry(1,1,1),cone=new T.ConeGeometry(1,1,10),ball=new T.SphereGeometry(1,20,14),cyl=new T.CylinderGeometry(1,1,1,14);
    const mesh=(geo,mat,parent)=>{const m=new T.Mesh(geo,mat);(parent||world).add(m);return m;};
    let state=null,cam=0,parts=[];
    const W=width,X=x=>x-W/2;

    // The plinth the mountain stands on, and a rock wall behind the climb.
    const plinth=mesh(box,std(0x6b625a),scaler);
    // Grey rock, tinted by the section's colour: soft blotches and cracks.
    const rock=(()=>{const c=document.createElement('canvas');c.width=256;c.height=512;const x=c.getContext('2d');
      x.fillStyle='#d8d4cf';x.fillRect(0,0,256,512);let seed=3;const r=()=>(seed=(seed*16807)%2147483647)/2147483647;
      for(let i=0;i<160;i++){const px=r()*256,py=r()*512,s=10+r()*40,g=x.createRadialGradient(px,py,0,px,py,s);
        g.addColorStop(0,r()<.5?'rgba(255,255,255,.35)':'rgba(60,55,50,.22)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(px-s,py-s,s*2,s*2);}
      x.strokeStyle='rgba(50,45,40,.35)';x.lineWidth=2;
      for(let i=0;i<26;i++){let px=r()*256,py=r()*512;x.beginPath();x.moveTo(px,py);for(let k=0;k<5;k++){px+=(r()-.5)*40;py+=r()*30;x.lineTo(px,py);}x.stroke();}
      const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.MirroredRepeatWrapping;return t;})();
    const wall=mesh(new T.PlaneGeometry(1,1),std(0xffffff,{map:rock,side:T.DoubleSide}),scaler);
    wall.scale.set(W+1,VIEW+BELOW,1);wall.position.set(0,(VIEW-BELOW)/2,-DEPTH/2-.6);

    /* ---------- eyes shared by Dahrooj's monsters ---------- */
    const pupil=std(0x23242f,{roughness:.3});
    function eyes(parent,r,spread,y,z){
      const list=[];
      for(const s of [-1,1]){
        const e=new T.Group();e.position.set(s*spread,y,z);parent.add(e);
        const w=new T.Mesh(ball,white);w.scale.setScalar(r);e.add(w);
        const p=new T.Mesh(ball,pupil);p.scale.setScalar(r*.55);p.position.z=r*.6;e.add(p);
        list.push({e,p,r});
      }
      return list;
    }
    function lookAt(list,dx,dy){const l=Math.hypot(dx,dy)||1;for(const {p,r} of list)p.position.set(dx/l*r*.35,dy/l*r*.35,r*.55);}

    /* ---------- the level ---------- */
    let pieces=[];
    function build(){
      for(const p of pieces)world.remove(p.obj);
      pieces=[];
      for(const p of state.platforms){
        const g=new T.Group(),h=p.full?(p.ground?1.4:.9):.72;
        const body=new T.Mesh(box,ink);body.scale.set(1,h,DEPTH);body.position.y=-h/2;g.add(body);
        const top=new T.Mesh(box,p.ice?ice:themeMats[p.theme]);top.scale.set(1,.22,DEPTH+.04);top.position.y=-.09;g.add(top);
        if(p.spikes){
          const n=Math.max(2,Math.round((p.spikes[1]-p.spikes[0])*(p.x1-p.x0)/.4));
          for(let k=0;k<n;k++)for(const z of [-.8,0,.8]){const s=new T.Mesh(cone,ink);s.scale.set(.18/(p.x1-p.x0),.5,.18);s.userData.f=p.spikes[0]+(p.spikes[1]-p.spikes[0])*(k+.5)/n;s.position.set(0,.25,z);g.add(s);}
        }
        if((p.checkpoint!=null&&!p.ground)||p.summit){
          const pole=new T.Mesh(cyl,ink),hgt=p.summit?3.2:2;pole.scale.set(.06,hgt,.06);pole.position.y=hgt/2;
          const flag=new T.Mesh(new T.PlaneGeometry(1.3,.75),std(0xfffaf2,{side:T.DoubleSide}));flag.position.set(.65,hgt-.4,0);
          const f=new T.Group();f.add(pole,flag);f.userData.flag=flag;g.add(f);g.userData.flag=f;
        }
        world.add(g);pieces.push({kind:'plat',p,obj:g,h});
      }
      for(const m of state.monsters){
        const g=new T.Group();world.add(g);let parts={};
        if(m.type==='crawler'){
          const body=new T.Mesh(ball,std(0x7a4f78,{roughness:.5}));body.scale.set(.95,.62,.8);body.position.y=.25;g.add(body);
          for(let k=-2;k<=2;k++){const s=new T.Mesh(cone,ink);s.scale.set(.12,.34,.12);const a=Math.PI*(.5+k*.17);s.position.set(Math.cos(a)*.8,.25+Math.sin(a)*.62,0);s.rotation.z=a-Math.PI/2;g.add(s);}
          const legs=[];for(let k=0;k<4;k++){const l=new T.Mesh(cyl,ink);l.scale.set(.06,.3,.06);l.position.set((k-1.5)*.42,-.15,.35*(k%2?1:-1));g.add(l);legs.push(l);}
          parts={legs,eyes:eyes(g,.2,.22,.42,.7)};
        }else if(m.type==='bat'){
          const body=new T.Mesh(ball,std(0x3f3a55,{roughness:.6}));body.scale.setScalar(.45);g.add(body);
          const wings=[-1,1].map(s=>{const w=new T.Group();w.position.x=s*.3;const sk=new T.Mesh(new T.CircleGeometry(.75,5,0,Math.PI),std(0x3a3450,{side:T.DoubleSide}));sk.rotation.z=s>0?-Math.PI/2:Math.PI/2;sk.position.x=s*.5;sk.scale.y=.6;w.add(sk);g.add(w);return w;});
          for(const s of [-1,1]){const e=new T.Mesh(cone,std(0x2c2838));e.scale.set(.12,.35,.1);e.position.set(s*.22,.48,0);g.add(e);}
          parts={wings,eyes:eyes(g,.12,.16,.08,.38)};
        }else{
          const pot=new T.Mesh(new T.CylinderGeometry(.62,.48,.7,16),std(0xb3673f));pot.position.y=-.25;g.add(pot);
          const stem=new T.Mesh(cyl,std(0x4f7a3a));stem.scale.set(.08,.8,.08);stem.position.y=.45;g.add(stem);
          const head=new T.Group();head.position.y=.95;g.add(head);
          const bulb=new T.Mesh(ball,std(0x6e9f50,{roughness:.5}));bulb.scale.setScalar(.48);head.add(bulb);
          const mouth=new T.Mesh(cone,std(0x5a1f2a));mouth.scale.set(.2,.3,.2);mouth.rotation.z=-Math.PI/2;mouth.position.x=.42;head.add(mouth);
          parts={head,mouth,eyes:eyes(head,.13,.14,.18,.38)};
        }
        pieces.push({kind:'monster',m,obj:g,parts});
      }
      for(const i of state.icicles){const g=new T.Mesh(cone,ice);g.scale.set(.35,1.3,.35);g.rotation.z=Math.PI;world.add(g);pieces.push({kind:'icicle',i,obj:g});}
    }

    /* ---------- Dahrooj, the thrown balls, seeds and sparks ---------- */
    let hero=null,heroStyle='';
    const shotModels=[],seedMeshes=[],sparks=[];
    function heroModel(style){
      if(!models)return null;
      if(!hero||heroStyle!==style){if(hero)world.remove(hero.group);hero=models.make(style);heroStyle=style;world.add(hero.group);}
      return hero;
    }
    function burst(x,y,colors,count,speed){
      for(let i=0;i<count;i++){
        const a=Math.random()*Math.PI*2,b=Math.random()*Math.PI-Math.PI/2,v=speed*(.4+Math.random()*.8);
        const m=mesh(ball,std(colors[i%colors.length]));m.scale.setScalar(.12+Math.random()*.1);
        parts.push({m,p:V(X(x),y,0),v:V(Math.cos(a)*Math.cos(b)*v,Math.sin(b)*v+speed*.3,Math.sin(a)*Math.cos(b)*v),t:0,max:.5+Math.random()*.4});
      }
    }

    const api={
      group,
      get state(){return state;},
      start(){if(!state){state=C.createState(W);build();}C.restart(state);cam=0;group.visible=true;},
      show(on){group.visible=on;if(on&&!state)api.start();if(state)C.setDir(state,0);},
      // Ball radius in metres: the thumbstick makes the model bigger or smaller.
      setUnit(u){unit=u;scaler.scale.setScalar(u);},
      get unit(){return unit;},
      setDir:d=>state&&C.setDir(state,d),
      jump:()=>{if(!state)return;if(state.won&&state.time-state.wonAt>1.2){C.restart(state);return;}C.jump(state);},
      throwBall:()=>state&&C.throwBall(state),
      // Plinth from the floor in VR (no table there), a thin base on a real surface in AR.
      setBase(height){const h=Math.max(.4,height/unit);plinth.scale.set(W+1.4,h,DEPTH+1.4);plinth.position.y=-h/2-.02;},
      update(dt,{style,eye,onEvent}){
        if(!state||!group.visible)return;
        C.step(state,dt);
        for(const e of state.events){
          if(e.type==='pop')burst(e.x,e.y,['#2c2d3d','#fffaf2','#c8584b'],14,9);
          else if(e.type==='stomp'||e.type==='kill')burst(e.x,e.y,['#5b3a59','#fffaf2','#2c2d3d'],10,7);
          else if(e.type==='summit')burst(state.ball.x,state.ball.y+1,['#c8584b','#e2b04a','#7f9a5b','#5b8bb5','#fffaf2'],30,14);
          onEvent(e);
        }
        state.events.length=0;
        const b=state.ball,target=Math.max(0,b.y-6);
        cam+=(target-cam)*(1-Math.exp(-(b.vy<-15?9:5)*dt));
        world.position.y=-cam;
        const lo=cam-BELOW,hi=cam+VIEW,show=y=>y>lo&&y<hi;
        // Back wall takes the colour of the section Dahrooj is in.
        wall.material.color.set(THEMES[Math.min(3,Math.floor(Math.max(0,b.y)/36))]).lerp(new T.Color(0x9a918a),.45);
        rock.offset.y=cam/(VIEW+BELOW);
        const t=state.time;
        for(const pc of pieces){
          if(pc.kind==='plat'){
            const p=pc.p,o=pc.obj;let drop=0,shake=0,vis=show(p.y);
            if(p.crumble){if(p.crumble.state==='shaking')shake=Math.sin(t*70)*.06;if(p.crumble.state==='fallen'){drop=p.crumble.t*p.crumble.t*14;vis=vis&&p.crumble.t<.45;}}
            o.visible=vis;if(!vis)continue;
            const w=p.x1-p.x0;o.position.set(X(p.x0)+w/2+shake,p.y-drop,0);o.scale.x=w;
            for(const c of o.children)if(c.userData.f!=null)c.position.x=c.userData.f-.5;
            if(o.userData.flag){const f=o.userData.flag;f.scale.x=1/w;f.position.x=(p.summit?0:W*.36)/w;
              f.userData.flag.material.color.set(p.summit?(state.won?0xc8584b:0xfffaf2):state.checkpoint>=p.checkpoint?0xc8584b:0xfffaf2);}
          }else if(pc.kind==='monster'){
            const m=pc.m,o=pc.obj,y=m.type==='crawler'?m.plat.y+.6:m.type==='spitter'?m.plat.y+.75:m.y;
            const fade=m.alive?1:Math.max(0,1-m.t/.6);o.visible=fade>0&&show(y);if(!o.visible)continue;
            o.position.set(X(m.x),y,.2);o.scale.setScalar(m.alive?1:fade);
            const dx=b.x-m.x,dy=b.y-y;lookAt(pc.parts.eyes,dx,dy);
            if(m.type==='crawler'){o.rotation.y=m.dir>0?.5:-.5;pc.parts.legs.forEach((l,k)=>l.rotation.z=Math.sin(m.t*16+k*1.6)*.5);}
            else if(m.type==='bat')pc.parts.wings.forEach((w,k)=>w.rotation.z=(k?-1:1)*Math.sin(m.t*16)*.8);
            else{const dir=dx>=0?1:-1;pc.parts.head.rotation.y=dir>0?0:Math.PI;pc.parts.head.scale.setScalar(1+m.swell*.16);pc.parts.mouth.scale.y=.3+m.swell*.4;}
          }else{
            const i=pc.i;pc.obj.visible=i.state!=='gone'&&show(i.y);
            pc.obj.position.set(X(i.x)+(i.state==='shake'?Math.sin(t*60)*.06:0),i.y-.65,0);
          }
        }
        // Dahrooj.
        const h=heroModel(style);
        if(h){
          const blinkOut=b.inv>0&&Math.floor(b.inv*12)%2;
          h.group.visible=!b.dead&&!blinkOut;
          let face='open';
          if(state.won)face='joy';else if(b.inv>1)face='closed';else if(!b.grounded&&b.vy<-22)face='wide';else if(!b.grounded)face='focus';
          const local=world.worldToLocal(eye.clone());
          h.update({pos:V(X(b.x),b.y-(b.d>0?b.d:0),.3),toward:world.localToWorld(local),faceName:face,squash:[1+b.d*.75,1-b.d],
            look:[Math.max(-1,Math.min(1,b.vx/10))*.8,0]});
          h.group.scale.multiplyScalar(1/BR);
        }
        // Thrown balls (eyeless, in Dahrooj's style).
        state.shots.forEach((s,k)=>{
          let m=shotModels[k];
          if(models&&(!m||m.style!==style)){if(m)world.remove(m.group);m=shotModels[k]=models.make(style,{face:false});world.add(m.group);}
          if(m){m.update({pos:V(X(s.x),s.y,.3)});m.group.scale.setScalar(.42/BR);m.group.visible=true;}
        });
        for(let k=state.shots.length;k<shotModels.length;k++)if(shotModels[k])shotModels[k].group.visible=false;
        state.seeds.forEach((s,k)=>{const m=seedMeshes[k]||(seedMeshes[k]=mesh(ball,std(0x3d5a2c)));m.scale.set(.28,.2,.2);m.position.set(X(s.x),s.y,.2);m.visible=true;});
        for(let k=state.seeds.length;k<seedMeshes.length;k++)seedMeshes[k].visible=false;
        for(const p of parts){p.t+=dt;p.v.y-=C.G*.35*dt;p.p.addScaledVector(p.v,dt);p.m.position.copy(p.p);p.m.material.transparent=true;p.m.material.opacity=1-p.t/p.max;}
        parts=parts.filter(p=>{if(p.t<p.max)return true;world.remove(p.m);p.m.material.dispose();return false;});
      },
      hud(){
        if(!state)return null;
        const b=state.ball;
        return {hearts:b.dead?0:b.hearts,max:C.MAX_HEARTS,height:Math.max(0,Math.round(b.y-1)),checkpoint:state.checkpoint,won:state.won,again:state.won&&state.time-state.wonAt>1.2};
      }
    };
    return api;
  };
})();
