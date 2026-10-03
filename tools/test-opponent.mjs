// Browser checks; internal state is exposed only in the HTTP response served by this test.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const html=await readFile(resolve(root,'index.html'),'utf8');
const inspected=html
  .replace('grp,aimZ:OZ,','grp,aimZ:OZ, testState:O, testBubble:bubbleAI, testBody:body, testRadius:()=>OR, testBurst:()=>burst,')
  .replace('return {update:update3,render:render3,resize:resize3,setStage};',`
    window.__test3={S,BR,aim,camera,toScreen,shoot,respawn,get stage(){return stage;},
      popPlayer(){const p=toScreen(S.pos);bubblePop(p.x,p.y,screenRadius());},get playerBubble(){return bub;},
      step(seconds){for(let i=0;i<Math.round(seconds*180);i++){time+=1/180;update3(1/180);}drawPaper();render3();}};
    return {update:update3,render:render3,resize:resize3,setStage};`)
  .replace('const steps=3;','const steps=3;if(window.__pauseGame){requestAnimationFrame(frame);return;}');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),file=resolve(root,'.'+url.pathname);
    assert(file.startsWith(root+'/'));
    const body=file===resolve(root,'index.html') && url.searchParams.has('inspect')?inspected:await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir(resolve(root,'test-results'),{recursive:true});
