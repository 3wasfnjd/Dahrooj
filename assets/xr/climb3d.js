/* Summit in the headset: the climb as a model mountain on a table. Aboden Games.
   The same rules as the phone (DahroojClimbCore); this file only builds and moves the 3D pieces.
   The mountain slides down into the surface as Dahrooj climbs: two clipping planes show a window
   from the surface up, so Dahrooj stays in view. One ball radius is `unit` metres. */
(() => {
  'use strict';
  // Meadow, cliffs, caves and snow, as on the phone.
  const THEMES=[0x7f9a5b,0xa38b74,0x77728a,0xe8f1f5];
  const DEPTH=3,VIEW=24,BELOW=2;

  window.createDahroojClimb3D=(T,{core:C,models,BR,renderer,width=16.25,unit=.022})=>{
    const V=(x,y,z)=>new T.Vector3(x,y,z);
    if(renderer)renderer.localClippingEnabled=true;
    const group=new T.Group();group.name='xr-climb';group.visible=false;
    const scaler=new T.Group();group.add(scaler);        // one ball radius = 1 inside
    const world=new T.Group();scaler.add(world);          // scrolls down as Dahrooj climbs
    scaler.scale.setScalar(unit);
    const clip=[new T.Plane(V(0,1,0),0),new T.Plane(V(0,-1,0),0)];
    const std=(color,o={})=>new T.MeshStandardMaterial({color,roughness:.85,clippingPlanes:clip,...o});
    const W=width,X=x=>x-W/2,TOP=C.TOP;
    let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    const noise=(x,y)=>Math.sin(x*1.7+y*.37)*.5+Math.sin(x*.53-y*1.13)*.35+Math.sin(x*3.1+y*2.3)*.15;
    const mesh=(geo,mat,parent)=>{const m=new T.Mesh(geo,mat);(parent||world).add(m);return m;};
    const ball=new T.SphereGeometry(1,20,14),cone=new T.ConeGeometry(1,1,10),cyl=new T.CylinderGeometry(1,1,1,14);
    let state=null,cam=0,parts=[];

    /* ---------- the mountain itself: a rough rock slab, coloured by section ---------- */
    {
      const H=TOP+16,geo=new T.BoxGeometry(W+5,H,5,14,Math.round(H*.55),3),pos=geo.attributes.position,cols=[],c=new T.Color();
      // A muddy clay mountain: warm brown earth, darker in the hollows.
      const rock=new T.Color(0x7b5536),dark=new T.Color(0x4a2f1f);
      for(let i=0;i<pos.count;i++){
        let x=pos.getX(i),y=pos.getY(i)+H/2-3,z=pos.getZ(i);
        // Jagged sides, a bumpy face and a peak that narrows above the summit.
        const side=Math.abs(x)/((W+5)/2),taper=y>TOP-6?Math.max(.25,1-(y-TOP+6)/22):1;
        x=x*taper+(side>.95?noise(y*.4,z)*1.6:0);
        z+=noise(x*.5,y*.5)*.9+(z>0?noise(x*1.3,y*1.1)*.2:0);
        pos.setXYZ(i,x,y,z);
        const theme=THEMES[Math.max(0,Math.min(3,Math.floor(y/36)))];
        c.copy(rock).lerp(new T.Color(theme),.15).lerp(dark,Math.max(0,noise(x*2,y*2))*.45);
        if(y>TOP-10)c.lerp(new T.Color(0xf4f8fa),Math.min(1,(y-TOP+10)/6));
        cols.push(c.r,c.g,c.b);
      }
      geo.setAttribute('color',new T.Float32BufferAttribute(cols,3));geo.computeVertexNormals();
      const m=mesh(geo,std(0xffffff,{vertexColors:true,flatShading:true}));m.position.z=-DEPTH/2-2.6;
    }
    // Scenery on the face: trees in the meadow, boulders on the cliffs, crystals in the caves, snowy pines.
    const leaf=std(0x5f8f45),trunk=std(0x7a5236),boulder=std(0x8a7f74,{flatShading:true}),crystal=std(0xb28ad8,{roughness:.2,metalness:.1,emissive:0x2a1840}),snow=std(0xf4f8fa);
    function tree(x,y,z,s,snowy){
      const g=new T.Group();g.position.set(x,y,z);g.scale.setScalar(s);world.add(g);
      const t=new T.Mesh(cyl,trunk);t.scale.set(.18,1,.18);t.position.y=.5;g.add(t);
      for(let k=0;k<3;k++){const f=new T.Mesh(cone,snowy&&k===2?snow:leaf);f.scale.set(1.1-k*.3,1.2,1.1-k*.3);f.position.y=1.3+k*.65;g.add(f);}
    }
    for(let i=0;i<9;i++)tree(X(rnd()*W),rnd()*32,-DEPTH/2-.8-rnd()*.6,.9+rnd()*.5,false);
    for(let i=0;i<10;i++){const b=mesh(new T.DodecahedronGeometry(1,0),boulder);b.scale.set(.6+rnd(),.5+rnd()*.6,.6+rnd()*.5);b.position.set(X(rnd()*W),36+rnd()*34,-DEPTH/2-.9);b.rotation.set(rnd()*3,rnd()*3,0);}
    for(let i=0;i<14;i++){const k=mesh(new T.OctahedronGeometry(1,0),crystal);k.scale.set(.3,.8+rnd()*.7,.3);k.position.set(X(rnd()*W),74+rnd()*32,-DEPTH/2-.9);k.rotation.z=(rnd()-.5)*.8;}
    for(let i=0;i<8;i++)tree(X(rnd()*W),110+rnd()*30,-DEPTH/2-.8-rnd()*.6,.8+rnd()*.4,true);

    /* ---------- eyes shared by the monsters ---------- */
    const white=std(0xfffaf2,{roughness:.4}),pupil=std(0x23242f,{roughness:.3});
    function eyes(parent,r,spread,y,z){
      return [-1,1].map(s=>{
        const e=new T.Group();e.position.set(s*spread,y,z);parent.add(e);
        const w=new T.Mesh(ball,white);w.scale.setScalar(r);e.add(w);
        const p=new T.Mesh(ball,pupil);p.scale.setScalar(r*.55);p.position.z=r*.6;e.add(p);
        const shine=new T.Mesh(ball,white);shine.scale.setScalar(r*.18);shine.position.set(-r*.2,r*.25,r*1.02);e.add(shine);
        return {p,r};
      });
    }
    function lookAt(list,dx,dy){const l=Math.hypot(dx,dy)||1;for(const {p,r} of list)p.position.set(dx/l*r*.35,dy/l*r*.35,r*.55);}

    /* ---------- ledges ---------- */
    const ledgeRock=std(0x5e3f29,{flatShading:true}),mud=std(0x6e4a2f,{flatShading:true}),plank=std(0x9c6b3f),metal=std(0x6a6c74,{metalness:.5,roughness:.4});
    const grass=std(0x7fa35a),dirt=std(0xa58a6c),cave=std(0x8a84a0),snowTop=std(0xf2f6f8),ice=std(0xbfe3f0,{roughness:.15,metalness:.1}),sand=std(0xb48d62,{flatShading:true});
    const tops=[grass,dirt,cave,snowTop];
    function ledge(p){
      const g=new T.Group(),w=p.x1-p.x0,h=p.full?(p.ground?1.6:1):.8;
      const body=new T.Mesh(new T.BoxGeometry(1,1,1,4,1,2),p.move?plank:p.crumble?sand:ledgeRock);
      body.scale.set(1,h,DEPTH);body.position.y=-h/2-.08;g.add(body);
      const top=new T.Mesh(new T.BoxGeometry(1,1,1),p.ice?ice:p.move?plank:p.ground?mud:tops[p.theme]);top.scale.set(1.02,.2,DEPTH+.1);top.position.y=-.1;g.add(top);
      if(p.crumble)for(let k=1;k<4;k++){const c=new T.Mesh(new T.BoxGeometry(1,1,1),std(0x3b2f26));c.scale.set(.012,.5,DEPTH+.12);c.position.set(k/4-.5,-.3,0);c.rotation.z=(k%2?.4:-.4);g.add(c);}
      // Tufts of grass on meadow ledges, snow lumps on the high ones.
      if(!p.ice&&!p.move&&(p.theme===0||p.theme===3)&&!p.full)for(let k=0;k<3;k++){
        const t=new T.Mesh(p.theme===0?cone:ball,p.theme===0?leaf:snow);
        if(p.theme===0)t.scale.set(.08/w,.35,.08);else t.scale.set(.25/w,.12,.3);
        t.position.set((k+.5)/3-.5,.05,DEPTH*.35);g.add(t);
      }
      if(p.spikes){
        const n=Math.max(2,Math.round((p.spikes[1]-p.spikes[0])*w/.4));
        for(let k=0;k<n;k++)for(const z of [-.9,0,.9]){const s=new T.Mesh(cone,metal);s.scale.set(.17/w,.55,.17);s.userData.f=p.spikes[0]+(p.spikes[1]-p.spikes[0])*(k+.5)/n;s.position.set(0,.28,z);g.add(s);}
      }
      if((p.checkpoint!=null&&!p.ground)||p.summit){
        const f=new T.Group(),hgt=p.summit?3.4:2.2;
        const pole=new T.Mesh(cyl,std(0x3a2f28));pole.scale.set(.07,hgt,.07);pole.position.y=hgt/2;f.add(pole);
        const knob=new T.Mesh(ball,std(0xe2b04a,{metalness:.4,roughness:.3}));knob.scale.setScalar(.14);knob.position.y=hgt;f.add(knob);
        const cloth=new T.Mesh(new T.PlaneGeometry(1.4,.8,8,1),std(0xfffaf2,{side:T.DoubleSide,roughness:.9}));cloth.position.set(.72,hgt-.45,0);f.add(cloth);
        if(p.summit){for(let k=0;k<5;k++){const st=new T.Mesh(new T.DodecahedronGeometry(1,0),boulder);st.scale.setScalar(.45-k*.06);st.position.set((k%2-.5)*.3,.3+k*.35,-.2);f.add(st);}}
        f.userData.cloth=cloth;g.add(f);g.userData.flag=f;
      }
      world.add(g);return {kind:'plat',p,obj:g,h};
    }

    /* ---------- monsters ---------- */
    const shell=std(0x7a4f78,{roughness:.35}),shellDark=std(0x4a2c48,{roughness:.5}),ink=std(0x2c2d3d,{roughness:.9});
    function crawler(g){
      // A little beetle: three shell segments, back spikes, six legs and feelers.
      const segs=[-.55,0,.55].map((x,k)=>{const s=new T.Mesh(ball,k===1?shell:shellDark);s.scale.set(.48,.5-(k===1?0:.06),.62);s.position.set(x,.22,0);g.add(s);return s;});
      for(let k=-2;k<=2;k++){const s=new T.Mesh(cone,ink);s.scale.set(.1,.3,.1);s.position.set(k*.27,.72-Math.abs(k)*.06,0);s.rotation.z=-k*.25;g.add(s);}
      const legs=[];for(let k=0;k<6;k++){const l=new T.Mesh(cyl,ink);l.scale.set(.05,.36,.05);l.position.set((k%3-1)*.5,-.12,k<3?.42:-.42);l.rotation.x=k<3?.5:-.5;g.add(l);legs.push(l);}
      const head=new T.Group();head.position.set(.95,.2,0);g.add(head);
      const face=new T.Mesh(ball,shell);face.scale.set(.42,.4,.45);head.add(face);
      for(const s of [-1,1]){const a=new T.Mesh(cyl,ink);a.scale.set(.03,.45,.03);a.position.set(.1,.5,s*.15);a.rotation.z=-.4;head.add(a);
        const t=new T.Mesh(ball,std(0xe2b04a));t.scale.setScalar(.07);t.position.set(.2,.72,s*.15);head.add(t);}
      return {legs,head,eyes:eyes(head,.15,.15,.12,.38)};
    }
    function bat(g){
      const body=new T.Mesh(ball,std(0x47405e,{roughness:.6}));body.scale.set(.42,.46,.4);g.add(body);
      const belly=new T.Mesh(ball,std(0x6c6386));belly.scale.set(.26,.3,.1);belly.position.set(0,-.08,.33);g.add(belly);
      // Membrane wings with a scalloped trailing edge.
      const wingShape=new T.Shape();wingShape.moveTo(0,.1);wingShape.quadraticCurveTo(.6,.6,1.3,.35);
      wingShape.quadraticCurveTo(1.1,0,1.05,-.15);wingShape.quadraticCurveTo(.85,-.02,.7,-.2);wingShape.quadraticCurveTo(.5,-.02,.35,-.18);wingShape.quadraticCurveTo(.2,-.02,0,-.1);
      const wingGeo=new T.ShapeGeometry(wingShape,8),wingMat=std(0x3a3450,{side:T.DoubleSide,roughness:.7});
      const wings=[-1,1].map(s=>{const w=new T.Group();w.position.x=s*.3;const m=new T.Mesh(wingGeo,wingMat);m.scale.x=s;w.add(m);g.add(w);return w;});
      for(const s of [-1,1]){const e=new T.Mesh(cone,std(0x2c2838));e.scale.set(.12,.34,.1);e.position.set(s*.22,.5,0);e.rotation.z=-s*.25;g.add(e);
        const f=new T.Mesh(cone,white);f.scale.set(.04,.12,.04);f.rotation.z=Math.PI;f.position.set(s*.08,-.16,.36);g.add(f);}
      return {wings,eyes:eyes(g,.12,.16,.1,.33)};
    }
    function spitter(g){
      const pot=new T.Mesh(new T.CylinderGeometry(.62,.46,.72,18),std(0xb8693f));pot.position.y=-.24;g.add(pot);
      const rim=new T.Mesh(new T.TorusGeometry(.62,.1,8,20),std(0x9a4f31));rim.rotation.x=Math.PI/2;rim.position.y=.12;g.add(rim);
      const soil=new T.Mesh(new T.CircleGeometry(.58,18),std(0x4a3326));soil.rotation.x=-Math.PI/2;soil.position.y=.1;g.add(soil);
      const stem=new T.Mesh(cyl,std(0x4f7a3a));stem.scale.set(.08,.8,.08);stem.position.y=.5;g.add(stem);
      for(const s of [-1,1]){const l=new T.Mesh(ball,leaf);l.scale.set(.36,.07,.16);l.position.set(s*.3,.42,0);l.rotation.z=s*.4;g.add(l);}
      const head=new T.Group();head.position.y=1;g.add(head);
      const bulb=new T.Mesh(ball,std(0x6e9f50,{roughness:.45}));bulb.scale.setScalar(.5);head.add(bulb);
      for(let k=0;k<4;k++){const sp=new T.Mesh(ball,std(0xc9dca0));sp.scale.setScalar(.07);const a=k*1.6;sp.position.set(Math.cos(a)*.3,.25+Math.sin(a)*.1,-.35);head.add(sp);}
      const mouth=new T.Group();mouth.position.x=.38;head.add(mouth);
      const lip=new T.Mesh(cone,std(0x5a1f2a));lip.scale.set(.22,.34,.22);lip.rotation.z=-Math.PI/2;mouth.add(lip);
      for(const s of [-1,1]){const t=new T.Mesh(cone,white);t.scale.set(.04,.1,.04);t.position.set(.1,s*.1,0);t.rotation.z=s>0?Math.PI:0;mouth.add(t);}
      return {head,mouth,eyes:eyes(head,.14,.15,.2,.38)};
    }
    const seedMat=std(0x3d5a2c),iceMat=std(0xbfe3f0,{roughness:.15,transparent:true,opacity:.9});

    let pieces=[];
    function build(){
      for(const p of pieces)world.remove(p.obj);
      pieces=state.platforms.map(ledge);
      for(const m of state.monsters){
        const g=new T.Group();world.add(g);
        const parts=m.type==='crawler'?crawler(g):m.type==='bat'?bat(g):spitter(g);
        pieces.push({kind:'monster',m,obj:g,parts});
      }
      for(const i of state.icicles){
        const g=new T.Group();world.add(g);
        const c=new T.Mesh(cone,iceMat);c.scale.set(.32,1.3,.32);c.rotation.z=Math.PI;g.add(c);
        const cap=new T.Mesh(ball,snow);cap.scale.set(.5,.18,.5);cap.position.y=.62;g.add(cap);
        pieces.push({kind:'icicle',i,obj:g});
      }
    }

    /* ---------- Dahrooj, thrown balls, seeds and sparks ---------- */
    let hero=null,heroStyle='';
    const shotModels=[],seedMeshes=[];
    function heroModel(style){
      if(!models)return null;
      if(!hero||heroStyle!==style){if(hero)world.remove(hero.group);hero=models.make(style);heroStyle=style;world.add(hero.group);}
      return hero;
    }
    function burst(x,y,colors,count,speed){
      for(let i=0;i<count;i++){
        const a=Math.random()*Math.PI*2,b=Math.random()*Math.PI-Math.PI/2,v=speed*(.4+Math.random()*.8);
        const m=mesh(ball,std(colors[i%colors.length],{transparent:true}));m.scale.setScalar(.12+Math.random()*.1);
        parts.push({m,p:V(X(x),y,.3),v:V(Math.cos(a)*Math.cos(b)*v,Math.sin(b)*v+speed*.3,Math.sin(a)*Math.cos(b)*v),t:0,max:.5+Math.random()*.4});
      }
    }

    // In VR there is no table, so the model stands on a stone pedestal from the floor.
    const pedestal=new T.Group();group.add(pedestal);
    const column=new T.Mesh(new T.CylinderGeometry(1,1.15,1,24),new T.MeshStandardMaterial({color:0x9d958c,roughness:.9}));pedestal.add(column);
    const slab=new T.Mesh(new T.CylinderGeometry(1.25,1.25,1,24),new T.MeshStandardMaterial({color:0x857c73,roughness:.85}));pedestal.add(slab);
    const SHADOW=new T.Mesh(new T.CircleGeometry(1,32),new T.MeshBasicMaterial({color:0x2c2d3d,transparent:true,opacity:.12,depthWrite:false}));
    SHADOW.rotation.x=-Math.PI/2;group.add(SHADOW);

    const api={
      group,
      get state(){return state;},
      start(){if(!state){state=C.createState(W);build();}C.restart(state);cam=0;group.visible=true;},
      show(on){group.visible=on;if(on&&!state)api.start();if(state)C.setDir(state,0);},
      setUnit(u){unit=u;scaler.scale.setScalar(u);api.setBase(baseHeight);},
      get unit(){return unit;},
      setDir:d=>state&&C.setDir(state,d),
      jump:()=>{if(!state)return;if(state.won&&state.time-state.wonAt>1.2){C.restart(state);return;}C.jump(state);},
      throwBall:()=>state&&C.throwBall(state),
      // Height of the surface above the floor: a pedestal in VR, nothing on a real table in AR.
      setBase(height){
        baseHeight=height;const r=(W/2+2.2)*unit;
        pedestal.visible=height>.05;
        column.scale.set(r*.55,height-.03,r*.55);column.position.y=-height/2-.015;
        slab.scale.set(r,.03,r);slab.position.y=-.015;
        SHADOW.scale.setScalar(r*1.05);SHADOW.position.y=height>.05?.001:.002;SHADOW.visible=height<=.05;
      },
      update(dt,{style,eye,onEvent}){
        if(!state||!group.visible)return;
        C.step(state,dt);
        for(const e of state.events){
          if(e.type==='pop')burst(e.x,e.y,[0x2c2d3d,0xfffaf2,0xc8584b],14,9);
          else if(e.type==='stomp'||e.type==='kill')burst(e.x,e.y,[0x5b3a59,0xfffaf2,0x2c2d3d],10,7);
          else if(e.type==='summit')burst(state.ball.x,state.ball.y+1,[0xc8584b,0xe2b04a,0x7f9a5b,0x5b8bb5,0xfffaf2],30,14);
          onEvent(e);
        }
        state.events.length=0;
        const b=state.ball,target=Math.max(0,b.y-6);
        cam+=(target-cam)*(1-Math.exp(-(b.vy<-15?9:5)*dt));
        world.position.y=-cam;
        // Clip to a window from the surface up: the mountain slides down into the table.
        group.updateMatrixWorld(true);
        const base=scaler.localToWorld(V(0,0,0)),top=scaler.localToWorld(V(0,VIEW,0)),up=scaler.localToWorld(V(0,1,0)).sub(base).normalize();
        clip[0].setFromNormalAndCoplanarPoint(up,base);clip[1].setFromNormalAndCoplanarPoint(up.clone().negate(),top);
        const lo=cam-BELOW,hi=cam+VIEW+2,show=y=>y>lo&&y<hi,t=state.time;
        for(const pc of pieces){
          if(pc.kind==='plat'){
            const p=pc.p,o=pc.obj;let drop=0,shake=0,vis=show(p.y);
            if(p.crumble){if(p.crumble.state==='shaking')shake=Math.sin(t*70)*.06;if(p.crumble.state==='fallen'){drop=p.crumble.t*p.crumble.t*14;vis=vis&&p.crumble.t<.45;}}
            o.visible=vis;if(!vis)continue;
            const w=p.x1-p.x0;o.position.set(X(p.x0)+w/2+shake,p.y-drop,0);o.scale.x=w;
            for(const c of o.children)if(c.userData.f!=null)c.position.x=c.userData.f-.5;
            if(o.userData.flag){const f=o.userData.flag;f.scale.x=1/w;f.position.x=(p.summit?0:W*.36)/w;
              const on=p.summit?state.won:state.checkpoint>=p.checkpoint;f.userData.cloth.material.color.set(on?0xc8584b:0xfffaf2);
              const pos=f.userData.cloth.geometry.attributes.position;for(let k=0;k<pos.count;k++){const x=pos.getX(k);pos.setZ(k,Math.sin(t*5+x*4)*.08*(x+.7));}pos.needsUpdate=true;}
          }else if(pc.kind==='monster'){
            const m=pc.m,o=pc.obj,y=m.type==='crawler'?m.plat.y+.45:m.type==='spitter'?m.plat.y+.6:m.y;
            const fade=m.alive?1:Math.max(0,1-m.t/.6);o.visible=fade>0&&show(y);if(!o.visible)continue;
            o.position.set(X(m.x),y,.2);o.scale.setScalar(m.alive?1:fade*(1+(1-fade)*.5));
            const dx=b.x-m.x,dy=b.y-y;
            if(m.type==='crawler'){
              o.rotation.y=m.dir>0?-.35:Math.PI+.35;
              pc.parts.legs.forEach((l,k)=>l.rotation.z=Math.sin(m.t*16+k*1.6)*.5);
              lookAt(pc.parts.eyes,Math.abs(dx),dy);
            }else if(m.type==='bat'){
              pc.parts.wings.forEach((w,k)=>w.rotation.y=(k?-1:1)*Math.sin(m.t*16)*.9);lookAt(pc.parts.eyes,dx,dy);
            }else{
              const dir=dx>=0?1:-1;pc.parts.head.rotation.y=dir>0?0:Math.PI;pc.parts.head.scale.setScalar(1+m.swell*.16);pc.parts.mouth.scale.set(1,1+m.swell*.8,1+m.swell*.8);
              lookAt(pc.parts.eyes,Math.abs(dx),dy);
            }
          }else{
            const i=pc.i;pc.obj.visible=i.state!=='gone'&&show(i.y);
            pc.obj.position.set(X(i.x)+(i.state==='shake'?Math.sin(t*60)*.06:0),i.y-.65,0);
          }
        }
        // Dahrooj, on the front of the ledges.
        const h=heroModel(style);
        if(h){
          const blinkOut=b.inv>0&&Math.floor(b.inv*12)%2;
          h.group.visible=!b.dead&&!blinkOut;
          let face='open';
          if(state.won)face='joy';else if(b.inv>1)face='closed';else if(!b.grounded&&b.vy<-22)face='wide';else if(!b.grounded)face='focus';
          h.update({pos:V(X(b.x),b.y-(b.d>0?b.d:0),.4),toward:eye,faceName:face,squash:[1+b.d*.75,1-b.d],look:[Math.max(-1,Math.min(1,b.vx/10))*.8,0]});
          h.group.scale.multiplyScalar(1/BR);
        }
        // Thrown balls: eyeless, in Dahrooj's style.
        state.shots.forEach((s,k)=>{
          let m=shotModels[k];
          if(models&&(!m||m.style!==style)){if(m)world.remove(m.group);m=shotModels[k]=models.make(style,{face:false});world.add(m.group);}
          if(m){m.update({pos:V(X(s.x),s.y,.4)});m.group.scale.setScalar(.42/BR);m.group.visible=true;}
        });
        for(let k=state.shots.length;k<shotModels.length;k++)if(shotModels[k])shotModels[k].group.visible=false;
        state.seeds.forEach((s,k)=>{const m=seedMeshes[k]||(seedMeshes[k]=mesh(ball,seedMat));m.scale.set(.28,.2,.2);m.position.set(X(s.x),s.y,.3);m.visible=true;});
        for(let k=state.seeds.length;k<seedMeshes.length;k++)seedMeshes[k].visible=false;
        for(const p of parts){p.t+=dt;p.v.y-=C.G*.35*dt;p.p.addScaledVector(p.v,dt);p.m.position.copy(p.p);p.m.material.opacity=1-p.t/p.max;}
        parts=parts.filter(p=>{if(p.t<p.max)return true;world.remove(p.m);p.m.material.dispose();return false;});
      },
      hud(){
        if(!state)return null;
        const b=state.ball;
        return {hearts:b.dead?0:b.hearts,max:C.MAX_HEARTS,height:Math.max(0,Math.round(b.y-1)),checkpoint:state.checkpoint,won:state.won,again:state.won&&state.time-state.wonAt>1.2};
      }
    };
    let baseHeight=0;
    return api;
  };
})();
