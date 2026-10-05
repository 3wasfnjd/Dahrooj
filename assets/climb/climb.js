/* Summit: Dahrooj climbs a mountain past obstacles and monsters. Aboden Games.
   2D, drawn on the free-mode canvas. All gameplay is measured in ball radii (u). */
(() => {
  'use strict';
  const G=60, MAX_HEARTS=3, MAX_WIDTH=18;
  // Touch controls like the other modes: drag sideways to roll, tap to jump.
  const HIT=.82; // hazard contact radius, smaller than the drawn ball
  const RUN=10, JUMP=28, ACCEL=70, ACCEL_ICE=14, ACCEL_AIR=34, COYOTE=.1, BUFFER=.13;
  // Small thrown balls: aim at the nearest monster ahead, otherwise fly straight ahead.
  const SHOT_SPEED=18, SHOT_LIFE=1.1, SHOT_COOL=.32, SHOT_MAX=3, SHOT_R=.32, AIM_RANGE=10;
  const THEMES=[
    {name:'meadow',top:'#7f9a5b'},{name:'cliffs',top:'#a38b74'},
    {name:'caves',top:'#77728a'},{name:'snow',top:'#e8f1f5'}
  ];
  // [x as a fraction of the playable width, top surface height, width, options]
  const SECTIONS=[
    {from:0,platforms:[
      [.32,4,4.2],[.70,8,4,{crawler:1}],[.36,12,3.6],[.66,16,3.6,{move:[.14,1.1]}],
      [.38,20,3.4,{crawler:1}],[.14,24,3.2],[.50,28,3.6],[.82,32,3.2]],
      bats:[],icicles:[]},
    {from:36,platforms:[
      [.28,40,3.2,{crumble:1}],[.66,44,3.6,{spikes:[0,.45]}],[.36,48,3,{crumble:1}],
      [.74,52,3.2,{spitter:.75}],[.44,56,2.8],[.16,60,3,{crumble:1}],[.56,64,3.4,{crawler:1}],[.84,68,2.8]],
      bats:[[46.5,.12,.62,.7,0],[58.5,.38,.88,.8,2]],icicles:[]},
    {from:72,platforms:[
      [.5,76,3.2,{move:[.2,.9]}],[.2,80,3,{spitter:.3}],[.66,84,2.8,{move:[.16,1.6]}],
      [.38,88,3,{spikes:[.55,1]}],[.78,92,2.6,{crumble:1}],[.5,96,3,{crawler:1}],
      [.2,100,2.8,{move:[.12,1.3]}],[.6,104,2.8,{spitter:.7}]],
      bats:[[86.5,.15,.7,1,1],[98.5,.1,.5,1.1,0],[98.5,.55,.9,1,3]],icicles:[]},
    {from:108,platforms:[
      [.3,112,3.2,{ice:1}],[.7,116,3,{ice:1}],[.4,120,2.8,{ice:1,crumble:1}],[.12,124,2.8,{ice:1}],
      [.5,128,2.8,{ice:1,move:[.15,1.2]}],[.84,132,2.6,{ice:1}],[.52,136,2.8,{ice:1,crawler:1}],
      [.2,140,2.6,{ice:1}],[.6,144,2.6,{ice:1,spitter:.5}]],
      bats:[[122.5,.3,.9,1.1,1],[134.5,.15,.7,1.3,2]],icicles:[[.68,119.5],[.5,131.5],[.22,147.4]]}
  ];
  const TOP=148;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function buildLevel(width){
    const platforms=[],monsters=[],bats=[],icicles=[];
    const full=(y,theme,extra)=>({x0:0,x1:width,y,theme,full:true,dx:0,...extra});
    platforms.push(full(0,0,{ground:true,checkpoint:0}));
    SECTIONS.forEach((section,s)=>{
      for(const [fx,y,w,o={}] of section.platforms){
        const x0=clamp(fx*width-w/2,.2,width-.2-w);
        const p={x0,x1:x0+w,base:x0,w,y,theme:s,dx:0,ice:!!o.ice,spikes:o.spikes||null,
          move:o.move?{amp:o.move[0]*width,speed:o.move[1],phase:y}:null,
          crumble:o.crumble?{state:'solid',t:0}:null};
        platforms.push(p);
        if(o.crawler)monsters.push({type:'crawler',plat:p,x:p.x0+w/2,dir:y%8?1:-1,speed:1.7,alive:true,t:0});
        if(o.spitter!=null)monsters.push({type:'spitter',plat:p,f:o.spitter,alive:true,cool:1.2+(y%3)*.4,t:0,swell:0});
      }
      for(const [y,a,b,speed,phase] of section.bats)bats.push({type:'bat',y0:y,x0:a*width,x1:b*width,speed,phase,alive:true,x:0,y,t:0});
      for(const [fx,y] of section.icicles)icicles.push({x:clamp(fx*width,.6,width-.6),y0:y,y,state:'hang',t:0,vy:0});
    });
    const ledges=[36,72,108];
    ledges.forEach((y,i)=>platforms.push(full(y,i,{checkpoint:i+1})));
    platforms.push(full(TOP,3,{summit:true}));
    return {width,platforms,monsters:[...monsters,...bats],icicles,seeds:[]};
  }

  function createState(width){
    const level=buildLevel(width);
    return {...level,time:0,events:[],checkpoint:0,won:false,wonAt:0,startedAt:0,
      input:{dir:0,buffer:0},shots:[],
      ball:{x:width/2,y:1,vx:0,vy:0,grounded:true,on:level.platforms[0],hearts:MAX_HEARTS,inv:0,dead:0,d:0,dv:0,best:0,coyote:0,stun:0,facing:1,cool:0}};
  }
  function solid(p){return !p.crumble||p.crumble.state!=='fallen';}
  function checkpointPlatform(state){return state.platforms.find(p=>p.checkpoint===state.checkpoint);}
  function resetHazards(state){
    for(const p of state.platforms)if(p.crumble){p.crumble.state='solid';p.crumble.t=0;}
    for(const m of state.monsters){m.alive=true;m.t=0;if(m.type==='crawler')m.x=(m.plat.x0+m.plat.x1)/2;}
    for(const i of state.icicles){i.state='hang';i.y=i.y0;i.vy=0;i.t=0;}
    state.seeds.length=0;state.shots.length=0;
  }
  function respawn(state){
    const b=state.ball,p=checkpointPlatform(state);
    Object.assign(b,{x:state.width/2,y:p.y+1,vx:0,vy:0,grounded:true,on:p,hearts:MAX_HEARTS,inv:1,dead:0,d:0,dv:0,coyote:0,stun:0});
    state.input.buffer=0;
    resetHazards(state);
  }
  function restart(state){
    state.checkpoint=0;state.won=false;state.startedAt=state.time;state.ball.best=0;respawn(state);state.ball.inv=0;
  }
  function hurt(state,fromX){
    const b=state.ball;
    if(b.inv>0||b.dead||state.won)return;
    b.hearts--;state.events.push({type:'hurt'});
    if(b.hearts<=0){b.dead=.001;b.grounded=false;state.events.push({type:'pop',x:b.x,y:b.y});return;}
    b.inv=1.6;b.stun=.3;b.grounded=false;b.on=null;b.coyote=0;b.vy=14;b.vx=(b.x>=fromX?1:-1)*8;
  }
  // dir: -1 left, 0 stop, 1 right (fractions allowed). jump() is buffered briefly before landing.
  function setDir(state,dir){state.input.dir=clamp(Number(dir)||0,-1,1);}
  function jump(state){if(!state.ball.dead&&!state.won)state.input.buffer=BUFFER;}
  function monsterY(m){return m.type==='crawler'?m.plat.y+.6:m.y;}
  function throwBall(state){
    const b=state.ball;
    if(b.dead||state.won||b.cool>0||state.shots.length>=SHOT_MAX)return false;
    let vx=b.facing*SHOT_SPEED,vy=3,best=AIM_RANGE;
    for(const m of state.monsters){
      if(!m.alive)continue;
      const dx=m.x-b.x,dy=monsterY(m)-b.y,d=Math.hypot(dx,dy);
      // Ahead of Dahrooj, within about 70 degrees of the facing direction; lead for the shot's drop.
      if(d<best&&dx*b.facing>0&&Math.abs(dy)<Math.abs(dx)*2.8){best=d;vx=dx/d*SHOT_SPEED;vy=dy/d*SHOT_SPEED+G*.125*d/SHOT_SPEED;}
    }
    state.shots.push({x:b.x+Math.sign(vx||b.facing)*.9,y:b.y+.2,vx,vy,t:0});
    b.cool=SHOT_COOL;state.events.push({type:'throw'});return true;
  }
  function approach(v,target,rate){return v<target?Math.min(target,v+rate):Math.max(target,v-rate);}
  function land(state,p,impact){
    const b=state.ball;
    b.y=p.y+1;b.on=p;b.dv+=Math.min(18,impact*.9);
    state.events.push({type:'land',power:Math.min(1,impact/30)});
    b.vy=0;b.grounded=true;b.coyote=0;
    if(p.crumble&&p.crumble.state==='solid'){p.crumble.state='shaking';p.crumble.t=0;}
    if(p.checkpoint!=null&&p.checkpoint>state.checkpoint){state.checkpoint=p.checkpoint;state.events.push({type:'checkpoint',index:p.checkpoint});}
    if(p.summit&&!state.won){state.won=true;state.wonAt=state.time;state.events.push({type:'summit',time:state.time-state.startedAt});}
  }
  function onSpikes(p,x){
    if(!p.spikes)return false;
    const a=p.x0+p.spikes[0]*(p.x1-p.x0),c=p.x0+p.spikes[1]*(p.x1-p.x0);
    return x>a-.45&&x<c+.45;
  }

  function stepWorld(state,dt){
    state.time+=dt;
    for(const p of state.platforms){
      if(p.move){const x0=p.base+p.move.amp*Math.sin(state.time*p.move.speed+p.move.phase);p.dx=x0-p.x0;p.x0=x0;p.x1=x0+p.w;}
      if(p.crumble){
        const c=p.crumble;c.t+=dt;
        if(c.state==='shaking'&&c.t>.6){c.state='fallen';c.t=0;}
        else if(c.state==='fallen'&&c.t>3){c.state='solid';c.t=0;}
      }
    }
    const b=state.ball;
    for(const m of state.monsters){
      m.t+=dt;
      if(!m.alive)continue;
      if(m.type==='crawler'){
        m.x+=m.dir*m.speed*dt+m.plat.dx;
        if(m.x<m.plat.x0+.7){m.x=m.plat.x0+.7;m.dir=1;}
        if(m.x>m.plat.x1-.7){m.x=m.plat.x1-.7;m.dir=-1;}
        if(!solid(m.plat))m.alive=false;
      }else if(m.type==='bat'){
        const k=(Math.sin(m.t*m.speed+m.phase)+1)/2;m.x=m.x0+(m.x1-m.x0)*k;m.y=m.y0+.6*Math.sin(m.t*3.1+m.phase);
      }else if(m.type==='spitter'){
        m.x=m.plat.x0+m.f*(m.plat.x1-m.plat.x0);m.y=m.plat.y+.75;
        m.cool-=dt;m.swell=Math.max(0,1-m.cool/.5);
        if(m.cool<=0){
          m.cool=2.4;
          if(!b.dead&&Math.abs(b.y-m.y)<5&&Math.abs(b.x-m.x)<12){
            const dir=b.x>=m.x?1:-1;state.seeds.push({x:m.x+dir*.6,y:m.y+.1,vx:dir*7,t:0});state.events.push({type:'spit'});
          }
        }
      }
    }
    for(const s of state.seeds){s.x+=s.vx*dt;s.t+=dt;}
    state.seeds=state.seeds.filter(s=>s.t<3&&s.x>-1&&s.x<state.width+1);
    for(const i of state.icicles){
      i.t+=dt;
      if(i.state==='hang'&&!b.dead&&Math.abs(b.x-i.x)<1.7&&b.y<i.y&&b.y>i.y-9){i.state='shake';i.t=0;}
      else if(i.state==='shake'&&i.t>.45){i.state='fall';i.t=0;i.vy=0;}
      else if(i.state==='fall'){i.vy-=G*.8*dt;i.y+=i.vy*dt;if(i.y<i.y0-12){i.state='gone';i.t=0;}}
      else if(i.state==='gone'&&i.t>3){i.state='hang';i.y=i.y0;i.t=0;}
    }
  }

  function stepBall(state,dt){
    const b=state.ball,W=state.width;
    b.inv=Math.max(0,b.inv-dt);
    b.dv+=(-b.d*260-b.dv*12)*dt;b.d=clamp(b.d+b.dv*dt,-.25,.4);
    if(b.dead){b.dead+=dt;if(b.dead>1.1)respawn(state);return;}
    b.stun=Math.max(0,b.stun-dt);b.coyote=Math.max(0,b.coyote-dt);
    const input=state.input,dir=b.stun>0||state.won?0:input.dir;
    input.buffer=Math.max(0,input.buffer-dt);b.cool=Math.max(0,b.cool-dt);
    if(dir)b.facing=Math.sign(dir);
    if(b.grounded){
      const p=b.on;
      if(!p||!solid(p)){b.grounded=false;b.on=null;b.coyote=COYOTE;}
      else{
        b.x+=p.dx;b.y=p.y+1;
        b.vx=approach(b.vx,dir*RUN,(p.ice?ACCEL_ICE:ACCEL)*dt);
        b.x+=b.vx*dt;
        if(!p.full&&(b.x<p.x0-.3||b.x>p.x1+.3)){b.grounded=false;b.on=null;b.coyote=COYOTE;}
        else if(onSpikes(p,b.x))hurt(state,(p.x0+p.x1)/2);
      }
    }
    if(input.buffer>0&&(b.grounded||b.coyote>0)&&!b.dead){
      b.vy=JUMP;b.grounded=false;b.on=null;b.coyote=0;input.buffer=0;b.dv-=6;
      state.events.push({type:'launch',power:.6});
    }
    if(!b.grounded){
      const prevBottom=b.y-1;
      b.vy=Math.max(-40,b.vy-G*dt);
      if(b.stun<=0)b.vx=approach(b.vx,dir*RUN,ACCEL_AIR*dt);
      b.x+=b.vx*dt;b.y+=b.vy*dt;
      if(b.vy<=0){
        for(const p of state.platforms){
          if(!solid(p))continue;
          if(prevBottom>=p.y-.001&&b.y-1<=p.y&&b.x>=p.x0-.35&&b.x<=p.x1+.35){
            land(state,p,-b.vy);
            if(onSpikes(p,b.x))hurt(state,(p.x0+p.x1)/2);
            break;
          }
        }
      }
    }
    if(b.x<1){b.x=1;b.vx=Math.abs(b.vx)*.55;}
    if(b.x>W-1){b.x=W-1;b.vx=-Math.abs(b.vx)*.55;}
    b.best=Math.max(b.best,b.y-1);
    // Monsters, seeds and icicles.
    for(const m of state.monsters){
      if(!m.alive||b.dead)continue;
      const my=m.type==='crawler'?m.plat.y+.6:m.y,r=m.type==='bat'?.45:.7;
      if(Math.hypot(b.x-m.x,b.y-my)>HIT+r)continue;
      if(m.type!=='bat'&&b.vy<-2&&b.y>my+.3){
        m.alive=false;m.t=0;b.vy=18;b.grounded=false;b.on=null;state.events.push({type:'stomp',x:m.x,y:my});
      }else hurt(state,m.x);
    }
    for(const s of state.seeds)if(!b.dead&&Math.hypot(b.x-s.x,b.y-s.y)<HIT+.2){s.t=99;hurt(state,s.x);}
    // Thrown balls: one hit defeats any monster and knocks seeds out of the air.
    for(const shot of state.shots){
      shot.t+=dt;shot.vy-=G*.25*dt;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;
      if(shot.x<0||shot.x>W)shot.t=SHOT_LIFE;
      for(const m of state.monsters){
        if(!m.alive||shot.t>=SHOT_LIFE)continue;
        const r=m.type==='bat'?.55:.75;
        if(Math.hypot(shot.x-m.x,shot.y-monsterY(m))<r+SHOT_R){m.alive=false;m.t=0;shot.t=SHOT_LIFE;state.events.push({type:'kill',x:m.x,y:monsterY(m)});}
      }
      for(const seed of state.seeds)if(shot.t<SHOT_LIFE&&Math.hypot(shot.x-seed.x,shot.y-seed.y)<.3+SHOT_R){seed.t=99;shot.t=SHOT_LIFE;}
    }
    state.shots=state.shots.filter(shot=>shot.t<SHOT_LIFE);
    for(const i of state.icicles)if(i.state==='fall'&&!b.dead&&Math.hypot(b.x-i.x,b.y-(i.y-.6))<HIT+.2){i.state='gone';i.t=0;hurt(state,i.x);}
  }

  function step(state,dt){
    const n=Math.max(1,Math.ceil(dt/(1/240)));
    for(let i=0;i<n;i++){stepWorld(state,dt/n);stepBall(state,dt/n);}
  }

  // Exported for logic tests (reachability and rules) without a browser.
  const api={G,RUN,JUMP,SHOT_COOL,SHOT_MAX,MAX_HEARTS,MAX_WIDTH,TOP,SECTIONS,buildLevel,createState,step,setDir,jump,throwBall,hurt,respawn,restart,solid};
  globalThis.DahroojClimbCore=api;
  if(typeof document==='undefined')return;

  window.createDahroojClimb=({canvas,ctx,view,drawPaper,paintBall,padEl=null,makeShotSprite,currentStyle=()=>'jelly',sounds={},onSummit=()=>{},onCheckpoint=()=>{}})=>{
    // Thrown balls use the same eyeless sprites as Duel, in the style chosen at the moment of the throw.
    const shotSprites=new Map();
    const shotSprite=style=>{if(!shotSprites.has(style))shotSprites.set(style,makeShotSprite(style));return shotSprites.get(style);};
    let state=null,active=false,cam=0,parts=[],clouds=[],ridge=[];
    const touches=new Map(),keys={left:false,right:false};
    const ink='#2c2d3d';
    function setup(){
      const {W,R}=view();const width=Math.min(MAX_WIDTH,W/R);
      if(!state){state=createState(width);restart(state);return;}
      if(Math.abs(width-state.width)<.01)return;
      // Rebuild the geometry for the new width; keep progress.
      const next=createState(width),b=state.ball,k=width/state.width;
      Object.assign(next,{checkpoint:state.checkpoint,won:state.won,wonAt:state.wonAt,startedAt:state.startedAt,time:state.time});
      Object.assign(next.ball,{...b,x:b.x*k,grounded:false,on:null});
      state=next;
    }
    for(let i=0;i<14;i++)clouds.push({y:8+i*11+Math.random()*5,f:Math.random(),s:.6+Math.random()*.8,speed:.01+Math.random()*.02});
    for(let i=0;i<=40;i++)ridge.push([Math.sin(i*1.7)*.5+Math.sin(i*.6+1)*.8,Math.sin(i*2.3+2)*.4+Math.sin(i*.9)*.7]);

    const geo=()=>{const {W,H,R}=view();const ox=(W-state.width*R)/2,base=showPad?Math.min(H*.74,padTop()-R*.6):H*.86;return {W,H,R,ox,base,sx:x=>ox+x*R,sy:y=>base-(y-cam)*R};};
    function point(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
    // Common mobile platformer layout: the left thumb holds left/right (sliding between them
    // changes direction; it stays pressed slightly outside the button), the right thumb jumps.
    const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
    let showPad=coarse;
    // Button centres come from the on-screen pills; each half of the screen is the touch area.
    const padButtons=padEl?Object.fromEntries([...padEl.querySelectorAll('[data-pad]')].map(el=>[el.dataset.pad,el])):{};
    function centre(name,fallback){
      const el=padButtons[name];if(!el||padEl.hidden)return fallback;
      const r=el.getBoundingClientRect(),c=canvas.getBoundingClientRect();return r.left+r.width/2-c.left;
    }
    function padTop(){
      const {H}=view();if(!padEl||padEl.hidden)return H-150;
      return padEl.getBoundingClientRect().top-canvas.getBoundingClientRect().top;
    }
    function pad(){
      const {W}=view();
      return {left:centre('left',W*.12),right:centre('right',W*.28),jump:centre('jump',W*.88),shoot:centre('shoot',W*.72),split:W/2};
    }
    function syncPad(){if(padEl)padEl.hidden=!(active&&showPad);}
    function steer(){
      let dir=0;
      for(const t of touches.values())if(t.side==='move')dir=t.dir;
      if(keys.left!==keys.right)dir=keys.left?-1:1;
      setDir(state,dir);
    }
    function aimDir(t){const g=pad();t.dir=t.x<(g.left+g.right)/2?-1:1;}
    function down(e){
      if(!active)return;
      e.preventDefault();canvas.setPointerCapture?.(e.pointerId);sounds.wake?.();
      if(e.pointerType==='touch'&&!showPad){showPad=true;syncPad();}
      if(state.won){if(state.time-state.wonAt>1.2)restart(state);return;}
      const p=point(e),g=pad();
      const side=p.x<g.split?'move':Math.abs(p.x-g.shoot)<Math.abs(p.x-g.jump)?'shoot':'jump';
      const t={x:p.x,y:p.y,side,dir:0};
      touches.set(e.pointerId,t);
      if(side==='move'){aimDir(t);steer();}else if(side==='jump')jump(state);else throwBall(state);
    }
    function move(e){
      const t=touches.get(e.pointerId);if(!t)return;
      const p=point(e);t.x=p.x;t.y=p.y;
      if(t.side==='move'){aimDir(t);steer();}
    }
    function up(e){if(touches.delete(e.pointerId))steer();}
    function cancel(e){if(touches.delete(e.pointerId))steer();}
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);
    canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
    const KEYS={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
    function key(e,pressed){
      if(!active||e.target?.closest?.('input,textarea'))return;
      if(KEYS[e.code]){keys[KEYS[e.code]]=pressed;steer();e.preventDefault();}
      else if(e.code==='KeyX'||e.code==='KeyJ'){e.preventDefault();if(pressed&&!e.repeat&&!state.won){sounds.wake?.();throwBall(state);}}
      else if(e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW'){
        e.preventDefault();
        if(pressed&&!e.repeat){sounds.wake?.();if(state.won){if(state.time-state.wonAt>1.2)restart(state);}else jump(state);}
      }
    }
    addEventListener('keydown',e=>key(e,true));addEventListener('keyup',e=>key(e,false));

    function burst(x,y,colors,count,speed){
      for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,v=speed*(.4+Math.random()*.8);
        parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v+speed*.3,t:0,max:.5+Math.random()*.4,c:colors[i%colors.length],s:.12+Math.random()*.12});}
    }
    function handleEvents(){
      for(const e of state.events){
        if(e.type==='land')sounds.land?.(e.power);
        else if(e.type==='launch')sounds.launch?.(e.power);
        else if(e.type==='hurt')sounds.hurt?.();
        else if(e.type==='pop'){sounds.pop?.();burst(e.x,e.y,[ink,'#fffaf2','#c8584b'],18,9);}
        else if(e.type==='stomp'||e.type==='kill'){sounds.pop?.();burst(e.x,e.y,['#5b3a59','#fffaf2',ink],12,7);}
        else if(e.type==='throw')sounds.launch?.(.25);
        else if(e.type==='checkpoint'){sounds.checkpoint?.();onCheckpoint(e.index);}
        else if(e.type==='summit'){sounds.checkpoint?.();burst(state.ball.x,state.ball.y+1,['#c8584b','#e2b04a','#7f9a5b','#5b8bb5','#fffaf2'],40,14);onSummit(e.time);}
      }
      state.events.length=0;
    }
    function update(dt){
      if(!active)return;
      step(state,dt);handleEvents();
      for(const p of parts){p.t+=dt;p.vy-=G*.35*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}
      parts=parts.filter(p=>p.t<p.max);
      const {H,R}=view(),target=Math.max(0,state.ball.y-H*.28/R);
      cam+=(target-cam)*(1-Math.exp(-(state.ball.vy<-15?9:5)*dt));
    }

    /* ---------- drawing ---------- */
    function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect?c.roundRect(x,y,w,h,r):c.rect(x,y,w,h);}
    function drawBackdrop(c,g){
      const {W,H,R}=g,alt=clamp(cam/TOP,0,1);
      // Thin air: the paper turns paler towards the summit.
      c.fillStyle=`rgba(255,255,255,${alt*.28})`;c.fillRect(0,0,W,H);
      for(const [layer,alpha,par] of [[0,.05,.12],[1,.08,.3]]){
        const base=H*.95+cam*R*par,amp=H*(layer?.16:.24);
        if(base-amp*1.6>H)continue;
        c.fillStyle=`rgba(44,45,61,${alpha})`;c.beginPath();c.moveTo(0,H);
        for(let i=0;i<=40;i++){const x=i/40*W,h=ridge[i][layer];c.lineTo(x,base-amp*(1.1+h*.45)-(i%5===2?amp*.3:0));}
        c.lineTo(W,H);c.fill();
      }
      for(const cl of clouds){
        const x=((cl.f+state.time*cl.speed)%1.3-.15)*W,y=g.sy(cl.y)*.55+H*.2;
        if(y<-60||y>H+60)continue;
        c.fillStyle='rgba(255,255,255,.45)';c.beginPath();
        c.ellipse(x,y,R*2.2*cl.s,R*.7*cl.s,0,0,Math.PI*2);c.ellipse(x+R*1.4*cl.s,y-R*.35*cl.s,R*1.3*cl.s,R*.6*cl.s,0,0,Math.PI*2);c.fill();
      }
      if(g.ox>1){
        c.fillStyle='rgba(44,45,61,.16)';c.fillRect(0,0,g.ox,H);c.fillRect(W-g.ox,0,g.ox,H);
        c.strokeStyle='rgba(44,45,61,.35)';c.lineWidth=2;c.beginPath();c.moveTo(g.ox,0);c.lineTo(g.ox,H);c.moveTo(W-g.ox,0);c.lineTo(W-g.ox,H);c.stroke();
      }
    }
    function drawPlatform(c,g,p){
      const {R}=g,y=g.sy(p.y);
      if(y<-R*2||y>g.H+R*3)return;
      let x=g.sx(p.x0),w=(p.x1-p.x0)*R,shake=0,alpha=1,drop=0;
      if(p.crumble){
        if(p.crumble.state==='shaking')shake=Math.sin(state.time*70)*R*.06;
        if(p.crumble.state==='fallen'){drop=p.crumble.t*p.crumble.t*R*14;alpha=Math.max(0,1-p.crumble.t*2.2);if(alpha<=0)return;}
      }
      c.save();c.globalAlpha=alpha;c.translate(shake,drop);
      const theme=THEMES[p.theme],h=p.full?(p.ground?g.H:R*.9):R*.72;
      c.fillStyle='rgba(44,45,61,.86)';roundRect(c,x,y,w,h,p.full?0:R*.22);c.fill();
      c.fillStyle=p.ice?'#d6ecf5':theme.top;roundRect(c,x,y-R*.02,w,R*.2,p.full?0:[R*.22,R*.22,0,0]);c.fill();
      if(p.ice){c.strokeStyle='rgba(255,255,255,.9)';c.lineWidth=2;c.beginPath();c.moveTo(x+R*.3,y+R*.06);c.lineTo(x+w*.45,y+R*.06);c.stroke();}
      if(p.crumble){c.strokeStyle='rgba(255,250,242,.55)';c.lineWidth=1.5;c.beginPath();
        for(let k=1;k<4;k++){const cx=x+w*k/4;c.moveTo(cx,y+R*.2);c.lineTo(cx-R*.12,y+R*.34);c.lineTo(cx+R*.06,y+R*.5);}c.stroke();}
      if(p.move){c.fillStyle='rgba(255,250,242,.7)';for(const s of [-1,1]){const cx=x+w/2+s*R*.45;c.beginPath();c.moveTo(cx+s*R*.16,y+R*.36);c.lineTo(cx,y+R*.27);c.lineTo(cx,y+R*.45);c.fill();}}
      if(p.spikes){
        const a=x+p.spikes[0]*w,b=x+p.spikes[1]*w,n=Math.max(2,Math.round((b-a)/(R*.4)));
        c.fillStyle=ink;c.beginPath();
        for(let k=0;k<n;k++){const s=a+(b-a)*k/n,e=a+(b-a)*(k+1)/n;c.moveTo(s,y);c.lineTo((s+e)/2,y-R*.5);c.lineTo(e,y);}c.fill();
      }
      if(p.checkpoint!=null&&!p.ground||p.summit){
        const fx=p.summit?g.sx(state.width/2):g.sx(state.width*.86),on=p.summit?state.won:state.checkpoint>=p.checkpoint;
        const hgt=R*(p.summit?3.2:2),wave=Math.sin(state.time*4)*R*.12;
        c.strokeStyle=ink;c.lineWidth=Math.max(2,R*.09);c.beginPath();c.moveTo(fx,y);c.lineTo(fx,y-hgt);c.stroke();
        c.fillStyle=on?'#c8584b':'rgba(255,250,242,.9)';c.beginPath();
        c.moveTo(fx,y-hgt);c.quadraticCurveTo(fx+R*.7,y-hgt+wave,fx+R*1.3,y-hgt+R*.35);c.lineTo(fx,y-hgt+R*.75);c.fill();
        c.strokeStyle=ink;c.lineWidth=1.5;c.stroke();
      }
      c.restore();
    }
    // Monsters share Dahrooj's look: soft gradient bodies, a gloss highlight and the same eyes.
    function shade(c,x,y,r,light,dark){const gr=c.createRadialGradient(x-r*.35,y-r*.45,r*.08,x,y,r*1.15);gr.addColorStop(0,light);gr.addColorStop(1,dark);return gr;}
    function eye(c,x,y,r,lx,ly,brow){
      c.fillStyle='#fffaf2';c.beginPath();c.ellipse(x,y,r,r*1.12,0,0,Math.PI*2);c.fill();
      c.fillStyle=ink;c.beginPath();c.arc(x+lx*r*.4,y+ly*r*.45,r*.55,0,Math.PI*2);c.fill();
      c.fillStyle='rgba(255,255,255,.9)';c.beginPath();c.arc(x+lx*r*.4-r*.2,y+ly*r*.45-r*.22,r*.16,0,Math.PI*2);c.fill();
      if(brow){c.strokeStyle=ink;c.lineWidth=Math.max(1.5,r*.32);c.lineCap='round';c.beginPath();c.moveTo(x-brow*r*1.05,y-r*1.25);c.lineTo(x+brow*r*.75,y-r*.8);c.stroke();}
    }
    function groundShadow(c,x,y,w){c.fillStyle='rgba(44,45,61,.18)';c.beginPath();c.ellipse(x,y+1,w,w*.18,0,0,Math.PI*2);c.fill();}
    function look(m,x,y){const b=state.ball,dx=b.x-x,dy=-(b.y-y),d=Math.hypot(dx,dy)||1;return [dx/d,dy/d];}
    function drawCrawler(c,g,m){
      const {R}=g,x=g.sx(m.x),y=g.sy(m.plat.y),r=R*.78;
      if(!m.alive){
        if(m.t>.6)return;c.globalAlpha=1-m.t/.6;
        c.fillStyle=shade(c,x,y-r*.1,r*1.2,'#8c5f8a','#4a2c48');c.beginPath();c.ellipse(x,y-r*.14,r*1.25,r*.2,0,0,Math.PI*2);c.fill();
        c.globalAlpha=1;return;
      }
      const t=m.t,wob=Math.sin(t*12)*r*.05,dir=m.dir,[lx,ly]=look(m,m.x,m.plat.y+.6);
      groundShadow(c,x,y,r*1.05);
      // Legs scuttle in turn.
      c.strokeStyle=ink;c.lineWidth=Math.max(2,r*.13);c.lineCap='round';
      for(let k=0;k<4;k++){const lxp=x+(k-1.5)*r*.5,step=Math.sin(t*16+k*1.6)*r*.12;c.beginPath();c.moveTo(lxp,y-r*.2);c.lineTo(lxp+step,y);c.stroke();}
      // Spikes along the back.
      c.fillStyle=ink;
      for(let k=-2;k<=2;k++){const a=Math.PI*(.5+k*.17),bx=x+Math.cos(a)*r*.92,by=y-r*.25-Math.sin(a)*r*.62-wob,len=r*(.34+(k===0?.08:0));
        c.beginPath();c.moveTo(bx-r*.12,by+r*.05);c.quadraticCurveTo(bx+Math.cos(a)*len*.3,by-len*.6,bx+Math.cos(a)*len*.55,by-len);c.lineTo(bx+r*.12,by+r*.05);c.fill();}
      // Body with segments and gloss.
      c.fillStyle=shade(c,x,y-r*.4,r,'#9b6a98','#4a2c48');
      c.beginPath();c.ellipse(x,y-r*.3-wob,r,r*.68+wob,0,Math.PI,0);c.quadraticCurveTo(x+r,y-r*.1,x+r*.8,y-r*.08);c.lineTo(x-r*.8,y-r*.08);c.quadraticCurveTo(x-r,y-r*.1,x-r,y-r*.3);c.fill();
      c.strokeStyle='rgba(44,30,44,.35)';c.lineWidth=Math.max(1.2,r*.06);
      for(const k of [-.45,0,.45]){c.beginPath();c.ellipse(x+k*r,y-r*.32-wob,r*.22,r*.5,0,Math.PI*1.15,Math.PI*1.85);c.stroke();}
      c.fillStyle='rgba(255,255,255,.28)';c.beginPath();c.ellipse(x-r*.35,y-r*.78-wob,r*.28,r*.1,-.35,0,Math.PI*2);c.fill();
      // Face towards where it walks.
      const fx=x+dir*r*.38,fy=y-r*.5-wob;
      eye(c,fx-r*.2,fy,r*.2,lx,ly,1);eye(c,fx+r*.22,fy,r*.2,lx,ly,-1);
      c.strokeStyle=ink;c.lineWidth=Math.max(1.4,r*.07);c.beginPath();c.moveTo(fx-r*.22,fy+r*.32);c.quadraticCurveTo(fx,fy+r*.24,fx+r*.24,fy+r*.32);c.stroke();
      c.fillStyle='#fffaf2';for(const s2 of [-1,1]){c.beginPath();c.moveTo(fx+s2*r*.13-r*.05,fy+r*.29);c.lineTo(fx+s2*r*.13,fy+r*.42);c.lineTo(fx+s2*r*.13+r*.05,fy+r*.29);c.fill();}
    }
    function drawBat(c,g,m){
      const {R}=g;
      if(!m.alive){if(m.t>.5)return;c.globalAlpha=1-m.t/.5;}
      const x=g.sx(m.x),y=g.sy(m.y),r=R*.52,flap=Math.sin(m.t*16),[lx,ly]=look(m,m.x,m.y);
      // Wings: a membrane between three finger bones, scalloped underneath.
      for(const s2 of [-1,1]){
        const tipX=x+s2*r*2.3,tipY=y-r*(.55+flap*.85),mid=x+s2*r*1.45;
        c.fillStyle='#3a3450';c.beginPath();c.moveTo(x+s2*r*.55,y-r*.25);
        c.quadraticCurveTo(x+s2*r*1.4,y-r*(1+flap*.6),tipX,tipY);
        c.quadraticCurveTo(x+s2*r*2.05,y+r*.25,x+s2*r*1.8,y+r*.3);
        c.quadraticCurveTo(mid+s2*r*.05,y+r*.05,mid-s2*r*.1,y+r*.42);
        c.quadraticCurveTo(x+s2*r*1.05,y+r*.15,x+s2*r*.9,y+r*.45);
        c.quadraticCurveTo(x+s2*r*.7,y+r*.2,x+s2*r*.45,y+r*.3);c.fill();
        c.strokeStyle='rgba(255,250,242,.22)';c.lineWidth=Math.max(1,r*.06);c.beginPath();
        for(const f of [[1.8,.3],[1.35,.42],[.9,.45]]){c.moveTo(x+s2*r*.6,y-r*.15);c.lineTo(x+s2*r*f[0],y+r*f[1]);}c.stroke();
      }
      // Ears, fuzzy body and belly.
      for(const s2 of [-1,1]){
        c.fillStyle='#2c2838';c.beginPath();c.moveTo(x+s2*r*.62,y-r*.4);c.lineTo(x+s2*r*.42,y-r*1.22);c.lineTo(x+s2*r*.08,y-r*.68);c.fill();
        c.fillStyle='#c98a9a';c.beginPath();c.moveTo(x+s2*r*.5,y-r*.55);c.lineTo(x+s2*r*.4,y-r*1.0);c.lineTo(x+s2*r*.2,y-r*.68);c.fill();
      }
      c.fillStyle=shade(c,x,y,r*.82,'#5a5372','#24212f');c.beginPath();c.arc(x,y,r*.82,0,Math.PI*2);c.fill();
      c.fillStyle='rgba(255,250,242,.12)';c.beginPath();c.ellipse(x,y+r*.35,r*.42,r*.3,0,0,Math.PI*2);c.fill();
      eye(c,x-r*.3,y-r*.12,r*.22,lx,ly,1);eye(c,x+r*.3,y-r*.12,r*.22,lx,ly,-1);
      c.fillStyle='#fffaf2';for(const s2 of [-1,1]){c.beginPath();c.moveTo(x+s2*r*.14-r*.06,y+r*.3);c.lineTo(x+s2*r*.14,y+r*.48);c.lineTo(x+s2*r*.14+r*.06,y+r*.3);c.fill();}
      c.globalAlpha=1;
    }
    function drawSpitter(c,g,m){
      const {R}=g,x=g.sx(m.x),y=g.sy(m.plat.y),r=R*.76,b=state.ball;
      if(!m.alive){if(m.t>.6)return;c.globalAlpha=1-m.t/.6;}
      groundShadow(c,x,y,r*.9);
      // Terracotta pot with a rim and soil.
      const pot=c.createLinearGradient(x-r,0,x+r,0);pot.addColorStop(0,'#c47a55');pot.addColorStop(1,'#8a4429');
      c.fillStyle=pot;c.beginPath();c.moveTo(x-r*.62,y);c.lineTo(x-r*.78,y-r*.66);c.lineTo(x+r*.78,y-r*.66);c.lineTo(x+r*.62,y);c.closePath();c.fill();
      c.fillStyle='#9a4f31';roundRect(c,x-r*.92,y-r*.86,r*1.84,r*.26,r*.08);c.fill();
      c.fillStyle='#4a3326';c.beginPath();c.ellipse(x,y-r*.86,r*.72,r*.1,0,0,Math.PI*2);c.fill();
      if(m.alive){
        const dir=b.x>=m.x?1:-1,sw=m.swell,s2=1+sw*.16,hx=x+dir*r*.1,hy=y-r*1.65,hr=r*.66*s2,[lx,ly]=look(m,m.x,m.plat.y+1.6);
        // Stem and leaves.
        c.strokeStyle='#4f7a3a';c.lineWidth=Math.max(2.5,r*.17);c.lineCap='round';
        c.beginPath();c.moveTo(x,y-r*.86);c.quadraticCurveTo(x-dir*r*.35,y-r*1.25,hx,hy+hr*.7);c.stroke();
        c.fillStyle='#5f8f45';
        for(const s3 of [-1,1]){c.beginPath();c.ellipse(x+s3*r*.38,y-r*1.12,r*.34,r*.13,s3*-.6,0,Math.PI*2);c.fill();}
        // Head: a spotted bulb with a mouth that opens before it spits.
        c.fillStyle=shade(c,hx,hy,hr,'#86b463','#3f6a2f');c.beginPath();c.arc(hx,hy,hr,0,Math.PI*2);c.fill();
        c.fillStyle='rgba(230,240,190,.35)';for(const [a,d,sz] of [[-2.4,.55,.13],[-1.2,.6,.1],[2.6,.5,.11]]){c.beginPath();c.arc(hx+Math.cos(a)*hr*d*-dir,hy+Math.sin(a)*hr*d,hr*sz,0,Math.PI*2);c.fill();}
        const open=.18+sw*.55,mx=hx+dir*hr*.55;
        c.fillStyle='#5a1f2a';c.beginPath();c.moveTo(hx+dir*hr*.05,hy+hr*.1);
        c.lineTo(mx+dir*hr*.5,hy+hr*.1-hr*open);c.lineTo(mx+dir*hr*.5,hy+hr*.1+hr*open);c.closePath();c.fill();
        c.fillStyle='#fffaf2';
        for(let k=1;k<=2;k++){const tx=hx+dir*hr*(.2+k*.28),to=open*(.25+k*.3)*hr;
          c.beginPath();c.moveTo(tx-dir*hr*.07,hy+hr*.1-to);c.lineTo(tx,hy+hr*.1-to+hr*.17);c.lineTo(tx+dir*hr*.07,hy+hr*.1-to);c.fill();
          c.beginPath();c.moveTo(tx-dir*hr*.07,hy+hr*.1+to);c.lineTo(tx,hy+hr*.1+to-hr*.17);c.lineTo(tx+dir*hr*.07,hy+hr*.1+to);c.fill();}
        eye(c,hx-dir*hr*.22,hy-hr*.38,hr*.27,lx,ly,dir);
        c.fillStyle='rgba(255,255,255,.25)';c.beginPath();c.ellipse(hx-hr*.35,hy-hr*.55,hr*.22,hr*.1,-.5,0,Math.PI*2);c.fill();
      }
      c.globalAlpha=1;
    }
    function drawMonster(c,g,m){
      if(m.type==='crawler')drawCrawler(c,g,m);
      else if(m.type==='bat')drawBat(c,g,m);
      else if(m.type==='spitter')drawSpitter(c,g,m);
    }
    function drawHazards(c,g){
      const {R}=g;
      for(const s of state.seeds){c.fillStyle='#3d5a2c';c.beginPath();c.ellipse(g.sx(s.x),g.sy(s.y),R*.28,R*.2,0,0,Math.PI*2);c.fill();}
      for(const i of state.icicles){
        if(i.state==='gone')continue;
        const x=g.sx(i.x)+(i.state==='shake'?Math.sin(state.time*60)*R*.06:0),y=g.sy(i.y);
        if(y<-R*3||y>g.H+R)continue;
        c.fillStyle='#bfe0ee';c.strokeStyle='rgba(44,45,61,.5)';c.lineWidth=1.5;
        c.beginPath();c.moveTo(x-R*.35,y);c.lineTo(x+R*.35,y);c.lineTo(x,y+R*1.3);c.closePath();c.fill();c.stroke();
        if(i.state==='hang'||i.state==='shake'){c.fillStyle='#eef6fa';c.beginPath();c.ellipse(x,y,R*.55,R*.2,0,0,Math.PI*2);c.fill();}
      }
    }
    function drawBall(c,g){
      const b=state.ball,{R}=g;
      if(b.dead)return;
      if(b.inv>0&&Math.floor(b.inv*12)%2)c.globalAlpha=.45;
      const d=b.d,sx=1+d*.75,sy=1-d;
      const x=g.sx(b.x),y=g.sy(b.y)+R*(1-sy);
      let face='open';
      if(state.won)face='joy';else if(b.inv>1)face='closed';else if(!b.grounded&&b.vy<-22)face='wide';else if(!b.grounded)face='focus';
      const s=Math.hypot(b.vx,b.vy)||1,lx=clamp(b.vx/RUN,-1,1)*.8,ly=b.grounded?0:clamp(-b.vy/s,-1,1)*.6;
      paintBall(c,x,y,R,sx,sy,face,lx,ly,0,b.vx*R,-b.vy*R);
      c.globalAlpha=1;
    }
    // Light up the pressed buttons, like the selected mode button.
    function drawTouch(){
      if(!padEl||padEl.hidden)return;
      const held={left:false,right:false,jump:false,shoot:false};
      for(const t of touches.values()){if(t.side==='move')held[t.dir<0?'left':'right']=true;else held[t.side]=true;}
      for(const [name,el] of Object.entries(padButtons))if(el.classList.contains('on')!==held[name])el.classList.toggle('on',held[name]);
    }
    function heart(c,x,y,s,full){
      c.beginPath();c.moveTo(x,y+s*.35);c.bezierCurveTo(x-s*.9,y-s*.25,x-s*.35,y-s*.95,x,y-s*.42);c.bezierCurveTo(x+s*.35,y-s*.95,x+s*.9,y-s*.25,x,y+s*.35);
      if(full){c.fillStyle='#c8584b';c.fill();}else{c.strokeStyle='rgba(44,45,61,.45)';c.lineWidth=1.6;c.stroke();}
    }
    function drawHud(c,g){
      const {W}=g,b=state.ball,top=22;
      for(let i=0;i<MAX_HEARTS;i++)heart(c,W/2+(i-1)*24,top+10,16,i<b.hearts&&!b.dead);
      const bw=Math.min(150,W*.36),bx=W/2-bw/2,by=top+28,k=clamp(b.best/(TOP-1),0,1),now=clamp((b.y-1)/(TOP-1),0,1);
      c.fillStyle='rgba(44,45,61,.15)';roundRect(c,bx,by,bw,4,2);c.fill();
      c.fillStyle='rgba(44,45,61,.35)';roundRect(c,bx,by,bw*k,4,2);c.fill();
      c.fillStyle=ink;c.beginPath();c.arc(bx+bw*now,by+2,4,0,Math.PI*2);c.fill();
      for(const cp of [1,2,3]){const x=bx+bw*(cp*36)/(TOP-1);c.fillStyle=state.checkpoint>=cp?'#c8584b':'rgba(44,45,61,.35)';c.fillRect(x-1,by-3,2,10);}
      c.font='700 12px "Grandstander","Trebuchet MS",sans-serif';c.textAlign='center';c.fillStyle='rgba(44,45,61,.6)';
      c.fillText(`${Math.max(0,Math.round(b.y-1))} m`,W/2,by+20);
      if(state.won){
        c.font='800 17px "Baloo Bhaijaan 2",Tahoma,sans-serif';c.fillStyle=ink;c.direction='rtl';
        c.fillText(state.time-state.wonAt>1.2?'اضغط للتسلق من جديد':'',W/2,g.H*.36);c.direction='ltr';
      }
    }
    function render(){
      if(!active)return;
      drawPaper();
      const {dpr}=view(),g=geo(),c=ctx;
      c.setTransform(dpr,0,0,dpr,0,0);
      drawBackdrop(c,g);
      for(const p of state.platforms)drawPlatform(c,g,p);
      for(const m of state.monsters)drawMonster(c,g,m);
      drawHazards(c,g);
      for(const shot of state.shots){
        shot.style??=currentStyle();
        const r=g.R*SHOT_R*1.3,x=g.sx(shot.x),y=g.sy(shot.y);
        if(makeShotSprite)c.drawImage(shotSprite(shot.style),x-r*1.4,y-r*1.4,r*2.8,r*2.8);
        else paintBall(c,x,y,r,1,1,'none',0,0,0,0,0);
      }
      drawBall(c,g);
      for(const p of parts){c.globalAlpha=1-p.t/p.max;c.fillStyle=p.c;c.beginPath();c.arc(g.sx(p.x),g.sy(p.y),g.R*p.s,0,Math.PI*2);c.fill();}
      c.globalAlpha=1;
      drawTouch();
      drawHud(c,g);
    }
    return {
      enter(){setup();active=true;syncPad();touches.clear();keys.left=keys.right=false;setDir(state,0);cam=Math.max(0,state.ball.y-view().H*.28/view().R);},
      leave(){active=false;syncPad();touches.clear();keys.left=keys.right=false;if(state)setDir(state,0);},
      resize(){shotSprites.clear();if(state)setup();},
      update,render,
      get state(){return state;}
    };
  };
})();
