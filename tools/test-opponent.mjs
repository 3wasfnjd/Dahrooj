// Full online flow in separate browser contexts, using the real WebSocket server.
// Test hooks exist only in the response served by this test, never in published HTML.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startLocal} from '../server/local.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const app=await startLocal({port:0,transformHTML:html=>html
  .replace('grp,aimZ:OZ,networked:true,','grp,aimZ:OZ,networked:true,testClient:client,testOpponent:O,testRadius:OR,testPaintPop:paintPop,testBody:body,testBursts:()=>bursts,')
  .replace('return {update:update3,render:render3,resize:resize3,setStage,leaveStage};',
    'window.__game={S,BR,aim,shoot,toScreen,camera,get stage(){return stage;}};return {update:update3,render:render3,resize:resize3,setStage,leaveStage};')
  .replace('reducedMotion:reduce,onInteract:ensureAudio','reducedMotion:true,onInteract:ensureAudio')});
const browser=await chromium.launch({headless:true,
  ...(process.env.DAHROOJ_CHROMIUM?{executablePath:process.env.DAHROOJ_CHROMIUM}:{}),
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const clients=[],errors=[],checks=[];await mkdir(resolve(root,'test-results'),{recursive:true});
async function open(width=390,height=844){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true,reducedMotion:'no-preference'});
  await context.route('**/*',route=>route.request().url().startsWith(app.url+'/')?route.continue():route.abort());
  await context.addInitScript(()=>{Object.defineProperty(navigator,'onLine',{get:()=>false});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(app.url);await page.locator('#start-play').tap();
  clients.push({page,context});return page;
}
const select=(p,mode)=>p.locator(`[data-mode="${mode}"]`).tap();
const ready=p=>p.waitForFunction(()=>{const m=window.__game.stage.testClient?.state;return m&&!m.resetT&&m.balls.every(b=>b.grounded&&!b.shot&&!b.popped);},null,{timeout:12000});
const paired=async p=>{await p.waitForFunction(()=>window.__game.stage.testClient.state?.bot===null,null,{timeout:15000});await ready(p);};
const state=p=>p.evaluate(()=>{const c=window.__game.stage.testClient;return {status:c?.status,slot:c?.slot,match:c?.state?.id,scores:c?.state?.scores,balls:c?.state?.balls};});
async function fire(page){
  await ready(page);
  await page.waitForFunction(()=>window.__game.stage.testClient.canShoot());
  await page.evaluate(()=>{
    const g=window.__game,a=g.toScreen(g.S.pos),b=g.toScreen(new THREE.Vector3(0,.35,-20));
    g.aim.down=true;g.aim.pts=[{x:a.x,y:a.y,t:0},{x:b.x,y:b.y,t:.04}];g.aim.x=b.x;g.aim.y=b.y;g.shoot();
  });
}
try{
  const a=await open();
  assert.equal(app.engine.clients.size,0,'Other modes do not enter online matchmaking');
  await select(a,'opponent');assert.equal(await a.locator('[data-mode="opponent"]').getAttribute('aria-label'),'Duel');
  await ready(a);
  assert.equal(await a.evaluate(()=>window.__game.stage.testClient.state.bot),1);
  assert.equal(await a.evaluate(()=>window.__game.stage.canAim()),true);
  // Visibility follows the next rendered frame after the match state arrives.
  assert(await a.waitForFunction(()=>window.__game.stage.testBody.visible,null,{timeout:5000}).then(()=>true,()=>false),'A playable AI appears without another visitor');
  assert.equal(await a.locator('.duel-distractions').count(),0);
  const aiStyle=await a.evaluate(()=>window.__game.stage.testClient.state.styles[1]);
  assert.notEqual(aiStyle,await a.evaluate(()=>window.__game.stage.testClient.state.styles[0]));
  await a.locator(`[data-style="${aiStyle}"]`).tap();
  await a.waitForFunction(style=>{const s=window.__game.stage.testClient.state.styles;return s[0]===style&&s[1]!==style;},aiStyle);
  await a.locator('[data-style="jelly"]').tap();
  await a.waitForFunction(()=>{const s=window.__game.stage.testClient.state.styles;return s[0]==='jelly'&&s[1]!=='jelly';});
  checks.push('AI always uses a different style, including when the player selects its current style.');
  await a.screenshot({path:resolve(root,'test-results/duel-ai.png')});
  await fire(a);
  await a.waitForFunction(()=>window.__game.stage.testClient.state.balls[1].seq>0,null,{timeout:20000});
  checks.push('A solo visitor can play immediately against AI, which returns a normal physics throw.');
  const b=await open(1280,800);await select(b,'opponent');await paired(a);await paired(b);
  const c=await open();await select(c,'opponent');
  const d=await open();await select(d,'opponent');await paired(c);await paired(d);
  const states=await Promise.all([a,b,c,d].map(state));
  assert.equal(states[0].match,states[1].match);assert.equal(states[2].match,states[3].match);assert.notEqual(states[0].match,states[2].match);
  assert.equal(app.engine.matches.size,2);checks.push('Four isolated browsers automatically pair 1+2 and 3+4; no room controls or room codes.');
  for(const [w,h] of [[320,568],[390,844],[844,390],[1280,800]]){
    await a.setViewportSize({width:w,height:h});
    await a.waitForTimeout(120);
    const layout=await a.evaluate(()=>{
      const g=window.__game,o=g.stage.testOpponent;
      const r=(p,size)=>{const a=g.toScreen(p),b=g.toScreen(p.clone().addScaledVector(g.camera.up,size));return Math.hypot(b.x-a.x,b.y-a.y);};
      const row=document.querySelector('.modes').getBoundingClientRect();
      return {width:innerWidth,scroll:document.documentElement.scrollWidth,left:row.left,right:row.right,
        radius:g.stage.testRadius,player:g.BR,projected:r(o.pos,g.stage.testRadius),sameDepth:r(o.pos,g.BR),near:r(g.S.pos,g.BR)};
    });
    assert.equal(layout.scroll,w);assert(layout.left>=0&&layout.right<=w);
    assert.equal(layout.radius,layout.player);assert.equal(layout.projected,layout.sameDepth);assert(layout.projected<layout.near);
  }
  await a.setViewportSize({width:390,height:844});checks.push('Same character radius and natural perspective at 320/390/844/1280 px; existing mode picker fits.');
  await a.waitForFunction(()=>window.__game.camera.aspect===innerWidth/innerHeight);
  assert.equal(await a.evaluate(()=>window.__game.stage.canAim()),true);
  // The actual touch event handlers must send an upward swipe, and cancel must not shoot.
  const session=await clients[0].context.newCDPSession(a);
  const touch=(type,x,y)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{x,y,id:1,radiusX:6,radiusY:6,force:1}]});
  let points=await a.evaluate(()=>{const g=window.__game;return [g.toScreen(g.S.pos),g.toScreen(new THREE.Vector3(0,.35,-20))];});
  await touch('touchStart',points[0].x,points[0].y);
  assert.equal(await a.evaluate(()=>window.__game.aim.down),true,'Touch begins on the resized game canvas');
  await touch('touchMove',points[1].x,points[1].y);await touch('touchCancel');
  assert.equal((await state(a)).balls[0].shot,false);
  await touch('touchStart',points[0].x,points[0].y);await touch('touchMove',points[1].x,points[1].y);await touch('touchEnd');
  await a.waitForFunction(()=>window.__game.stage.testClient.state.balls[0].seq>0);
  await b.waitForFunction(()=>window.__game.stage.testClient.state.balls[0].seq>0);
  checks.push('Trusted touch swipe reaches the other browser; canceled touch does not fire.');
  await ready(a);await ready(b);
  assert.equal(await a.evaluate(()=>window.__game.stage.canAim()),false);
  assert.equal(await b.locator('#count small').getAttribute('aria-label'),'Your turn');
  const priorHealth=await a.evaluate(()=>window.__game.stage.testClient.state.health[1]);
  await fire(b);await ready(a);await ready(b);
  for(const p of [a,b])assert.equal(await p.evaluate(()=>window.__game.stage.testClient.state.health[0]),60);
  await fire(a);await ready(a);await ready(b);
  for(const p of [a,b])assert.equal(await p.evaluate(()=>window.__game.stage.testClient.state.health[1]),priorHealth-40);
  await fire(b);await ready(a);await ready(b);
  await a.screenshot({path:resolve(root,'test-results/duel-health.png')});
  checks.push('Nonlethal hits remove 40 health on both clients, preserve health across turns and keep both players alive.');
  await a.screenshot({path:resolve(root,'test-results/duel-online.png')});
  for(const style of ['jelly','fabric','clay','fur','bubble']){
    await b.locator(`[data-style="${style}"]`).tap();
    await a.waitForFunction(style=>window.__game.stage.testClient.state.styles[1]===style,style);
    // Start this pop/style check one hit from defeat; normal full-health play is checked above.
    const room=app.engine.matches.get((await state(a)).match);room.state.health[1]=40;app.engine.broadcast(room);
    await a.waitForFunction(()=>window.__game.stage.testClient.state.health[1]===40);
    const before=(await state(a)).scores[0];await fire(a);
    await b.waitForFunction(before=>window.__game.stage.testClient.state.scores[0]===before+1,before,{timeout:7000});
    const popped=await Promise.all([a,b].map(p=>p.evaluate(()=>{const g=window.__game;return {
      localVisible:g.stage.playerVisible(),remoteVisible:g.stage.testBody.visible,scores:g.stage.testClient.state.scores,
      ringFree:(()=>{let strokes=0,fills=0;const context={save(){},restore(){},beginPath(){},arc(){},fill(){fills++;},stroke(){strokes++;}};g.stage.testPaintPop(context);return {strokes,fills};})()
    };})));
    assert.equal(popped[0].remoteVisible,false);assert.equal(popped[1].localVisible,false);assert.deepEqual(popped[0].scores,popped[1].scores);
    assert.equal(popped[0].ringFree.strokes,0);assert.equal(popped[1].ringFree.strokes,0);
    if(style==='jelly')await b.screenshot({path:resolve(root,'test-results/duel-pop.png')});
    assert.deepEqual((await state(c)).scores,[0,0]);assert.deepEqual((await state(d)).scores,[0,0]);
    await ready(a);await ready(b);
    assert.equal(await a.evaluate(()=>window.__game.stage.canAim()),false);
    assert.equal(await b.evaluate(()=>window.__game.stage.canAim()),true);
    await fire(b);await ready(a);await ready(b);
    assert.equal(await a.locator('#count small').getAttribute('aria-label'),'Your turn');
  }
  checks.push('All five styles sync; hits pop the correct player on both screens without a white ring; scores and respawns agree; second room stays unchanged.');
  checks.push('Turns alternate after each shot; only the current player can aim; both cameras show the correct turn and both players can score.');
  // Fifth entrant practices with AI; a departure pairs them with the remaining human.
  const e=await open();await select(e,'opponent');await ready(e);assert.equal(await e.evaluate(()=>window.__game.stage.testClient.state.bot),1);
  await select(a,'free');await paired(b);await paired(e);
  assert.equal((await state(b)).match,(await state(e)).match);assert.notEqual((await state(b)).match,states[0].match);
  assert.equal((await state(c)).match,states[2].match);assert.equal(app.engine.matches.size,2);
  await select(e,'cans');await b.waitForFunction(()=>window.__game.stage.testClient.state?.bot===1);
  await select(b,'free');
  // The server sees the closed socket asynchronously.
  for(let i=0;i<50&&app.engine.clients.size!==2;i++)await new Promise(r=>setTimeout(r,100));
  assert.equal(app.engine.clients.size,2);
  checks.push('Odd entrant plays AI; leaving Duel rematches the survivor or restores AI; mode switching leaves other matches intact.');
  // Interrupt the remaining match at transport level; clients must reconnect automatically.
  for(const socket of [...app.engine.clients.keys()])socket.terminate();
  await c.waitForFunction(old=>window.__game.stage.testClient.state?.id&&window.__game.stage.testClient.state.id!==old,states[2].match,{timeout:12000});
  await paired(c);await paired(d);assert.equal((await state(c)).match,(await state(d)).match);
  checks.push('Dropped connections reconnect and rematch automatically, with AI while a human is unavailable.');
  for(const mode of ['goal','hoop','window','padel','cans','free']){
    await select(a,mode);assert.equal(await a.locator(`[data-mode="${mode}"]`).getAttribute('aria-pressed'),'true');
    assert.equal(await a.locator('#count').evaluate(el=>el.classList.contains('duel')),false);
  }
  assert.deepEqual(errors,[]);checks.push('All six original modes remain available; zero browser script errors.');
  await writeFile(resolve(root,'test-results/duel-browser-report.json'),JSON.stringify({ok:true,checks,limitation:'Local real-WebSocket server; mobile/desktop Chromium emulation, not physical devices or a public deployment.'},null,2));
  console.log(JSON.stringify({ok:true,checks},null,2));
}catch(error){
  console.error(error);console.error('Browser errors:',errors);console.error('Checks completed:',checks);
  for(const c of clients)console.error(await c.page.evaluate(()=>{const g=window.__game,n=g?.stage.testClient;return {status:n?.status,slot:n?.slot,pending:n?.pending,state:n?.state,aim:g?.aim};}).catch(()=>null));
  for(let i=0;i<clients.length;i++)await clients[i].page.screenshot({path:resolve(root,`test-results/duel-failure-${i}.png`)}).catch(()=>{});
  process.exitCode=1;
}finally{await browser.close();await app.close();}
