import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {Matchmaker} from '../server/matchmaker.mjs';
import {startLocal} from '../server/local.mjs';
const P=globalThis.DahroojDuelPhysics;
let nextId=0;
function setup({random=()=>.5}={}){
  let now=0;const messages=new Map(),closed=[];
  const engine=new Matchmaker({random,now:()=>now,id:()=>`match-${++nextId}`,send:(key,data)=>{
    if(!messages.has(key))messages.set(key,[]);messages.get(key).push(JSON.parse(data));
  },close:(...args)=>closed.push(args)});
  function add(key,style='jelly'){engine.connect(key);engine.receive(key,JSON.stringify({type:'join',protocol:4,style}));}
  function advance(seconds){for(let i=0;i<Math.ceil(seconds*180);i++){now+=1000/180;engine.tick(P.STEP);}}
  return {engine,messages,closed,add,advance,now:delta=>{now+=delta;}};
}
const shot={type:'shot',seq:1,target:[0,.35,-20],flight:.8,curve:0,generation:0};
test('FIFO human pairs stay isolated; odd player gets AI; leaving rematches automatically',()=>{
  const t=setup();for(const key of ['a','b','c','d','e'])t.add(key);
  assert.equal(t.engine.matches.size,3);
  assert.deepEqual([...t.engine.matches.values()].map(r=>r.players),[['a','b'],['c','d'],['e',null]]);
  assert.deepEqual(t.engine.queue,['e']);
  t.engine.disconnect('a');
  assert.deepEqual([...t.engine.matches.values()].map(r=>r.players),[['c','d'],['e','b']]);
  t.add('f');t.engine.disconnect('f');assert.deepEqual(t.engine.queue,[]);
  for(const events of t.messages.values())assert(events.filter(e=>e.type==='matched').every(e=>[0,1].includes(e.slot)));
});
test('authoritative shot pops the opponent once, syncs scores, preserves other room, resets both',()=>{
  const t=setup();for(const key of ['a','b','c','d'])t.add(key);
  t.advance(2);
  const id=t.engine.clients.get('a').match,other=t.engine.clients.get('c').match;
  t.engine.matches.get(id).state.health[1]=P.BALL_DAMAGE;
  t.engine.receive('a',JSON.stringify({...shot,match:id}));
  t.advance(1.3);
  const match=t.engine.matches.get(id).state;
  assert.deepEqual(match.scores,[1,0]);assert.equal(match.balls[1].popped,true);
  assert.deepEqual(t.engine.matches.get(other).state.scores,[0,0]);
  for(const key of ['a','b'])assert.equal(t.messages.get(key).flatMap(m=>m.events||[]).filter(e=>e.type==='pop').length,1);
  for(const key of ['c','d'])assert.equal(t.messages.get(key).flatMap(m=>m.events||[]).filter(e=>e.type==='pop').length,0);
  t.advance(3);
  assert(match.balls.every(b=>!b.popped&&b.grounded&&!b.shot&&b.generation===1));
  assert.deepEqual(match.scores,[1,0]);
  match.health[0]=P.BALL_DAMAGE;
  t.engine.receive('b',JSON.stringify({...shot,match:id,generation:1}));t.advance(1.3);
  assert.deepEqual(match.scores,[1,1],'second player has the same throw in the mirrored camera');
});
test('only the current player can shoot; simultaneous requests cannot bypass turns',()=>{
  const t=setup();t.add('a');t.add('b');t.advance(2);
  const id=t.engine.clients.get('a').match,m=t.engine.matches.get(id).state;
  t.engine.receive('b',JSON.stringify({...shot,match:id}));
  assert.equal(m.balls[1].shot,false);assert.equal(m.turn,0);
  for(const key of ['a','b'])t.engine.receive(key,JSON.stringify({...shot,match:id}));
  assert.equal(m.balls[0].shot,true);assert.equal(m.balls[1].shot,false);
  t.advance(1.3);assert.deepEqual(m.scores,[0,0]);assert.equal(m.health[1],60);assert.equal(m.turn,0);
  t.engine.receive('b',JSON.stringify({...shot,match:id}));assert.equal(m.balls[1].shot,false);
  t.advance(3);assert.equal(m.turn,1);assert.equal(P.canShoot(m,0),false);assert.equal(P.canShoot(m,1),true);
});
test('forged rooms, scores, bad inputs, replays and stale generations cannot change gameplay',()=>{
  const t=setup();for(const key of ['a','b','c','d'])t.add(key);t.advance(2);
  const id=t.engine.clients.get('a').match,m=t.engine.matches.get(id).state,other=t.engine.clients.get('c').match;
  for(const message of [{...shot,match:other},{...shot,match:id,target:[999,.35,-20]},
    {...shot,match:id,flight:0},{...shot,match:id,curve:2},{...shot,match:id,generation:9},
    {type:'score',match:id,score:100},{type:'pop',match:id,slot:1}])t.engine.receive('a',JSON.stringify(message));
  assert.equal(m.balls[0].shot,false);assert.deepEqual(m.scores,[0,0]);
  t.engine.receive('a',JSON.stringify({...shot,match:id}));t.advance(4);
  t.engine.receive('a',JSON.stringify({...shot,match:id}));
  assert.equal(m.balls[0].shot,false);assert.deepEqual(m.scores,[0,0]);assert.equal(m.health[1],60);
  t.engine.receive('a',JSON.stringify({...shot,match:id,generation:1}));assert.equal(m.balls[0].shot,false);
  t.engine.receive('a',JSON.stringify({...shot,seq:2,match:id,generation:1}));assert.equal(m.balls[0].shot,false);
  t.engine.receive('b',JSON.stringify({...shot,match:id,generation:1}));t.advance(4);
  t.engine.receive('a',JSON.stringify({...shot,seq:2,match:id,generation:2}));assert.equal(m.balls[0].shot,true);
});
test('curve, velocity and every integration step match the existing cans physics',()=>{
  for(const curve of [-1,0,1])for(const flight of [.8,1.2,1.6]){
    const b=P.ball(0);b.p=[0,.24,0];b.grounded=true;
    const target=[2,.9,-20],flat=[target[0],0,target[2]],norm=Math.hypot(...flat);
    const side=[-flat[2]/norm*curve*9,0,flat[0]/norm*curve*9];
    const v=target.map((x,i)=>(x-b.p[i]-.5*(i===1?-13:side[i])*flight*flight)/flight),pos=[...b.p];
    assert(P.launch(b,0,{seq:1,target,flight,curve}));assert.deepEqual(b.v,v);assert.deepEqual(b.side,side);
    for(let i=0;i<54;i++){
      v[1]-=13/180;v[0]+=side[0]/180;v[2]+=side[2]/180;
      for(let k=0;k<3;k++){v[k]*=Math.pow(.9,1/180);pos[k]+=v[k]/180;}
      P.stepBall(b,1/180);
      for(let k=0;k<3;k++)assert(Math.abs(b.p[k]-pos[k])<1e-12);
    }
  }
});
test('miss and off-screen return are restricted to the sender; styles stay player-specific',()=>{
  const t=setup();t.add('a','fabric');t.add('b','fur');t.advance(2);
  const id=t.engine.clients.get('a').match,m=t.engine.matches.get(id).state;
  assert.deepEqual(m.styles,['fabric','fur']);
  t.engine.receive('a',JSON.stringify({type:'style',style:'clay'}));assert.deepEqual(m.styles,['clay','fur']);
  t.engine.receive('a',JSON.stringify({...shot,match:id,target:[9,6,-20]}));t.advance(.3);
  t.engine.receive('a',JSON.stringify({type:'return',match:id,generation:0}));
  assert.equal(m.balls[0].generation,1);assert.equal(m.balls[1].generation,0);assert.deepEqual(m.scores,[0,0]);
  assert.equal(m.turn,1);
  t.advance(2);t.engine.receive('b',JSON.stringify({...shot,generation:0,match:id,target:[9,6,-20]}));t.advance(8);
  assert.equal(m.balls[1].shot,false);assert.equal(m.balls[1].generation,1);assert.equal(m.turn,0);
});
test('hibernation restores idle pairs, pending joins and FIFO order without duplicate rooms',()=>{
  const t=setup();for(const k of ['a','b','c','d','e'])t.add(k);t.engine.connect('f');t.advance(2);
  const match=t.engine.clients.get('a').match;
  t.engine.receive('a',JSON.stringify({...shot,match,target:[9,6,-20]}));t.advance(.3);
  t.engine.receive('a',JSON.stringify({type:'return',match,generation:0}));t.advance(2);
  const entries=[...t.engine.clients.keys()].map(k=>[k,JSON.parse(JSON.stringify(t.engine.attachment(k)))]);
  const fresh=setup();fresh.engine.restore(entries);
  assert.deepEqual([...fresh.engine.matches.values()].map(r=>r.players),[['a','b'],['c','d'],['e',null]]);
  assert.deepEqual(fresh.engine.queue,['e']);
  assert.equal(fresh.engine.matches.get(match).state.turn,1,'Current turn survives hibernation');
  assert.equal(P.canShoot(fresh.engine.matches.get(match).state,1),true);
  fresh.engine.receive('f',JSON.stringify({type:'join',protocol:4,style:'bubble'}));
  fresh.advance(2);assert.deepEqual([...fresh.engine.matches.values()].at(-1).players,['e','f']);
  assert.equal(fresh.engine.matches.size,3);
});
test('expired and flooding sockets are removed without leaving phantom matches',()=>{
  const t=setup();t.add('a');t.add('b');t.now(46000);
  t.engine.receive('b',JSON.stringify({type:'ping',t:46000}));t.engine.sweep();
  assert.equal(t.engine.clients.has('a'),false);assert.deepEqual(t.engine.queue,['b']);
  for(let i=0;i<50;i++)t.engine.receive('b',JSON.stringify({type:'ping',t:i}));
  assert.equal(t.engine.clients.size,0);assert.equal(t.engine.matches.size,0);assert(t.closed.some(c=>c[1]===1008));
});
test('real WebSockets pair four clients and reject a cross-origin connection',async()=>{
  const app=await startLocal({port:0});const clients=[];
  try{
    const histories=[];
    for(let i=0;i<4;i++){
      const socket=new WebSocket(app.url.replace('http:','ws:')+'/ws',{origin:app.url});clients.push(socket);
      histories.push([]);socket.on('message',raw=>histories[i].push(JSON.parse(raw.toString())));
      await once(socket,'open');socket.send(JSON.stringify({type:'join',protocol:4,style:'jelly'}));
    }
    await waitUntil(()=>histories.every(h=>h.some(m=>m.type==='matched'&&m.state.bot!==1)));
    const ids=histories.map(h=>h.find(m=>m.type==='matched'&&m.state.bot!==1).state.id);
    assert.equal(ids[0],ids[1]);assert.equal(ids[2],ids[3]);assert.notEqual(ids[0],ids[2]);
    clients[0].close();await waitUntil(()=>histories[1].some(m=>m.type==='waiting'&&m.reason==='left'));
    const blocked=new WebSocket(app.url.replace('http:','ws:')+'/ws',{origin:'https://unrelated.example'});
    await new Promise(ok=>blocked.on('error',error=>{assert.match(error.message,/403/);ok();}));
  }finally{for(const s of clients)s.terminate();await app.close();}
});
async function waitUntil(check){
  const end=Date.now()+4000;
  while(!check()){if(Date.now()>end)throw Error('Timed out');await new Promise(ok=>setTimeout(ok,20));}
}

