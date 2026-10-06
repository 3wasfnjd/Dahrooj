/* Dahrooj as a 3D model for the headset, in all five styles. Aboden Games.
   The body is a real sphere per style, with procedural surfaces (no downloads): reflections, normal maps,
   shell fur and a thin-film bubble. The face is the game's own face drawing, laid on the front. */
(() => {
  'use strict';
  const MAT_BASE=(document.currentScript&&document.currentScript.src)?new URL('./materials/',document.currentScript.src).href:'./assets/xr/materials/';
  window.createDahrooj3D=(T,{radius,drawFace,renderer})=>{
    const r=radius,V=(x,y,z)=>new T.Vector3(x,y,z);
    const canvas=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.anisotropy=4;return t;};
    let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
    // A tangent-space normal map from a grey height drawing.
    function normalMap(w,h,draw,strength){
      const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');draw(x,w,h);
      const src=x.getImageData(0,0,w,h).data,out=x.createImageData(w,h),H=(i,j)=>src[(((j+h)%h)*w+((i+w)%w))*4]/255;
      for(let j=0;j<h;j++)for(let i=0;i<w;i++){
        const dx=(H(i+1,j)-H(i-1,j))*strength,dy=(H(i,j+1)-H(i,j-1))*strength,l=Math.hypot(dx,dy,1),k=(j*w+i)*4;
        out.data[k]=(-dx/l*.5+.5)*255;out.data[k+1]=(dy/l*.5+.5)*255;out.data[k+2]=(1/l*.5+.5)*255;out.data[k+3]=255;
      }
      x.putImageData(out,0,0);const t=new T.CanvasTexture(c);t.anisotropy=4;return t;
    }

    /* ---------- a soft room to reflect: bright window, warm walls, darker floor ---------- */
    let env=null;
    if(renderer&&T.PMREMGenerator){
      const room=canvas(512,256,(c,w,h)=>{
        const gr=c.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#fffaf0');gr.addColorStop(.45,'#e9dfcf');gr.addColorStop(.55,'#9d8f7c');gr.addColorStop(1,'#4c4338');
        c.fillStyle=gr;c.fillRect(0,0,w,h);
        c.fillStyle='#ffffff';c.fillRect(w*.18,h*.16,w*.14,h*.22);c.fillRect(w*.62,h*.2,w*.08,h*.12);
      });
      try{const pm=new T.PMREMGenerator(renderer);env=pm.fromEquirectangular(room).texture;pm.dispose();}catch(e){env=null;}
    }

    /* ---------- shared surfaces ---------- */
    const sphere=new T.SphereGeometry(r,64,40),liteSphere=new T.SphereGeometry(r,24,16);
    const feltMap=canvas(512,256,(c,w,h)=>{c.fillStyle='#7c2941';c.fillRect(0,0,w,h);
      for(let i=0;i<14000;i++){c.strokeStyle=rand()<.5?'rgba(255,215,228,.07)':'rgba(40,0,15,.1)';c.lineWidth=1;
        const x=rand()*w,y=rand()*h,a=rand()*Math.PI;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*(2+rand()*5),y+Math.sin(a)*(2+rand()*5));c.stroke();}});
    const feltNormal=normalMap(512,256,(c,w,h)=>{c.fillStyle='#808080';c.fillRect(0,0,w,h);
      for(let i=0;i<20000;i++){c.strokeStyle=rand()<.5?'rgba(255,255,255,.18)':'rgba(0,0,0,.18)';const x=rand()*w,y=rand()*h,a=rand()*Math.PI;
        c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*(2+rand()*6),y+Math.sin(a)*(2+rand()*6));c.stroke();}},2.2);
    // Clay: thumb dents and faint fingerprints from being shaped by hand.
    const clayNormal=normalMap(512,256,(c,w,h)=>{c.fillStyle='#808080';c.fillRect(0,0,w,h);
      for(let i=0;i<70;i++){const x=rand()*w,y=rand()*h,s=8+rand()*26,gr=c.createRadialGradient(x,y,0,x,y,s);
        gr.addColorStop(0,rand()<.6?'rgba(0,0,0,.35)':'rgba(255,255,255,.3)');gr.addColorStop(1,'rgba(128,128,128,0)');c.fillStyle=gr;c.fillRect(x-s,y-s,s*2,s*2);}
      for(let f=0;f<6;f++){const x=rand()*w,y=h*.2+rand()*h*.6;c.strokeStyle='rgba(0,0,0,.16)';c.lineWidth=1.2;
        for(let k=2;k<14;k++){c.beginPath();c.ellipse(x,y,k*1.6,k*1.1,rand()*.4,Math.PI*.9,Math.PI*2.1);c.stroke();}}
      for(let i=0;i<9000;i++){c.fillStyle=rand()<.5?'rgba(255,255,255,.08)':'rgba(0,0,0,.08)';c.fillRect(rand()*w,rand()*h,1+rand()*2,1+rand()*2);}},3);
    const clayMap=canvas(256,128,(c,w,h)=>{c.fillStyle='#825637';c.fillRect(0,0,w,h);
      for(let i=0;i<40;i++){const x=rand()*w,y=rand()*h,s=10+rand()*30,gr=c.createRadialGradient(x,y,0,x,y,s);
        gr.addColorStop(0,rand()<.5?'rgba(160,110,75,.35)':'rgba(95,60,38,.3)');gr.addColorStop(1,'rgba(130,86,55,0)');c.fillStyle=gr;c.fillRect(x-s,y-s,s*2,s*2);}});
    // Fur colour: cream with soft brown patches.
    const furMap=canvas(512,256,(c,w,h)=>{c.fillStyle='#f1ebe1';c.fillRect(0,0,w,h);
      for(const [x,y,s] of [[.12,.3,.16],[.55,.62,.2],[.8,.25,.12],[.35,.82,.1],[.95,.7,.14]]){
        const gr=c.createRadialGradient(x*w,y*h,0,x*w,y*h,s*w);gr.addColorStop(0,'#8f6040');gr.addColorStop(.7,'#a9784f');gr.addColorStop(1,'rgba(196,150,104,0)');
        c.fillStyle=gr;c.beginPath();c.ellipse(x*w,y*h,s*w,s*w*.7,0,0,Math.PI*2);c.fill();}});
    // Strand map for the shells: each texel is one hair with its own length; the face is short-haired.
    const FUR_SHELLS=18,FUR_LEN=.085;
    const hairMap=(()=>{
      // Fine and dense: about a millimetre per hair on the ball, grown in soft clumps so the coat
      // reads as fluffy rather than spiky.
      const w=1024,h=512,c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d'),img=x.createImageData(w,h);
      const clump=(i,j)=>.55+.45*Math.sin(i*.09+Math.sin(j*.07)*2)*Math.sin(j*.11+Math.sin(i*.05)*2);
      for(let j=0;j<h;j++)for(let i=0;i<w;i++){
        // The face sits at u = .25, v = .5 on the sphere.
        const du=(i/w-.25)/.17,dv=(j/h-.5)/.2,face=Math.min(1,Math.max(0,(Math.hypot(du,dv)-.75)*3));
        // Every texel has at least a short undercoat, so the skin never shows through as dark dots.
        const len=Math.max(.16,Math.pow(rand(),.45)*(.55+.45*clump(i,j))*(.3+.7*face)),k=(j*w+i)*4;
        img.data[k]=img.data[k+1]=img.data[k+2]=len*255;img.data[k+3]=255;
      }
      x.putImageData(img,0,0);const t=new T.CanvasTexture(c);t.anisotropy=4;return t;
    })();
    // Real surface detail (CC0 normal maps from @pmndrs/assets, see materials/README.md): knitted wool for
    // fabric and finger presses for clay. Until they load, the drawn ones stand in.
    function surface(file,repeat,strength){
      const o={tex:null,mats:new Set()};
      new T.TextureLoader().load(MAT_BASE+file,t=>{t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(...repeat);t.anisotropy=4;o.tex=t;
        for(const m of o.mats){m.normalMap=t;m.normalScale.set(strength,strength);m.needsUpdate=true;}});
      return o;
    }
    const knit=surface('knit-normal.webp',[6,3],.9),clayDents=surface('clay-normal.webp',[3,1.5],1.8);
    // The bubble's film swirls; all bubbles share one clock.
    const bubbleTime={value:0};
    const MATERIALS={
      // Jelly: a clear, glossy skin (transmission lets the light through, the highlights stay bright)
      // over a denser core, like a gummy sweet; the core and a few air bubbles show through.
      jelly:()=>new T.MeshPhysicalMaterial({color:0x5d616e,roughness:.06,metalness:0,clearcoat:1,clearcoatRoughness:.02,
        transmission:.36,transparent:true,depthWrite:false,envMap:env,envMapIntensity:1.1}),
      fabric:()=>{const m=new T.MeshPhysicalMaterial({map:feltMap,normalMap:knit.tex||feltNormal,roughness:1,envMap:env,envMapIntensity:.35});knit.mats.add(m);
        m.normalScale.set(.9,.9);if(m.sheen!==undefined)m.sheen=new T.Color(0xc77d93);return m;},
      clay:()=>{const m=new T.MeshStandardMaterial({map:clayMap,normalMap:clayDents.tex||clayNormal,roughness:.72,envMap:env,envMapIntensity:.5});m.normalScale.set(clayDents.tex?1.8:.7,clayDents.tex?1.8:.7);clayDents.mats.add(m);return m;},
      // The skin is the colour of the hair roots and lit like them, so gaps between hairs read as deeper fur.
      fur:()=>new T.MeshStandardMaterial({map:furMap,color:new T.Color(.74,.72,.69),roughness:1}),
      bubble:()=>new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:bubbleTime},
        vertexShader:'varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);vP=position;gl_Position=projectionMatrix*mv;}',
        fragmentShader:[
          'uniform float uTime;varying vec3 vN;varying vec3 vV;varying vec3 vP;',
          'void main(){vec3 n=normalize(vN),v=normalize(vV);float c=abs(dot(n,v)),f=1.-c;',
          // Film thickness drifts and swirls, thinner at the top like a real bubble.
          'vec3 p=normalize(vP);float th=.55+.25*sin(p.x*5.+uTime*.7+sin(p.y*4.-uTime*.5)*1.6)+.2*sin(p.z*7.-uTime*.4)-.25*p.y;',
          'vec3 film=.5+.5*cos(6.2831*(th*2.2/(.4+c)+vec3(0.,.33,.67)));',
          'vec3 r=reflect(-v,n);float win=smoothstep(.93,.97,dot(r,normalize(vec3(-.45,.6,.65))))+.6*smoothstep(.96,.985,dot(r,normalize(vec3(.6,.3,.75))));',
          'float rim=pow(f,1.8);vec3 col=mix(vec3(.96,.98,1.),film,.75);',
          'gl_FragColor=vec4(col*(.35+rim)+win,.05+rim*.7+win*.8);}'].join('\n')})
    };

    // Place a part on the surface at a direction, facing outward.
    function onSurface(obj,dir,lift=0){const n=dir.clone().normalize();obj.position.copy(n).multiplyScalar(r+lift);obj.lookAt(n.multiplyScalar(r*3));return obj;}
    function bandaid(){
      const g=new T.Group(),skin=new T.MeshStandardMaterial({color:0xe8c29d,roughness:.6,envMap:env,envMapIntensity:.4});
      const pad=new T.Mesh(new T.BoxGeometry(r*.66,r*.24,r*.03),skin);
      const gauze=new T.Mesh(new T.BoxGeometry(r*.22,r*.17,r*.04),new T.MeshStandardMaterial({color:0xf4ddc3,roughness:.95}));
      for(let i=0;i<6;i++){const hole=new T.Mesh(new T.CircleGeometry(r*.012,8),new T.MeshBasicMaterial({color:0xc9a07c}));hole.position.set((i%3-1)*r*.07+(i<3?-r*.23:r*.23),(i<3?1:-1)*r*.03,r*.016);g.add(hole);}
      g.add(pad,gauze);onSurface(g,V(.4,.62,.6),r*.005);g.rotateZ(-.55);return g;
    }
    function stitches(){
      const g=new T.Group(),mat=new T.MeshStandardMaterial({color:0xefe6d2,roughness:.85}),geo=new T.CylinderGeometry(r*.016,r*.016,r*.11,6);
      // A seam around the ball, tilted like the 2D seam, close to the silhouette so it clears the face.
      const tilt=new T.Quaternion().setFromUnitVectors(V(0,1,0),V(.32,.28,1).normalize());
      for(let i=0;i<34;i++){
        const a=i/34*Math.PI*2,p=V(Math.cos(a),0,Math.sin(a)).applyQuaternion(tilt).multiplyScalar(r*1.003);
        const t=V(-Math.sin(a),0,Math.cos(a)).applyQuaternion(tilt);
        const m=new T.Mesh(geo,mat);m.position.copy(p);m.quaternion.setFromUnitVectors(V(0,1,0),t);g.add(m);
      }
      const x=new T.Group();
      for(const s of [-1,1]){const m=new T.Mesh(new T.CylinderGeometry(r*.028,r*.028,r*.3,6),mat);m.rotation.z=s*Math.PI/4;x.add(m);}
      onSurface(x,V(.4,.62,.6),r*.01);g.add(x);return g;
    }
    function bow(){
      const g=new T.Group(),red=new T.MeshPhysicalMaterial({color:0xe2603f,roughness:.45,sheen:new T.Color(0xff9a80),envMap:env,envMapIntensity:.5}),dark=new T.MeshStandardMaterial({color:0xb8432a,roughness:.6});
      for(const s of [-1,1]){
        const loop=new T.Mesh(new T.SphereGeometry(r*.17,20,14),red);loop.scale.set(1.3,.75,.55);loop.position.set(s*r*.2,0,0);loop.rotation.z=s*.35;g.add(loop);
        const tail=new T.Mesh(new T.ConeGeometry(r*.06,r*.26,10),dark);tail.position.set(s*r*.08,-r*.17,0);tail.rotation.z=s*.35;g.add(tail);
      }
      g.add(new T.Mesh(new T.SphereGeometry(r*.07,12,10),dark));
      onSurface(g,V(.24,.78,.58),r*FUR_LEN);return g;
    }
    // Shell fur: stacked layers keep only the longer strands further out, so hairs taper and
    // the roots are shaded. The outer layers droop a little.
    // One material per layer, shared by every fur ball; a lite ball uses every fourth layer.
    // The layers are about a millimetre apart, too close for the depth buffer at headset distances, so
    // they don't write depth: each is drawn over the one inside it, from the skin outwards.
    const furLayers=Array.from({length:FUR_SHELLS},(_,i)=>{const t=(i+1)/FUR_SHELLS,shade=.7+.4*t;
      return {t,mat:new T.MeshStandardMaterial({map:furMap,alphaMap:hairMap,alphaTest:Math.min(.97,.08+t*.9),depthWrite:false,color:new T.Color(Math.min(1,shade),Math.min(1,shade*.97),Math.min(1,shade*.93)),roughness:1})};});
    function furShells(lite){
      const g=new T.Group();
      furLayers.forEach(({t,mat},i)=>{
        if(lite&&i%4!==3)return;
        const m=new T.Mesh(lite?liteSphere:sphere,mat);m.renderOrder=1+t;m.scale.setScalar(1+t*FUR_LEN);m.position.y=-r*.035*t*t;g.add(m);
      });
      return g;
    }

    /* ---------- the face: the game's own drawing, cached per expression ---------- */
    const faces=new Map(),FACE_SPAN=Math.PI*.62;
    // A cap on the front of the sphere: angle maps linearly to the face canvas.
    const capGeo=k=>new T.SphereGeometry(r*k,32,24,Math.PI/2-FACE_SPAN/2,FACE_SPAN,Math.PI/2-FACE_SPAN/2,FACE_SPAN);
    // On fur the face sits on top of the short hair around it.
    const faceGeo=capGeo(1.006),furFaceGeo=capGeo(1+FUR_LEN*.32);
    function faceTexture(style,face,lx,ly,blink,noEyes){
      const qx=Math.round(lx*2)/2,qy=Math.round(ly*2)/2,key=[style,face,qx,qy,blink?1:0,noEyes?1:0].join('/');
      if(!faces.has(key)){
        const size=256,R=size/2/(FACE_SPAN/2)*.97;
        faces.set(key,canvas(size,size,(c)=>{c.translate(size/2,size/2);drawFace(c,R,face,qx,qy,0,blink,style,noEyes);}));
        if(faces.size>160){const first=faces.keys().next().value;faces.get(first).dispose();faces.delete(first);}
      }
      return faces.get(key);
    }

    /* ---------- 3D eyes: glossy eyeballs with a pupil and a glint, where the drawing put them ---------- */
    // Open, focused, wide and happy eyes are real; the closed, squinting, laughing and dizzy ones stay drawn.
    const EYE_FACES=new Set(['open','focus','wide','joy']),ER=r*.19;
    const eyeGeo=new T.SphereGeometry(1,24,16),eyeGeoLite=new T.SphereGeometry(1,12,8);
    const sclera=new T.MeshPhysicalMaterial({color:0xfffaf2,roughness:.2,clearcoat:1,clearcoatRoughness:.04,envMap:env,envMapIntensity:.7});
    const scleraFelt=new T.MeshPhysicalMaterial({color:0xf2ebdd,roughness:.85,envMap:env,envMapIntensity:.3});
    if(scleraFelt.sheen!==undefined)scleraFelt.sheen=new T.Color(0x8a8070);
    const pupilMat=new T.MeshPhysicalMaterial({color:0x2c2d3d,roughness:.06,clearcoat:1,clearcoatRoughness:.02,envMap:env,envMapIntensity:1.1});
    const glintMat=new T.MeshBasicMaterial({color:0xffffff});
    function eyes(style,lite){
      const g=new T.Group(),geo=lite?eyeGeoLite:eyeGeo,parts=[];
      // On fur the eyes sit out on top of the short hair around the face.
      const lift=style==='fur'?r*FUR_LEN*.4:0;
      for(const s of [-1,1]){
        const pivot=new T.Group();pivot.rotation.order='YXZ';g.add(pivot);
        const ball=new T.Group();ball.position.z=r+lift-ER*.22;pivot.add(ball);
        const white=new T.Mesh(geo,style==='fabric'?scleraFelt:sclera);white.scale.set(ER,ER*1.12,ER*.55);ball.add(white);
        const pupil=new T.Group();pupil.position.z=ER*.42;ball.add(pupil);
        const dot=new T.Mesh(geo,pupilMat);dot.scale.set(ER*.55,ER*.55,ER*.22);pupil.add(dot);
        const glint=new T.Mesh(geo,glintMat);glint.scale.setScalar(ER*.15);glint.position.set(-ER*.2,ER*.22,ER*.2);pupil.add(glint);
        parts.push({s,pivot,ball,pupil});
      }
      return {g,set(face,lx,ly,blink){
        const on=EYE_FACES.has(face);g.visible=on;if(!on)return;
        const open=blink?.12:face==='focus'?.6:1,pr=(face==='wide'?.42:face==='joy'?.66:.55)/.55;
        for(const e of parts){
          // Same places as the drawing: a little above the middle, apart, and shifting with the look.
          e.pivot.rotation.set(-(.08-ly*.06),e.s*.31+lx*.08,0);
          e.ball.scale.set(1,open,1);
          e.pupil.position.x=lx*ER*.42;e.pupil.position.y=-ly*ER*.48;e.pupil.scale.set(pr,pr,1);
        }
      }};
    }

    // The jelly's insides: a soft dark core, the skin's inner wall for depth, and trapped air bubbles.
    const jellyCore=new T.MeshStandardMaterial({color:0x3c3f49,roughness:.45,metalness:0,emissive:0x202229,envMap:env,envMapIntensity:.25});
    const jellyWall=new T.MeshPhysicalMaterial({color:0x4b4e56,roughness:.2,side:T.BackSide,transparent:true,opacity:.8,depthWrite:false,envMap:env,envMapIntensity:.5});
    const airMat=new T.MeshPhysicalMaterial({color:0xffffff,roughness:.05,transparent:true,opacity:.45,clearcoat:1,envMap:env,envMapIntensity:1.2,depthWrite:false});
    const airGeo=new T.SphereGeometry(1,12,8);
    function jellyInside(lite){
      const g=new T.Group();
      const core=new T.Mesh(lite?liteSphere:sphere,jellyCore);core.scale.setScalar(.86);g.add(core);
      const wall=new T.Mesh(lite?liteSphere:sphere,jellyWall);wall.scale.setScalar(.985);wall.renderOrder=-1;g.add(wall);
      if(!lite)for(const [x,y,z,s] of [[.42,.38,.55,.07],[-.5,-.2,.56,.05],[.15,-.55,.6,.045],[-.3,.5,.62,.04],[.6,-.1,.5,.035]]){
        const b=new T.Mesh(airGeo,airMat);b.position.set(x*r,y*r,z*r);b.scale.setScalar(s*r);g.add(b);
      }
      return g;
    }

    // lite: for crowds (the opening balls and shots), fewer triangles and fur layers.
    function make(style,{face=true,lite=false}={}){
      const outer=new T.Group(),inner=new T.Group();outer.add(inner);
      const body=new T.Mesh(lite?liteSphere:sphere,MATERIALS[style]?.()||MATERIALS.jelly());
      body.castShadow=style!=='bubble';inner.add(body);
      if(style==='jelly'){inner.add(jellyInside(lite));inner.add(bandaid());body.renderOrder=.5;}
      if(style==='fabric')inner.add(stitches());
      if(style==='fur'){inner.add(furShells(lite));inner.add(bow());}
      let cap=null,eye=null;
      if(face){
        eye=eyes(style,lite);inner.add(eye.g);
        cap=new T.Mesh(style==='fur'?furFaceGeo:faceGeo,new T.MeshBasicMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
        cap.renderOrder=1;inner.add(cap);
      }
      return {
        group:outer,style,
        // pos: centre; look: where the eyes point (-1..1); squash: [sx, sy]; toward: who it faces.
        update({pos,toward,faceName='open',look=[0,0],blink=false,squash=[1,1]}){
          bubbleTime.value=performance.now()/1000;
          outer.position.copy(pos);outer.scale.set(squash[0],squash[1],squash[0]);
          if(toward)inner.lookAt(toward);
          eye?.set(faceName,look[0],look[1],blink);
          if(cap){
            if(faceName==='none')cap.visible=false;
            else{const map=faceTexture(style,faceName,look[0],look[1],blink,!!eye&&EYE_FACES.has(faceName));if(cap.material.map!==map){cap.material.map=map;cap.material.needsUpdate=true;}cap.visible=true;}
          }
        },
        dispose(){outer.traverse(o=>{if(o.isMesh&&o.material!==undefined&&!o.geometry.isShared)o.material.dispose?.();});}
      };
    }
    return {make};
  };
})();
