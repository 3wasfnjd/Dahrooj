// Quest VR/AR on Meta's emulator (IWER): enter, grab and throw, the in-headset menu,
// padel swings, AR scale, and a Duel shot accepted by the server.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {startLocal} from '../server/local.mjs';
const require=createRequire(import.meta.url);
const iwer=readFileSync(require.resolve('iwer/build/iwer.min.js'),'utf8');
const app=await startLocal({port:0,transformHTML:html=>html
  .replace('reducedMotion:reduce,onInteract:ensureAudio','reducedMotion:true,onInteract:ensureAudio')
  .replace('return {update:update3,render:render3,resize:resize3,setStage,leaveStage,get xr(){return xr;}};',
    'window.__g={S,get stage(){return stage;},get stageName(){return stageName;},get xr(){return xr;},scene};return {update:update3,render:render3,resize:resize3,setStage,leaveStage,get xr(){return xr;}};')
  .replace('grp,aimZ:OZ,networked:true,','grp,aimZ:OZ,networked:true,testClient:client,')});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  ...(process.env.DAHROOJ_CHROMIUM?{executablePath:process.env.DAHROOJ_CHROMIUM}:{})});
const errors=[];let checks=0;
const check=(ok,label)=>{assert(ok,label);checks++;};
try{
  const context=await browser.newContext({viewport:{width:900,height:600}});
  // Install the emulated Quest 3 over Chromium's own WebXR.
  await context.addInitScript(iwer+';window.__dev=new IWER.XRDevice(IWER.metaQuest3);window.__dev.installRuntime({forceInstall:true});');
  const p=await context.newPage();p.on('pageerror',e=>errors.push(String(e)));
  await p.goto(app.url);
  await p.waitForFunction(()=>!document.getElementById('start-play').hidden,null,{timeout:15000});
  await p.evaluate(()=>document.getElementById('start-play').click());
  await p.waitForFunction(()=>!document.getElementById('btn-vr').hidden&&!document.getElementById('btn-ar').hidden,null,{timeout:5000});
  check(true,'VR and AR buttons appear on a headset');
  const state=()=>p.evaluate(()=>{const g=window.__g,S=g.S;return {presenting:g.xr.presenting,kind:g.xr.kind,mode:g.stageName,shot:S.shot,held:!!S.held};});
  const right=fn=>p.evaluate(fn);
  const trigger=v=>p.evaluate(v=>window.__dev.controllers.right.updateButtonValue('trigger',v),v);
  const settle=()=>p.waitForFunction(()=>{const S=window.__g.S;return !S.shot&&S.grounded&&!S.held;},null,{timeout:8000});
  async function pick(u,v){
    // Point the right controller at a spot on the menu and pull the trigger.
    await p.evaluate(([u,v])=>{
      const T=THREE,rig=window.__g.scene.getObjectByName('xr-rig');
      const o=new T.Object3D();o.position.set(-.48,.98,-.4);o.rotation.set(-.55,Math.PI/4,0,'YXZ');rig.add(o);o.updateMatrixWorld(true);
      const local=rig.worldToLocal(o.localToWorld(new T.Vector3((u-.5)*.62,(.5-v)*.36,0)));rig.remove(o);
      const eye=new T.Vector3(.15,1.25,-.05),q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(eye,local,new T.Vector3(0,1,0)));
      const c=window.__dev.controllers.right;c.position.set(eye.x,eye.y,eye.z);c.quaternion.set(q.x,q.y,q.z,q.w);
    },[u,v]);
    await p.waitForTimeout(250);await trigger(1);await p.waitForTimeout(150);await trigger(0);await p.waitForTimeout(250);
  }
  async function throwBall(){
    await right(()=>{const c=window.__dev.controllers.right;c.position.set(.2,1.2,-.3);c.quaternion.set(0,0,0,1);});
    await p.waitForTimeout(200);await trigger(1);await p.waitForTimeout(300);
    const held=await p.evaluate(()=>!!window.__g.S.held);
    for(let i=1;i<=8;i++){await p.evaluate(i=>window.__dev.controllers.right.position.set(.2,1.2+i*.08,-.3-i*.18),i);await p.waitForTimeout(14);}
    await trigger(0);await p.waitForTimeout(80);
    return held;
  }

  await p.evaluate(()=>document.getElementById('btn-vr').click());
  await p.waitForFunction(()=>window.__g?.xr?.presenting,null,{timeout:8000});
  let s=await state();check(s.kind==='immersive-vr'&&s.mode==='goal','VR starts in a 3D mode');
  check(await p.evaluate(()=>window.__g.scene.background!==null),'VR shows the paper world');
  await settle();
  check(await throwBall(),'The trigger takes Dahrooj into the hand');
  s=await state();check(s.shot&&!s.held,'Letting go throws with the hand velocity');
  const v=await p.evaluate(()=>window.__g.S.vel.toArray());check(v[2]<-3&&v[1]>0,'The throw goes forward and up');

  await pick(264/1024,150/594);check((await state()).mode==='hoop','The menu switches to hoop');
  await pick((24+3*197+92)/1024,345/594);
  check(await p.evaluate(()=>document.querySelector('[data-style][aria-pressed="true"]').dataset.style)==='fur','The menu switches the style');
  await settle();const heldHoop=await throwBall();const hoopState=await state();check(heldHoop&&hoopState.shot,'Throwing works in hoop '+JSON.stringify({heldHoop,hoopState,inspect:await p.evaluate(()=>window.__g.xr.inspect())}));

  await pick((24+3*164+76)/1024,150/594);check((await state()).mode==='padel','The menu switches to padel');
  await settle();
  await right(()=>{const c=window.__dev.controllers.right;c.position.set(.25,1,.2);c.quaternion.set(0,0,0,1);});await p.waitForTimeout(300);
  for(let i=1;i<=6;i++){await p.evaluate(i=>window.__dev.controllers.right.position.set(.25,1,.2-i*.25),i);await p.waitForTimeout(14);}
  await p.waitForFunction(()=>window.__g.S.shot,null,{timeout:3000});
  check(await p.evaluate(()=>window.__g.S.vel.z<-3),'A forward swing serves in padel');

  await pick(100/1024,518/594);
  await p.waitForFunction(()=>!window.__g.xr.presenting,null,{timeout:5000});
  check(true,'The exit button ends the session');

  await p.evaluate(()=>document.getElementById('btn-ar').click());
  await p.waitForFunction(()=>window.__g?.xr?.presenting,null,{timeout:8000});
  check((await state()).kind==='immersive-ar','AR starts');
  check(await p.evaluate(()=>window.__g.scene.getObjectByName('xr-rig').scale.x===5&&window.__g.scene.background===null),'AR shows the room with the court at a fifth');
  await p.evaluate(()=>window.__dev.activeSession.end());
  await p.waitForFunction(()=>!window.__g.xr.presenting,null,{timeout:5000});

  // Duel against the server: the swing becomes a shot the server accepts.
  await p.evaluate(()=>document.querySelector('[data-mode="opponent"]').click());
  await p.waitForFunction(()=>window.__g.stage.testClient?.state,null,{timeout:15000});
  await p.evaluate(()=>document.getElementById('btn-vr').click());
  await p.waitForFunction(()=>window.__g.xr.presenting&&window.__g.stage.testClient.canShoot(),null,{timeout:15000});
  const own=()=>p.evaluate(()=>{const c=window.__g.stage.testClient;return c.state.balls[c.slot];});
  const before=(await own()).seq;
  await right(()=>{const c=window.__dev.controllers.right;c.position.set(.2,1.2,-.3);c.quaternion.set(0,0,0,1);});
  await p.waitForTimeout(200);await trigger(1);await p.waitForTimeout(250);
  for(let i=1;i<=8;i++){await p.evaluate(i=>window.__dev.controllers.right.position.set(.2,1.2+i*.06,-.3-i*.2),i);await p.waitForTimeout(14);}
  await trigger(0);
  await p.waitForFunction(seq=>{const c=window.__g.stage.testClient,b=c.state.balls[c.slot];return b.seq>seq&&b.shot;},before,{timeout:3000});
  check(true,'A Duel swing is accepted by the server');
  check(await p.evaluate(()=>window.__g.xr.inspect().every(h=>h.connected)),'Both controllers are tracked');
  check(errors.length===0,'No page errors: '+errors.join(' | '));
  console.log(`PASS ${checks} Quest VR/AR checks on the IWER Quest 3 emulator.`);
}finally{
  await browser.close();app.close();
}
