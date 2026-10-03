/* Dahrooj arena: the original live character painter over the original 3D lighting. */
(function(){
'use strict';
window.createDahroojArena=function(root,bridge){
  const T=window.THREE,gl=document.createElement('canvas'),canvas=document.createElement('canvas');
  gl.className='duel-world';canvas.className='duel-touch';canvas.tabIndex=0;canvas.setAttribute('aria-label','اسحب دحروج لأعلى ثم أفلت لإصابة المنافس');
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
  const actors=[bridge.actor(),bridge.actor()],motion=[{d:0,dv:0},{d:0,dv:0}];
  const palette={jelly:['#8a8e97','#4b4e56','#2a2c31'],fabric:['#a55267','#7c2941','#50172c'],clay:['#ad805c','#825637','#55331f'],fur:['#fff8ef','#eadbcd','#694c3a'],bubble:['#f1eaff','#bddfee','#d6b4df']};
  let width=0,height=0,dpr=1,last=0,shotId='',popped=false,impactAt=0,particles=[],displayTarget={x:0,y:.24,z:-3.6};
  const tmp=V(0,0,0),up=V(0,1,0);
  const world=p=>V(p.x,p.y,p.z);
  function shotFromGesture(points){
    const g=window.DahroojShot.gesture(points);if(!g)return null;
    const ray=V(g.x/width*2-1,-g.y/height*2+1,.5).unproject(camera).sub(camera.position).normalize();
    const target=ray.z<-.01?camera.position.clone().addScaledVector(ray,(-3.6-camera.position.z)/ray.z):V(0,1,-3.6);
    return {x:Math.max(-9,Math.min(9,target.x)),y:Math.max(.35,Math.min(6,target.y)),ft:window.DahroojShot.flight(g.speed),curve:g.curve};
  }
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
  function render(now,{state,me,selected,drag,waiting}){
    if(width!==innerWidth||height!==innerHeight)resize();const dt=Math.min(.035,Math.max(.001,(now-last)/1000||.016));last=now;
    const rule=window.DahroojDuelRules,round=state||rule.create('lobby',[selected,selected],0),target=rule.target(round),shooting=round.phase==='flying',shooter=round.turn%2;
    const key=round.id+':'+round.turn;
    if(shooting&&key!==shotId){shotId=key;impactAt=now;popped=false;actors[shooter].dent(Math.PI/2,.36,round.styles[shooter]);}
    const t=shooting?(now-impactAt)/1000:0,outcome=shooting?rule.outcome(round,round.shot):null,hit=outcome?.hit&&t>=outcome.t,hitPlayer=1-shooter;
    const smoothing=1-Math.exp(-dt*7);displayTarget.x+=(target.x-displayTarget.x)*smoothing;
    const positions=[{x:0,y:.24,z:0},{...displayTarget}],styles=state?state.styles:[selected,selected];
    // Indices here are local/remote; canonical player identities stay in the rules.
    const canonical=[me,1-me],aiming=!!state&&round.phase==='aim'&&shooter===me;
    if(hit&&!popped){popped=true;burst(positions[hitPlayer===me?0:1],styles[hitPlayer]);bridge.pop();}
    const transform=p=>shooter===me?p:{x:target.x-p.x,y:p.y,z:target.z-p.z};
    const moving=shooter===me?0:1;
    let returning=0;
    if(shooting){
      if(t<=outcome.t)positions[moving]=transform(rule.point(round.shot,t));
      else returning=Math.max(0,Math.min(1,(t-outcome.t)/.24));
    }
    for(let j=0;j<2;j++){
      const p=positions[j];actorShadows[j].position.copy(world(p));actorShadows[j].visible=!(hit&&canonical[j]===hitPlayer);spots[j].position.x=p.x;spots[j].position.z=p.z;
    }
    renderer.render(scene,camera);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    if(!gpu){
      for(const p of positions){const q=project({...p,y:0});ctx.save();ctx.fillStyle='#2c2d3d22';ctx.filter='blur(4px)';ctx.beginPath();ctx.ellipse(q.x,q.y,q.r*.95,q.r*.19,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    }
    for(const j of [0,1].sort((a,b)=>positions[a].z-positions[b].z)){
      const player=canonical[j],p=positions[j],q=project(p);let scale=1,face='open',squash=.018*Math.sin(now*.0024+j*1.7);
      if(hit&&player===hitPlayer){const elapsed=t-outcome.t;if(elapsed<.62||round.hearts[player]<=1)continue;const k=Math.min(1,(elapsed-.62)/.45);scale=1+2.2*Math.pow(k-1,3)+1.2*Math.pow(k-1,2);face='wide';}
      if(state?.phase==='done'){face=state.winner===player?'joy':'squint';if(state.winner===player)squash=.1*Math.sin(now*.012);}
      else if(drag&&player===me){face='focus';squash+=Math.min(.22,Math.max(0,drag.y-drag.currentY)/height*.9);}
      else if(shooting){face=player===shooter?'wide':'focus';if(player===shooter&&t<outcome.t)squash=-.12;if(player===shooter&&returning>0)scale*=returning;}
      const look=drag&&player===me?{x:drag.currentX,y:drag.currentY}:shooting?project(transform(rule.point(round.shot,Math.min(t,outcome.t)))):j===0?project(positions[1]):project(positions[0]);
      const m=motion[player];m.dv+=((squash-m.d)*420-m.dv*13)*dt;m.d=Math.max(-.3,Math.min(.5,m.d+m.dv*dt));squash=m.d;
      const len=Math.hypot(look.x-q.x,look.y-q.y)||1;
      ctx.save();if(!state&&j===1)ctx.globalAlpha=waiting?.75:.28;
      actors[player].paint(ctx,{x:q.x,y:q.y,r:Math.max(.1,q.r*scale),style:styles[player],dt,face,lookX:(look.x-q.x)/len,lookY:(look.y-q.y)/len,squash,blush:drag&&player===me?Math.min(1,Math.max(0,drag.y-drag.currentY)/(height*.25)):0});ctx.restore();
      if(state){
        // Hearts live with the character, not in a dashboard.
        const lives=round.hearts[player]-(hit&&player===hitPlayer?1:0);ctx.save();ctx.translate(q.x,q.y-q.r-19);const size=j===0?5:4;
        for(let h=0;h<3;h++){ctx.save();ctx.translate((h-1)*size*3.4,0);ctx.scale(size,size);ctx.beginPath();ctx.moveTo(0,.8);ctx.bezierCurveTo(-1.8,-.35,-.8,-1.45,0,-.65);ctx.bezierCurveTo(.8,-1.45,1.8,-.35,0,.8);ctx.fillStyle=h<lives?'#98485a':'#2c2d3d18';ctx.fill();ctx.restore();}ctx.restore();
      }
    }
    if(aiming&&drag&&drag.points.length>1){
      ctx.strokeStyle='rgba(44,45,61,.28)';ctx.lineWidth=3;ctx.lineCap='round';ctx.setLineDash([2,8]);ctx.beginPath();drag.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.setLineDash([]);
    }
    for(const p of particles){p.life+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=160*dt;ctx.globalAlpha=Math.max(0,1-p.life/.7);ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(p.x,p.y,p.r,p.r*.65,p.life*3,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;particles=particles.filter(p=>p.life<.7);
  }
  resize();
  return {canvas,render,resize,shotFromGesture,origin:()=>project({x:0,y:.24,z:0}),clear(){particles=[];shotId='';},dispose(){renderer.dispose();}};
};
})();
