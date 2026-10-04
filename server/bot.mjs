import '../assets/duel-online/physics.js';
const P=globalThis.DahroojDuelPhysics;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const turnKey=m=>`${m.turn}:${m.balls.map(b=>b.generation).join(':')}`;

export function botActive(room){
  const m=room.state;
  if(m.bot!==1||m.handoff||m.resetT)return false;
  const brain=room.brain;
  return !brain||brain.key!==turnKey(m)||(m.turn===1?!m.balls[1].shot:!brain.thrown);
}

export function stepBot(room,dt,random,throwSmall){
  const m=room.state;
  if(m.bot!==1||m.handoff||m.resetT)return;
  const own=m.balls[1],opponent=m.balls[0],key=turnKey(m);
  if(room.brain?.key!==key)room.brain={key,time:0,shootAt:1.1+random()*.7,throwAt:2.4+random(),reactAt:.24+random()*.22,reacted:false,thrown:false,moved:false};
  const brain=room.brain;brain.time+=dt;
  if(m.turn===1){
    if(!brain.moved&&P.canMove(m,1)){
      brain.moved=true;
      P.move(m,1,{generation:own.generation,seq:(own.moveSeq||0)+1,x:(random()*2-1)*.6});
    }
    if(brain.time>=brain.shootAt&&P.canShoot(m,1)){
      const target=P.position(opponent.p,1);
      // Aim once, with ordinary error. The ball never tracks the player in flight.
      P.launch(own,1,{seq:own.seq+1,target:[clamp(target[0]+(random()*2-1)*.65,-9,9),.35,-P.DISTANCE],flight:.8+random()*.15,curve:0});
    }
    return;
  }
  if(opponent.shot&&!brain.reacted&&opponent.shotT>=brain.reactAt&&P.canMove(m,1)){
    brain.reacted=true;
    if(random()<.6){
      const time=Math.max(0,(own.p[2]-opponent.p[2])/(opponent.v[2]||-1));
      const impactX=opponent.p[0]+opponent.v[0]*time;
      const worldX=clamp(own.p[0]+(own.p[0]>=impactX?.8:-.8),-P.MOVE_LIMIT,P.MOVE_LIMIT);
      P.move(m,1,{generation:own.generation,seq:(own.moveSeq||0)+1,x:-worldX});
    }
  }
  if(!brain.thrown&&brain.time>=brain.throwAt&&P.canDistract(m,1)){
    brain.thrown=true;
    const target=P.position(opponent.p,1);
    throwSmall(1,[clamp(target[0]+(random()*2-1)*.55,-9,9),clamp(target[1],.35,6),clamp(target[2],-P.DISTANCE,-1)]);
  }
}
