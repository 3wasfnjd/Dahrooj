/* Duel-only, visual throws. They never change the ball, camera, score or aiming input. */
(() => {
  'use strict';
  const shapes={
    can:'M6 5C6 2 18 2 18 5V19C18 22 6 22 6 19ZM6 5C6 8 18 8 18 5M8 11V17M16 11V17',
    bottle:'M10 2H14V7L17 11V20Q17 22 15 22H9Q7 22 7 20V11L10 7ZM10 5H14M7 13H17M7 18H17',
    balloon:'M12 2C2 2 2 15 12 19C22 15 22 2 12 2ZM12 19L10 22H14ZM8 6Q6 8 7 10'
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
      this.items=this.items.filter(item=>item.t<1.55);
    }
    paint(c,w,h){
      for(const item of this.items){
        const t=Math.min(1,item.t/1.1),incoming=item.incoming;
        const start=this.project(item.from),far=this.project([0,.5,-20]);
        const offset={can:-.13,bottle:.12,balloon:0}[item.kind];
        const end=incoming?{x:w*(.5+offset),y:h*.57}:far;
        const x=start.x+(end.x-start.x)*t,y=start.y+(end.y-start.y)*t-Math.sin(t*Math.PI)*h*.23;
        const size=incoming?8+Math.pow(t,2)*Math.min(88,w*.21):25*(1-t)+6;
        c.save();
        c.globalAlpha=item.t<1.1?1:Math.max(0,1-(item.t-1.1)/.45);
        if(item.kind==='balloon'&&item.t>=1.1){
          const burst=(item.t-1.1)/.45;
          c.fillStyle='rgba(93,165,197,.65)';
          for(let i=0;i<12;i++){
            const a=i*Math.PI/6,r=size*(.3+burst*1.8);
            c.beginPath();c.ellipse(x+Math.cos(a)*r,y+Math.sin(a)*r+burst*burst*35,size*.18*(1-burst*.65),size*.3*(1-burst*.65),a,0,Math.PI*2);c.fill();
          }
        }else{
          c.translate(x,y+(item.t>1.1?(item.t-1.1)*h*.9:0));
          c.rotate(item.kind==='balloon'?Math.sin(t*6)*.15:t*Math.PI*2*(item.kind==='can'?1:-1));
          c.scale(size/12,size/12);c.translate(-12,-12);
          c.fillStyle=fills[item.kind];c.strokeStyle='#2c2d3d';c.lineWidth=.85;c.lineJoin='round';c.lineCap='round';
          c.fill(this.paths[item.kind]);c.stroke(this.paths[item.kind]);
          c.globalAlpha*=.3;c.strokeStyle='#fffaf2';c.lineWidth=1.3;
          c.beginPath();c.moveTo(9,10);c.lineTo(9,16);c.stroke();
        }
        c.restore();
      }
    }
  }
  globalThis.DahroojDuelDistractions=Distractions;
})();
