// Focused music integration tests; never loaded by the game.
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const baseline='4f9264588ec4b5e9c3541c91d29881d333250d01';
const before=execFileSync('git',['show',baseline+':index.html'],{cwd:root}).toString();
const after=await readFile(resolve(root,'index.html'),'utf8');
assert.equal(after.replace('<script defer src="./assets/audio/background-music.js"></script>\n',''),before,'Original game and SFX must be byte-identical');
const track=JSON.parse(await readFile(resolve(root,'assets/audio/manifest.json'),'utf8'));
assert(track.output_bytes<250000&&track.excerpt_length_seconds===30);
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.mp3':'audio/mpeg','.txt':'text/plain; charset=utf-8'};
await mkdir(resolve(root,'test-results'),{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);assert(path.startsWith('/Dahrooj/'));
    const file=resolve(root,path.slice(9)||'index.html');assert(file.startsWith(root+'/'));
    const data=await readFile(file),headers={'Content-Type':mime[extname(file)]||'application/octet-stream','Accept-Ranges':'bytes'};
    const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if(range){const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):data.length-1,data.length-1);if(start>=data.length){res.writeHead(416,{'Content-Range':`bytes */${data.length}`});return res.end();}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});res.end(data.subarray(start,end+1));}
    else{res.writeHead(200,{...headers,'Content-Length':data.length});res.end(data);}
  }catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin=`http://127.0.0.1:${server.address().port}`;
