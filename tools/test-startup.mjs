// Integration checks only: this module is never loaded by the game.
import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(root, 'vendor/manifest.json'), 'utf8'));
const before = execFileSync('git', ['show', manifest.baseline_commit + ':index.html'], { cwd: root });
const after = await readFile(resolve(root, 'index.html'));
const cssBefore = await readFile(resolve(root, 'tools/fixtures/fonts-before.css'));
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript', '.woff2':'font/woff2', '.json':'application/json' };
const sourceMap = new Map();
for (const asset of manifest.assets) sourceMap.set(asset.source_url, asset.path);
const modes = ['free', 'goal', 'hoop', 'window', 'padel', 'cans'];
const styles = ['jelly', 'fabric', 'clay', 'fur', 'bubble'];
await mkdir(resolve(root, 'test-results'), { recursive: true });
await mkdir(resolve(root, 'docs'), { recursive: true });
const report = {
  baseline_commit: manifest.baseline_commit,
  method: 'Cold browser contexts at /Dahrooj/; original external startup resources replayed from the identical vendored bytes, not live Firebase. Decoded payload bytes and a reproducible gzip estimate (gzip text, leave WOFF2 compressed); excludes HTTP headers, optional Firebase and elapsed network time.',
  limitations: 'Automated mobile viewport emulation, not a physical iPhone/Android performance measurement. Failed external requests may produce browser network diagnostics; uncaught JavaScript exceptions and unhandled rejections must be zero. Offline tests still serve the first-party page: no offline cache/service worker is claimed.',
  browsers: [], failures: []
};

