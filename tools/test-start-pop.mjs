// Real pointer regression checks for the opening scene; no hooks ship to players.
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.woff2':'font/woff2','.mp3':'audio/mpeg','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    assert(pathname.startsWith('/Dahrooj/'));
    const path=resolve(root,decodeURIComponent(pathname.slice(9))||'index.html');
    assert(path.startsWith(root+'/'));
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});
    res.end(await readFile(path));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir(resolve(root,'test-results'),{recursive:true});

async function open(browser,reducedMotion='no-preference'){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion});
  await context.addInitScript(()=>{
    Object.defineProperty(navigator,'onLine',{get:()=>false});
    window.__pops=0;window.__errors=[];
    window.addEventListener('unhandledrejection',e=>window.__errors.push(String(e.reason)));
    let matter,start;
    Object.defineProperty(window,'Matter',{get:()=>matter,set(value){
      matter=value;const create=value.Engine.create;
      value.Engine.create=function(...args){return window.__engine=create.apply(this,args);};
    }});
    Object.defineProperty(window,'createDahroojStart',{get:()=>start,set(value){
      start=options=>{
        const pop=options.onPop;
        options.onPop=()=>{window.__pops++;pop?.();};
        return value(options);
      };
    }});
  });
  await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(origin+'/Dahrooj/',{waitUntil:'load'});
  return {page,context,errors};
}
const pops=page=>page.evaluate(()=>window.__pops);
const exists=(page,id)=>page.evaluate(id=>window.__engine.world.bodies.some(b=>b.id===id),id);
const constraints=page=>page.evaluate(()=>window.__engine.world.constraints.length);
async function choose(page){
  await page.waitForFunction(()=>window.__engine.world.bodies.some(b=>!b.isStatic && b.speed<2 &&
    b.position.x>55 && b.position.x<innerWidth-55 && b.position.y>80 && b.position.y<innerHeight-20 &&
    document.elementFromPoint(b.position.x,b.position.y)?.id==='start-balls'),null,{timeout:6000});
  const b=await page.evaluate(()=>window.__engine.world.bodies.filter(b=>!b.isStatic &&
    b.position.x>55 && b.position.x<innerWidth-55 && b.position.y>80 && b.position.y<innerHeight-20 &&
    document.elementFromPoint(b.position.x,b.position.y)?.id==='start-balls')
    .sort((a,b)=>a.speed-b.speed).map(b=>({...b.position,id:b.id}))[0]);
  assert(b,'A visible ball can receive input');return b;
}
async function grabbed(page){
  const b=await page.evaluate(()=>{
    const body=window.__engine.world.constraints.at(-1)?.bodyB;
    return body?{id:body.id,...body.position}:null;
  });
  assert(b,'Pointer holds a physics body');return b;
}
async function mouseDown(page){
  const p=await choose(page);await page.mouse.move(p.x,p.y);await page.mouse.down();
  return {point:p,ball:await grabbed(page)};
}
async function waitForPop(page,id,before){
  await page.waitForFunction(id=>!window.__engine.world.bodies.some(b=>b.id===id),id,{timeout:2500});
  assert.equal(await pops(page),before+1);
  assert.equal(await constraints(page),0,'A popped ball releases its constraint');
}
async function ready(page){
  await page.waitForFunction(()=>document.querySelector('#start-screen')?.dataset.state==='ready',null,{timeout:18000});
  assert(await page.locator('#start-play').isVisible());
}
async function mouseChecks(page,name){
  let before=await pops(page),held=await mouseDown(page);
  await page.mouse.up();await page.waitForTimeout(800);
  assert(await exists(page,held.ball.id),'A quick click does not pop');
  assert.equal(await pops(page),before);

  held=await mouseDown(page);
  await page.mouse.move(held.point.x+35,held.point.y-50,{steps:8});
  await page.waitForTimeout(850);
  assert(await exists(page,held.ball.id),'A drag followed by a hold does not pop');
  assert.equal(await pops(page),before);assert.equal(await constraints(page),1);
  await page.mouse.up();

  held=await mouseDown(page);await page.waitForTimeout(300);
  assert(await exists(page,held.ball.id),'The hold has a grace period');
  await page.screenshot({path:resolve(root,`test-results/${name}-start-hold.png`)});
  await waitForPop(page,held.ball.id,before);
  await page.screenshot({path:resolve(root,`test-results/${name}-start-pop.png`)});
  await page.waitForTimeout(800);
  assert.equal(await pops(page),before+1,'One pop per press');
  await page.mouse.up();
  assert(await page.locator('#start-play').isVisible(),'Play remains available after popping');
}
async function touchChecks(context,page){
  const session=await context.newCDPSession(page);
  const send=(type,p)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{x:p.x,y:p.y,id:1,radiusX:8,radiusY:8,force:1}]:[]});
  let before=await pops(page),point=await choose(page);
  await send('touchStart',point);let b=await grabbed(page);
  await waitForPop(page,b.id,before);await send('touchEnd');
  before=await pops(page);point=await choose(page);
  await send('touchStart',point);b=await grabbed(page);
  await send('touchCancel');await page.waitForTimeout(800);
  assert(await exists(page,b.id),'Cancelled touch cannot pop later');
  assert.equal(await pops(page),before);assert.equal(await constraints(page),0);
  point=await choose(page);await send('touchStart',point);b=await grabbed(page);
  await send('touchMove',{x:point.x+30,y:point.y-60});await page.waitForTimeout(850);
  assert(await exists(page,b.id),'Touch dragging cancels the hold');
  assert.equal(await pops(page),before);
  await send('touchEnd');await session.detach();
}
async function finish(c){
  // Enter while another hold is charging: it must not fire after teardown.
  const before=await pops(c.page);await mouseDown(c.page);
  await c.page.locator('#start-play').focus();await c.page.keyboard.press('Enter');
  await c.page.mouse.up();await c.page.waitForTimeout(800);
  assert.equal(await pops(c.page),before);
  assert.equal(await c.page.locator('#start-screen').count(),0);
  assert.equal(await c.page.evaluate(()=>window.__engine.world.bodies.length),0);
  assert(await c.page.locator('.modes').isVisible());
  assert.deepEqual(c.errors,[]);assert.deepEqual(await c.page.evaluate(()=>window.__errors),[]);
  await c.context.close();
}
try{
  for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await type.launch({headless:true,...(name==='chromium'?{args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{})});
    try{
      const c=await open(browser);await c.page.waitForTimeout(1700);
      assert.equal(await c.page.locator('#start-play').isVisible(),false);
      const before=await pops(c.page),held=await mouseDown(c.page);
      await waitForPop(c.page,held.ball.id,before);await c.page.mouse.up();
      await ready(c.page); // The filling pile replaces popped balls and can still unlock Play.
      await mouseChecks(c.page,name);
      if(name==='chromium') await touchChecks(c.context,c.page);
      await finish(c);
      const reduced=await open(browser,'reduce');await ready(reduced.page);
      const b=await mouseDown(reduced.page);await waitForPop(reduced.page,b.ball.id,0);await reduced.page.mouse.up();
      await finish(reduced);
      console.log(`PASS ${name}: hold-to-pop, grace period, quick click, drag, one pop per hold, refill, ready button, reduced motion and entry cleanup${name==='chromium'?', trusted touch and cancellation':''}.`);
    }finally{await browser.close();}
  }
}finally{server.close();}