test('distractions only come from waiting opponent, stay in the room and never change physics',()=>{
  const t=setup();for(const key of ['a','b','c','d','e'])t.add(key);t.advance(2);
  const id=t.engine.clients.get('a').match,m=t.engine.matches.get(id).state;
  const before=JSON.stringify(m.balls),send=(key,extra={})=>t.engine.receive(key,JSON.stringify({type:'distraction',kind:'ball',target:[0,.35,-20],match:id,generation:0,...extra}));
  send('a');send('c');send('e');send('b',{kind:'unknown'});send('b',{generation:99});
  assert.equal(t.messages.get('a').filter(x=>x.type==='distraction').length,0);
  for(let i=0;i<3;i++){send('b');send('b');t.now(1001);}
  for(const key of ['a','b'])assert.deepEqual(t.messages.get(key).filter(x=>x.type==='distraction').map(x=>x.kind),['ball','ball','ball']);
  for(const key of ['c','d','e'])assert.equal(t.messages.get(key).filter(x=>x.type==='distraction').length,0);
  assert.equal(JSON.stringify(m.balls),before);assert.equal(m.projectiles.length,3);
  m.turn=1;send('b');assert.equal(t.messages.get('a').filter(x=>x.type==='distraction').length,3);
  send('a');assert.equal(t.messages.get('b').filter(x=>x.type==='distraction').length,4);
  m.resetT=1;t.now(1001);send('a');assert.equal(t.messages.get('b').filter(x=>x.type==='distraction').length,4);
});

