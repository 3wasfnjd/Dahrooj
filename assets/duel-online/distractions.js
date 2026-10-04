/* Small Duel balls; touch aiming, shared physics and server-decided damage. */
(() => {
  'use strict';
  const P=globalThis.DahroojDuelPhysics;
  class Distractions {
    constructor({send,project,position,localSlot,targetAt,makeSprite,styleAt}){
      Object.assign(this,{send,project,position,localSlot,targetAt,makeSprite,styleAt});this.items=[];this.sprites=new Map();this.cooldown=0;this.enabled=false;
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
      const selected=event.style??this.styleAt(event.slot),style=P.STYLES.includes(selected)?selected:'jelly';
      this.items.push({kind:'ball',style,t:0,body,slot:event.slot,incoming:event.slot!==this.localSlot(),accumulator:0});
      if(this.items.length>Math.ceil(1.8/P.SMALL_THROW_INTERVAL)*2)this.items.shift();
    }
    sprite(style){
      if(!this.sprites.has(style))this.sprites.set(style,this.makeSprite(style));
      return this.sprites.get(style);
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
      c.save();
      for(const item of this.items){
        const pos=this.position(item.body.p);
        if(pos[2]>2.5)continue;
        const p=this.project(pos),edge=this.project([pos[0],pos[1]+P.SMALL_R,pos[2]]);
        const r=Math.max(.6,Math.hypot(edge.x-p.x,edge.y-p.y));
        if(p.x+r<0||p.x-r>w||p.y-r>h||p.y+r<0)continue;
        // The original character renderer uses 1.4 radii of transparent padding.
        c.drawImage(this.sprite(item.style),p.x-r*1.4,p.y-r*1.4,r*2.8,r*2.8);
      }
      c.restore();
    }
  }
  globalThis.DahroojDuelDistractions=Distractions;
})();
