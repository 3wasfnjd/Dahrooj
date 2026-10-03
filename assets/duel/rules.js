/* Dahrooj — Aboden Games. Shared deterministic rules; no browser dependencies. */
(function(root){
  'use strict';
  const STYLES=['jelly','fabric','clay','fur','bubble'];
  const validStyle=s=>STYLES.includes(s);
  function create(id,styles,seed=0){
    return {v:1,id,styles:styles.map(s=>validStyle(s)?s:'jelly'),seed:seed>>>0,
      hearts:[3,3],turn:0,phase:'aim',shot:null,winner:null,revision:0};
  }
  const round=s=>Math.min(6,Math.floor(s.turn/2)+1);
  const target=s=>({x:Math.sin(s.seed%1000+s.turn*1.97)*2.1,y:1.3,z:12});
  function point(shot,t){return {x:shot.aim*4.8*t,y:1.3+(4+shot.power*7)*t-6*t*t,z:10*t};}
  function outcome(s,shot){
    const targetPos=target(s);
    for(let t=0;t<=1.5;t+=1/240){
      const p=point(shot,t);
      if(Math.hypot(p.x-targetPos.x,p.y-targetPos.y,p.z-targetPos.z)<=.62) return {hit:true,t};
      if(p.y<0) return {hit:false,t};
    }
    return {hit:false,t:1.5};
  }
  function fire(s,player,request){
    if(s.phase!=='aim'||player!==s.turn%2||!request||request.id!==s.id||request.turn!==s.turn||
      !Number.isFinite(request.aim)||Math.abs(request.aim)>1||!Number.isFinite(request.power)||request.power<0||request.power>1) return null;
    return {...s,phase:'flying',revision:s.revision+1,shot:{aim:request.aim,power:request.power}};
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
      (s.phase!=='flying'||(s.shot&&Number.isFinite(s.shot.aim)&&Math.abs(s.shot.aim)<=1&&Number.isFinite(s.shot.power)&&s.shot.power>=0&&s.shot.power<=1));
  }
  root.DahroojDuelRules={STYLES,create,round,target,point,outcome,fire,settle,valid};
})(typeof window==='undefined'?globalThis:window);