test('health persists across turns; three Dahrooj hits pop once and restore full health for the next round',()=>{
  const t=setup();t.add('a');t.add('b');t.advance(2);
  const id=t.engine.clients.get('a').match,m=t.engine.matches.get(id).state;
  assert.deepEqual(m.health,[100,100]);
  const fire=key=>{const slot=t.engine.clients.get(key).slot,b=m.balls[slot];t.engine.receive(key,JSON.stringify({...shot,match:id,seq:b.seq+1,generation:b.generation}));};
  for(let round=0;round<3;round++){
    fire('a');t.advance(1.1);
    assert.equal(m.health[1],Math.max(0,100-40*(round+1)));
    assert.equal(m.balls[1].popped,round===2);assert.equal(m.scores[0],round===2?1:0);
    t.advance(3);
    if(round<2){fire('b');t.advance(4);}
  }
  assert.deepEqual(m.health,[100,100]);assert.deepEqual(m.scores,[1,0]);
  assert.equal(t.messages.get('a').flatMap(x=>x.events||[]).filter(e=>e.type==='pop').length,1);
});

test('every distraction uses half the ball damage, requires a real hit and scores only on zero health',()=>{
  for(const kind of ['ball']){
    const t=setup();for(const key of ['a','b','c','d'])t.add(key);t.advance(2);
    const id=t.engine.clients.get('a').match,m=t.engine.matches.get(id).state,other=t.engine.matches.get(t.engine.clients.get('c').match).state;
    const send=()=>t.engine.receive('b',JSON.stringify({type:'distraction',kind,target:[0,.35,-20],match:id,generation:m.balls[1].generation,damage:999}));
    for(let i=0;i<5;i++){
      send();t.advance(.6);assert.equal(m.health[0],100-i*20,'No damage before contact');
      t.advance(.5);assert.equal(m.health[0],Math.max(0,100-(i+1)*20));
      assert.equal(m.balls[0].popped,i===4);assert.deepEqual(other.health,[100,100]);
      assert.equal(m.scores[1],i===4?1:0);
    }
    const hits=t.messages.get('a').flatMap(x=>x.events||[]).filter(e=>e.type==='hit');
    assert.equal(hits.length,5);assert(hits.every(e=>e.amount===P.BALL_DAMAGE/2));
    t.advance(3);assert.deepEqual(m.health,[100,100]);assert.deepEqual(m.scores,[0,1]);assert.equal(m.turn,1);
  }
});

