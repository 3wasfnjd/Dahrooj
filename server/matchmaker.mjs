import '../assets/duel-online/physics.js';
const P=globalThis.DahroojDuelPhysics;
const PROTOCOL=3;
export class Matchmaker {
  constructor({send,close,id=()=>crypto.randomUUID(),now=()=>Date.now(),random=Math.random,changed=()=>{}}){
    Object.assign(this,{send,close,id,now,random,changed});
    this.clients=new Map();this.queue=[];this.matches=new Map();this.order=0;this.accumulator=0;this.broadcastT=0;
  }
  connect(key,attachment){
    this.clients.set(key,{key,joined:false,order:++this.order,style:'jelly',lastSeen:this.now(),rateAt:this.now(),rate:0,...attachment});
  }
  emit(key,data){try{this.send(key,JSON.stringify(data));}catch{try{this.close(key,1011,'Connection lost');}catch{}this.disconnect(key);}}
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
      if(room){room.state.styles[c.slot]=c.style;this.broadcast(room);}
      this.changed();return;
    }
    const room=this.matches.get(c.match);
    if(!room||m.match!==c.match)return;
    const ball=room.state.balls[c.slot];
    if(m.type==='move'){
      if(P.move(room.state,c.slot,m)){this.broadcast(room);this.changed();}return;
    }
    if(m.type==='distraction'){
      if(!['can','bottle','balloon'].includes(m.kind)||room.state.turn===c.slot||room.state.resetT||ball.popped||
        m.generation!==ball.generation||now<(c.nextDistraction||0))return;
      const target=m.target===undefined?[(this.random()*2-1)*1.5,.35,-P.DISTANCE]:m.target;
      if(!P.validDistractionTarget(target))return;
      c.nextDistraction=now+1000;
      room.state.projectiles.push({slot:c.slot,kind:m.kind,body:P.distraction(c.slot,m.kind,ball.p,target),t:0,hit:false});
      const event={type:'distraction',match:c.match,slot:c.slot,kind:m.kind,target:[...target],position:[...ball.p]};
      for(const peer of room.players)this.emit(peer,event);
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
  pair(){
    this.queue=this.queue.filter(key=>{const c=this.clients.get(key);return c?.joined&&!c.match;});
    this.queue.sort((a,b)=>this.clients.get(a).order-this.clients.get(b).order);
    while(this.queue.length>=2){
      const players=this.queue.splice(0,2),id=this.id(),state=P.createMatch(id),room={players,state};
      this.matches.set(id,room);
      players.forEach((key,slot)=>{
        const c=this.clients.get(key);c.match=id;c.slot=slot;state.styles[slot]=c.style;
      });
      players.forEach((key,slot)=>this.emit(key,{type:'matched',slot,state:P.snapshot(state)}));
    }
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
        if(!P.active(room.state))continue;
        const next=P.stepMatch(room.state,P.STEP);
        if(next.length)events.set(id,[...(events.get(id)||[]),...next]);
      }
      this.accumulator-=P.STEP;
    }
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
  active(){return [...this.matches.values()].some(room=>P.active(room.state));}
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
    return {...meta,state:this.matches.get(c.match)?.state};
  }
  restore(entries){
    // Idle sockets survive Durable Object hibernation. Never pair half a restored match.
    for(const [key,data] of entries){
      const {state,...meta}=data||{};this.connect(key,meta);this.order=Math.max(this.order,meta.order||0);
    }
    for(const [key,data] of entries){
      if(!this.clients.has(key))continue;
      const c=this.clients.get(key),peers=[...this.clients.values()].filter(p=>p.match&&p.match===c.match);
      if(!c.joined)continue;
      if(peers.length===2&&data?.state?.id===c.match){
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
