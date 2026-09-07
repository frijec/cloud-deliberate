/* ============================================================
   CONSID · CLOUD DELIBERATE — hero wave grid.

   A heightfield of pillars rippling out from the pointer, crested
   in --coral. Lifted verbatim from the sibling site, where it lived
   inline in index.html; kept because it earns its place harder on
   this site than on that one — the principles section here is
   headed "Pejlemærker i et landskab i bevægelse", and this is that
   landscape.

   Loaded only by index.html. Self-guarding: no-ops without the
   canvas, without WebGL2, or under prefers-reduced-motion.
   ============================================================ */
const REDUCED_HERO = matchMedia('(prefers-reduced-motion: reduce)').matches;
/* Hero wave grid — a from-scratch WebGL2 port of franky-adl's
   "3d-wave-grid" (https://github.com/franky-adl/3d-wave-grid).
   Same mechanic: a grid of thin pillars under a near-top-down
   camera, rippled by an expanding Gaussian wavefront seeded by
   the pointer trail (with idle random ripples after 3s of rest),
   coloured from a light base up to the Consid peach accent at
   each ripple's crest. Reimplemented in raw WebGL instead of
   three.js, since Artifacts can't load external script hosts —
   the CSP here only permits Google Fonts, nothing else. Grid
   density and trail length are tuned down from the original
   (which targets a full-screen piece) since this is a background
   element behind hero copy, not the page's focal point. */
