// Summit logic: every step of the climb is reachable, and the hazard rules hold. No browser needed.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context=vm.createContext({Math,Object,Array,Number});
context.globalThis=context;
vm.runInContext(readFileSync(new URL('../assets/climb/climb.js',import.meta.url),'utf8'),context);
const C=context.DahroojClimbCore;
let checks=0;const check=(ok,label)=>{assert(ok,label);checks++;};

function staticState(width){
  const s=C.createState(width);s.monsters=[];s.icicles=[];
  for(const p of s.platforms){p.move=null;p.crumble=null;p.spikes=null;}
  return s;
}
function jump(width,from,x,vx,vy){
  const s=staticState(width),a=s.platforms[from];
  Object.assign(s.ball,{x,y:a.y+1,vx:0,vy:0,grounded:true,on:a});
  C.launch(s,vx,vy);
  for(let t=0;t<3&&!s.ball.grounded;t+=1/60)C.step(s,1/60);
  return s.ball.grounded?s.ball.on:null;
}
// Phone (320 and 390 wide) and desktop widths, in ball radii.
for(const width of [13.3,16.25,18]){
  const order=C.createState(width).platforms.map((p,i)=>({p,i})).sort((a,b)=>a.p.y-b.p.y);
  for(let k=0;k+1<order.length;k++){
    const {p:a,i:from}=order[k],b=order[k+1].p;
    let ok=false;
    for(const f of [.5,.15,.85,0,1]){
      const x=Math.min(Math.max(a.x0+(a.x1-a.x0)*f,1),width-1);
      for(let deg=20;deg<=160&&!ok;deg+=4)for(let power=.3;power<=1.001&&!ok;power+=.07){
        const v=C.VMAX*power,landed=jump(width,from,x,Math.cos(deg*Math.PI/180)*v,Math.sin(deg*Math.PI/180)*v);
        ok=!!landed&&landed.y>=b.y;
      }
      if(ok)break;
    }
    check(ok,`width ${width}: platform at ${a.y} reaches ${b.y}`);
  }
  console.log(`PASS width ${width}: all ${order.length-1} steps from the ground to the summit are reachable`);
}

// Rules on the real level, with hazards.
{
  const s=C.createState(16.25);C.restart(s);
  const crawler=s.monsters.find(m=>m.type==='crawler'),p=crawler.plat;
  Object.assign(s.ball,{x:crawler.x,y:p.y+2.2,vx:0,vy:-6,grounded:false,on:null});
  crawler.speed=0;C.step(s,1/30);
  check(!crawler.alive&&s.ball.vy>0&&s.ball.hearts===3,'Landing on a crawler defeats it and bounces');
  C.respawn(s);C.restart(s);
  const c2=s.monsters.find(m=>m.type==='crawler');c2.speed=0;
  Object.assign(s.ball,{x:c2.x-1.2,y:c2.plat.y+1,vx:0,vy:0,grounded:true,on:c2.plat,inv:0});
  C.step(s,1/60);
  check(s.ball.hearts===2&&s.ball.inv>0,'Touching a crawler from the side costs a heart');
  C.step(s,1/60);check(s.ball.hearts===2,'Brief invulnerability after a hit');
  s.ball.inv=0;C.hurt(s,0);s.ball.inv=0;C.hurt(s,0);
  check(s.ball.dead>0&&s.ball.hearts===0,'Three hits pop Dahrooj');
  s.checkpoint=2;for(let t=0;t<1.3;t+=1/60)C.step(s,1/60);
  check(!s.ball.dead&&s.ball.hearts===3&&Math.abs(s.ball.y-73)<1e-6,'Respawn on the last checkpoint ledge with full hearts');
  check(s.monsters.every(m=>m.alive),'Monsters return after a respawn');
}
{
  const s=C.createState(16.25);C.restart(s);
  const spiky=s.platforms.find(p=>p.spikes);
  Object.assign(s.ball,{x:spiky.x0+(spiky.x1-spiky.x0)*(spiky.spikes[0]+spiky.spikes[1])/2,y:spiky.y+1.5,vx:0,vy:-3,grounded:false,on:null});
  s.monsters=[];for(let t=0;t<.3&&s.ball.hearts===3;t+=1/60)C.step(s,1/60);
  check(s.ball.hearts===2,'Spikes hurt');
}
{
  const s=C.createState(16.25);C.restart(s);s.monsters=[];
  const crumbly=s.platforms.find(p=>p.crumble);
  Object.assign(s.ball,{x:(crumbly.x0+crumbly.x1)/2,y:crumbly.y+1.2,vx:0,vy:-2,grounded:false,on:null});
  for(let t=0;t<.2;t+=1/60)C.step(s,1/60);
  check(s.ball.grounded&&s.ball.on===crumbly&&crumbly.crumble.state==='shaking','Landing starts a crumbling platform');
  for(let t=0;t<.6;t+=1/60)C.step(s,1/60);
  check(crumbly.crumble.state==='fallen'&&!s.ball.grounded,'It falls away beneath the ball');
}
{
  const s=C.createState(16.25);C.restart(s);s.monsters=[];s.icicles=[];
  const ice=s.platforms.find(p=>p.ice&&!p.move&&!p.crumble);
  Object.assign(s.ball,{x:ice.x0+.5,y:ice.y+1.1,vx:6,vy:-2,grounded:false,on:null});
  C.step(s,1/30);const x0=s.ball.x;C.step(s,.25);
  check(s.ball.x-x0>.6,'Ice keeps sliding');
}
{
  const s=C.createState(16.25);C.restart(s);s.monsters=[];s.icicles=[];
  const ledge=s.platforms.find(p=>p.checkpoint===1);
  Object.assign(s.ball,{x:5,y:ledge.y+1.3,vx:0,vy:-2,grounded:false,on:null});
  for(let t=0;t<.2;t+=1/60)C.step(s,1/60);
  check(s.checkpoint===1&&s.events.some(e=>e.type==='checkpoint'),'Reaching a ledge saves the checkpoint');
  const summit=s.platforms.find(p=>p.summit);s.events.length=0;
  Object.assign(s.ball,{x:5,y:summit.y+1.3,vx:0,vy:-2,grounded:false,on:null});
  for(let t=0;t<.2;t+=1/60)C.step(s,1/60);
  check(s.won&&s.events.some(e=>e.type==='summit'),'Reaching the summit wins');
  check(!C.launch(s,0,20),'No launching after winning');
  C.restart(s);check(!s.won&&s.checkpoint===0&&s.ball.y===1,'Restart returns to the foot of the mountain');
}
{
  const s=C.createState(16.25);C.restart(s);
  check(!C.launch(s,0,0.1)||Math.hypot(s.ball.vx,s.ball.vy)<=C.VMAX,'Launch speed is capped');
  const s2=C.createState(16.25);C.restart(s2);C.launch(s2,0,100);
  check(Math.abs(Math.hypot(s2.ball.vx,s2.ball.vy)-C.VMAX)<1e-9,'Launch speed is capped at the maximum');
  check(!C.launch(s2,0,10),'No second launch in the air');
}
console.log(`PASS ${checks} climb checks.`);
