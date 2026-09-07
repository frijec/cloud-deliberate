/* ============================================================
   CONSID · CLOUD DELIBERATE — dithered 3D marks.

   The pipeline (matcap loader, Bayer-dither post process,
   makeIllusScene) is the sibling site's, unchanged: same matcap,
   same shader, same [data-illus="name"] mounting. What is new is
   the SHAPE_BUILDERS registry below — the sibling's vocabulary is
   welded to agentic delivery (a coil climbing through niveauer, a
   Rubik's cube), so this site gets its own set of cloud forms.

   Two rules the sibling site learned the hard way, both of which
   these builders are written around: under 1-bit dither, a flat
   camera-facing surface samples a near-constant matcap value and
   renders as a dead silhouette; and a rotationally symmetric shape
   spun about its own symmetry axis looks completely motionless.
   Animate the tilt instead of the axis.

   No GSAP. Every builder returns a dt => {} updater and animates
   through the loop makeIllusScene already runs.
   ============================================================ */
import * as THREE from './vendor/three.module.min.js';

const REDUCED_ILLUS = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DITHER_GRID = 2, DITHER_PIXEL_RATIO = 1, DITHER_GAIN = 1.0, DITHER_BIAS = 0.0, DITHER_GAMMA = 0.55;
const DITHER_GRAYSCALE = 1;

const illusCss = getComputedStyle(document.documentElement);
const illusTok = n => illusCss.getPropertyValue(n).trim();

const illusRedraws = [];
// Article pages live one level below the repo root (/viden/<slug>.html).
// Resolved against this module rather than the document, so one
// dither.js serves pages at any depth. TextureLoader resolves plain
// relative strings against the DOCUMENT url — which is why the
// sibling site's '../matcap.jpg' works only from a page one level
// down, and why its homepage had to carry a forked copy of this file.
const matcapTex = new THREE.TextureLoader().load(
  new URL('./matcap.jpg', import.meta.url).href,
  () => illusRedraws.forEach(fn => fn())
);
matcapTex.colorSpace = THREE.SRGBColorSpace;

const DITHER_FRAG = `
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uGridSize;
uniform float uPixelSize;
uniform float uGain;
uniform float uBias;
uniform float uGamma;
uniform float uGrayscale;
uniform vec3 uInk;
varying vec2 vUv;

bool ditherOn(float brightness, vec2 cell) {
  if (brightness > 16.0 / 17.0) return false;
  if (brightness < 1.0 / 17.0) return true;
  vec2 p = mod(cell, 4.0);
  int x = int(p.x);
  int y = int(p.y);
  if (x == 0) {
    if (y == 0) return brightness < 16.0 / 17.0;
    if (y == 1) return brightness < 5.0 / 17.0;
    if (y == 2) return brightness < 13.0 / 17.0;
    return brightness < 1.0 / 17.0;
  } else if (x == 1) {
    if (y == 0) return brightness < 8.0 / 17.0;
    if (y == 1) return brightness < 12.0 / 17.0;
    if (y == 2) return brightness < 4.0 / 17.0;
    return brightness < 9.0 / 17.0;
  } else if (x == 2) {
    if (y == 0) return brightness < 14.0 / 17.0;
    if (y == 1) return brightness < 2.0 / 17.0;
    if (y == 2) return brightness < 15.0 / 17.0;
    return brightness < 3.0 / 17.0;
  } else {
    if (y == 0) return brightness < 6.0 / 17.0;
    if (y == 1) return brightness < 10.0 / 17.0;
    if (y == 2) return brightness < 7.0 / 17.0;
    return brightness < 11.0 / 17.0;
  }
}

void main() {
  vec2 fragCoord = vUv * uResolution;
  vec2 pixelCell = floor(fragCoord / uPixelSize);
  vec2 ditherCell = floor(fragCoord / uGridSize);
  vec3 colorSum = vec3(0.0);
  float alphaSum = 0.0;
  for (int i = 0; i < 3; i++) {
    for (int j = 0; j < 3; j++) {
      vec2 offs = (vec2(float(i), float(j)) + 0.5) / 3.0 * uPixelSize;
      vec4 s = texture2D(uScene, (pixelCell * uPixelSize + offs) / uResolution);
      colorSum += s.rgb * s.a;
      alphaSum += s.a;
    }
  }
  float avgAlpha = alphaSum / 9.0;
  vec3 avgColor = alphaSum > 0.001 ? colorSum / alphaSum : vec3(0.0);
  float lum = dot(avgColor, vec3(0.2126, 0.7152, 0.0722));
  float brightness = pow(clamp((lum - uBias) * uGain, 0.0, 1.0), uGamma);
  bool on = ditherOn(brightness, ditherCell);
  vec3 inkCol = mix(avgColor * 0.4, uInk, uGrayscale);
  float outA = min(1.0, avgAlpha * 1.7);
  gl_FragColor = on ? vec4(inkCol, outA) : vec4(0.0);
}
`;
const DITHER_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// getComputedStyle on a plain (unregistered) custom property returns
// its literal specified value, not a resolved colour — fine for a bare
// hex custom property (--crimson) but color-mix(...) comes back as that
// same unparsed function string, which THREE.Color can't read. So the
// lighter-than-plum background tint is computed here instead of via the
// --plum-tint custom property in CSS (kept there too, for any plain-CSS
// use). Lifting lightness in HSL (same hue/saturation as --plum) rather
// than lerping toward white — a straight lerp desaturates fast and reads
// as grey; holding the hue keeps it reading as "lighter plum", not grey.
function resolveInk(inkVar) {
  if (inkVar === 'plum-tint') {
    const base = new THREE.Color(illusTok('--plum') || '#492A34');
    const hsl = {};
    base.getHSL(hsl);
    return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s + 0.1), Math.min(1, hsl.l + 0.3));
  }
  return new THREE.Color(illusTok(inkVar || '--crimson') || '#90263B');
}

