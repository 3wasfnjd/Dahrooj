// Original Dahrooj canvas art copied from main 087f978. Preserve Aboden Games credit.
(() => {'use strict';
window.DahroojArt={create(size=256){
const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
const ctx=canvas.getContext('2d'),COL={ball:'#4b4e56',ballDark:'#2a2c31',ballLight:'#8a8e97',ink:'#2c2d3d'};
let ballStyle='jelly',time=0;
const bub={t:0,parts:[]},clayNoise=i=>1+.035*Math.sin(i*2.3+1)+.022*Math.sin(i*5.1+.4);
function drawEye(c,ex,ey,er,lx,ly,face,blinkOn){
  if(face==='closed'){
    c.strokeStyle=COL.ink; c.lineWidth=er*0.42; c.lineCap='round'; c.lineJoin='round';
    const s=ex<0?1:-1;
    c.beginPath(); c.moveTo(ex-er*0.6*s,ey-er*0.6); c.lineTo(ex+er*0.45*s,ey); c.lineTo(ex-er*0.6*s,ey+er*0.6); c.stroke();
    return;
  }
  if(face==='squint'||face==='laugh'){
    c.strokeStyle=COL.ink; c.lineWidth=er*0.42; c.lineCap='round'; c.lineJoin='round';
    c.beginPath(); c.moveTo(ex-er*0.75,ey+er*0.35); c.quadraticCurveTo(ex,ey-er*0.75,ex+er*0.75,ey+er*0.35); c.stroke();
    return;
  }
  const open = blinkOn ? 0.12 : face==='focus' ? 0.6 : 1;
  c.save(); c.translate(ex,ey); c.scale(1,open);
  c.fillStyle=ballStyle==='fabric'?'#f2ebdd':'#fffaf2';
  c.beginPath(); c.ellipse(0,0,er,er*1.12,0,0,Math.PI*2); c.fill();
  if(ballStyle==='fabric'){ c.save(); c.setLineDash([er*0.28,er*0.22]); c.strokeStyle='rgba(44,45,61,.45)'; c.lineWidth=Math.max(0.6,er*0.12); c.beginPath(); c.ellipse(0,0,er*1.08,er*1.2,0,0,Math.PI*2); c.stroke(); c.restore(); }
  if(face==='dizzy'){
    c.strokeStyle=COL.ink; c.lineWidth=er*0.2; c.lineCap='round';
    c.beginPath();
    const rot=time*9*(ex<0?1:-1);
    for(let t=0;t<Math.PI*4;t+=0.2){const rr=er*0.1+t*er*0.055; const x=Math.cos(t+rot)*rr, y=Math.sin(t+rot)*rr; t===0?c.moveTo(x,y):c.lineTo(x,y);}
    c.stroke();
  } else {
    const pr = face==='wide'? er*0.42 : face==='joy'? er*0.66 : er*0.55;
    c.fillStyle=COL.ink;
    c.beginPath(); c.arc(lx*er*0.42,ly*er*0.48,pr,0,Math.PI*2); c.fill();
    c.fillStyle=ballStyle==='fabric'?'rgba(255,255,255,.35)':'rgba(255,255,255,.9)';
    c.beginPath(); c.arc(lx*er*0.42-pr*0.35,ly*er*0.48-pr*0.4,pr*0.28,0,Math.PI*2); c.fill();
    if(face==='joy'){ c.beginPath(); c.arc(lx*er*0.42+pr*0.35,ly*er*0.48+pr*0.3,pr*0.14,0,Math.PI*2); c.fill(); }
  }
  c.restore();
}


const felt=(()=>{
  const c=document.createElement('canvas'); c.width=c.height=96; const g=c.getContext('2d');
  for(let i=0;i<700;i++){
    const x=Math.random()*96, y=Math.random()*96, a=Math.random()*Math.PI, l=2+Math.random()*4;
    g.strokeStyle=Math.random()<.5?'rgba(255,255,255,.10)':'rgba(0,0,0,.12)'; g.lineWidth=0.7;
    g.beginPath(); g.moveTo(x,y); g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l); g.stroke();
  }
  return ctx.createPattern(c,'repeat');
})();
function drawBandaid(c,R){
  c.save(); c.translate(R*0.4,-R*0.6); c.rotate(-0.55);
  const w=R*0.66, h=R*0.24, r=h/2;
  c.beginPath(); if(c.roundRect) c.roundRect(-w/2,-h/2,w,h,r); else c.rect(-w/2,-h/2,w,h);
  c.fillStyle='#e8c29d'; c.fill(); c.strokeStyle='rgba(120,80,50,.35)'; c.lineWidth=Math.max(0.8,R*0.025); c.stroke();
  c.fillStyle='#f4ddc3'; c.fillRect(-w*0.17,-h*0.36,w*0.34,h*0.72);
  c.fillStyle='rgba(120,80,50,.35)';
  for(const sx of [-1,1]) for(const [dx,dy] of [[0.31,-0.2],[0.39,0.2],[0.31,0.2],[0.39,-0.2]]){ c.beginPath(); c.arc(sx*w*dx,h*dy,Math.max(0.5,R*0.018),0,Math.PI*2); c.fill(); }
  c.restore();
}
function drawXStitch(c,R){
  c.save(); c.translate(R*0.4,-R*0.6); c.lineCap='round';
  const l=R*0.13;
  for(const [col,ox,oy] of [['rgba(20,20,25,.35)',0.6,0.8],['#efe6d2',0,0]]){
    c.strokeStyle=col; c.lineWidth=Math.max(1,R*0.065);
    c.beginPath(); c.moveTo(-l+ox,-l+oy); c.lineTo(l+ox,l+oy); c.moveTo(l+ox,-l+oy); c.lineTo(-l+ox,l+oy); c.stroke();
  }
  c.restore();
}

// eyes, mouth and cheeks, drawn around (0,0) for a body of radius Rr
function drawFace(c,Rr,face,lx,ly,blushK,blinkOn){
  const er=Rr*0.19, ex=Rr*0.31, ey=-Rr*0.08+ly*Rr*0.06, exo=lx*Rr*0.08;
  drawEye(c,-ex+exo,ey,er,lx,ly,face,blinkOn);
  drawEye(c,ex+exo,ey,er,lx,ly,face,blinkOn);
  if(face==='wide'||face==='dizzy'){
    c.fillStyle=COL.ink;
    c.beginPath(); c.ellipse(exo,Rr*0.32+ly*Rr*0.05,Rr*0.07,Rr*0.09,0,0,Math.PI*2); c.fill();
  }
  if(face==='joy'){
    c.strokeStyle=COL.ink; c.lineWidth=Math.max(1.2,Rr*0.07); c.lineCap='round';
    c.beginPath(); c.arc(exo,Rr*0.1,Rr*0.24,Math.PI*0.18,Math.PI*0.82); c.stroke();
  }
  if(face==='laugh'){
    const my=Rr*0.2, mw=Rr*0.27, mh=Rr*0.24+Math.abs(Math.sin(time*16))*Rr*0.05;
    c.save();
    c.beginPath(); c.moveTo(exo-mw,my); c.lineTo(exo+mw,my); c.ellipse(exo,my,mw,mh,0,0,Math.PI); c.closePath();
    c.fillStyle='#4a1712'; c.fill(); c.clip();
    c.fillStyle='#d8505a'; c.beginPath(); c.ellipse(exo,my+mh*0.95,mw*0.6,mh*0.45,0,0,Math.PI*2); c.fill();
    c.restore();
  }
  if(face==='joy'||face==='laugh') blushK=Math.max(blushK,0.9);
  if(blushK>0){
    c.fillStyle=`rgba(200,60,50,${0.35*blushK})`;
    c.beginPath(); c.ellipse(-Rr*0.55+exo,Rr*0.2,Rr*0.13,Rr*0.07,0,0,Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(Rr*0.55+exo,Rr*0.2,Rr*0.13,Rr*0.07,0,0,Math.PI*2); c.fill();
  }
}


function paintBlob(c,P,cx,cy,R,sx,sy,face,lx,ly,blushK,blinkOn){
  const st=ballStyle, n=P.length;
  // bubble pop: droplets, then the bubble grows back
  if(st==='bubble' && bub.t>0){
    c.save(); c.fillStyle='rgba(255,255,255,.75)'; c.strokeStyle='rgba(150,200,230,.6)'; c.lineWidth=1;
    const a=Math.min(1,bub.t/0.6);
    for(const p of bub.parts){ c.globalAlpha=a; c.beginPath(); c.arc(p.x,p.y,p.r,0,Math.PI*2); c.fill(); c.stroke(); }
    c.restore();
    if(bub.t>0.38) return;
    const k=1-bub.t/0.38, e=1+2.2*Math.pow(k-1,3)+1.2*Math.pow(k-1,2);   // ease out back
    P=P.map(q=>({x:cx+(q.x-cx)*e,y:cy+(q.y-cy)*e})); sx*=e; sy*=e;
  }
  if(st==='clay') P=P.map((q,i)=>({x:cx+(q.x-cx)*clayNoise(i),y:cy+(q.y-cy)*clayNoise(i)}));
  const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const path=()=>{ c.beginPath(); let m=mid(P[n-1],P[0]); c.moveTo(m.x,m.y); for(let i=0;i<n;i++){ const q=mid(P[i],P[(i+1)%n]); c.quadraticCurveTo(P[i].x,P[i].y,q.x,q.y); } c.closePath(); };
  const Rm=R*Math.max(sx,sy);

  if(st==='bubble'){
    // thin film: almost clear, rainbow sheen sliding over it, bright rim and a window reflection
    const body=c.createRadialGradient(cx,cy,R*0.2,cx,cy,Rm*1.02);
    body.addColorStop(0,'rgba(255,255,255,.03)'); body.addColorStop(0.75,'rgba(255,255,255,.08)'); body.addColorStop(1,'rgba(255,255,255,.3)');
    path(); c.fillStyle=body; c.fill();
    c.save(); path(); c.clip();
    const t=time*0.6, ax=Math.cos(t)*Rm, ay=Math.sin(t)*Rm;
    const film=c.createLinearGradient(cx-ax,cy-ay,cx+ax,cy+ay);
    film.addColorStop(0,'rgba(255,140,220,.22)'); film.addColorStop(0.35,'rgba(120,220,255,.18)'); film.addColorStop(0.65,'rgba(255,240,140,.2)'); film.addColorStop(1,'rgba(170,140,255,.22)');
    c.fillStyle=film; c.fillRect(cx-Rm*1.5,cy-Rm*1.5,Rm*3,Rm*3);
    c.restore();
    const rim=c.createLinearGradient(cx+ay,cy-ax,cx-ay,cy+ax);
    rim.addColorStop(0,'rgba(255,150,220,.7)'); rim.addColorStop(0.5,'rgba(130,220,255,.7)'); rim.addColorStop(1,'rgba(255,235,150,.7)');
    path(); c.strokeStyle=rim; c.lineWidth=Math.max(1.2,R*0.06); c.stroke();
    path(); c.strokeStyle='rgba(255,255,255,.5)'; c.lineWidth=Math.max(0.6,R*0.02); c.stroke();
    c.save(); c.translate(cx-R*0.42*sx,cy-R*0.48*sy); c.rotate(-0.45);
    c.fillStyle='rgba(255,255,255,.8)';
    c.beginPath(); if(c.roundRect) c.roundRect(-R*0.15,-R*0.1,R*0.3,R*0.2,R*0.05); else c.rect(-R*0.15,-R*0.1,R*0.3,R*0.2); c.fill();
    c.fillStyle='rgba(255,255,255,.35)'; c.fillRect(-R*0.015,-R*0.1,R*0.03,R*0.2); c.fillRect(-R*0.15,-R*0.015,R*0.3,R*0.03);
    c.restore();
    c.fillStyle='rgba(255,255,255,.7)'; c.beginPath(); c.arc(cx+R*0.42*sx,cy+R*0.5*sy,R*0.05,0,Math.PI*2); c.fill();
    c.save(); c.translate(cx,cy); c.scale(Math.min(1.25,sx),Math.min(1.25,sy));
    drawFace(c,R,face,lx,ly,blushK,blinkOn);
    c.restore();
    return;
  }

  const g=c.createRadialGradient(cx-R*0.35*sx,cy-R*0.42*sy,R*0.1,cx,cy,R*1.1*Math.max(sx,sy));
  if(st==='fabric'){ g.addColorStop(0,'#a55267'); g.addColorStop(0.6,'#7c2941'); g.addColorStop(1,'#50172c'); }
  else if(st==='clay'){ g.addColorStop(0,'#ad805c'); g.addColorStop(0.6,'#825637'); g.addColorStop(1,'#55331f'); }
  else { g.addColorStop(0,COL.ballLight); g.addColorStop(0.55,COL.ball); g.addColorStop(1,COL.ballDark); }
  if(st==='fabric'){ c.save(); c.shadowColor='rgba(20,20,25,.35)'; c.shadowBlur=Math.max(1.5,R*0.08); path(); c.fillStyle=g; c.fill(); c.restore(); }
  else { path(); c.fillStyle=g; c.fill(); }
  c.save(); path(); c.clip();
  if(st==='fabric'){ c.fillStyle=felt; c.globalAlpha=0.9; c.fillRect(cx-R*2,cy-R*2,R*4,R*4); c.globalAlpha=1; }
  if(st==='clay'){ c.fillStyle=felt; c.globalAlpha=0.35; c.fillRect(cx-R*2,cy-R*2,R*4,R*4); c.globalAlpha=1; }
  const sh=c.createRadialGradient(cx,cy+R*1.05*sy,R*0.1,cx,cy+R*1.05*sy,R*0.9*sx);
  sh.addColorStop(0,'rgba(10,12,18,.35)'); sh.addColorStop(1,'rgba(10,12,18,0)');
  c.fillStyle=sh; c.fillRect(cx-R*2,cy-R*2,R*4,R*4);
  c.restore();
  if(st==='fabric'){
    c.save(); c.beginPath();
    const k=0.86, mid2=(a,b)=>({x:cx+((a.x+b.x)/2-cx)*k,y:cy+((a.y+b.y)/2-cy)*k});
    let m=mid2(P[n-1],P[0]); c.moveTo(m.x,m.y);
    for(let i=0;i<n;i++){ const q=mid2(P[i],P[(i+1)%n]); c.quadraticCurveTo(cx+(P[i].x-cx)*k,cy+(P[i].y-cy)*k,q.x,q.y); }
    c.closePath(); c.setLineDash([Math.max(2,R*0.13),Math.max(1.6,R*0.1)]); c.lineCap='round';
    c.strokeStyle='rgba(239,230,210,.75)'; c.lineWidth=Math.max(1,R*0.055); c.stroke(); c.restore();
  } else if(st==='clay'){
    // soft matte sheen only
    c.fillStyle='rgba(255,255,255,.12)';
    c.beginPath(); c.ellipse(cx-R*0.35*sx,cy-R*0.45*sy,R*0.32*sx,R*0.2*sy,-0.6,0,Math.PI*2); c.fill();
  } else {
    path(); c.strokeStyle='rgba(255,255,255,.16)'; c.lineWidth=1.5; c.stroke();
    c.fillStyle='rgba(240,240,242,.85)';
    c.beginPath(); c.ellipse(cx-R*0.42*sx,cy-R*0.5*sy,R*0.17*sx,R*0.1*sy,-0.6,0,Math.PI*2); c.fill();
    c.beginPath(); c.arc(cx-R*0.18*sx,cy-R*0.7*sy,R*0.045,0,Math.PI*2); c.fill();
  }
  c.save(); c.translate(cx,cy); c.scale(Math.min(1.25,sx),Math.min(1.25,sy));
  if(st==='fabric') drawXStitch(c,R); else if(st==='clay') drawThumbprint(c,R); else drawBandaid(c,R);
  drawFace(c,R,face,lx,ly,blushK,blinkOn);
  c.restore();
}
function drawThumbprint(c,R){
  c.save(); c.translate(R*0.4,-R*0.55); c.rotate(-0.5); c.lineCap='round';
  for(let i=0;i<4;i++){
    const rx=R*(0.07+i*0.05), ry=rx*1.3;
    c.strokeStyle='rgba(0,0,0,.2)'; c.lineWidth=Math.max(0.6,R*0.022);
    c.beginPath(); c.ellipse(0,0,rx,ry,0,Math.PI*0.15,Math.PI*1.75); c.stroke();
    c.strokeStyle='rgba(255,255,255,.1)';
    c.beginPath(); c.ellipse(0.6,0.8,rx,ry,0,Math.PI*0.15,Math.PI*1.75); c.stroke();
  }
  c.restore();
}


return {canvas,draw(style,t,{face='open',look=0,impact=0,vy=0}={}){
ballStyle=style;time=t;ctx.clearRect(0,0,size,size);
const r=size*.36,cx=size/2,cy=size/2,sx=1+impact*.2,sy=1-impact*.18;
const p=Array.from({length:28},(_,i)=>{const a=i/28*Math.PI*2-Math.PI/2;const wobble=style==='jelly'?1+Math.sin(a*3+t*7)*.015:1;return {x:cx+Math.cos(a)*r*sx*wobble,y:cy+Math.sin(a)*r*sy*wobble};});
paintBlob(ctx,p,cx,cy,r,sx,sy,face,look,Math.max(-.5,Math.min(.5,-vy*.04)),0,(t%4.2)>4.05);
return canvas;
}};
}};
})();
