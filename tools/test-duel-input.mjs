import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const between=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
function controls(turn=true,duel=true){
  const handlers={},moves=[],balls=[],shots=[];
  let clock=0,stops=0;
  const env={aim:{down:false,pointerId:null,pts:[]},S:{pos:{x:100},shot:false,grounded:true},BR:.24,
    ensureAudio(){},performance:{now:()=>clock+=20},
    gcv:{getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},addEventListener:(name,fn)=>{handlers[name]=fn;}},
    client:{canMove:()=>true,canShoot:()=>turn,canDistract:()=>!turn,move:x=>moves.push(x),stopMove:()=>stops++},
    toScreen:()=>({x:100,y:300}),radiusOnScreen:()=>12,planePoint:p=>({x:p.x}),
    distractions:{throwAt:p=>balls.push({x:p.x,y:p.y})},
    recordShot:pts=>shots.push(Array.from(pts,({x,y})=>({x,y})))
  };
  vm.createContext(env);
  const methods=duel?between('      startMove(p,id){','      playerVisible:'):'';
  vm.runInContext(`let movePointer=null,throwPointer=null;const stage={canAim:()=>client.canShoot(),${methods}};`+
    between('  function cancelAim(id){','  function shoot(){')+
    'function shoot(){if(!aim.down)return;recordShot(aim.pts);cancelAim();}\n'+
    between("  gcv.addEventListener('pointerup',e=>{",'  function update3(dt){'),env);
  return {aim:env.aim,moves,balls,shots,get stops(){return stops;},
    event:(type,id,x=100,y=300)=>handlers[type]({pointerId:id,clientX:x,clientY:y})};
}

test('a waiting player can keep moving while a second finger repeatedly throws',()=>{
  const c=controls(false);
  c.event('pointerdown',1);c.event('pointermove',1,140,300);
  for(let i=0;i<3;i++){
    c.event('pointerdown',2,190,100);c.event('pointermove',1,150+i*10,300);
    c.event('pointerup',2,190,100);c.event('lostpointercapture',2,190,100);
  }
  assert.equal(c.balls.length,3);assert.equal(c.moves.at(-1),170);assert.equal(c.shots.length,0);
  c.event('pointermove',1,180,300);assert.equal(c.moves.at(-1),180);
  c.event('pointerup',1,180,300);assert.equal(c.balls.length,3);
});

test('a target tap started before movement survives the movement finger being released',()=>{
  const c=controls(false);
  c.event('pointerdown',2,190,100);c.event('pointerdown',1);c.event('pointermove',1,140,300);
  c.event('pointerup',1,140,300);c.event('lostpointercapture',1);
  assert.equal(c.balls.length,0);c.event('pointerup',2,190,100);
  assert.deepEqual(c.balls,[{x:190,y:100}]);assert.equal(c.moves.at(-1),140);
});

test('movement and unrelated fingers cannot change or release a main swipe',()=>{
  const c=controls();
  c.event('pointerdown',1);c.event('pointermove',1,140,300);
  c.event('pointerdown',2,190,280);c.event('pointermove',2,190,180);
  c.event('pointermove',1,170,300);c.event('pointerdown',3,250,400);c.event('pointermove',3,280,500);
  c.event('pointerup',3,280,500);c.event('pointerup',1,170,300);c.event('lostpointercapture',1);
  assert.equal(c.shots.length,0);assert.equal(c.aim.down,true);assert.equal(c.aim.pointerId,2);
  c.event('pointermove',2,190,100);c.event('pointerup',2,190,100);c.event('lostpointercapture',2);
  assert.deepEqual(c.shots,[[{x:190,y:280},{x:190,y:180},{x:190,y:100}]]);
  assert.equal(c.aim.down,false);assert.equal(c.aim.pointerId,null);
});

test('a held body touch becomes movement when another finger starts the main swipe',()=>{
  const c=controls();c.event('pointerdown',1);c.event('pointerdown',2,115,300);
  c.event('pointermove',1,150,300);c.event('pointermove',2,115,100);c.event('pointerup',2,115,100);
  assert.deepEqual(c.shots,[[{x:115,y:300},{x:115,y:100}]]);assert.equal(c.moves.at(-1),150);
});

test('a main swipe started first stays independent of a later movement finger and its cancellation',()=>{
  const c=controls();c.event('pointerdown',2);c.event('pointermove',2,100,240);
  c.event('pointerdown',1);c.event('pointermove',1,155,300);c.event('pointercancel',1);
  assert.equal(c.stops,1);assert.equal(c.aim.down,true);assert.equal(c.shots.length,0);
  c.event('pointermove',2,100,100);c.event('pointerup',2,100,100);
  assert.deepEqual(c.shots,[[{x:100,y:300},{x:100,y:240},{x:100,y:100}]]);
});

test('canceling or losing a throw touch does not cancel the movement finger',()=>{
  for(const type of ['pointercancel','lostpointercapture'])for(const turn of [false,true]){
    const c=controls(turn);c.event('pointerdown',1);c.event('pointermove',1,140,300);
    c.event('pointerdown',2,190,100);c.event(type,2,190,100);c.event('pointerup',2,190,100);
    c.event('pointermove',1,180,300);
    assert.equal(c.moves.at(-1),180);assert.equal(c.balls.length,0);assert.equal(c.shots.length,0);
  }
});

test('other throwing modes also retain one owner for their swipe',()=>{
  const c=controls(true,false);c.event('pointerdown',1);c.event('pointermove',1,100,200);
  c.event('pointerdown',2,200,300);c.event('pointermove',2,220,400);c.event('pointercancel',2);
  assert.equal(c.aim.down,true);c.event('pointerup',1,100,200);
  assert.deepEqual(c.shots,[[{x:100,y:300},{x:100,y:200}]]);
});