function makeIllusScene(container, build, zoom, inkVar) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.set(0, 0, 5);
  camera.zoom = zoom || 1.6;
  camera.updateProjectionMatrix();

  let target = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const ditherScene = new THREE.Scene();
  const ditherCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const ditherMat = new THREE.ShaderMaterial({
    vertexShader: DITHER_VERT,
    fragmentShader: DITHER_FRAG,
    uniforms: {
      uScene: { value: target.texture },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uGridSize: { value: DITHER_GRID },
      uPixelSize: { value: DITHER_GRID * DITHER_PIXEL_RATIO },
      uGain: { value: DITHER_GAIN },
      uBias: { value: DITHER_BIAS },
      uGamma: { value: DITHER_GAMMA },
      uGrayscale: { value: DITHER_GRAYSCALE },
      uInk: { value: resolveInk(inkVar) }
    },
    transparent: true
  });
  ditherScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ditherMat));

  function resize() {
    const w = container.clientWidth || 96, h = container.clientHeight || 96;
    const dpr = renderer.getPixelRatio();
    renderer.setSize(w, h);
    target.setSize(w * dpr, h * dpr);
    ditherMat.uniforms.uResolution.value.set(w * dpr, h * dpr);
    ditherMat.uniforms.uGridSize.value = DITHER_GRID * dpr;
    ditherMat.uniforms.uPixelSize.value = DITHER_GRID * DITHER_PIXEL_RATIO * dpr;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize, { passive: true });

  const update = build(scene) || null;

  let running = false, raf = null, lastT = performance.now();
  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (update && !REDUCED_ILLUS) update(dt);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(ditherScene, ditherCamera);
    if (running) raf = requestAnimationFrame(frame);
  }
  function start() { if (running || REDUCED_ILLUS) return; running = true; lastT = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); }

  frame();
  illusRedraws.push(frame);
  start();
  new IntersectionObserver(es => es.forEach(en => en.isIntersecting ? start() : stop()), { threshold: 0 }).observe(container);
}

const mat = () => new THREE.MeshMatcapMaterial({ matcap: matcapTex });
// DoubleSide for the open shells (bowls). A hemisphere with the default
// FrontSide shows nothing at all once you're looking into it.
const matD = () => new THREE.MeshMatcapMaterial({ matcap: matcapTex, side: THREE.DoubleSide });

