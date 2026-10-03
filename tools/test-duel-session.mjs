// Tests the real lobby/controller with an in-memory transport, not WebRTC.
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const shot=fs.readFileSync(new URL('../assets/duel/shot.js',import.meta.url),'utf8');
const rules=fs.readFileSync(new URL('../assets/duel/rules.js',import.meta.url),'utf8');
const controller=fs.readFileSync(new URL('../assets/duel/duel.js',import.meta.url),'utf8');
const queue=[],peers=new Map();let clock=0,serial=0;const timers=new Map();
const later=fn=>queue.push(fn);
async function flush(){for(let i=0;i<20;i++){await Promise.resolve();while(queue.length)queue.shift()();}}
async function advance(ms){clock+=ms;for(const [id,t] of [...timers])if(t.at<=clock){timers.delete(id);t.fn();}await flush();}
class Events {events={};on(n,f){(this.events[n]??=[]).push(f);}emit(n,v){for(const f of this.events[n]||[])f(v);}}
class Connection extends Events {open=false;send(msg){const copy=structuredClone(msg);later(()=>this.other.emit('data',copy));}close(){if(!this.open)return;this.open=this.other.open=false;later(()=>{this.emit('close');this.other.emit('close');});}}
class Peer extends Events {
  constructor(id){super();this.id=typeof id==='string'?id:'guest-'+(++serial);peers.set(this.id,this);later(()=>this.emit('open',this.id));}
  connect(id,options){const a=new Connection(),b=new Connection();a.other=b;b.other=a;b.metadata=options.metadata;const dest=peers.get(id);later(()=>{if(!dest){this.emit('error',{type:'peer-unavailable'});return;}dest.emit('connection',b);a.open=b.open=true;a.emit('open');b.emit('open');});return a;}
  destroy(){peers.delete(this.id);}
}
class Element {
  constructor(){this.hidden=false;this.disabled=false;this.value='';this.children=[];this.dataset={};this.attributes={};this.nodes=new Map();this.textContent='';this.style={};this.classList={add(){},remove(){}};}
  appendChild(e){this.children.push(e);}
  setAttribute(k,v){this.attributes[k]=v;}
  focus(){}select(){}setPointerCapture(){}
  querySelector(k){if(!this.nodes.has(k)){const e=new Element();if(k==='#duel-power')e.value='46';if(k==='#duel-aim')e.value='0';if(k==='#duel-round')e.children=Array.from({length:6},()=>new Element());this.nodes.set(k,e);}return this.nodes.get(k);}
  querySelectorAll(){return [];}
  getContext(){return new Proxy({},{get:()=>()=>{}});}
}
function player(){
  let root;const document={body:new Element(),head:new Element(),createElement:tag=>{const e=new Element();if(tag==='section')root=e;return e;}};
  const context=vm.createContext({document,Peer,Image:Element,crypto:webcrypto,URL,location:{href:'https://example.test/index.html'},navigator:{clipboard:{writeText:async()=>{}}},innerWidth:390,innerHeight:844,devicePixelRatio:1,performance:{now:()=>clock},Date:{now:()=>clock},addEventListener(){},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>++serial,clearInterval(){}});
  context.window=context;context.createDahroojArena=()=>({canvas:document.createElement('canvas'),resize(){},render(){},clear(){},shotFromGesture:points=>points[0].y-points.at(-1).y>30?{x:8,y:5,ft:.8,curve:0}:null});vm.runInContext(shot,context);vm.runInContext(rules,context);vm.runInContext(controller,context);
  let input;context.createDahroojArena=()=>({canvas:input=new Element(),resize(){},render(){},clear(){},shotFromGesture:points=>points[0].y-points.at(-1).y>30?{x:8,y:5,ft:.8,curve:0}:null});
  const duel=context.createDahroojDuel({sprite:()=>({toDataURL:()=>''}),pop(){},exit(){duel.close();}});duel.open('fur');
  return {$:s=>root.querySelector(s),duel,input};
}
const host=player(),guest=player();host.$('#duel-create').onclick();await flush();
const room=host.$('#duel-room').textContent;assert.match(room,/^[A-HJ-NP-Z2-9]{8}$/);
guest.$('#duel-code').value=room;guest.$('#duel-join-row').hidden=false;guest.$('#duel-enter').onclick();await flush();
assert.equal(host.$('#duel-turn').textContent,'دورك');assert.equal(guest.$('#duel-turn').textContent,'دور المنافس');
// A third player cannot displace the active pair.
const third=player();third.$('#duel-code').value=room;third.$('#duel-join-row').hidden=false;third.$('#duel-enter').onclick();await flush();
assert.equal(third.$('#duel-status').textContent,'غادر المنافس');assert.equal(host.$('#duel-turn').textContent,'دورك');
for(let i=0;i<12;i++){
  const player=i%2?guest:host,waiting=i%2?host:guest;
  assert.equal(player.$('#duel-turn').textContent,'دورك');
  // Inactive controls cannot create a second shot.
  waiting.input.onkeydown({key:' ',preventDefault(){}});await flush();assert.equal(player.$('#duel-turn').textContent,'دورك');
  player.input.onpointerdown({pointerId:1,clientX:100,clientY:700});player.input.onpointerup({pointerId:1,clientX:350,clientY:650});await flush();
  assert.equal(host.$('#duel-turn').textContent,'');assert.equal(guest.$('#duel-turn').textContent,'');
  player.input.onkeydown({key:' ',preventDefault(){}});await flush();await advance(2201);

}
assert.equal(host.$('h1').textContent,'تعادل');assert.equal(guest.$('h1').textContent,'تعادل');
guest.$('#duel-rematch').onclick();await flush();assert.equal(host.$('h1').textContent,'تعادل');
host.$('#duel-rematch').onclick();await flush();assert.equal(host.$('#duel-turn').textContent,'دورك');assert.equal(guest.$('#duel-round').attributes['aria-label'],'الجولة 1 من ٦');
host.duel.render(clock);guest.duel.render(clock);
guest.duel.close();await flush();assert.equal(host.$('#duel-status').textContent,'غادر المنافس');
host.$('#duel-retry').onclick();assert.equal(host.$('#duel-lobby').hidden,false);
host.$('#duel-code').value='BAD';host.$('#duel-join-row').hidden=false;host.$('#duel-enter').onclick();assert.match(host.$('#duel-status').textContent,/٨/);
host.$('#duel-code').value='ABCDEFGH';host.$('#duel-join-row').hidden=false;host.$('#duel-enter').onclick();await flush();assert.match(host.$('#duel-status').textContent,/غير موجودة/);
console.log('PASS: real controller with mocked DOM/transport: room, two peers, full room, 12 alternating shots, duplicates, tie, mutual rematch, leave, invalid room. WebRTC/visuals not exercised.');

const solo=player();solo.$('#duel-bot').onclick();await flush();assert.equal(solo.$('#duel-turn').textContent,'دورك');
solo.input.onpointerdown({pointerId:1,clientX:100,clientY:700});solo.input.onpointerup({pointerId:1,clientX:350,clientY:650});await advance(2201);
assert.equal(solo.$('#duel-turn').textContent,'دور الكمبيوتر');await advance(1600);assert.equal(solo.$('#duel-turn').textContent,'');await advance(2201);assert.equal(solo.$('#duel-turn').textContent,'دورك');
solo.input.onpointerdown({pointerId:2,clientX:100,clientY:700});solo.input.onpointercancel();solo.input.onpointerup({pointerId:2,clientX:100,clientY:500});assert.equal(solo.$('#duel-turn').textContent,'دورك');
solo.duel.close();await advance(10000);console.log('PASS: offline AI turn, player regains turn, pointer cancellation, pending AI timers cancelled on exit.');