test('missed or already counted distractions cannot drain health; hibernation preserves damage',()=>{
  const t=setup();t.add('a');t.add('b');t.advance(2);
  const id=t.engine.clients.get('a').match,m=t.engine.matches.get(id).state;
  const send=()=>t.engine.receive('b',JSON.stringify({type:'distraction',kind:'ball',target:[0,.35,-20],match:id,generation:0}));
  send();m.balls[0].p[0]=6;t.advance(2);assert.deepEqual(m.health,[100,100]);
  m.balls[0].p[0]=0;send();t.advance(2);assert.deepEqual(m.health,[80,100]);
  t.advance(3);assert.deepEqual(m.health,[80,100]);
  const entries=[...t.engine.clients.keys()].map(k=>[k,JSON.parse(JSON.stringify(t.engine.attachment(k)))]);
  const fresh=setup();fresh.engine.restore(entries);assert.deepEqual(fresh.engine.matches.get(id).state.health,[80,100]);
  for(const [,entry] of entries){delete entry.state.health;delete entry.state.projectiles;}
  const legacy=setup();legacy.engine.restore(entries);assert.deepEqual(legacy.engine.matches.get(id).state.health,[100,100]);
});

test('both players can move at bounded speed; airborne, invalid, stale and foreign movement is ignored',()=>{
  const t=setup();for(const k of ['a','b','c','d'])t.add(k);t.advance(2);
  const id=t.engine.clients.get('a').match,m=t.engine.matches.get(id).state;
  const input={type:'move',match:id,seq:1,generation:0,x:1};
  for(const [key,extra] of [['c',{}],['b',{x:9}],['b',{generation:99}],['b',{x:'1'}],['b',{seq:0}]])t.engine.receive(key,JSON.stringify({...input,...extra}));
  t.advance(.1);assert.equal(m.balls[1].p[0],0);
  t.engine.receive('b',JSON.stringify(input));assert.equal(m.balls[1].p[0],0,'Input does not teleport');
  t.advance(.1);assert(m.balls[1].p[0]<0&&m.balls[1].p[0]>=-P.MOVE_SPEED*.101);
  t.advance(.5);assert(Math.abs(m.balls[1].p[0]+1)<.005);assert.equal(m.balls[1].shot,false);
  t.engine.receive('b',JSON.stringify({...input,x:-1}));t.advance(.5);assert(Math.abs(m.balls[1].p[0]+1)<.005,'Replayed movement ignored');
  t.engine.receive('b',JSON.stringify({...input,seq:2,x:-1}));t.advance(.6);assert(Math.abs(m.balls[1].p[0]-1)<.005);
  t.engine.receive('a',JSON.stringify({...shot,match:id}));t.advance(1.1);assert.deepEqual(m.health,[100,100],'Moving defender dodges the center shot');
  t.engine.receive('a',JSON.stringify({type:'return',match:id,generation:0}));assert.equal(m.turn,1);assert.equal(m.balls[1].moveTarget,null);
  t.engine.receive('b',JSON.stringify({...input,seq:3,x:0}));t.advance(.4);assert(Math.abs(m.balls[1].p[0])<.005,'The shooter can also move sideways');
  t.advance(2);t.engine.receive('b',JSON.stringify({...shot,match:id,generation:0}));
  assert(m.balls[1].shot);t.engine.receive('b',JSON.stringify({...input,seq:4,x:1}));assert.equal(m.balls[1].moveTarget,null,'An airborne throw keeps its original physics');
});

