/* Dahrooj arena: the original live character painter over the original 3D lighting. */
(function(){
'use strict';
window.createDahroojArena=function(root,bridge){
  const T=window.THREE,gl=document.createElement('canvas'),canvas=document.createElement('canvas');
  gl.className='duel-world';canvas.className='duel-touch';canvas.tabIndex=0;canvas.setAttribute('aria-label','اسحب السهم وارمه. لوحة المفاتيح: الاتجاهات للتصويب والمسافة للإطلاق');
  root.prepend(gl,canvas);
  const ctx=canvas.getContext('2d');
  const gpu=gl.getContext('webgl2',{alpha:true,antialias:true})||gl.getContext('webgl',{alpha:true,antialias:true});
  const renderer=gpu?new T.WebGLRenderer({canvas:gl,context:gpu,alpha:true,antialias:true}):{shadowMap:{},setClearColor(){},setPixelRatio(){},setSize(){},render(){},dispose(){}};
  renderer.setClearColor(0,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.1,120),V=(x,y,z)=>new T.Vector3(x,y,z);
  scene.add(new T.HemisphereLight(0xfff8ee,0xd8cbb8,.95));
  const sun=new T.DirectionalLight(0xffffff,.75);sun.position.set(3,10,-4);sun.target.position.set(0,0,-3);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:25});sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target);
  const floor=new T.Mesh(new T.PlaneGeometry(80,80),new T.ShadowMaterial({opacity:.17}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const actorShadows=[0,1].map(()=>{const m=new T.Mesh(new T.SphereGeometry(.24,24,16),new T.MeshBasicMaterial({colorWrite:false,depthWrite:false}));m.castShadow=true;scene.add(m);return m;});
  const spots=[0,1].map(()=>{const m=new T.Mesh(new T.CircleGeometry(.07,32),new T.MeshBasicMaterial({color:0x2c2d3d,transparent:true,opacity:.13}));m.rotation.x=-Math.PI/2;m.position.y=.003;scene.add(m);return m;});
  const actors=[bridge.actor(),bridge.actor()],arrow=new T.Group();scene.add(arrow);
  const palette={jelly:['#8a8e97','#4b4e56','#2a2c31'],fabric:['#a55267','#7c2941','#50172c'],clay:['#ad805c','#825637','#55331f'],fur:['#fff8ef','#eadbcd','#694c3a'],bubble:['#f1eaff','#bddfee','#d6b4df']};
  let style='',width=0,height=0,dpr=1,last=0,shotId='',popped=false,impactAt=0,particles=[],displayTarget={x:0,y:.6,z:12};
  const tmp=V(0,0,0),up=V(0,1,0);
  function material(color,roughness=.38){return new T.MeshStandardMaterial({color,roughness,metalness:0});}
  function texture(fabric){
    const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.fillStyle='#b5b5b5';g.fillRect(0,0,128,128);
    for(let i=0;i<1800;i++){const x=(i*53.13)%128,y=(i*37.77)%128;g.strokeStyle=i%2?'#d0d0d0':'#929292';g.lineWidth=fabric?.6:1;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.sin(i)*3,y+Math.cos(i)*3);g.stroke();}
    const map=new T.CanvasTexture(c);map.wrapS=map.wrapT=T.RepeatWrapping;return map;
  }
  function mesh(geo,mat,x=0,y=0,z=0){const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;arrow.add(m);return m;}
  function rebuild(s){
    style=s;const geos=new Set(),mats=new Set();arrow.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)mats.add(o.material);});arrow.clear();geos.forEach(g=>g.dispose());mats.forEach(m=>{m.bumpMap?.dispose();m.dispose();});
    const colors=palette[s],body=material(colors[1],s==='clay'?.9:s==='fabric'?.95:.3),light=material(colors[0],.6),dark=material(colors[2],.5);
    if(s==='fabric'||s==='clay'){body.bumpMap=texture(s==='fabric');body.bumpScale=s==='fabric'?.018:.012;}
    if(s==='bubble'){for(const m of [body,light,dark]){m.transparent=true;m.opacity=.6;m.roughness=.06;m.metalness=.18;}}
    // A soft toy arrow: rounded shaft, a plump hand-shaped tip and padded fins.
    mesh(new T.CylinderGeometry(.025,.035,.60,24),body,0,-.03);
    mesh(new T.SphereGeometry(.034,20,12),body,0,-.33);
    const profile=[new T.Vector2(0,0),new T.Vector2(.055,.005),new T.Vector2(.105,.035),new T.Vector2(.119,.065),new T.Vector2(.112,.09),new T.Vector2(.065,.19),new T.Vector2(.024,.26),new T.Vector2(0,.275)];
    mesh(new T.LatheGeometry(profile,40),body,0,.20);
    const highlight=mesh(new T.SphereGeometry(1,20,12),light,-.041,.29,.067);highlight.scale.set(.017,.047,.008);highlight.rotation.z=-.45;
    for(let i=0;i<3;i++){
      const angle=i*Math.PI*2/3,fin=mesh(new T.SphereGeometry(1,24,16),i===2?dark:light,Math.cos(angle)*.060,-.23,Math.sin(angle)*.060);
      fin.scale.set(.083,.15,.019);fin.rotation.y=-angle;fin.rotation.z=.19;
    }
    const band=material(s==='fabric'?'#e7c9bb':s==='fur'?'#875747':'#d6ad87',.9);
    for(let i=0;i<3;i++)mesh(new T.TorusGeometry(.033,.009,8,24),band,0,.15+i*.018).rotation.x=Math.PI/2;
    if(s==='fabric'){
      const thread=material('#ebd9be',.9);for(let i=0;i<12;i++){const a=i*Math.PI/6;const stitch=mesh(new T.SphereGeometry(1,8,6),thread,Math.cos(a)*.112,.266,Math.sin(a)*.112);stitch.scale.set(.006,.018,.006);}
    }
    if(s==='clay')for(let i=0;i<3;i++){const ring=mesh(new T.TorusGeometry(.018+i*.008,.002,6,24,Math.PI*1.65),dark,.038,.30,.087);ring.scale.y=1.3;}
    if(s==='fur')for(let i=0;i<20;i++){const a=i*2.4;const tuft=mesh(new T.SphereGeometry(1,8,6),i%4===0?dark:light,Math.cos(a)*.061,-.28+(i%5)*.025,Math.sin(a)*.061);tuft.scale.set(.014,.028,.014);}
    if(s==='bubble')for(let i=0;i<3;i++){const rim=material(['#edb7d4','#b5dfeb','#ede3b6'][i],.12);const ring=mesh(new T.TorusGeometry(.09-i*.019,.004,8,40),rim,0,.29+i*.034);ring.rotation.x=Math.PI/2;}
  }
  const world=p=>V(p.x*.4,p.y*.4,-p.z*.3);
  function project(p){const v=world(p);tmp.copy(v).project(camera);const x=(tmp.x+1)*width/2,y=(1-tmp.y)*height/2;tmp.copy(v).addScaledVector(camera.up,.24).project(camera);return {x,y,r:Math.abs((1-tmp.y)*height/2-y)};}
  function resize(){
    width=innerWidth;height=innerHeight;dpr=Math.min(2,devicePixelRatio||1);renderer.setPixelRatio(dpr);renderer.setSize(width,height,false);canvas.width=width*dpr;canvas.height=height*dpr;
    const radius=Math.max(28,Math.min(48,Math.min(width,height)*.085)),aspect=width/height,minH=34*Math.PI/180;
    camera.aspect=aspect;camera.fov=Math.min(aspect<1.3?2*Math.atan(Math.tan(minH/2)/aspect)*180/Math.PI:40,72);
    const tan=Math.tan(camera.fov*Math.PI/360),dist=.24*(height/2)/(radius*tan),el=35*Math.PI/180;
    camera.position.set(0,.24+dist*Math.sin(el),dist*Math.cos(el));
    const th=Math.atan(((height*.77-radius)-height/2)/(height/2)*tan),lp=-el+th;
    camera.lookAt(0,camera.position.y+Math.sin(lp)*10,camera.position.z-Math.cos(lp)*10);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  }
  function burst(p,s){
    const q=project(p);particles=Array.from({length:22},(_,i)=>{const a=i*2.39996;return {x:q.x,y:q.y,vx:Math.cos(a)*q.r*(2+i%4),vy:Math.sin(a)*q.r*(2+i%3),r:q.r*(.04+(i%3)*.025),color:palette[s][i%3],life:0};});
  }
  // Canvas fallback shares projection, palette and rounded silhouette for devices without WebGL.
  function paintSoftArrow(){
    const a=arrow.position.clone().add(V(0,-.4,0).applyQuaternion(arrow.quaternion)).project(camera);
    const b=arrow.position.clone().add(V(0,.48,0).applyQuaternion(arrow.quaternion)).project(camera);
    const x=(a.x+1)*width/2,y=(1-a.y)*height/2,dx=(b.x-a.x)*width/2,dy=-(b.y-a.y)*height/2,len=Math.max(12,Math.hypot(dx,dy));
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(dy,dx));ctx.scale(len/100,len/100);
    const colors=palette[style];
    const shaft=ctx.createLinearGradient(0,-4,0,4);shaft.addColorStop(0,colors[0]);shaft.addColorStop(.45,colors[1]);shaft.addColorStop(1,colors[2]);
    ctx.shadowColor='#2c2d3d18';ctx.shadowBlur=5;ctx.fillStyle=shaft;
    ctx.beginPath();ctx.roundRect(6,-3.5,66,7,3.5);ctx.fill();ctx.shadowBlur=0;
    for(const side of [-1,1]){
      ctx.save();ctx.scale(1,side);const feather=ctx.createLinearGradient(10,-16,18,1);feather.addColorStop(0,colors[0]);feather.addColorStop(1,colors[2]);ctx.fillStyle=feather;
      ctx.beginPath();ctx.moveTo(4,-2);ctx.bezierCurveTo(4,-9,10,-20,17,-17);ctx.bezierCurveTo(24,-13,32,-6,34,-2);ctx.bezierCurveTo(23,0,14,1,4,-2);ctx.fill();
      ctx.strokeStyle=style==='fabric'?'#e6c8b5aa':'#ffffff38';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(8,-4);ctx.quadraticCurveTo(17,-6,24,-9);ctx.stroke();ctx.restore();
    }
    const tip=ctx.createRadialGradient(76,-8,1,78,0,23);tip.addColorStop(0,colors[0]);tip.addColorStop(.6,colors[1]);tip.addColorStop(1,colors[2]);ctx.fillStyle=tip;
    if(style==='bubble')ctx.globalAlpha=.65;
    ctx.beginPath();ctx.moveTo(68,-3);ctx.bezierCurveTo(63,-14,68,-18,74,-14);ctx.bezierCurveTo(83,-10,94,-4,99,-1.5);ctx.quadraticCurveTo(102,0,99,1.5);ctx.bezierCurveTo(91,5,82,11,74,14);ctx.bezierCurveTo(68,18,63,14,68,3);ctx.closePath();ctx.fill();
    ctx.fillStyle=style==='clay'?'#ffffff20':'#ffffff50';ctx.beginPath();ctx.ellipse(75,-7,6,2,.45,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;ctx.strokeStyle=style==='fabric'?'#e7c9bb':'#d6ad87';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(59+i*3,-4);ctx.lineTo(59+i*3,4);ctx.stroke();}
    if(style==='fabric'){ctx.strokeStyle='#e7c9bb99';ctx.lineWidth=.85;ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(70,-10);ctx.lineTo(93,0);ctx.lineTo(70,10);ctx.stroke();ctx.setLineDash([]);}
    if(style==='clay'){ctx.strokeStyle='#55331f55';ctx.lineWidth=.6;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(75,3,2+i*1.3,1+i*.8,0,.1,5.2);ctx.stroke();}}
    if(style==='fur'){ctx.strokeStyle='#eadbcd';ctx.lineWidth=.7;for(let i=0;i<14;i++){const x=7+i*1.4,y=-3-Math.sin(i/14*Math.PI)*12;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2,y-2);ctx.stroke();}}
    ctx.restore();
  }
  function render(now,{state,me,selected,aim,power,drag,waiting}){
    if(width!==innerWidth||height!==innerHeight)resize();const dt=Math.min(.035,Math.max(.001,(now-last)/1000||.016));last=now;
    const rule=window.DahroojDuelRules,round=state||rule.create('lobby',[selected,selected],0),target=rule.target(round),shooting=round.phase==='flying',shooter=round.turn%2;
    const key=round.id+':'+round.turn;
    if(shooting&&key!==shotId){shotId=key;impactAt=now;popped=false;actors[shooter].dent(Math.PI/2,.36,round.styles[shooter]);}
    const t=shooting?(now-impactAt)/1000:0,outcome=shooting?rule.outcome(round,round.shot):null,hit=outcome?.hit&&t>=outcome.t,hitPlayer=1-shooter;
    const smoothing=1-Math.exp(-dt*7);displayTarget.x+=(target.x-displayTarget.x)*smoothing;
    const positions=[{x:0,y:.6,z:0},{...displayTarget}],styles=state?state.styles:[selected,selected];
    // Indices here are local/remote; canonical player identities stay in the rules.
    const canonical=[me,1-me],aiming=!!state&&round.phase==='aim'&&shooter===me;
    if(hit&&!popped){popped=true;burst(positions[hitPlayer===me?0:1],styles[hitPlayer]);bridge.pop();}
    const shotStyle=state?styles[shooter]:selected;if(style!==shotStyle)rebuild(shotStyle);
    const transform=p=>shooter===me?p:{x:target.x-p.x,y:p.y,z:12-p.z};
    let arrowPos,dir;
    if(shooting&&t<=outcome.t){const p=world(transform(rule.point(round.shot,t))),prev=world(transform(rule.point(round.shot,Math.max(0,t-.012))));arrowPos=p;dir=p.clone().sub(prev);}
    else if(!state||aiming){
      arrowPos=world({x:.95,y:.85,z:0});
      dir=drag?world(rule.point({aim,power},.08)).sub(world(rule.point({aim,power},0))):V(.22,.57,-.26);
      arrowPos.y+=Math.sin(now*.002)*.012;
    }
    arrow.visible=!!arrowPos;if(arrowPos){arrow.position.copy(arrowPos);arrow.quaternion.setFromUnitVectors(up,dir.normalize());const tension=drag?.96:1;arrow.scale.set(tension,1/tension,tension);}
    for(let j=0;j<2;j++){
      const p=positions[j];actorShadows[j].position.copy(world(p));actorShadows[j].visible=!(hit&&canonical[j]===hitPlayer);spots[j].position.x=p.x*.4;spots[j].position.z=-p.z*.3;
    }
    renderer.render(scene,camera);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    if(!gpu){
      for(const p of positions){const q=project({...p,y:0});ctx.save();ctx.fillStyle='#2c2d3d22';ctx.filter='blur(4px)';ctx.beginPath();ctx.ellipse(q.x,q.y,q.r*.95,q.r*.19,0,0,Math.PI*2);ctx.fill();ctx.restore();}
      if(arrow.visible)paintSoftArrow();
    }
    for(const j of [1,0]){
      const player=canonical[j],p=positions[j],q=project(p);let scale=1,face='open',squash=.018*Math.sin(now*.0024+j*1.7);
      if(hit&&player===hitPlayer){const elapsed=t-outcome.t;if(elapsed<.62||round.hearts[player]<=1)continue;const k=Math.min(1,(elapsed-.62)/.45);scale=1+2.2*Math.pow(k-1,3)+1.2*Math.pow(k-1,2);face='wide';}
      if(state?.phase==='done'){face=state.winner===player?'joy':'squint';if(state.winner===player)squash=.1*Math.sin(now*.012);}
      else if(drag&&player===me){face='focus';squash+=power*.1;}
      else if(shooting){face=player===shooter?'focus':'wide';}
      const look=shooting?project(transform(rule.point(round.shot,Math.min(t,outcome.t)))):j===0?project(positions[1]):project(positions[0]);
      const len=Math.hypot(look.x-q.x,look.y-q.y)||1;
      ctx.save();if(!state&&j===1)ctx.globalAlpha=waiting?.75:.28;
      actors[player].paint(ctx,{x:q.x,y:q.y,r:Math.max(.1,q.r*scale),style:styles[player],dt,face,lookX:(look.x-q.x)/len,lookY:(look.y-q.y)/len,squash,blush:drag&&player===me?power*.6:0});ctx.restore();
      if(state){
        // Hearts live with the character, not in a dashboard.
        const lives=round.hearts[player]-(hit&&player===hitPlayer?1:0);ctx.save();ctx.translate(q.x,q.y-q.r-19);const size=j===0?5:4;
        for(let h=0;h<3;h++){ctx.save();ctx.translate((h-1)*size*3.4,0);ctx.scale(size,size);ctx.beginPath();ctx.moveTo(0,.8);ctx.bezierCurveTo(-1.8,-.35,-.8,-1.45,0,-.65);ctx.bezierCurveTo(.8,-1.45,1.8,-.35,0,.8);ctx.fillStyle=h<lives?'#98485a':'#2c2d3d18';ctx.fill();ctx.restore();}ctx.restore();
      }
    }
    if(aiming){const q=project(positions[0]);ctx.strokeStyle='rgba(44,45,61,.18)';ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(q.x,q.y+q.r*.94,q.r*1.28,q.r*.22,0,0,Math.PI*2);ctx.stroke();
      if(drag){ctx.fillStyle='rgba(44,45,61,.25)';for(let t=.12;t<.95;t+=.075){const p=project(rule.point({aim,power},t));ctx.beginPath();ctx.arc(p.x,p.y,1.8,0,Math.PI*2);ctx.fill();}}
    }
    for(const p of particles){p.life+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=160*dt;ctx.globalAlpha=Math.max(0,1-p.life/.7);ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(p.x,p.y,p.r,p.r*.65,p.life*3,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;particles=particles.filter(p=>p.life<.7);
  }
  resize();
  return {canvas,render,resize,origin:()=>project({x:.95,y:.85,z:0}),clear(){particles=[];shotId='';},dispose(){renderer.dispose();}};
};
})();
