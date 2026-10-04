import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {startLocal} from '../server/local.mjs';
const app=await startLocal({port:0,transformHTML:s=>s
  .replace('grp,aimZ:OZ,networked:true,','grp,aimZ:OZ,networked:true,testClient:client,testDistractions:distractions,testOpponent:O,')
  .replace('return {update:update3,render:render3,resize:resize3,setStage,leaveStage};','window.__game={S,aim,toScreen,get stage(){return stage;}};return {update:update3,render:render3,resize:resize3,setStage,leaveStage};')
  .replace('reducedMotion:reduce,onInteract:ensureAudio','reducedMotion:true,onInteract:ensureAudio')});
const browser=await chromium.launch({headless:true,...(process.env.DAHROOJ_CHROMIUM?{executablePath:process.env.DAHROOJ_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],pages=[];
async function open(){
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await context.route('**/*',r=>r.request().url().startsWith(app.url+'/')?r.continue():r.abort());
 await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
 const p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(app.url);await p.locator('#start-play').tap();await p.locator('[data-mode="opponent"]').tap();return p;
}
const ready=async p=>p.waitForFunction(()=>{const c=window.__game.stage.testClient;return c.state?.bot===null&&c.state.balls.every(b=>b.grounded&&!b.shot)&&!c.state.resetT;},null,{timeout:15000});
const points=(p,x)=>p.evaluate(x=>{const g=window.__game;return [g.toScreen(g.S.pos),g.toScreen(g.S.pos.clone().add(new THREE.Vector3(x,0,0)))];},x);
async function touchFor(p){const session=await p.context().newCDPSession(p);return (type,point)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x:point.x,y:point.y,id:1,radiusX:6,radiusY:6,force:1}]});}
try{
 const a=await open(),b=await open();await ready(a);await ready(b);
 const touchA=await touchFor(a),touchB=await touchFor(b);
 for(const p of [a,b]){
   assert.equal(await p.locator('.duel-distractions,[data-distraction]').count(),0,'No projectile buttons or icons');
   assert.equal(await p.locator('.duel-health [role="progressbar"]').count(),2);
   assert(await p.evaluate(()=>document.querySelector('.duel-health').getBoundingClientRect().top>document.querySelector('#count small').getBoundingClientRect().bottom));
 }
 // Both the shooter and defender can move using a horizontal touch on their body.
 let move=await points(a,.65);await touchA('touchStart',move[0]);await touchA('touchMove',move[1]);await touchA('touchEnd');
 await a.waitForFunction(()=>window.__game.stage.testClient.state.balls[0].p[0]>.55);
 await b.waitForFunction(()=>window.__game.stage.testClient.state.balls[0].p[0]>.55);
 assert.equal(await a.evaluate(()=>window.__game.stage.testClient.state.balls[0].shot),false);
 assert.equal(await a.evaluate(()=>window.__game.aim.down),false);
 move=await points(b,.9);await touchB('touchStart',move[0]);await touchB('touchMove',move[1]);await touchB('touchEnd');
 await a.waitForFunction(()=>window.__game.stage.testClient.state.balls[1].p[0]<-.8);
 // One tap on the opponent throws one small ball; holding does not fire repeatedly.
 const target=await b.evaluate(()=>window.__game.toScreen(window.__game.stage.testOpponent.pos));
 await touchB('touchStart',target);await touchB('touchCancel');
 assert.equal(await b.evaluate(()=>window.__game.stage.testDistractions.items.length),0);
 for(let hit=1;hit<=3;hit++){
   await touchB('touchStart',target);await touchB('touchEnd');
   await a.waitForFunction(()=>window.__game.stage.testDistractions.items.some(i=>i.incoming&&i.kind==='ball'));
   if(hit===1)await a.screenshot({path:'test-results/duel-small-ball.png'});
   await a.waitForFunction(expected=>window.__game.stage.testClient.state.health[0]===expected,100-hit*20);
   await b.waitForFunction(expected=>window.__game.stage.testClient.state.health[0]===expected,100-hit*20);
   assert.equal(await b.evaluate(()=>window.__game.aim.down),false);
   assert.equal(await a.evaluate(()=>window.__game.stage.testClient.canShoot()),true);
   await b.waitForFunction(()=>window.__game.stage.testDistractions.cooldown===0&&window.__game.stage.testDistractions.items.length===0);
 }
 await b.screenshot({path:'test-results/duel-touch-controls.png'});
 // A different touch location produces a miss instead of following the opponent.
 const miss=await b.evaluate(()=>window.__game.toScreen(new THREE.Vector3(2,.35,-20)));
 await touchB('touchStart',miss);await touchB('touchEnd');
 await a.waitForFunction(()=>window.__game.stage.testDistractions.items.length>0);
 await a.waitForFunction(()=>window.__game.stage.testDistractions.items.length===0);
 assert.equal(await a.evaluate(()=>window.__game.stage.testClient.state.health[0]),40);
 // Vertical swipe still throws the main character after moving sideways.
 const shot=await a.evaluate(()=>{const g=window.__game;return [g.toScreen(g.S.pos),g.toScreen(new THREE.Vector3(0,.35,-20))];});
 await touchA('touchStart',shot[0]);await touchA('touchMove',shot[1]);await touchA('touchEnd');
 await b.waitForFunction(()=>window.__game.stage.testClient.state.balls[0].seq>0);
 await ready(a);await ready(b);
 assert.equal(await b.evaluate(()=>window.__game.stage.testClient.state.health[1]),100,'Moved defender dodges the center swipe');
 assert.equal(await a.evaluate(()=>window.__game.stage.testClient.canDistract()),true);
 assert.equal(await b.evaluate(()=>window.__game.stage.testClient.canDistract()),false);
 for(const [width,height] of [[320,568],[844,390]]){
   await b.setViewportSize({width,height});
   assert(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await a.locator('[data-mode="cans"]').tap();
 await b.waitForFunction(()=>window.__game.stage.testClient.state?.bot===1);
 assert.equal(await a.locator('.duel-health').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: no projectile UI; direct target taps, misses, half damage; horizontal movement for both players, vertical main throw, cancellation, AI fallback and mobile layouts.');
}catch(error){
 for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:`test-results/duel-touch-failure-${i}.png`}).catch(()=>{});
 throw error;
}finally{await browser.close();await app.close();}
