/* Dahrooj — Aboden Games. Shared deterministic rules; no browser dependencies. */
(function(root){
  'use strict';
  const Shot=root.DahroojShot;
  const STYLES=['jelly','fabric','clay','fur','bubble'];
  const validStyle=s=>STYLES.includes(s);
  function create(id,styles,seed=0){
    return {v:1,id,styles:styles.map(s=>validStyle(s)?s:'jelly'),seed:seed>>>0,
      hearts:[3,3],turn:0,phase:'aim',shot:null,winner:null,revision:0};
  }
  const round=s=>Math.min(6,Math.floor(s.turn/2)+1);
  const target=s=>({x:Math.sin(s.seed%1000+s.turn*1.97)*.84,y:.24,z:-3.6});
  const validShot=r=>!!r&&Number.isFinite(r.x)&&Math.abs(r.x)<=9&&Number.isFinite(r.y)&&r.y>=.35&&r.y<=6&&Number.isFinite(r.ft)&&r.ft>=.5&&r.ft<=1.25&&Number.isFinite(r.curve)&&Math.abs(r.curve)<=1;
  function initial(shot){const pos={x:0,y:.24,z:0};return {pos,...Shot.launch(pos,{x:shot.x,y:shot.y,z:-3.6},shot.ft,shot.curve)};}
  function point(shot,t){const a=initial(shot);for(let elapsed=0;elapsed<t;elapsed+=1/180)Shot.step(a.pos,a.vel,a.side,Math.min(1/180,t-elapsed));return a.pos;}
  function outcome(s,shot){
    const targetPos=target(s),a=initial(shot);
    for(let t=0;t<=2;t+=1/180){
      if(Math.hypot(a.pos.x-targetPos.x,a.pos.y-targetPos.y,a.pos.z-targetPos.z)<=.48)return {hit:true,t};
      if(a.pos.z<-4.4)return {hit:false,t};
      Shot.step(a.pos,a.vel,a.side,1/180);
    }
    return {hit:false,t:2};
  }
  function fire(s,player,request){
    if(s.phase!=='aim'||player!==s.turn%2||request?.id!==s.id||request.turn!==s.turn||!validShot(request))return null;
    return {...s,phase:'flying',revision:s.revision+1,shot:{x:request.x,y:request.y,ft:request.ft,curve:request.curve}};
  }
  function settle(s){
    if(s.phase!=='flying') return null;
    const hearts=[...s.hearts], hit=outcome(s,s.shot).hit;
    if(hit) hearts[1-s.turn%2]--;
    const turn=s.turn+1,done=hearts.includes(0)||turn===12;
    return {...s,hearts,turn,phase:done?'done':'aim',shot:null,revision:s.revision+1,
      winner:done?(hearts[0]===hearts[1]?'tie':hearts[0]>hearts[1]?0:1):null};
  }
  function valid(s){
    return !!s&&s.v===1&&typeof s.id==='string'&&/^[a-z0-9-]{1,60}$/.test(s.id)&&
      Array.isArray(s.styles)&&s.styles.length===2&&s.styles.every(validStyle)&&
      Number.isInteger(s.seed)&&s.seed>=0&&s.seed<=0xffffffff&&
      Array.isArray(s.hearts)&&s.hearts.length===2&&s.hearts.every(n=>Number.isInteger(n)&&n>=0&&n<=3)&&
      Number.isInteger(s.turn)&&s.turn>=0&&s.turn<=12&&['aim','flying','done'].includes(s.phase)&&
      Number.isInteger(s.revision)&&s.revision>=0&&s.revision<=24&&
      (s.phase==='done'?(s.turn>0&&[0,1,'tie'].includes(s.winner)):(s.turn<12&&s.winner===null&&s.hearts.every(n=>n>0)))&&
      (s.phase!=='flying'||validShot(s.shot));
  }
  root.DahroojDuelRules={STYLES,create,round,target,point,outcome,fire,settle,valid};
})(typeof window==='undefined'?globalThis:window);