// Nudge every vertex in or out along its own normal, so a primitive
// reads as an irregular mass rather than a perfect solid.
function jitterGeo(geo, R, amt) {
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const j = 1 + (Math.random() - 0.5) * amt;
    pos.setXYZ(i, v.x * R * j, v.y * R * j, v.z * R * j);
  }
  geo.computeVertexNormals();
  return geo;
}

/* Camera zoom is derived, not guessed. makeIllusScene uses
   PerspectiveCamera(75, 1, .1, 1000) at z=5, so the visible half-height
   at the origin is 5·tan(37.5°) = 3.837 / zoom. Therefore

       zoom = 3.837 · F / R_max

   where R_max is the shape's furthest extent from the origin and F is
   the fraction of the frame half-height it should fill. F = 0.45 for
   the oversized .ydelse__illus backdrops, where the mark is meant to
   bleed as texture, and F = 0.60 for the small in-flow marks, which sit
   in 112-152px boxes and read as specks at anything lower.
   For jittered shapes R_max is R·(1 + amt/2), not R. */
const SHAPE_ZOOM = {
  drift: 2.85, repatriate: 3.00, handoff: 3.20, tether: 3.10,
  terrain: 2.20, cluster: 2.40, paved: 2.10
};

/* The Ydelse header marks sit on plum and read as background texture,
   so they're tinted a shade lighter than the plum behind them. Every
   other mark stays a crimson foreground accent. */
const SHAPE_INK = {
  terrain: 'plum-tint', cluster: 'plum-tint', paved: 'plum-tint'
};

