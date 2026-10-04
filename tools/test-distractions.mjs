import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {startLocal} from '../server/local.mjs';
const app=await startLocal({port:0,transformHTML:s=>s
  .replace('grp,aimZ:OZ,networked:true,','grp,aimZ:OZ,networked:true,testClient:client,testDistractions:distractions,')
  .replace('return {update:update3,render:render3,resize:resize3,setStage,leaveStage};','window.__game={S,aim,get stage(){return stage;}};return {update:update3,render:render3,resize:resize3,setStage,leaveStage};')
  .replace('reducedMotion:reduce,onInteract:ensureAudio','reducedMotion:true,onInteract:ensureAudio')});
const browser=await chromium.launch({headless:true,...(process.env.DAHROOJ_CHROMIUM?{executablePath:process.env.DAHROOJ_CHROMIUM}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
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
 await b.screenshot({path:'test-results/duel-distractions-controls.png'});
 for(const kind of ['can','bottle','balloon']){
   await b.locator(`[data-distraction="${kind}"]`).tap();
   await a.waitForFunction(kind=>window.__game.stage.testDistractions.items.some(i=>i.kind===kind&&i.incoming),kind);
   assert.equal(await b.evaluate(()=>window.__game.aim.down),false);
   assert.equal(await a.evaluate(()=>window.__game.stage.testClient.canShoot()),true);
   await a.waitForTimeout(850);await a.screenshot({path:`test-results/duel-distraction-${kind}.png`});
   await a.waitForFunction(()=>window.__game.stage.testDistractions.items.length===0);
 }
 for(const [width,height] of [[320,568],[844,390]]){
  await b.setViewportSize({width,height});
  const r=await b.evaluate(()=>{const a=document.querySelector('.duel-distractions').getBoundingClientRect(),s=document.querySelector('.styles').getBoundingClientRect();return {ok:a.left>=0&&a.right<=innerWidth&&a.top>=0&&a.bottom<=innerHeight,overlap:a.left<s.right&&a.right>s.left&&a.top<s.bottom&&a.bottom>s.top};});
  assert(r.ok);assert(!r.overlap);
 }
 await a.evaluate(()=>window.__game.stage.testClient.shoot({target:[0,.35,-20],flight:.8,curve:0}));
 await a.locator('.duel-distractions').waitFor({state:'visible'});
 assert.equal(await b.locator('.duel-distractions').isVisible(),false);
 await a.locator('[data-distraction="balloon"]').tap();
 await b.waitForFunction(()=>window.__game.stage.testDistractions.items.some(i=>i.incoming));
 await a.locator('[data-mode="cans"]').tap();assert.equal(await a.locator('.duel-distractions').isVisible(),false);
 await b.locator('.duel-distractions').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);console.log('PASS: real two-browser throws, all 3 props, turns, mobile layouts, cleanup, no page errors.');
}finally{await browser.close();await app.close();}
