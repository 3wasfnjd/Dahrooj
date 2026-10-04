/* Shared by the browser and the authoritative server. Aboden Games. */
(() => {
  'use strict';
  const R=.24, GRAV=13, DISTANCE=20, STEP=1/180;
  const STYLES=['jelly','fabric','clay','fur','bubble'];
  const length=v=>Math.hypot(...v);
  function ball(slot,generation=0){
    return {p:[0,R+1,-slot*DISTANCE],v:[0,0,0],side:[0,0,0],grounded:false,
      shot:false,shotT:0,restT:0,missT:0,popped:false,generation,seq:0};
  }
  function reset(match,slot){
    const old=match.balls[slot];
    match.balls[slot]=ball(slot,old.generation+1);
    match.balls[slot].seq=old.seq;
  }
  function endTurn(match,slot){reset(match,slot);match.turn=1-slot;}
  function canShoot(match,slot){return match.turn===slot&&!match.resetT&&match.balls.every(b=>b.grounded&&!b.shot&&!b.popped);}
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
    const target=position(c.target,slot),dx=target[0]-b.p[0],dz=target[2]-b.p[2];
    const norm=Math.hypot(dx,dz)||1;
    b.side=[-dz/norm*c.curve*9,0,dx/norm*c.curve*9];
    b.v=target.map((value,i)=>(value-b.p[i]-.5*(i===1?-GRAV:b.side[i])*c.flight*c.flight)/c.flight);
    b.shot=true;b.shotT=0;b.restT=0;b.missT=0;b.grounded=false;b.seq=c.seq;
    return true;
  }
  // Exact gravity, curve, drag, floor bounce and friction from update3().
  function stepBall(b,dt){
    if(b.popped) return 0;
    const p=b.p,v=b.v;
    if(!b.grounded){v[1]-=GRAV*dt;v[0]+=b.side[0]*dt;v[2]+=b.side[2]*dt;}
    const drag=Math.pow(.9,dt);
    for(let i=0;i<3;i++){v[i]*=drag;p[i]+=v[i]*dt;}
    let impact=0;
    if(p[1]<R){
      p[1]=R;
      if(v[1]<-1.4){impact=-v[1];v[1]=-v[1]*.55;v[0]*=.85;v[2]*=.85;b.side=[0,0,0];}
      else {v[1]=0;b.grounded=true;}
    }else if(b.grounded&&p[1]>R+.01)b.grounded=false;
    if(b.grounded){const friction=Math.pow(.35,dt);v[0]*=friction;v[2]*=friction;b.side=[0,0,0];}
    if(b.shot){b.shotT+=dt;b.restT=b.grounded&&length(v)<.35?b.restT+dt:0;}
    return impact;
  }
  function createMatch(id){return {id,turn:0,balls:[ball(0),ball(1)],scores:[0,0],styles:['jelly','jelly'],resetT:0,event:0};}
  function stepMatch(m,dt){
    const events=[];
    if(m.resetT>0){
      for(const b of m.balls)stepBall(b,dt);
      m.resetT-=dt;
      if(m.resetT<=0){m.resetT=0;reset(m,0);reset(m,1);m.turn=1-m.turn;events.push({type:'reset',id:++m.event});}
      return events;
    }
    for(const b of m.balls)stepBall(b,dt);
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
        const popped=[];
        if(a.shot){b.popped=true;m.scores[0]++;popped.push(1);}
        if(b.shot){a.popped=true;m.scores[1]++;popped.push(0);}
        m.resetT=1.7;
        events.push({type:'pop',id:++m.event,slots:popped,positions:m.balls.map(b=>[...b.p])});
        return events;
      }
    }
    for(let slot=0;slot<2;slot++){
      const b=m.balls[slot];if(!b.shot)continue;
      const p=position(b.p,slot);
      if(b.missT>0){b.missT-=dt;if(b.missT<=0)endTurn(m,slot);}
      else if(b.restT>.5||b.shotT>5||Math.abs(p[0])>16||p[2]<-34||p[2]>6)b.missT=1.7;
    }
    return events;
  }
  function active(m){return m.resetT>0||m.balls.some(b=>!b.popped&&(!b.grounded||b.shot||length(b.v)>.001));}
  function snapshot(m){return JSON.parse(JSON.stringify(m));}
  globalThis.DahroojDuelPhysics=Object.freeze({R,GRAV,DISTANCE,STEP,STYLES,ball,reset,endTurn,canShoot,position,vector,validShot,launch,stepBall,createMatch,stepMatch,active,snapshot});
})();