const SHAPE_BUILDERS = {
  // Cost and configuration getting away from you: a core still spinning
  // while fragments spiral off it the other way.
  drift: scene => {
    const g = new THREE.Group(), m = mat();
    const core = new THREE.Mesh(jitterGeo(new THREE.IcosahedronGeometry(0.46, 2), 0.46, 0.24), m);
    const frags = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = i * 0.9, r = 0.42 + i * 0.045;
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06 + i * 0.012, 1), m);
      f.position.set(Math.cos(a) * r, Math.sin(a) * 0.18, Math.sin(a) * r);
      frags.add(f);
    }
    g.add(core, frags);
    scene.add(g);
    return dt => { core.rotation.x += dt * 0.20; core.rotation.y += dt * 0.28; frags.rotation.y -= dt * 0.16; };
  },

  // Repatriering is a rebalancing, not a retreat — so the payload arcs
  // back and forth between two open bowls rather than landing in one.
  repatriate: scene => {
    const g = new THREE.Group(), m = matD();
    const bowl = () => new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), m);
    const a = bowl(), b = bowl();
    a.position.set(-0.42, -0.10, 0);
    b.position.set(0.42, -0.10, 0);
    const pay = new THREE.Mesh(jitterGeo(new THREE.IcosahedronGeometry(0.16, 2), 0.16, 0.18), mat());
    g.add(a, b, pay);
    scene.add(g);
    let t = 0;
    return dt => {
      t += dt;
      pay.position.set(Math.sin(t * 0.55) * 0.42, -0.02 + Math.abs(Math.cos(t * 0.55)) * 0.26, 0);
      pay.rotation.x += dt * 0.5; pay.rotation.y += dt * 0.4;
      g.rotation.y = Math.sin(t * 0.20) * 0.30;
    };
  },

  // Distributed decisions: two open arcs interlocked but not touching.
  // The orthogonal planes are the point — the silhouette has to keep
  // changing as it turns, or 1-bit dither flattens it to a blob.
  handoff: scene => {
    const g = new THREE.Group(), m = mat();
    const arc = () => new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.055, 10, 48, Math.PI * 1.15), m);
    const a = arc(), b = arc();
    a.position.x = -0.22;
    b.position.x = 0.22;
    b.rotation.set(Math.PI / 2, 0, Math.PI);
    g.add(a, b);
    scene.add(g);
    return dt => { g.rotation.y += dt * 0.30; g.rotation.x += dt * 0.12; };
  },

  // Vendor lock-in: a mass on a taut line to something it can't leave.
  tether: scene => {
    const g = new THREE.Group(), m = mat();
    const blob = new THREE.Mesh(jitterGeo(new THREE.IcosahedronGeometry(0.42, 2), 0.42, 0.12), m);
    blob.position.set(0.22, 0.18, 0);
    const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), m);
    anchor.position.set(-0.30, -0.30, 0);
    const dir = blob.position.clone().sub(anchor.position);
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, dir.length(), 12), m);
    link.position.copy(anchor.position).lerp(blob.position, 0.5);
    link.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    g.add(blob, anchor, link);
    scene.add(g);
    return dt => { g.rotation.y += dt * 0.24; g.rotation.x += dt * 0.10; };
  },

  // Surveying the landscape: a 7x7 field of pillars caught mid-ripple.
  // The hero grid's little brother, and the right metaphor for an
  // assessment — this is the terrain being measured. One material
  // shared across all 49 meshes rather than one allocated per pillar.
  terrain: scene => {
    const g = new THREE.Group(), m = mat();
    const geo = new THREE.BoxGeometry(0.07, 1, 0.07);
    geo.translate(0, 0.5, 0);           // grows upward from y=0, not about its centre
    const P = [];
    for (let ix = 0; ix < 7; ix++) {
      for (let iz = 0; iz < 7; iz++) {
        const x = (ix - 3) * 0.125, z = (iz - 3) * 0.125;
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.set(x, 0, z);
        g.add(mesh);
        P.push({ mesh, r: Math.hypot(x, z) });
      }
    }
    g.rotation.x = 0.78;
    g.position.y = -0.10;
    scene.add(g);
    let t = 0;
    return dt => {
      t += dt;
      P.forEach(p => p.mesh.scale.y = 0.34 + 0.32 * Math.cos(p.r * 2.4 - t * 1.4));
      g.rotation.y += dt * 0.10;
    };
  },

  // Paved roads: a supported path with kerb markers along it. Tilt is
  // animated rather than a flat spin, so the ribbon keeps catching the
  // matcap at different angles instead of going dead.
  paved: scene => {
    const g = new THREE.Group(), m = mat();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.75, -0.28, 0.10),
      new THREE.Vector3(-0.25, -0.06, -0.14),
      new THREE.Vector3(0.25, 0.10, 0.14),
      new THREE.Vector3(0.75, 0.30, -0.08)
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.09, 10, false), m));
    const markGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    for (let i = 0; i <= 4; i++) {
      const p = curve.getPointAt(i / 4);
      const k = new THREE.Mesh(markGeo, m);
      k.position.set(p.x, p.y + 0.15, p.z);
      g.add(k);
    }
    scene.add(g);
    let t = 0;
    return dt => { t += dt; g.rotation.y += dt * 0.22; g.rotation.x = Math.sin(t * 0.30) * 0.14; };
  },

  /* Carried over verbatim from the sibling site, because the metaphor
     genuinely transfers: its comment calls this "a team convening around
     a core", and this site mounts it on the Arkitektur-workshop — a
     session that gathers architects and platform teams around one
     decision framework. Same form, same meaning. */
  cluster: scene => {
    const group = new THREE.Group();
    const base = new THREE.IcosahedronGeometry(1, 0);
    const posAttr = base.attributes.position;
    const seen = new Set();
    const v = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      const key = `${posAttr.getX(i).toFixed(2)},${posAttr.getY(i).toFixed(2)},${posAttr.getZ(i).toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).normalize();
      const r = 0.15 + Math.random() * 0.06;
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), mat());
      s.position.copy(v).multiplyScalar(0.4);
      group.add(s);
    }
    group.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), mat()));
    scene.add(group);
    return dt => { group.rotation.x += dt * 0.2; group.rotation.y += dt * 0.28; };
  }
};

/* data-ink lets one shape name carry two tints — the same form can be a
   crimson foreground mark in the page body and a plum-tint backdrop in
   a Ydelse header. SHAPE_INK stays the default. */
Object.entries(SHAPE_BUILDERS).forEach(([name, build]) => {
  document.querySelectorAll(`[data-illus="${name}"]`).forEach(el =>
    makeIllusScene(el, build, SHAPE_ZOOM[name], el.dataset.ink || SHAPE_INK[name]));
});
