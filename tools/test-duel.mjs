import assert from 'node:assert/strict';
import '../assets/duel/rules.js';
const R=globalThis.DahroojDuelRules;
let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
const fresh=()=>R.create('test-match',['jelly','fur'],1234);
function shoot(s,hit=false){
  // At z=12 (t=1.2), y returns to 1.3 when vy=7.2.
  const request={id:s.id,turn:s.turn,aim:hit?R.target(s).x/5.76:1,power:hit?3.2/7:0};
  const next=R.fire(s,s.turn%2,request);check(R.valid(next),'valid flight');
  check(R.outcome(next,next.shot).hit===hit,'geometric collision');
  return R.settle(next);
}
let s=fresh();check(R.valid(s),'initial state');
for(let i=0;i<12;i++){
  check(s.turn%2===i%2,'alternating player');check(R.round(s)===Math.floor(i/2)+1,'two shots per round');
  s=shoot(s);check(s.turn===i+1,'one consumed shot');check(R.valid(s),'valid settlement');
  check(s.phase===(i===11?'done':'aim'),'six full rounds');
}
check(s.winner==='tie','all misses tie');check(R.round(s)===6,'final round label');
check(R.fire(s,0,{id:s.id,turn:12,aim:0,power:.5})===null,'cannot shoot after finish');
s=fresh();for(let i=0;i<5;i++)s=shoot(s,i%2===0);
check(s.phase==='done'&&s.turn===5&&s.winner===0,'early knockout on third hit');
check(s.hearts[1]===0&&s.hearts[0]===3,'damage only to opponent');
s=fresh();for(let i=0;i<12;i++)s=shoot(s,i===1);
check(s.phase==='done'&&s.winner===1&&s.hearts[0]===2,'most hearts after six rounds wins');
for(let seed=0;seed<50;seed++){
  let match=R.create('geometry',['bubble','clay'],seed);
  for(let turn=0;turn<12;turn++){
    match.turn=turn;const target=R.target(match),shot={aim:target.x/5.76,power:3.2/7};
    check(R.outcome(match,shot).hit,'target reachable each turn');
    check(JSON.stringify(R.outcome(match,shot))===JSON.stringify(R.outcome(structuredClone(match),shot)),'deterministic replay');
  }
}
s=fresh();const request={id:s.id,turn:0,aim:0,power:.5};
for(const bad of [null,{}, {...request,id:'old-match'},{...request,turn:1},{...request,aim:Infinity},{...request,aim:NaN},{...request,power:-.1},{...request,power:1.1},{...request,power:'0.5'},{...request,aim:1.1}])check(R.fire(s,0,bad)===null,'reject malformed/stale shot');
check(R.fire(s,1,request)===null,'reject wrong player');
const flying=R.fire(s,0,request);check(R.fire(flying,0,request)===null,'reject duplicate shot');check(R.settle(s)===null,'no double damage');
check(s.hearts.every(n=>n===3)&&s.phase==='aim','immutable transition');
for(const bad of [null,{}, {...s,styles:['unknown','fur']},{...s,hearts:[-1,3]},{...s,turn:12},{...s,phase:'flying',shot:{aim:0,power:Infinity}},{...s,revision:25}])check(!R.valid(bad),'reject invalid snapshot');
console.log(`Duel rules: ${checks} assertions passed.`);