(function(){
  const canvas=document.getElementById('heroGrid');
  if(!canvas||REDUCED_HERO)return;
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true});
  if(!gl)return;
  const hero=document.getElementById('top');
  const css=getComputedStyle(document.documentElement);
  const tok=n=>css.getPropertyValue(n).trim();
  const hexToRgb01=h=>{h=(h||'#ffffff').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]};
  const COLOR_BASE=hexToRgb01(tok('--air')||'#F5F3F1');
  const COLOR_HIGH=hexToRgb01(tok('--coral')||'#F49E88');

  /* ---- params (ported from Stage.js, scaled for a hero backdrop) ---- */
  const GRID_X=42, GRID_Z=20;
  const CUBE_W=0.8, CUBE_H=2.4, GAP=0.02;
  const SPACING=CUBE_W+GAP;
  const BOUNDS_X=GRID_X*SPACING, BOUNDS_Z=GRID_Z*SPACING;
  // Wave speed halved (and fade time doubled to match) so ripples travel
  // just as far but take twice as long getting there — slower motion,
  // not just a smaller effect. Reads as calmer rather than clipped.
  const WAVE_AMP=0.5, WAVE_SPEED=3.0, WAVE_FREQ=1.2, WAVE_WIDTH=3.0, WAVE_JITTER=0.2, WAVE_MAXH=0.45;
  const FADE_TIME=4.0, TRAIL_SPACING=0.12, MAX_TRAIL=48;
  const CAM_RADIUS=21, CAM_FOV=42*Math.PI/180, ALPHA_RANGE=Math.PI*0.03, BETA_RANGE=Math.PI*0.05;

  /* ---- tiny mat4 helpers (no library) ---- */
  const m4={
    perspective(fov,aspect,near,far){
      const f=1/Math.tan(fov/2), out=new Float32Array(16);
      out[0]=f/aspect;out[5]=f;out[11]=-1;
      out[10]=(far+near)/(near-far);out[14]=(2*far*near)/(near-far);
      return out;
    },
    multiply(a,b){
      const o=new Float32Array(16);
      for(let r=0;r<4;r++)for(let c=0;c<4;c++){
        let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];
        o[c*4+r]=s;
      }
      return o;
    }
  };

  /* Camera basis: mirrors Camera.js's orbit formula + lookAt(0,0,0), up=(0,0,-1) */
  function cameraBasis(mx,my){
    const alpha=my*ALPHA_RANGE, beta=mx*BETA_RANGE;
    const eye=[
      -CAM_RADIUS*Math.cos(alpha)*Math.sin(beta),
       CAM_RADIUS*Math.cos(alpha)*Math.cos(beta),
       CAM_RADIUS*Math.sin(alpha)
    ];
    const upHint=[0,0,-1];
    const fwd=norm([-eye[0],-eye[1],-eye[2]]);
    let right=cross(fwd,upHint); right=norm(right);
    const up=cross(right,fwd);
    return {eye,fwd,right,up};
  }
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]}
  function norm(v){const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l]}
  function viewMatrixFromBasis(eye,right,up,fwd){
    // Standard lookAt view matrix: rotation (row-major basis) + translation.
    const back=[-fwd[0],-fwd[1],-fwd[2]];
    const out=new Float32Array(16);
    out[0]=right[0];out[4]=right[1];out[8]=right[2];
    out[1]=up[0];   out[5]=up[1];   out[9]=up[2];
    out[2]=back[0]; out[6]=back[1]; out[10]=back[2];
    out[15]=1;
    out[12]=-(right[0]*eye[0]+right[1]*eye[1]+right[2]*eye[2]);
    out[13]=-(up[0]*eye[0]+up[1]*eye[1]+up[2]*eye[2]);
    out[14]=-(back[0]*eye[0]+back[1]*eye[1]+back[2]*eye[2]);
    return out;
  }

  /* ---- geometry: one unit box, only top vertices tagged y>0 so the
     shader can lift just the top face (a "telescoping pillar" look) ---- */
  function buildBox(w,h,d){
    const x=w/2,y=h/2,z=d/2;
    const faces=[
      // positions(3) normal(3) per vertex, 2 tris per face
      [[-x,-y, z],[ x,-y, z],[ x, y, z], [-x,-y, z],[ x, y, z],[-x, y, z]].map(p=>[...p,0,0,1]),
      [[ x,-y,-z],[-x,-y,-z],[-x, y,-z], [ x,-y,-z],[-x, y,-z],[ x, y,-z]].map(p=>[...p,0,0,-1]),
      [[-x,-y,-z],[-x,-y, z],[-x, y, z], [-x,-y,-z],[-x, y, z],[-x, y,-z]].map(p=>[...p,-1,0,0]),
      [[ x,-y, z],[ x,-y,-z],[ x, y,-z], [ x,-y, z],[ x, y,-z],[ x, y, z]].map(p=>[...p,1,0,0]),
      [[-x, y, z],[ x, y, z],[ x, y,-z], [-x, y, z],[ x, y,-z],[-x, y,-z]].map(p=>[...p,0,1,0]),
      [[-x,-y,-z],[ x,-y,-z],[ x,-y, z], [-x,-y,-z],[ x,-y, z],[-x,-y, z]].map(p=>[...p,0,-1,0]),
    ];
    const flat=[];
    faces.forEach(f=>f.forEach(v=>flat.push(...v)));
    return new Float32Array(flat);
  }

  const VERT_SRC=`#version 300 es
  layout(location=0) in vec3 aPosition;
  layout(location=1) in vec3 aNormal;
  layout(location=2) in vec2 aOffset;
  uniform mat4 uProj, uView;
  uniform vec4 uTrail[${MAX_TRAIL}];
  uniform int uTrailCount;
  uniform float uWaveSpeed,uWaveFreq,uWaveWidth,uFadeTime,uAmplitude,uJitter,uMaxHeight;
  out float vHeight; out vec3 vNormal;
  vec2 hash2(vec2 p){
    p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));
    return fract(sin(p)*43758.5453123)-0.5;
  }
  void main(){
    vec3 pos=aPosition; float height=0.0;
    if(pos.y>0.0){
      vec2 jitter=hash2(aOffset)*uJitter;
      vec2 worldXZ=aOffset+jitter;
      float waveHeight=0.0, totalWeight=0.0;
      for(int i=0;i<uTrailCount;i++){
        vec4 td=uTrail[i];
        float dist=length(worldXZ-td.xy);
        float wavefront=uWaveSpeed*td.z;
        float relDist=dist-wavefront;
        float window=exp(-(relDist*relDist)/(uWaveWidth*uWaveWidth));
        float fade=exp(-td.z/uFadeTime);
        float atten=1.0/(1.0+dist*0.1);
        float weight=fade*window*atten*td.w;
        waveHeight+=weight*cos(uWaveFreq*relDist);
        totalWeight+=weight;
      }
      waveHeight/=max(totalWeight,1.0);
      height=clamp(waveHeight*uAmplitude,-uMaxHeight,uMaxHeight);
      pos.y+=height;
    }
    vHeight=height; vNormal=aNormal;
    vec3 worldPos=pos+vec3(aOffset.x,0.0,aOffset.y);
    gl_Position=uProj*uView*vec4(worldPos,1.0);
  }`;

  const FRAG_SRC=`#version 300 es
  precision highp float;
  in float vHeight; in vec3 vNormal;
  uniform vec3 uColorBase,uColorHigh,uLight1,uLight2;
  uniform float uMaxHeight;
  out vec4 fragColor;
  void main(){
    float t=clamp(vHeight/uMaxHeight,0.0,1.0);
    vec3 base=mix(uColorBase,uColorHigh,t);
    float d1=max(dot(normalize(vNormal),uLight1),0.0);
    float d2=max(dot(normalize(vNormal),uLight2),0.0);
    float lit=0.62+d1*0.5+d2*0.18;
    fragColor=vec4(base*lit, 0.92);
  }`;

  function compile(type,src){
    const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.warn(gl.getShaderInfoLog(s));return null}
    return s;
  }
  const vs=compile(gl.VERTEX_SHADER,VERT_SRC), fs=compile(gl.FRAGMENT_SHADER,FRAG_SRC);
  if(!vs||!fs)return;
  const prog=gl.createProgram();
  gl.attachShader(prog,vs);gl.attachShader(prog,fs);gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS)){console.warn(gl.getProgramInfoLog(prog));return}

  const boxData=buildBox(CUBE_W,CUBE_H,CUBE_W);
  const vertCount=boxData.length/6;
  const boxBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,boxBuf);gl.bufferData(gl.ARRAY_BUFFER,boxData,gl.STATIC_DRAW);

  const offsets=new Float32Array(GRID_X*GRID_Z*2);
  {
    let k=0;
    const offX=((GRID_X-1)*SPACING)/2, offZ=((GRID_Z-1)*SPACING)/2;
    for(let i=0;i<GRID_X;i++)for(let j=0;j<GRID_Z;j++){
      offsets[k++]=i*SPACING-offX;
      offsets[k++]=j*SPACING-offZ;
    }
  }
  const instCount=GRID_X*GRID_Z;
  const offBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,offBuf);gl.bufferData(gl.ARRAY_BUFFER,offsets,gl.STATIC_DRAW);

  const vao=gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,boxBuf);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
  gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
  gl.bindBuffer(gl.ARRAY_BUFFER,offBuf);
  gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,2,gl.FLOAT,false,8,0);
  gl.vertexAttribDivisor(2,1);
  gl.bindVertexArray(null);

  const U={};
  ['uProj','uView','uTrailCount','uWaveSpeed','uWaveFreq','uWaveWidth','uFadeTime','uAmplitude','uJitter','uMaxHeight','uColorBase','uColorHigh','uLight1','uLight2'].forEach(n=>U[n]=gl.getUniformLocation(prog,n));
  const uTrailLoc=gl.getUniformLocation(prog,'uTrail[0]');

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);

  /* ---- dithering post-process: ordered (Bayer 4x4) dithering, ported
     from niccolofanton/dithering-shader, run as an offscreen-FBO +
     fullscreen-quad pass so every 3D element on the page (this grid, the
     thesis/level-picker three.js scenes, the CTA noise) shares one look. */
  // Same dot pitch as the 3D models, so the whole page shares one screen.
  // The levels values have to differ though: this grid is drawn in
  // near-white --air lifted by a 0.62..1.13 lighting term, so its luminance
  // only ever occupies roughly 0.42..1.05. Fed to the Bayer thresholds raw
  // it reads as "all highlight" and dithers away to nothing, so the range
  // is stretched back out to 0..1 before thresholding.
  const DITHER_GRID=2, DITHER_PIXEL_RATIO=1;
  const DITHER_BIAS=0.47, DITHER_GAIN=1.85, DITHER_GAMMA=0.9;
  const DITHER_FS=`#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uScene;
  uniform vec2 uResolution;
  uniform float uGridSize;
  uniform float uPixelSize;
  uniform float uGain;
  uniform float uBias;
  uniform float uGamma;
  uniform vec3 uInk;
  out vec4 fragColor;
  bool ditherOn(float brightness,vec2 cell){
    if(brightness>16.0/17.0)return false;
    if(brightness<1.0/17.0)return true;
    vec2 p=mod(cell,4.0);
    int x=int(p.x); int y=int(p.y);
    if(x==0){
      if(y==0)return brightness<16.0/17.0;
      if(y==1)return brightness<5.0/17.0;
      if(y==2)return brightness<13.0/17.0;
      return brightness<1.0/17.0;
    }else if(x==1){
      if(y==0)return brightness<8.0/17.0;
      if(y==1)return brightness<12.0/17.0;
      if(y==2)return brightness<4.0/17.0;
      return brightness<9.0/17.0;
    }else if(x==2){
      if(y==0)return brightness<14.0/17.0;
      if(y==1)return brightness<2.0/17.0;
      if(y==2)return brightness<15.0/17.0;
      return brightness<3.0/17.0;
    }else{
      if(y==0)return brightness<6.0/17.0;
      if(y==1)return brightness<10.0/17.0;
      if(y==2)return brightness<7.0/17.0;
      return brightness<11.0/17.0;
    }
  }
  void main(){
    vec2 fragCoord=vUv*uResolution;
    vec2 pixelCell=floor(fragCoord/uPixelSize);
    vec2 ditherCell=floor(fragCoord/uGridSize);
    vec3 colorSum=vec3(0.0); float alphaSum=0.0;
    for(int i=0;i<3;i++){
      for(int j=0;j<3;j++){
        vec2 offs=(vec2(float(i),float(j))+0.5)/3.0*uPixelSize;
        vec4 s=texture(uScene,(pixelCell*uPixelSize+offs)/uResolution);
        colorSum+=s.rgb*s.a; alphaSum+=s.a;
      }
    }
    float avgAlpha=alphaSum/9.0;
    vec3 avgColor=alphaSum>0.001?colorSum/alphaSum:vec3(0.0);
    float lum=dot(avgColor,vec3(0.2126,0.7152,0.0722));
    float brightness=pow(clamp((lum-uBias)*uGain,0.0,1.0),uGamma);
    // 1-bit, same as the models: ink or bare page, tone from dot density.
    bool on=ditherOn(brightness,ditherCell);
    fragColor=on?vec4(uInk,min(1.0,avgAlpha*1.7)):vec4(0.0);
  }`;
  const DITHER_VS=`#version 300 es
  layout(location=0) in vec2 aPos;
  out vec2 vUv;
  void main(){ vUv=aPos*0.5+0.5; gl_Position=vec4(aPos,0.0,1.0); }`;
  const dvs=compile(gl.VERTEX_SHADER,DITHER_VS), dfs=compile(gl.FRAGMENT_SHADER,DITHER_FS);
  const ditherProg=gl.createProgram();
  gl.attachShader(ditherProg,dvs);gl.attachShader(ditherProg,dfs);gl.linkProgram(ditherProg);
  const ditherU={};
  ['uScene','uResolution','uGridSize','uPixelSize','uGain','uBias','uGamma','uInk']
    .forEach(n=>ditherU[n]=gl.getUniformLocation(ditherProg,n));
  // Neutral grey, not crimson: this is backdrop behind the headline, so it
  // stays greyscale and lets the crimson-inked 3D models carry the colour.
  const DITHER_INK=hexToRgb01(tok('--graphite')||'#636166');
  const quadBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1, 3,-1, -1,3]),gl.STATIC_DRAW);
  const quadVao=gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER,quadBuf);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.bindVertexArray(null);
  let sceneTex=null, sceneFbo=null, fboW=0, fboH=0;
  function ensureFbo(w,h){
    if(sceneFbo && fboW===w && fboH===h)return;
    fboW=w;fboH=h;
    if(sceneTex)gl.deleteTexture(sceneTex);
    if(sceneFbo)gl.deleteFramebuffer(sceneFbo);
    sceneTex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,sceneTex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    sceneFbo=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,sceneFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,sceneTex,0);
    const depthRb=gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER,depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depthRb);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }

  /* ---- pointer trail (JS-side ray/plane intersection, no matrix invert needed:
     view-space ray direction from the symmetric FOV, rotated by the camera's own
     basis vectors which we already build for the view matrix). ---- */
  let mouseX=0, mouseY=0, lerpedX=0, lerpedY=0;
  let ndcX=0, ndcY=0;
  const trail=[]; let lastPoint=null;
  let timeSinceMove=0, placingRandom=true, randomTimer=0;

  function addPoint(x,z,distDelta){
    if(trail.length>=MAX_TRAIL)trail.shift();
    trail.push({x,z,age:0,distDelta});
  }
  function onPointerMove(e){
    const r=canvas.getBoundingClientRect();
    ndcX=((e.clientX-r.left)/r.width)*2-1;
    ndcY=-((e.clientY-r.top)/r.height)*2+1;
    mouseX=ndcX; mouseY=ndcY;
    const {eye,fwd,right,up}=cameraBasis(lerpedX,lerpedY);
    const aspect=w/h, tanF=Math.tan(CAM_FOV/2);
    const dx=ndcX*tanF*aspect, dy=ndcY*tanF;
    const dir=norm([
      fwd[0]+dx*right[0]+dy*up[0],
      fwd[1]+dx*right[1]+dy*up[1],
      fwd[2]+dx*right[2]+dy*up[2],
    ]);
    if(Math.abs(dir[1])<1e-5)return;
    const t=-eye[1]/dir[1];
    if(t<0)return;
    const x=eye[0]+t*dir[0], z=eye[2]+t*dir[2];
    let distDelta=0;
    if(lastPoint){
      const ddx=x-lastPoint.x, ddz=z-lastPoint.z;
      distDelta=Math.hypot(ddx,ddz);
      if(distDelta<TRAIL_SPACING)return;
    }
    addPoint(x,z,distDelta);
    lastPoint={x,z};
    timeSinceMove=0; placingRandom=false; randomTimer=0;
  }
  // Listen on the hero container, not the canvas — headline, buttons and the
  // stat card sit visually on top and would otherwise catch the pointermove
  // first and stop it from ever reaching the canvas underneath. Listening on
  // a shared ancestor lets the grid "feel" the mouse through any of them,
  // since the event still bubbles up regardless of which child it hit.
  hero.addEventListener('pointermove',onPointerMove);

  let w=0,h=0,dpr=1;
  function resize(){
    const r=hero.getBoundingClientRect();
    w=r.width;h=r.height;dpr=Math.min(devicePixelRatio||1,1.75);
    canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));
    canvas.style.width=w+'px';canvas.style.height=h+'px';
    gl.viewport(0,0,canvas.width,canvas.height);
    ensureFbo(canvas.width,canvas.height);
  }

  const trailFloats=new Float32Array(MAX_TRAIL*4);
  let raf=null, running=false, lastT=performance.now();

  function frame(now){
    const delta=Math.min(0.05,(now-lastT)/1000); lastT=now;

    // age & prune
    const expiry=FADE_TIME*4;
    for(let i=trail.length-1;i>=0;i--){trail[i].age+=delta; if(trail[i].age>expiry)trail.splice(i,1)}
    timeSinceMove+=delta;
    if(timeSinceMove>=3.0 && !placingRandom){placingRandom=true;randomTimer=0}
    if(placingRandom){
      randomTimer+=delta;
      if(randomTimer>=2.2){
        const rx=(Math.random()*0.5-0.25)*BOUNDS_X, rz=(Math.random()*0.5-0.25)*BOUNDS_Z;
        addPoint(rx,rz,0.8+Math.random()*0.2);
        randomTimer=0;
      }
    }

    lerpedX+=(mouseX-lerpedX)*0.04; lerpedY+=(mouseY-lerpedY)*0.04;
    const {eye,fwd,right,up}=cameraBasis(lerpedX,lerpedY);
    const view=viewMatrixFromBasis(eye,right,up,fwd);
    const proj=m4.perspective(CAM_FOV,w/Math.max(1,h),0.1,200);

    const count=Math.min(trail.length,MAX_TRAIL);
    for(let i=0;i<count;i++){
      const p=trail[i], o=i*4;
      trailFloats[o]=p.x;trailFloats[o+1]=p.z;trailFloats[o+2]=p.age;trailFloats[o+3]=p.distDelta;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER,sceneFbo);
    gl.viewport(0,0,fboW,fboH);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(U.uProj,false,proj);
    gl.uniformMatrix4fv(U.uView,false,view);
    gl.uniform4fv(uTrailLoc,trailFloats);
    gl.uniform1i(U.uTrailCount,count);
    gl.uniform1f(U.uWaveSpeed,WAVE_SPEED);
    gl.uniform1f(U.uWaveFreq,WAVE_FREQ);
    gl.uniform1f(U.uWaveWidth,WAVE_WIDTH);
    gl.uniform1f(U.uFadeTime,FADE_TIME);
    gl.uniform1f(U.uAmplitude,WAVE_AMP);
    gl.uniform1f(U.uJitter,WAVE_JITTER);
    gl.uniform1f(U.uMaxHeight,WAVE_MAXH);
    gl.uniform3fv(U.uColorBase,COLOR_BASE);
    gl.uniform3fv(U.uColorHigh,COLOR_HIGH);
    gl.uniform3fv(U.uLight1,norm([-0.6,1,0.3]));
    gl.uniform3fv(U.uLight2,norm([0.5,0.4,-0.4]));

    gl.bindVertexArray(vao);
    gl.drawArraysInstanced(gl.TRIANGLES,0,vertCount,instCount);
    gl.bindVertexArray(null);

    // dithering pass: FBO texture -> screen, through the Bayer post-process
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(ditherProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,sceneTex);
    gl.uniform1i(ditherU.uScene,0);
    gl.uniform2f(ditherU.uResolution,fboW,fboH);
    gl.uniform1f(ditherU.uGridSize,DITHER_GRID*dpr);
    gl.uniform1f(ditherU.uPixelSize,DITHER_GRID*DITHER_PIXEL_RATIO*dpr);
    gl.uniform1f(ditherU.uGain,DITHER_GAIN);
    gl.uniform1f(ditherU.uBias,DITHER_BIAS);
    gl.uniform1f(ditherU.uGamma,DITHER_GAMMA);
    gl.uniform3fv(ditherU.uInk,DITHER_INK);
    gl.bindVertexArray(quadVao);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.bindVertexArray(null);

    if(running)raf=requestAnimationFrame(frame);
  }
  function start(){if(running)return;running=true;lastT=performance.now();raf=requestAnimationFrame(frame)}
  function stop(){running=false;if(raf)cancelAnimationFrame(raf)}

  resize();
  start(); // hero is on-screen at first paint, so start eagerly — the
           // observer below only needs to pause/resume it after that
  const io=new IntersectionObserver(es=>{es.forEach(en=>en.isIntersecting?start():stop())},{threshold:0});
  io.observe(hero);
  addEventListener('resize',()=>{const was=running;stop();resize();frame(performance.now());if(was)start()},{passive:true});
})();
