/* ============================================================
   CONSID · CLOUD DELIBERATE — hero clouds.

   A field of clouds drifting behind the headline, run through the
   site's own dithered-halftone look. Replaces the wave-grid pillar
   heightfield this site inherited from the sibling site — pillars
   made sense there, not here.

   Not a port of github.com/FarazzShaikh/three-volumetric-clouds,
   even though that repo is where the idea started. That project is
   archived, its own README calls it "not intended for production
   use," and it's a genuine Nubis/Guerrilla-Games-style volumetric
   renderer: baked 3D Perlin-Worley noise textures, adaptive
   raymarching, multiscatter + anisotropic lighting, composited
   against a scene depth buffer — built as a React/Vite/TypeScript
   app, not a module you drop in. Adapting it would mean rewriting
   nearly all of it.

   More to the point: this site's Bayer dither pass reduces every
   3D element to a hard, 1-bit per-pixel decision — ink or nothing.
   All the soft volumetric light-transport that library computes
   gets discarded the instant it hits that threshold. Spending GPU
   budget on realistic scattering only to throw it away one step
   later solves a problem this pipeline doesn't have.

   So: the pillar shader already rendered its scene into an offscreen
   texture and ran it through the exact same Bayer post-process used
   everywhere else on the site (dither.js's small 3D marks, the CTA
   noise). That pipeline needed no changes — only what gets drawn
   into the scene texture does. Here that's two layers of drifting
   fractal noise (a coverage field, not a raymarch), shaped into a
   cloud band and coloured light-to-coral the same way the pillars
   went base-to-crest. Costs a fraction of a real raymarch and reads
   as the same halftone-cloud family as the rest of the page.

   No pointer interaction — a mouse-chasing ripple made sense for a
   ground-plane wave grid; it doesn't for ambient sky. Pure time
   drift instead, matching "et landskab i bevægelse" in the copy
   right below it.

   Loaded only by index.html. Self-guarding: no-ops without the
   canvas, without WebGL2, or under prefers-reduced-motion.
   ============================================================ */
