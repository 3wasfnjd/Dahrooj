// Lightweight canvas limbs. Decorative only: the original ball owns all physics.
(() => {
  'use strict';
  const tau=Math.PI*2;
  const fabric=new Path2D('M0 -.14 C.12 -.38 .36 -.42 .51 -.22 C.57 -.14 .6 -.07 .65 -.04 C.74 -.24 .65 -.51 .67 -.72 C.73 -.83 .92 -.83 1 -.71 C1.06 -.37 1.17 .04 .93 .24 C.72 .41 .34 .38 .05 .19 Z');
  const fist=new Path2D('M-.25 .04 C-.35 -.08 -.29 -.28 -.17 -.3 C-.11 -.38 0 -.37 .06 -.34 C.16 -.38 .26 -.3 .28 -.23 C.38 -.15 .35 .02 .28 .09 L.17 .19 C.02 .26 -.17 .2 -.25 .04 Z');
  function limb(c,pose,t,side,felt){
    c.save();
    c.translate(side*.82,-.09);
    c.scale(side*(.62+.38*pose),1);
    c.rotate((1-pose)*1.15+Math.sin(t*2.2+side*.35)*.025);
    const shade=c.createLinearGradient(.1,-.4,.75,.35);
    shade.addColorStop(0,'#ae5b70');shade.addColorStop(.45,'#802a44');shade.addColorStop(1,'#401020');
    c.fillStyle=shade;c.fill(fabric);
    c.strokeStyle='#591b30';c.lineWidth=.028;c.stroke(fabric);
    // Reuse the body's cached thread texture without allocating a new bitmap.
    c.save();c.clip(fabric);c.scale(1/48,1/48);c.fillStyle=felt;c.globalAlpha=.85;c.fillRect(-12,-48,80,75);c.restore();
    c.beginPath();c.moveTo(.12,-.16);c.bezierCurveTo(.32,-.3,.53,-.18,.57,.02);
    c.strokeStyle='rgba(244,186,194,.26)';c.lineWidth=.045;c.stroke();
    c.beginPath();c.moveTo(.15,.17);c.bezierCurveTo(.48,.31,.94,.31,.94,-.05);c.quadraticCurveTo(.94,-.35,.85,-.65);
    c.setLineDash([.055,.06]);c.lineWidth=.018;c.strokeStyle='#d9aa9f';c.stroke();c.setLineDash([]);
    // Soft ivory cuff and a closed four-finger cartoon glove.
    c.translate(.82,-.76);c.rotate(-.18);
    let g=c.createLinearGradient(-.24,-.35,.25,.2);
    g.addColorStop(0,'#fffdf4');g.addColorStop(.55,'#f0e4cf');g.addColorStop(1,'#c4ad96');
    c.fillStyle=g;c.strokeStyle='#ad8e80';c.lineWidth=.018;
    c.beginPath();c.ellipse(0,.15,.22,.09,0,0,tau);c.fill();c.stroke();
    c.fill(fist);c.stroke(fist);
    c.strokeStyle='rgba(134,101,84,.45)';c.lineWidth=.016;c.lineCap='round';
    for(const x of [-.12,0,.12]){c.beginPath();c.moveTo(x,-.24);c.quadraticCurveTo(x+.015,-.14,x+.045,-.09);c.stroke();}
    c.beginPath();c.moveTo(.27,-.04);c.bezierCurveTo(.09,-.13,-.03,-.07,.01,.06);c.stroke();
    c.restore();
  }
  window.DahroojMuscle={
    arms(c,x,y,r,sx,sy,pose,t,felt,width){
      c.save();c.translate(x,y);c.scale(r*Math.min(1.2,sx),r*Math.min(1.15,sy));
      // Fold the arm nearest a screen edge so it stays visible as the ball rolls.
      for(const side of [-1,1]){
        const room=(side<0?x:width-x)/(r*Math.min(1.2,sx));
        const edge=Math.max(.15,Math.min(1,(room-.8)/1.25));
        c.save();c.scale(edge,1);limb(c,pose,t,side,felt);c.restore();
      }
      c.restore();
    },
    expression(c,r,face){
      if(!['open','joy','focus','squint'].includes(face)) return;
      c.save();c.scale(r,r);c.lineCap='round';
      c.strokeStyle='#422532';c.lineWidth=.07;
      c.beginPath();c.moveTo(-.49,-.35);c.quadraticCurveTo(-.32,-.45,-.16,-.35);c.stroke();
      c.beginPath();c.moveTo(.16,-.36);c.quadraticCurveTo(.32,-.29,.48,-.38);c.stroke();
      if(face==='open'){
        c.beginPath();c.moveTo(-.29,.23);c.quadraticCurveTo(0,.35,.32,.18);c.quadraticCurveTo(.09,.57,-.29,.23);
        c.fillStyle='#432332';c.fill();
        c.beginPath();c.moveTo(-.23,.26);c.quadraticCurveTo(.03,.33,.26,.23);c.quadraticCurveTo(.04,.42,-.23,.26);
        c.fillStyle='#fff4df';c.fill();
      }
      c.restore();
    }
  };
})();
