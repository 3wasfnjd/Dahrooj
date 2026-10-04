/* Duel-only, visual throws. They never change the ball, camera, score or aiming input. */
(() => {
  'use strict';
  const shapes={
    can:'M6 5C6 2 18 2 18 5V19C18 22 6 22 6 19ZM6 5C6 8 18 8 18 5',
    bottle:'M10 2H14V7L17 11V20Q17 22 15 22H9Q7 22 7 20V11L10 7ZM10 5H14',
    balloon:'M12 2C2 2 2 15 12 19C22 15 22 2 12 2ZM12 19L10 22H14Z'
  };
  const fills={can:'#92969b',bottle:'#a0b5ab',balloon:'#87b8cf'};
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
      this.items.push({kind:event.kind,t:0,from:this.position(event.position),incoming:event.slot!==this.localSlot()});
      if(this.items.length>4)this.items.shift();
    }
    update(dt,waiting){
      this.bar.hidden=!waiting;this.cooldown=Math.max(0,this.cooldown-dt);this.setDisabled(this.cooldown>0);
      for(const item of this.items)item.t+=dt;
      this.items=this.items.filter(item=>item.t<2.6);
    }
    paint(c,w,h){
      for(const item of this.items){
        const t=Math.min(1,item.t/1.1),incoming=item.incoming;
        const start=this.project(item.from),far=this.project([0,.5,-20]);
        const offset={can:-.13,bottle:.12,balloon:0}[item.kind];
        const end=incoming?{x:w*(.5+offset),y:h*.57}:far;
        let x=start.x+(end.x-start.x)*t,y=start.y+(end.y-start.y)*t-Math.sin(t*Math.PI)*h*.23;
        const size=incoming?8+Math.pow(t,2)*Math.min(68,w*.17):25*(1-t)+6;
        // Keep the launch arc; continue its velocity into a floor contact, never stop in mid-air.
        const gravity=h*(incoming?2:.12),floor=incoming?h*.82:this.project([0,0,-20]).y;
        const vx=(end.x-start.x)/1.1,vy=(end.y-start.y+Math.PI*h*.23)/1.1;
        const drop=Math.max(0,floor-end.y-size*.7);
        const impact=(Math.sqrt(vy*vy+2*gravity*drop)-vy)/gravity;
        const after=item.t-1.1,landed=after-impact;
        let rotation=t*Math.PI*2*(item.kind==='can'?1:-1),alpha=1;
        if(after>0){
          const fall=Math.min(after,impact);
          x=end.x+vx*fall;y=end.y+vy*fall+.5*gravity*fall*fall;
          rotation=(1+fall/1.1)*Math.PI*2*(item.kind==='can'?1:-1);
          if(landed>=0){
            const rebound=(vy+gravity*impact)*.22,bounceTime=2*rebound/gravity;
            const bounce=Math.min(landed,bounceTime);
            x+=vx*.28*bounce;y+=-rebound*bounce+.5*gravity*bounce*bounce;
            rotation+=bounce*2*(item.kind==='can'?1:-1);
            alpha=Math.max(0,1-Math.max(0,landed-bounceTime-.12)/.22);
          }
        }
        c.save();c.globalAlpha=alpha;
        if(item.kind==='balloon'&&landed>=0){
          // A few falling drops at contact, with no ring or radial flower shape.
          const q=landed;c.globalAlpha=Math.max(0,1-q/.5);c.fillStyle=fills.balloon;
          const drops=[[-1.5,-1.7],[-.9,-2.4],[-.4,-1.3],[.2,-2.1],[.7,-1.5],[1.2,-2.3],[1.7,-1.1]];
          for(const [dx,dy] of drops){
            const px=end.x+vx*impact+dx*size*q*3;
            const py=floor-size*.5+dy*size*q*3+size*9*q*q;
            const r=size*(.035+.012*Math.abs(dx));
            c.beginPath();c.ellipse(px,py,r,r*1.5,-dx*.25,0,Math.PI*2);c.fill();
          }
        }else{
          c.translate(x,y);
          c.rotate(item.kind==='balloon'?Math.sin(t*6)*.15:rotation);
          c.scale(size/12,size/12);c.translate(-12,-12);
          c.fillStyle=fills[item.kind];c.strokeStyle='#2c2d3d';c.lineWidth=.85;c.lineJoin='round';c.lineCap='round';
          c.fill(this.paths[item.kind]);c.stroke(this.paths[item.kind]);
        }
        c.restore();
      }
    }
  }
  globalThis.DahroojDuelDistractions=Distractions;
})();
