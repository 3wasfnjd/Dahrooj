import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {Matchmaker} from '../server/matchmaker.mjs';
import {startLocal} from '../server/local.mjs';
const P=globalThis.DahroojDuelPhysics;
let nextId=0;
function setup(){
  let now=0;const messages=new Map(),closed=[];
  const engine=new Matchmaker({now:()=>now,id:()=>`match-${++nextId}`,send:(key,data)=>{
    if(!messages.has(key))messages.set(key,[]);messages.get(key).push(JSON.parse(data));
  },close:(...args)=>closed.push(args)});
  function add(key,style='jelly'){engine.connect(key);engine.receive(key,JSON.stringify({type:'join',protocol:1,style}));}
  function advance(seconds){for(let i=0;i<Math.ceil(seconds*180);i++){now+=1000/180;engine.tick(P.STEP);}}
  return {engine,messages,closed,add,advance,now:delta=>{now+=delta;}};
}
const shot={type:'shot',seq:1,target:[0,.35,-20],flight:.8,curve:0,generation:0};
test('FIFO pairs are isolated; odd player waits; leaving cancels and rematches automatically',()=>{
  const t=setup();for(const key of ['a','b','c','d','e'])t.add(key);
  assert.equal(t.engine.matches.size,2);
  assert.deepEqual([...t.engine.matches.values()].map(r=>r.players),[['a','b'],['c','d']]);
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
  t.advance(1.3);assert.deepEqual(m.scores,[1,0]);assert.equal(m.turn,0);
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
  assert.equal(m.balls[0].shot,false);assert.deepEqual(m.scores,[1,0]);
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
  assert.deepEqual([...fresh.engine.matches.values()].map(r=>r.players),[['a','b'],['c','d']]);
  assert.deepEqual(fresh.engine.queue,['e']);
  assert.equal(fresh.engine.matches.get(match).state.turn,1,'Current turn survives hibernation');
  assert.equal(P.canShoot(fresh.engine.matches.get(match).state,1),true);
  fresh.engine.receive('f',JSON.stringify({type:'join',protocol:1,style:'bubble'}));
  assert.deepEqual([...fresh.engine.matches.values()].at(-1).players,['e','f']);
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
      await once(socket,'open');socket.send(JSON.stringify({type:'join',protocol:1,style:'jelly'}));
    }
    await waitUntil(()=>histories.every(h=>h.some(m=>m.type==='matched')));
    const ids=histories.map(h=>h.find(m=>m.type==='matched').state.id);
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
