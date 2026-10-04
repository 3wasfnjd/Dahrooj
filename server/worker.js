import {DurableObject} from 'cloudflare:workers';
import {Matchmaker} from './matchmaker.mjs';

export class DuelLobby extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);this.timer=null;this.lastTick=0;
    this.engine=new Matchmaker({
      send:(socket,data)=>socket.send(data),close:(socket,code,reason)=>socket.close(code,reason),
      changed:()=>{this.save();this.run();}
    });
    this.engine.restore(ctx.getWebSockets().map(socket=>[socket,socket.deserializeAttachment()]));
    this.save();this.run();
  }
  save(){
    for(const socket of this.engine.clients.keys())socket.serializeAttachment(this.engine.attachment(socket));
  }
  run(){
    if(this.timer||!this.engine.active())return;
    this.lastTick=Date.now();
    this.timer=setInterval(()=>{
      const now=Date.now();this.engine.tick((now-this.lastTick)/1000);this.lastTick=now;
      if(!this.engine.active()){clearInterval(this.timer);this.timer=null;this.save();}
    },1000/60);
  }
  async fetch(){
    const [client,server]=Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);this.engine.connect(server);this.save();
    if(!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(Date.now()+30000);
    return new Response(null,{status:101,webSocket:client});
  }
  webSocketMessage(socket,message){this.engine.receive(socket,message);this.save();this.run();}
  webSocketClose(socket){this.engine.disconnect(socket);this.save();this.run();}
  webSocketError(socket){try{socket.close(1011,'Connection lost');}catch{}this.engine.disconnect(socket);this.save();this.run();}
  async alarm(){
    this.engine.sweep();this.save();
    if(this.engine.clients.size)await this.ctx.storage.setAlarm(Date.now()+30000);
  }
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return Response.json({ok:true,mode:'duel',protocol:2});
    if(url.pathname==='/ws'){
      if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
      // The game and socket are served together; unrelated sites cannot join this lobby.
      if(request.headers.get('Origin')!==url.origin)return new Response('Invalid origin',{status:403});
      return env.DUEL_LOBBY.getByName('duel-v1').fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