const report={checks:[],failures:[],limitation:'Chromium mobile/desktop emulation; not a physical iPhone or Android test.'};
const browser=await chromium.launch({headless:true,
  ...(process.env.DAHROOJ_CHROMIUM?{executablePath:process.env.DAHROOJ_CHROMIUM}:{}),
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function open(inspect,width=390,height=844,reducedMotion='reduce'){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true,reducedMotion});
  await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
  await context.addInitScript(()=>{Object.defineProperty(navigator,'onLine',{get:()=>false});});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(origin+'/index.html'+(inspect?'?inspect':''));
  await page.locator('#start-play').tap();
  await page.locator('[data-mode="opponent"]').tap();
  return {context,page,errors};
}
async function select(page,mode){
  await page.locator(`[data-mode="${mode}"]`).tap();
  await page.evaluate(()=>{window.__pauseGame=true;window.__test3.step(1.5);});
}
async function snapshot(page){
  return page.evaluate(()=>{
    const {S,stage}=window.__test3,O=stage.testState;
    return {pos:S.pos.toArray(),vel:S.vel.toArray(),shot:S.shot,scored:S.scoredT,miss:S.missT,
      grounded:S.grounded,count:document.querySelector('#count').textContent,
      opponent:O?{pos:O.pos.toArray(),vel:O.vel.toArray(),planned:O.planned,touched:O.touched,popped:!stage.testBody.visible}:null};
  });
}
try{
  // First verify the unmodified game response, its controls and narrow-screen layout.
  const plain=await open(false);
  for(const [width,height] of [[390,844],[320,568],[844,390],[1280,800]]){
    await plain.page.setViewportSize({width,height});
    await plain.page.waitForTimeout(150);
    assert(await plain.page.evaluate(()=>{
      const row=document.querySelector('.modes').getBoundingClientRect();
      return row.left>=0 && row.right<=innerWidth && document.documentElement.scrollWidth===innerWidth &&
        [...document.querySelectorAll('.modes button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.width>=30;});
    }),'Mode controls fit the viewport');
    await plain.page.screenshot({path:resolve(root,`test-results/opponent-${width}x${height}.png`)});
  }
  for(const mode of ['free','goal','hoop','window','padel','cans','opponent']){
    await plain.page.locator(`[data-mode="${mode}"]`).tap();
    assert.equal(await plain.page.locator(`[data-mode="${mode}"]`).getAttribute('aria-pressed'),'true');
  }
  assert.deepEqual(plain.errors,[]);await plain.context.close();
  report.checks.push('Unmodified page loads; all seven modes work; controls fit 320/390/844/1280 px.');

  const c=await open(true,390,844,'no-preference'),page=c.page;
  await select(page,'opponent');
  report.sizes=[];
  for(const [width,height] of [[390,844],[320,568],[844,390],[1280,800]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    const sizes=await page.evaluate(()=>{
      const t=window.__test3;t.respawn();t.step(2);
      const radius=(pos,r)=>{const a=t.toScreen(pos),b=t.toScreen(pos.clone().addScaledVector(t.camera.up,r));return Math.hypot(a.x-b.x,a.y-b.y);};
      return {player:radius(t.S.pos,t.BR),opponent:radius(t.stage.testState.pos,t.stage.testRadius()),
        playerAtOpponentDepth:radius(t.stage.testState.pos,t.BR),playerWorldRadius:t.BR,opponentWorldRadius:t.stage.testRadius()};
    });
    assert.equal(sizes.opponentWorldRadius,sizes.playerWorldRadius,'Same physical size, independent of viewport');
    assert.equal(sizes.opponent,sizes.playerAtOpponentDepth,'Same projected size when the characters meet');
    assert(sizes.opponent<sizes.player,'Distant opponent uses natural camera perspective without enlargement');
    report.sizes.push({width,height,...sizes});
  }
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  await select(page,'opponent');
  await page.screenshot({path:resolve(root,'test-results/opponent-matching-size.png')});
  report.checks.push('Opponent uses Dahrooj\'s physical size and natural perspective at 320/390/844/1280 px, including rotation.');
  // The same gesture must launch the exact same trajectory in the cans and opponent stages.
  for(const curve of [0,35,-35]){
    const paths=[];
    for(const mode of ['cans','opponent']){
      await select(page,mode);
      paths.push(await page.evaluate(curve=>{
        const t=window.__test3;
        t.aim.down=true;t.aim.pts=[{x:195,y:690,t:0},{x:195+curve,y:580,t:.1},{x:195,y:470,t:.2}];
        t.shoot();const launch={pos:t.S.pos.toArray(),vel:t.S.vel.toArray(),side:t.S.side.toArray()};
        t.step(.3);return {launch,pos:t.S.pos.toArray(),vel:t.S.vel.toArray()};
      },curve));
    }
    assert.deepEqual(paths[0],paths[1],'Cans and opponent share launch speed, curve, gravity and drag');
  }
  report.checks.push('Straight and both curved trajectories exactly match the cans stage before target contact.');

  await select(page,'opponent');
  await page.evaluate(()=>{
    const t=window.__test3;t.aim.down=true;t.aim.pts=[{x:190,y:660,t:0}];t.aim.x=280;t.aim.y=480;t.step(.5);
  });
  let s=await snapshot(page);assert.equal(s.opponent.planned,false);assert.equal(s.opponent.pos[0],0);
  await page.evaluate(()=>{window.__test3.aim.down=false;});

  // Verify the real touch handlers; the smaller opponent may dodge this center swipe.
  const start=await page.evaluate(()=>window.__test3.toScreen(window.__test3.S.pos));
  const target=await page.evaluate(()=>window.__test3.toScreen(window.__test3.stage.testState.pos));
  const session=await c.context.newCDPSession(page);
  const touch=(type,x,y)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1,radiusX:6,radiusY:6,force:1}]});
  await touch('touchStart',start.x,start.y);
  for(let i=1;i<=2;i++){
    await touch('touchMove',start.x+(target.x-start.x)*i/2,start.y+(target.y-start.y)*i/2);
  }
  await touch('touchEnd');assert.equal((await snapshot(page)).shot,true);
  await page.evaluate(()=>window.__test3.step(.2));assert.equal((await snapshot(page)).opponent.planned,false);
  await page.evaluate(()=>window.__test3.step(.38));s=await snapshot(page);
  assert(s.opponent.planned && Math.abs(s.opponent.pos[0])>.02,'AI reacts after release and moves');
  await page.evaluate(()=>window.__test3.step(1.2));s=await snapshot(page);
  const touchScore=Number(s.count);
  await page.evaluate(()=>window.__test3.step(3));
  // Replay a 40 ms flick with fixed timing, independent of the test machine's input latency.
  await page.evaluate(()=>{
    const t=window.__test3,a=t.toScreen(t.S.pos),b=t.toScreen(t.stage.testState.pos);
    t.aim.down=true;t.aim.pts=[{x:a.x,y:a.y,t:0},{x:b.x,y:b.y,t:.04}];t.shoot();t.step(1.2);
  });
  s=await snapshot(page);const earnedCount=touchScore+1;
  assert.equal(s.count,String(earnedCount),'A fast flick reaches and hits the smaller moving opponent');
  assert(s.opponent.popped,'The struck opponent disappears, including its shadow');
  await page.evaluate(()=>window.__test3.step(3));s=await snapshot(page);
  assert(!s.shot && s.grounded && !s.opponent.touched && !s.opponent.popped,'Both characters reset for the next throw');
  report.checks.push('Trusted touch launches and triggers AI; a timed fast flick hits the smaller target, scores once and resets.');

  // A genuine miss never scores, and an offscreen shot returns immediately.
  await select(page,'opponent');
  await page.evaluate(()=>{
    const t=window.__test3;t.aim.down=true;t.aim.pts=[{x:195,y:690,t:0},{x:385,y:500,t:.1},{x:385,y:350,t:.2}];t.shoot();t.step(5);
  });
  s=await snapshot(page);assert.equal(s.count,String(earnedCount));assert(!s.shot);
  await page.evaluate(()=>{const t=window.__test3;t.S.shot=true;t.S.pos.set(100,2,-5);t.step(1/180);});
  s=await snapshot(page);assert(!s.shot && s.pos[0]===0 && s.pos[2]===0);
  await page.evaluate(()=>window.__test3.step(1.5));
  await touch('touchStart',start.x,start.y);await touch('touchMove',start.x,start.y-60);await touch('touchCancel');
  assert.equal(await page.evaluate(()=>window.__test3.aim.down),false);assert(!(await snapshot(page)).shot);
  await session.detach();
  report.checks.push('Misses do not score; offscreen shots respawn immediately; cancelled touch does not shoot.');

  // A floor pop on the player's bubble must not hide the distant opponent.
  for(const style of ['jelly','fabric','clay','fur','bubble']){
    await select(page,'opponent');
    await page.locator(`[data-style="${style}"]`).tap();
    await page.evaluate(()=>window.__test3.step(.2));
    await page.screenshot({path:resolve(root,`test-results/opponent-${style}.png`)});
  }
  await page.evaluate(()=>window.__test3.popPlayer());
  assert(await page.evaluate(()=>window.__test3.playerBubble.t>0));
  assert.equal(await page.evaluate(()=>window.__test3.stage.testBubble.t),0);
  await select(page,'cans');assert.equal((await snapshot(page)).count,'0');
  await select(page,'opponent');assert.equal((await snapshot(page)).count,String(earnedCount));
  report.checks.push('All five existing styles render; opponent bubble state and cans score stay independent.');

  for(const style of ['jelly','fabric','clay','fur','bubble']){
    await select(page,'opponent');await page.locator(`[data-style="${style}"]`).tap();
    const count=Number((await snapshot(page)).count);
    const popped=await page.evaluate(()=>{
      const t=window.__test3,O=t.stage.testState;
      t.S.pos.copy(O.pos);t.S.pos.z+=t.stage.testRadius()+t.BR-.02;t.S.vel.set(0,0,-12);t.S.shot=true;
      t.stage.collide();const vel=t.S.vel.toArray();t.stage.collide();
      return {hidden:!t.stage.testBody.visible,parts:t.stage.testBurst()?.parts.length,vel,after:t.S.vel.toArray()};
    });
    assert(popped.hidden && popped.parts===12,'Every style pops with the existing twelve-particle effect');
    assert.deepEqual(popped.vel,popped.after,'The popped opponent has no invisible collider');
    assert.equal(Number((await snapshot(page)).count),count+1,'Pop awards exactly one point');
    await page.evaluate(()=>window.__test3.step(.08));
    if(style==='jelly') await page.screenshot({path:resolve(root,'test-results/opponent-pop.png')});
    await page.evaluate(()=>window.__test3.step(.7));assert((await snapshot(page)).opponent.popped,'No early regrowth after the effect fades');
    await page.evaluate(()=>window.__test3.step(2));assert(!(await snapshot(page)).opponent.popped,'Opponent returns for the next throw');
  }
  assert.deepEqual(c.errors,[]);await c.context.close();
  report.checks.push('All five styles pop once, hide the body/shadow/collider and return only with the next throw.');
  console.log(report.checks.map(s=>'PASS '+s).join('\n'));
}catch(error){report.failures.push(String(error.stack||error));console.error(error);process.exitCode=1;}
finally{
  await browser.close();server.close();
  await writeFile(resolve(root,'test-results/opponent-report.json'),JSON.stringify(report,null,2)+'\n');
}
