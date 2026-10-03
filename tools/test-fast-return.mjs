// Exercise the actual return/update functions without requiring a browser or WebGL.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),T=require('../vendor/three/three-r128.min.js');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const extract=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const functions=[extract('  const returnFrustum=','  function hit('),extract('  function react(kind','  /* ---------- input: swipe'),extract('  function update3(dt)','  function render3()'),extract('  function resize3()','  resize3();')].join('\n');
let passed=0;
for(const [W,H] of [[390,844],[844,390],[1280,800]]){
 const V=(x,y,z)=>new T.Vector3(x,y,z),noop=()=>{};
 const S={pos:V(0,0,0),vel:V(0,0,0),side:V(0,0,0),axis:V(0,1,0),nextBlink:2,blink:0,hitT:0,lastHit:0};
 const context=vm.createContext({T,V,S,W,H,R:Math.max(24,Math.min(45,Math.min(W,H)*.06)),floorY:H*.78,dpr:1,BR:.24,GRAV:13,UP:V(0,1,0),camera:new T.PerspectiveCamera(45,1,.1,120),renderer:{setPixelRatio:noop,setSize:noop},stage:{collide:noop,update:noop,onRespawn:noop},stageName:'goal',hoopStreak:3,skin:{reset:noop},aim:{down:false},splats3:[],fxDash:[],time:1,hit:noop,confetti:{celebrate:noop},addCount:noop});
 vm.runInContext(functions+'\nresize3();respawn();',context);
 const check=(ok,label)=>{assert(ok,`${W}x${H}: ${label}`);passed++;};
 for(const mode of ['goal','hoop','cans','padel','window']){
  context.stageName=mode;
  for(const [label,x,y] of [['left',-100,2],['right',100,2],['top',0,100],['bottom',0,-100]]){
   context.respawn();S.pos.set(x,y,0);check(context.outsideView(),mode+' '+label+' fully outside');
  }
  for(const pending of ['none','miss','score']){
   context.respawn();context.hoopStreak=3;S.pos.set(100,2,0);S.shot=true;S.shotT=0;
   if(pending==='miss')S.missT=1.7;if(pending==='score')S.scoredT=1.7;
   context.update3(1/120);check(!S.shot&&S.pos.equals(V(0,1.24,0)),mode+' returns in first update '+pending);
   if(mode==='hoop')check(context.hoopStreak===(pending==='score'?3:0),'hoop scoring bookkeeping '+pending);
  }
  for(const timer of ['missT','scoredT']){
   context.respawn();S.shot=true;S.shotT=0;S[timer]=1.7;context.update3(1/120);check(S.shot&&S[timer]>1.6,mode+' visible '+timer+' retained');
  }
  context.respawn();context.camera.updateMatrixWorld();S.pos.copy(new T.Vector3(1,0,.98).unproject(context.camera));check(!context.outsideView(),mode+' partly visible retained');
 }
 context.respawn();S.pos.copy(context.camera.position).add(V(0,0,10));check(context.outsideView(),'behind camera');
 console.log(`PASS ${W}x${H}: viewport bounds, immediate return, partial visibility and existing timers`);
}
console.log(`PASS ${passed} assertions. Stage collisions are stubbed; this is a logic test, not a browser/device test.`);
