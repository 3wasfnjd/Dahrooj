import '../assets/duel-online/physics.js';
import {botActive,stepBot} from './bot.mjs';
const P=globalThis.DahroojDuelPhysics;
const PROTOCOL=4;
export class Matchmaker {
  constructor({send,close,id=()=>crypto.randomUUID(),now=()=>Date.now(),random=Math.random,changed=()=>{}}){
    Object.assign(this,{send,close,id,now,random,changed});
    this.clients=new Map();this.queue=[];this.matches=new Map();this.order=0;this.accumulator=0;this.broadcastT=0;
  }
  connect(key,attachment){
    this.clients.set(key,{key,joined:false,order:++this.order,style:'jelly',lastSeen:this.now(),rateAt:this.now(),rate:0,...attachment});
  }
  emit(key,data){if(key==null)return;try{this.send(key,JSON.stringify(data));}catch{try{this.close(key,1011,'Connection lost');}catch{}this.disconnect(key);}}
  receive(key,raw){
    const c=this.clients.get(key);if(!c)return;
    if(typeof raw!=='string'||raw.length>2048){this.close(key,1009,'Message too large');this.disconnect(key);return;}
    let m;try{m=JSON.parse(raw);}catch{return;}
    if(!m||typeof m!=='object')return;
    const now=this.now();
    if(now-c.rateAt>=1000){c.rateAt=now;c.rate=0;}
    if(++c.rate>40){this.close(key,1008,'Too many messages');this.disconnect(key);return;}
    c.lastSeen=now;
    if(m.type==='ping'){this.emit(key,{type:'pong',t:m.t});return;}
    if(m.type==='join'){
      if(m.protocol!==PROTOCOL){this.emit(key,{type:'version'});return;}
      if(c.joined)return;
      c.joined=true;c.style=P.STYLES.includes(m.style)?m.style:'jelly';c.order=++this.order;
      this.queue.push(key);this.emit(key,{type:'waiting'});this.pair();this.changed();return;
    }
    if(!c.joined)return;
    if(m.type==='style'&&P.STYLES.includes(m.style)){
      c.style=m.style;
      const room=this.matches.get(c.match);
      if(room){room.state.styles[c.slot]=c.style;if(room.state.bot===1)room.state.styles[1]=c.style;this.broadcast(room);}
      this.changed();return;
    }
    const room=this.matches.get(c.match);
    if(!room||m.match!==c.match)return;
    const ball=room.state.balls[c.slot];
    if(m.type==='move'){
      if(P.move(room.state,c.slot,m)){this.broadcast(room);this.changed();}return;
    }
    if(m.type==='distraction'){
      if(m.kind!=='ball'||!P.canDistract(room.state,c.slot)||
        m.generation!==ball.generation||now<(c.nextDistraction||0))return;
      const target=m.target;
      if(!P.validDistractionTarget(target))return;
      c.nextDistraction=now+P.SMALL_THROW_INTERVAL*1000;
      this.throwSmall(room,c.slot,target);
      this.changed();return;
    }
    if(m.type==='shot'){
      if(!P.canShoot(room.state,c.slot)||m.generation!==ball.generation||!P.launch(ball,c.slot,m)){
        this.emit(key,{type:'rejected',seq:m.seq,state:P.snapshot(room.state)});return;
      }
      this.broadcast(room);this.changed();
    }else if(m.type==='return'&&!room.state.resetT&&m.generation===ball.generation&&ball.shot&&ball.shotT>.15){
      // Existing immediate return when the player's own ball leaves their camera.
      P.endTurn(room.state,c.slot);this.broadcast(room);this.changed();
    }
  }
  throwSmall(room,slot,target){
    const position=room.state.balls[slot].p,body=P.distraction(slot,'ball',position,target);
    if(!body)return;
    room.state.projectiles.push({slot,kind:'ball',body,t:0,hit:false});
    const event={type:'distraction',match:room.state.id,slot,kind:'ball',target:[...target],position:[...position]};
    for(const peer of room.players)this.emit(peer,event);
  }
  createRoom(players,bot=null){
    const id=this.id(),state=P.createMatch(id),room={players,state};state.bot=bot;state.handoff=false;
    this.matches.set(id,room);
    players.forEach((key,slot)=>{
      if(key==null)return;
      const c=this.clients.get(key);c.match=id;c.slot=slot;c.nextDistraction=0;state.styles[slot]=c.style;
    });
    if(bot===1)state.styles[1]=state.styles[0];
    players.forEach((key,slot)=>this.emit(key,{type:'matched',slot,state:P.snapshot(state)}));
    return room;
  }
  pair(){
    let changed=false;
    this.queue=[...new Set(this.queue)].filter(key=>{const c=this.clients.get(key);return c?.joined&&(!c.match||this.matches.get(c.match)?.state.bot===1);});
    this.queue.sort((a,b)=>this.clients.get(a).order-this.clients.get(b).order);
    for(const key of this.queue)if(!this.clients.get(key).match){this.createRoom([key,null],1);changed=true;}
    const paired=new Set();
    for(let i=0;i+1<this.queue.length;i+=2){
      const players=this.queue.slice(i,i+2),rooms=players.map(key=>this.matches.get(this.clients.get(key).match));
      for(const room of rooms)if(!room.state.handoff){room.state.handoff=true;this.broadcast(room);changed=true;}
      // Finish existing throws before replacing a practice match with a human pair.
      if(rooms.some(r=>r.state.resetT>0||r.state.balls.some(b=>b.shot)||r.state.projectiles.length))continue;
      for(const room of rooms)this.matches.delete(room.state.id);
      this.createRoom(players);players.forEach(key=>paired.add(key));changed=true;
    }
    this.queue=this.queue.filter(key=>!paired.has(key));
    const odd=this.queue.length%2?this.queue.at(-1):null;
    if(odd){const room=this.matches.get(this.clients.get(odd).match);if(room.state.handoff){room.state.handoff=false;this.broadcast(room);changed=true;}}
    return changed;
  }
  broadcast(room,events=[]){
    const data={type:'state',state:P.snapshot(room.state),events};
    for(const key of room.players)this.emit(key,data);
  }
  tick(dt){
    this.accumulator+=Math.min(.1,Math.max(0,dt));
    const events=new Map();
    while(this.accumulator>=P.STEP){
      for(const [id,room] of this.matches){
        stepBot(room,P.STEP,this.random,(slot,target)=>this.throwSmall(room,slot,target));
        if(!P.active(room.state))continue;
        const next=P.stepMatch(room.state,P.STEP);
        if(next.length)events.set(id,[...(events.get(id)||[]),...next]);
      }
      this.accumulator-=P.STEP;
    }
    if(this.queue.length>=2&&this.pair())this.changed();
    this.broadcastT+=dt;
    if(this.broadcastT>=1/20||events.size){
      this.broadcastT=0;
      for(const [id,room] of this.matches)this.broadcast(room,events.get(id)||[]);
    }
    if(!this.active()){
      for(const room of this.matches.values())this.broadcast(room);
      this.changed();
    }
  }
  active(){return this.queue.length>=2||[...this.matches.values()].some(room=>P.active(room.state)||botActive(room));}
  disconnect(key){
    const c=this.clients.get(key);if(!c)return;
    this.clients.delete(key);this.queue=this.queue.filter(k=>k!==key);
    const room=this.matches.get(c.match);
    if(room){
      this.matches.delete(c.match);
      for(const peer of room.players){
        const other=this.clients.get(peer);if(!other)continue;
        delete other.match;delete other.slot;other.order=++this.order;
        this.queue.push(peer);this.emit(peer,{type:'waiting',reason:'left'});
      }
    }
    this.pair();this.changed();
  }
  sweep(){
    for(const [key,c] of this.clients)if(this.now()-c.lastSeen>45000){this.close(key,1001,'Connection expired');this.disconnect(key);}
  }
  attachment(key){
    const c=this.clients.get(key);if(!c)return null;
    const {key:ignored,...meta}=c;
    const room=this.matches.get(c.match);
    return {...meta,state:room?.state,brain:room?.brain};
  }
  restore(entries){
    // Idle sockets survive Durable Object hibernation. Never pair half a restored match.
    for(const [key,data] of entries){
      const {state,brain,...meta}=data||{};this.connect(key,meta);this.order=Math.max(this.order,meta.order||0);
    }
    for(const [key,data] of entries){
      if(!this.clients.has(key))continue;
      const c=this.clients.get(key),peers=[...this.clients.values()].filter(p=>p.match&&p.match===c.match);
      if(!c.joined)continue;
      if(peers.length===1&&data?.state?.id===c.match&&data.state.bot===1){
        this.matches.set(c.match,{players:[key,null],state:P.prepareMatch(data.state),brain:data.brain});
        c.slot=0;this.queue.push(key);
      }else if(peers.length===2&&data?.state?.id===c.match){
        if(!this.matches.has(c.match)){
          peers.sort((a,b)=>a.slot-b.slot);
          if(data.state.turn!==0&&data.state.turn!==1){
            data.state.turn=0;data.state.resetT=0;P.reset(data.state,0);P.reset(data.state,1);
          }
          this.matches.set(c.match,{players:peers.map(p=>p.key),state:P.prepareMatch(data.state)});
        }
      }else {delete c.match;delete c.slot;this.queue.push(key);}
    }
    this.pair();
  }
}
