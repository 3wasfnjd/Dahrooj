/* Shared with the original goal/hoop/cans launch: same swipe speed, curve and gravity. */
(function(root){
'use strict';
function gesture(pts){
 if(!pts||pts.length<2)return null;
 const a=pts[0],b=pts[pts.length-1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
 if(dy>-30||len<40)return null;
 let k=pts.length-1;while(k>0&&b.t-pts[k].t<.12)k--;
 const q=pts[k],speed=Math.hypot(b.x-q.x,b.y-q.y)/Math.max(.016,b.t-q.t);
 let dev=0;for(const p of pts){const c=((p.x-a.x)*dy-(p.y-a.y)*dx)/len;if(Math.abs(c)>Math.abs(dev))dev=c;}
 return {x:b.x,y:b.y,speed,curve:Math.max(-1,Math.min(1,dev/(len*.25)))};
}
function launch(pos,target,ft,curve){
 const dx=target.x-pos.x,dz=target.z-pos.z,len=Math.hypot(dx,dz)||1;
 const side={x:-dz/len*curve*9,z:dx/len*curve*9};
 return {side,vel:{x:(dx-.5*side.x*ft*ft)/ft,y:(target.y-pos.y+.5*13*ft*ft)/ft,z:(dz-.5*side.z*ft*ft)/ft}};
}
function step(p,v,side,dt){
 v.y-=13*dt;v.x+=side.x*dt;v.z+=side.z*dt;
 const damping=Math.pow(.9,dt);v.x*=damping;v.y*=damping;v.z*=damping;
 p.x+=v.x*dt;p.y+=v.y*dt;p.z+=v.z*dt;
 if(p.y<.24){p.y=.24;if(v.y<-1.4){v.y=-v.y*.55;v.x*=.85;v.z*=.85;side.x=side.z=0;}else{v.y=0;v.x*=Math.pow(.35,dt);v.z*=Math.pow(.35,dt);}}
}
root.DahroojShot={gesture,launch,step,flight:speed=>Math.max(.5,Math.min(1.25,1.35-speed/2600))};
})(typeof window==='undefined'?globalThis:window);