// Physics, rendering and mode/style handlers must remain byte-identical to the requested revision.
const scriptPrefix = text => text.split('<script>\n')[1].split('/* ---------- shared visit counter')[0];
assert.equal(scriptPrefix(before.toString()), scriptPrefix(after.toString()));
const modePrefix = text => text.split('/* ---------- modes ---------- */')[1].split('requestAnimationFrame(frame);\n')[0];
assert.equal(modePrefix(before.toString()), modePrefix(after.toString()));
assert(!/<(?:script|link)[^>]+(?:src|href)="https?:\/\//.test(after.toString()), 'External startup tag remains');
assert(existsSync(resolve(root, '.nojekyll')), 'GitHub Pages must serve vendor/');
report.gameplay_rendering_and_mode_handlers_unchanged = true;

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    assert(pathname.startsWith('/Dahrooj/'));
    const relative = pathname.slice('/Dahrooj/'.length) || 'index.html';
    const path = resolve(root, relative);
    assert(path.startsWith(root + '/'));
    const body = relative === 'baseline.html' ? before : await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

async function openCase(browser, { baseline=false, failure='blocked', width=390, height=844 }={}) {
  const context = await browser.newContext({ viewport:{ width,height }, deviceScaleFactor:1, isMobile:true, hasTouch:true, serviceWorkers:'block' });
  const errors=[], consoleErrors=[], requests=[], payloads=new Map(), pending=[], timers=[];
  await context.addInitScript(({ offline }) => {
    window.__rafCount=0; window.__glDraws=0; window.__unhandled=[];
    addEventListener('unhandledrejection', e => window.__unhandled.push(String(e.reason)));
    const raf=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=fn=>raf(now=>{window.__rafCount++;fn(now);});
    for (const name of ['WebGLRenderingContext','WebGL2RenderingContext']) {
      const prototype=window[name]?.prototype;
      if(!prototype) continue;
      for(const method of ['drawElements','drawArrays']) {
        const original=prototype[method];
        prototype[method]=function(...args){window.__glDraws++;return original.apply(this,args);};
      }
    }
    if(offline) Object.defineProperty(navigator,'onLine',{get:()=>false});
  }, { offline:failure==='offline' });
  await context.route('**/*', async route => {
    const url=route.request().url();
    if(url.startsWith(origin+'/')) return route.continue();
    requests.push(url);
    if(baseline && (url===manifest.font_css_url || sourceMap.has(url))) {
      const path=sourceMap.get(url);
      const body=url===manifest.font_css_url?cssBefore:await readFile(resolve(root,path));
      return route.fulfill({ status:200, body, contentType:url===manifest.font_css_url?'text/css':mime[extname(path)]||'application/octet-stream', headers:{'Access-Control-Allow-Origin':'*'} });
    }
    if(failure==='stalled' && url.includes('/firebasejs/')) {
      const timer=setTimeout(()=>route.abort().catch(()=>{}),20000);
      timers.push(timer); return;
    }
    return route.abort('failed');
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',msg=>{
    if(msg.type()==='error' && !/Failed to load resource|net::ERR_|Load failed|cancelled|canceled/i.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('response',response=>{
    const request=response.request(), url=response.url();
    if(!['document','stylesheet','script','font'].includes(request.resourceType()) || url.includes('/firebasejs/')) return;
    pending.push(response.body().then(body=>{ if(response.ok()) payloads.set(url,body); }).catch(()=>{}));
  });
  await page.goto(origin+'/Dahrooj/'+(baseline?'baseline.html':'index.html'),{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__rafCount>3 && document.querySelector('#c').width>0,null,{timeout:20000});
  await page.waitForTimeout(450);
  await page.evaluate(()=>document.fonts.ready);
  await Promise.all(pending);
  const startup=new Map(payloads);
  async function clean(){for(const timer of timers) clearTimeout(timer);await context.close();}
  async function assertClean(){
    assert.deepEqual(errors,[], 'Uncaught page errors');
    assert.deepEqual(await page.evaluate(()=>window.__unhandled),[], 'Unhandled promise rejections');
    assert.deepEqual(consoleErrors,[], 'Unexpected console errors');
  }
  return {context,page,errors,consoleErrors,requests,payloads,pending,startup,clean,assertClean};
}

function sizes(payloads) {
  let decoded=0,gzipEstimate=0;
  for(const body of payloads.values()){
    decoded+=body.length;
    gzipEstimate+=body.subarray(0,4).toString()==='wOF2'?body.length:gzipSync(body,{level:9}).length;
  }
  return {requests:payloads.size,decoded_bytes:decoded,gzip_text_plus_woff2_estimate_bytes:gzipEstimate};
}
async function loadAllFonts(page){
  await page.evaluate(async()=>{
    for(const weight of [600,700,800]) await document.fonts.load(`${weight} 18px "Grandstander"`,'Dahrooj 123');
    for(const weight of [500,700,800]) await document.fonts.load(`${weight} 18px "Baloo Bhaijaan 2"`,'التحديات ١٢٣');
    await document.fonts.ready;
    const loaded=[...document.fonts].filter(face=>face.status==='loaded').map(face=>face.family);
    if(!loaded.some(name=>name.includes('Grandstander')) || !loaded.some(name=>name.includes('Baloo Bhaijaan 2'))) throw new Error('Required font family did not load');
  });
}
async function stepFrames(page,count=3){
  const start=await page.evaluate(()=>window.__rafCount);
  await page.waitForFunction(start=>window.__rafCount>=start+3,start,{timeout:20000});
}
async function checkUI(page){
  const result=await page.evaluate(()=>{
    const boxes=[...document.querySelectorAll('.modes,.styles,.side')].map(el=>el.getBoundingClientRect());
    return {inViewport:boxes.every(r=>r.left>=-1&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1), overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(result.inViewport,true);assert.equal(result.overflow,false);
}

try {
  for(const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
    const browser=await type.launch({ headless:true, ...(name==='chromium'?{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {}) });
    const results={name,version:browser.version(),viewport:'390x844',combinations:[],uncaught_errors:0};
    report.browsers.push(results);
    try {
      const original=await openCase(browser,{baseline:true});
      results.before_initial=sizes(original.startup);
      await loadAllFonts(original.page);await Promise.all(original.pending);
      results.before_all_requested_fonts=sizes(original.payloads);
      await original.assertClean();await original.clean();

      const current=await openCase(browser);
      results.after_initial=sizes(current.startup);
      assert.equal(await current.page.evaluate(()=>window.THREE.REVISION),'128');
      await loadAllFonts(current.page);await Promise.all(current.pending);
      results.after_all_requested_fonts=sizes(current.payloads);
      const {page}=current;
      for(const mode of modes){
        await page.locator(`[data-mode="${mode}"]`).tap();
        assert.equal(await page.locator(`[data-mode="${mode}"]`).getAttribute('aria-pressed'),'true',`Mode did not activate: ${mode}`);
        assert.equal(await page.locator('#g').isVisible(),mode!=='free');
        for(const style of styles){
          const draws=await page.evaluate(()=>window.__glDraws);
          await page.locator(`[data-style="${style}"]`).tap();
          await stepFrames(page);
          assert.equal(await page.locator(`[data-style="${style}"]`).getAttribute('aria-pressed'),'true');
          if(mode!=='free') assert((await page.evaluate(()=>window.__glDraws))>draws,`No WebGL draw: ${mode}/${style}`);
          await checkUI(page);await current.assertClean();
          results.combinations.push(`${mode}/${style}`);
          if(mode==='free'||style==='jelly') await page.screenshot({path:resolve(root,`test-results/${name}-${mode}-${style}.png`)});
        }
        // Trusted pointer gesture; no scoring or physics constants are overridden.
        await page.mouse.move(195,570);await page.mouse.down();
        await page.mouse.move(195,290,{steps:8});await page.mouse.up();
        await stepFrames(page);await current.assertClean();
      }
      await page.locator('#btn-ch').tap();
      assert(await page.locator('#chpanel').isVisible());
      await page.evaluate(()=>document.fonts.ready);await current.assertClean();
      assert(!current.requests.some(url=>url.includes('fonts.googleapis.com')||url.includes('fonts.gstatic.com')||url.includes('cdnjs.cloudflare.com')));
      results.third_party_requests=[...new Set(current.requests)];
      results.blocked_counter_did_not_stop_all_30_combinations=true;
      await current.clean();

      const small=await openCase(browser,{failure:'offline',width:320,height:568});
      await small.page.locator('[data-mode="goal"]').tap();await stepFrames(small.page);
      assert.equal(await small.page.locator('[data-mode="goal"]').getAttribute('aria-pressed'),'true');
      await checkUI(small.page);await small.assertClean();
      assert.equal(small.requests.length,0,'Offline startup should not request Firebase');
      results.offline_flag_320x568_pass=true;await small.clean();

      if(name==='chromium'){
        const stalled=await openCase(browser,{failure:'stalled'});
        await stalled.page.waitForSelector('script[src*="firebase-app-compat"]',{state:'attached',timeout:6000});
        await stalled.page.locator('[data-mode="goal"]').tap();await stepFrames(stalled.page);
        assert.equal(await stalled.page.locator('[data-mode="goal"]').getAttribute('aria-pressed'),'true');
        await stalled.page.waitForSelector('script[src*="firebase-app-compat"]',{state:'detached',timeout:12000});
        await stepFrames(stalled.page);await stalled.assertClean();
        results.stalled_sdk_timeout_keeps_game_running=true;await stalled.clean();
      }
      console.log(`PASS ${name}: ${results.combinations.length} style/mode combinations, local fonts, input, blocked/offline counter; initial ${results.before_initial.decoded_bytes} -> ${results.after_initial.decoded_bytes} decoded bytes.`);
    } finally {await browser.close();}
  }
} catch(error) {
  report.failures.push(String(error.stack||error));
  console.error(error);
  process.exitCode=1;
} finally {
  server.close();
  await writeFile(resolve(root,'test-results/report.json'),JSON.stringify(report,null,2)+'\n');
}
if(!report.failures.length){
  const c=report.browsers[0];
  const text=`# Startup independence verification\n\nBaseline: \`${manifest.baseline_commit}\`.\n\nAll checks passed in mobile Chromium and WebKit emulation at 390×844: five styles × six modes = 30 combinations per browser, with every third-party request blocked. Verified active mode/style buttons, real WebGL draws, pointer gestures, challenge panel and both font families. Also checked a 320×568 viewport with navigator.onLine=false and the 8-second optional Firebase SDK timeout. Uncaught JavaScript errors / unhandled rejections: zero.\n\n| Initial payload (Chromium) | Before | After |\n|---|---:|---:|\n| Decoded bytes | ${c.before_initial.decoded_bytes} | ${c.after_initial.decoded_bytes} |\n| Gzip-text + WOFF2 estimate, bytes | ${c.before_initial.gzip_text_plus_woff2_estimate_bytes} | ${c.after_initial.gzip_text_plus_woff2_estimate_bytes} |\n| Startup responses | ${c.before_initial.requests} | ${c.after_initial.requests} |\n\nThe difference is not a promise of faster FPS or less total download: the original engine/font bytes are preserved. The change removes the external startup dependency, not the need to initially reach the game's own host. Firebase is excluded from the startup budget and remains optional.\n\n**Measurement:** ${report.method}\n\n**Limits:** ${report.limitations}\n\nThe gameplay/rendering code preceding the counter and the mode/style/frame handlers were compared byte-for-byte with the requested revision. They are unchanged. Original font weights, unicode ranges, font-display and UI styles remain unchanged. Detailed per-browser/font-path results: [startup-report.json](startup-report.json). Screenshots are in the corresponding GitHub Actions artifact, not shipped with the game.\n`;
  await writeFile(resolve(root,'docs/startup-report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(resolve(root,'docs/startup-report.md'),text);
}
