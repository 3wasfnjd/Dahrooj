/* Motri's world around Dahrooj in the headset (VR). Aboden Games.
   A port of Motri / Folio 2025 by Bruno Simon (MIT) from Three.js r183 TSL to r128 GLSL, with Motri's
   own models and values: grass (Grass.js), oak, birch and cherry trees with their foliage (Trees.js,
   Foliage.js, foliageSDF.png and the tree models, Draco removed), bushes (Bushes.js), wind (Wind.js),
   rain lines and falling snow (RainLines.js), snow on the ground (Snow.js), day cycles and their
   presets (DayCycles.js), seasons (YearCycles.js), weather (Weather.js), lighting
   (Ligthing.js, MeshDefaultMaterial.js) and the fog and background gradient (Fog.js).
   Distances are in game metres (the headset shows them at a half). */
(() => {
  'use strict';
  const T=THREE,C=h=>new T.Color(h),V=(x,y,z)=>new T.Vector3(x,y,z);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
  const remapClamp=(v,a,b,c,d)=>{const t=clamp((v-a)/(b-a),0,1);return c+(d-c)*t;};
  const BASE=(document.currentScript&&document.currentScript.src)?new URL('./motri/',document.currentScript.src).href:'./assets/xr/motri/';

  /* ---------- DayCycles.js presets and keyframes (4 minutes per day, on the real clock) ---------- */
  const DAY={
    day:  {lightColor:C('#ffd2c2'),lightIntensity:1.2,shadowColor:C('#6d3fff'),fogColorA:C('#00ffff'),fogColorB:C('#9b89ff'),fogNearRatio:.315,fogFarRatio:1.25,temperature:5},
    dusk: {lightColor:C('#ff8181'),lightIntensity:1.2,shadowColor:C('#4e009c'),fogColorA:C('#3e53ff'),fogColorB:C('#ff4ce4'),fogNearRatio:0,fogFarRatio:1.25,temperature:0},
    night:{lightColor:C('#3240ff'),lightIntensity:3.8,shadowColor:C('#2f00db'),fogColorA:C('#10266f'),fogColorB:C('#490a42'),fogNearRatio:-.85,fogFarRatio:1,temperature:-7.5},
    dawn: {lightColor:C('#ffa882'),lightIntensity:1.2,shadowColor:C('#db004f'),fogColorA:C('#f885ff'),fogColorB:C('#ff7d24'),fogNearRatio:.3,fogFarRatio:1.25,temperature:0}
  };
  const DAY_KEYS=[[DAY.day,0],[DAY.day,.15],[DAY.dusk,.25],[DAY.night,.35],[DAY.night,.6],[DAY.dawn,.8],[DAY.day,.9]];
  const DAY_SECONDS=4*60;
  // YearCycles.js: seasons on the real date.
  const YEAR={winter:{temperature:5,humidity:.8,clouds:.65,wind:.3},spring:{temperature:15,humidity:.65,clouds:.45,wind:.2},
    summer:{temperature:25,humidity:.5,clouds:.3,wind:.1},fall:{temperature:15,humidity:.65,clouds:.65,wind:.25}};
  const YEAR_KEYS=[[YEAR.winter,.125],[YEAR.spring,.375],[YEAR.summer,.625],[YEAR.fall,.875]];
  // Cycles.js blends neighbouring keyframes, wrapping around the end of the cycle.
  function blend(keys,p,out){
    const n=keys.length;let ia=n-1;
    for(let i=0;i<n;i++)if(keys[i][1]<=p)ia=i;
    const a=keys[ia],b=keys[(ia+1)%n],pa=a[1],pb=b[1]<=pa?b[1]+1:b[1],pp=p<pa?p+1:p,t=pb>pa?(pp-pa)/(pb-pa):0;
    for(const k in a[0]){const va=a[0][k],vb=b[0][k];if(va&&va.isColor)(out[k]||(out[k]=C(0))).copy(va).lerp(vb,t);else out[k]=lerp(va,vb,t);}
    return out;
  }

  /* ---------- Noises.js perlin (6 cells, period 6, remapped 0.1–0.9 to 0–1) ---------- */
  function perlinTexture(size=128){
    const rand=(x,y)=>{const a=Math.sin(x*127.1+y*311.7)*43758.5453123,b=Math.sin(x*269.5+y*183.3)*43758.5453123;return [-1+2*(a-Math.floor(a)),-1+2*(b-Math.floor(b))];};
    const mod=(a,b)=>((a%b)+b)%b,sm=t=>t*t*(3-2*t),data=new Uint8Array(size*size*4);
    for(let j=0;j<size;j++)for(let i=0;i<size;i++){
      const u=i/size*6,v=j/size*6,x0=Math.floor(u),y0=Math.floor(v),fx=u-x0,fy=v-y0;
      const lx=mod(x0,6),ly=mod(y0,6),hx=mod(x0+1,6),hy=mod(y0+1,6);
      const d=(c,ox,oy)=>c[0]*(fx-ox)+c[1]*(fy-oy);
      const n=lerp(lerp(d(rand(lx,ly),0,0),d(rand(hx,ly),1,0),sm(fx)),lerp(d(rand(lx,hy),0,1),d(rand(hx,hy),1,1),sm(fx)),sm(fy))*.8+.5;
      const k=(j*size+i)*4,val=clamp((n-.1)/.8,0,1)*255;data[k]=data[k+1]=data[k+2]=val;data[k+3]=255;
    }
    const t=new T.DataTexture(data,size,size,T.RGBAFormat);t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=t.minFilter=T.LinearFilter;t.needsUpdate=true;return t;
  }

  window.createDahroojNature=(_T,{scene,hemi,sun,lineMat,court={x:0,z:-10}})=>{
    const root=new T.Group();root.name='xr-nature';root.visible=false;scene.add(root);
    let seed=7;const rng=()=>(seed=(seed*16807)%2147483647)/2147483647;
    const perlin=perlinTexture();

    /* ---------- Ligthing.js + MeshDefaultMaterial.js + Fog.js, shared by every Motri piece ---------- */
    const phi=.63,theta=.72;
    const U={
      uLightColor:{value:C('#ffffff')},uLightIntensity:{value:1},uShadowColor:{value:C('#6d3fff')},
      uLightDir:{value:V(Math.sin(phi)*Math.sin(theta),Math.cos(phi),Math.sin(phi)*Math.cos(theta)).normalize()},
      uFogA:{value:C('#00ffff')},uFogB:{value:C('#9b89ff')},uFogNear:{value:20},uFogFar:{value:50},
      uHorizon:{value:C('#9ff')},uZenith:{value:C('#9b89ff')},uSunDir:{value:V(.3,.5,-.8).normalize()},uStars:{value:0},
      uPerlin:{value:perlin},uTime:{value:0},
      uWindDir:{value:new T.Vector2(Math.sin(Math.PI*.6),Math.cos(Math.PI*.6))},uWindStrength:{value:.5},uWindTime:{value:0},uCam:{value:V(0,0,0)}
    };
    const SHADE=`
      uniform vec3 uLightColor,uShadowColor,uLightDir,uFogA,uFogB,uHorizon;uniform float uLightIntensity,uFogNear,uFogFar;
      varying vec4 vClip;varying float vDist;
      vec3 motriShade(vec3 base,vec3 n,float extraShadow){
        vec3 col=base*uLightColor*uLightIntensity;
        float core=smoothstep(1.,-.25,dot(n,uLightDir));
        col=mix(col,base*uShadowColor,clamp(max(core,extraShadow),0.,1.));
        // Range fog into the horizon colour of the sky (Motri's fog colours), so the land melts into it.
        return mix(col,uHorizon,smoothstep(uFogNear,uFogFar,vDist));
      }`;
    const WIND=`
      uniform sampler2D uPerlin;uniform vec2 uWindDir;uniform float uWindStrength,uWindTime;
      vec2 windOffset(vec2 p){p*=.5;
        float n1=texture2D(uPerlin,p*.2+uWindDir*uWindTime).r-.5;float n2=texture2D(uPerlin,p*.1+uWindDir*uWindTime*.2).r-.5;
        return uWindDir*(n1+n2)*uWindStrength;}`;
    const OUT='vec4 mv=modelViewMatrix*vec4(p,1.);vDist=-mv.z;gl_Position=projectionMatrix*mv;vClip=gl_Position;';

    /* ---------- sky: Motri's day colours as a dome, light at the horizon and rich overhead ---------- */
    // It follows the eyes and stays inside the camera's far plane (the game camera sees 120 m).
    const sky=new T.Mesh(new T.SphereGeometry(100,32,16),new T.ShaderMaterial({uniforms:U,side:T.BackSide,depthWrite:false,fog:false,
      vertexShader:'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:[
        'uniform vec3 uHorizon,uZenith,uFogA,uSunDir,uLightColor;uniform float uStars;varying vec3 vDir;',
        'float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
        'void main(){vec3 d=normalize(vDir);float h=clamp(d.y,0.,1.);',
        'vec3 col=mix(uHorizon,uZenith,pow(h,.6));',
        'col=mix(col,uFogA,.18*(1.-h)*(.5+.5*d.x));',
        'float s=max(dot(d,uSunDir),0.);col+=uLightColor*(pow(s,600.)*1.5+pow(s,10.)*.25);',
        // Stars at night (DayCycles.js night interval).
        'col+=step(.9965,hash(floor(d*220.)))*smoothstep(.05,.3,d.y)*uStars;',
        'col=mix(col,uHorizon,step(d.y,.0));gl_FragColor=vec4(col,1.);}'].join('\n')}));
    sky.renderOrder=-10;sky.frustumCulled=false;root.add(sky);

    /* ---------- tracks: where Dahrooj rolls and lands, as Motri's Tracks.js does for the wheels ---------- */
    // A black canvas over the field; white where a ball pressed the grass, dug the snow or marked the ground.
    // It fades back slowly, so old tracks heal.
    const TRACK_PX=512,TRACK_SIZE=64,trackCanvas=document.createElement('canvas');trackCanvas.width=trackCanvas.height=TRACK_PX;
    const tctx=trackCanvas.getContext('2d');tctx.fillStyle='#000';tctx.fillRect(0,0,TRACK_PX,TRACK_PX);
    const trackTex=new T.CanvasTexture(trackCanvas);trackTex.minFilter=trackTex.magFilter=T.LinearFilter;trackTex.generateMipmaps=false;
    U.uTracks={value:trackTex};U.uTrackArea={value:V(court.x,court.z,TRACK_SIZE)};
    /* Floor.js: Motri's stone slabs under the play area, fading into grass at a noisy edge.
       uSlab: centre x, centre z, half width, half length (set per mode so the target stands on it). */
    const slabsTexture=new T.TextureLoader().load(BASE+'slabs.png');slabsTexture.wrapS=slabsTexture.wrapT=T.RepeatWrapping;
    U.uSlabs={value:slabsTexture};U.uSlab={value:new T.Vector4(court.x,-2.5,9,9)};
    U.uSlabHigh={value:C('#ffcf8b')};U.uSlabLow={value:C('#a87762')};
    const SLAB=`
      uniform sampler2D uSlabs;uniform vec4 uSlab;uniform vec3 uSlabHigh,uSlabLow;
      float slabAt(vec2 p){vec2 q=abs(p-uSlab.xy)-uSlab.zw;float edge=max(q.x,q.y);
        float n=texture2D(uPerlin,p*.03).r;return 1.-smoothstep(-1.2,.8,edge+(n-.5)*2.2);}
      vec3 slabColor(vec2 p){return mix(uSlabLow,uSlabHigh,texture2D(uSlabs,p*.175).r);}`;
    let tracksDirty=false,tracksFade=0,tracksUpload=0;
    const TRACK=`
      uniform sampler2D uTracks;uniform vec3 uTrackArea;
      float trackAt(vec2 p){vec2 uv=(p-uTrackArea.xy)/uTrackArea.z+.5;
        if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return 0.;return texture2D(uTracks,vec2(uv.x,1.-uv.y)).r;}`;
    const dirtColor=C('#7a4a22');

    /* ---------- ground: Terrain.js grass colour, lit like everything else ---------- */
    const grassColor=C('#b8b62e');
    const groundMat=new T.ShaderMaterial({uniforms:{...U,uColor:{value:grassColor},uDirt:{value:dirtColor}},
      vertexShader:'varying vec4 vClip;varying float vDist;varying vec2 vWorld;void main(){vec3 p=position;vWorld=(modelMatrix*vec4(p,1.)).xz;'+OUT+'}',
      // Marks: the ground shows dirt where balls rolled.
      fragmentShader:SHADE+TRACK+'uniform sampler2D uPerlin;'+SLAB+'uniform vec3 uColor,uDirt;varying vec2 vWorld;void main(){vec3 c=mix(uColor,slabColor(vWorld),slabAt(vWorld));c=mix(c,uDirt,clamp(trackAt(vWorld)*1.4,0.,.9)*(1.-slabAt(vWorld)*.6));gl_FragColor=vec4(motriShade(c,vec3(0.,1.,0.),0.),1.);}'});
    const ground=new T.Mesh(new T.CircleGeometry(300,64).rotateX(-Math.PI/2),groundMat);ground.position.y=-.02;root.add(ground);

    /* ---------- Grass.js: three vertices per blade, turned to the camera, bent by the wind ---------- */
    {
      const subdivisions=340,size=60,count=subdivisions*subdivisions,fragment=size/subdivisions;
      const position=new Float32Array(count*9),heightRandomness=new Float32Array(count*3),corner=new Float32Array(count*3);
      for(let iX=0;iX<subdivisions;iX++)for(let iZ=0;iZ<subdivisions;iZ++){
        const i=iX*subdivisions+iZ,fx=(iX/subdivisions-.5)*size+fragment*.5+court.x,fz=(iZ/subdivisions-.5)*size+fragment*.5+court.z;
        const x=fx+(rng()-.5)*fragment,z=fz+(rng()-.5)*fragment,r=rng();
        for(let v=0;v<3;v++){position.set([x,0,z],i*9+v*3);heightRandomness[i*3+v]=r;corner[i*3+v]=v;}
      }
      const geo=new T.BufferGeometry();
      geo.setAttribute('position',new T.BufferAttribute(position,3));geo.setAttribute('heightRandomness',new T.BufferAttribute(heightRandomness,1));geo.setAttribute('corner',new T.BufferAttribute(corner,1));
      const mat=new T.ShaderMaterial({uniforms:{...U,uColor:{value:grassColor},uDirt:{value:dirtColor},uPitch:{value:new T.Vector4(court.x,court.z+1,11,17)},bladeWidth:{value:.1},bladeHeight:{value:.6},bladeHeightRandomness:{value:.6}},side:T.DoubleSide,
        vertexShader:WIND+`
          attribute float heightRandomness,corner;uniform float bladeWidth,bladeHeight,bladeHeightRandomness;uniform vec3 uCam;uniform vec4 uPitch;
          varying vec4 vClip;varying float vDist;varying float vTip;varying float vTrack;`+TRACK+SLAB+`
          void main(){
            vec3 p=position;float tip=corner<.5?1.:0.;vTip=tip;
            float heightVariation=texture2D(uPerlin,p.xz*.0321).r+.5;
            float h=bladeHeight*(bladeHeightRandomness*heightRandomness+(1.-bladeHeightRandomness))*heightVariation;
            // On the pitch the grass is mown short so Dahrooj and the lines stay visible; Motri's height around it.
            vec2 q=abs(p.xz-uPitch.xy)-uPitch.zw;h*=mix(.28,1.,smoothstep(0.,3.,max(q.x,q.y)));
            // Pressed flat where a ball rolled.
            vTrack=trackAt(p.xz);h*=1.-vTrack*.85;
            // No grass on the stone (Grass.js hides blades where the terrain has none).
            float slab=slabAt(p.xz);h*=1.-smoothstep(.35,.7,slab);if(slab>.7)p.y-=100.;
            vec2 shape=corner<.5?vec2(0.,1.):corner<1.5?vec2(1.,0.):vec2(-1.,0.);
            vec3 offset=vec3(shape.x*bladeWidth,shape.y*h,0.);
            float a=atan(p.z-uCam.z,p.x-uCam.x)-1.5707963;
            offset.xz=vec2(offset.x*cos(a)-offset.z*sin(a),offset.x*sin(a)+offset.z*cos(a));
            vec2 w=windOffset(p.xz)*tip*h*2.;p+=offset;p.xz+=w;
            ${OUT}
          }`,
        fragmentShader:SHADE+'uniform vec3 uColor,uDirt;varying float vTip;varying float vTrack;void main(){vec3 c=mix(uColor,uDirt,clamp(vTrack*1.2,0.,.8));gl_FragColor=vec4(motriShade(c,vec3(0.,1.,0.),1.-vTip),1.);}'});
      const grass=new T.Mesh(geo,mat);grass.frustumCulled=false;root.add(grass);
    }

    /* ---------- Foliage.js: 80 leaf planes per clump, cut out by the foliage SDF that the wind turns ---------- */
    const foliageTexture=new T.TextureLoader().load(BASE+'foliageSDF.png');
    const foliageGeometry=(()=>{
      const planes=[];let s=11;const r=()=>(s=(s*16807)%2147483647)/2147483647;
      for(let i=0;i<80;i++){
        const plane=new T.PlaneGeometry(.8,.8);
        const position=V(0,0,0).setFromSpherical(new T.Spherical(1-Math.pow(r(),3),Math.PI*2*r(),Math.PI*r()));
        plane.rotateZ(r()*9999);plane.translate(position.x,position.y,position.z);
        const normal=position.clone().normalize(),n=plane.attributes.normal,pa=plane.attributes.position;
        for(let k=0;k<4;k++){const m=V(pa.getX(k),pa.getY(k),pa.getZ(k)).lerp(normal,.85);n.setXYZ(k,m.x,m.y,m.z);}
        planes.push(plane);
      }
      // Merge (BufferGeometryUtils is not part of the r128 core build).
      let vc=0,ic=0;for(const p of planes){vc+=p.attributes.position.count;ic+=p.index.count;}
      const pos=new Float32Array(vc*3),nor=new Float32Array(vc*3),uv=new Float32Array(vc*2),idx=new Uint16Array(ic);let vo=0,io=0;
      for(const p of planes){pos.set(p.attributes.position.array,vo*3);nor.set(p.attributes.normal.array,vo*3);uv.set(p.attributes.uv.array,vo*2);
        for(let k=0;k<p.index.count;k++)idx[io+k]=p.index.array[k]+vo;vo+=p.attributes.position.count;io+=p.index.count;}
      const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('normal',new T.BufferAttribute(nor,3));g.setAttribute('uv',new T.BufferAttribute(uv,2));g.setIndex(new T.BufferAttribute(idx,1));
      return g;
    })();
    function foliage(matrices,colorA,colorB){
      const mat=new T.ShaderMaterial({uniforms:{...U,uFoliage:{value:foliageTexture},uColorA:{value:C(colorA)},uColorB:{value:C(colorB)},threshold:{value:.3}},side:T.DoubleSide,
        vertexShader:WIND+`
          varying vec4 vClip;varying float vDist;varying vec2 vUv;varying vec3 vNormal;varying float vTurn;
          void main(){vUv=uv;
            vNormal=normalize(mat3(modelMatrix*instanceMatrix)*normal);
            vTurn=length(windOffset(position.xz))*2.2;
            vec4 mv=viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.);vDist=-mv.z;gl_Position=projectionMatrix*mv;vClip=gl_Position;}`,
        fragmentShader:SHADE+`
          uniform sampler2D uFoliage;uniform vec3 uColorA,uColorB;uniform float threshold;varying vec2 vUv;varying vec3 vNormal;varying float vTurn;
          void main(){
            vec2 c=vUv-.5;float s=sin(vTurn),k=cos(vTurn);vec2 ruv=vec2(c.x*k-c.y*s,c.x*s+c.y*k)+.5;
            float alpha=texture2D(uFoliage,ruv).r-threshold;if(alpha<.1)discard;
            vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
            vec3 base=mix(uColorA,uColorB,smoothstep(0.,1.,dot(n,uLightDir)));
            gl_FragColor=vec4(motriShade(base,n,0.),1.);}`});
      const mesh=new T.InstancedMesh(foliageGeometry,mat,matrices.length);
      matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.frustumCulled=false;root.add(mesh);return mesh;
    }
    // Clumps face the player's usual view at a random roll, as Foliage.js faces the default camera.
    const toward=V(0,6,8);
    function clump(pos,size){
      const o=new T.Object3D(),angle=Math.PI*2*rng();o.up.set(Math.sin(angle),Math.cos(angle),0);
      o.position.copy(pos);o.lookAt(toward);o.scale.setScalar(size);o.updateMatrix();return o.matrix.clone();
    }

    /* ---------- Trees.js with Motri's oak, birch and cherry models ---------- */
    // Spots around the court, clear of the pitch and of the view back to the start.
    const spots=[];
    for(let i=0;i<90&&spots.length<42;i++){
      const a=rng()*Math.PI*2,r=20+rng()*30,x=court.x+Math.cos(a)*r,z=court.z+Math.sin(a)*r;
      if(Math.abs(x-court.x)<14&&z>-30&&z<8)continue;
      spots.push({x,z,rot:rng()*Math.PI*2,scale:.85+rng()*.4});
    }
    // A wood behind the target, beyond the stone.
    for(let i=0;i<24;i++)spots.push({x:court.x+(rng()-.5)*40,z:-28-rng()*18,rot:rng()*Math.PI*2,scale:.8+rng()*.5});
    const bodyMat=map=>new T.ShaderMaterial({uniforms:{...U,uMap:{value:map}},
      vertexShader:'varying vec4 vClip;varying float vDist;varying vec2 vUv;varying vec3 vNormal;void main(){vUv=uv;vNormal=normalize(mat3(modelMatrix*instanceMatrix)*normal);vec4 mv=viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.);vDist=-mv.z;gl_Position=projectionMatrix*mv;vClip=gl_Position;}',
      fragmentShader:SHADE+'uniform sampler2D uMap;varying vec2 vUv;varying vec3 vNormal;void main(){vec3 base=texture2D(uMap,vUv).rgb;gl_FragColor=vec4(motriShade(base,normalize(vNormal),0.),1.);}'});
    const TREES=[['oakTreesVisual.glb','#b4b536','#d8cf3b'],['birchTreesVisual.glb','#ff4f2b','#ff903f'],['cherryTreesVisual.glb','#ff6d6d','#ff9990']];
    let treesLoaded=0;
    if(T.GLTFLoader){
      const loader=new T.GLTFLoader();
      TREES.forEach(([file,colorA,colorB],kind)=>loader.load(BASE+file,gltf=>{
        const mine=spots.filter((_,i)=>i%3===kind);let body=null;const leaves=[];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse(o=>{if(!o.isMesh)return;const name=o.name+' '+(o.parent?o.parent.name:'');
          if(name.includes('treeBody'))body=o;else if(name.includes('treeLeaves'))leaves.push(o);});
        if(!body)return;
        const bodies=new T.InstancedMesh(body.geometry,bodyMat(body.material.map),mine.length);
        const refs=mine.map(s=>new T.Matrix4().compose(V(s.x,0,s.z),new T.Quaternion().setFromAxisAngle(V(0,1,0),s.rot),V(s.scale,s.scale,s.scale)));
        refs.forEach((m,i)=>bodies.setMatrixAt(i,m.clone().multiply(body.matrixWorld)));bodies.frustumCulled=false;root.add(bodies);
        const mats=[];
        for(const ref of refs)for(const leaf of leaves){
          const pos=V(0,0,0),q=new T.Quaternion(),sc=V(1,1,1);ref.clone().multiply(leaf.matrixWorld).decompose(pos,q,sc);mats.push(clump(pos,sc.x));
        }
        foliage(mats,colorA,colorB);treesLoaded++;
      }));
    }
    /* ---------- Bushes.js: foliage clumps on their own, in the oak colours ---------- */
    {
      const mats=[];
      for(let i=0;i<60&&mats.length<46;i++){
        const a=rng()*Math.PI*2,r=15+rng()*24,x=court.x+Math.cos(a)*r,z=court.z+Math.sin(a)*r;
        if(Math.abs(x-court.x)<12&&z>-29&&z<7)continue;
        mats.push(clump(V(x,.6+rng()*.7,z),.9+rng()*.3));
      }
      foliage(mats,'#b4b536','#d8cf3b');
    }

    /* ---------- RainLines.js: quads falling from 20 m, wrapped around the view; short and slow for snow ---------- */
    const rainU={...U,thickness:{value:.015},elevation:{value:20},incline:{value:.2},size:{value:40},center:{value:new T.Vector2()},len:{value:2},localTime:{value:0},visibleRatio:{value:0}};
    let rainSpeed=.25;
    const rain=(()=>{
      const count=Math.pow(2,11),position=new Float32Array(count*12),offset=new Float32Array(count*8),random=new Float32Array(count*4),index=new Uint16Array(count*6);
      for(let l=0;l<count;l++){
        const x=Math.random(),z=Math.random(),r=Math.random();
        for(let v=0;v<4;v++){position.set([x,0,z],(l*4+v)*3);offset.set([v===0||v===1?1:0,v===0||v===3?1:0],(l*4+v)*2);random[l*4+v]=r;}
        index.set([l*4,l*4+3,l*4+2,l*4+2,l*4+1,l*4],l*6);
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(position,3));geo.setAttribute('offset',new T.BufferAttribute(offset,2));geo.setAttribute('random',new T.BufferAttribute(random,1));geo.setIndex(new T.BufferAttribute(index,1));
      const mat=new T.ShaderMaterial({uniforms:rainU,transparent:true,side:T.DoubleSide,
        vertexShader:`
          attribute vec2 offset;attribute float random;uniform float thickness,elevation,incline,size,len,localTime,visibleRatio;uniform vec2 center;
          varying vec4 vClip;varying float vDist;
          void main(){vec3 p=position;vec2 tangent=vec2(.707,-.707);
            p.xz*=size;p.xz-=center;float halfSize=size*.5;p.x=mod(p.x+halfSize,size)-halfSize;p.z=mod(p.z+halfSize,size)-halfSize;p.xz+=center;
            p.xz+=tangent*offset.x*thickness;
            float progress=mod(localTime+random,1.);
            p.y=elevation+len;p.y-=len*(1.-offset.y);p.y-=progress*(elevation+len);p.y=clamp(p.y,0.,elevation);
            p.y+=step(visibleRatio,fract(random*99.))*99.;
            p.xz+=tangent*p.y*incline*-1.;p.y-=.3;
            ${OUT}}`,
        fragmentShader:SHADE+'void main(){gl_FragColor=vec4(motriShade(vec3(1.),vec3(0.,1.,0.),0.),1.);}'});
      const m=new T.Mesh(geo,mat);m.frustumCulled=false;m.renderOrder=1;root.add(m);return m;
    })();

    /* ---------- Snow.js: snow that builds up on the ground in noisy drifts, with glitter ---------- */
    const snowU={...U,snowElevation:{value:-1},center:{value:new T.Vector2()}};
    const snowGround=(()=>{
      const geo=new T.PlaneGeometry(60,60,160,160).rotateX(-Math.PI/2);
      const mat=new T.ShaderMaterial({uniforms:snowU,transparent:true,
        vertexShader:`
          uniform sampler2D uPerlin;uniform float snowElevation;uniform vec2 center;varying vec4 vClip;varying float vDist;varying float vDelta;varying vec2 vWorld;
          float elev(vec2 p){return snowElevation+smoothstep(0.,1.,texture2D(uPerlin,p*.1).r*texture2D(uPerlin,p*.07).r);}
          void main(){vec3 p=position;p.xz+=center;float e=elev(p.xz);vDelta=e;vWorld=p.xz;
            // Drifts stay low so Dahrooj can still roll: a quarter of Motri's height.
            p.y=max(e,0.)*.25+.01;${OUT}}`,
        fragmentShader:SHADE+`
          uniform sampler2D uPerlin;uniform float uTime;varying float vDelta;varying vec2 vWorld;`+TRACK+`
          float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          // Dug out where balls rolled through.
          void main(){float alpha=smoothstep(.022,.5,vDelta)*(1.-trackAt(vWorld)*.9);if(alpha<.1)discard;
            vec3 col=motriShade(vec3(1.),vec3(0.,1.,0.),0.);
            float glitter=abs(mod(hash(floor(vWorld*.2*64.))*2.+uTime*.024,2.)-1.)*clamp(texture2D(uPerlin,vWorld*.05).r*2.,0.,1.);
            col+=pow(glitter,1000.)*2.;gl_FragColor=vec4(col,alpha);}`});
      const m=new T.Mesh(geo,mat);m.frustumCulled=false;m.visible=false;root.add(m);return m;
    })();

    /* ---------- Weather.js on Cycles: temperature, humidity, clouds, wind, rain and snow ---------- */
    const noise=x=>Math.sin(x)*Math.sin(x*1.678)*Math.sin(x*2.345);
    const state={time:'auto',weather:'auto',day:{},year:{},w:{}};
    const FIXED={day:.08,dusk:.25,night:.47,dawn:.8};
    let saved=null,lastDay=Date.now()/1000/DAY_SECONDS;
    // Night lights: moonlight from above and a soft warm lantern that follows the player.
    const moon=new T.DirectionalLight(0xc9d4ff,0);moon.position.set(-6,14,6);root.add(moon,moon.target);
    const lantern=new T.PointLight(0xffd9a0,0,16,1.6);root.add(lantern);
    const api={
      root,
      // The stone reaches from behind the player to just past the target at farZ.
      setPitch(farZ){const z0=farZ-1.5,z1=5;U.uSlab.value.set(court.x,(z0+z1)/2,9,(z1-z0)/2);},
      // Press a track at (x, z): radius in metres, strength 0–1.
      mark(x,z,radius,strength){
        const u=(x-court.x)/TRACK_SIZE+.5,v=(z-court.z)/TRACK_SIZE+.5;if(u<0||v<0||u>1||v>1)return;
        const px=u*TRACK_PX,py=v*TRACK_PX,r=Math.max(1.5,radius/TRACK_SIZE*TRACK_PX);
        const gr=tctx.createRadialGradient(px,py,0,px,py,r);gr.addColorStop(0,`rgba(255,255,255,${clamp(strength,0,1)})`);gr.addColorStop(1,'rgba(255,255,255,0)');
        tctx.fillStyle=gr;tctx.fillRect(px-r,py-r,r*2,r*2);tracksDirty=true;
      },
      // How pressed the ground is at (x, z), 0–1 (for tests).
      trackAt(x,z){const u=(x-court.x)/TRACK_SIZE+.5,v=(z-court.z)/TRACK_SIZE+.5;if(u<0||v<0||u>1||v>1)return 0;return tctx.getImageData(u*TRACK_PX|0,v*TRACK_PX|0,1,1).data[0]/255;},
      get settings(){return {time:state.time,weather:state.weather};},
      get weather(){return state.w;},
      get treesLoaded(){return treesLoaded;},
      // time: auto | day | dusk | night | dawn; weather: auto | clear | rain | snow
      set({time,weather}={}){if(time)state.time=time;if(weather)state.weather=weather;},
      enable(on){
        if(on===root.visible)return;
        root.visible=on;
        if(on){saved={fog:scene.fog,bg:scene.background,line:lineMat&&[lineMat.color.getHex(),lineMat.opacity],hemi:hemi&&[hemi.color.getHex(),hemi.groundColor.getHex(),hemi.intensity],sun:sun&&[sun.color.getHex(),sun.intensity]};
          scene.fog=new T.Fog(0x9b89ff,20,50);scene.background=null;if(lineMat){lineMat.color.set(0xffffff);lineMat.opacity=.5;}}
        else if(saved){scene.fog=saved.fog;scene.background=saved.bg;
          if(lineMat){lineMat.color.setHex(saved.line[0]);lineMat.opacity=saved.line[1];}
          if(hemi){hemi.color.setHex(saved.hemi[0]);hemi.groundColor.setHex(saved.hemi[1]);hemi.intensity=saved.hemi[2];}
          if(sun){sun.color.setHex(saved.sun[0]);sun.intensity=saved.sun[1];}saved=null;}
      },
      update(dt,eye){
        if(!root.visible)return;
        // Tracks heal over about a minute; upload the canvas a few times a second at most.
        tracksFade+=dt;if(tracksFade>.5){tracksFade=0;tctx.fillStyle='rgba(0,0,0,.02)';tctx.fillRect(0,0,TRACK_PX,TRACK_PX);tracksDirty=true;}
        tracksUpload+=dt;if(tracksDirty&&tracksUpload>.08){tracksUpload=0;tracksDirty=false;trackTex.needsUpdate=true;}
        const now=Date.now()/1000,dayAbs=now/DAY_SECONDS,progressDelta=Math.max(0,dayAbs-lastDay);lastDay=dayAbs;
        const dayP=state.time==='auto'?dayAbs%1:FIXED[state.time],yearP=(now/(60*60*24*365))%1;
        const d=blend(DAY_KEYS,dayP,state.day),y=blend(YEAR_KEYS,yearP,state.year),w=state.w;
        // Weather.js formulas.
        w.temperature=y.temperature+d.temperature+noise(dayAbs*.4)*7.5;
        w.humidity=y.humidity+noise(dayAbs*.36)*.2;
        w.clouds=noise(dayAbs*.44);
        w.wind=noise(dayAbs)*.5+.5;
        w.rain=remapClamp(w.humidity,.65,1,0,1)*remapClamp(w.clouds,0,1,0,1);
        w.snow=remapClamp(w.rain,.05,.3,0,1)*remapClamp(w.temperature,0,-5,0,1)+remapClamp(w.temperature,0,10,0,-1);
        // The menu can force a spell, like Motri's weather override.
        if(state.weather==='clear'){w.rain=0;w.snow=-1;}
        else if(state.weather==='rain'){w.rain=.8;w.snow=-1;w.wind=Math.max(w.wind,.6);}
        else if(state.weather==='snow'){w.rain=.8;w.snow=1;}
        // Lighting and fog.
        U.uLightColor.value.copy(d.lightColor);U.uShadowColor.value.copy(d.shadowColor);
        U.uFogA.value.copy(d.fogColorA);U.uFogB.value.copy(d.fogColorB);
        // A gentler sky than the raw fog colours: a pale horizon and a deep top, greyer when it rains.
        const cloud=clamp(w.rain*1.2,0,1),grey=C('#9aa0b0');
        U.uHorizon.value.copy(d.fogColorA).lerp(C('#ffffff'),.35).lerp(grey,cloud*.5);
        U.uZenith.value.copy(d.fogColorB).lerp(d.fogColorA,.15).lerp(grey.clone().multiplyScalar(.7),cloud*.6);
        const sa=dayP*Math.PI*2;U.uSunDir.value.set(Math.cos(sa)*.6,.25+.5*Math.abs(Math.cos(sa*.5)),-.75).normalize();
        if(eye)sky.position.copy(eye);
        U.uStars.value=(1-cloud)*clamp(Math.min((dayP-.25)/.1,(.7-dayP)/.1),0,1);
        const near=20,amplitude=25;U.uFogNear.value=near+d.fogNearRatio*amplitude;U.uFogFar.value=near+d.fogFarRatio*amplitude;
        scene.fog.color.copy(U.uHorizon.value);scene.fog.near=Math.max(1,U.uFogNear.value);scene.fog.far=U.uFogFar.value+10;
        // The game's own objects take Motri's light too.
        // The game's own models (Dahrooj, the goal, the keeper) take Motri's light, but never go dark:
        // at night a pale moonlight and a warm lantern around the player keep them readable.
        const k=d.lightIntensity>2?1/3:1,night=clamp(Math.min((dayP-.22)/.08,(.75-dayP)/.08),0,1);
        if(hemi){hemi.color.copy(d.lightColor).lerp(C('#ffffff'),.35+night*.25);hemi.groundColor.copy(d.shadowColor).lerp(grassColor,.5).lerp(C('#8c8aa8'),night*.4);
          hemi.intensity=Math.max(.75,.6*d.lightIntensity*k);}
        if(sun){sun.color.copy(d.lightColor).lerp(C('#c9d4ff'),night*.6);sun.intensity=Math.max(.35,.5*d.lightIntensity*k);}
        moon.intensity=night*.45;lantern.intensity=night*1.1;if(eye)lantern.position.set(eye.x,eye.y+.5,eye.z-1.5);
        // Motri's own pieces are lit a little brighter at night too.
        U.uLightIntensity.value=d.lightIntensity*(1-night*.35)+night*.6;
        // Wind.js
        U.uWindStrength.value=remapClamp(w.wind,0,1,.1,1);U.uWindTime.value+=dt*.1*U.uWindStrength.value;
        U.uTime.value+=dt;
        if(eye)U.uCam.value.copy(eye);
        // RainLines.js
        const snowRatio=1-Math.pow(1-Math.max(w.snow,0),4);
        rainU.visibleRatio.value=Math.pow(w.rain,2);
        rainU.len.value=lerp(remapClamp(w.rain,0,1,1,3),.03,snowRatio);
        rainSpeed=lerp(remapClamp(w.rain,0,1,.2,.4),.05,snowRatio);
        rainU.incline.value=remapClamp(w.wind,0,1,.1,.4);
        rain.visible=rainU.visibleRatio.value>.00001;
        if(eye)rainU.center.value.set(eye.x,eye.z);
        rainU.localTime.value+=dt*rainSpeed;
        // Snow.js: the ground layer rises while it snows and melts away otherwise.
        const forced=state.weather==='snow'?dt*.045:state.weather==='clear'||state.weather==='rain'?-dt*.05:0;
        snowU.snowElevation.value=clamp(snowU.snowElevation.value+w.snow*progressDelta*10+forced,-1,.5);
        snowGround.visible=snowU.snowElevation.value>-.9;
        if(eye)snowU.center.value.set(Math.round(eye.x/.375)*.375,Math.round(eye.z/.375)*.375);
      }
    };
    return api;
  };
})();
