/* Dahrooj: The Enchanted Forest — first playable chapter. Aboden Games. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (a, b, t) => a + (b - a) * t;
const styles = ['jelly', 'clay', 'bubble'];
const styleNames = { jelly: 'هلام', clay: 'طين', bubble: 'فقاعة' };
const R = .64, STEP = 1 / 120;
const islands = [
  { l: -6, r: 9.2, top: 0, depth: 4.8 },
  { l: 10.6, r: 14, top: .45, depth: 3.5, rock: true },
  { l: 15.3, r: 18.3, top: .85, depth: 3.9, rock: true },
  { l: 19.6, r: 44, top: 0, depth: 4.8 },
  { l: 44.1, r: 64, top: 5.7, depth: 10.5 }
];
const p = { x: 2.5, y: R, vx: 0, vy: 0, style: 'jelly', grounded: true, coyote: .1, jumpBuffer: 0, impact: 0, look: 1 };
const crate = { x: 25.5, y: 0, w: 1.55, h: 1.55, latched: false };
const plateX = 30.2, gateX = 34.2;
let mode = 'loading', scene, renderer, camera, ball, shadow, art, ballTexture, crateModel, gate, gateGlow, pressurePlate, chest, goalLight;
let models = {}, decorations = [], seeds = [], sparkles = [], windLines = [], worldTime = 0;
let elapsed = 0, seedCount = 0, checkpoint = { x: 2.5, y: R }, checkpointIndex = 0;
let stage = -1, ready = false, gateOpen = false, gateAmount = 0, finishTimer = 0, toastTimer = 0, respawnTimer = 0;
let cameraX = 5, cameraY = 3.1, audioCtx, muted = false, totalFrames = 0, sampledFrameMs = [];
const keys = new Set(), pointers = new Map();
let actionDown = false, previousAction = false, heroArt = [], portrait = false;
const rng = (() => { let s = 231128; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();

function tone(freq, duration = .13, volume = .035, type = 'sine', end = freq) {
  if (muted || !audioCtx || audioCtx.state !== 'running') return;
  const oscillator = audioCtx.createOscillator(), gain = audioCtx.createGain(), now = audioCtx.currentTime;
  oscillator.type = type; oscillator.frequency.setValueAtTime(freq, now); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + .015); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  oscillator.connect(gain); gain.connect(audioCtx.destination); oscillator.start(now); oscillator.stop(now + duration + .02);
}
function unlockAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
}
function toast(message) {
  $('toast').textContent = message; $('toast').classList.add('show'); toastTimer = 3.1;
}
function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: .95, ...extra }); }
function mesh(geometry, material, x, y, z) {
  const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); scene.add(object); return object;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,244,163,1)'); gradient.addColorStop(.18, 'rgba(255,232,130,.9)'); gradient.addColorStop(.45, 'rgba(255,211,102,.3)'); gradient.addColorStop(1, 'rgba(255,207,101,0)');
  g.fillStyle = gradient; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
let glowMap;
function glow(x, y, z, size, color = 0xffdf90) {
  const object = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  object.position.set(x, y, z); object.scale.set(size, size, 1); scene.add(object); return object;
}
function spawnModel(id, x, y, z, height, rotation = 0, cull = true) {
  const source = models[id]; if (!source) return new THREE.Group();
  const object = source.scene.clone(true), wrapper = new THREE.Group();
  const box = new THREE.Box3().setFromObject(object), extent = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const scale = height / Math.max(extent.y, .001); object.scale.setScalar(scale);
  object.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  wrapper.add(object); wrapper.position.set(x, y, z); wrapper.rotation.y = rotation;
  object.traverse(child => { if (child.isMesh) { child.castShadow = false; child.receiveShadow = true; } });
  scene.add(wrapper); if (cull) decorations.push(wrapper); return wrapper;
}
function islandShape(width, depth) {
  const w = width / 2, d = depth / 2, corner = Math.min(.65, width * .14), shape = new THREE.Shape();
  shape.moveTo(-w + corner, -d); shape.lineTo(w - corner, -d); shape.lineTo(w, -d + corner);
  shape.lineTo(w, d - corner); shape.lineTo(w - corner, d); shape.lineTo(w * .35, d + .13);
  shape.lineTo(-w * .3, d - .12); shape.lineTo(-w + corner, d); shape.lineTo(-w, d - corner); shape.lineTo(-w, -d + corner); shape.closePath(); return shape;
}
function platform(island) {
  const w = island.r - island.l, x = (island.l + island.r) / 2;
  const shape = islandShape(w, island.rock ? 3.7 : 5.8);
  function layer(top, depth, color) {
    const geo = new THREE.ExtrudeGeometry(shape, { steps: 1, depth, bevelEnabled: false }); geo.rotateX(Math.PI / 2);
    return mesh(geo, mat(color), x, top, -.85);
  }
  if (!island.rock) layer(island.top - .2, island.depth, 0x575b46);
  layer(island.top + .015, island.rock ? .11 : .25, island.rock ? 0x86946b : 0x66884e);
  if (!island.rock) {
    layer(island.top - 1.4, .2, 0x68654c);
    for (let xx = island.l + .8; xx < island.r - .4; xx += 2.3) {
      spawnModel(rng() > .5 ? 'Rock_Medium_1' : 'Rock_Medium_3', xx, island.top - 2.0, 1.55, 1.4 + rng() * .7, rng() * 6.28);
    }
  } else {
    const body=spawnModel('Rock_Medium_3', x, island.top - 2.8, -.85, 2.8, 0);
    const size=new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());body.scale.x=w/size.x;body.scale.z=3.7/size.z;
    spawnModel('Grass_Common_Short', x + .5, island.top, -1.7, .35, 1.2);
  }
}
function buildWorld() {
  glowMap = glowTexture();
  scene.background = new THREE.Color(0xcbdcc1); scene.fog = new THREE.Fog(0xcbdcc1, 32, 100);
  scene.add(new THREE.HemisphereLight(0xfff6d7, 0x698170, .8));
  const sun = new THREE.DirectionalLight(0xffe6b7, 1.1); sun.position.set(-15, 25, 16); scene.add(sun);
  const bounce = new THREE.DirectionalLight(0xa4dad0, .33); bounce.position.set(15, 7, -10); scene.add(bounce);
  // Distant forest silhouettes sit behind the actual playable assets.
  const mountainColors = [0xb0c9ad, 0x9dbda2, 0x89ac92];
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 10; i++) {
      const mound = mesh(new THREE.IcosahedronGeometry(1, 1), mat(mountainColors[layer]), -28 + i * 15, -2 + rng() * 2, -49 + layer * 10);
      mound.scale.set(12 + rng() * 7, 12 + rng() * 11, 8);
    }
  }
  const water = mesh(new THREE.PlaneGeometry(115, 22), new THREE.MeshBasicMaterial({ color: 0x659f9d, transparent: true, opacity: .9 }), 25, -2.1, -1);
  water.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 26; i++) {
    const line = mesh(new THREE.PlaneGeometry(.7 + rng() * 2.8, .035), new THREE.MeshBasicMaterial({ color: 0xc5ece0, transparent: true, opacity: .32 }), -15 + rng() * 95, -2.07, -7 + rng() * 13);
    line.rotation.x = -Math.PI / 2; line.userData.speed = .12 + rng() * .2; line.userData.origin = line.position.x; windLines.push({ water: true, mesh: line });
  }
  islands.forEach(platform);
  // Tall silhouettes frame the track; all interaction stays on the visible front path.
  const trees = [[-4,0,-3,10,0],[.7,0,-4.2,11,1],[6.9,0,-4.1,9,2],[20.2,0,-4,9.5,1],[24,0,-5.3,11,0],[29,0,-4.9,9,2],[36.3,0,-5,12,0],[38.2,0,-6.5,8,1],[46,5.7,-4.7,9,2],[51.2,5.7,-5.2,11,0],[60.7,5.7,-4.7,10,1]];
  const treeIds = ['CommonTree_1','CommonTree_5','Pine_2'];
  trees.forEach(([x,y,z,h,id]) => spawnModel(treeIds[id],x,y,z,h,rng()*6.28));
  // A second, paler forest gives the scene depth without adding obstacles.
  for (let x = -12; x < 77; x += 8.5) {
    const tree = spawnModel(treeIds[Math.floor(rng()*3)], x, -2, -14, 12 + rng()*5, rng()*6);
    tree.traverse(child => { if(child.isMesh){ child.material=child.material.clone(); child.material.color.lerp(new THREE.Color(0x9fc2a8),.3); } });
  }
  for (const island of islands.filter(i => !i.rock)) {
    for (let x = island.l + 1; x < island.r - .6; x += 1.8) {
      if (Math.abs(x-2.5)<.9 || Math.abs(x-plateX)<1.5 || Math.abs(x-41.7)<1.6 || Math.abs(x-58)<1.6) continue;
      spawnModel('Grass_Common_Short',x,island.top,-1.5-rng(),.22+rng()*.25,rng()*6);
      if (rng()>.25) spawnModel(rng()>.5?'Fern_1':'Bush_Common',x+.4,island.top,-2.4,.5+rng()*.5,rng()*6);
      if (rng()>.65) spawnModel('Flower_3_Group',x,island.top,1.2,.37,rng()*6);
    }
  }
  for (const [x,y,z,h] of [[-1,0,.9,.45],[5.5,0,-1.4,.6],[21.2,0,.9,.5],[36.5,0,1,.45],[49,5.7,.9,.65],[61,5.7,1.1,.5]]) spawnModel('Mushroom_Common',x,y,z,h,.7);
  spawnModel('Barrel',22.1,0,-1.65,1.1,-.2); spawnModel('Book_Stack_1',22.1,1.02,-1.65,.4,1.8);
  crateModel = spawnModel('Crate_Wooden',crate.x,0,0,crate.h,0,false);
  pressurePlate = mesh(new THREE.CylinderGeometry(1.02,1.04,.13,32),mat(0xc6aa62,{emissive:0x574c1b,emissiveIntensity:.15}),plateX,.06,0);
  const plateRing=mesh(new THREE.TorusGeometry(.82,.04,6,40),mat(0xf9df90,{emissive:0xf2c468,emissiveIntensity:.2}),plateX,.14,0); plateRing.rotation.x=Math.PI/2;
  // The stone posts and luminous seal form a gate across the 2D path.
  for (const z of [-1.85, 1.85]) {
    const post=spawnModel('Rock_Medium_1',gateX,0,z,3.4,1.5);post.scale.x=.4;post.scale.z=.45;
  }
  gate = new THREE.Group(); scene.add(gate); gate.position.set(gateX,0,0);
  const membrane = new THREE.Mesh(new THREE.PlaneGeometry(3,4.15),new THREE.MeshBasicMaterial({color:0xdbce88,transparent:true,opacity:.26,side:THREE.DoubleSide,depthWrite:false})); membrane.rotation.y=Math.PI/2; membrane.position.y=2.075; gate.add(membrane);
  for(let j=0;j<7;j++){
    const line=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,4.15,5),new THREE.MeshBasicMaterial({color:0xf4d792,transparent:true,opacity:.75})); line.position.set(0,2.075,-1.3+j*.43);gate.add(line);
  }
  gateGlow=glow(gateX,2.15,.4,2.9,0xffcc73);
  for(let j=0;j<14;j++){
    const geo=new THREE.BufferGeometry().setFromPoints(Array.from({length:21},(_,k)=>{const t=k/20*Math.PI*1.4;return new THREE.Vector3(Math.sin(t)*.28, k/20*1.35, Math.cos(t)*.24);}));
    const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xe6f9d0,transparent:true,opacity:.33}));
    line.position.set(40.1+(j%4)*.83,j*.7%7,-.5+(j%3)*.52);scene.add(line);windLines.push({mesh:line,offset:j*.53});
  }
  const windFloor=mesh(new THREE.RingGeometry(.55,1.55,48),new THREE.MeshBasicMaterial({color:0xcde3b3,transparent:true,opacity:.38,side:THREE.DoubleSide}),41.5,.025,0);windFloor.rotation.x=-Math.PI/2;
  chest=spawnModel('Chest_Wood',58,5.7,0,1.35,-.13,false);
  spawnModel('Key_Gold',56.1,5.7,-.65,.48,-1.2);
  goalLight=glow(58,7.75,0,3.0);const heart=mesh(new THREE.OctahedronGeometry(.36),mat(0xffe49e,{emissive:0xf4c568,emissiveIntensity:.8}),58,7.55,0);goalLight.userData.heart=heart;
  for (const [x,y] of [[12.4,2.05],[32,1.3],[48.2,7.0]]) {
    const g=new THREE.Group();g.position.set(x,y,.2);scene.add(g);
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(.21),mat(0xffda86,{emissive:0xffc257,emissiveIntensity:.6}));g.add(core);
    const halo=glow(x,y,.2,1.4);seeds.push({x,y,object:g,halo,collected:false});
  }
  for(let j=0;j<28;j++){
    const sprite=glow(-4+rng()*68,1+rng()*7,-1-rng()*4,.10+rng()*.11,0xffeea8);
    sparkles.push({object:sprite,x:sprite.position.x,y:sprite.position.y,phase:rng()*6.28});
  }
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
  const c=shadowCanvas.getContext('2d'),grad=c.createRadialGradient(32,32,2,32,32,30);grad.addColorStop(0,'rgba(24,45,29,.35)');grad.addColorStop(1,'rgba(24,45,29,0)');c.fillStyle=grad;c.fillRect(0,0,64,64);
  shadow=mesh(new THREE.PlaneGeometry(2.2,1.1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}),p.x,.04,0);shadow.rotation.x=-Math.PI/2;
  art=DahroojArt.create(256);art.draw('jelly',0);ballTexture=new THREE.CanvasTexture(art.canvas);ballTexture.encoding=THREE.sRGBEncoding;
  ball=new THREE.Sprite(new THREE.SpriteMaterial({map:ballTexture,transparent:true,depthWrite:false}));ball.scale.setScalar(R*2/.72);scene.add(ball);ball.position.set(p.x,p.y,.08);
}

function setStyle(style, silent=false) {
  if (!styles.includes(style) || (!silent && mode!=='playing')) return;
  p.style=style;
  document.querySelectorAll('.style-button').forEach(button=>{const active=button.dataset.style===style;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  $('jump-label').textContent=style==='bubble'?'اطفُ':'اقفز';$('jump-glyph').textContent=style==='bubble'?'≋':'↑';$('jump').setAttribute('aria-label',style==='bubble'?'اطفُ في تيار الهواء':'اقفز');
  if(!silent){p.impact=.35;tone(style==='clay'?180:style==='bubble'?680:430,.16,.035,'sine',style==='clay'?120:850);}
}
function clearInput(){keys.clear();pointers.clear();actionDown=false;previousAction=false;p.jumpBuffer=0;document.querySelectorAll('.held').forEach(e=>e.classList.remove('held'));}
function getInput(){
  let left=keys.has('ArrowLeft')||keys.has('KeyA'),right=keys.has('ArrowRight')||keys.has('KeyD'),jump=keys.has('Space')||keys.has('ArrowUp')||keys.has('KeyW');
  for(const value of pointers.values()){if(value==='left')left=true;else if(value==='right')right=true;else if(value==='jump')jump=true;}
  actionDown=jump;return Number(right)-Number(left);
}
function setStage(next){
  if(stage===next)return;stage=next;
  const content=[['معبر النهر','خفيف… وقفزته عالية','بالهلام، اقفز بين الصخور واعبر النهر.','↗'],(gateOpen?['البوابة القديمة','الطريق صار مفتوحًا','ارجع للهلام، واقفز فوق الصندوق.','↗']:['البوابة القديمة','الطين قوّته في وزنه','حوّل إلى طين، وادفع الصندوق فوق الدائرة.','▣']),['تيار الغابة','خلّ الهواء يشيلك','حوّل إلى فقاعة داخل التيار، ثم اتجه يمينًا.','≋']][next];
  $('chapter-name').textContent=content[0];$('hint-title').textContent=content[1];$('hint-copy').textContent=content[2];$('hint-glyph').textContent=content[3];
  document.querySelectorAll('.steps i').forEach((el,i)=>el.classList.toggle('active',i<=next));
}
function saveCheckpoint(index,x,y){if(index>checkpointIndex){checkpointIndex=index;checkpoint={x,y:y+R};toast('وصلنا! هنا نقطة رجوع جديدة');}}
function reset(){
  elapsed=0;seedCount=0;checkpointIndex=0;checkpoint={x:2.5,y:R};gateOpen=false;gateAmount=0;crate.x=25.5;crate.latched=false;
  Object.assign(p,{x:2.5,y:R,vx:0,vy:0,grounded:true,coyote:.1,impact:0});stage=-1;setStage(0);setStyle('jelly',true);
  seeds.forEach(seed=>{seed.collected=false;seed.object.visible=true;seed.halo.visible=true;});$('seed-count').textContent='0';
  cameraX=5;cameraY=3.1;finishTimer=0;respawnTimer=0;toastTimer=0;$('toast').classList.remove('show');$('fade').classList.remove('active');clearInput();
}
function start(){if(!ready)return;unlockAudio();reset();mode='playing';$('welcome').hidden=true;$('pause-screen').hidden=true;$('win-screen').hidden=true;['hud','hint','controls'].forEach(id=>$(id).hidden=false);tone(420,.15,.025,'sine',620);$('start').blur();}
function pause(){if(mode!=='playing')return;mode='paused';clearInput();$('pause-screen').hidden=false;$('resume').focus({preventScroll:true});}
function resume(){if(mode!=='paused')return;mode='playing';clearInput();$('pause-screen').hidden=true;unlockAudio();$('resume').blur();}
function respawn(){
  if(respawnTimer)return;respawnTimer=.4;$('fade').classList.add('active');tone(190,.22,.025,'sine',130);clearInput();
}
function complete(){
  mode='won';clearInput();$('win-screen').hidden=false;$('controls').hidden=true;$('hint').hidden=true;
  $('final-seeds').textContent=`${seedCount} / 3`;
  $('final-time').textContent=`${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;
  tone(660,.5,.04,'sine',990);$('play-again').focus({preventScroll:true});
}
function floorAt(x){let top=-20;for(const ground of islands)if(x>=ground.l&&x<=ground.r)top=Math.max(top,ground.top);return top;}
function fixedUpdate(dt){
  elapsed+=dt;
  if(respawnTimer>0){respawnTimer-=dt;if(respawnTimer<=0){Object.assign(p,{x:checkpoint.x,y:checkpoint.y,vx:0,vy:0,grounded:true,coyote:.1});setStyle('jelly',true);cameraX=p.x+1.8;cameraY=Math.max(3.1,p.y+1.4);$('fade').classList.remove('active');toast('ولا يهمّك، نجرّب مرّة ثانية');}return;}
  const direction=getInput();
  if(actionDown&&!previousAction)p.jumpBuffer=.13;
  previousAction=actionDown;p.jumpBuffer=Math.max(0,p.jumpBuffer-dt);
  p.coyote=p.grounded?.1:Math.max(0,p.coyote-dt);
  const inWind=p.x>39.6&&p.x<44.15&&p.y<10.7;
  const speed=p.style==='clay'?3.7:p.style==='bubble'?3.65:5.2;
  p.vx=lerp(p.vx,direction*speed,Math.min(1,dt*(p.grounded?15:9)));
  if(direction)p.look=direction;
  if(p.jumpBuffer>0&&p.coyote>0){p.vy=p.style==='jelly'?9.5:p.style==='clay'?4.6:4.2;p.grounded=false;p.coyote=0;p.jumpBuffer=0;p.impact=-.65;tone(p.style==='clay'?165:330,.13,.028,'sine',p.style==='clay'?240:630);}
  const oldX=p.x,oldY=p.y;
  p.x+=p.vx*dt;p.x=clamp(p.x,-3.5,62);
  // Only clay transfers force to the crate. The solved plate latches permanently.
  const crateLeft=crate.x-crate.w/2,crateRight=crate.x+crate.w/2;
  if(p.y-R<crate.h-.06&&p.y+R>0&&p.x+R>crateLeft&&p.x-R<crateRight){
    const side=oldX<crate.x?-1:1;
    if(p.style==='clay'&&!crate.latched&&direction===-side){
      crate.x=clamp(crate.x+p.vx*dt,23,plateX);
      p.x=crate.x+side*(crate.w/2+R);
    }else{p.x=crate.x+side*(crate.w/2+R);p.vx=0;}
  }
  if(!gateOpen&&p.x+R>gateX-.15&&p.x-R<gateX+.15&&p.y-R<4.15){p.x=oldX<gateX?gateX-.15-R:gateX+.15+R;p.vx=0;}
  // Resolve vertical cliff faces before integrating height.
  for(const ground of islands){
    if(p.y-R<ground.top-.03&&p.y+R>ground.top-ground.depth){
      if(oldX+R<=ground.l+.02&&p.x+R>ground.l){p.x=ground.l-R;p.vx=0;}
      if(oldX-R>=ground.r-.02&&p.x-R<ground.r){p.x=ground.r+R;p.vx=0;}
    }
  }
  if(p.style==='bubble'&&inWind){p.vy=lerp(p.vy,actionDown?3.7:3.05,dt*4.2);p.coyote=0;}
  else{
    p.vy-=dt*(p.style==='bubble'?6:p.style==='clay'?28:20);
    if(p.style==='bubble')p.vy=Math.max(p.vy,-2.3);
    if(p.style==='jelly'&&!actionDown&&p.vy>4)p.vy-=dt*24;
  }
  p.y+=p.vy*dt;p.grounded=false;
  const grounds=[...islands,{l:crate.x-crate.w/2,r:crate.x+crate.w/2,top:crate.h}];
  for(const ground of grounds){
    if(p.x+R*.58>ground.l&&p.x-R*.58<ground.r&&oldY-R>=ground.top-.08&&p.y-R<=ground.top&&p.vy<=0){
      if(p.vy<-3){p.impact=Math.min(.9,-p.vy*.075);tone(p.style==='clay'?90:155,.075,.018,'sine',90);}
      p.y=ground.top+R;p.vy=0;p.grounded=true;
    }
  }
  p.impact*=Math.exp(-dt*9);
  if(!gateOpen&&Math.abs(crate.x-plateX)<.16){crate.x=plateX;crate.latched=true;gateOpen=true;stage=-1;toast('انفتحت! بالهلام اقفز فوق الصندوق');tone(480,.5,.045,'sine',960);}
  if(p.x>20&&checkpointIndex<1)saveCheckpoint(1,21,0);
  if(gateOpen&&p.x>35.4&&checkpointIndex<2)saveCheckpoint(2,36.1,0);
  if(p.x>45.2&&p.y>6&&p.grounded&&checkpointIndex<3)saveCheckpoint(3,46,5.7);
  setStage(p.x<20?0:!gateOpen||p.x<35?1:2);
  for(const seed of seeds){
    if(!seed.collected&&Math.hypot(p.x-seed.x,p.y-seed.y)<R+.4){seed.collected=true;seed.object.visible=false;seed.halo.visible=false;seedCount++;$('seed-count').textContent=String(seedCount);tone(660+seedCount*120,.25,.04,'sine',1100+seedCount*120);}
  }
  if(p.y<-6)respawn();
  if(gateOpen&&p.x>56.9&&p.y>5.8&&p.y<9){finishTimer+=dt;if(finishTimer>.6)complete();}else finishTimer=0;
}
function resize(){
  if(!renderer)return;const w=$('game').clientWidth,h=$('game').clientHeight;portrait=h>w;
  const height=portrait?20.5:12.8,aspect=w/h;
  camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
  renderer.setSize(w,h);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));
}
let lastTime=0,accumulator=0,lastArt=0;
function frame(ms){
  requestAnimationFrame(frame);const rawDt=lastTime?(ms-lastTime)/1000:0;const dt=Math.min(rawDt,.05);lastTime=ms;worldTime+=dt;
  if(ready){
    if(mode==='playing'){
      accumulator+=dt;let steps=0;while(accumulator>=STEP&&steps++<7&&mode==='playing'){fixedUpdate(STEP);accumulator-=STEP;}
      if(rawDt>0&&rawDt<.2){sampledFrameMs.push(rawDt*1000);if(sampledFrameMs.length>240)sampledFrameMs.shift();}totalFrames++;
    }else accumulator=0;
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show');}
    const targetX=mode==='welcome'?5:clamp(p.x+(portrait?1.35:3),2,59);
    const targetY=mode==='welcome'?3.1:Math.max(3.1,Math.min(8.3,p.y+1.5));
    cameraX=lerp(cameraX,targetX,1-Math.exp(-dt*5));cameraY=lerp(cameraY,targetY,1-Math.exp(-dt*3.2));
    camera.position.set(cameraX,cameraY+8.2,23);camera.lookAt(cameraX,cameraY,0);
    ball.position.set(p.x,p.y,.08);
    const floor=floorAt(p.x),height=Math.max(0,p.y-R-floor);shadow.visible=floor>-10;
    shadow.position.set(p.x,floor+.035,0);shadow.scale.setScalar(Math.max(.5,1-height*.08));shadow.material.opacity=Math.max(.12,1-height*.15);
    if(ms-lastArt>32){art.draw(p.style,worldTime,{face:mode==='won'?'joy':p.vy>4?'wide':p.style==='clay'&&Math.abs(p.vx)>1?'focus':'open',look:p.look*.6,impact:p.impact,vy:p.vy});ballTexture.needsUpdate=true;lastArt=ms;}
    crateModel.position.x=crate.x;
    gateAmount=lerp(gateAmount,gateOpen?1:0,1-Math.exp(-dt*2.5));gate.scale.y=Math.max(.001,1-gateAmount);gate.visible=gateAmount<.995;gateGlow.material.opacity=(1-gateAmount)*.55;
    pressurePlate.material.emissiveIntensity=gateOpen?.8:.13;pressurePlate.position.y=gateOpen?.015:.06;
    for(const decoration of decorations)decoration.visible=Math.abs(decoration.position.x-cameraX)<(portrait?18:28);
    for(const seed of seeds)if(!seed.collected){seed.object.position.y=seed.y+(reducedMotion?0:Math.sin(worldTime*2+seed.x)*.1);seed.object.rotation.y=worldTime;seed.halo.position.y=seed.object.position.y;}
    for(const particle of sparkles){particle.object.visible=Math.abs(particle.x-cameraX)<16;if(!reducedMotion){particle.object.position.y=particle.y+Math.sin(worldTime*.7+particle.phase)*.3;particle.object.material.opacity=.45+Math.sin(worldTime*1.2+particle.phase)*.3;}}
    if(!reducedMotion)for(const line of windLines){if(line.water)line.mesh.position.x=line.mesh.userData.origin+Math.sin(worldTime*.2)*.5;else line.mesh.position.y=(worldTime*1.5+line.offset)%8;}
    goalLight.userData.heart.rotation.y=worldTime*.6;goalLight.userData.heart.position.y=7.6+(reducedMotion?0:Math.sin(worldTime*1.5)*.16);
    goalLight.material.opacity=.75+(reducedMotion?0:Math.sin(worldTime*2)*.15);
    renderer.render(scene,camera);
  }
}
function wireControls(){
  $('start').onclick=start;$('pause').onclick=pause;$('resume').onclick=resume;$('restart').onclick=start;$('play-again').onclick=start;
  $('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'الصوت: صامت':'الصوت: شغّال';$('sound').setAttribute('aria-pressed',String(muted));if(!muted)unlockAudio();};
  $('credits-open').onclick=()=>{$('credits').hidden=false;$('credits-close').focus({preventScroll:true});};$('credits-close').onclick=()=>{$('credits').hidden=true;$('credits-open').focus({preventScroll:true});};
  document.querySelectorAll('.style-button').forEach(button=>button.addEventListener('pointerdown',event=>{event.preventDefault();setStyle(button.dataset.style);}));
  // Native click remains available for keyboard and assistive technology activation.
  document.querySelectorAll('.style-button').forEach(button=>button.addEventListener('click',event=>{if(event.detail===0)setStyle(button.dataset.style);}));
  for(const id of ['left','right','jump']){
    const button=$(id);button.addEventListener('pointerdown',event=>{if(mode!=='playing')return;event.preventDefault();button.setPointerCapture(event.pointerId);pointers.set(event.pointerId,id);button.classList.add('held');unlockAudio();});
    const release=event=>{pointers.delete(event.pointerId);if(![...pointers.values()].includes(id))button.classList.remove('held');};
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  }
  document.addEventListener('keydown',event=>{
    if(event.code==='Escape'){if(!$('credits').hidden){$('credits').hidden=true;return;}mode==='playing'?pause():resume();return;}
    if(mode!=='playing')return;
    if(['ArrowLeft','ArrowRight','ArrowUp','Space','KeyA','KeyD','KeyW','Digit1','Digit2','Digit3'].includes(event.code)){event.preventDefault();keys.add(event.code);}
    if(event.code.startsWith('Digit'))setStyle(styles[Number(event.code.slice(-1))-1]);
  });
  document.addEventListener('keyup',event=>keys.delete(event.code));
  window.addEventListener('blur',()=>{clearInput();pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause();}});
  window.addEventListener('resize',resize);$('game').addEventListener('contextmenu',event=>event.preventDefault());
  for(const button of document.querySelectorAll('.style-button')){const icon=DahroojArt.create(90);button.querySelector('canvas').getContext('2d').drawImage(icon.draw(button.dataset.style,0),0,0);}
  for(const canvas of document.querySelectorAll('[data-hero]')){const icon=DahroojArt.create(256);canvas.getContext('2d').drawImage(icon.draw(canvas.dataset.hero,0,{face:canvas.dataset.hero==='jelly'?'joy':'open'}),0,0);}
}
async function init(){
  wireControls();
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.98;
    renderer.domElement.setAttribute('aria-hidden','true');$('world').appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();pause();toast('توقّف العرض. أعد تحميل الصفحة لاستعادة الغابة.');});
    scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,140);resize();
    const response=await fetch('assets/manifest.json');if(!response.ok)throw Error('Asset manifest unavailable');const manifest=await response.json();
    const loader=new THREE.GLTFLoader();let loaded=0;
    await Promise.all(manifest.map(async item=>{const asset=await new Promise((resolve,reject)=>loader.load(item.path,resolve,undefined,reject));models[item.id]=asset;loaded++;$('loading-fill').style.width=`${loaded/manifest.length*100}%`;$('loading-copy').textContent=`وصلت ${loaded} من ${manifest.length} قطعة للغابة`; }));
    buildWorld();ready=true;mode='welcome';$('start').disabled=false;$('start-label').textContent='نبدأ المغامرة';$('loading').hidden=true;$('ready-copy').hidden=false;
    requestAnimationFrame(frame);
    // Read-only diagnostics are opt-in; tests still use real keyboard / touch input.
    if(new URLSearchParams(location.search).has('test'))Object.defineProperty(window,'forestDebug',{value:()=>({mode,player:{...p},crate:{...crate},gateOpen,checkpointIndex,seedCount,elapsed,stage,models:Object.keys(models).length,renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures},frameMs:sampledFrameMs.length?sampledFrameMs.reduce((a,b)=>a+b,0)/sampledFrameMs.length:0,frames:totalFrames}),writable:false});
  }catch(error){
    console.error('Forest failed to load',error);$('loading-copy').textContent='تعذّر تحميل الغابة. جرّب تحديث الصفحة.';$('start-label').textContent='إعادة المحاولة';$('start').disabled=false;$('start').onclick=()=>location.reload();$('loading-fill').style.background='#db916e';
  }
}
init();
})();
