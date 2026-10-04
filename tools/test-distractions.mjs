import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {startLocal} from '../server/local.mjs';
const app=await startLocal({port:0,transformHTML:s=>s
  .replace('grp,aimZ:OZ,networked:true,','grp,aimZ:OZ,networked:true,testClient:client,testDistractions:distractions,')
  .replace('return {update:update3,render:render3,resize:resize3,setStage,leaveStage};','window.__game={S,aim,toScreen,get stage(){return stage;}};return {update:update3,render:render3,resize:resize3,setStage,leaveStage};')
  .replace('reducedMotion:reduce,onInteract:ensureAudio','reducedMotion:true,onInteract:ensureAudio')});
const browser=await chromium.launch({headless:true,...(process.env.DAHROOJ_CHROMIUM?{executablePath:process.env.DAHROOJ_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];app.engine.random=()=>.95;
async function open(){
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await context.route('**/*',r=>r.request().url().startsWith(app.url+'/')?r.continue():r.abort());
 await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
 const p=await context.newPage();p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(app.url);await p.locator('#start-play').tap();await p.locator('[data-mode="opponent"]').tap();return p;
}
try{
 const a=await open();assert.equal(await a.locator('.duel-distractions').isVisible(),false);
 const b=await open();await b.locator('.duel-distractions').waitFor({state:'visible'});
 await a.waitForFunction(()=>window.__game.stage.testClient.canShoot());
 assert.equal(await a.locator('.duel-distractions').isVisible(),false);
 const session=await b.context().newCDPSession(b);
 const touch=(type,p)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x:p.x,y:p.y,id:1,radiusX:6,radiusY:6,force:1}]});
 for(const p of [a,b]){
   assert.equal(await p.locator('.duel-health [role="progressbar"]').count(),2);
   const layout=await p.evaluate(()=>{const icon=document.querySelector('#count small').getBoundingClientRect(),bars=document.querySelector('.duel-health').getBoundingClientRect();return {below:bars.top>icon.bottom,width:bars.width,text:document.querySelector('.duel-health').textContent};});
   assert(layout.below);assert.equal(layout.text,'');
 }
 await b.screenshot({path:'test-results/duel-distractions-controls.png'});
 for(const kind of ['can','bottle','balloon']){
   const box=await b.locator(`[data-distraction="${kind}"]`).boundingBox();
   const target=await b.evaluate(()=>window.__game.toScreen(new THREE.Vector3(0,.35,-20)));
   await touch('touchStart',{x:box.x+box.width/2,y:box.y+box.height/2});
   await touch('touchMove',target);await touch('touchEnd');
   await a.waitForFunction(kind=>window.__game.stage.testDistractions.items.some(i=>i.kind===kind&&i.incoming),kind);
   assert.equal(await b.evaluate(()=>window.__game.aim.down),false);
   assert.equal(await a.evaluate(()=>window.__game.stage.testClient.canShoot()),true);
   await a.waitForTimeout(850);await a.screenshot({path:`test-results/duel-distraction-${kind}.png`});
   await a.waitForFunction(()=>window.__game.stage.testDistractions.items.length===0);
   const expected=100-20*(['can','bottle','balloon'].indexOf(kind)+1);
   for(const p of [a,b])assert.equal(await p.evaluate(()=>window.__game.stage.testClient.state.health[0]),expected);
 }
 // A tap must use a random server direction, not the opponent's location.
 await b.locator('[data-distraction="can"]').tap();
 await a.waitForFunction(()=>window.__game.stage.testDistractions.items.some(i=>i.kind==='can'));
 await a.waitForFunction(()=>window.__game.stage.testDistractions.items.length===0);
 assert.equal(await a.evaluate(()=>window.__game.stage.testClient.state.health[0]),40);
 // Drag the waiting player's actual body to dodge; no extra controls or shot.
 const move=await b.evaluate(()=>{const g=window.__game;return [g.toScreen(g.S.pos),g.toScreen(g.S.pos.clone().add(new THREE.Vector3(.9,0,0)))];});
 await touch('touchStart',move[0]);await touch('touchMove',move[1]);await touch('touchEnd');
 await b.waitForFunction(()=>window.DahroojDuelPhysics.position(window.__game.stage.testClient.state.balls[1].p,1)[0]>.7);
 await a.waitForFunction(()=>window.__game.stage.testClient.state.balls[1].p[0]<-.7);
 assert.equal(await b.evaluate(()=>window.__game.stage.testClient.state.balls[1].shot),false);
 await b.screenshot({path:'test-results/duel-movement-health.png'});
 for(const [width,height] of [[320,568],[844,390]]){
  await b.setViewportSize({width,height});
  const r=await b.evaluate(()=>{const a=document.querySelector('.duel-distractions').getBoundingClientRect(),s=document.querySelector('.styles').getBoundingClientRect();return {ok:a.left>=0&&a.right<=innerWidth&&a.top>=0&&a.bottom<=innerHeight,overlap:a.left<s.right&&a.right>s.left&&a.top<s.bottom&&a.bottom>s.top};});
  assert(r.ok);assert(!r.overlap);
 }
 await a.evaluate(()=>window.__game.stage.testClient.shoot({target:[0,.35,-20],flight:.8,curve:0}));
 await a.locator('.duel-distractions').waitFor({state:'visible'});
 assert.equal(await b.locator('.duel-distractions').isVisible(),false);
 assert.equal(await b.evaluate(()=>window.__game.stage.testClient.state.health[1]),100,'Sideways movement avoids the center shot');
 await a.locator('[data-distraction="balloon"]').tap();
 await b.waitForFunction(()=>window.__game.stage.testDistractions.items.some(i=>i.incoming));
 await a.locator('[data-mode="cans"]').tap();assert.equal(await a.locator('.duel-distractions').isVisible(),false);
 await b.locator('.duel-distractions').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);console.log('PASS: directed and random throws, defender movement and dodging, health HUD, both browsers, mobile layouts, cleanup, no page errors.');
}finally{await browser.close();await app.close();}