test('small balls follow the tap target, never home, and reject old objects or missing targets',()=>{
  const t=setup();t.add('a');t.add('b');t.advance(2);
  const id=t.engine.clients.get('a').match,m=t.engine.matches.get(id).state;
  const send=extra=>t.engine.receive('b',JSON.stringify({type:'distraction',kind:'ball',match:id,generation:0,...extra}));
  const target=[1,.35,-20];send({target});
  const item=m.projectiles.at(-1),before=[...item.body.v];
  assert.equal(item.body.radius,P.SMALL_R);assert(P.SMALL_R<P.R/2);
  m.balls[0].p[0]=-1.2;t.advance(.1);
  assert(item.body.v[0]<0);assert(Math.abs(item.body.v[0])<Math.abs(before[0]));
  assert.deepEqual(t.messages.get('a').filter(e=>e.type==='distraction').at(-1).target,target);
  assert.deepEqual(t.messages.get('a').filter(e=>e.type==='distraction'),t.messages.get('b').filter(e=>e.type==='distraction'));
  const count=m.projectiles.length;t.now(1001);
  for(const bad of [[99,.35,-20],[0,0,-20],[0,.35,0],['0',.35,-20],null])send({target:bad});
  send({});for(const kind of ['can','bottle','balloon'])send({kind,target});
  assert.equal(m.projectiles.length,count);
  send({target:[.2,1,-5]});assert.equal(m.projectiles.length,count+1,'A tap can aim at an approaching opponent');
});

test('rapid taps launch overlapping balls before the first hit; each hit still counts once',()=>{
  const t=setup();t.add('a');t.add('b');t.advance(2);
  const id=t.engine.clients.get('a').match,m=t.engine.matches.get(id).state;
  const send=()=>t.engine.receive('b',JSON.stringify({type:'distraction',kind:'ball',target:[0,.35,-20],match:id,generation:0}));
  for(let i=0;i<3;i++){
    send();send();
    assert.equal(m.projectiles.length,i+1,'Immediate duplicate is ignored; the next tap does not wait for impact');
    assert.equal(m.health[0],100,'All three throws launch before the first one hits');
    t.advance(.16);
  }
  assert.equal(m.projectiles.length,3);
  for(const key of ['a','b'])assert.equal(t.messages.get(key).filter(e=>e.type==='distraction').length,3);
  t.advance(1);assert.deepEqual(m.health,[40,100]);assert.deepEqual(m.scores,[0,0]);
  t.advance(2);assert.deepEqual(m.health,[40,100]);
});

test('small balls keep the thrower style at launch on both clients, including AI',()=>{
  const t=setup();t.add('a','jelly');t.add('b','fabric');t.advance(2);
  const id=t.engine.clients.get('a').match,m=t.engine.matches.get(id).state;
  for(const style of P.STYLES){
    t.engine.receive('b',JSON.stringify({type:'style',style}));
    t.engine.receive('b',JSON.stringify({type:'distraction',kind:'ball',style:'forged',target:[4,.35,-20],match:id,generation:0}));
    for(const key of ['a','b'])assert.equal(t.messages.get(key).filter(e=>e.type==='distraction').at(-1).style,style);
    t.advance(.16);
  }
  assert.deepEqual(m.projectiles.map(p=>p.style),P.STYLES,'Changing styles does not repaint already flying balls');
  t.engine.receive('b',JSON.stringify({type:'style',style:'fabric'}));assert.equal(m.projectiles.at(-1).style,'bubble');
  const solo=setup();solo.add('player','fur');solo.advance(3.1);
  const aiStyle=solo.engine.matches.get(solo.engine.clients.get('player').match).state.styles[1];
  assert.notEqual(aiStyle,'fur');assert.equal(solo.messages.get('player').find(e=>e.type==='distraction').style,aiStyle,'AI projectiles use the AI style');
});