const report={baseline,original_game_and_sfx_byte_identical:true,track,browsers:[],failures:[],scope:'Focused music playback and original SFX coexistence in the goal stage, selected before the first simulated game frame. Not a new pass of the historical 60-case startup suite.',known_legacy_issue:'Prior baseline/current startup tests intermittently failed with a non-finite canvas gradient in free mode (Actions run 37037069168). The root cause has not been established conclusively. This unrelated game code remains unchanged.',limitations:'Chromium/WebKit mobile emulation, not physical iPhone listening. Visibility changes are simulated. Touch and mouse tested separately; game frame counts, rather than a fixed wall-clock delay, allow the original ball to settle on software rendering.'};
async function open(browser,failMusic=false){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});context.setDefaultTimeout(10000);
  const requests=[],errors=[];
  await context.addInitScript(()=>{
    window.__unhandled=[];window.__sfx=0;window.__gameFrames=0;window.__hidden=false;window.__stageReady=false;
    Object.defineProperty(document,'hidden',{get:()=>window.__hidden,configurable:true});
    addEventListener('unhandledrejection',e=>window.__unhandled.push(String(e.reason)));
    const raf=requestAnimationFrame.bind(window);
    window.requestAnimationFrame=f=>raf(t=>{
      if(f.name==='frame'){
        if(!window.__stageReady){document.querySelector('[data-mode="goal"]').click();window.__stageReady=true;}
        window.__gameFrames++;
      }
      f(t);
    });
    const proto=(window.AudioContext||window.webkitAudioContext)?.prototype;
    if(proto){const original=proto.createOscillator;proto.createOscillator=function(...args){window.__sfx++;return original.apply(this,args);};}
  });
  await context.route('**/*',route=>{const url=route.request().url();requests.push(url);return !url.startsWith(origin+'/')||(failMusic&&url.endsWith('.mp3'))?route.abort():route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e.stack||e)));
  await page.goto(origin+'/Dahrooj/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#btn-music');
  await page.waitForFunction(()=>window.__stageReady&&window.__gameFrames>2,null,{polling:50});
  return{context,page,requests,errors};
}
async function clean(c){assert.deepEqual(c.errors,[]);assert.deepEqual(await c.page.evaluate(()=>window.__unhandled),[]);}
async function playing(page){await page.waitForFunction(()=>{const a=document.getElementById('dahrooj-bgm');return !a.paused&&a.currentTime>.1;},null,{timeout:15000,polling:50});}
async function settle(page){const n=await page.evaluate(()=>window.__gameFrames);await page.waitForFunction(n=>window.__gameFrames>n+70,n,{timeout:20000,polling:50});}
async function swipe(page){await page.mouse.move(195,540);await page.mouse.down();await page.mouse.move(195,250,{steps:10});await page.mouse.up();}
try{
  for(const[name,type]of[['chromium',chromium],['webkit',webkit]]){
    const browser=await type.launch({headless:true,...(name==='chromium'?{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=document-user-activation-required']}:{})});
    const result={name,version:browser.version()};report.browsers.push(result);
    try{
      const touch=await open(browser);await touch.page.waitForTimeout(200);
      assert(!touch.requests.some(u=>u.endsWith('.mp3')));result.no_audio_request_before_gesture=true;
      await touch.page.locator('#btn-music').tap();await playing(touch.page);result.first_note_tap_starts_real_mp3=true;
      await touch.page.locator('#btn-music').tap();assert(await touch.page.$eval('#dahrooj-bgm',a=>a.paused));
      await touch.page.locator('#btn-music').tap();await playing(touch.page);result.touch_only_mute_resume=true;
      await clean(touch);await touch.context.close();
      const c=await open(browser),{page}=c;await page.locator('[data-mode="goal"]').click();await playing(page);
      await settle(page);await clean(c);let n=await page.evaluate(()=>window.__sfx);await swipe(page);
      await page.waitForFunction(n=>window.__sfx>n,n,{timeout:10000,polling:50});
      assert(await page.$eval('#dahrooj-bgm',a=>!a.paused));result.music_and_sfx_simultaneous=true;
      await page.locator('#btn-music').click();assert(await page.$eval('#dahrooj-bgm',a=>a.paused));
      await page.locator('[data-mode="goal"]').click();await settle(page);n=await page.evaluate(()=>window.__sfx);await swipe(page);
      await page.waitForFunction(n=>window.__sfx>n,n,{timeout:10000,polling:50});
      assert(await page.$eval('#dahrooj-bgm',a=>a.paused));result.music_only_mute_preserves_sfx=true;
      await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#btn-music');await page.waitForFunction(()=>window.__stageReady,null,{polling:50});
      assert.equal(await page.locator('#btn-music').getAttribute('aria-pressed'),'false');
      await page.locator('[data-mode="goal"]').click();assert(await page.$eval('#dahrooj-bgm',a=>!a.hasAttribute('src')));result.mute_preference_persists=true;
      await page.locator('#btn-music').click();await playing(page);
      await page.evaluate(()=>{window.__hidden=true;document.dispatchEvent(new Event('visibilitychange'));});assert(await page.$eval('#dahrooj-bgm',a=>a.paused));
      await page.evaluate(()=>{window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'));});await playing(page);result.visibility_pause_resume=true;
      await page.evaluate(()=>dispatchEvent(new Event('pagehide')));assert(await page.$eval('#dahrooj-bgm',a=>a.paused));
      await page.evaluate(()=>dispatchEvent(new Event('pageshow')));await playing(page);result.page_lifecycle=true;
      assert(await page.$eval('#dahrooj-bgm',a=>a.loop&&a.duration>=30&&a.duration<30.2));
      await page.$eval('#dahrooj-bgm',a=>{a.currentTime=a.duration-.25;});
      await page.waitForFunction(()=>{const a=document.getElementById('dahrooj-bgm');return !a.paused&&a.currentTime<3;},null,{timeout:12000,polling:50});result.short_excerpt_loops=true;
      await page.setViewportSize({width:320,height:568});await page.locator('#btn-ch').click();
      assert(await page.evaluate(()=>{const side=document.querySelector('.side').getBoundingClientRect(),panel=document.querySelector('#chpanel').getBoundingClientRect(),credit=document.querySelector('#music-credit').getBoundingClientRect(),modes=document.querySelector('.modes').getBoundingClientRect();return panel.top>=side.bottom&&credit.top>=modes.bottom&&credit.right<=innerWidth&&credit.left>=0;}));result.small_screen_controls_and_credit=true;
      await page.screenshot({path:resolve(root,`test-results/${name}-music.png`)});await clean(c);await c.context.close();
      const failed=await open(browser,true);await failed.page.locator('[data-mode="goal"]').click();await failed.page.waitForTimeout(300);
      n=await failed.page.evaluate(()=>window.__gameFrames);await failed.page.waitForFunction(n=>window.__gameFrames>n+4,n,{polling:50});
      assert.equal(await failed.page.locator('[data-mode="goal"]').getAttribute('aria-pressed'),'true');await clean(failed);await failed.context.close();result.missing_audio_does_not_stop_game=true;
      console.log('PASS',name,JSON.stringify(result));
    }finally{await browser.close();}
  }
}catch(error){report.failures.push(String(error.stack||error));console.error(error);process.exitCode=1;}
finally{server.close();await mkdir(resolve(root,'docs'),{recursive:true});await writeFile(resolve(root,'docs/music-report.json'),JSON.stringify(report,null,2)+'\n');}
