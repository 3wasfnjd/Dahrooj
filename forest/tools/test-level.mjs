import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(new URL('../../tools/package.json', import.meta.url));
const { chromium } = require('playwright');
import fs from 'node:fs/promises';
const output=resolve(process.env.FOREST_TEST_OUTPUT || 'test-results/forest');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const page=await ctx.newPage();const errors=[],failed=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
const state=()=>page.evaluate(()=>window.forestDebug());
const wait=fn=>page.waitForFunction(fn,{},{timeout:60000});
const check=(name,ok,details)=>{checks.push({name,ok,details});console.log(JSON.stringify(checks.at(-1)));if(!ok)throw Error(name);};
async function driveTo(x,jump=false){
 return page.evaluate(({x,jump})=>new Promise((resolve,reject)=>{
  const direction=window.forestDebug().player.x<x?'ArrowRight':'ArrowLeft';let airborne=false;const deadline=performance.now()+60000;
  const key=(type,code)=>document.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
  const release=()=>{key('keyup',direction);if(jump)key('keyup','Space');};
  key('keydown',direction);if(jump)key('keydown','Space');
  function tick(){const s=window.forestDebug();airborne=airborne||!s.player.grounded;
   if((direction==='ArrowRight'?s.player.x>=x:s.player.x<=x)&&(!jump||airborne&&s.player.grounded)){release();resolve(s);return;}
   if(performance.now()>deadline){release();reject(new Error('Input route timeout at '+JSON.stringify(s)));return;}requestAnimationFrame(tick);
  }requestAnimationFrame(tick);
 }),{x,jump});
}
const walkTo=x=>driveTo(x);
const jumpTo=x=>driveTo(x,true);

try {
 await page.goto((process.env.FOREST_URL || 'http://127.0.0.1:8766/forest/')+'?test=1');await wait(()=>typeof window.forestDebug==='function');await page.screenshot({path:resolve(output,'forest-mobile-welcome.png')});check('15 real models loaded',(await state()).models===15);
 await page.locator('#start').click();await walkTo(8.0);await jumpTo(10.6);check('jelly crosses first river gap',(await state()).player.y>1);
 await page.screenshot({path:resolve(output,'forest-river.png')});await walkTo(13.0);await jumpTo(15.3);await walkTo(17.3);await jumpTo(20.0);await wait(()=>window.forestDebug().checkpointIndex===1);check('river checkpoint reached',true,await state());
 await walkTo(23.9);await page.keyboard.down('ArrowRight');let t=(await state()).elapsed;await page.waitForFunction(t=>window.forestDebug().elapsed>t+.4,t);await page.keyboard.up('ArrowRight');check('jelly cannot push crate',(await state()).crate.x===25.5);
 await page.locator('[data-style="clay"]').click();await page.keyboard.down('ArrowRight');await wait(()=>window.forestDebug().gateOpen);await page.keyboard.up('ArrowRight');check('clay moves crate and opens gate',(await state()).crate.latched);await page.screenshot({path:resolve(output,'forest-gate.png')});
 await page.locator('[data-style="jelly"]').click();await jumpTo(31.5);await walkTo(41.0);check('gate checkpoint reached',(await state()).checkpointIndex===2);
 await page.locator('[data-style="bubble"]').click();await wait(()=>window.forestDebug().player.y>7.4);check('bubble rides updraft',(await state()).player.vy>0);await page.screenshot({path:resolve(output,'forest-wind.png')});
 await walkTo(46.5);await wait(()=>window.forestDebug().player.grounded);await walkTo(57.5);await wait(()=>window.forestDebug().mode==='won');check('level completed via actual inputs',true,await state());await page.screenshot({path:resolve(output,'forest-win.png')});
 await page.locator('#play-again').click();check('restart resets puzzle',(await state()).gateOpen===false&&(await state()).seedCount===0);
 await page.locator('#pause').click();t=(await state()).elapsed;await page.waitForTimeout(350);check('pause freezes physics',(await state()).elapsed===t);await page.locator('#resume').click();
 const session=await ctx.newCDPSession(page);const right=await page.locator('#right').boundingBox(),jump=await page.locator('#jump').boundingBox();
 const touches=[{id:1,x:right.x+right.width/2,y:right.y+right.height/2},{id:2,x:jump.x+jump.width/2,y:jump.y+jump.height/2}];
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches});await wait(()=>{const p=window.forestDebug().player;return p.x>2.8&&p.y>1.1;});check('two-finger movement and jump',true,await state());await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await wait(()=>Math.abs(window.forestDebug().player.vx)<.1);check('touch cancel releases movement',true);
 await page.locator('#pause').click();await page.locator('#restart').click();await page.keyboard.down('ArrowRight');await wait(()=>window.forestDebug().elapsed>2&&window.forestDebug().player.x<4);await page.keyboard.up('ArrowRight');check('river fall respawns at checkpoint',(await state()).checkpointIndex===0);await page.screenshot({path:resolve(output,'forest-start-play.png')});
 await page.setViewportSize({width:844,height:390});await page.screenshot({path:resolve(output,'forest-landscape.png')});check('landscape has no document overflow',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight));
 check('no page errors',errors.length===0,errors);check('no missing assets',failed.length===0,failed);
 await fs.writeFile(resolve(output,'forest-test-results.json'),JSON.stringify({checks,errors,failed,final:await state()},null,2));
} catch(error){console.log('FAIL',error.message);console.log(JSON.stringify(await state()));await page.screenshot({path:resolve(output,'forest-failure.png')});await fs.writeFile(resolve(output,'forest-test-results.json'),JSON.stringify({checks,errors,failed,error:error.stack,state:await state()},null,2));process.exitCode=1;}
await browser.close();
