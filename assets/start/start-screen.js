/* Isolated opening scene. Matter never touches gameplay bodies or scores. */
(() => {
  'use strict';
  window.createDahroojStart = ({root, canvas, makeSprite, onStart, reducedMotion, onInteract=()=>{}, onPop=()=>{}}) => {
    const {Engine, Bodies, Body, Composite, Constraint, Sleeping} = window.Matter;
    const engine = Engine.create({enableSleeping:true, positionIterations:8, velocityIterations:6});
    engine.gravity.y = 1.65;
    const context = canvas.getContext('2d');
    const play = root.querySelector('#start-play');
    const status = root.querySelector('#start-status');
    // A shuffled bag guarantees more fabric and fewer clay balls in every batch.
    const styles = Object.entries({fabric:9,jelly:4,fur:3,bubble:3,clay:1})
      .flatMap(([style,count])=>Array(count).fill(style));
    const expressions = ['joy','laugh','wide','focus','dizzy','closed'];
    const styleBag=[], expressionBag=[];
    const sprites = new Map();
    const balls = [], grabs = new Map(), bursts=[];
    const listeners = new AbortController();
    const eventOptions = {signal:listeners.signal};
    const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
    let width=0, height=0, ratio=1, radius=32, walls=[];
    let elapsed=0, accumulator=0, area=0, nextDrop=0, lastDrop=0, ready=false, destroyed=false;
    let sequence=0;
    const STEP=1000/60, MAX_BALLS=180;
    const HOLD_SECONDS=.65, DRAG_DISTANCE=10;
    const burstColors={fabric:['#7c2941','#efe6d2'],jelly:['#8a8e97','#fffaf2'],
      clay:['#825637','#ad805c'],fur:['#f3eee6','#966640'],bubble:['#fffaf2','#b9e8fa','#f4b5db']};

    function takeFromBag(bag,choices) {
      if(!bag.length){
        bag.push(...choices);
        for(let i=bag.length-1;i>0;i--){
          const j=Math.floor(Math.random()*(i+1));
          [bag[i],bag[j]]=[bag[j],bag[i]];
        }
      }
      return bag.pop();
    }

    function rebuildWalls() {
      for(const wall of walls) Composite.remove(engine.world,wall);
      const thickness=120, extra=height*3;
      walls=[
        Bodies.rectangle(width/2,height+thickness/2,width+thickness*2,thickness,{isStatic:true}),
        Bodies.rectangle(-thickness/2,-extra/2,thickness,height*2+extra,{isStatic:true}),
        Bodies.rectangle(width+thickness/2,-extra/2,thickness,height*2+extra,{isStatic:true})
      ];
      Composite.add(engine.world,walls);
    }

    function addBall(x,y,r) {
      const style=takeFromBag(styleBag,styles);
      const expression=takeFromBag(expressionBag,expressions);
      sequence++;
      const body=Bodies.circle(x,y,r,{
        restitution:style==='clay'?.08:style==='bubble'?.38:.24,
        friction:.38,frictionStatic:.7,frictionAir:.014,
        density:.001,slop:.04,sleepThreshold:80,label:style
      },32);
      const ball={body,r,style,expression,phase:Math.random()*6.28};
      body.plugin.startBall=ball;
      balls.push(ball);area+=Math.PI*r*r;
      Composite.add(engine.world,body);
      return ball;
    }

    function drop() {
      const r=radius*(.82+Math.random()*.36);
      const x=r+((sequence*.61803398875+.13)%1)*(width-r*2);
      let y=-r-6;
      // Spawn above existing bodies, rather than inserting overlapping balls.
      for(const b of balls){
        const dx=Math.abs(b.body.position.x-x), sum=b.r+r+3;
        if(dx<sum && b.body.position.y<r*3)
          y=Math.min(y,b.body.position.y-Math.sqrt(sum*sum-dx*dx));
      }
      const b=addBall(x,y,r);
      Body.setVelocity(b.body,{x:(Math.random()-.5)*1.4,y:2.5});
      Body.setAngularVelocity(b.body,(Math.random()-.5)*.055);
      lastDrop=elapsed;
    }

    function reveal() {
      if(ready) return;
      ready=true;root.dataset.state='ready';
      play.hidden=false;play.disabled=false;
      status.textContent='جاهز! يمكنك بدء اللعبة أو الاستمرار بتحريك الكور.';
    }

    function pileIsFull() {
      // Inspect the actual pile across the screen. An airborne ball alone cannot unlock Play.
      if(area<width*height*.85 || elapsed-lastDrop<.65) return false;
      let highColumns=0, settledArea=0;
      for(const b of balls){
        if(b.body.speed<4 && b.body.position.y>b.r*.25 && b.body.position.y<height)
          settledArea+=Math.PI*b.r*b.r;
      }
      for(let col=0;col<12;col++){
        const x=(col+.5)*width/12;
        if(balls.some(b=>b.body.speed<6 && Math.abs(b.body.position.x-x)<b.r &&
          b.body.position.y-b.r<height*.12 && b.body.position.y+b.r>0)) highColumns++;
      }
      return highColumns>=9 && settledArea>width*height*.60;
    }

    function point(event) {
      const box=canvas.getBoundingClientRect();
      return {x:clamp(event.clientX-box.left,0,width),y:clamp(event.clientY-box.top,0,height)};
    }
    function down(event) {
      if(event.button!==0 || destroyed) return;
      const p=point(event);
      const chosen=[...balls].reverse().find(b=>!Array.from(grabs.values()).some(g=>g.ball===b) &&
        Math.hypot(p.x-b.body.position.x,p.y-b.body.position.y)<b.r+8);
      if(!chosen) return;
      event.preventDefault();canvas.setPointerCapture(event.pointerId);
      Sleeping.set(chosen.body,false);
      const constraint=Constraint.create({
        pointA:p,bodyB:chosen.body,
        pointB:{x:p.x-chosen.body.position.x,y:p.y-chosen.body.position.y},
        stiffness:.16,damping:.12,length:0
      });
      Composite.add(engine.world,constraint);
      grabs.set(event.pointerId,{ball:chosen,constraint,start:p,holdStart:performance.now(),canPop:true,samples:[{...p,t:event.timeStamp}]});
      canvas.classList.add('dragging');
      onInteract();
    }
    function move(event) {
      const grab=grabs.get(event.pointerId);if(!grab) return;
      event.preventDefault();const p=point(event);
      // Once a gesture becomes a drag, keeping it still must not pop the ball.
      if(Math.hypot(p.x-grab.start.x,p.y-grab.start.y)>DRAG_DISTANCE) grab.canPop=false;
      grab.constraint.pointA=p;Sleeping.set(grab.ball.body,false);
      grab.samples.push({...p,t:event.timeStamp});
      while(grab.samples.length>2 && event.timeStamp-grab.samples[0].t>90) grab.samples.shift();
    }
    function release(id,throwBall=false,timeStamp=0) {
      const grab=grabs.get(id);if(!grab) return;
      Composite.remove(engine.world,grab.constraint);grabs.delete(id);
      if(throwBall && grab.samples.length>1){
        const first=grab.samples[0],last=grab.samples[grab.samples.length-1];
        const dt=Math.max(16,timeStamp-first.t);
        Body.setVelocity(grab.ball.body,{
          x:clamp((last.x-first.x)/dt*STEP,-18,18),
          y:clamp((last.y-first.y)/dt*STEP,-18,18)
        });
      }else Body.setVelocity(grab.ball.body,{x:0,y:0});
      if(canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      if(!grabs.size) canvas.classList.remove('dragging');
    }
    function releaseAll() {for(const id of [...grabs.keys()]) release(id);}

    function popBall(id,grab) {
      const b=grab.ball,{x,y}=b.body.position;
      release(id);
      Composite.remove(engine.world,b.body);
      balls.splice(balls.indexOf(b),1);area=Math.max(0,area-Math.PI*b.r*b.r);
      // Bodies supported by the removed ball need to fall into its place.
      for(const other of balls) Sleeping.set(other.body,false);
      bursts.push({x,y,r:b.r,t:0,colors:burstColors[b.style],parts:reducedMotion?[]:
        Array.from({length:12},(_,i)=>{
          const a=i/12*Math.PI*2+Math.random()*.2,speed=b.r*(4+Math.random()*3);
          return {vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,size:2+Math.random()*2};
        })});
      if(bursts.length>10) bursts.shift();
      status.textContent='فرقعت الكرة!';
      onPop();
    }
    canvas.addEventListener('pointerdown',down,eventOptions);
    canvas.addEventListener('pointermove',move,eventOptions);
    canvas.addEventListener('pointerup',e=>release(e.pointerId,true,e.timeStamp),eventOptions);
    canvas.addEventListener('pointercancel',e=>release(e.pointerId),eventOptions);
    canvas.addEventListener('lostpointercapture',e=>release(e.pointerId),eventOptions);
    canvas.addEventListener('contextmenu',e=>e.preventDefault(),eventOptions);
    for(const name of ['gesturestart','gesturechange','gestureend'])
      canvas.addEventListener(name,e=>e.preventDefault(),{...eventOptions,passive:false});
    document.addEventListener('visibilitychange',releaseAll,eventOptions);
    window.addEventListener('pagehide',releaseAll,eventOptions);
    play.addEventListener('click',()=>{if(ready && !destroyed) onStart();},eventOptions);

    function resize(w,h,dpr) {
      releaseAll();
      bursts.length=0;
      const oldW=width,oldH=height;
      width=w;height=h;ratio=Math.min(2,dpr);
      canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
      // Radius grows on larger screens to keep the body count bounded.
      radius=Math.max(25,Math.min(55,Math.min(width,height)*.087),Math.sqrt(width*height/(Math.PI*125)));
      if(oldW && oldH){
        const scale=Math.sqrt(width*height/(oldW*oldH));area=0;
        for(const b of balls){
          Body.scale(b.body,scale,scale);b.r*=scale;
          Body.setPosition(b.body,{x:clamp(b.body.position.x/oldW*width,b.r,width-b.r),y:Math.min(height-b.r,b.body.position.y/oldH*height)});
          Body.setVelocity(b.body,{x:0,y:0});Sleeping.set(b.body,false);
          area+=Math.PI*b.r*b.r;
        }
      }
      rebuildWalls();sprites.clear();
    }

    function sprite(style,face,blinkOn) {
      const key=style+'/'+face+'/'+Number(blinkOn);
      if(!sprites.has(key)) sprites.set(key,makeSprite(style,face,blinkOn));
      return sprites.get(key);
    }
    function render(now=performance.now()) {
      context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width,height);
      for(const b of balls){
        const {x,y}=b.body.position;
        if(y+b.r*1.3<0 || y-b.r*1.3>height) continue;
        const grab=Array.from(grabs.values()).find(g=>g.ball===b),held=Boolean(grab);
        const charge=grab?.canPop?clamp((now-grab.holdStart)/(HOLD_SECONDS*1000),0,1):0;
        const face=held?(charge>.55?'closed':'wide'):b.expression;
        const blinkOn=!held && (face==='joy'||face==='wide'||face==='focus') && Math.sin(elapsed*1.4+b.phase)>.992;
        const image=sprite(b.style,face,blinkOn);
        context.save();context.translate(x,y);context.rotate(b.body.angle);
        if(charge && !reducedMotion) context.scale(1+charge*.1,1+charge*.1);
        context.drawImage(image,-b.r*1.4,-b.r*1.4,b.r*2.8,b.r*2.8);
        context.restore();
        if(charge>.08){
          context.save();context.lineCap='round';context.lineWidth=3;
          context.strokeStyle='rgba(44,45,61,.3)';context.beginPath();
          context.arc(x,y,b.r*1.17,0,Math.PI*2);context.stroke();
          context.strokeStyle='#fffaf2';context.beginPath();
          context.arc(x,y,b.r*1.17,-Math.PI/2,-Math.PI/2+Math.PI*2*charge);context.stroke();
          context.restore();
        }
      }
      for(const burst of bursts){
        const duration=reducedMotion?.2:.5,k=clamp(burst.t/duration,0,1);
        context.save();context.globalAlpha=1-k;
        context.strokeStyle='#fffaf2';context.lineWidth=2.5*(1-k)+.5;
        context.beginPath();context.arc(burst.x,burst.y,burst.r*(1+k*.75),0,Math.PI*2);context.stroke();
        burst.parts.forEach((p,i)=>{
          context.fillStyle=burst.colors[i%burst.colors.length];context.beginPath();
          context.arc(burst.x+p.vx*burst.t,burst.y+p.vy*burst.t+180*burst.t*burst.t,p.size*(1-k*.7),0,Math.PI*2);context.fill();
        });
        context.restore();
      }
    }

    function tick(dt) {
      if(destroyed || document.hidden) return;
      elapsed+=dt;
      for(let i=bursts.length-1;i>=0;i--){
        bursts[i].t+=dt;
        if(bursts[i].t>(reducedMotion?.2:.5)) bursts.splice(i,1);
      }
      if(!ready && !reducedMotion){
        const target=width*height*.98;
        if(elapsed>=nextDrop && area<target && balls.length<MAX_BALLS){
          drop();nextDrop=elapsed+Math.max(.022,5.2/(target/(Math.PI*radius*radius)));
        }
        if(pileIsFull()) reveal();
        // If a very tightly packed pile needs another top row, top it up after settling.
        else if(area>=target && elapsed-lastDrop>1.5 && balls.length<MAX_BALLS){drop();nextDrop=elapsed+.08;}
      }
      accumulator+=Math.min(dt*1000,66.667);
      while(accumulator>=STEP){Engine.update(engine,STEP);accumulator-=STEP;}
      // Hold timing follows real time, even when slow frames clamp physics time.
      const now=performance.now();
      for(const [id,grab] of grabs)
        if(grab.canPop && now-grab.holdStart>=HOLD_SECONDS*1000) popBall(id,grab);
      render(now);
    }

    function destroy() {
      if(destroyed) return;
      destroyed=true;releaseAll();listeners.abort();
      Composite.clear(engine.world,false);Engine.clear(engine);
      balls.length=0;bursts.length=0;sprites.clear();canvas.width=canvas.height=1;root.remove();
    }

    resize(innerWidth,innerHeight,devicePixelRatio||1);
    root.dataset.state='filling';
    if(reducedMotion){
      // Respect reduced motion with an already-filled, still draggable pile.
      const cols=Math.max(3,Math.round(width/(radius*2))),r=width/(cols*2);
      for(let row=0;row<Math.ceil(height/(r*1.74))+1;row++)
        for(let col=0;col<cols-(row%2);col++){
          const b=addBall(r+col*r*2+(row%2?r:0),height-r-row*r*1.74,r*.98);
          Sleeping.set(b.body,true);
        }
      reveal();render();
    }
    return {tick,resize,destroy};
  };
})();
