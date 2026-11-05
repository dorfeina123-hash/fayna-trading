/* v116 — landing page motion.
   1. A 3D ridge of candles that follows an equity curve, behind the hero (dark theme,
      WebGL available, motion allowed). three.js loads only then, from jsDelivr.
   2. The product frame starts tilted and lays flat as it scrolls into view.
   Decorative only: nothing on the page depends on it, and failures are silent. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
  const light = () => document.documentElement.getAttribute('data-fayna-theme') === 'light';

  function tilt() {
    const f = document.querySelector('.trl-frame'); if (!f || RM) return;
    f.classList.add('fl-tilt');
    const upd = () => {
      if (!f.offsetParent) return;
      const r = f.getBoundingClientRect(), vh = innerHeight, p = Math.min(1, Math.max(0, (vh - r.top) / (vh * .85)));
      f.style.setProperty('--fl-tilt', (18 * (1 - p)).toFixed(2) + 'deg');
      f.style.setProperty('--fl-sc', (.94 + .06 * p).toFixed(3));
    };
    addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
  }

  async function ridge() {
    const hero = document.querySelector('.trl-hero'); if (!hero || RM || light()) return;
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return;
    let THREE; try { THREE = await import(THREE_URL); } catch (e) { return; }
    const canvas = document.createElement('canvas'); canvas.className = 'fl-ridge'; canvas.setAttribute('aria-hidden', 'true');
    hero.prepend(canvas); hero.classList.add('fl-has-ridge');
    let renderer; try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { canvas.remove(); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x1f1b23, 11, 28);
    const cam = new THREE.PerspectiveCamera(34, 1, .1, 80);
    scene.add(new THREE.HemisphereLight(0xe9d5ff, 0x1f1b23, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-4, 8, 6); scene.add(key);
    const rim = new THREE.DirectionalLight(0xc084fc, 2.2); rim.position.set(6, 3, -6); scene.add(rim);
    let seed = 5; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const N = 96, vals = []; let eq = 0;
    for (let i = 0; i < N; i++) { const d = (rnd() - .4) * 1.2; eq = Math.max(.2, eq + d); vals.push({ h: eq, up: d >= 0 }); }
    const max = Math.max(...vals.map(v => v.h));
    const geo = new THREE.BoxGeometry(.12, 1, .12); geo.translate(0, .5, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .55, roughness: .3 }), N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0), pts = [];
    for (let i = 0; i < N; i++) {
      const ang = -.9 + i / (N - 1) * 1.8, R = 9, x = Math.sin(ang) * R, z = -Math.cos(ang) * R + 6, h = .4 + vals[i].h / max * 3.6;
      p.set(x, -1.6, z); s.set(1, h, 1); q.setFromAxisAngle(Y, -ang); m.compose(p, q, s); mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(vals[i].up ? 0xc9a3f7 : 0x8f3a52)); pts.push(new THREE.Vector3(x, -1.6 + h + .12, z));
    }
    const grp = new THREE.Group(); grp.add(mesh);
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xf3e8ff, emissive: 0x9b5de5, emissiveIntensity: .9, metalness: .4, roughness: .3 });
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, .025, 8, false), tubeMat));
    scene.add(grp);
    let mx = 0, my = 0; addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, { passive: true });
    const size = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); grp.position.set(0, w > 900 ? -1.1 : -.6, w > 900 ? -4 : -6); };
    addEventListener('resize', size); size();
    let visible = true; new IntersectionObserver(es => { visible = es[0].isIntersecting && !document.hidden; }).observe(canvas);
    const t0 = performance.now();
    renderer.setAnimationLoop(() => {
      if (!visible || !canvas.isConnected || light()) return;
      const t = (performance.now() - t0) / 1000, a = Math.sin(t * .08) * .3 + mx * .25;
      cam.position.set(Math.sin(a) * 4.4, 1.9 - my * .6, 12.5); cam.lookAt(0, .6, 0);
      tubeMat.emissiveIntensity = .7 + Math.sin(t * 1.4) * .2;
      renderer.render(scene, cam);
    });
  }

  function boot() { tilt(); ridge(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
