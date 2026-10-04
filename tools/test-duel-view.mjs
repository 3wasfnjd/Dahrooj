import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../assets/duel-online/physics.js';
const P=globalThis.DahroojDuelPhysics;
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const three={};vm.createContext(three);vm.runInContext(readFileSync(new URL('../vendor/three/three-r128.min.js',import.meta.url),'utf8'),three);
const T=three.THREE;
const extract=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
function view(width,height){
  const camera=new T.PerspectiveCamera(45,1,.1,120),R=Math.max(24,Math.min(45,Math.min(width,height)*.06));
  const env={W:width,H:height,R,BR:P.R,OR:P.R,floorY:height*.78,dpr:1,camera,renderer:{setPixelRatio(){},setSize(){}},V:(...v)=>new T.Vector3(...v),
    visible:true,O:{pos:new T.Vector3(),axis:new T.Vector3(0,1,0),vel:new T.Vector3(),touched:false,d:0,hitT:0,blink:0},
    S:{pos:new T.Vector3(0,P.R,0),shot:false},furVel:{x:0,y:0},ballStyle:'jelly',opponentStyle:'jelly',opponentBubble:{},draws:0,
    opponentSkin:{points(x,y,r){return {P:[{x:x-r,y:y-r},{x:x+r,y:y+r}],cx:x,cy:y};}}};
  env.toScreen=p=>{const v=p.clone().project(camera);return {x:(v.x+1)*width/2,y:(1-v.y)*height/2};};
  env.paintBlob=()=>env.draws++;
  vm.createContext(env);
  const visibility=html.includes('function inFrontOfCamera(pos)')?extract('function inFrontOfCamera(pos)','    const distractions='):'';
  vm.runInContext(`const cameraPoint=V();${visibility}\n${extract('function resize3(){','  resize3();')}resize3();\n${extract('function radiusOnScreen(pos,r){','    function popPlayers(')}\n${extract('function paintOpponent(c){','    function syncBall(')}`,env);
  camera.updateMatrixWorld();return env;
}
test('missed throws disappear behind each receiver camera instead of projecting back onto the screen',()=>{
  for(const [w,h] of [[320,568],[390,844],[844,390],[1280,800]])for(const slot of [0,1]){
    const env=view(w,h),ball=P.ball(slot);ball.p=[0,P.R,-20*slot];ball.grounded=true;
    assert(P.launch(ball,slot,{target:[0,2,-20],flight:.8,curve:0,seq:1}));
    let approaching=0,behind=0;
    for(let i=0;i<360;i++){
      P.stepBall(ball,P.STEP);env.O.pos.fromArray(P.position(ball.p,1-slot));
      env.O.vel.fromArray(P.vector(ball.v,1-slot));
      const cameraSpace=env.O.pos.clone().applyMatrix4(env.camera.matrixWorldInverse);
      const before=env.draws;vm.runInContext('paintOpponent(null)',env);
      if(cameraSpace.z>=0){behind++;assert.equal(env.draws,before,`No mirrored canvas character behind camera: ${w}x${h}, slot ${slot}`);}
      if(env.O.pos.z<0&&cameraSpace.z<-P.R-env.camera.near){approaching++;assert.equal(env.draws,before+1,'Approaching character remains drawn');}
    }
    assert(approaching>0&&behind>0,'Replay crosses the camera plane');
    env.O.pos.set(0,P.R,-20);const before=env.draws;vm.runInContext('paintOpponent(null)',env);
    assert.equal(env.draws,before+1,'Opponent is visible again at the starting position after reset');
  }
});
