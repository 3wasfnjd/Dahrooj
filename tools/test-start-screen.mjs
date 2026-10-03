// Opening-scene integration checks. No test hooks are shipped to players.
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    assert(pathname.startsWith('/Dahrooj/'));
    const file=resolve(root,decodeURIComponent(pathname.slice(9))||'index.html');
    assert(file.startsWith(root+'/'));
    const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir(resolve(root,'test-results'),{recursive:true});
const report={cases:[],failures:[],limitations:'Automated Chromium and WebKit mobile emulation, not a physical iPhone/Android performance or audio listening test. External visit-counter requests are disabled in the test browser.'};

async function open(browser,options={}){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2,...options});
  await context.addInitScript(()=>{
    Object.defineProperty(navigator,'onLine',{get:()=>false});
    window.__errors=[];window.__styleSprites=[];window.__physicsFrames=0;
    window.addEventListener('unhandledrejection',e=>window.__errors.push(String(e.reason)));
    let matter;
    Object.defineProperty(window,'Matter',{configurable:true,get:()=>matter,set(value){
      matter=value;
      const create=value.Engine.create,update=value.Engine.update;
      value.Engine.create=function(...args){window.__introEngine=create.apply(this,args);return window.__introEngine;};
      value.Engine.update=function(...args){window.__physicsFrames++;return update.apply(this,args);};
    }});
    let start;
    Object.defineProperty(window,'createDahroojStart',{get:()=>start,set(value){
      start=options=>{
        const make=options.makeSprite;
        options.makeSprite=(style,face)=>{window.__styleSprites.push(style);return make(style,face);};
        return value(options);
      };
    }});
  });
  await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack||e)));
  await page.goto(origin+'/Dahrooj/',{waitUntil:'load'});
  return {context,page,errors};
}
async function clean(c){
  assert.deepEqual(c.errors,[],'Uncaught browser exceptions');
  assert.deepEqual(await c.page.evaluate(()=>window.__errors),[],'Unhandled rejections');
  assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
}
async function ready(page){
  await page.waitForFunction(()=>document.querySelector('#start-screen')?.dataset.state==='ready',null,{timeout:18000});
  assert(await page.locator('#start-play').isVisible());
}
async function state(page){
  return page.evaluate(()=>{
    const bodies=window.__introEngine.world.bodies.filter(b=>!b.isStatic);
    return {count:bodies.length,styles:[...new Set(bodies.map(b=>b.label))].sort(),
      sprites:[...new Set(window.__styleSprites)].sort(),
      finite:bodies.every(b=>Number.isFinite(b.position.x+b.position.y+b.angle)),
      highColumns:Array.from({length:12},(_,i)=>bodies.some(b=>b.speed<6 &&
        Math.abs(b.position.x-(i+.5)*innerWidth/12)<b.circleRadius &&
        b.position.y-b.circleRadius<innerHeight*.12 && b.position.y+b.circleRadius>0)).filter(Boolean).length};
  });
}
async function choose(page){
  return page.evaluate(()=>window.__introEngine.world.bodies.filter(b=>!b.isStatic &&
    b.position.x>55 && b.position.x<innerWidth-55 && b.position.y>innerHeight*.32 && b.position.y<innerHeight*.47)
    .map(b=>({id:b.id,x:b.position.x,y:b.position.y}))[0]);
}
async function mouseDrag(page){
  const b=await choose(page);assert(b,'A ball is available to grab');
  await page.mouse.move(b.x,b.y);await page.mouse.down();
  await page.mouse.move(b.x+45,b.y-110,{steps:12});
  await page.waitForTimeout(180);
  const y=await page.evaluate(id=>window.__introEngine.world.bodies.find(b=>b.id===id).position.y,b.id);
  assert(y<b.y-35,'Dragging moves the selected physics body');
  await page.mouse.up();
  assert.equal(await page.evaluate(()=>window.__introEngine.world.constraints.length),0);
}
async function touchDrag(context,page){
  const b=await choose(page);assert(b);
  const session=await context.newCDPSession(page);
  const send=(type,x,y)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1,radiusX:8,radiusY:8,force:1}]});
  await send('touchStart',b.x,b.y);
  for(let i=1;i<=10;i++){
    await send('touchMove',b.x+i*3,b.y-i*10);await page.waitForTimeout(20);
  }
  const y=await page.evaluate(id=>window.__introEngine.world.bodies.find(b=>b.id===id).position.y,b.id);
  assert(y<b.y-35,'Trusted touch moves the physics body');
  await send('touchCancel');
  assert.equal(await page.evaluate(()=>window.__introEngine.world.constraints.length),0,'Cancelled touch releases the ball');
  await session.detach();
}
async function enter(c){
  await c.page.locator('#start-play').tap();
  assert.equal(await c.page.locator('#start-screen').count(),0);
  assert(await c.page.locator('.modes').isVisible());
  assert.equal(await c.page.evaluate(()=>window.__introEngine.world.bodies.length),0);
  const n=await c.page.evaluate(()=>window.__physicsFrames);
  await c.page.waitForTimeout(500);
  assert.equal(await c.page.evaluate(()=>window.__physicsFrames),n,'Intro physics stops on entry');
  await c.page.waitForFunction(()=>{const a=document.querySelector('#dahrooj-bgm');return !a.paused&&a.currentTime>0;},null,{timeout:10000});
  await c.page.locator('#btn-music').tap();
  assert(await c.page.$eval('#dahrooj-bgm',a=>a.paused),'Existing music control still works');
  for(const mode of ['goal','hoop','window','padel','cans','free']){
    await c.page.locator(`[data-mode="${mode}"]`).tap();
    assert.equal(await c.page.locator(`[data-mode="${mode}"]`).getAttribute('aria-pressed'),'true');
    await c.page.waitForTimeout(120);await clean(c);
  }
  for(const style of ['jelly','fabric','clay','fur','bubble']){
    await c.page.locator(`[data-style="${style}"]`).tap();
    assert.equal(await c.page.locator(`[data-style="${style}"]`).getAttribute('aria-pressed'),'true');
    await clean(c);
  }
}

