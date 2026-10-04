/* Shared by the browser and the authoritative server. Aboden Games. */
(() => {
  'use strict';
  const R=.24, GRAV=13, DISTANCE=20, STEP=1/180;
  const MOVE_LIMIT=1.25, MOVE_SPEED=4.5, SMALL_R=.085, SMALL_THROW_INTERVAL=.15;
  const MAX_HEALTH=100, BALL_DAMAGE=40, DISTRACTION_DAMAGE=BALL_DAMAGE/2;
  const STYLES=['jelly','fabric','clay','fur','bubble'];
  const length=v=>Math.hypot(...v);
  function ball(slot,generation=0){
    return {p:[0,R+1,-slot*DISTANCE],v:[0,0,0],side:[0,0,0],grounded:false,
      moveTarget:null,moveSeq:0,shot:false,hit:false,shotT:0,restT:0,missT:0,popped:false,generation,seq:0};
  }
  function reset(match,slot){
    const old=match.balls[slot];
    match.balls[slot]=ball(slot,old.generation+1);
    match.balls[slot].seq=old.seq;match.balls[slot].moveSeq=old.moveSeq||0;
  }
  function endTurn(match,slot){
    reset(match,slot);match.projectiles=[];match.turn=1-slot;
    for(const b of match.balls){b.moveTarget=null;if(!b.shot)b.v[0]=0;}
  }
  function canMove(m,slot){const b=m.balls[slot];return !m.handoff&&!m.resetT&&b.grounded&&!b.shot&&!b.popped;}
  function canDistract(m,slot){return m.turn!==slot&&canMove(m,slot);}
  function move(m,slot,command){
    const b=m.balls[slot];
    if(!canMove(m,slot)||command.generation!==b.generation||!Number.isFinite(command.x)||Math.abs(command.x)>MOVE_LIMIT||
      !Number.isSafeInteger(command.seq)||command.seq<1||command.seq<=(b.moveSeq||0))return false;
    b.moveTarget=slot?-command.x:command.x;b.moveSeq=command.seq;return true;
  }
  function stepPlayer(m,slot,dt){
    const b=m.balls[slot];
    if(canMove(m,slot)&&Number.isFinite(b.moveTarget)){
      const delta=b.moveTarget-b.p[0];
      if(Math.abs(delta)<.003){b.p[0]=b.moveTarget;b.v[0]=0;b.moveTarget=null;}
      else b.v[0]=Math.max(-MOVE_SPEED,Math.min(MOVE_SPEED,delta/dt));
    }else if(!canMove(m,slot))b.moveTarget=null;
    return stepBall(b,dt);
  }
  function canShoot(match,slot){return !match.handoff&&match.turn===slot&&!match.resetT&&match.balls.every(b=>b.grounded&&!b.shot&&!b.popped);}
  // The second player sees the same camera, rotated through 180 degrees.
  function position(p,slot){return slot?[-p[0],p[1],-DISTANCE-p[2]]:[...p];}
  function vector(v,slot){return slot?[-v[0],v[1],-v[2]]:[...v];}
  function validShot(c){
    return c && Number.isSafeInteger(c.seq) && c.seq>0 &&
      Array.isArray(c.target) && c.target.length===3 && c.target.every(Number.isFinite) &&
      Math.abs(c.target[0])<=9 && c.target[1]>=.35 && c.target[1]<=6 && c.target[2]===-DISTANCE &&
      Number.isFinite(c.flight) && c.flight>=.8 && c.flight<=1.6 &&
      Number.isFinite(c.curve) && Math.abs(c.curve)<=1;
  }
  function launch(b,slot,c){
    if(!validShot(c)||b.shot||!b.grounded||b.popped||c.seq<=b.seq) return false;
    startFlight(b,slot,c);return true;
  }
  function startFlight(b,slot,c){
    const target=position(c.target,slot),dx=target[0]-b.p[0],dz=target[2]-b.p[2];
    const norm=Math.hypot(dx,dz)||1;
    b.side=[-dz/norm*c.curve*9,0,dx/norm*c.curve*9];
    b.v=target.map((value,i)=>(value-b.p[i]-.5*(i===1?-GRAV:b.side[i])*c.flight*c.flight)/c.flight);
    b.moveTarget=null;b.shot=true;b.hit=false;b.shotT=0;b.restT=0;b.missT=0;b.grounded=false;b.seq=c.seq;
  }
  // Exact gravity, curve, drag, floor bounce and friction from update3().
  function stepBall(b,dt){
    if(b.popped) return 0;
    const p=b.p,v=b.v,r=b.radius??R;
    if(!b.grounded){v[1]-=GRAV*dt;v[0]+=b.side[0]*dt;v[2]+=b.side[2]*dt;}
    const drag=Math.pow(.9,dt);
    for(let i=0;i<3;i++){v[i]*=drag;p[i]+=v[i]*dt;}
    let impact=0;
    if(p[1]<r){
      p[1]=r;
      if(v[1]<-1.4){impact=-v[1];v[1]=-v[1]*.55;v[0]*=.85;v[2]*=.85;b.side=[0,0,0];}
      else {v[1]=0;b.grounded=true;}
    }else if(b.grounded&&p[1]>r+.01)b.grounded=false;
    if(b.grounded){const friction=Math.pow(.35,dt);v[0]*=friction;v[2]*=friction;b.side=[0,0,0];}
    if(b.shot){b.shotT+=dt;b.restT=b.grounded&&length(v)<.35?b.restT+dt:0;}
    return impact;
  }
  function validDistractionTarget(target){return Array.isArray(target)&&target.length===3&&target.every(Number.isFinite)&&Math.abs(target[0])<=9&&target[1]>=.35&&target[1]<=6&&target[2]>=-DISTANCE&&target[2]<=-1;}
  function distraction(slot,kind,from,target){
    if(kind!=='ball'||!validDistractionTarget(target))return null;
    const body=ball(slot);body.p=[...from];body.radius=SMALL_R;
    const end=position(target,slot),flight=Math.max(.12,Math.min(.8,length(end.map((v,i)=>v-from[i]))/25));
    startFlight(body,slot,{seq:1,target,flight,curve:0});
    return body;
  }
  function prepareMatch(m){
    if(!m.health)m.health=[MAX_HEALTH,MAX_HEALTH];
    if(!m.projectiles)m.projectiles=[];
    if(m.roundOver===undefined)m.roundOver=m.balls.some(b=>b.popped);
    return m;
  }
  function createMatch(id){return {id,turn:0,balls:[ball(0),ball(1)],health:[MAX_HEALTH,MAX_HEALTH],projectiles:[],roundOver:false,scores:[0,0],styles:['jelly','jelly'],resetT:0,event:0};}
  function damage(m,target,source,amount,events){
    if(m.balls[target].popped||m.resetT>0)return;
    m.health[target]=Math.max(0,m.health[target]-amount);
    events.push({type:'hit',id:++m.event,slot:target,source,amount,health:m.health[target]});
    if(m.health[target]===0){
      m.balls[target].popped=true;m.scores[source]++;m.roundOver=true;m.resetT=1.7;m.projectiles=[];
      events.push({type:'pop',id:++m.event,slots:[target],positions:m.balls.map(b=>[...b.p])});
    }
  }
  // Sweep both moving bodies so fast throws cannot skip a hit between physics steps.
  function sweptHit(start,end,otherStart,otherEnd,radius){
    const p=start.map((v,i)=>v-otherStart[i]),d=end.map((v,i)=>v-otherEnd[i]-p[i]);
    const l=d.reduce((sum,v)=>sum+v*v,0);
    const t=l?Math.max(0,Math.min(1,-p.reduce((sum,v,i)=>sum+v*d[i],0)/l)):0;
    return Math.hypot(...p.map((v,i)=>v+d[i]*t))<=radius;
  }
  function stepProjectiles(m,dt,previous,events){
    for(const item of m.projectiles){
      const start=[...item.body.p];stepBall(item.body,dt);item.t+=dt;
      const target=1-item.slot;
      if(!item.hit&&!m.balls[target].popped&&sweptHit(start,item.body.p,previous[target],m.balls[target].p,R+(item.body.radius??SMALL_R))){
        item.hit=true;damage(m,target,item.slot,DISTRACTION_DAMAGE,events);
        if(m.resetT>0)return;
      }
    }
    m.projectiles=m.projectiles.filter(item=>item.t<1.8);
  }
  function stepMatch(m,dt){
    prepareMatch(m);
    const events=[];
    if(m.resetT>0){
      for(const b of m.balls)stepBall(b,dt);
      m.resetT-=dt;
      if(m.resetT<=0){m.resetT=0;reset(m,0);reset(m,1);m.projectiles=[];if(m.roundOver)m.health=[MAX_HEALTH,MAX_HEALTH];m.roundOver=false;m.turn=1-m.turn;events.push({type:'reset',id:++m.event});}
      return events;
    }
    const previous=m.balls.map(b=>[...b.p]);
    for(let slot=0;slot<2;slot++)stepPlayer(m,slot,dt);
    const [a,b]=m.balls,n=a.p.map((v,i)=>v-b.p[i]),distance=length(n);
    if(!a.popped&&!b.popped&&distance<R*2&&(a.shot||b.shot)){
      if(distance>1e-5)for(let i=0;i<3;i++)n[i]/=distance;else n.splice(0,3,0,0,1);
      const correction=Math.max(0,R*2-distance-.002)*.4;
      for(let i=0;i<3;i++){a.p[i]+=n[i]*correction;b.p[i]-=n[i]*correction;}
      const relative=a.v.map((v,i)=>v-b.v[i]),vn=relative.reduce((sum,v,i)=>sum+v*n[i],0);
      if(vn<0){
        const impulse=-(1+(vn>-.6?0:.35))*vn/2;
        const tangent=relative.map((v,i)=>v-vn*n[i]),vt=length(tangent);
        const friction=vt>1e-5?Math.min(vt/2,.3*impulse)/vt:0;
        for(let i=0;i<3;i++){a.v[i]+=n[i]*impulse-tangent[i]*friction;b.v[i]-=n[i]*impulse-tangent[i]*friction;}
        if(a.shot&&!a.hit){a.hit=true;damage(m,1,0,BALL_DAMAGE,events);}
        if(b.shot&&!b.hit){b.hit=true;damage(m,0,1,BALL_DAMAGE,events);}
        m.resetT=1.7;m.projectiles=[];
        return events;
      }
    }
    stepProjectiles(m,dt,previous,events);
    if(m.resetT>0)return events;
    for(let slot=0;slot<2;slot++){
      const b=m.balls[slot];if(!b.shot)continue;
      const p=position(b.p,slot);
      if(b.missT>0){b.missT-=dt;if(b.missT<=0)endTurn(m,slot);}
      else if(b.restT>.5||b.shotT>5||Math.abs(p[0])>16||p[2]<-34||p[2]>6)b.missT=1.7;
    }
    return events;
  }
  function active(m){return m.resetT>0||m.projectiles?.length>0||m.balls.some(b=>!b.popped&&(!b.grounded||b.shot||Number.isFinite(b.moveTarget)||length(b.v)>.001));}
  function snapshot(m){return JSON.parse(JSON.stringify(m));}
  globalThis.DahroojDuelPhysics=Object.freeze({R,GRAV,DISTANCE,STEP,MOVE_LIMIT,MOVE_SPEED,SMALL_R,SMALL_THROW_INTERVAL,canMove,canDistract,move,stepPlayer,validDistractionTarget,MAX_HEALTH,BALL_DAMAGE,DISTRACTION_DAMAGE,STYLES,distraction,prepareMatch,ball,reset,endTurn,canShoot,position,vector,validShot,launch,stepBall,createMatch,stepMatch,active,snapshot});
})();
