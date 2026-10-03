import assert from 'node:assert/strict';
import '../assets/duel/shot.js';
import '../assets/duel/rules.js';
const R=globalThis.DahroojDuelRules,K=globalThis.DahroojShot;let checks=0;
const check=(v,m)=>{assert.ok(v,m);checks++;};const fresh=()=>R.create('test-match',['jelly','fur'],1234);
function shoot(s,hit=false){const request={id:s.id,turn:s.turn,x:hit?R.target(s).x:8,y:hit?.35:5,ft:.8,curve:0};const n=R.fire(s,s.turn%2,request);check(R.valid(n),'valid flight');check(R.outcome(n,n.shot).hit===hit,'sphere collision');return R.settle(n);}
let s=fresh();for(let i=0;i<12;i++){check(s.turn%2===i%2,'alternation');check(R.round(s)===Math.floor(i/2)+1,'two turns per round');s=shoot(s);check(R.valid(s),'valid settlement');check(s.phase===(i===11?'done':'aim'),'six rounds');}
check(s.winner==='tie','tie');check(R.fire(s,0,{id:s.id,turn:12,x:0,y:.35,ft:.8,curve:0})===null,'no post-match shots');
s=fresh();for(let i=0;i<5;i++)s=shoot(s,i%2===0);check(s.phase==='done'&&s.winner===0&&s.turn===5,'third hit knockout');
s=fresh();for(let i=0;i<12;i++)s=shoot(s,i===1);check(s.winner===1,'highest score wins after six rounds');
for(let seed=0;seed<30;seed++)for(let turn=0;turn<12;turn++){const match=R.create('geometry',['bubble','clay'],seed);match.turn=turn;const shot={x:R.target(match).x,y:.35,ft:.8,curve:0};check(R.outcome(match,shot).hit,'reachable target');check(JSON.stringify(R.point(shot,.6))===JSON.stringify(R.point(structuredClone(shot),.6)),'deterministic');}
s=fresh();const request={id:s.id,turn:0,x:0,y:.35,ft:.8,curve:0};
for(const bad of [null,{}, {...request,id:'stale'},{...request,turn:1},{...request,x:NaN},{...request,x:10},{...request,y:Infinity},{...request,ft:0},{...request,curve:2}])check(R.fire(s,0,bad)===null,'invalid/stale rejected');
check(R.fire(s,1,request)===null,'wrong player');const flying=R.fire(s,0,request);check(R.fire(flying,0,request)===null,'duplicate rejected');check(R.settle(s)===null,'no double damage');
check(!R.valid({...flying,shot:{x:0,y:.35,ft:NaN,curve:0}}),'invalid snapshot rejected');
// Independent original launch equation, including curved throws, at different flight times.
for(const curve of [-1,0,1])for(const ft of [.5,.85,1.25]){
 const p={x:0,y:.24,z:0},target={x:1,y:2,z:-3.6},result=K.launch(p,target,ft,curve),len=Math.hypot(1,-3.6);
 const ax=3.6/len*curve*9,az=1/len*curve*9;
 check(Math.abs(result.vel.x-(1-.5*ax*ft*ft)/ft)<1e-12,'original horizontal launch');
 check(Math.abs(result.vel.y-(2-.24+.5*13*ft*ft)/ft)<1e-12,'original gravity launch');
 check(Math.abs(result.vel.z-(-3.6-.5*az*ft*ft)/ft)<1e-12,'original depth launch');
}
check(K.gesture([{x:0,y:100,t:0},{x:0,y:90,t:.1}])===null,'short swipe cancelled');
const g=K.gesture([{x:100,y:700,t:0},{x:100,y:500,t:.1}]);check(g.speed===2000&&g.curve===0,'same last-120ms swipe velocity');
check(K.flight(2000)===Math.max(.5,1.35-2000/2600),'same goal/cans flight mapping');
const bounce={x:0,y:.23,z:0},v={x:1,y:-3,z:1},side={x:1,z:1};K.step(bounce,v,side,1/180);check(bounce.y===.24&&v.y>0&&side.x===0,'original floor bounce');
console.log(`Duel ball rules: ${checks} assertions passed.`);