try{
  for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await type.launch({headless:true,...(name==='chromium'?{args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{})});
    try{
      const c=await open(browser),start=Date.now();
      assert.equal(await c.page.locator('#start-play').isVisible(),false,'No premature start button');
      assert.equal(await c.page.locator('.modes').isVisible(),false);
      assert.equal(await c.page.$eval('#dahrooj-bgm',a=>a.hasAttribute('src')),false,'No audio before a gesture');
      await c.page.waitForTimeout(1700);
      await c.page.screenshot({path:resolve(root,`test-results/${name}-start-falling.png`)});
      await ready(c.page);const result=await state(c.page);
      assert(result.count>40 && result.count<=180 && result.finite && result.highColumns>=9);
      assert.deepEqual(result.styles,['bubble','clay','fabric','fur','jelly']);
      assert.deepEqual(result.styles,result.sprites,'Every style uses the original renderer');
      await c.page.screenshot({path:resolve(root,`test-results/${name}-start-ready.png`)});
      await mouseDrag(c.page);
      if(name==='chromium') await touchDrag(c.context,c.page);
      await c.page.setViewportSize({width:844,height:390});
      await c.page.waitForTimeout(500);await clean(c);
      assert(await c.page.locator('#start-play').isVisible());
      await c.page.screenshot({path:resolve(root,`test-results/${name}-start-landscape.png`)});
      await c.page.setViewportSize({width:390,height:844});
      await enter(c);await clean(c);
      report.cases.push({browser:name,viewport:'390×844 / 844×390',case_duration_seconds:Math.round((Date.now()-start)/100)/10,...result,drag:true,touch_cancel:name==='chromium',entry_and_cleanup:true,music:true,all_modes_and_styles:true});
      await c.context.close();

      const small=await open(browser,{viewport:{width:320,height:568},reducedMotion:'reduce'});
      await ready(small.page);await clean(small);
      assert.equal(await small.page.$eval('#start-play',e=>getComputedStyle(e).animationName),'none');
      await small.page.locator('#start-play').focus();await small.page.keyboard.press('Enter');
      assert(await small.page.locator('.modes').isVisible());
      await clean(small);report.cases.push({browser:name,viewport:'320×568',reduced_motion:true,keyboard_entry:true});
      await small.context.close();
      console.log(`PASS ${name}: falling pile, original styles, drag, resize, entry, cleanup, music, modes and reduced motion.`);
    }finally{await browser.close();}
  }
}catch(error){report.failures.push(String(error.stack||error));console.error(error);process.exitCode=1;}
finally{
  server.close();await writeFile(resolve(root,'test-results/start-screen-report.json'),JSON.stringify(report,null,2)+'\n');
}
