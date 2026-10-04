/* Small Duel balls; touch aiming, shared physics and server-decided damage. */
(() => {
  'use strict';
  const P=globalThis.DahroojDuelPhysics;
  class Distractions {
    constructor({send,project,position,localSlot,targetAt}){
      Object.assign(this,{send,project,position,localSlot,targetAt});this.items=[];this.cooldown=0;this.enabled=false;
    }
    clear(){this.items=[];this.cooldown=0;this.enabled=false;}
    throwAt(point){
      if(!this.enabled||this.cooldown>0)return false;
      const target=this.targetAt(point);
      if(!P.validDistractionTarget(target)||!this.send('ball',target))return false;
      this.cooldown=P.SMALL_THROW_INTERVAL;return true;
    }
    launch(event){
      const body=P.distraction(event.slot,event.kind,event.position,event.target);
      if(!body)return;
      this.items.push({kind:'ball',t:0,body,slot:event.slot,incoming:event.slot!==this.localSlot(),accumulator:0});
      if(this.items.length>Math.ceil(1.8/P.SMALL_THROW_INTERVAL)*2)this.items.shift();
    }
    update(dt,waiting){
      this.enabled=waiting;this.cooldown=Math.max(0,this.cooldown-dt);
      for(const item of this.items){
        item.t+=dt;item.accumulator+=Math.min(.1,dt);
        while(item.accumulator>=P.STEP){item.accumulator-=P.STEP;P.stepBall(item.body,P.STEP);}
      }
      this.items=this.items.filter(item=>item.t<1.8);
    }
    paint(c,w,h){
      c.save();c.fillStyle='#2C2D3D';
      for(const item of this.items){
        const pos=this.position(item.body.p);
        if(pos[2]>2.5)continue;
        const p=this.project(pos),edge=this.project([pos[0],pos[1]+P.SMALL_R,pos[2]]);
        const r=Math.max(.6,Math.hypot(edge.x-p.x,edge.y-p.y));
        if(p.x+r<0||p.x-r>w||p.y-r>h||p.y+r<0)continue;
        c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.fill();
      }
      c.restore();
    }
  }
  globalThis.DahroojDuelDistractions=Distractions;
})();
