// Music integration checks; not shipped as runtime code.
import {chromium, webkit} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const before=execFileSync('git',['show','4f9264588ec4b5e9c3541c91d29881d333250d01:index.html'],{cwd:root}).toString();
const after=await readFile(resolve(root,'index.html'),'utf8');
assert.equal(after.replace('<script defer src="./assets/audio/background-music.js"></script>\n',''),before,'The entire original game and all SFX must remain byte-identical');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.mp3':'audio/mpeg','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try {
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    assert(path.startsWith('/Dahrooj/'));
    const file=resolve(root,path.slice(9)||'index.html');
    assert(file.startsWith(root+'/'));
    const data=await readFile(file);
    const headers={'Content-Type':mime[extname(file)]||'application/octet-stream','Accept-Ranges':'bytes'};
    const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if(range){const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):data.length-1,data.length-1);if(start>=data.length){res.writeHead(416,{'Content-Range':`bytes */${data.length}`});return res.end();}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});res.end(data.subarray(start,end+1));}
    else {res.writeHead(200,{...headers,'Content-Length':data.length});res.end(data);}
  } catch {res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin=`http://127.0.0.1:${server.address().port}`;
const report={baseline:'4f9264588ec4b5e9c3541c91d29881d333250d01',original_game_and_sfx_byte_identical:true,track:JSON.parse(await readFile(resolve(root,'assets/audio/manifest.json'),'utf8')),browsers:[],failures:[],limitations:'Automated Chromium and WebKit mobile emulation, not a physical iPhone listening or performance test. Sound level is measured from decoded audio samples; perceived loudness depends on the device.'};
async function open(browser,failMusic=false){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const requests=[],errors=[];
  await context.addInitScript(()=>{
    window.__unhandled=[];window.__sfx=0;window.__frames=0;window.__hidden=false;
    Object.defineProperty(document,'hidden',{get:()=>window.__hidden,configurable:true});
    addEventListener('unhandledrejection',e=>window.__unhandled.push(String(e.reason)));
    const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=f=>raf(t=>{window.__frames++;f(t);});
    const proto=(window.AudioContext||window.webkitAudioContext)?.prototype;
    if(proto){const original=proto.createOscillator;proto.createOscillator=function(...args){window.__sfx++;return original.apply(this,args);};}
  });
  await context.route('**/*',route=>{
    const url=route.request().url();requests.push(url);
    if(!url.startsWith(origin+'/')||(failMusic&&url.endsWith('.mp3')))return route.abort();
    return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(origin+'/Dahrooj/',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#btn-music');
  return {context,page,requests,errors};
}
async function clean(c){assert.deepEqual(c.errors,[]);assert.deepEqual(await c.page.evaluate(()=>window.__unhandled),[]);}
async function swipe(page){await page.mouse.move(195,540);await page.mouse.down();await page.mouse.move(195,250,{steps:10});await page.mouse.up();}
try {
  for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await type.launch({headless:true,...(name==='chromium'?{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=document-user-activation-required']}:{})});
    const result={name,version:browser.version()};report.browsers.push(result);
    try{
      const c=await open(browser),{page}=c;
      await page.waitForTimeout(600);
      assert(!c.requests.some(u=>u.endsWith('.mp3')),'Music must not download before a gesture');
      assert(await page.$eval('#dahrooj-bgm',a=>a.paused&&!a.hasAttribute('src')));
      result.no_music_before_interaction=true;
      await page.locator('[data-mode="goal"]').tap();
      await page.waitForFunction(()=>{const a=document.getElementById('dahrooj-bgm');return !a.paused&&a.currentTime>.15;},null,{timeout:20000});
      assert(await page.$eval('#dahrooj-bgm',a=>a.loop));
      result.real_mp3_playback=true;
      await page.waitForTimeout(1800);const sfxBefore=await page.evaluate(()=>window.__sfx);
      await swipe(page);await page.waitForFunction(n=>window.__sfx>n,sfxBefore,{timeout:15000});
      assert(await page.$eval('#dahrooj-bgm',a=>!a.paused));result.sfx_and_music_simultaneous=true;
      await page.locator('#btn-music').tap();assert(await page.$eval('#dahrooj-bgm',a=>a.paused));
      assert.equal(await page.locator('#btn-music').getAttribute('aria-pressed'),'false');
      await page.locator('[data-mode="free"]').tap();const mutedSfx=await page.evaluate(()=>window.__sfx);
      await page.mouse.move(180,400);await page.mouse.down();await page.waitForTimeout(1000);await page.mouse.up();
      await page.waitForFunction(n=>window.__sfx>n,mutedSfx,{timeout:15000});
      assert(await page.$eval('#dahrooj-bgm',a=>a.paused));result.music_only_mute_preserves_sfx=true;
      await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#btn-music');
      assert.equal(await page.locator('#btn-music').getAttribute('aria-pressed'),'false');
      await page.locator('[data-mode="goal"]').tap();assert(await page.$eval('#dahrooj-bgm',a=>!a.hasAttribute('src')));result.mute_preference_persists=true;
      await page.locator('#btn-music').tap();await page.waitForFunction(()=>document.getElementById('dahrooj-bgm').currentTime>.1,null,{timeout:20000});
      await page.evaluate(()=>{window.__hidden=true;document.dispatchEvent(new Event('visibilitychange'));});
      assert(await page.$eval('#dahrooj-bgm',a=>a.paused));
      await page.evaluate(()=>{window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'));});
      await page.waitForFunction(()=>!document.getElementById('dahrooj-bgm').paused);result.hide_pause_resume=true;
      await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert(await page.$eval('#dahrooj-bgm',a=>a.paused));
      await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await page.waitForFunction(()=>!document.getElementById('dahrooj-bgm').paused);result.page_lifecycle=true;
      await page.$eval('#dahrooj-bgm',a=>{a.currentTime=a.duration-.3;});
      await page.waitForFunction(()=>{const a=document.getElementById('dahrooj-bgm');return a.currentTime<3&&!a.paused;},null,{timeout:12000});result.loop_wraps=true;
      await page.setViewportSize({width:320,height:568});await page.locator('#btn-ch').tap();
      assert(await page.evaluate(()=>{const side=document.querySelector('.side').getBoundingClientRect(),panel=document.querySelector('#chpanel').getBoundingClientRect(),credit=document.querySelector('#music-credit').getBoundingClientRect(),modes=document.querySelector('.modes').getBoundingClientRect();return panel.top>=side.bottom&&credit.top>=modes.bottom&&credit.right<=innerWidth&&credit.left>=0;}));result.small_screen_controls_and_credit=true;
      await page.screenshot({path:resolve(root,`test-results/${name}-music.png`)});
      await clean(c);await c.context.close();
      const failed=await open(browser,true);await failed.page.locator('[data-mode="goal"]').tap();await failed.page.waitForTimeout(700);
      const f=await failed.page.evaluate(()=>window.__frames);await failed.page.waitForFunction(n=>window.__frames>n+4,f);
      assert.equal(await failed.page.locator('[data-mode="goal"]').getAttribute('aria-pressed'),'true');await clean(failed);result.missing_music_does_not_break_game=true;await failed.context.close();
      console.log('PASS music',name,JSON.stringify(result));
    } finally {await browser.close();}
  }
} catch(error){report.failures.push(String(error.stack||error));console.error(error);process.exitCode=1;}
finally {server.close();await mkdir(resolve(root,'docs'),{recursive:true});await writeFile(resolve(root,'docs/music-report.json'),JSON.stringify(report,null,2)+'\n');}
