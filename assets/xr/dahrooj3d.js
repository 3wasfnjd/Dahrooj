/* Dahrooj as a 3D model for the headset, in all five styles. Aboden Games.
   The body is a real sphere per style; the face is the game's own face drawing, laid on the front. */
(() => {
  'use strict';
  window.createDahrooj3D=(T,{radius,drawFace})=>{
    const r=radius,V=(x,y,z)=>new T.Vector3(x,y,z);
    const canvas=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.anisotropy=4;return t;};
    let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;

    /* ---------- shared surfaces ---------- */
    const sphere=new T.SphereGeometry(r,48,32);
    const feltMap=canvas(256,128,(c,w,h)=>{c.fillStyle='#7c2941';c.fillRect(0,0,w,h);
      for(let i=0;i<5000;i++){c.fillStyle=rand()<.5?'rgba(255,220,230,.06)':'rgba(40,0,15,.08)';c.fillRect(rand()*w,rand()*h,1+rand()*2,1);}});
    const furMap=canvas(512,256,(c,w,h)=>{c.fillStyle='#f3eee6';c.fillRect(0,0,w,h);
      for(const [x,y,s] of [[.12,.3,.16],[.55,.62,.2],[.8,.25,.12],[.35,.8,.1],[.95,.7,.14]]){
        const gr=c.createRadialGradient(x*w,y*h,0,x*w,y*h,s*w);gr.addColorStop(0,'#966640');gr.addColorStop(.75,'#a9784f');gr.addColorStop(1,'rgba(196,150,104,0)');
        c.fillStyle=gr;c.beginPath();c.ellipse(x*w,y*h,s*w,s*w*.7,0,0,Math.PI*2);c.fill();}
      for(let i=0;i<3000;i++){c.fillStyle=rand()<.5?'rgba(255,255,255,.18)':'rgba(120,80,50,.08)';c.fillRect(rand()*w,rand()*h,1,2+rand()*3);}});
    const hairMap=canvas(1024,512,(c,w,h)=>{c.fillStyle='#000';c.fillRect(0,0,w,h);
      for(let i=0;i<26000;i++){const v=110+rand()*145|0;c.fillStyle=`rgb(${v},${v},${v})`;c.fillRect(rand()*w,rand()*h,1,1);}});
    // Clay keeps a hand-made, slightly uneven surface.
    const claySphere=sphere.clone();{
      const p=claySphere.attributes.position,v=V(0,0,0);
      for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const n=1+.01*Math.sin(v.x*41+v.y*13)+.007*Math.sin(v.y*37-v.z*29)+.005*Math.sin(v.z*53);v.multiplyScalar(n);p.setXYZ(i,v.x,v.y,v.z);}
      claySphere.computeVertexNormals();
    }
    const MATERIALS={
      jelly:()=>new T.MeshPhysicalMaterial({color:0x4b4e56,roughness:.2,metalness:0,clearcoat:1,clearcoatRoughness:.06}),
      fabric:()=>new T.MeshStandardMaterial({map:feltMap,roughness:1}),
      clay:()=>new T.MeshStandardMaterial({color:0x825637,roughness:.82}),
      fur:()=>new T.MeshStandardMaterial({map:furMap,roughness:1}),
      bubble:()=>new T.ShaderMaterial({transparent:true,depthWrite:false,
        vertexShader:'varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
        fragmentShader:'varying vec3 vN;varying vec3 vV;void main(){float f=1.-abs(dot(normalize(vN),normalize(vV)));float rim=pow(f,2.2);vec3 film=.6+.4*cos(6.2831*(f*1.3+vec3(0.,.33,.67)));vec3 col=mix(vec3(.93,.98,1.),film,.55);float spec=pow(max(dot(normalize(vN),normalize(vec3(-.4,.6,.7))),0.),60.);gl_FragColor=vec4(col+spec,.1+rim*.75+spec);}'})
    };

    // Place a part on the surface at a direction, facing outward.
    function onSurface(obj,dir,lift=0){const n=dir.clone().normalize();obj.position.copy(n).multiplyScalar(r+lift);obj.lookAt(n.multiplyScalar(r*3));return obj;}
    function bandaid(){
      const g=new T.Group();
      const pad=new T.Mesh(new T.BoxGeometry(r*.66,r*.24,r*.035),new T.MeshStandardMaterial({color:0xe8c29d,roughness:.7}));
      const gauze=new T.Mesh(new T.BoxGeometry(r*.22,r*.17,r*.045),new T.MeshStandardMaterial({color:0xf4ddc3,roughness:.9}));
      g.add(pad,gauze);onSurface(g,V(.4,.62,.6),r*.005);g.rotateZ(-.55);return g;
    }
    function stitches(){
      const g=new T.Group(),mat=new T.MeshStandardMaterial({color:0xefe6d2,roughness:.8}),geo=new T.CylinderGeometry(r*.018,r*.018,r*.11,6);
      // A seam around the ball, tilted like the 2D seam.
      const tilt=new T.Quaternion().setFromUnitVectors(V(0,1,0),V(.32,.28,1).normalize());
      for(let i=0;i<34;i++){
        const a=i/34*Math.PI*2,p=V(Math.cos(a),0,Math.sin(a)).applyQuaternion(tilt).multiplyScalar(r*1.003);
        const t=V(-Math.sin(a),0,Math.cos(a)).applyQuaternion(tilt);
        const m=new T.Mesh(geo,mat);m.position.copy(p);m.quaternion.setFromUnitVectors(V(0,1,0),t);g.add(m);
      }
      const x=new T.Group();
      for(const s of [-1,1]){const m=new T.Mesh(new T.CylinderGeometry(r*.03,r*.03,r*.3,6),mat);m.rotation.z=s*Math.PI/4;x.add(m);}
      onSurface(x,V(.4,.62,.6),r*.01);g.add(x);return g;
    }
    function bow(){
      const g=new T.Group(),red=new T.MeshStandardMaterial({color:0xe2603f,roughness:.6}),dark=new T.MeshStandardMaterial({color:0xb8432a,roughness:.6});
      for(const s of [-1,1]){
        const loop=new T.Mesh(new T.SphereGeometry(r*.17,16,12),red);loop.scale.set(1.3,.75,.55);loop.position.set(s*r*.2,0,0);loop.rotation.z=s*.35;g.add(loop);
        const tail=new T.Mesh(new T.ConeGeometry(r*.06,r*.26,8),dark);tail.position.set(s*r*.08,-r*.17,0);tail.rotation.z=s*.35;g.add(tail);
      }
      g.add(new T.Mesh(new T.SphereGeometry(r*.07,12,10),dark));
      onSurface(g,V(.25,.92,.25),r*.04);return g;
    }
    function furShells(){
      const g=new T.Group();
      for(let k=1;k<=5;k++){
        const m=new T.Mesh(sphere,new T.MeshStandardMaterial({alphaMap:hairMap,color:0xf6f1ea,transparent:true,opacity:1-k*.16,depthWrite:false,roughness:1}));
        m.scale.setScalar(1+k*.014);g.add(m);
      }
      return g;
    }

    /* ---------- the face: the game's own drawing, cached per expression ---------- */
    const faces=new Map(),FACE_SPAN=Math.PI*.62;
    // A cap on the front of the sphere: angle maps linearly to the face canvas.
    const faceGeo=new T.SphereGeometry(r*1.006,32,24,Math.PI/2-FACE_SPAN/2,FACE_SPAN,Math.PI/2-FACE_SPAN/2,FACE_SPAN);
    function faceTexture(style,face,lx,ly,blink){
      const qx=Math.round(lx*2)/2,qy=Math.round(ly*2)/2,key=[style,face,qx,qy,blink?1:0].join('/');
      if(!faces.has(key)){
        const size=256,R=size/2/(FACE_SPAN/2)*.97;
        faces.set(key,canvas(size,size,(c)=>{c.translate(size/2,size/2);drawFace(c,R,face,qx,qy,0,blink,style);}));
        if(faces.size>160){const first=faces.keys().next().value;faces.get(first).dispose();faces.delete(first);}
      }
      return faces.get(key);
    }

    function make(style,{face=true}={}){
      const outer=new T.Group(),inner=new T.Group();outer.add(inner);
      const body=new T.Mesh(style==='clay'?claySphere:sphere,MATERIALS[style]?.()||MATERIALS.jelly());
      body.castShadow=style!=='bubble';inner.add(body);
      if(style==='jelly')inner.add(bandaid());
      if(style==='fabric')inner.add(stitches());
      if(style==='fur'){inner.add(furShells());inner.add(bow());}
      let cap=null;
      if(face){
        cap=new T.Mesh(faceGeo,new T.MeshBasicMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
        cap.renderOrder=1;inner.add(cap);
      }
      return {
        group:outer,style,
        // pos: centre; look: where the eyes point (-1..1); squash: [sx, sy]; toward: who it faces.
        update({pos,toward,faceName='open',look=[0,0],blink=false,squash=[1,1]}){
          outer.position.copy(pos);outer.scale.set(squash[0],squash[1],squash[0]);
          if(toward)inner.lookAt(toward);
          if(cap){
            if(faceName==='none')cap.visible=false;
            else{const map=faceTexture(style,faceName,look[0],look[1],blink);if(cap.material.map!==map){cap.material.map=map;cap.material.needsUpdate=true;}cap.visible=true;}
          }
        },
        dispose(){outer.traverse(o=>{if(o.isMesh&&o.material!==undefined&&!o.geometry.isShared)o.material.dispose?.();});}
      };
    }
    return {make};
  };
})();
