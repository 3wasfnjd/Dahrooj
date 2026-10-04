/* Duel-only, visual throws. They never change the ball, camera, score or aiming input. */
(() => {
  'use strict';
  const shapes={
    can:'M6 5C6 2 18 2 18 5V19C18 22 6 22 6 19ZM6 5C6 8 18 8 18 5',
    bottle:'M10 2H14V7L17 11V20Q17 22 15 22H9Q7 22 7 20V11L10 7ZM10 5H14',
    balloon:'M12 2C2 2 2 15 12 19C22 15 22 2 12 2ZM12 19L10 22H14Z'
  };
  const P=globalThis.DahroojDuelPhysics;
  const fills={can:'#2C2D3D',bottle:'#2C2D3D',balloon:'#2C2D3D'};
  class Distractions {
    constructor({send,project,position,localSlot}){
      Object.assign(this,{send,project,position,localSlot});this.items=[];this.cooldown=0;
      this.paths=Object.fromEntries(Object.entries(shapes).map(([k,v])=>[k,new Path2D(v)]));
      this.bar=document.createElement('div');this.bar.className='duel-distractions';this.bar.hidden=true;
      this.bar.setAttribute('role','group');this.bar.setAttribute('aria-label','Distractions');
      const labels={can:'Metal can',bottle:'Bottle',balloon:'Water balloon'};
      for(const kind of Object.keys(shapes)){
        const button=document.createElement('button');button.type='button';button.dataset.distraction=kind;
        button.setAttribute('aria-label',labels[kind]);
        button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${shapes[kind]}"/></svg>`;
        button.addEventListener('pointerdown',e=>e.stopPropagation());
        button.addEventListener('click',e=>{e.stopPropagation();if(this.send(kind)){this.cooldown=1;this.setDisabled(true);}});
        this.bar.append(button);
      }
      document.body.append(this.bar);
    }
    setDisabled(value){for(const b of this.bar.children)b.disabled=value;}
    clear(){this.items=[];this.cooldown=0;this.bar.hidden=true;this.setDisabled(false);}
    launch(event){
      if(!this.paths[event.kind])return;
      const body=P.ball(event.slot);body.p=[...event.position];body.grounded=true;
      // Use Dahrooj's fastest existing throw and its exact launch solver.
      P.launch(body,event.slot,{seq:1,target:[{can:-.45,bottle:.45,balloon:0}[event.kind],.9,-P.DISTANCE],flight:.8,curve:0});
      this.items.push({kind:event.kind,t:0,body,slot:event.slot,incoming:event.slot!==this.localSlot(),accumulator:0,drops:null,splashT:0});
      if(this.items.length>4)this.items.shift();
    }
    update(dt,waiting){
      this.bar.hidden=!waiting;this.cooldown=Math.max(0,this.cooldown-dt);this.setDisabled(this.cooldown>0);
      for(const item of this.items){
        item.t+=dt;item.accumulator+=Math.min(.1,dt);
        while(item.accumulator>=P.STEP){
          item.accumulator-=P.STEP;
          if(item.drops){
            item.splashT+=P.STEP;
            for(const drop of item.drops)P.stepBall(drop,P.STEP);
          }else{
            P.stepBall(item.body,P.STEP);
            // Open the water balloon only once it has travelled beyond the opponent.
            if(item.kind==='balloon'&&P.position(item.body.p,item.slot)[2]<-P.DISTANCE-.6){
              item.drops=[[-1.5,1.7],[-.9,2.4],[-.4,1.3],[.2,2.1],[.7,1.5],[1.2,2.3],[1.7,1.1]].map(([x,y])=>{
                const drop=P.ball(item.slot);drop.p=[...item.body.p];
                drop.v=[item.body.v[0]*.2+x,y,item.body.v[2]*.25];return drop;
              });
            }
          }
        }
      }
      this.items=this.items.filter(item=>item.t<1.8&&(!item.drops||item.splashT<.4));
    }
    projected(body,radius){
      const p=this.position(body.p);
      // Cull before crossing behind the camera; no screen collision or end-of-flight pause.
      if(p[2]>2.5)return null;
      const center=this.project(p),edge=this.project([p[0],p[1]+radius,p[2]]);
      return {x:center.x,y:center.y,size:Math.max(1,Math.hypot(edge.x-center.x,edge.y-center.y))};
    }
    paint(c,w,h){
      for(const item of this.items){
        if(item.drops){
          c.save();c.fillStyle='#2C2D3D';c.globalAlpha=Math.max(0,1-item.splashT/.4);
          for(const drop of item.drops){
            const p=this.projected(drop,.025);if(!p)continue;
            c.beginPath();c.ellipse(p.x,p.y,p.size,p.size*1.4,0,0,Math.PI*2);c.fill();
          }
          c.restore();continue;
        }
        const p=this.projected(item.body,.2);if(!p)continue;
        if(p.x+p.size<0||p.x-p.size>w||p.y-p.size>h||p.y+p.size<0)continue;
        c.save();c.translate(p.x,p.y);
        c.rotate(item.kind==='balloon'?Math.sin(item.t*8)*.12:item.t*8*(item.kind==='can'?1:-1));
        c.scale(p.size/12,p.size/12);c.translate(-12,-12);
        c.fillStyle=fills[item.kind];c.strokeStyle='#2C2D3D';c.lineWidth=.85;c.lineJoin='round';c.lineCap='round';
        c.fill(this.paths[item.kind]);c.stroke(this.paths[item.kind]);c.restore();
      }
    }
  }

  globalThis.DahroojDuelDistractions=Distractions;
})();