const REDUCED_HERO = matchMedia('(prefers-reduced-motion: reduce)').matches;
(function(){
  const canvas=document.getElementById('heroClouds');
  if(!canvas||REDUCED_HERO)return;
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true});
  if(!gl)return;
  const hero=document.getElementById('top');
  const css=getComputedStyle(document.documentElement);
  const tok=n=>css.getPropertyValue(n).trim();
  const hexToRgb01=h=>{h=(h||'#ffffff').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]};
  // Same base/crest pairing the pillar grid used: --air (near-white, low
  // luminance contribution) at zero coverage, --coral (mid-toned, so it
  // dithers to a real dot pattern rather than solid fill) at full coverage.
  const COLOR_BASE=hexToRgb01(tok('--air')||'#F5F3F1');
  const COLOR_HIGH=hexToRgb01(tok('--coral')||'#F49E88');

  function compile(type,src){
    const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.warn(gl.getShaderInfoLog(s));return null}
    return s;
  }

  /* ---- scene pass: a fullscreen triangle sampling a two-layer fractal
     noise field, shaped into a drifting cloud band. No camera, no
     geometry — a background texture doesn't need real 3D, and every
     3D element on this page gets flattened to 1-bit ink by the dither
     pass two steps from now regardless. ---- */
  const VERT_SRC=`#version 300 es
  layout(location=0) in vec2 aPos;
  out vec2 vUv;
  void main(){ vUv=aPos*0.5+0.5; gl_Position=vec4(aPos,0.0,1.0); }`;

  const FRAG_SRC=`#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform float uTime,uAspect;
  uniform vec3 uColorBase,uColorHigh;
  out vec4 fragColor;

  float hash(vec2 p){
    p=fract(p*vec2(123.34,456.21));
    p+=dot(p,p+45.32);
    return fract(p.x*p.y);
  }
  float valueNoise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
    vec2 u=f*f*(3.0-2.0*f);
    return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
  }
  // Slight rotation each octave avoids the axis-aligned streaking a
  // plain doubling of frequency leaves behind.
  const mat2 OCTAVE_ROT=mat2(0.8,0.6,-0.6,0.8);
  float fbm(vec2 p){
    float v=0.0, a=0.5;
    for(int i=0;i<5;i++){
      v+=a*valueNoise(p);
      p=OCTAVE_ROT*p*2.02;
      a*=0.5;
    }
    return v;
  }

  void main(){
    vec2 uv=vUv; uv.x*=uAspect;

    // One large-scale field carries the shape — where the clumps are —
    // and dominates the mix; a second, finer field is added at low
    // weight for wisp texture without diluting the first field's own
    // contrast back down to an even haze. A cheap stand-in for parallax
    // depth: the first reads as the nearer, larger formation, the
    // second as faster-moving wisps threaded through it.
    vec2 windA=vec2(uTime*0.015, uTime*0.003);
    vec2 windB=vec2(uTime*-0.009, uTime*0.006);
    float shape=fbm(uv*1.05+windA);
    float wisp=fbm(uv*3.0-windB+vec2(9.2,1.7));
    float density=shape*0.85+wisp*0.25;

    // A band, not wallpaper: coverage fades out approaching the top and
    // bottom of the hero rather than filling it edge to edge.
    float envelope=smoothstep(0.02,0.30,uv.y)*(1.0-smoothstep(0.55,0.95,uv.y));
    density*=envelope;

    // Threshold band picked by sampling the field's real value
    // distribution (median ~0.47 before the envelope) rather than
    // guessing and re-screenshotting: this puts average coverage
    // around 30%, clumped rather than an even haze.
    float coverage=smoothstep(0.32,0.48,density);
    vec3 color=mix(uColorBase,uColorHigh,clamp(coverage*1.15,0.0,1.0));
    fragColor=vec4(color,coverage);
  }`;

  const vs=compile(gl.VERTEX_SHADER,VERT_SRC), fs=compile(gl.FRAGMENT_SHADER,FRAG_SRC);
  if(!vs||!fs)return;
  const prog=gl.createProgram();
  gl.attachShader(prog,vs);gl.attachShader(prog,fs);gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS)){console.warn(gl.getProgramInfoLog(prog));return}
  const U={};
  ['uTime','uAspect','uColorBase','uColorHigh'].forEach(n=>U[n]=gl.getUniformLocation(prog,n));

  const sceneBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,sceneBuf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1, 3,-1, -1,3]),gl.STATIC_DRAW);
  const sceneVao=gl.createVertexArray();
  gl.bindVertexArray(sceneVao);
  gl.bindBuffer(gl.ARRAY_BUFFER,sceneBuf);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.bindVertexArray(null);

  /* ---- dithering post-process: ordered (Bayer 4x4) dithering, verbatim
     from the pillar shader this file replaces — same offscreen-FBO +
     fullscreen-quad pass so this still shares one look with every other
     3D element on the page (dither.js's small marks, the CTA noise). ---- */
  const DITHER_GRID=2, DITHER_PIXEL_RATIO=1;
  const DITHER_BIAS=0.5, DITHER_GAIN=2.2, DITHER_GAMMA=0.85;
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
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }

  let w=0,h=0,dpr=1;
  function resize(){
    const r=hero.getBoundingClientRect();
    w=r.width;h=r.height;dpr=Math.min(devicePixelRatio||1,1.75);
    canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));
    canvas.style.width=w+'px';canvas.style.height=h+'px';
    gl.viewport(0,0,canvas.width,canvas.height);
    ensureFbo(canvas.width,canvas.height);
  }

  let raf=null, running=false, t0=performance.now();
  function frame(now){
    const t=(now-t0)/1000;

    gl.bindFramebuffer(gl.FRAMEBUFFER,sceneFbo);
    gl.viewport(0,0,fboW,fboH);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniform1f(U.uTime,t);
    gl.uniform1f(U.uAspect,w/Math.max(1,h));
    gl.uniform3fv(U.uColorBase,COLOR_BASE);
    gl.uniform3fv(U.uColorHigh,COLOR_HIGH);
    gl.bindVertexArray(sceneVao);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.bindVertexArray(null);

    // dithering pass: FBO texture -> screen, through the Bayer post-process
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.viewport(0,0,canvas.width,canvas.height);
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
  function start(){if(running)return;running=true;raf=requestAnimationFrame(frame)}
  function stop(){running=false;if(raf)cancelAnimationFrame(raf)}

  resize();
  start(); // hero is on-screen at first paint, so start eagerly — the
           // observer below only needs to pause/resume it after that
  const io=new IntersectionObserver(es=>{es.forEach(en=>en.isIntersecting?start():stop())},{threshold:0});
  io.observe(hero);
  addEventListener('resize',()=>{const was=running;stop();resize();frame(performance.now());if(was)start()},{passive:true});
})();
