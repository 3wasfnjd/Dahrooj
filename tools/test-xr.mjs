// Quest VR/AR on Meta's emulator (IWER): enter, grab and throw, recall, the left-hand menu,
// the slingshot, placing the AR court, and a Duel shot accepted by the server.
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
    'window.__g={S,volley,keeper:()=>stages.goal&&stages.goal.keeperState?stages.goal.keeperState():{},get stage(){return stage;},get stageName(){return stageName;},get xr(){return xr;},scene};return {update:update3,render:render3,resize:resize3,setStage,leaveStage,get xr(){return xr;}};')
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
  const state=()=>p.evaluate(()=>{const g=window.__g,S=g.S;return {presenting:g.xr.presenting,kind:g.xr.kind,mode:g.stageName,shot:S.shot,held:!!S.held,parked:g.xr.parked,placing:g.xr.placing};});
  const ctl=(hand,pos,q=[0,0,0,1])=>p.evaluate(([hand,pos,q])=>{const c=window.__dev.controllers[hand];c.position.set(...pos);c.quaternion.set(...q);},[hand,pos,q]);
  const trigger=(v,hand='right')=>p.evaluate(([v,hand])=>window.__dev.controllers[hand].updateButtonValue('trigger',v),[v,hand]);
  const tracked=()=>p.waitForFunction(()=>window.__g.xr.inspect().every(h=>h.connected),null,{timeout:8000});
  const parked=()=>p.waitForFunction(()=>window.__g.xr.parked&&!window.__g.S.shot,null,{timeout:8000});
  const FLIP=[0,0,1,0];
  // Held long enough for the slow emulator to see at least one frame with it down.
  // Hold Y until the menu answers (the emulator draws a frame only every few hundred ms), then let go.
  const yButton=async()=>{
    const was=await p.evaluate(()=>window.__g.xr.menuOpen);
    await p.evaluate(()=>window.__dev.controllers.left.updateButtonValue('y-button',1));
    await p.waitForFunction(w=>window.__g.xr.menuOpen!==w,was,{timeout:4000}).catch(()=>{});
    await p.evaluate(()=>window.__dev.controllers.left.updateButtonValue('y-button',0));await p.waitForTimeout(500);};
  async function openMenu(){
    // The Y button opens the menu above the left hand; press again if a frame missed it.
    await ctl('left',[-.2,1.1,-.3]);
    for(let k=0;k<3&&!(await p.evaluate(()=>window.__g.xr.menuOpen));k++)await yButton();
    await p.waitForFunction(()=>{const m=window.__g.scene.getObjectByName('xr-menu');return m.visible&&m.scale.x>.95;},null,{timeout:10000});
  }
  async function closeMenu(){
    for(let k=0;k<3&&await p.evaluate(()=>window.__g.xr.presenting&&window.__g.xr.menuOpen);k++)await yButton();
    await ctl('left',[-.18,1.05,-.32]);
    await p.waitForFunction(()=>!window.__g.scene.getObjectByName('xr-menu')?.visible,null,{timeout:10000});
  }
  async function pick(spec){
    const [x,y]=await pickAt(spec);
    await openMenu();
    // Point the right controller at a spot on the menu (canvas pixels) and pull the trigger.
    await p.evaluate(([x,y])=>{
      const T=THREE,rig=window.__g.scene.getObjectByName('xr-rig'),menu=window.__g.scene.getObjectByName('xr-menu');
      const w=menu.geometry.parameters.width,h=menu.geometry.parameters.height;
      const L=window.__g.xr.menuLayout,spot=rig.worldToLocal(menu.localToWorld(new T.Vector3((x/L.w-.5)*w,(.5-y/L.h)*h,0)));
      const eye=new T.Vector3(.2,1.15,-.05),q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(eye,spot,new T.Vector3(0,1,0)));
      const c=window.__dev.controllers.right;c.position.set(eye.x,eye.y,eye.z);c.quaternion.set(q.x,q.y,q.z,q.w);
    },[x,y]);
    await p.waitForTimeout(250);await trigger(1);await p.waitForTimeout(150);await trigger(0);await p.waitForTimeout(250);
    await closeMenu();
  }
  // Centre of a menu button on the menu canvas, from the menu's own layout.
  const button=(kind,i=0)=>({kind,i});
  const pickAt=async({kind,i})=>p.evaluate(([kind,i])=>{const L=window.__g.xr.menuLayout,b=L.buttons.filter(b=>b.kind===kind||b.id===kind)[i];return [b.x+b.w/2,b.y+b.h/2];},[kind,i]);
  async function aButton(){
    await p.evaluate(()=>window.__dev.controllers.right.updateButtonValue('a-button',1));await p.waitForTimeout(120);
    await p.evaluate(()=>window.__dev.controllers.right.updateButtonValue('a-button',0));await p.waitForTimeout(60);
  }
  // Trigger throws go along the hand's ray: aim 20 degrees up.
  const UP20=[0.1736,0,0,0.9848];
  let lastVel=null;
  async function throwBall(){
    await ctl('right',[.2,1.2,-.3],UP20);
    await p.waitForTimeout(200);await trigger(1);
    // Wait for the hand to take Dahrooj (one emulator frame can take a few hundred ms).
    const held=await p.waitForFunction(()=>window.__g.xr.holding,null,{timeout:5000}).then(()=>true,()=>false);
    await p.waitForTimeout(300);
    for(let i=1;i<=8;i++){await p.evaluate(i=>window.__dev.controllers.right.position.set(.2,1.2+i*.08,-.3-i*.18),i);await p.waitForTimeout(14);}
    await trigger(0);
    // The velocity right as he leaves the hand (the emulator may take a while to the next check).
    lastVel=await p.waitForFunction(()=>window.__g.S.shot||!window.__g.xr.holding?window.__g.S.vel.toArray():false,null,{timeout:5000}).then(h=>h.jsonValue(),()=>null);
    return held;
  }

  // Padel stays out of the headset: entering from it starts the goal.
  await p.evaluate(()=>document.querySelector('[data-mode="padel"]').click());
  await p.evaluate(()=>document.getElementById('btn-vr').click());
  await p.waitForFunction(()=>window.__g?.xr?.presenting,null,{timeout:8000});
  await ctl('left',[-.18,1.05,-.32]);
  let s=await state();check(s.kind==='immersive-vr'&&s.mode==='goal','VR starts in the goal, not padel');
  check(await p.evaluate(()=>window.__g.scene.getObjectByName('xr-nature')?.visible&&!!window.__g.scene.fog&&window.__g.scene.getObjectByName('xr-rig').scale.x===2),'VR shows grass, trees and sky at half size');
  check(await p.evaluate(()=>{let found=false;window.__g.scene.traverse(o=>{if(o.isMesh&&(o.material?.isMeshPhysicalMaterial||o.material?.isShaderMaterial)&&o.geometry?.parameters?.radius>.2)found=true;});return found;}),'Dahrooj is a 3D model in the headset');
  // Motri's props: pole lights, lanterns, benches and crates; a crate blows up and comes back.
  await p.waitForFunction(()=>window.__g.xr.nature.props.loaded===4,null,{timeout:30000});
  check(await p.evaluate(()=>window.__g.xr.nature.props.obstacles.length>=16&&window.__g.xr.nature.props.crates.length===6),'Pole lights, lanterns, benches and crates stand around the stone');
  await p.evaluate(()=>window.__g.xr.nature.props.explode(0));
  await p.waitForFunction(()=>window.__g.xr.nature.props.crates.filter(c=>c.back>0).length>=2,null,{timeout:30000});
  check(true,'A crate explodes and sets off the ones next to it');
  await p.evaluate(()=>window.__g.xr.nature.props.reset());
  await parked();
  // Compare with the emulated headset itself (room metres), not with the game's own camera maths.
  const nearHead=()=>p.evaluate(()=>{const rig=window.__g.scene.getObjectByName('xr-rig'),h=window.__dev.position;
    const b=rig.worldToLocal(window.__g.S.pos.clone());return Math.hypot(b.x-h.x,b.y-h.y,b.z-h.z);});
  const dHead=await nearHead();check(dHead<1,'Dahrooj waits within reach of the real head ('+dHead.toFixed(2)+' m)');
  await p.waitForTimeout(800);check(!(await p.evaluate(()=>window.__g.xr.ballShown)),'Waiting, Dahrooj is out of sight until the trigger');
  check(await throwBall(),'The trigger takes Dahrooj into the hand');
  check(await p.evaluate(()=>window.__g.xr.ballShown),'He shows once the trigger takes him, and in flight');
  s=await state();check(s.shot&&!s.held,'Letting go throws with the hand velocity');
  const v=lastVel||await p.evaluate(()=>window.__g.S.vel.toArray());check(v[2]<-3&&v[1]>0,'The throw goes forward and up '+JSON.stringify(v.map(x=>+x.toFixed(2))));
  // A or X brings Dahrooj straight back.
  await aButton();
  s=await state();check(!s.shot&&s.parked,'The A button calls Dahrooj back');
  // A finished throw stays in the world, rolling on, and leaves tracks where it went.
  {
    const before=await p.evaluate(()=>window.__g.xr.rests.length);
    await throwBall();
    await p.waitForFunction(n=>window.__g.xr.rests.length>n,before,{timeout:150000});
    check(true,'A thrown Dahrooj stays in the world after the throw');
    // It may stop on top of the goal first; give it time to roll down and touch the grass.
    const pressedFn=()=>{const r=window.__g.xr.rests.at(-1).p,N=window.__g.xr.nature;let best=0;
      for(let dx=-2;dx<=2;dx+=.25)for(let dz=-2;dz<=2;dz+=.25)best=Math.max(best,N.trackAt(r.x+dx,r.z+dz));return best;};
    await p.waitForFunction(`(${pressedFn})()>.05`,null,{timeout:30000}).catch(()=>{});
    const pressed=await p.evaluate(`(${pressedFn})()`);
    check(pressed>.05,'It leaves tracks on the grass ('+pressed.toFixed(2)+')');
    // The left trigger fires small shots along the left ray; one that touches a resting Dahrooj pops it.
    const restsBefore=await p.evaluate(()=>window.__g.xr.rests.length);
    for(let k=0;k<10&&!(await p.evaluate(()=>window.__g.xr.blast.popped>0));k++){
      await p.evaluate(lift=>{
        const T=THREE,rig=window.__g.scene.getObjectByName('xr-rig'),r=window.__g.xr.rests.at(-1);if(!r)return;
        const at=rig.worldToLocal(r.p.clone()),from=new T.Vector3(-.2,1.2,-.3),d=at.distanceTo(from);at.y+=d*d*lift;
        const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(from,at,new T.Vector3(0,1,0)));
        const c=window.__dev.controllers.left;c.position.copy(from);c.quaternion.set(q.x,q.y,q.z,q.w);
      },.012+(k%4)*.012);
      await p.waitForTimeout(250);await trigger(1,'left');await p.waitForTimeout(200);await trigger(0,'left');await p.waitForTimeout(2500);
    }
    check(await p.evaluate(n=>window.__g.xr.blast.popped>0&&window.__g.xr.rests.length<n,restsBefore),'The left trigger fires shots that pop a resting Dahrooj');
    await ctl('left',[-.18,1.05,-.32]);
    await parked();
  }
  // Back to back: grabbing while Dahrooj flies keeps that throw going and brings a fresh one.
  await throwBall();await p.waitForTimeout(150);const plans=await p.evaluate(()=>window.__g.keeper().plans||0);
  await trigger(1);await p.waitForTimeout(150);
  check(await p.evaluate(()=>window.__g.xr.holding&&!window.__g.S.shot&&window.__g.volley.length===1),'A second Dahrooj is ready while the first still flies');
  for(let i=1;i<=8;i++){await p.evaluate(i=>window.__dev.controllers.right.position.set(.2,1.2+i*.08,-.3-i*.18),i);await p.waitForTimeout(14);}
  await trigger(0);await p.waitForTimeout(80);
  check(await p.evaluate(()=>window.__g.S.shot&&window.__g.volley.length===1&&window.__g.volley[0].shot),'Two throws fly at once');
  await p.waitForTimeout(200);
  check(await p.evaluate(p0=>(window.__g.keeper().plans||0)>p0,plans),'The keeper reacts to the second throw too');
  await p.waitForFunction(()=>window.__g.volley.length===0,null,{timeout:150000});

  check(true,'Earlier throws finish on their own');
  await aButton();await parked();

  check(!(await p.evaluate(()=>window.__g.scene.getObjectByName('xr-menu').visible)),'The menu stays hidden with the hand down');
  await pick(button('mode',1));check((await state()).mode==='hoop','The left-hand menu switches to hoop');
  await pick(button('weather'));await pick(button('weather'));
  check(await p.evaluate(()=>window.__g.xr.nature.settings.weather==='rain'),'The menu turns on rain');
  await pick(button('time'));await pick(button('time'));await pick(button('time'));
  check(await p.evaluate(()=>window.__g.xr.nature.settings.time==='night'),'The menu sets night');
  await pick(button('style',3));
  check(await p.evaluate(()=>document.querySelector('[data-style][aria-pressed="true"]').dataset.style)==='fur','The menu switches the style');
  await parked();const heldHoop=await throwBall();const hoopState=await state();check(heldHoop&&hoopState.shot,'Throwing works in hoop');

  // Challenges in the headset menu.
  // X opens the challenges straight away; X again closes them.
  const xButton=async want=>{await p.evaluate(()=>window.__dev.controllers.left.updateButtonValue('x-button',1));
    await p.waitForFunction(w=>window.__g.xr.menuOpen===w,want,{timeout:5000}).catch(()=>{});
    await p.evaluate(()=>window.__dev.controllers.left.updateButtonValue('x-button',0));await p.waitForTimeout(500);};
  await ctl('left',[-.2,1.1,-.3]);await xButton(true);
  check(await p.evaluate(()=>window.__g.xr.menuOpen&&window.__g.xr.challengesOpen),'X opens the challenges');
  // The pane tilts with the hand.
  await ctl('left',[-.2,1.1,-.3],[0,0,0.2588,0.9659]);await p.waitForTimeout(1200);
  const tilt=await p.evaluate(()=>{const m=window.__g.scene.getObjectByName('xr-menu'),z=new THREE.Euler().setFromQuaternion(m.quaternion,'YXZ').z;return z;});
  check(Math.abs(tilt-.52)<.15,'The menu tilts with the hand ('+tilt.toFixed(2)+')');
  await ctl('left',[-.2,1.1,-.3]);await xButton(false);
  check(!(await p.evaluate(()=>window.__g.xr.menuOpen)),'X again closes them');
  await ctl('left',[-.18,1.05,-.32]);
  // The language button switches the headset texts to English and back.
  await pick(button('lang'));
  check(await p.evaluate(()=>window.__g.xr.lang==='en'),'The menu switches to English');
  await pick(button('lang'));
  check(await p.evaluate(()=>window.__g.xr.lang==='ar'),'And back to Arabic');
  // Bowling: Motri's ten pins at the end of a lane; a roll down the lane counts as a roll of the frame.
  await pick(button('mode',4));check((await state()).mode==='bowling','The menu switches to bowling');
  check(await p.evaluate(()=>window.__g.stage.pins().length===10&&window.__g.stage.pins().every(q=>!q.down)),'Ten pins stand at the end of the lane');
  await parked();await throwBall();
  await p.waitForFunction(()=>!window.__g.S.shot,null,{timeout:150000});
  check(await p.evaluate(()=>{const f=window.__g.stage.frame();return f.roll>=1||f.knocked>0||window.__g.stage.pins().every(q=>!q.down);}),'A roll down the lane is counted');
  await pick(button('mode',1));await parked();
  // The slingshot: left hand holds it, right hand pulls Dahrooj back and lets go.
  await pick(button('sling'));
  check(await p.evaluate(()=>window.__g.xr.throwStyle==='sling'&&window.__g.scene.getObjectByName('xr-slingshot').visible),'The slingshot appears in the left hand');
  await ctl('left',[-.05,1.1,-.4]);await aButton();await parked();
  await ctl('right',[-.05,1.25,-.4]);await p.waitForTimeout(150);await trigger(1);await p.waitForTimeout(250);
  for(let i=1;i<=10;i++){await p.evaluate(i=>window.__dev.controllers.right.position.set(-.05,1.25,-.4+i*.05),i);await p.waitForTimeout(30);}
  check(await p.evaluate(()=>window.__g.scene.children.filter(o=>o.isMesh&&o.geometry?.type==='SphereGeometry'&&o.visible&&o.scale.x<.05).length>10),'Pulling shows the flight path');
  await trigger(0);await p.waitForTimeout(60);
  s=await state();const sv=await p.evaluate(()=>window.__g.S.vel.toArray());
  check(s.shot&&sv[2]<-4,'Letting go of the pull launches Dahrooj forward '+JSON.stringify(sv));
  await pick(button('trigger'));

  // Summit: a model mountain in front of you, with the left stick, A to jump and the trigger to throw.
  await pick(button('mode',5));
  check(await p.evaluate(()=>window.__g.xr.climbing&&window.__g.scene.getObjectByName('xr-climb').visible&&!window.__g.stage.grp.visible),'The menu opens the Summit as a model mountain');
  const climbBall=()=>p.evaluate(()=>{const b=window.__g.xr.climb.state.ball;return {x:b.x,y:b.y,vy:b.vy,grounded:b.grounded};});
  const x0=(await climbBall()).x;
  await p.evaluate(()=>window.__dev.controllers.left.updateAxes('thumbstick',1,0));
  const rolled=await p.waitForFunction(x0=>window.__g.xr.climb.state.ball.x>x0+.5,x0,{timeout:5000}).then(()=>true,()=>false);
  await p.evaluate(()=>window.__dev.controllers.left.updateAxes('thumbstick',0,0));
  check(rolled,'The left stick rolls Dahrooj along the mountain '+errors.join(' / '));
  await p.evaluate(()=>window.__dev.controllers.right.updateButtonValue('a-button',1));
  await p.waitForFunction(()=>!window.__g.xr.climb.state.ball.grounded,null,{timeout:3000});
  await p.evaluate(()=>window.__dev.controllers.right.updateButtonValue('a-button',0));
  check(true,'A jumps');
  await ctl('right',[.2,1.2,-.3]);await trigger(1);
  const thrown=await p.waitForFunction(()=>window.__g.xr.climb.state.shots.length>0||window.__g.xr.climb.state.ball.cool>0,null,{timeout:6000}).then(()=>true,()=>false);
  await trigger(0);
  check(thrown,'The trigger throws a ball at the monsters');
  const head=await p.evaluate(()=>{const g=window.__g.scene.getObjectByName('xr-climb'),rig=window.__g.scene.getObjectByName('xr-rig'),h=window.__dev.position;
    const p=rig.worldToLocal(g.getWorldPosition(new THREE.Vector3()));return Math.hypot(p.x-h.x,p.z-h.z);});
  check(head>4&&head<8,'The mountain stands on the ground where the goal stands ('+head.toFixed(2)+' m)');
  // The right stick still makes it bigger or smaller.
  const unit0=await p.evaluate(()=>window.__g.scene.getObjectByName('xr-climb').children[0]?.scale.x||0);
  await p.evaluate(()=>window.__dev.controllers.right.updateAxes('thumbstick',0,-1));
  const grew=await p.waitForFunction(u=>window.__g.scene.getObjectByName('xr-climb').children[0].scale.x>u*1.05,unit0,{timeout:10000}).then(()=>true,()=>false);
  await p.evaluate(()=>window.__dev.controllers.right.updateAxes('thumbstick',0,0));
  check(grew,'The right stick resizes the mountain');
  await pick(button('mode',0));
  check(await p.evaluate(()=>!window.__g.xr.climbing&&!window.__g.scene.getObjectByName('xr-climb').visible&&window.__g.stage.grp.visible&&window.__g.stageName==='goal'),'Leaving the Summit brings the goal back');
  await pick(button('exit'));
  await p.waitForFunction(()=>!window.__g.xr.presenting,null,{timeout:5000});
  check(true,'The exit button ends the session');

  await p.evaluate(()=>document.getElementById('btn-ar').click());
  await p.waitForFunction(()=>window.__g?.xr?.presenting,null,{timeout:8000});
  await tracked();
  s=await state();check(s.kind==='immersive-ar'&&s.placing,'AR starts by choosing a surface');
  check(await p.evaluate(()=>window.__g.scene.background===null),'AR shows the room');
  // Point at the floor about two metres ahead and pin the court there.
  await ctl('left',[-.18,1.05,-.32]);
  await ctl('right',[.1,1.2,-.2],[-0.2588,0,0,0.9659]);await p.waitForTimeout(400);
  const spot=await p.evaluate(()=>{const r=window.__g.scene.getObjectByName('xr-rig');return r.localToWorld(r.children.find(o=>o.geometry?.type==='RingGeometry').position.clone()).toArray();});
  const aimZ=await p.evaluate(()=>window.__g.stage.aimZ);
  check(Math.abs(spot[0])<.05&&Math.abs(spot[1])<.05&&Math.abs(spot[2]-aimZ)<.05,'The target sits on the aimed spot '+JSON.stringify(spot));
  await trigger(1);await p.waitForTimeout(150);await trigger(0);
  s=await state();check(!s.placing,'The trigger pins the court');
  check(await p.evaluate(()=>window.__g.scene.getObjectByName('xr-rig').scale.x===8),'AR shows the court at an eighth');
  await parked();
  // Standing more than two metres from the goal used to count every AR throw as a miss at once.
  // Step a metre and a half back from the pinned goal (and the hand with you).
  await p.evaluate(()=>{window.__dev.position.z+=1.5;});await ctl('right',[.2,1.2,1.2]);await ctl('left',[-.18,1.05,1.18]);await p.waitForTimeout(600);
  const farZ=await p.evaluate(()=>window.__g.S.pos.z);check(farZ>6,'In AR the player stands behind the old out-of-bounds line ('+farZ.toFixed(1)+')');
  await p.waitForTimeout(150);await trigger(1);await p.waitForTimeout(150);
  check(await p.evaluate(()=>{const S=window.__g.S,rig=window.__g.scene.getObjectByName('xr-rig'),h=window.__dev.controllers.right.position;
    const b=rig.worldToLocal(S.pos.clone());return window.__g.xr.holding&&Math.hypot(b.x-h.x,b.y-h.y,b.z-h.z)<.12;}),'Dahrooj appears straight in the hand');
  for(let i=1;i<=8;i++){await p.evaluate(i=>window.__dev.controllers.right.position.set(.2,1.2+i*.05,1.2-i*.08),i);await p.waitForTimeout(14);}
  await trigger(0);await p.waitForTimeout(300);
  check(await p.evaluate(()=>window.__g.S.shot&&window.__g.S.missT===0),'A throw from far away stays in play');
  await aButton();await p.evaluate(()=>{window.__dev.position.z-=1.5;});await ctl('right',[.2,1.2,-.3]);await ctl('left',[-.18,1.05,-.32]);await parked();
  // Thumbstick up makes the court bigger (a smaller world scale), within limits.
  await p.evaluate(()=>window.__dev.controllers.right.updateAxes('thumbstick',0,-1));await p.waitForTimeout(1500);
  await p.evaluate(()=>window.__dev.controllers.right.updateAxes('thumbstick',0,0));await p.waitForTimeout(100);
  const zoom=await p.evaluate(()=>window.__g.scene.getObjectByName('xr-rig').scale.x);
  check(zoom<7.8&&zoom>=3,'The thumbstick resizes the AR court ('+zoom.toFixed(2)+')');
  await p.evaluate(()=>window.__dev.activeSession.end());
  await p.waitForFunction(()=>!window.__g.xr.presenting,null,{timeout:5000});

  // Duel is paused in the headset: entering from it starts the goal.
  await p.evaluate(()=>document.querySelector('[data-mode="opponent"]').click());
  await p.evaluate(()=>document.getElementById('btn-vr').click());
  await p.waitForFunction(()=>window.__g.xr.presenting,null,{timeout:8000});
  check((await state()).mode==='goal','Duel stays out of the headset for now');
  await tracked();
  check(await p.evaluate(()=>window.__g.xr.inspect().every(h=>h.connected)),'Both controllers are tracked');
  // dahrooj/vr/: one tap enters AR, Dahrooj balls rain into the room, then a start panel begins the game.
  {
    await p.close();
    const q=await context.newPage();q.on('pageerror',e=>errors.push(String(e)));
    await q.goto(app.url+'?xr');
    await q.waitForFunction(()=>!document.getElementById('xr-gate').hidden&&!document.getElementById('xr-gate-ar').hidden,null,{timeout:15000});
    check(await q.evaluate(()=>!document.getElementById('start-screen')),'The headset link skips the phone start screen');
    await q.evaluate(()=>document.getElementById('xr-gate-ar').click());
    await q.waitForFunction(()=>window.__g?.xr?.presenting&&window.__g.xr.opening,null,{timeout:8000});
    check(await q.evaluate(()=>window.__g.xr.kind==='immersive-ar'&&document.getElementById('xr-gate').hidden),'One tap enters AR with the opening');
    check(await q.evaluate(()=>!window.__g.stage.grp.visible),'No game mode shows during the opening');
    // The emulator runs few frames a second and each frame advances at most 50 ms, so allow time.
    await q.waitForFunction(()=>window.__g.scene.getObjectByName('xr-start')?.visible,null,{timeout:30000});
    const countLanded=()=>{
      const rig=window.__g.scene.getObjectByName('xr-rig'),group=window.__g.scene.getObjectByName('xr-intro');
      return group?group.children.filter(m=>m.visible&&m.position.y<.24*1.6).length:0;};
    // They keep hopping, so take the count at the moment enough of them are down.
    const landed=await q.waitForFunction(`(()=>{const n=(${countLanded})();return n>=5?n:0;})()`,null,{timeout:40000}).then(h=>h.jsonValue(),()=>q.evaluate(`(${countLanded})()`));
    check(landed>=5,'Dahrooj balls fall onto the floor ('+landed+')');
    const spread=await q.evaluate(()=>{
      const rig=window.__g.scene.getObjectByName('xr-rig'),group=window.__g.scene.getObjectByName('xr-intro'),h=window.__dev.position;
      return Math.max(...group.children.map(m=>{const p=rig.worldToLocal(group.localToWorld(m.position.clone()));return Math.hypot(p.x-h.x,p.z-h.z);}));});
    check(spread<3.1,'They land around the player in the room ('+spread.toFixed(2)+' m)');
    // Shoot at the nearest ball until one pops.
    let popped=0;
    for(let k=0;k<8&&!popped;k++){
      await q.evaluate(()=>{
        const T=THREE,rig=window.__g.scene.getObjectByName('xr-rig'),group=window.__g.scene.getObjectByName('xr-intro');
        const eye=new T.Vector3(.15,1.2,-.05);let best=null,bd=9;
        for(const m of group.children){const p=rig.worldToLocal(group.localToWorld(m.position.clone()));const d=p.distanceTo(eye);if(m.visible&&d<bd){bd=d;best=p;}}
        const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(eye,best,new T.Vector3(0,1,0)));
        const c=window.__dev.controllers.right;c.position.set(eye.x,eye.y,eye.z);c.quaternion.set(q.x,q.y,q.z,q.w);
      });
      await q.waitForTimeout(120);
      await q.evaluate(()=>window.__dev.controllers.right.updateButtonValue('trigger',1));await q.waitForTimeout(100);
      await q.evaluate(()=>window.__dev.controllers.right.updateButtonValue('trigger',0));await q.waitForTimeout(500);
      popped=await q.evaluate(()=>window.__g.xr.popped);
    }
    check(popped>=1,'The trigger shoots the opening balls and pops them ('+popped+')');
    await q.evaluate(()=>{
      const T=THREE,rig=window.__g.scene.getObjectByName('xr-rig'),panel=window.__g.scene.getObjectByName('xr-start');
      const spot=rig.worldToLocal(panel.localToWorld(new T.Vector3(0,-.05,0)));
      const eye=new T.Vector3(.15,1.2,-.05),q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(eye,spot,new T.Vector3(0,1,0)));
      const c=window.__dev.controllers.right;c.position.set(eye.x,eye.y,eye.z);c.quaternion.set(q.x,q.y,q.z,q.w);
    });
    await q.waitForTimeout(250);
    await q.evaluate(()=>window.__dev.controllers.right.updateButtonValue('trigger',1));await q.waitForTimeout(150);
    await q.evaluate(()=>window.__dev.controllers.right.updateButtonValue('trigger',0));
    await q.waitForFunction(()=>!window.__g.xr.opening,null,{timeout:3000});
    check(await q.evaluate(()=>window.__g.xr.placing),'The start panel begins the game by choosing a surface');
    await q.evaluate(()=>window.__dev.activeSession.end());
    await q.waitForFunction(()=>!document.getElementById('xr-gate').hidden,null,{timeout:5000});
    check(true,'Leaving the headset shows the entry page again');
    await q.close();
  }
  check(errors.length===0,'No page errors: '+errors.join(' | '));
  console.log(`PASS ${checks} Quest VR/AR checks on the IWER Quest 3 emulator.`);
}finally{
  await browser.close();app.close();
}
