/* Automatic two-player matchmaking. Opens a connection only while Duel is selected. */
(() => {
  'use strict';
  const P=globalThis.DahroojDuelPhysics;
  class DuelClient {
    constructor({status=()=>{},pop=()=>{},distraction=()=>{},hit=()=>{}}={}){
      this.onStatus=status;this.onPop=pop;this.onDistraction=distraction;this.onHit=hit;this.active=false;this.state=null;this.slot=0;
      this.pending=null;this.sequence=0;this.attempt=0;this.rtt=0;this.lastEvent=0;this.generation=0;
      this.pageHide=()=>this.suspend();this.pageShow=()=>{if(this.active&&!this.socket)this.connect();};
    }
    enter(style){
      this.leave();this.active=true;this.style=style;this.setStatus('connecting');
      addEventListener('pagehide',this.pageHide);addEventListener('pageshow',this.pageShow);this.connect();
    }
    setStatus(value){this.status=value;this.onStatus(value);}
    connect(){
      if(!this.active)return;
      const generation=++this.generation,url=new URL('/ws',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
      let ws;try{ws=new WebSocket(url);}catch{this.retry();return;}
      this.socket=ws;this.lastMessage=Date.now();
      const current=()=>this.active&&generation===this.generation;
      ws.onopen=()=>{
        if(!current())return;
        this.attempt=0;this.send({type:'join',protocol:2,style:this.style});this.ping();
        clearInterval(this.heartbeat);this.heartbeat=setInterval(()=>{
          if(Date.now()-this.lastMessage>25000){ws.close();return;}this.ping();
        },8000);
      };
      ws.onmessage=e=>{
        if(!current())return;
        let m;try{m=JSON.parse(e.data);}catch{return;}
        this.lastMessage=Date.now();
        if(m.type==='pong'){this.rtt=Math.min(500,Math.max(0,Date.now()-m.t));return;}
        if(m.type==='version'){this.setStatus('version');this.active=false;ws.close();return;}
        if(m.type==='waiting'){
          this.state=null;this.pending=null;this.lastEvent=0;this.setStatus('waiting');return;
        }
        if(m.type==='matched'){
          this.slot=m.slot;this.sequence=0;this.pending=null;this.lastEvent=m.state.event;
          this.state=m.state;this.setStatus('playing');return;
        }
        if(m.type==='distraction'&&this.state?.id===m.match){this.onDistraction(m);return;}
        if(m.type==='rejected'&&this.state?.id===m.state?.id&&this.pending?.seq===m.seq){
          this.pending=null;this.state=m.state;return;
        }
        if(m.type!=='state'||!this.state||m.state.id!==this.state.id)return;
        const old=this.state,own=m.state.balls[this.slot];
        // Keep an immediate local launch while a pre-launch server frame is in flight.
        if(this.pending&&own.generation===this.pending.generation&&own.seq<this.pending.seq&&!m.state.resetT){
          m.state.balls[this.slot]=old.balls[this.slot];
        }else this.pending=null;
        this.state=m.state;
        {
          const ahead=Math.min(.1,this.rtt/2000);
          for(let elapsed=0;elapsed<ahead;elapsed+=P.STEP)
            this.state.balls.forEach((b,i)=>{if(!(this.pending&&i===this.slot))P.stepBall(b,Math.min(P.STEP,ahead-elapsed));});
        }
        for(const event of m.events||[]){
          if(event.id<=this.lastEvent)continue;
          this.lastEvent=event.id;if(event.type==='pop')this.onPop(event);else if(event.type==='hit')this.onHit(event);
        }
      };
      ws.onclose=()=>{
        if(!current())return;
        clearInterval(this.heartbeat);this.socket=null;this.state=null;this.pending=null;this.retry();
      };
      ws.onerror=()=>{if(current())ws.close();};
      clearTimeout(this.openTimeout);
      this.openTimeout=setTimeout(()=>{if(current()&&ws.readyState===WebSocket.CONNECTING)ws.close();},10000);
    }
    retry(){
      if(!this.active)return;
      this.setStatus('reconnecting');
      clearTimeout(this.retryTimer);
      this.retryTimer=setTimeout(()=>this.connect(),Math.min(8000,750*2**this.attempt++)+Math.random()*200);
    }
    send(data){if(this.socket?.readyState!==WebSocket.OPEN)return false;this.socket.send(JSON.stringify(data));return true;}
    ping(){this.send({type:'ping',t:Date.now()});}
    setStyle(style){if(this.style===style)return;this.style=style;this.send({type:'style',style});}
    canShoot(){return this.status==='playing'&&this.socket?.readyState===WebSocket.OPEN&&this.state&&P.canShoot(this.state,this.slot)&&!this.pending;}
    canDistract(){return this.status==='playing'&&this.socket?.readyState===WebSocket.OPEN&&this.state&&this.state.turn!==this.slot&&!this.state.resetT&&!this.state.balls[this.slot].popped;}
    distract(kind){
      if(!this.canDistract()||Date.now()<(this.nextDistraction||0))return false;
      const sent=this.send({type:'distraction',match:this.state.id,generation:this.state.balls[this.slot].generation,kind});
      if(sent)this.nextDistraction=Date.now()+1000;return sent;
    }
    shoot(command){
      if(!this.canShoot())return false;
      const b=this.state.balls[this.slot],message={...command,type:'shot',seq:++this.sequence,match:this.state.id,generation:b.generation};
      if(!P.launch(b,this.slot,message))return false;
      this.pending=message;return this.send(message);
    }
    returnBall(){
      const b=this.state?.balls[this.slot];if(!b?.shot||this.state.resetT||b.shotT<=.15)return;
      const key=`${this.state.id}:${b.generation}`;if(this.returned===key)return;
      this.returned=key;this.send({type:'return',match:this.state.id,generation:b.generation});
    }
    step(dt){
      if(!this.state)return;
      this.state.balls.forEach(b=>P.stepBall(b,dt));
    }
    suspend(){
      ++this.generation;clearTimeout(this.retryTimer);clearTimeout(this.openTimeout);clearInterval(this.heartbeat);
      if(this.socket){this.socket.onclose=null;this.socket.close(1000,'Left Duel');this.socket=null;}
      this.state=null;this.pending=null;
    }
    leave(){
      this.active=false;this.suspend();removeEventListener('pagehide',this.pageHide);removeEventListener('pageshow',this.pageShow);
    }
  }
  globalThis.DahroojDuelClient=DuelClient;
})();