test('AI starts immediately with a different style, shares physics, takes turns and resumes after a human leaves',()=>{
  const t=setup();t.add('a','fabric');
  let room=t.engine.matches.get(t.engine.clients.get('a').match);
  assert.equal(room.state.bot,1);assert.equal(room.state.styles[0],'fabric');assert.notEqual(room.state.styles[1],'fabric');assert.equal(t.engine.clients.size,1);
  t.advance(2);assert(P.canShoot(room.state,0));
  for(const style of P.STYLES){t.engine.receive('a',JSON.stringify({type:'style',style}));assert.equal(room.state.styles[0],style);assert.notEqual(room.state.styles[1],style);}
  const id=room.state.id;
  t.engine.receive('a',JSON.stringify({...shot,match:id,target:[9,6,-20]}));t.advance(.5);
  assert(room.state.balls[1].moveSeq>0,'AI reacts using normal movement');
  t.engine.receive('a',JSON.stringify({type:'return',match:id,generation:0}));
  t.advance(2.5);assert(room.state.balls[1].seq>0,'AI throws Dahrooj on its turn');
  assert.equal(room.state.balls[1].shot,true);assert.equal(room.state.balls[1].moveTarget,null);
  t.add('b');assert.equal(room.state.handoff,true);assert.equal(t.engine.clients.get('a').match,id,'A new human cannot interrupt a flying throw');
  const before=room.state.balls[0].seq;
  t.engine.receive('a',JSON.stringify({...shot,match:id,generation:room.state.balls[0].generation,seq:before+1}));assert.equal(room.state.balls[0].seq,before);
  t.advance(8);assert.equal(t.engine.clients.get('a').match,t.engine.clients.get('b').match);
  room=t.engine.matches.get(t.engine.clients.get('a').match);assert.equal(room.state.bot,null);assert.deepEqual(room.state.scores,[0,0]);assert.deepEqual(room.state.health,[100,100]);
  t.engine.disconnect('b');room=t.engine.matches.get(t.engine.clients.get('a').match);assert.equal(room.state.bot,1);assert.notEqual(room.state.styles[0],room.state.styles[1]);assert.deepEqual(t.engine.queue,['a']);
});

test('AI practice restores health and timers; cancelled handoff returns to AI without a stuck room',()=>{
  const t=setup();t.add('a');t.advance(4.8);
  const id=t.engine.clients.get('a').match,room=t.engine.matches.get(id);
  assert.equal(room.state.health[0],80,'AI small ball applies the same 20 damage');
  assert.equal(t.engine.active(),false,'Quiet solo play can hibernate after the AI action');
  const saved=JSON.parse(JSON.stringify(t.engine.attachment('a')));saved.state.styles[1]=saved.state.styles[0];
  const fresh=setup();fresh.engine.restore([['a',saved]]);
  assert.notEqual(fresh.engine.matches.get(id).state.styles[0],fresh.engine.matches.get(id).state.styles[1],'Old matching AI styles are repaired on restore');
  assert(fresh.messages.get('a').some(e=>e.type==='state'&&e.state.styles[0]!==e.state.styles[1]),'Existing clients receive the distinct AI style');
  assert.equal(fresh.engine.matches.get(id).state.health[0],80);assert.equal(fresh.engine.active(),false);
  fresh.engine.receive('a',JSON.stringify({...shot,match:id,target:[9,6,-20]}));fresh.advance(.3);fresh.add('b');
  assert.equal(fresh.engine.matches.get(id).state.handoff,true);
  fresh.engine.disconnect('b');assert.equal(fresh.engine.matches.get(id).state.handoff,false);
  fresh.advance(10);assert.equal(fresh.engine.clients.size,1);assert.equal(fresh.engine.matches.size,1);
  fresh.engine.disconnect('a');assert.equal(fresh.engine.active(),false);assert.equal(fresh.engine.matches.size,0);
});
