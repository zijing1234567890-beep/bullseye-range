'use strict';

/* =========================================================================
   Bullseye Range — first-person shooting gallery
   You hold an AK-47 (30-round magazine, full-auto while the trigger is held);
   knock the targets down and drop the flags to advance.
   ========================================================================= */

/* ---------------- error surface (visible instead of a silent blank page) -- */
function showError(msg) {
  const box = document.getElementById('err');
  if (!box) return;
  box.hidden = false;
  const text = String(msg).slice(0, 400);
  if (box.textContent.indexOf(text) === -1) box.textContent += (box.textContent ? '\n' : '') + text;
}
window.addEventListener('error', e => showError(e.message + ' @ ' + (e.filename || '?') + ':' + (e.lineno || 0)));
window.addEventListener('unhandledrejection', e => {
  const r = e.reason;
  showError('promise: ' + (r && r.message ? r.message : String(r)));
});

/* ---------------- canvas ---------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 1, H = 1;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(320, window.innerWidth);
  H = Math.max(240, window.innerHeight);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

/* ---------------- helpers ---------------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const easeInQuad = t => t * t;
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const fmt = n => Math.round(n).toLocaleString('en-US');

/* ---------------- sound (tiny WebAudio synth, no assets) ---------------- */
const Sound = (function () {
  let ac = null, master = null, noiseBuf = null, usable = true;

  function ensure() {
    if (!usable) return false;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { usable = false; return false; }
      try { ac = new AC(); } catch (err) { usable = false; return false; }
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return true;
  }

  function noise(dur) {
    if (!noiseBuf || noiseBuf.__dur < dur) {
      const len = Math.ceil(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      buf.__dur = dur;
      noiseBuf = buf;
    }
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  function beep(freq, at, dur, peak, type) {
    const o = ac.createOscillator();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, at);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(master);
    o.start(at); o.stop(at + dur + 0.02);
  }

  function shot() {
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.3);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2700, t);
    lp.frequency.exponentialRampToValueAtTime(170, t + 0.2);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.2);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.26);
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.15);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.52, t);
    g2.gain.exponentialRampToValueAtTime(0.0008, t + 0.17);
    o.connect(g2); g2.connect(master);
    o.start(t); o.stop(t + 0.19);
  }

  function boom() {                       // shotgun: deeper, longer, more body than shot()
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.45);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1900, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 0.34);
    const g = ac.createGain();
    g.gain.setValueAtTime(1.0, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.34);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.42);
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(112, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.26);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.72, t);
    g2.gain.exponentialRampToValueAtTime(0.0008, t + 0.3);
    o.connect(g2); g2.connect(master);
    o.start(t); o.stop(t + 0.32);
  }

  function pick() {                       // weapon change: two metallic clacks
    click(900, 0, 0.5, 0.04);
    click(1500, 0.06, 0.45, 0.03);
  }

  function hit() {
    if (!ensure()) return;
    const t = ac.currentTime;
    beep(1046, t, 0.18, 0.3, 'triangle');
    beep(1568, t + 0.07, 0.2, 0.26, 'triangle');
  }

  function flagHit() {
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.25);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 780; bp.Q.value = 1.1;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.26);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.26);
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(430, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.28);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.24, t);
    g2.gain.exponentialRampToValueAtTime(0.0008, t + 0.3);
    o.connect(g2); g2.connect(master);
    o.start(t); o.stop(t + 0.32);
  }

  function click(freq, at, peak, dur) {
    if (!ensure()) return;
    const t = at === undefined ? ac.currentTime : ac.currentTime + at;
    const src = noise(dur || 0.05);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(peak || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + (dur || 0.05));
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t); src.stop(t + (dur || 0.05) + 0.02);
  }

  function emptyClick() { click(1600, 0, 0.3, 0.04); }
  function reloadMech() { click(1400, 0, 0.35, 0.06); click(2200, 0.16, 0.3, 0.05); }
  function levelUp() {
    if (!ensure()) return;
    const t = ac.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => beep(f, t + i * 0.09, 0.3, 0.24, 'sine'));
  }
  function gameStart() {
    if (!ensure()) return;
    const t = ac.currentTime;
    [392, 587].forEach((f, i) => beep(f, t + i * 0.1, 0.32, 0.22, 'sine'));
  }

  function enemyShot() {                  // a pistol far down the range
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.16);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1500;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.34, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.17);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.2);
  }

  function deflect() {                    // steel rings, a round bounces off the blade
    if (!ensure()) return;
    const t = ac.currentTime;
    [2350, 3170, 4200].forEach((f, i) => beep(f, t + i * 0.012, 0.34 - i * 0.06, 0.2, 'triangle'));
    click(2600, 0.02, 0.3, 0.05);
  }

  function slice() {                      // steel through a flying round
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.1);                            // a short hiss off the edge
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2200;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.11);
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.12);
    [2400, 3300, 4600].forEach((f, i) => beep(f, t + i * 0.008, 0.30 - i * 0.06, 0.16, 'triangle'));
  }

  function slash() {                      // katana cutting the air
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.3);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(3400, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.26);
    bp.Q.value = 1.4;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.3);
  }

  function hurt() {                       // a round finding you
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.22);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.24);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.26);
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.3);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.34, t);
    g2.gain.exponentialRampToValueAtTime(0.0008, t + 0.32);
    o.connect(g2); g2.connect(master);
    o.start(t); o.stop(t + 0.34);
  }

  function heal() {                       // med kit: a soft rising swell
    if (!ensure()) return;
    const t = ac.currentTime;
    [523, 784, 1046].forEach((f, i) => beep(f, t + i * 0.11, 0.42, 0.16, 'sine'));
  }

  function zap() {                        // energy bolt: a bright electric crack
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.16);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1100, t);
    hp.frequency.exponentialRampToValueAtTime(4400, t + 0.1);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.13);
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.15);
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(1750, t);
    o.frequency.exponentialRampToValueAtTime(320, t + 0.13);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.15, t);
    g2.gain.exponentialRampToValueAtTime(0.0008, t + 0.15);
    o.connect(g2); g2.connect(master);
    o.start(t); o.stop(t + 0.17);
  }

  function crack() {                      // the sniper: a hard flat crack, then the echo
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.1);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.09);
    bp.Q.value = 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.1);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.12);
    // the low thump of the round leaving, and a long tail off the hills
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(56, t + 0.24);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.3, t);
    g2.gain.exponentialRampToValueAtTime(0.0008, t + 0.26);
    o.connect(g2); g2.connect(master);
    o.start(t); o.stop(t + 0.28);
    const tail = noise(0.5);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const g3 = ac.createGain();
    g3.gain.setValueAtTime(0.001, t + 0.1);
    g3.gain.exponentialRampToValueAtTime(0.14, t + 0.16);
    g3.gain.exponentialRampToValueAtTime(0.0008, t + 0.6);
    tail.connect(lp); lp.connect(g3); g3.connect(master);
    tail.start(t + 0.1); tail.stop(t + 0.62);
  }

  function pickup() {                     // a cell drawn into your hands
    if (!ensure()) return;
    const t = ac.currentTime;
    beep(988, t, 0.13, 0.2, 'sine');
    beep(1480, t + 0.06, 0.2, 0.18, 'sine');
  }

  function load() {                       // the pistols charging up
    if (!ensure()) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(1760, t + 0.34);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.13, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.38);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.4);
    beep(1760, t + 0.3, 0.3, 0.2, 'triangle');
  }

  function flame() {                      // the jet: a fat low roar that swells and dies
    if (!ensure()) return;
    const t = ac.currentTime;
    const roar = noise(0.5);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(340, t);
    lp.frequency.exponentialRampToValueAtTime(1500, t + 0.12);
    lp.frequency.exponentialRampToValueAtTime(420, t + 0.46);
    lp.Q.value = 1.4;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.48);
    roar.connect(lp); lp.connect(g); g.connect(master);
    roar.start(t); roar.stop(t + 0.5);
  }

  function foam() {                     // the extinguisher blast: a dry, hard hiss
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.24);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.19);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.22);
  }

  function hiss() {                       // a fire drowning: a long wash of steam
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.7);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3200, t);
    bp.frequency.exponentialRampToValueAtTime(560, t + 0.6);
    bp.Q.value = 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.66);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.7);
  }

  function burn() {                       // something catching light: a crackling hiss
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.34);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.3);
    bp.Q.value = 0.9;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.32);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.34);
    beep(190, t, 0.22, 0.16, 'sine');
  }

  function knife() {                      // a blade drawn back: a short metallic shink
    if (!ensure()) return;
    const t = ac.currentTime;
    const src = noise(0.14);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3200, t);
    bp.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
    bp.Q.value = 3.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.14);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.15);
    beep(1320, t + 0.02, 0.1, 0.06, 'triangle');
  }

  return {
    ensure, shot, boom, pick, hit, flagHit, emptyClick, reloadMech, levelUp, gameStart,
    enemyShot, deflect, slice, slash, hurt, heal, zap, pickup, load, crack, flame, burn, knife,
    foam, hiss
  };
})();

/* ---------------- camera & projection ---------------- */
const FOV = (72 * Math.PI) / 180;
const cam = { x: 0, z: 0, y: 1.68, yaw: 0, pitch: 0, shake: 0 };

// Right-click aim: everything below is blended in by aimBlend(), 0 = hip, 1 = sights.
const AIM_ZOOM = 0.42;             // how much tighter the field of view gets
const AIM_TURN = 0.45;             // turning is slower down the sights
const AIM_SPREAD = 0.42;           // ...and pellets/shot scatter tighten up
const AIM_REF = { x: 0.5, y: 0.42 };   // where the view points with the mouse at rest
const SIGHT_DROP = 22;             // px the muzzle sits below that point when sighted in
const AIM_SHRINK = 0.62;           // how much smaller the held weapon is drawn down the sights
function aimBlend() {
  return gun.aim;
}

// Sighted in, a weapon is drawn smaller, shrinking towards the aim point, so the
// stock and the arms sit in the lower corner instead of across the view. The barrel
// tip still lands on the aim point and the barrel still points at it: gunTransform()
// scales the pose about that point, which leaves every line through it untouched.
// A weapon may ask for its own size (`aimScale`); a scoped rifle keeps full size,
// since its own artwork opens out into the sight picture.
function gunAimScale(w) {
  if (!w.sightLine) return 1;
  return lerp(1, w.aimScale !== undefined ? w.aimScale : AIM_SHRINK, aimBlend());
}

// Sighting in pulls the view in; a scoped rifle pulls it in far more (see `zoom`).
function focalLength() {
  const zoom = currentGun().zoom || 1;
  return (W * 0.5) / Math.tan(FOV * 0.5) * (1 + AIM_ZOOM * zoom * aimBlend());
}

function depthOf(x, z) {
  return (x - cam.x) * Math.sin(cam.yaw) + (z - cam.z) * Math.cos(cam.yaw);
}

function project(x, y, z) {
  const dx = x - cam.x, dz = z - cam.z;
  const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
  const depth = dx * s + dz * c;
  if (depth < 0.4) return null;
  const k = focalLength() / depth;
  return {
    x: W * 0.5 + (dx * c - dz * s) * k,
    y: H * 0.5 - (y - cam.y) * k + focalLength() * Math.tan(cam.pitch),
    k: k,
    depth: depth
  };
}

function horizonY() { return H * 0.5 + focalLength() * Math.tan(cam.pitch); }

const RIFLE_ANGLE = 0.9;      // how far the rifle's sub-frame is canted up-left at the hip
const SHOTGUN_ANGLE = 0.86;   // ...and how far the shotgun's is
const SNIPER_ANGLE = 0.88;    // ...and how far the scoped rifle's is

/* ---------------- weapons ----------------
   Each weapon carries its own stats, its own transform inside the view frame and
   its own artwork. `ammo` is remembered per weapon, so switching away and back
   keeps whatever was left in the magazine. Every weapon fires while the trigger
   is held; `interval` is what makes the AK full-auto and the shotgun slow. */
const WEAPONS = [
  {
    id: 'ak47', name: 'AK-47', key: '1', code: 'Digit1',
    mag: 30, reload: 1.6, interval: 0.09,
    pellets: 1, spread: 0,
    recoil: 0.62, kick: 0.0032, shake: 0.6,
    flashScale: 1, flashSpikes: 5,
    anchorX: 0.62, anchorY: 0.93, baseRot: -0.34,
    sightLine: true,                           // right-click: held square on the aim point
    tilt: RIFLE_ANGLE,                         // ...and the art's own pitch taken out, so it is level
    recoilRise: 0.035, reloadRise: 0.30, reloadTilt: 0.34,
    muzzle: { x: -219, y: -286 },              // = rotate(-360, -6) by RIFLE_ANGLE
    draw: drawAK47, sound: 'shot', ammo: 30
  },
  {
    id: 'pistol', name: 'Pistol', key: '2', code: 'Digit2',
    mag: 12, reload: 1.05, interval: 0.16,
    pellets: 1, spread: 0,
    recoil: 0.5, kick: 0.0026, shake: 0.5,
    flashScale: 0.72, flashSpikes: 5,
    anchorX: 0.62, anchorY: 0.93, baseRot: -0.34,
    sightLine: true,
    tilt: 0,                                   // its art is already drawn level
    recoilRise: 0.035, reloadRise: 0.30, reloadTilt: 0.34,
    muzzle: { x: -238, y: -233 },
    draw: drawPistol, sound: 'shot', ammo: 12
  },
  {
    id: 'shotgun', name: 'Shotgun', key: '3', code: 'Digit3',
    mag: 6, reload: 2.5, interval: 0.72,
    pellets: 8, spread: 0.032,               // extra pellets scatter over the screen width
    recoil: 1.5, kick: 0.011, shake: 1.4,
    flashScale: 1.5, flashSpikes: 7,
    anchorX: 0.60, anchorY: 0.95, baseRot: -0.30,
    sightLine: true,
    tilt: SHOTGUN_ANGLE,
    recoilRise: 0.05, reloadRise: 0.32, reloadTilt: 0.30,
    muzzle: { x: -249, y: -314 },
    draw: drawShotgun, sound: 'boom', ammo: 6
  },
  {
    // No ammo and no range: it cuts enemies down at arm's length and turns their
    // bullets aside. Right-click raises it into a guard that covers every angle.
    id: 'katana', name: 'Katana', key: '4', code: 'Digit4',
    melee: true, mag: 0, reload: 0, interval: 0.52,
    pellets: 1, spread: 0,
    reach: 4.6,                                // metres of steel
    recoil: 0.55, kick: 0.0012, shake: 0.35,
    flashScale: 0, flashSpikes: 0,
    anchorX: 0.66, anchorY: 1.00, baseRot: -0.62,
    sightX: 0.54, sightY: 0.84, sightRot: -0.20,    // guard stance
    recoilRise: 0.02, reloadRise: 0, reloadTilt: 0,
    muzzle: { x: -110, y: -240 },
    draw: drawKatana, sound: 'slash', ammo: 0
  },
  {
    // Earned rather than reloaded: three energy cells pried off the shooters you
    // drop charge this pair up, and while charged they never run dry.
    id: 'energy', name: 'Energy pistols', key: '5', code: 'Digit5',
    energy: true, mag: 0, reload: 0, interval: 0.06,
    pellets: 1, spread: 0,
    pierce: 3,                                 // one bolt runs through what it meets
    recoil: 0.40, kick: 0.0014, shake: 0.45,
    flashScale: 1.05, flashSpikes: 6, bolt: true,
    anchorX: 0.60, anchorY: 0.95, baseRot: -0.26,
    sightLine: true,
    tilt: 0.35,                                // pitch the pistol art is built with
    pivot: { x: -140, y: 30 },                 // ...turned about the right hand's grip
    altPivot: { x: 140, y: 30 },               // ...and the left's, mirrored
    recoilRise: 0.03, reloadRise: 0, reloadTilt: 0,
    muzzle: { x: -270, y: -231 },              // right-hand pistol
    altMuzzle: { x: 270, y: -231 },            // ...and the left: shots trade hands
    draw: drawEnergyPistols, sound: 'zap', ammo: 0
  },
  {
    // Earned the same way, but off the rounds rather than the cells: three cartridge
    // rounds pried off the shooters you drop load this scoped rifle, and once it is
    // loaded it holds for the rest of the round. One shot is enough for a man.
    id: 'sniper', name: 'Sniper rifle', key: '6', code: 'Digit6',
    sniper: true, mag: 0, reload: 0, interval: 1.15,
    pellets: 1, spread: 0,
    pierce: 2,                                 // a heavy round punches through one man into the next
    recoil: 1.15, kick: 0.0075, shake: 0.85,
    flashScale: 1.45, flashSpikes: 4,
    anchorX: 0.62, anchorY: 0.97, baseRot: -0.30,
    sightLine: true,
    tilt: SNIPER_ANGLE,                        // the art's own pitch, taken out when sighted in
    zoom: 2.6,                                 // down the scope the view closes right up
    scope: true,                               // ...and the sight itself is drawn
    aimScale: 1,                               // the sight picture is the whole pose: full size
    recoilRise: 0.05, reloadRise: 0.30, reloadTilt: 0.34,
    muzzle: { x: -249, y: -313 },              // = rotate(-400, -8) by SNIPER_ANGLE
    draw: drawSniper, sound: 'crack', ammo: 0
  },
  {
    // Fuel, not rounds: the tank holds enough for a good long wash of fire, and
    // whatever the jet touches catches light and burns down where it stands.
    id: 'flame', name: 'Flamethrower', key: '7', code: 'Digit7',
    flame: true, mag: 260, reload: 2.6, interval: 0.05,
    pellets: 1, spread: 0,
    recoil: 0.22, kick: 0.0009, shake: 0.22,
    flashScale: 0.9, flashSpikes: 4,
    anchorX: 0.62, anchorY: 0.95, baseRot: -0.32,
    sightLine: true,                           // right-click squares the nozzle on the aim point
    tilt: RIFLE_ANGLE,
    recoilRise: 0.02, reloadRise: 0.30, reloadTilt: 0.32,
    muzzle: { x: -219, y: -286 },              // = rotate(-360, -6) by RIFLE_ANGLE
    draw: drawFlamethrower, sound: 'flame', ammo: 260
  },
  {
    // Foam, not lead: a pressurised extinguisher, and the only thing in the rack that
    // puts the drum fires out. The blast also chokes a shooter, so his aim runs out
    // while he is coughing.
    id: 'ext', name: 'Fire extinguisher', key: '8', code: 'Digit8',
    ext: true, mag: 90, reload: 2.4, interval: 0.06,
    pellets: 1, spread: 0,
    recoil: 0.18, kick: 0.0007, shake: 0.18,
    flashScale: 0, flashSpikes: 0,
    anchorX: 0.62, anchorY: 0.95, baseRot: -0.32,
    sightLine: true,                           // right-click squares the nozzle on the aim point
    tilt: RIFLE_ANGLE,
    recoilRise: 0.015, reloadRise: 0.28, reloadTilt: 0.30,
    muzzle: { x: -252, y: -246 },
    draw: drawExtinguisher, sound: 'foam', ammo: 90
  }
];
let gunIndex = 0;
const currentGun = () => WEAPONS[gunIndex];

/* ---------------- the between-levels shop ---------------- */
// A perk is one string on `game.perk`, cleared when the round it was bought for
// ends. Everything it changes is read through these helpers, so nothing has to be
// undone afterwards.
const perkOn = (id) => game.perk === id;
const perkById = (id) => PERKS.find(p => p.id === id) || null;
const perkPrice = (p) => p.price + (game.level - 1) * PERK_LEVEL_TAX;

function magSize(w) {                     // rounds in a fresh magazine
  return Math.round(w.mag * (perkOn('bandolier') ? 1.5 : 1));
}

function reloadTime(w) {                  // seconds a reload takes
  return w.reload * (perkOn('speedloaders') ? 0.6 : 1);
}

// Three different things go on the card; the player buys one of them or none.
const OFFER_COUNT = 3;
function rollOffer() {
  const pool = PERKS.slice();
  const out = [];
  for (let i = 0; i < Math.min(OFFER_COUNT, pool.length); i++) {
    const p = pool.splice(randInt(0, pool.length - 1), 1)[0];
    out.push({ id: p.id, price: perkPrice(p) });
  }
  return out;
}

/* ---------------- game state ---------------- */

const MAX_HP = 100;
const MED_KITS = 3;               // carried into every level
const MED_HEAL = 45;              // hp restored by one kit
const MED_TIME = 1.1;             // ...spread over this many seconds
const ENEMY_AIM = 0.72;           // how long an enemy lines you up before firing
const SLICE_REACH = 3.0;          // the katana sweeps this far around you
const SLICE_TIME = 0.26;          // ...and the swing stays live this long
const SLICE_POINTS = 75;          // for cutting a round out of the air
const GUARD_LATCH = 0.55;         // a right click keeps the guard up this long
const GUARD_REACH = 2.6;          // ...and it turns rounds aside within this bubble
const ENERGY_MAX = 3;             // cells that charge a pair of energy pistols
const ENERGY_DROP_CHANCE = 0.45;  // how often a shooter you drop leaves one behind
const ENERGY_SPEED = 8;           // a cell drifts toward your hands this fast, then faster
let dropChance = ENERGY_DROP_CHANCE;   // the tests wind this up and down
const ROUND_MAX = 3;              // cartridge rounds that load the sniper rifle
const ROUND_DROP_CHANCE = 0.45;   // how often a shooter you drop leaves one behind
const ROUND_SPEED = 8;            // a round drifts toward your hands this fast, then faster
let roundChance = ROUND_DROP_CHANCE;   // the tests wind this up and down

// The knife men: no gun, no cover, and no patience. They walk you down and cut
// you at arm's length, so they are the reason to keep something burning.
const KNIFE_SPEED = [2.3, 3.5];   // metres a second, closing on you
const KNIFE_REACH = 1.75;         // ...and where they stop: a knife's length away
const KNIFE_WINDUP = 0.44;        // seconds the blade is up before the cut lands
const KNIFE_DAMAGE = [7, 13];     // health a cut takes off you
const KNIFE_COOLDOWN = [1.0, 1.7];
const KNIFE_MAX = 5;              // no more of them on the range at once than this

// The flamethrower: fuel in a canister rather than rounds, and a jet that sets
// whatever it washes over alight. A body burns for a moment before it drops.
const FLAME_RANGE = 15;           // metres the jet carries
const FLAME_TOL = 0.55;           // how far off the crosshair a body still catches
const FLAME_BURN = 1.05;          // seconds a body burns before it goes down
const FLAME_JET = 0.14;           // seconds the visible jet lingers after a squirt

// The extinguisher works like the flamethrower's jet in reverse: a wide blast of foam
// that chokes a shooter instead of setting him alight, and the only thing that puts a
// drum fire out.
const FOAM_RANGE = 17;            // metres the blast carries
const FOAM_TOL = 0.72;            // how far off the crosshair a fire still catches (a wide mist)
const FOAM_JET = 0.16;            // seconds the visible blast lingers after a squirt
const FOAM_DOSE = 0.07;           // how much of a fire one blast puts down
const FIRE_SCORE = 120;           // points for putting one out
const CHOKE_TIME = 2.4;           // seconds a choked shooter is off his aim
const FLAME_SCORCH = 60;          // points for burning something down

// Between levels the range keeps a one-round shop: a single power-up is offered,
// paid for out of the score, and lasts only for the level you are about to play.
const PERKS = [
  { id: 'flak', name: 'Flak vest', price: 450,
    blurb: 'Rounds take half the bite out of you for the whole round.' },
  { id: 'bandolier', name: 'Bandolier', price: 400,
    blurb: 'Every magazine in the rack holds half again as much.' },
  { id: 'speedloaders', name: 'Speed loaders', price: 350,
    blurb: 'Every reload in the rack takes 40% less time.' },
  { id: 'fieldkit', name: 'Field kit', price: 300,
    blurb: 'A full health bar and two extra med kits when the round starts.' },
  { id: 'coldnerve', name: 'Cold nerve', price: 500,
    blurb: 'The shooters take far longer to line you up before they fire.' }
];
const PERK_LEVEL_TAX = 60;        // each level up adds this much to the asking price

const game = {
  state: 'menu',                 // menu | playing | paused | levelclear | down
  level: 1,
  score: 0,
  shots: 0,
  hits: 0,
  targetsNeeded: 0,
  flagsNeeded: 0,
  enemiesNeeded: 0,
  knivesNeeded: 0,
  targetsDone: 0,
  flagsDone: 0,
  enemiesDone: 0,
  knivesDone: 0,
  kills: 0,
  burned: 0,                     // things burned down by the flamethrower
  deflects: 0,
  slices: 0,                     // rounds cut out of the air
  sliceT: 0,                     // seconds the current swing stays live
  guardT: 0,                     // seconds the raised guard stays up after a tap
  lastDeflect: null,             // where the last round was turned aside
  energy: 0,                     // energy cells in hand, 0..ENERGY_MAX
  charged: false,                // ...three of them light the energy pistols for the round
  rounds: 0,                     // cartridge rounds in hand, 0..ROUND_MAX
  sniperLoaded: false,           // ...three of them load the sniper rifle for the round
  hp: MAX_HP,
  medKits: MED_KITS,
  healing: 0,                    // seconds of med kit left to apply
  healLeft: 0,                   // ...and how much health it still owes you
  hurtFlash: 0,
  hurtFrom: 0,                   // screen x of the last hit, for the direction wedge
  bullets: [],
  time: 0,
  levelTime: 0,
  perk: null,                    // the power-up bought for this round, if any
  offer: null,                   // { id, price } waiting on the level-clear card
  fires: [],                     // drum fires on the range: { x, z, state, douse }
  firesNeeded: 0,
  firesDone: 0,
  entities: [],
  tracers: [],
  pops: [],
  sparks: [],
  scenery: []
};

const gun = {
  recoil: 0, flash: 0, reloading: 0, aim: 0,   // aim: 0 hip -> 1 down the sights
  flameT: 0,                    // seconds the last squirt of fire is still visible
  flameSeed: -10,               // when the jet last roared, so it does not roar every squirt
  foamT: 0,                    // seconds the last blast of foam is still visible
  foamSeed: -10,               // ...and when it last hissed
  // the round count always belongs to the weapon in hand, so switching keeps it
  get ammo() { return WEAPONS[gunIndex].ammo; },
  set ammo(v) { WEAPONS[gunIndex].ammo = v; }
};
const cross = { x: 0, y: 0, hover: false };
let lastShotAt = -10;
let triggerHeld = false;          // true while the left mouse button / touch / space is down
let aiming = false;               // true while the right mouse button is held
// A shot from the shoulder throws the sight picture down: the sniper has to be
// re-shouldered (right button released and pressed again) before it scopes again.
let sightKicked = false;

function selectWeapon(id) {
  const idx = typeof id === 'number' ? id : WEAPONS.findIndex(w => w.id === id);
  if (idx < 0 || idx >= WEAPONS.length || idx === gunIndex) return false;
  gunIndex = idx;
  gun.reloading = 0;              // a weapon change cancels a reload in progress
  gun.recoil = 0;
  gun.flash = 0;
  lastShotAt = game.time - 10;    // the new gun is ready to fire straight away
  sightKicked = false;            // a fresh weapon is shouldered cleanly
  maybeCharge();                  // take the pistols out with three cells and they load
  maybeLoadSniper();              // ...and the rifle with three cartridge rounds
  Sound.pick();
  updateHud();
  return true;
}

function cycleWeapon(dir) {
  const n = WEAPONS.length;
  return selectWeapon((gunIndex + (dir || 1) + n) % n);
}

/* ---------------- scenery (fixed, yaw independent) ---------------- */
function buildScenery() {
  const items = [];
  for (let i = 0; i < 26; i++) {                    // far hills
    const a = (i / 26) * TAU + rand(-0.06, 0.06);
    const d = rand(96, 150);
    items.push({
      kind: 'hill', a: a,
      x: Math.sin(a) * d, z: Math.cos(a) * d,
      w: rand(34, 70), h: rand(9, 17), d: d,
      tint: rand(0, 1)
    });
  }
  for (let i = 0; i < 34; i++) {                    // trees / bushes behind the range
    const a = rand(-Math.PI, Math.PI);
    const d = rand(62, 100);
    items.push({
      kind: 'tree', a: a,
      x: Math.sin(a) * d, z: Math.cos(a) * d,
      h: rand(4.5, 9), d: d, seed: rand(0, 10)
    });
  }
  for (let i = 0; i < 9; i++) {                     // clouds
    const a = (i / 9) * TAU + rand(-0.2, 0.2);
    const d = 200;
    items.push({
      kind: 'cloud', a: a,
      x: Math.sin(a) * d, z: Math.cos(a) * d,
      w: rand(26, 46), h: rand(7, 12), d: d
    });
  }
  game.scenery = items;
}
buildScenery();

/* ---------------- level construction ---------------- */
function spawnLevel(n) {
  const tn = 4 + n;
  const fn = 2 + Math.ceil(n / 2);
  const en = 1 + Math.ceil(n / 2);          // armed men on the range, also a quota
  const kn = Math.min(KNIFE_MAX, 1 + Math.floor(n / 2));   // ...and the ones with knives
  game.targetsNeeded = tn;
  game.flagsNeeded = fn;
  game.enemiesNeeded = en;
  game.knivesNeeded = kn;
  game.targetsDone = 0;
  game.flagsDone = 0;
  game.enemiesDone = 0;
  game.knivesDone = 0;
  game.levelTime = 0;
  if (perkOn('fieldkit')) {        // the one perk that pays out before the first shot
    game.hp = MAX_HP;
    game.medKits += 2;
  }

  const total = tn + 2 + fn + 1 + en + kn;
  const spread = Math.min(Math.PI * 1.24, Math.PI * 0.52 + n * 0.075);
  const minR = 13 + n * 0.7;
  const maxR = Math.min(58, minR + 22 + n * 1.4);

  const angles = [];
  for (let i = 0; i < total; i++) angles.push(-spread / 2 + (spread * (i + rand(0.2, 0.8))) / total);
  for (let i = angles.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    const t = angles[i]; angles[i] = angles[j]; angles[j] = t;
  }

  const kinds = [];
  for (let i = 0; i < tn + 2; i++) kinds.push('target');
  for (let i = 0; i < fn + 1; i++) kinds.push('flag');
  for (let i = 0; i < en; i++) kinds.push('enemy');
  for (let i = 0; i < kn; i++) kinds.push('knife');
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t;
  }

  const ents = [];
  kinds.forEach((kind, i) => {
    const a = angles[i];
    // the shooters stand in front of the gallery, inside pistol range
    const r = kind === 'enemy' ? rand(Math.max(7, minR - 4), minR + 10) : rand(minR, maxR);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (kind === 'enemy') {
      ents.push({
        type: 'enemy', x: x, z: z, hx: x, hz: z,
        h: 1.78, r: 0.40,
        state: 'alive', t: 0, drop: 0, alpha: 1,
        swayAmp: rand(0.5, 1.5), swaySpeed: rand(0.45, 0.9), wob: rand(0, TAU),
        cool: rand(1.0, 2.4), aim: 0, flash: 0,
        burn: 0, burnFrom: 0, choke: 0, ember: rand(0, TAU),
        jacket: randInt(0, 3)
      });
      return;
    }
    if (kind === 'knife') {
      // no pistol and no line to hold: he starts out on the range and walks at you
      ents.push({
        type: 'knife', x: x, z: z, hx: x, hz: z,
        h: 1.74, r: 0.38,
        state: 'alive', t: 0, drop: 0, alpha: 1,
        speed: rand(KNIFE_SPEED[0], KNIFE_SPEED[1]),
        stride: rand(0, TAU), swing: 0, cool: rand(0.5, 1.4),
        burn: 0, burnFrom: 0, choke: 0, ember: rand(0, TAU),
        jacket: randInt(0, 3)
      });
      return;
    }
    if (kind === 'target') {
      const radius = clamp(1.02 - n * 0.05, 0.4, 1.02);
      const moving = n >= 3 && Math.random() < Math.min(0.6, 0.16 + n * 0.07);
      ents.push({
        type: 'target', x: x, z: z, hx: x, hz: z,
        r: radius, y: rand(1.25, 2.35),
        state: 'alive', t: 0, drop: 0, alpha: 1,
        swayAmp: moving ? rand(1.4, 2.8) : 0,
        swaySpeed: rand(0.7, 1.5),
        wob: rand(0, TAU),
        burn: 0, burnFrom: 0, choke: 0, ember: rand(0, TAU)
      });
    } else {
      ents.push({
        type: 'flag', x: x, z: z, hx: x, hz: z,
        poleH: rand(3.5, 4.8), w: rand(1.35, 1.95), h: rand(0.85, 1.25),
        hue: (n * 47 + randInt(0, 30)) % 360,
        state: 'alive', t: 0, lowered: 0, alpha: 1,
        burn: 0, burnFrom: 0, choke: 0, ember: rand(0, TAU)
      });
    }
  });

  game.entities = ents;

  // Drum fires, out on the grass: nothing but the extinguisher puts them out, and the
  // round is not over until they are all down.
  game.fires = [];
  const fr = Math.min(4, 1 + Math.ceil(n / 2));
  let tries = 0;
  while (game.fires.length < fr && tries++ < 240) {
    const a = rand(-spread / 2, spread / 2) * 1.2;
    const r = rand(Math.max(9, minR - 4), maxR + 4);
    const fx = Math.sin(a) * r, fz = Math.cos(a) * r;
    if (fz < 6) continue;                                        // never in your lap
    let clear = true;
    for (let i = 0; i < game.fires.length; i++) {
      if (Math.hypot(game.fires[i].x - fx, game.fires[i].z - fz) < 5) { clear = false; break; }
    }
    if (!clear) continue;
    game.fires.push({
      type: 'fire', x: fx, z: fz, hx: fx, hz: fz,
      state: 'burning', douse: 0, outAt: 0, t: rand(0, 6), seed: rand(0, TAU)
    });
  }
  game.firesNeeded = game.fires.length;
  game.firesDone = 0;

  game.tracers.length = 0;
  game.pops.length = 0;
  game.sparks.length = 0;
  game.bullets.length = 0;
  game.sliceT = 0;
  game.guardT = 0;
  WEAPONS.forEach(w => { w.ammo = magSize(w); }); // every weapon starts a level loaded
  game.energy = 0;                              // cells do not survive the round
  game.charged = false;
  game.rounds = 0;                              // ...and neither do the rounds
  game.sniperLoaded = false;
  needHintAt = -10;
  needRoundHintAt = -10;
  gun.reloading = 0;
  gun.flameT = 0;
  gun.foamT = 0;
  cam.yaw = 0;
  cam.pitch = 0;
  cross.x = W * 0.5;
  cross.y = H * 0.42;
}

/* ---------------- entity simulation ---------------- */
function updateEntities(dt) {
  for (let i = game.entities.length - 1; i >= 0; i--) {
    const e = game.entities[i];
    if (e.type === 'energy' || e.type === 'round') {  // a pickup lifted off a dropped shooter
      if (!isFinite(e.x) || !isFinite(e.z)) {         // one with no place on the range
        game.entities.splice(i, 1);
        continue;
      }
      const isRound = e.type === 'round';
      const speed = isRound ? ROUND_SPEED : ENERGY_SPEED;
      e.t += dt;
      const tx = cam.x + Math.sin(cam.yaw) * 0.5, tz = cam.z + Math.cos(cam.yaw) * 0.5;
      const dx = tx - e.x, dz = tz - e.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001) {
        const step = Math.min(d, (speed + e.t * speed) * dt);
        e.x += (dx / d) * step;
        e.z += (dz / d) * step;
      }
      e.hx = e.x; e.hz = e.z;
      e.y = (isRound ? 1.02 : 1.12) + Math.sin(e.t * 5.5) * 0.07;
      if (Math.hypot(e.x - cam.x, e.z - cam.z) < 0.85) {
        if (isRound) collectRound(e); else collectEnergy(e);
        game.entities.splice(i, 1);
      }
      continue;
    }
    if (e.state === 'alive' && e.swayAmp > 0) {      // targets and shooters both walk a line
      const off = Math.sin(game.time * e.swaySpeed + e.wob) * e.swayAmp;
      const r = Math.hypot(e.x, e.z) || 1;
      e.hx = e.x + (e.z / r) * off;
      e.hz = e.z - (e.x / r) * off;
    }
    const ablaze = e.burn > 0;                       // alight: he stops fighting, and flails
    if (e.state === 'alive' && e.type === 'enemy' && !ablaze) {
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 7);
      if (e.choke > 0) e.choke = Math.max(0, e.choke - dt);
      if (e.aim > 0 && e.choke > 0) {                  // choking on foam: his sights come off you
        e.aim = Math.max(0, e.aim - dt * 1.6);
        if (e.aim === 0) e.cool = Math.max(e.cool, 0.9);
      } else if (e.aim > 0) {                        // lining you up, then the shot
        e.aim += dt / (ENEMY_AIM * (perkOn('coldnerve') ? 1.7 : 1));
        if (e.aim >= 1) { e.aim = 0; e.cool = rand(1.5, 3.0); enemyFire(e); }
      } else {
        e.cool -= dt;
        if (e.cool <= 0) e.aim = 0.0001;
      }
    }
    if (e.state === 'alive' && e.type === 'knife' && !ablaze) {
      // He walks straight at you and stops a knife's length away, then cuts. No
      // line to hold and nowhere to hide: the only answer is to put him down first.
      const dx = cam.x - e.x, dz = cam.z - e.z;
      const d = Math.hypot(dx, dz) || 0.001;
      if (d > KNIFE_REACH) {
        const step = Math.min(d - KNIFE_REACH, e.speed * dt);
        e.x += (dx / d) * step;
        e.z += (dz / d) * step;
      }
      e.hx = e.x; e.hz = e.z;
      e.stride += dt * (3.4 + e.speed * 1.5);        // the walk cycle, for the art
      if (e.swing > 0) {                             // the blade is up: the cut lands
        e.swing += dt / KNIFE_WINDUP;
        if (e.swing >= 1) {
          e.swing = 0;
          e.cool = rand(KNIFE_COOLDOWN[0], KNIFE_COOLDOWN[1]);
          if (d <= KNIFE_REACH + 0.45 && game.state === 'playing') {
            const p = project(e.hx, 1.05, e.hz);
            if (guarding()) {                    // the raised katana turns the blade aside
              burst(p ? p.x : W * 0.5, p ? p.y : H * 0.5, '#cfe3ff', 12, 230);
              game.deflects++;
              Sound.deflect();
            } else {
              hurt(randInt(KNIFE_DAMAGE[0], KNIFE_DAMAGE[1]), p ? p.x : W * 0.5);
            }
          }
        }
      } else {
        e.cool -= dt;
        if (e.cool <= 0 && d <= KNIFE_REACH + 0.45) { e.swing = 0.0001; Sound.knife(); }
      }
    }
    if (e.state === 'alive' && e.burn > 0) {         // set alight by the flamethrower
      e.burn += dt;
      e.swing = 0; e.aim = 0;                        // fire puts the fight out of them
      if (e.type === 'knife') e.stride += dt * 9;    // thrashing about
      if (e.burn >= FLAME_BURN) scorch(e);
    }
    if (e.state === 'dying') {
      e.t += dt;
      if (e.type === 'enemy' || e.type === 'knife') {
        const d = Math.min(1, e.t / 1.25);
        e.drop = easeInQuad(d);
        e.alpha = d < 0.6 ? 1 : 1 - (d - 0.6) / 0.4;
        if (d >= 1) game.entities.splice(i, 1);
      } else if (e.type === 'target') {
        const d = Math.min(1, e.t / 0.75);
        e.drop = easeInQuad(d);
        e.alpha = d < 0.72 ? 1 : 1 - (d - 0.72) / 0.28;
        if (d >= 1) game.entities.splice(i, 1);
      } else {
        const d = Math.min(1, e.t / 1.15);
        e.lowered = easeInOut(d) * e.poleH;
        e.alpha = d < 0.7 ? 1 : 1 - (d - 0.7) / 0.3;
        if (d >= 1) game.entities.splice(i, 1);
      }
    }
  }
}

function updateEffects(dt) {
  for (let i = game.tracers.length - 1; i >= 0; i--) {
    const t = game.tracers[i];
    t.life -= dt;
    if (t.life <= 0) game.tracers.splice(i, 1);
  }
  for (let i = game.pops.length - 1; i >= 0; i--) {
    const p = game.pops[i];
    p.life -= dt;
    p.y += dt * 1.6;
    if (p.life <= 0) game.pops.splice(i, 1);
  }
  for (let i = game.sparks.length - 1; i >= 0; i--) {
    const s = game.sparks[i];
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 420 * dt;
    if (s.life <= 0) game.sparks.splice(i, 1);
  }
}

/* =========================================================================
   THE SHOOTERS: their pistols, the rounds they send your way, deflecting
   them with the katana, and the damage you take.
   ========================================================================= */

// Where a shooter's pistol sits in the world: chest height, a little in front.
function enemyMuzzle(e) {
  const r = Math.hypot(e.hx, e.hz) || 1;
  return { x: e.hx - (e.hx / r) * 0.36, y: 1.42, z: e.hz - (e.hz / r) * 0.36 };
}

function enemyFire(e) {
  if (game.state !== 'playing') return;
  e.flash = 1;
  Sound.enemyShot();

  const m = enemyMuzzle(e);
  const dist = Math.hypot(e.hx - cam.x, e.hz - cam.z);
  const hitChance = clamp(0.72 - dist * 0.012, 0.18, 0.6);   // far shooters miss more
  const aimed = Math.random() < hitChance;

  let tx = cam.x, ty = cam.y - 0.34, tz = cam.z;
  if (aimed) {
    tx += rand(-0.3, 0.3); ty += rand(-0.22, 0.22); tz += rand(-0.3, 0.3);
  } else {                                  // a wide round that cracks past your ear
    const a = rand(0, TAU), off = rand(0.8, 2.1);
    tx += Math.cos(a) * off; tz += Math.sin(a) * off;
    ty += rand(-0.5, 0.9);
  }

  game.bullets.push({
    from: e,                          // who fired it: a round turned aside goes back to him
    x0: m.x, y0: m.y, z0: m.z,
    x: m.x, y: m.y, z: m.z,
    tx: tx, ty: ty, tz: tz,
    dist: Math.hypot(tx - m.x, ty - m.y, tz - m.z),
    travelled: 0,
    speed: 95,
    aimed: aimed,
    life: 1.6
  });
}

// Is this round inside the sweep of a swing? A sphere around the eye: the blade
// goes round, so it does not matter which way the shot is coming from.
function inSliceReach(b) {
  if (game.sliceT <= 0 || !katanaOut()) return false;
  return Math.hypot(b.x - cam.x, b.y - cam.y, b.z - cam.z) <= SLICE_REACH;
}

function updateBullets(dt) {
  for (let i = game.bullets.length - 1; i >= 0; i--) {
    const b = game.bullets[i];
    b.travelled += b.speed * dt;
    b.life -= dt;
    const u = Math.min(1, b.travelled / b.dist);
    b.x = lerp(b.x0, b.tx, u);
    b.y = lerp(b.y0, b.ty, u);
    b.z = lerp(b.z0, b.tz, u);
    // A round already on its way back is past all of this: nothing on the range
    // catches it twice, and it answers only to the shooter it was sent at.
    if (!b.returning) {
      if (inSliceReach(b)) {               // a live swing catches it on the way in
        sliceBullet(b);
        game.bullets.splice(i, 1);
        continue;
      }
      if (inGuardReach(b)) {               // the raised blade turns it back on the shooter
        turnAside(b);
        continue;                          // ...and it keeps flying, the other way
      }
    }
    if (u >= 1 || b.life <= 0) {
      if (!resolveBullet(b)) game.bullets.splice(i, 1);
    }
  }
}

// Cut in two: sparks off the edge and the halves spinning off to either side.
function sliceBullet(b) {
  const p = project(b.x, b.y, b.z);
  const sx = p ? p.x : W * 0.5, sy = p ? p.y : H * 0.5;

  game.slices++;
  game.score += SLICE_POINTS;
  Sound.slice();
  burst(sx, sy, '#ffe9b0', 24, 420);
  burst(sx, sy, '#eaf3ff', 12, 260);
  for (let s = -1; s <= 1; s += 2) {
    addTracer(
      { x: sx, y: sy },
      { x: sx + s * rand(80, 170), y: sy + rand(-70, 70) },
      true
    );
  }
  game.pops.push({
    x: b.x, y: b.y, z: b.z, text: 'SLICED +' + SLICE_POINTS,
    life: 0.95, max: 0.95, color: '#eaf3ff'
  });
  updateHud();
}

function katanaOut() { return currentGun().melee === true; }

// The guard is up while the right button is held, and stays up for a moment after a
// tap of it: a quick right click should fend a round off, not only a long press.
function guarding() { return katanaOut() && (gun.aim > 0.5 || game.guardT > 0); }

// Is this round inside the bubble the raised blade covers? All angles: the guard
// goes up over the head, so it fends off shots from anywhere.
function inGuardReach(b) {
  if (!guarding()) return false;
  return Math.hypot(b.x - cam.x, b.y - cam.y, b.z - cam.z) <= GUARD_REACH;
}

// Knock a round off its line before it ever reaches you: sparks where the blade
// meets it, a DEFLECTED callout, and then it is on its way back at the man who
// fired it.
function turnAside(b) {
  const p = project(b.x, b.y, b.z);
  const sx = p ? p.x : W * 0.5, sy = p ? p.y : H * 0.5;

  game.deflects++;
  game.lastDeflect = { x: b.x, y: b.y, z: b.z };
  Sound.deflect();
  burst(sx, sy, '#ffe9b0', 18, 320);
  game.pops.push({
    x: b.x, y: b.y, z: b.z, text: 'DEFLECTED',
    life: 0.9, max: 0.9, color: '#bfe9ff'
  });

  sendBack(b);                             // whipped straight back at the man who fired it
  const q = project(b.tx, b.ty, b.tz);
  addDeflectTracer(sx, sy, q);
  updateHud();
}

// The streak off the blade. A round turned aside behind you has nowhere sensible to
// point at, so it just flicks a short streak across the eye line instead.
function addDeflectTracer(sx, sy, q) {
  const x2 = q && Number.isFinite(q.x) ? q.x : sx + rand(-90, 90);
  const y2 = q && Number.isFinite(q.y) ? q.y : sy + rand(-90, 90);
  if (!Number.isFinite(sx) || !Number.isFinite(sy) ||
      !Number.isFinite(x2) || !Number.isFinite(y2)) return;
  addTracer({ x: sx, y: sy }, { x: x2, y: y2 }, true);
}

// Turn a round round: it keeps the same flight, but now it is aimed at the shooter
// who fired it. The muzzle is left where the round came from so a shot with no man
// behind it still has somewhere to go (and harmlessly cracks off the range).
function sendBack(b) {
  const e = b.from;
  const live = e && e.state === 'alive';
  const fin = Number.isFinite;
  const ox = fin(b.x0) ? b.x0 : b.x, oy = fin(b.y0) ? b.y0 : b.y, oz = fin(b.z0) ? b.z0 : b.z;
  b.returning = true;
  b.to = live ? e : null;
  b.x0 = b.x; b.y0 = b.y; b.z0 = b.z;
  b.tx = live ? e.hx : ox;
  b.ty = live ? 1.15 : oy;
  b.tz = live ? e.hz : oz;
  b.dist = Math.hypot(b.tx - b.x0, b.ty - b.y0, b.tz - b.z0);
  if (!fin(b.dist) || b.dist < 0.001) b.dist = 1;
  b.travelled = 0;
  b.speed = Math.max(b.speed, 120);        // it comes back harder than it left
  b.life = Math.max(b.life, b.dist / b.speed + 0.25);
  return b;
}

// It arrives. If the man who fired it is still standing where he was, his own round
// puts him down; otherwise it puffs into the dirt behind where he stood.
function returnHit(b) {
  const p = project(b.x, b.y, b.z);
  const sx = p ? p.x : W * 0.5, sy = p ? p.y : H * 0.5;
  const e = b.to;

  if (e && e.state === 'alive' && Math.hypot(e.hx - b.tx, e.hz - b.tz) <= 1.4) {
    game.pops.push({
      x: b.tx, y: 1.85, z: b.tz, text: 'RETURNED',
      life: 1.0, max: 1.0, color: '#ffd166'
    });
    applyHit({ e: e, hit: { x: sx, y: sy, depth: b.dist, head: false } });
    return true;
  }
  burst(sx, sy, '#9fb3c8', 6, 160);
  return false;
}

// The blade turns a round aside if it is out and the shot comes from the front,
// or from any angle at all while the guard is raised.
function deflectsShot(b) {
  if (!katanaOut()) return false;
  if (guarding()) return true;
  const dx = b.x - cam.x, dz = b.z - cam.z;
  const d = Math.hypot(dx, dz) || 1;
  return (dx / d) * Math.sin(cam.yaw) + (dz / d) * Math.cos(cam.yaw) > 0.75;
}

function resolveBullet(b) {
  const p = project(b.x, b.y, b.z);
  const sx = p ? p.x : W * 0.5, sy = p ? p.y : H * 0.5;

  // Returns true while the round lives on: one turned back keeps flying, the other
  // way this time, so the caller must leave it in the air.
  if (b.returning) { returnHit(b); return false; }  // a round sent back answers to the shooter

  if (deflectsShot(b)) {
    turnAside(b);                                   // ...and it is on its way back to him
    return !!b.returning;
  }

  if (!b.aimed) { burst(sx, sy, '#9fb3c8', 6, 150); return false; }
  hurt(randInt(7, 13), sx);
  return false;
}

/* =========================================================================
   ENERGY CELLS & THE ENERGY PISTOLS
   Drop a shooter and he may leave a glowing cell behind; it drifts to your
   hands on its own. Three cells load the energy pistols, and for the rest of
   the round they fire as long as you hold the trigger.
   ========================================================================= */
let needHintAt = -10;
let lastBurnSoundAt = -10;      // keeps a whole crowd catching light from sizzling at once

function energyRoll() {
  return Math.random() < dropChance;
}

/* A cell left where a shooter went down. It lives in the entity list so the
   depth sort and the projector place it like anything else on the range. */
function dropEnergy(e) {
  const cell = {
    type: 'energy', x: e.hx, z: e.hz, hx: e.hx, hz: e.hz,
    y: 1.12, state: 'cell', t: 0, wob: rand(0, TAU)
  };
  game.entities.push(cell);
  game.pops.push({
    x: e.hx, y: 1.75, z: e.hz, text: 'ENERGY CELL', life: 0.95, max: 0.95, color: '#8ceaff'
  });
  Sound.pickup();
  return cell;
}

function collectEnergy(cell) {
  game.energy = Math.min(ENERGY_MAX, game.energy + 1);
  game.pops.push({
    x: cell.x, y: 1.35, z: cell.z, text: 'ENERGY +1', life: 1, max: 1, color: '#8ceaff'
  });
  burst(cell.x, cell.y, '#7ef0ff', 16);
  Sound.pickup();
  maybeCharge();
  updateHud();
}

/* Three cells and the pistols are in hand? Then they load themselves. */
function maybeCharge() {
  if (game.charged || !energyPistolsOut() || game.energy < ENERGY_MAX) return false;
  game.energy = 0;
  game.charged = true;
  Sound.load();
  game.pops.push({
    x: cam.x, y: 1.95, z: cam.z + 2.4, text: 'CHARGED ∞', life: 1.3, max: 1.3, color: '#8ceaff'
  });
  updateHud();
  return true;
}

function energyPistolsOut() {
  return currentGun().energy === true;
}

/* An unloaded pair clicks, and says how many cells it is still short. */
function needEnergy() {
  if (game.time - needHintAt < 1.2) return;
  needHintAt = game.time;
  game.pops.push({
    x: cam.x, y: 1.9, z: cam.z + 2.2,
    text: 'ENERGY ' + game.energy + ' / ' + ENERGY_MAX, life: 1.15, max: 1.15, color: '#8ceaff'
  });
}

/* =========================================================================
   CARTRIDGE ROUNDS & THE SNIPER RIFLE
   The same bargain as the energy cells, paid in brass: drop a shooter and he
   may leave a cartridge behind, and it drifts into your hands on its own.
   Three rounds load the scoped rifle, and a loaded rifle holds for the level.
   ========================================================================= */
let needRoundHintAt = -10;

function roundRoll() {
  return Math.random() < roundChance;
}

/* A cartridge left where a shooter went down. Like a cell it lives in the entity
   list, so the depth sort and the projector place it with everything else. */
function dropRound(e) {
  const cart = {
    type: 'round', x: e.hx, z: e.hz, hx: e.hx, hz: e.hz,
    y: 1.02, state: 'cell', t: 0, wob: rand(0, TAU)
  };
  game.entities.push(cart);
  game.pops.push({
    x: e.hx, y: 1.75, z: e.hz, text: 'CARTRIDGE', life: 0.95, max: 0.95, color: '#ffd27a'
  });
  Sound.pickup();
  return cart;
}

function collectRound(cart) {
  game.rounds = Math.min(ROUND_MAX, game.rounds + 1);
  game.pops.push({
    x: cart.x, y: 1.35, z: cart.z, text: 'ROUND +1', life: 1, max: 1, color: '#ffd27a'
  });
  burst(cart.x, cart.y, '#ffd98a', 16);
  Sound.pickup();
  maybeLoadSniper();
  updateHud();
}

/* Three rounds and the rifle in hand? Then it loads itself. */
function maybeLoadSniper() {
  if (game.sniperLoaded || !sniperOut() || game.rounds < ROUND_MAX) return false;
  game.rounds = 0;
  game.sniperLoaded = true;
  Sound.load();
  game.pops.push({
    x: cam.x, y: 1.95, z: cam.z + 2.4, text: 'LOADED ∞', life: 1.3, max: 1.3, color: '#ffd27a'
  });
  updateHud();
  return true;
}

function sniperOut() {
  return currentGun().sniper === true;
}

/* An empty rifle clicks, and says how many rounds it is still short. */
function needRounds() {
  if (game.time - needRoundHintAt < 1.2) return;
  needRoundHintAt = game.time;
  game.pops.push({
    x: cam.x, y: 1.9, z: cam.z + 2.2,
    text: 'ROUNDS ' + game.rounds + ' / ' + ROUND_MAX, life: 1.15, max: 1.15, color: '#ffd27a'
  });
}

/* ---------------- health & the med kit ---------------- */
function hurt(n, screenX) {
  if (game.state !== 'playing') return;
  if (perkOn('flak')) n = Math.max(1, Math.round(n * 0.5));
  game.hp = Math.max(0, game.hp - n);
  game.hurtFlash = 1;
  game.hurtFrom = typeof screenX === 'number' ? screenX : W * 0.5;
  cam.shake = Math.max(cam.shake, 0.9);
  Sound.hurt();
  updateHud();
  if (game.hp <= 0) playerDown();
}

function playerDown() {
  game.state = 'down';
  aiming = false;
  sightKicked = false;
  triggerHeld = false;
  gun.aim = 0;
  game.guardT = 0;
  Sound.pick();
  showOverlay('down', {
    kills: game.kills, deflects: game.deflects, slices: game.slices, acc: accuracy()
  });
  updateHud();
}

function useMedKit() {
  if (game.state !== 'playing') return false;
  if (game.medKits <= 0 || game.healing > 0 || game.hp >= MAX_HP) return false;
  game.medKits--;
  game.healing = MED_TIME;
  game.healLeft = Math.min(MED_HEAL, MAX_HP - game.hp);
  Sound.heal();
  updateHud();
  return true;
}

function tickHeal(dt) {
  if (game.healing <= 0) return;
  const rate = MED_HEAL / MED_TIME;
  const amount = Math.min(game.healLeft, rate * dt);
  game.hp = Math.min(MAX_HP, game.hp + amount);
  game.healLeft -= amount;
  game.healing -= dt;
  if (game.healing <= 0 || game.healLeft <= 0) { game.healing = 0; game.healLeft = 0; }
  updateHud();
}

/* ---------------- hit testing (screen space, nearest wins) ---------------- */
function targetFace(e) {
  const cy = e.y - e.drop * e.y;
  const p = project(e.hx, cy, e.hz);
  if (!p) return null;
  return {
    x: p.x, y: p.y, k: p.k, depth: p.depth,
    radius: Math.max(e.r * p.k, 9),
    droop: e.drop
  };
}

function flagShape(e) {
  const hy = e.poleH - e.lowered;
  const pTop = project(e.x, hy, e.z);
  const pBot = project(e.x, hy - e.h, e.z);
  const pBase = project(e.x, 0, e.z);
  if (!pTop || !pBot || !pBase) return null;
  return {
    pTop: pTop, pBot: pBot, pBase: pBase, k: pTop.k,
    w: e.w * pTop.k,
    h: Math.abs(pBot.y - pTop.y),
    depth: pTop.depth
  };
}

// Screen-space box for one of the shooters: both the hit test and the art use it.
function enemyFace(e) {
  const feet = project(e.hx, 0, e.hz);
  if (!feet) return null;
  const k = feet.k;
  const top = feet.y - e.h * k;
  return {
    x: feet.x, k: k, depth: feet.depth,
    top: top,
    bot: feet.y,
    headBot: feet.y - (e.h - 0.26) * k,
    halfW: Math.max(11, e.r * k)
  };
}

function hitTest(e) {
  if (e.type === 'target') {
    const f = targetFace(e);
    if (!f) return null;
    if (Math.hypot(cross.x - f.x, cross.y - f.y) > f.radius * 1.04) return null;
    return { x: cross.x, y: cross.y, depth: f.depth };
  }
  if (e.type === 'enemy' || e.type === 'knife') {
    const f = enemyFace(e);
    if (!f) return null;
    if (cross.x < f.x - f.halfW || cross.x > f.x + f.halfW) return null;
    if (cross.y < f.top || cross.y > f.bot) return null;
    // the top quarter-metre of the body is the head, and pays double
    return { x: cross.x, y: cross.y, depth: f.depth, head: cross.y <= f.headBot };
  }
  const s = flagShape(e);
  if (!s) return null;
  const top = s.pTop.y;
  const bot = top + s.h;
  const inCloth = cross.x >= s.pTop.x - s.k * 0.12 && cross.x <= s.pTop.x + s.w * 1.02 &&
    cross.y >= top - s.k * 0.08 && cross.y <= bot + s.k * 0.08;
  const inPole = Math.abs(cross.x - s.pTop.x) <= Math.max(6, s.k * 0.15) &&
    cross.y >= top - s.k * 0.08 && cross.y <= s.pBase.y;
  if (!inCloth && !inPole) return null;
  return { x: cross.x, y: cross.y, depth: s.depth };
}

// Every alive thing under the crosshair, nearest first. A single-shot weapon only
// cares about the first; a bolt that carries through reads the whole list.
function findHits() {
  const hits = [];
  for (let i = 0; i < game.entities.length; i++) {
    const e = game.entities[i];
    if (e.state !== 'alive') continue;
    const h = hitTest(e);
    if (h) hits.push({ e: e, hit: h });
  }
  hits.sort(function (a, b) { return a.hit.depth - b.hit.depth; });
  return hits;
}

function findHit() {
  const hits = findHits();
  return hits.length ? hits[0] : null;
}

/* ---------------- the flamethrower's jet ---------------- */
// Where an entity sits on screen and how big it reads, in one place: the jet needs
// it to decide what it washes over, and the burning overlay needs it to draw.
function entityAnchor(e) {
  if (e.type === 'target') {
    const f = targetFace(e);
    return f ? { x: f.x, y: f.y, k: f.k, rad: f.radius } : null;
  }
  if (e.type === 'enemy' || e.type === 'knife') {
    const f = enemyFace(e);
    return f ? { x: f.x, y: (f.top + f.bot) * 0.5, k: f.k, rad: Math.max(f.halfW, (f.bot - f.top) * 0.5) } : null;
  }
  if (e.type === 'flag') {
    const s = flagShape(e);
    return s ? { x: s.pTop.x + s.w * 0.45, y: s.pTop.y + s.h * 0.5, k: s.k, rad: Math.max(s.w * 0.5, s.h * 0.5) } : null;
  }
  const p = project(e.x, e.y === undefined ? 1.1 : e.y, e.z);
  return p ? { x: p.x, y: p.y, k: p.k, rad: Math.max(8, p.k * 0.2) } : null;
}

// How far the crosshair sits from a body on screen: 0 when it is on it. Measured
// to the body's box, not its centre, so a wide flag still catches the jet.
function flameDistance(e) {
  if (e.type === 'enemy' || e.type === 'knife') {
    const f = enemyFace(e);
    if (!f) return Infinity;
    const dx = Math.max(0, Math.abs(cross.x - f.x) - f.halfW * 1.25);
    const dy = Math.max(0, Math.abs(cross.y - (f.top + f.bot) * 0.5) - (f.bot - f.top) * 0.62);
    return Math.hypot(dx, dy);
  }
  const a = entityAnchor(e);
  if (!a) return Infinity;
  return Math.max(0, Math.hypot(cross.x - a.x, cross.y - a.y) - a.rad);
}

// Everything in front of the nozzle, inside the jet's reach, close enough to the
// crosshair to catch: nearest first, so the near man takes the fire.
function coneTargets(reach, tol) {
  const found = [];
  for (let i = 0; i < game.entities.length; i++) {
    const e = game.entities[i];
    if (e.state !== 'alive') continue;
    if (e.type === 'energy' || e.type === 'round') continue;
    const x = e.type === 'flag' ? e.x : e.hx, z = e.type === 'flag' ? e.z : e.hz;
    const d = depthOf(x, z);
    if (!(d > 0.3) || d > reach) continue;
    const a = entityAnchor(e);
    if (!a) continue;
    if (flameDistance(e) > tol * a.k) continue;         // the cone widens with distance
    found.push({ e: e, d: d, a: a });
  }
  found.sort(function (p, q) { return p.d - q.d; });
  return found;
}

function flameTargets() { return coneTargets(FLAME_RANGE, FLAME_TOL); }

// A body the jet has touched: it is alight now, and burns down where it stands.
function ignite(e) {
  if (e.state !== 'alive' || e.burn > 0) return false;
  e.burn = 0.0001;
  e.burnFrom = game.time;
  if (game.time - lastBurnSoundAt > 0.25) { lastBurnSoundAt = game.time; Sound.burn(); }
  return true;
}

// The fire, not a bullet, is what put it down.
function scorch(e) {
  const a = entityAnchor(e);
  const sx = a ? a.x : cross.x, sy = a ? a.y : cross.y;
  burst(sx, sy, '#ffb03a', 26, 340);
  burst(sx, sy, '#ffe9a8', 14, 210);
  const x = e.type === 'flag' ? e.x : e.hx, z = e.type === 'flag' ? e.z : e.hz;
  applyHit({ e: e, hit: { x: sx, y: sy, depth: depthOf(x, z), head: false }, flame: true });
}

// One squirt of the jet: light up whatever it reaches, and leave embers where it lands.
function sprayFlame() {
  const caught = flameTargets();
  let fresh = 0;
  for (let i = 0; i < caught.length; i++) if (ignite(caught[i].e)) fresh++;
  burst(cross.x, cross.y, '#ffb03a', 3, 190);
  if (!caught.length) burst(cross.x, cross.y, '#c8ccd4', 1, 120);
  return fresh;
}

/* ---------------- the fire extinguisher ---------------- */
// Where a drum fire stands on screen, and how much of it the jet has to cover.
function fireAnchor(f) {
  const p = project(f.x, 0, f.z);
  if (!p) return null;
  return { x: p.x, y: p.y, k: p.k, rad: Math.max(9, p.k * 0.62) };
}

// The lit fires the jet can reach, nearest first.
function fireTargets() {
  const found = [];
  for (let i = 0; i < game.fires.length; i++) {
    const f = game.fires[i];
    if (f.state !== 'burning') continue;
    const d = depthOf(f.x, f.z);
    if (!(d > 0.3) || d > FOAM_RANGE) continue;
    const a = fireAnchor(f);
    if (!a) continue;
    // measured against the flames, which stand above the drum
    const dy = cross.y - (a.y - a.k * 0.5);
    if (Math.hypot(cross.x - a.x, dy) > a.rad + FOAM_TOL * a.k * 0.55) continue;
    found.push({ f: f, d: d, a: a });
  }
  found.sort(function (p, q) { return p.d - q.d; });
  return found;
}

// Foam on a fire: it takes a good few blasts, and then it is out for good.
function douse(f, a) {
  if (!f || f.state !== 'burning') return false;
  f.douse = Math.min(1, f.douse + FOAM_DOSE);
  if (f.douse < 1) return false;
  f.state = 'out';
  f.outAt = game.time;
  game.firesDone++;
  game.score += FIRE_SCORE;
  const x = a ? a.x : cross.x, y = a ? a.y - a.k * 0.5 : cross.y;
  burst(x, y, '#f6fbfd', 30, 280);
  burst(x, y, '#dbe8ee', 18, 210);
  game.pops.push({ x: x, y: y, text: 'OUT +' + FIRE_SCORE, life: 1.0, max: 1.0, color: '#eaf6fb' });
  Sound.hiss();
  maybeComplete();
  return true;
}

// One squirt: the nearest fire under the crosshair goes down a little, and a shooter
// in the blast comes away coughing foam, his aim gone for a moment.
function sprayFoam() {
  let any = false;
  const fires = fireTargets();
  if (fires.length) any = douse(fires[0].f, fires[0].a) || true;

  const caught = coneTargets(FOAM_RANGE, FOAM_TOL);
  for (let i = 0; i < caught.length; i++) {
    const e = caught[i].e;
    if (e.type !== 'enemy' && e.type !== 'knife') continue;
    if (e.choke === undefined) e.choke = 0;
    if (e.choke < CHOKE_TIME) {
      const a = caught[i].a;
      burst(a.x, a.y, '#f2f9fc', 2, 130);
    }
    e.choke = CHOKE_TIME;
    any = true;
    break;                                     // the near body takes the wash
  }
  if (!any) burst(cross.x, cross.y, '#e6f1f6', 1, 110);
  return any;
}

/* ---------------- effects ---------------- */
function burst(x, y, color, n, spread) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const sp = rand(60, spread || 340);
    game.sparks.push({
      x: x, y: y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 70,
      life: rand(0.22, 0.6),
      max: 0.6,
      color: color,
      size: rand(1.4, 3.4)
    });
  }
}

function addTracer(from, to, strong, tint) {
  const life = strong ? 0.08 : 0.06;
  game.tracers.push({
    x1: from.x, y1: from.y, x2: to.x, y2: to.y,
    life: life, max: life, strong: !!strong, tint: tint || null
  });
}

/* ---------------- shooting ---------------- */
function applyHit(found) {
  const e = found.e;
  e.state = 'dying';
  e.t = 0;

  if (e.type === 'enemy' || e.type === 'knife') {   // a man, not a target: he stays down for good
    if (e.type === 'enemy') game.enemiesDone++; else game.knivesDone++;
    game.kills++;
    const head = !!found.hit.head;
    const pts = (head ? 250 : 150) + (found.flame ? FLAME_SCORCH : 0);
    if (found.flame) game.burned++;
    game.score += pts;
    game.pops.push({
      x: e.hx, y: 1.15, z: e.hz,
      text: found.flame ? 'BURNED +' + pts : (head ? 'HEADSHOT +' + pts : '+' + pts),
      life: 1.0, max: 1.0,
      color: found.flame ? '#ffb03a' : (head ? '#ffd166' : '#ffb0a2')
    });
    burst(found.hit.x, found.hit.y, '#e0564a', 22);
    Sound.hit();
    // he may have been carrying a cell or a cartridge: it drops where he fell and drifts to you
    if (!game.charged && game.energy < ENERGY_MAX && energyRoll()) dropEnergy(e);
    if (!game.sniperLoaded && game.rounds < ROUND_MAX && roundRoll()) dropRound(e);
    updateHud();
    maybeComplete();
    return;
  }

  const base = e.type === 'target' ? 100 : 60;
  const distBonus = Math.round(clamp(36 - found.hit.depth * 0.7, 0, 36));
  const pts = base + distBonus + (found.flame ? FLAME_SCORCH : 0);
  if (found.flame) game.burned++;
  game.score += pts;

  if (e.type === 'target') game.targetsDone++; else game.flagsDone++;

  const isTarget = e.type === 'target';
  game.pops.push({
    x: isTarget ? e.hx : e.x,
    y: isTarget ? (e.y - e.drop * e.y) + e.r + 0.55 : (e.poleH - e.lowered) + 0.55,
    z: isTarget ? e.hz : e.z,
    text: '+' + pts,
    life: 1.0,
    max: 1.0,
    color: isTarget ? '#ffb0a2' : '#a5dcff'
  });
  burst(found.hit.x, found.hit.y, isTarget ? '#ffd9a0' : '#ffe08a', isTarget ? 20 : 14);

  if (isTarget) Sound.hit(); else Sound.flagHit();
  updateHud();

  maybeComplete();
}

// Every quota has to be filled before the range lets you move on.
function maybeComplete() {
  if (game.targetsDone >= game.targetsNeeded &&
      game.flagsDone >= game.flagsNeeded &&
      game.enemiesDone >= game.enemiesNeeded &&
      game.knivesDone >= game.knivesNeeded &&
      game.firesDone >= game.firesNeeded) completeLevel();
}

/* ---------------- the katana ---------------- */
// A swing: no ammo, no tracer. Anything drawing a bead on you inside the arc
// and within reach goes down.
function slash() {
  const w = currentGun();
  if (game.state !== 'playing') return;
  if (game.time - lastShotAt < w.interval) return;

  lastShotAt = game.time;
  gun.recoil = w.recoil;
  cam.shake = w.shake;
  game.shots++;
  game.sliceT = SLICE_TIME;        // the blade stays live for a moment after the swing

  let best = null, bestDepth = Infinity;
  for (let i = 0; i < game.entities.length; i++) {
    const e = game.entities[i];
    if (e.state !== 'alive' || (e.type !== 'enemy' && e.type !== 'knife')) continue;
    const d = depthOf(e.hx, e.hz);
    if (d <= 0.4 || d > w.reach) continue;
    const p = project(e.hx, 1.0, e.hz);
    if (!p) continue;
    const halfW = Math.max(34, e.r * p.k * 1.6);
    if (Math.abs(cross.x - p.x) > halfW) continue;
    if (Math.abs(cross.y - p.y) > Math.max(70, p.k * 1.15)) continue;   // chest height, roughly
    if (d < bestDepth) { bestDepth = d; best = e; }
  }

  Sound.slash();

  // a round already hanging inside the sweep goes down where it flies
  let credited = false;
  for (let i = game.bullets.length - 1; i >= 0; i--) {
    const b = game.bullets[i];
    if (!inSliceReach(b)) continue;
    sliceBullet(b);
    game.bullets.splice(i, 1);
    credited = true;
  }

  if (best) {
    credited = true;
    applyHit({ e: best, hit: { x: cross.x, y: cross.y, depth: bestDepth, head: false } });
  } else if (!credited) {
    burst(cross.x, cross.y, '#dfe6ef', 8, 220);   // a swing at empty air
  }
  if (credited) game.hits++;      // a cut man or a cut round: the swing did its job
  updateHud();
}

function fire() {
  const w = currentGun();
  if (game.state !== 'playing') return;
  if (w.melee) { slash(); return; }              // the katana swings instead of firing
  if (gun.reloading > 0) return;
  if (game.time - lastShotAt < w.interval) return;
  if (w.energy && !game.charged) {          // unloaded: it only clicks, and costs nothing
    Sound.emptyClick();
    needEnergy();
    return;
  }
  if (w.sniper && !game.sniperLoaded) {     // ...and the rifle is the same, but for the brass
    Sound.emptyClick();
    needRounds();
    return;
  }
  if (!w.energy && !w.sniper && gun.ammo <= 0) { Sound.emptyClick(); startReload(); return; }

  lastShotAt = game.time;
  if (w.energy || w.sniper) {               // a charged pair / a loaded rifle answer to no magazine
    needHintAt = -10;
    needRoundHintAt = -10;
  } else {
    gun.ammo--;
  }
  gun.recoil = w.recoil;
  gun.flash = 1;
  cam.pitch += w.kick * (1 - aimBlend() * 0.35);   // braced against the shoulder: less climb
  cam.shake = w.shake;
  game.shots++;

  if (w.ext) {                           // foam, not rounds: one blast of the nozzles
    gun.flash = 0;                         // no muzzle star: the jet draws its own root
    gun.foamT = FOAM_JET;                // ...and the foam hangs there between blasts
    if (game.time - gun.foamSeed > 0.28) { gun.foamSeed = game.time; Sound.foam(); }
    if (sprayFoam()) game.hits++;
    updateHud();
    return;
  }

  if (w.flame) {                           // fuel, not rounds: one squirt of the jet
    gun.flash = 0;                         // no muzzle star: the jet draws its own root
    gun.flameT = FLAME_JET;                // ...and the flame lingers between squirts
    if (game.time - gun.flameSeed > 0.3) { gun.flameSeed = game.time; Sound.flame(); }
    if (sprayFlame()) game.hits++;
    updateHud();
    return;
  }

  const muzzle = gunMuzzle();
  const aimX = cross.x, aimY = cross.y;    // hitTest() reads the global crosshair
  const struck = [];
  let anyHit = false;

  // down the sights the pattern closes up: aimBlend() 0 -> full spread, 1 -> AIM_SPREAD
  const spread = w.spread * (1 - aimBlend() * (1 - AIM_SPREAD));

  for (let i = 0; i < w.pellets; i++) {
    if (i > 0) {                           // the first pellet flies true, the rest scatter
      cross.x = aimX + rand(-1, 1) * spread * W;
      cross.y = aimY + rand(-1, 1) * spread * W;
    }
    const founds = findHits();
    const found = founds.length ? founds[0] : null;
    const dx = cross.x - muzzle.x, dy = cross.y - muzzle.y;
    const len = Math.hypot(dx, dy) || 1;
    const impact = found ? found.hit : { x: cross.x + (dx / len) * 170, y: cross.y + (dy / len) * 170, depth: 999 };
    addTracer(muzzle, impact, !!found, w.bolt ? 'bolt' : null);

    if (!found) { burst(cross.x, cross.y, '#cfd6e0', w.pellets > 1 ? 2 : 6, 180); continue; }
    // An energy bolt keeps going down the line: it can strike the first few things
    // it passes through, so one shot can take a man and the flag behind him.
    const through = Math.min(w.pierce || 1, founds.length);
    for (let j = 0; j < through; j++) {
      const f = founds[j];
      if (struck.indexOf(f.e) !== -1) continue;   // a target only counts once per shot
      struck.push(f.e);
      applyHit(f);
      anyHit = true;
      if (j > 0) addTracer(muzzle, { x: f.hit.x, y: f.hit.y }, false, w.bolt ? 'bolt' : null);
    }
  }

  cross.x = aimX; cross.y = aimY;
  if (anyHit) game.hits++;                 // accuracy counts shots that connected

  // A shot fired off the shoulder throws the scoped rifle's sight picture down: the
  // bolt has to be cycled and the rifle re-shouldered, so the player releases the
  // right button and presses it again. Fired from the hip, there is nothing to drop.
  if (w.sniper && aimBlend() > 0.5) sightKicked = true;

  if (w.sound === 'boom') Sound.boom();
  else if (w.sound === 'zap') Sound.zap();
  else if (w.sound === 'crack') Sound.crack();
  else Sound.shot();
  updateHud();
}

/* ---------------- reloading ---------------- */
function startReload() {
  const w = currentGun();
  if (game.state !== 'playing') return false;
  if (gun.reloading > 0 || gun.ammo >= magSize(w)) return false;
  gun.reloading = reloadTime(w);
  Sound.reloadMech();
  updateHud();
  return true;
}

function tickReload(dt) {
  if (gun.reloading <= 0) return;
  gun.reloading -= dt;
  if (gun.reloading <= 0) {
    const w = currentGun();
    gun.reloading = 0;
    w.ammo = magSize(w);
    Sound.reloadMech();
    updateHud();
  }
}

/* ---------------- flow control ---------------- */
function accuracy() {
  return game.shots ? game.hits / game.shots : 0;
}

function completeLevel() {
  if (game.state !== 'playing') return;
  game.state = 'levelclear';

  const acc = accuracy();
  const clearBonus = 220 + game.level * 60;
  const accBonus = Math.round(acc * 300);
  const timeBonus = Math.max(0, Math.round(360 - game.levelTime * 10));
  game.score += clearBonus + accBonus + timeBonus;
  game.bestLevel = Math.max(game.bestLevel || 1, game.level + 1);

  // the perk bought for the round that just ended has done its work
  game.perk = null;
  game.offer = rollOffer();        // ...and the range puts one thing up for sale

  Sound.levelUp();
  showOverlay('levelclear', { clearBonus: clearBonus, accBonus: accBonus, timeBonus: timeBonus, acc: acc });
  updateHud();
}

// Buy the offered power-up for the round about to start: the score pays for it and
// the perk is live only until this next level is cleared. Everything else (walking
// away, not having the points, or the offer running out) leaves the round as it is.
function buyOffer(index) {
  if (game.state !== 'levelclear' || !Array.isArray(game.offer)) return false;
  const pick = game.offer[index | 0];
  if (!pick) return false;
  if (game.score < pick.price) return false;
  game.score -= pick.price;
  game.perk = pick.id;
  game.offer = null;
  Sound.pick();
  nextLevel();
  return true;
}

function declineOffer() {
  if (game.state !== 'levelclear') return false;
  game.offer = null;
  game.perk = null;
  nextLevel();
  return true;
}

function nextLevel() {
  game.level++;
  game.offer = null;
  spawnLevel(game.level);
  game.state = 'playing';
  hideOverlay();
  updateHud();
}

function startGame() {
  Sound.ensure();
  Sound.gameStart();
  game.level = 1;
  game.score = 0;
  game.shots = 0;
  game.hits = 0;
  game.kills = 0;
  game.deflects = 0;
  game.slices = 0;
  game.sliceT = 0;
  game.guardT = 0;
  game.lastDeflect = null;
  game.time = 0;
  game.bestLevel = 1;
  game.perk = null;
  game.offer = null;
  game.hp = MAX_HP;
  game.medKits = MED_KITS;
  game.healing = 0;
  game.healLeft = 0;
  game.hurtFlash = 0;
  sightKicked = false;
  spawnLevel(1);
  game.state = 'playing';
  lastShotAt = game.time;
  hideOverlay();
  updateHud();
}

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    showOverlay('paused');
  } else if (game.state === 'paused') {
    game.state = 'playing';
    hideOverlay();
  }
}


/* =========================================================================
   WORLD RENDERING
   ========================================================================= */
function drawWorldSeg(x1, z1, x2, z2, y, color, alpha, width) {
  const a = depthOf(x1, z1), b = depthOf(x2, z2);
  if (a < 0.4 && b < 0.4) return;
  let ax = x1, az = z1, bx = x2, bz = z2;
  if (a < 0.4) {
    const t = (0.4 - a) / (b - a);
    ax = x1 + (x2 - x1) * t; az = z1 + (z2 - z1) * t;
  } else if (b < 0.4) {
    const t = (0.4 - b) / (a - b);
    bx = x2 + (x1 - x2) * t; bz = z2 + (z1 - z2) * t;
  }
  const p1 = project(ax, y, az), p2 = project(bx, y, bz);
  if (!p1 || !p2) return;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawSky() {
  const hy = horizonY();
  const top = Math.min(0, hy - H * 1.2);
  const g = ctx.createLinearGradient(0, top, 0, hy);
  g.addColorStop(0, '#0a1626');
  g.addColorStop(0.45, '#274f7c');
  g.addColorStop(0.78, '#7d7fa0');
  g.addColorStop(1, '#e0a473');
  ctx.fillStyle = g;
  ctx.fillRect(-40, top, W + 80, hy - top + 1);
}

function drawSun() {
  const p = project(Math.sin(0.42) * 420, 34, Math.cos(0.42) * 420);
  if (!p) return;
  const r = Math.max(60, H * 0.22);
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, 'rgba(255, 226, 170, 0.95)');
  g.addColorStop(0.16, 'rgba(255, 196, 120, 0.55)');
  g.addColorStop(0.5, 'rgba(255, 150, 90, 0.18)');
  g.addColorStop(1, 'rgba(255, 140, 80, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.fill();
}

function drawGround() {
  const hy = horizonY();
  const g = ctx.createLinearGradient(0, hy, 0, H);
  g.addColorStop(0, '#6f7a4d');
  g.addColorStop(0.35, '#4c5a35');
  g.addColorStop(1, '#26311d');
  ctx.fillStyle = g;
  ctx.fillRect(-40, hy, W + 80, H - hy + 60);
}

function drawGrid() {
  const near = 3, far = 84, half = 42;
  for (let z = near; z <= far; z += 5) {
    for (let x = -half; x < half; x += 8) {
      const d = Math.hypot(x + 4, z);
      const alpha = 0.3 * (1 - d / 95);
      if (alpha > 0.012) drawWorldSeg(x, z, x + 8, z, 0.01, '#a8d78d', alpha, 1);
    }
  }
  for (let x = -half; x <= half; x += 8) {
    for (let z = near; z < far; z += 9) {
      const d = Math.hypot(x, z + 4.5);
      const alpha = 0.26 * (1 - d / 95);
      if (alpha > 0.012) drawWorldSeg(x, z, x, z + 9, 0.01, '#93c880', alpha, 1);
    }
  }
}

function drawClouds() {
  for (let i = 0; i < game.scenery.length; i++) {
    const it = game.scenery[i];
    if (it.kind !== 'cloud') continue;
    const p = project(it.x, it.d, it.z);
    if (!p) continue;
    const w = it.w * p.k, h = it.h * p.k;
    if (w < 3) continue;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#ffdcbb';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, w * 0.5, h * 0.5, 0, 0, TAU);
    ctx.ellipse(p.x + w * 0.3, p.y + h * 0.12, w * 0.34, h * 0.4, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawScenery() {
  const items = [];
  for (let i = 0; i < game.scenery.length; i++) {
    const it = game.scenery[i];
    if (it.kind === 'cloud') continue;
    it.__depth = depthOf(it.x, it.z);
    if (it.__depth > 1) items.push(it);
  }
  items.sort((a, b) => b.__depth - a.__depth);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === 'hill') drawHill(it);
    else drawTree(it);
  }
}

function drawHill(it) {
  const left = { x: it.x - Math.cos(it.a) * it.w * 0.5, z: it.z + Math.sin(it.a) * it.w * 0.5 };
  const right = { x: it.x + Math.cos(it.a) * it.w * 0.5, z: it.z - Math.sin(it.a) * it.w * 0.5 };
  const pl = project(left.x, 0, left.z);
  const pr = project(right.x, 0, right.z);
  const pa = project(it.x, it.h, it.z);
  if (!pl || !pr || !pa) return;
  const g = ctx.createLinearGradient(0, pa.y, 0, (pl.y + pr.y) * 0.5);
  const mix = it.tint;
  g.addColorStop(0, 'rgba(88, 106, 116, 0.95)');
  g.addColorStop(1, mix > 0.5 ? 'rgba(60, 74, 66, 0.98)' : 'rgba(48, 62, 58, 0.98)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(pl.x, pl.y);
  ctx.quadraticCurveTo(pl.x + (pa.x - pl.x) * 0.4, pa.y + (pl.y - pa.y) * 0.12, pa.x, pa.y);
  ctx.quadraticCurveTo(pr.x + (pa.x - pr.x) * 0.4, pa.y + (pr.y - pa.y) * 0.12, pr.x, pr.y);
  ctx.closePath();
  ctx.fill();
}

function drawTree(it) {
  const base = project(it.x, 0, it.z);
  const top = project(it.x, it.h, it.z);
  if (!base || !top) return;
  const k = base.k;
  ctx.strokeStyle = 'rgba(46, 34, 24, 0.9)';
  ctx.lineWidth = Math.max(1, k * 0.14);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();

  const r = Math.max(2, it.h * k * 0.34);
  ctx.fillStyle = 'rgba(34, 66, 40, 0.94)';
  ctx.beginPath();
  ctx.ellipse(top.x, top.y, r, r * 0.9, 0, 0, TAU);
  ctx.ellipse(top.x - r * 0.7, top.y + r * 0.35, r * 0.75, r * 0.65, 0, 0, TAU);
  ctx.ellipse(top.x + r * 0.7, top.y + r * 0.3, r * 0.72, r * 0.62, 0, 0, TAU);
  ctx.fill();
}

/* ---------------- targets & flags ---------------- */
function drawTarget(e) {
  const f = targetFace(e);
  if (!f) return;
  const R = e.r * f.k;
  const baseL = project(e.hx - 0.5, 0, e.hz);
  const baseR = project(e.hx + 0.5, 0, e.hz);
  ctx.save();
  ctx.globalAlpha = e.alpha;

  if (baseL && baseR) {
    ctx.strokeStyle = '#6d5b45';
    ctx.lineWidth = Math.max(1.1, f.k * 0.075);
    ctx.beginPath();
    ctx.moveTo(f.x - R * 0.8, f.y + R * 0.5);
    ctx.lineTo(baseL.x, baseL.y);
    ctx.moveTo(f.x + R * 0.8, f.y + R * 0.5);
    ctx.lineTo(baseR.x, baseR.y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(58, 47, 34, 0.5)';
    ctx.beginPath();
    ctx.ellipse((baseL.x + baseR.x) * 0.5, (baseL.y + baseR.y) * 0.5,
      Math.max(1.5, f.k * 0.62), Math.max(0.8, f.k * 0.15), 0, 0, TAU);
    ctx.fill();
  }

  ctx.translate(f.x, f.y);
  ctx.rotate(f.droop * 1.15);
  ctx.scale(1, Math.max(0.08, 1 - 0.62 * f.droop));

  const rings = [[1, '#f5f7fa'], [0.72, '#e8422f'], [0.46, '#f5f7fa'], [0.22, '#e8422f']];
  for (let i = 0; i < rings.length; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.4, R * rings[i][0]), 0, TAU);
    ctx.fillStyle = rings[i][1];
    ctx.fill();
  }
  ctx.lineWidth = Math.max(0.8, R * 0.06);
  ctx.strokeStyle = 'rgba(24, 20, 16, 0.6)';
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.stroke();

  const sheen = ctx.createLinearGradient(-R, -R, R, R);
  sheen.addColorStop(0, 'rgba(255,255,255,0.32)');
  sheen.addColorStop(0.42, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawFlag(e) {
  const s = flagShape(e);
  if (!s) return;
  const pTop = s.pTop, pBase = s.pBase, k = s.k;

  ctx.save();
  ctx.globalAlpha = e.alpha;

  ctx.strokeStyle = '#cbd4de';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2, k * 0.045);
  ctx.beginPath();
  ctx.moveTo(pBase.x, pBase.y);
  ctx.lineTo(pTop.x, pTop.y);
  ctx.stroke();

  const w = s.w, h = s.h;
  const wave = Math.sin(game.time * 3.1 + e.x * 0.6) * k * 0.12;
  const wave2 = Math.sin(game.time * 3.1 + e.x * 0.6 + 1.3) * k * 0.2;

  ctx.beginPath();
  ctx.moveTo(pTop.x, pTop.y);
  ctx.quadraticCurveTo(pTop.x + w * 0.55, pTop.y + h * 0.12 + wave, pTop.x + w, pTop.y + h * 0.34 + wave2);
  ctx.lineTo(pTop.x + w * 0.9, pTop.y + h * 0.86 + wave2 * 0.6);
  ctx.quadraticCurveTo(pTop.x + w * 0.5, pTop.y + h * 0.96 + wave, pTop.x, pTop.y + h);
  ctx.closePath();
  const g = ctx.createLinearGradient(pTop.x, pTop.y, pTop.x + w, pTop.y + h);
  g.addColorStop(0, 'hsl(' + e.hue + ' 88% 64%)');
  g.addColorStop(1, 'hsl(' + ((e.hue + 30) % 360) + ' 82% 44%)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(pTop.x, pTop.y - Math.max(1.2, k * 0.07), Math.max(1.4, k * 0.075), 0, TAU);
  ctx.fillStyle = '#ffcb47';
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ---- the armed men ---- */
const JACKETS = [
  { coat: '#3c4a5e', trim: '#2b3546', hat: '#22303f' },
  { coat: '#5a4436', trim: '#3d2f26', hat: '#2f2318' },
  { coat: '#4a5450', trim: '#333b38', hat: '#26302c' },
  { coat: '#5b3a44', trim: '#3f2830', hat: '#33202a' }
];

// Drawn with the feet as the origin, +y down, so the body grows upwards.
function drawEnemy(e) {
  const f = enemyFace(e);
  if (!f) return;
  const k = f.k;
  const c = JACKETS[e.jacket % JACKETS.length];
  const aim = clamp(e.aim, 0, 1);

  ctx.save();
  ctx.globalAlpha = e.alpha;
  ctx.translate(f.x, f.bot);
  if (e.drop > 0) ctx.rotate(e.drop * 1.15);        // topples sideways about the boots

  // shadow
  ctx.fillStyle = 'rgba(40, 34, 26, 0.42)';
  ctx.beginPath();
  ctx.ellipse(0, 0, k * 0.42, k * 0.11, 0, 0, TAU);
  ctx.fill();

  // legs and boots
  ctx.fillStyle = '#2c333d';
  rrect(-0.24 * k, -0.92 * k, 0.2 * k, 0.9 * k, 0.06 * k); ctx.fill();
  rrect(0.04 * k, -0.92 * k, 0.2 * k, 0.9 * k, 0.06 * k); ctx.fill();
  ctx.fillStyle = '#1d2229';
  rrect(-0.27 * k, -0.07 * k, 0.26 * k, 0.07 * k, 0.03 * k); ctx.fill();
  rrect(0.01 * k, -0.07 * k, 0.26 * k, 0.07 * k, 0.03 * k); ctx.fill();

  // torso
  ctx.fillStyle = c.coat;
  rrect(-0.28 * k, -1.62 * k, 0.56 * k, 0.74 * k, 0.11 * k); ctx.fill();
  ctx.fillStyle = c.trim;
  rrect(-0.28 * k, -1.05 * k, 0.56 * k, 0.1 * k, 0.04 * k); ctx.fill();

  // head and cap
  ctx.fillStyle = SKIN_A;
  ctx.beginPath();
  ctx.arc(0, -1.73 * k, 0.135 * k, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.hat;
  ctx.beginPath();
  ctx.arc(0, -1.77 * k, 0.145 * k, Math.PI * 1.02, Math.PI * 2.02);
  ctx.fill();
  rrect(-0.2 * k, -1.82 * k, 0.4 * k, 0.05 * k, 0.02 * k);
  ctx.fill();

  // the extended arm, the pistol, and how far up it has come: a raised arm is
  // the tell that this one is about to shoot you
  const hy = -k * lerp(1.14, 1.5, aim);
  const hx = k * 0.26;
  ctx.strokeStyle = c.coat;
  ctx.lineWidth = Math.max(1.5, k * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0.2 * k, -1.5 * k);
  ctx.lineTo(hx, hy);
  ctx.stroke();

  const cx = (W * 0.5 - (f.x + hx)) / Math.max(1, k), cy = (H * 0.5 - (f.bot + hy)) / Math.max(1, k);
  const cd = Math.hypot(cx, cy) || 1;
  const ux = cx / cd, uy = cy / cd;                 // the barrel leans toward the viewer
  const mx = hx + ux * 0.42 * k, my = hy + uy * 0.42 * k;
  ctx.strokeStyle = '#16191d';
  ctx.lineWidth = Math.max(2, k * 0.09);
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(mx, my);
  ctx.stroke();

  if (e.flash > 0) {                                // his muzzle flash
    ctx.save();
    ctx.globalAlpha = e.alpha * e.flash;
    ctx.fillStyle = 'rgba(255, 214, 120, 0.95)';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + game.time * 4;
      const rr = i % 2 === 0 ? 0.17 * k : 0.07 * k;
      const px2 = mx + Math.cos(a) * rr, py2 = my + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (e.state === 'alive' && aim > 0) {              // the aiming tell over his head
    const pulse = 0.55 + 0.45 * Math.sin(game.time * 13);
    ctx.globalAlpha = e.alpha * aim * pulse;
    ctx.strokeStyle = '#ff5a4d';
    ctx.lineWidth = Math.max(1.4, k * 0.035);
    ctx.beginPath();
    ctx.arc(0, -2.02 * k, 0.1 * k, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#ff5a4d';
    ctx.beginPath();
    ctx.arc(0, -2.02 * k, 0.055 * k, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// The men with knives: same build as a shooter, but no pistol and no patience.
// The walk cycle swings the legs, and the blade comes up over the shoulder a beat
// before it lands -- that raised arm is the only warning you get.
function drawKnife(e) {
  const f = enemyFace(e);
  if (!f) return;
  const k = f.k;
  const c = JACKETS[(e.jacket + 1) % JACKETS.length];
  const step = Math.sin(e.stride);
  const swing = clamp(e.swing, 0, 1);
  const live = e.state === 'alive';

  ctx.save();
  ctx.globalAlpha = e.alpha;
  ctx.translate(f.x, f.bot);
  if (e.drop > 0) ctx.rotate(e.drop * 1.15);

  // shadow
  ctx.fillStyle = 'rgba(40, 34, 26, 0.42)';
  ctx.beginPath();
  ctx.ellipse(0, 0, k * 0.42, k * 0.11, 0, 0, TAU);
  ctx.fill();

  // legs, striding
  ctx.fillStyle = '#272e37';
  ctx.save();
  ctx.translate(-0.13 * k, -0.92 * k);
  ctx.rotate(step * (live ? 0.3 : 0));
  rrect(-0.1 * k, 0, 0.2 * k, 0.9 * k, 0.06 * k); ctx.fill();
  ctx.fillStyle = '#171b21';
  rrect(-0.13 * k, 0.83 * k, 0.26 * k, 0.07 * k, 0.03 * k); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#272e37';
  ctx.save();
  ctx.translate(0.13 * k, -0.92 * k);
  ctx.rotate(-step * (live ? 0.3 : 0));
  rrect(-0.1 * k, 0, 0.2 * k, 0.9 * k, 0.06 * k); ctx.fill();
  ctx.fillStyle = '#171b21';
  rrect(-0.13 * k, 0.83 * k, 0.26 * k, 0.07 * k, 0.03 * k); ctx.fill();
  ctx.restore();

  // torso, leaning in as he closes
  ctx.fillStyle = c.coat;
  rrect(-0.28 * k, -1.62 * k, 0.56 * k, 0.74 * k, 0.11 * k); ctx.fill();
  ctx.fillStyle = c.trim;
  rrect(-0.28 * k, -1.09 * k, 0.56 * k, 0.09 * k, 0.04 * k); ctx.fill();
  // a strap across the chest, so he does not read as the shooter
  ctx.strokeStyle = 'rgba(20,22,26,0.55)';
  ctx.lineWidth = Math.max(1.5, k * 0.05);
  ctx.beginPath();
  ctx.moveTo(-0.24 * k, -1.55 * k);
  ctx.lineTo(0.22 * k, -1.02 * k);
  ctx.stroke();

  // head, hood up
  ctx.fillStyle = SKIN_B;
  ctx.beginPath();
  ctx.arc(0, -1.73 * k, 0.135 * k, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.hat;
  ctx.beginPath();
  ctx.arc(0, -1.75 * k, 0.16 * k, Math.PI * 0.92, Math.PI * 2.08);
  ctx.fill();
  rrect(-0.17 * k, -1.8 * k, 0.34 * k, 0.1 * k, 0.04 * k);
  ctx.fill();

  // the knife arm: carried low, then whipped up and across
  const lift = live ? swing * swing : 0;
  const hx = k * lerp(0.3, 0.14, lift);
  const hy = -k * lerp(1.02, 1.66, lift);
  ctx.strokeStyle = c.coat;
  ctx.lineWidth = Math.max(1.5, k * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0.2 * k, -1.5 * k);
  ctx.quadraticCurveTo(0.34 * k, hy * 0.62, hx, hy);
  ctx.stroke();

  // hand and blade, the point angled at you
  ctx.fillStyle = SKIN_B;
  ctx.beginPath();
  ctx.arc(hx, hy, Math.max(1.5, k * 0.075), 0, TAU);
  ctx.fill();

  const bladeLen = k * 0.46;
  const ang = lerp(-0.55, -1.75, lift) + (live ? Math.sin(game.time * 2.4) * 0.04 : 0);
  const bx = hx + Math.cos(ang) * 0.06 * k, by = hy + Math.sin(ang) * 0.06 * k;
  const tipX = hx + Math.cos(ang) * bladeLen, tipY = hy + Math.sin(ang) * bladeLen;
  const glint = 0.6 + 0.4 * Math.sin(game.time * 8 + e.stride);

  ctx.strokeStyle = '#0c0e12';
  ctx.lineWidth = Math.max(2.5, k * 0.075);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(226,238,248,' + (0.55 + glint * 0.35).toFixed(2) + ')';
  ctx.lineWidth = Math.max(1, k * 0.028);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(0.8, k * 0.014);
  ctx.beginPath();
  ctx.moveTo(hx + Math.cos(ang) * 0.1 * k, hy + Math.sin(ang) * 0.1 * k);
  ctx.lineTo(tipX - Math.cos(ang) * 0.08 * k, tipY - Math.sin(ang) * 0.08 * k);
  ctx.stroke();

  // the cut, if he is mid-swing: a thin arc off the blade
  if (live && swing > 0.55) {
    ctx.save();
    ctx.globalAlpha = e.alpha * (1 - (swing - 0.55) / 0.45) * 0.8;
    ctx.strokeStyle = '#eaf4ff';
    ctx.lineWidth = Math.max(1.4, k * 0.03);
    ctx.beginPath();
    ctx.arc(hx, hy, bladeLen * 0.95, ang - 1.1, ang + 0.35);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// Whatever the jet has set alight: tongues of fire licking up the body, and a
// little smoke above it. Drawn after the entity itself so it reads as on top.
function drawBurn(e) {
  if (!(e.burn > 0)) return;
  const a = entityAnchor(e);
  if (!a) return;
  const alive = e.state === 'alive';
  const f = alive ? clamp(e.burn / FLAME_BURN, 0, 1) : 1;
  const k = a.k;
  const baseY = a.y + a.rad * (e.type === 'flag' ? 0.2 : 0.55);
  const tall = k * (0.42 + 0.3 * f);

  ctx.save();
  ctx.globalAlpha = e.alpha;
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createLinearGradient(0, baseY, 0, baseY - tall);
  grad.addColorStop(0, 'rgba(255,214,120,0.95)');
  grad.addColorStop(0.45, 'rgba(255,132,44,0.75)');
  grad.addColorStop(1, 'rgba(214,52,18,0)');

  for (let i = 0; i < 5; i++) {
    const off = (i - 2) * k * 0.1 + Math.sin(game.time * 9 + e.ember + i) * k * 0.035;
    const h = tall * (0.62 + 0.38 * Math.sin(game.time * 11 + e.ember + i * 1.7));
    const w = k * (0.07 + 0.03 * (i % 2));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(a.x + off - w, baseY);
    ctx.quadraticCurveTo(a.x + off - w * 0.6, baseY - h * 0.6, a.x + off + Math.sin(game.time * 7 + i) * w, baseY - h);
    ctx.quadraticCurveTo(a.x + off + w * 0.7, baseY - h * 0.5, a.x + off + w, baseY);
    ctx.closePath();
    ctx.fill();
  }

  // the body itself glows through the fire
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(255,120,40,' + (0.08 + 0.12 * f).toFixed(3) + ')';
  ctx.beginPath();
  ctx.ellipse(a.x, a.y, a.rad * 0.9, a.rad * 1.1, 0, 0, TAU);
  ctx.fill();

  if (alive) {
    ctx.globalAlpha = e.alpha * 0.22;
    ctx.fillStyle = '#3b3330';
    ctx.beginPath();
    ctx.ellipse(a.x + Math.sin(game.time * 1.3 + e.ember) * k * 0.08, baseY - tall * 1.1,
      a.rad * 0.6, a.rad * 0.5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawFire(f) {
  const p = project(f.x, 0, f.z);
  if (!p || !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.k)) return;
  const k = p.k;
  const bw = Math.max(8, k * 0.58);              // drum half-width
  const bh = Math.max(9, k * 0.92);              // ...and its height
  const t = game.time + f.t;
  const burning = f.state === 'burning';
  const since = burning ? 0 : game.time - f.outAt;

  ctx.save();

  // scorched ring of grass under the drum
  ctx.fillStyle = 'rgba(24,18,12,0.30)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, bw * 1.7, bw * 0.6, 0, 0, TAU);
  ctx.fill();

  // fuel drum: banded steel, warm with soot while it burns
  const drum = ctx.createLinearGradient(p.x - bw, 0, p.x + bw, 0);
  drum.addColorStop(0, '#241f1b');
  drum.addColorStop(0.36, burning ? '#5d4a38' : '#4a4742');
  drum.addColorStop(0.64, burning ? '#4a3728' : '#3b3a36');
  drum.addColorStop(1, '#1d1a17');
  rrect(p.x - bw, p.y - bh, bw * 2, bh, Math.max(2.5, bw * 0.18));
  ctx.fillStyle = drum;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(1, bw * 0.08);
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(p.x - bw, p.y - bh + (bh * i) / 3);
    ctx.lineTo(p.x + bw, p.y - bh + (bh * i) / 3);
    ctx.stroke();
  }
  ctx.fillStyle = burning ? '#2c2118' : '#2a2a27';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - bh, bw, Math.max(2, bw * 0.26), 0, 0, TAU);
  ctx.fill();

  // foam where the blast has already broken on the drum, thicker the closer it is out
  if (f.douse > 0.02) {
    const cover = f.douse * (burning ? 1 : clamp(1 - since / 4, 0, 1));
    for (let i = 0; i < 9; i++) {
      const q = (i * 0.37 + f.seed * 0.5) % 1;
      const fx = p.x - bw * 0.82 + q * bw * 1.64;
      const fy = p.y - bh * 0.94 + ((i * 0.29) % 1) * bh * 0.86;
      const r = bw * (0.20 + 0.16 * ((i * 0.7) % 1)) * (0.55 + cover * 0.75);
      ctx.globalAlpha = clamp(0.30 + cover * 0.55, 0, 0.85);
      ctx.fillStyle = i % 3 === 0 ? '#dfeaf0' : '#f7fbfd';
      ctx.beginPath();
      ctx.ellipse(fx, fy, r, r * 0.82, 0, 0, TAU);
      ctx.fill();
    }
    // bubbles popping on the hot steel
    ctx.globalAlpha = clamp(0.25 + cover * 0.4, 0, 0.7);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) {
      const q = ((t * 0.6 + i * 0.21) % 1);
      const bx = p.x + Math.sin(t * 1.4 + i * 2.3 + f.seed) * bw * 0.75;
      const by = p.y - bh * (0.2 + q * 0.8);
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(1, bw * 0.07 * (1 - q * 0.5)), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (!burning) {
    // put out: steam off the hot steel, thinner every second, and a choke sheen
    const fade = clamp(1 - since / 3.4, 0, 1);
    if (fade > 0.01) {
      ctx.globalAlpha = fade * 0.5;
      ctx.fillStyle = '#dfe8ef';
      for (let i = 0; i < 4; i++) {
        const q = (t * 0.45 + i * 0.25) % 1;
        const sx = p.x + Math.sin(t * 1.3 + i * 2.1) * bw * 0.5;
        ctx.beginPath();
        ctx.ellipse(sx, p.y - bh - q * k * 1.5, bw * (0.3 + q * 0.55), bw * (0.22 + q * 0.4), 0, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(238,246,250,0.26)';
    rrect(p.x - bw, p.y - bh, bw * 2, bh, Math.max(2.5, bw * 0.18));
    ctx.fill();
    ctx.restore();
    return;
  }

  // the light it throws on the grass
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(p.x, p.y - bh * 0.8, 0, p.x, p.y - bh * 0.8, bw * 3.4);
  glow.addColorStop(0, 'rgba(255,150,60,0.34)');
  glow.addColorStop(0.5, 'rgba(255,110,30,0.13)');
  glow.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y - bh * 0.8, bw * 3.4, 0, TAU);
  ctx.fill();

  // the fire itself: tongues climbing off the open lid
  const tall = k * (1.35 + 0.18 * Math.sin(t * 3.1));
  const grad = ctx.createLinearGradient(0, p.y - bh, 0, p.y - bh - tall);
  grad.addColorStop(0, 'rgba(255,226,150,0.95)');
  grad.addColorStop(0.38, 'rgba(255,142,48,0.8)');
  grad.addColorStop(1, 'rgba(206,44,16,0)');
  const baseY = p.y - bh * 0.85;
  for (let i = 0; i < 6; i++) {
    const off = (i - 2.5) * bw * 0.3 + Math.sin(t * 4.5 + f.seed + i * 1.3) * bw * 0.16;
    const h = tall * (0.55 + 0.45 * Math.sin(t * 5.2 + f.seed + i * 1.9));
    const w = bw * (0.42 + 0.16 * (i % 3));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(p.x + off - w, baseY);
    ctx.quadraticCurveTo(p.x + off - w * 0.55, baseY - h * 0.62,
      p.x + off + Math.sin(t * 3.4 + i) * w * 0.8, baseY - h);
    ctx.quadraticCurveTo(p.x + off + w * 0.6, baseY - h * 0.5, p.x + off + w, baseY);
    ctx.closePath();
    ctx.fill();
  }

  // a hot core right at the lid
  ctx.fillStyle = 'rgba(255,248,214,0.55)';
  ctx.beginPath();
  ctx.ellipse(p.x, baseY, bw * 0.72, Math.max(2, bw * 0.34), 0, 0, TAU);
  ctx.fill();

  // embers climbing away
  for (let i = 0; i < 7; i++) {
    const q = (t * 0.55 + i * 0.143) % 1;
    const ex = p.x + Math.sin(t * 2.4 + f.seed + i * 2.7) * bw * (0.4 + q * 1.5);
    const ey = baseY - q * tall * 1.5;
    ctx.fillStyle = 'rgba(255,' + Math.round(200 - q * 110) + ',90,' + (0.75 * (1 - q)).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(0.8, bw * 0.07 * (1 - q * 0.6)), 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // smoke drifting off the top, dark and slow
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#2f2b28';
  for (let i = 0; i < 5; i++) {
    const q = ((t * 0.22 + i * 0.2) % 1);
    const sx = p.x + Math.sin(t * 0.9 + f.seed + i) * bw * 1.1 + q * bw * 1.4;
    const sy = baseY - tall * (0.9 + q * 1.5);
    ctx.beginPath();
    ctx.ellipse(sx, sy, bw * (0.5 + q * 0.9), bw * (0.4 + q * 0.7), 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// A choked man: foam clings to his face and chest, and he coughs it off.
function drawChoke(e) {
  if (!(e.choke > 0)) return;
  if (e.type !== 'enemy' && e.type !== 'knife') return;
  const f = enemyFace(e);
  if (!f || !isFinite(f.x) || !isFinite(f.k)) return;
  const a = clamp(e.choke / CHOKE_TIME, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.26 * (0.5 + a * 0.5);
  ctx.fillStyle = '#f1f8fb';
  ctx.beginPath();
  ctx.ellipse(f.x, (f.top + f.bot) * 0.52, f.halfW * 0.72, (f.bot - f.top) * 0.36, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.62 * a;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 3; i++) {
    const q = (game.time * 1.6 + i * 0.33) % 1;
    const dx = f.x + (i - 1) * f.halfW * 0.5;
    const dy = f.top + (f.bot - f.top) * (0.55 + q * 0.4);
    ctx.beginPath();
    ctx.ellipse(dx, dy, Math.max(1, f.k * 0.02), Math.max(1.6, f.k * 0.045), 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawEnergyCell(e) {
  const p = project(e.x, e.y, e.z);
  if (!p || !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.k)) return;
  const r = clamp(p.k * 0.15, 3, 40);
  const pulse = 0.72 + Math.sin(game.time * 7 + e.wob) * 0.28;

  // halo
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4.2);
  g.addColorStop(0, 'rgba(170, 246, 255, ' + (0.45 * pulse) + ')');
  g.addColorStop(1, 'rgba(80, 210, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 4.2, 0, TAU);
  ctx.fill();

  // the cell itself: a lit capsule that rocks as it drifts
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.sin(game.time * 1.8 + e.wob) * 0.35);
  const cg = ctx.createLinearGradient(0, -r, 0, r);
  cg.addColorStop(0, '#eafdff');
  cg.addColorStop(0.45, '#7ae6ff');
  cg.addColorStop(1, '#1f8ec4');
  rrect(-r * 0.62, -r, r * 1.24, r * 2, r * 0.34);
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(10, 26, 34, 0.55)';
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();
  rrect(-r * 0.26, -r * 0.62, r * 0.52, r * 1.24, r * 0.2);
  ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.55 + pulse * 0.4) + ')';
  ctx.fill();
  ctx.restore();
}

function drawRound(e) {
  const p = project(e.x, e.y, e.z);
  if (!p || !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.k)) return;
  const r = clamp(p.k * 0.105, 2.5, 34);
  const pulse = 0.7 + Math.sin(game.time * 6 + e.wob) * 0.3;

  // a warm halo, so brass still reads against the grass
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.6);
  g.addColorStop(0, 'rgba(255, 214, 132, ' + (0.4 * pulse) + ')');
  g.addColorStop(1, 'rgba(255, 190, 90, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 3.6, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.sin(game.time * 1.6 + e.wob) * 0.6);   // rocking where it landed
  const cg = ctx.createLinearGradient(-r, 0, r, 0);        // the case
  cg.addColorStop(0, '#8a5c1c');
  cg.addColorStop(0.4, '#f0c063');
  cg.addColorStop(1, '#a9762a');
  ctx.beginPath();
  ctx.moveTo(-r * 0.42, -r * 0.2);
  ctx.lineTo(r * 0.42, -r * 0.2);
  ctx.lineTo(r * 0.5, r * 1.9);
  ctx.lineTo(-r * 0.5, r * 1.9);
  ctx.closePath();
  ctx.fillStyle = cg;
  ctx.fill();
  rrect(-r * 0.62, r * 1.66, r * 1.24, r * 0.34, r * 0.12);   // rim
  ctx.fillStyle = '#c99538';
  ctx.fill();
  const bg = ctx.createLinearGradient(-r, 0, r, 0);           // the bullet
  bg.addColorStop(0, '#b8752e');
  bg.addColorStop(0.45, '#ffd9a0');
  bg.addColorStop(1, '#a25f22');
  ctx.beginPath();
  ctx.moveTo(-r * 0.42, -r * 0.2);
  ctx.lineTo(r * 0.42, -r * 0.2);
  ctx.quadraticCurveTo(r * 0.3, -r * 1.25, 0, -r * 1.55);
  ctx.quadraticCurveTo(-r * 0.3, -r * 1.25, -r * 0.42, -r * 0.2);
  ctx.closePath();
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 24, 8, 0.45)';
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.stroke();
  ctx.restore();
}

function drawEntities() {
  const list = [];
  for (let i = 0; i < game.entities.length; i++) {
    const e = game.entities[i];
    const x = e.type === 'flag' ? e.x : e.hx;
    const z = e.type === 'flag' ? e.z : e.hz;
    const d = depthOf(x, z);
    if (d > 0.5) list.push({ e: e, d: d });
  }
  for (let i = 0; i < game.fires.length; i++) {
    const f = game.fires[i];
    const d = depthOf(f.x, f.z);
    if (d > 0.5) list.push({ e: f, d: d });
  }
  list.sort((a, b) => b.d - a.d);
  for (let i = 0; i < list.length; i++) {
    const e = list[i].e;
    if (e.type === 'target') drawTarget(e);
    else if (e.type === 'enemy') drawEnemy(e);
    else if (e.type === 'knife') drawKnife(e);
    else if (e.type === 'energy') drawEnergyCell(e);
    else if (e.type === 'round') drawRound(e);
    else if (e.type === 'fire') drawFire(e);
    else drawFlag(e);
    drawBurn(e);
    drawChoke(e);
  }
}

/* ---------------- effects & overlays ---------------- */
function drawEffects() {
  for (let i = 0; i < game.tracers.length; i++) {
    const t = game.tracers[i];
    const a = clamp(t.life / t.max, 0, 1) * (t.strong ? 0.9 : 0.5);
    const g = ctx.createLinearGradient(t.x1, t.y1, t.x2, t.y2);
    const bolt = t.tint === 'bolt';                 // the energy pistols leave a blue streak
    g.addColorStop(0, bolt ? 'rgba(120, 230, 255, 0)' : 'rgba(255, 236, 170, 0)');
    g.addColorStop(0.25, bolt ? 'rgba(150, 240, 255, ' + a + ')' : 'rgba(255, 232, 160, ' + a + ')');
    g.addColorStop(1, bolt ? 'rgba(226, 250, 255, 0)' : 'rgba(255, 250, 220, 0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = t.strong ? 2.6 : 1.8;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }

  for (let i = 0; i < game.sparks.length; i++) {
    const s = game.sparks[i];
    ctx.globalAlpha = clamp(s.life / s.max, 0, 1);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // rounds coming the other way: a hot streak that grows as it reaches you
  for (let i = 0; i < game.bullets.length; i++) {
    const b = game.bullets[i];
    const head = project(b.x, b.y, b.z);
    if (!head) continue;
    const u = Math.max(0, (b.travelled - 1.8) / b.dist);
    const tail = project(lerp(b.x0, b.tx, u), lerp(b.y0, b.ty, u), lerp(b.z0, b.tz, u));
    if (tail) {
      const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      g.addColorStop(0, 'rgba(255, 170, 90, 0)');
      g.addColorStop(1, 'rgba(255, 226, 160, 0.9)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 240, 200, 0.95)';
    ctx.beginPath();
    ctx.arc(head.x, head.y, 2.4, 0, TAU);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.font = '700 19px ui-sans-serif, system-ui, sans-serif';
  for (let i = 0; i < game.pops.length; i++) {
    const p = game.pops[i];
    const pr = project(p.x, p.y, p.z);
    if (!pr) continue;
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(8, 12, 18, 0.75)';
    ctx.strokeText(p.text, pr.x, pr.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, pr.x, pr.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawCrosshair() {
  const x = cross.x, y = cross.y;
  const aim = aimBlend();
  const col = cross.hover ? '#ff6a5a' : 'rgba(255,255,255,0.92)';
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  // down the sights the crosshair pulls in tight
  const gap = (cross.hover ? 5 : 7) * (1 - aim * 0.75) + aim * 0.6;
  const len = (cross.hover ? 9 : 11) * (1 - aim * 0.5);
  ctx.beginPath();
  ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y);
  ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
  ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap);
  ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, cross.hover ? 2.6 : 2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawVignette() {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.35, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (gun.flash > 0) {
    ctx.globalAlpha = clamp(gun.flash, 0, 1) * 0.12;
    ctx.fillStyle = '#ffd9a0';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // blood in the corners: a red bloom where the round landed, and a permanent
  // pressure when you are running low
  const lowHp = game.hp > 0 && game.hp < MAX_HP * 0.34 ? (1 - game.hp / (MAX_HP * 0.34)) : 0;
  const hurt = clamp(game.hurtFlash, 0, 1);
  if (hurt > 0.01 || lowHp > 0.01 || game.healing > 0) {
    const fx = clamp(game.hurtFrom / W, 0, 1);
    const cxp = W * (fx * 0.7 + 0.15);
    const rg = ctx.createRadialGradient(cxp, H * 0.55, Math.min(W, H) * 0.06, cxp, H * 0.55, Math.max(W, H) * 0.62);
    const strength = Math.max(hurt * (0.55 + 0.2 * Math.sin(game.time * 22)), lowHp * (0.3 + 0.12 * Math.sin(game.time * 4)));
    rg.addColorStop(0, 'rgba(150, 12, 6, ' + (strength * 0.75).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(150, 12, 6, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  if (game.healing > 0) {                       // a green wash while a kit works
    ctx.globalAlpha = 0.1 * (0.6 + 0.4 * Math.sin(game.time * 9));
    ctx.fillStyle = '#7dffa8';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);
  const amp = cam.shake * 9;
  ctx.save();
  if (amp > 0.2) {
    ctx.translate(Math.sin(game.time * 61) * amp, Math.cos(game.time * 47) * amp * 0.7);
    ctx.rotate(cam.shake * 0.0035);
  }
  drawSky();
  drawSun();
  drawClouds();
  drawGround();
  drawGrid();
  drawScenery();
  drawEntities();
  drawEffects();
  ctx.restore();

  drawGun();
  drawFlameJet();               // the jet leaves the nozzle toward the crosshair
  drawFoamJet();               // ...and so does the foam
  drawCrosshair();
  drawScope();                  // a scoped rifle closes the view down to a sight picture
  drawVignette();
}

/* The sniper's scope: the view closes down to a dark sight picture with a fine
   reticle, centred on the point the round will land on. */
function drawScope() {
  const w = currentGun();
  if (!w.scope) return;
  const a = clamp((aimBlend() - 0.35) / 0.45, 0, 1);
  if (a <= 0.001) return;
  const cx = clamp(cross.x, 0, W), cy = clamp(cross.y, 0, H);
  const R = Math.min(W, H) * 0.34;
  ctx.save();
  ctx.globalAlpha = a;

  // everything outside the tube goes black
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.arc(cx, cy, R, 0, TAU, true);
  ctx.fillStyle = '#05070a';
  ctx.fill();

  // the inner wall of the tube, and a faint bloom off the glass
  const ring = ctx.createRadialGradient(cx, cy, R * 0.62, cx, cy, R);
  ring.addColorStop(0, 'rgba(0,0,0,0)');
  ring.addColorStop(0.85, 'rgba(0,0,0,0.45)');
  ring.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();

  const bloom = ctx.createRadialGradient(cx, cy - R * 0.3, 0, cx, cy, R);
  bloom.addColorStop(0, 'rgba(150, 200, 255, 0.10)');
  bloom.addColorStop(1, 'rgba(150, 200, 255, 0)');
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();

  // the reticle: fine hairs that run to the edges, with mil-dot ticks
  ctx.strokeStyle = 'rgba(12, 16, 20, 0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx - R * 0.08, cy);
  ctx.moveTo(cx + R * 0.08, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - R * 0.08);
  ctx.moveTo(cx, cy + R * 0.08); ctx.lineTo(cx, cy + R);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  for (let i = 1; i <= 3; i++) {
    const d = R * 0.24 * i;
    ctx.beginPath();
    ctx.moveTo(cx - d, cy - 5); ctx.lineTo(cx - d, cy + 5);
    ctx.moveTo(cx + d, cy - 5); ctx.lineTo(cx + d, cy + 5);
    ctx.moveTo(cx - 5, cy + d); ctx.lineTo(cx + 5, cy + d);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(12, 16, 20, 0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, 1.8, 0, TAU);
  ctx.fill();
  ctx.restore();
}


/* =========================================================================
   FIRST PERSON: the shooter's arms, hands and weapon
   Local space: +y is down, origin near the wrists at the lower right.
   Every gun is built horizontally in its own sub-frame that is tilted up-left
   by RIFLE_ANGLE / SHOTGUN_ANGLE, i.e. the barrel leaves the frame towards the
   crosshair. How the gun sits in the view comes from the weapon's own fields.
   Right-click sighting in takes that pitch back out (see gunPitch), so an aimed
   gun is drawn level instead of canted up-left.
   ========================================================================= */
function gunScale() {
  return clamp(Math.min(W / 1280, H / 880), 0.55, 1.3);
}

// How much of the art's own pitch is left. Hip pose: all of it. Sighted in, it is
// taken back out, so the weapon ends up drawn level rather than canted up-left.
function gunPitch(w) {
  const left = w.sightLine ? 1 - aimBlend() : 1;
  return (w.tilt || 0) * left;
}

// Where the barrel tip sits in the weapon's own sub-frame, scaled but unrotated.
// Levelling the art swings the tip about the pivot the art was built around
// (`pivot`; a mirrored hand turns the other way), so the aim pose asks for the
// tip at level = 1 and holds the gun wherever that tip lands on the aim point.
function gunMuzzleOffset(w, level, mirrored) {
  const s = gunScale();
  const home = mirrored && w.altMuzzle ? w.altMuzzle : w.muzzle;
  const alt = mirrored && w.altPivot;
  const pivot = (alt ? w.altPivot : w.pivot) || { x: 0, y: 0 };
  const lv = w.sightLine ? clamp(level, 0, 1) : 0;
  const turn = -(w.tilt || 0) * lv * (alt ? -1 : 1);
  const dx = home.x - pivot.x, dy = home.y - pivot.y;
  const cos = Math.cos(turn), sin = Math.sin(turn);
  return { x: (pivot.x + dx * cos - dy * sin) * s, y: (pivot.y + dx * sin + dy * cos) * s };
}

function gunTransform() {
  const w = currentGun();
  const aim = aimBlend();
  const swingX = (cross.x - W * 0.5) / W;
  const swingY = (cross.y - H * 0.5) / H;
  const progress = gun.reloading > 0 ? 1 - gun.reloading / reloadTime(w) : 0;
  const reloadDrop = gun.reloading > 0 ? Math.sin(progress * Math.PI) : 0;
  // hip position, then the sighted-in position the right mouse button blends to.
  // Sighted in, a gun is held straight: level (its own pitch taken out), square to
  // the world, drawn a little smaller (gunAimScale) so the view stays clear.
  let sx = w.sightX, sy = w.sightY, srot = w.sightRot;
  if (w.sightLine) {
    const k = w.aimScale !== undefined ? w.aimScale : AIM_SHRINK;   // drawn size down the sights
    const m = gunMuzzleOffset(w, 1, false);       // ...the barrel tip once it is level
    sx = (W * AIM_REF.x - m.x * k) / W;
    sy = (H * AIM_REF.y + SIGHT_DROP - m.y * k) / H;
    srot = 0;
  }
  const ax = lerp(w.anchorX, sx, aim);
  const ay = lerp(w.anchorY, sy, aim);
  const arot = lerp(w.baseRot, srot, aim);
  const sway = 1 - aim;                           // a hand wobbles; the sights do not
  return {
    x: W * ax + swingX * W * 0.045 * sway + Math.sin(game.time * 1.7) * 3.2 * sway,
    y: H * ay + swingY * H * 0.05 * sway + gun.recoil * H * w.recoilRise +
       reloadDrop * H * w.reloadRise + Math.cos(game.time * 2.2) * 2.4 * sway,
    rot: arot + swingX * 0.2 * sway + gun.recoil * 0.05 -
         reloadDrop * w.reloadTilt + Math.sin(game.time * 0.85) * 0.007 * sway,
    reloadDrop: reloadDrop,
    aim: aim
  };
}

function gunMuzzle() {
  const w = currentGun();
  const t = gunTransform();
  // a pair of pistols trades hands shot for shot
  const k = gunAimScale(w);                 // the pose is drawn smaller down the sights
  const off = gunMuzzleOffset(w, aimBlend(), !!(w.altMuzzle && game.shots % 2 === 1));
  const ox = off.x * k, oy = off.y * k;
  const cos = Math.cos(t.rot), sin = Math.sin(t.rot);
  return { x: t.x + ox * cos - oy * sin, y: t.y + ox * sin + oy * cos };
}

function rrect(x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const SKIN_A = '#d9a97c', SKIN_B = '#c48d61', SKIN_C = '#eabf93';

// The weapon's artwork carries the grip, and the arms are drawn in the view frame, so as
// the sub-frame comes level the wrist has to travel with it - swung about the same pivot
// the artwork turns about - or the sleeve and the hand on the grip would come apart.
// Nothing moves at the hip; the whole cant is taken out when sighted in.
function armWrist(w, px, py, x, y, mirrored) {
  let a = gunPitch(w) - (w.tilt || 0);
  if (mirrored) a = -a;
  if (!a) return { x: x, y: y };
  const s = Math.sin(a), c = Math.cos(a), dx = x - px, dy = y - py;
  return { x: px + dx * c - dy * s, y: py + dx * s + dy * c };
}

// A crease laid along an arm: hold it in the arm's own frame (a way along it, a little to
// one side) so it stays on the sleeve as the arm swings up to a levelled gun.
function armAlong(sx, sy, wx, wy, hand, x, y) {
  const ax = wx - sx, ay = wy - sy, aLen = Math.hypot(ax, ay);
  const along = ((x - sx) * ax + (y - sy) * ay) / aLen;
  const off = ((x - sx) * -ay + (y - sy) * ax) / aLen;
  const bx = hand.x - sx, by = hand.y - sy, bLen = Math.hypot(bx, by);
  const ux = bx / bLen, uy = by / bLen;
  return { x: sx + ux * along - uy * off, y: sy + uy * along + ux * off };
}

function drawArms() {
  const w = currentGun();
  ctx.lineCap = 'round';
  // trigger arm: from the bottom-right corner up to the pistol grip
  ctx.strokeStyle = '#5b6244';
  ctx.lineWidth = 96;
  const grip = armWrist(w, 0, 0, -16, 60);
  ctx.beginPath();
  ctx.moveTo(340, 470);
  ctx.lineTo(grip.x, grip.y);
  ctx.stroke();

  // support arm: crosses under the rifle to the handguard
  ctx.strokeStyle = '#4e5540';
  ctx.lineWidth = 88;
  const guard = armWrist(w, 0, 0, -124, -112);
  ctx.beginPath();
  ctx.moveTo(250, 545);
  ctx.lineTo(guard.x, guard.y);
  ctx.stroke();

  // crease highlight along the trigger arm
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 30;
  const c1 = armAlong(340, 470, -16, 60, grip, 292, 396);
  const c2 = armAlong(340, 470, -16, 60, grip, 36, 150);
  ctx.beginPath();
  ctx.moveTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.stroke();
}

function drawArmsPistol() {
  const w = currentGun();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#5b6244';
  ctx.lineWidth = 92;
  const grip = armWrist(w, 0, 0, 84, -4);
  ctx.beginPath();
  ctx.moveTo(250, 350);
  ctx.lineTo(grip.x, grip.y);
  ctx.stroke();

  ctx.strokeStyle = '#4e5540';
  ctx.lineWidth = 84;
  const brace = armWrist(w, 0, 0, -34, 30);
  ctx.beginPath();
  ctx.moveTo(-140, 380);
  ctx.lineTo(brace.x, brace.y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 30;
  const c1 = armAlong(250, 350, 84, -4, grip, 208, 268);
  const c2 = armAlong(250, 350, 84, -4, grip, 112, 60);
  ctx.beginPath();
  ctx.moveTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.stroke();
}

function drawAK47() {
  const w = currentGun();
  drawArms();
  ctx.save();
  ctx.rotate(gunPitch(w));               // sighted in: the rifle comes up level
  drawRifleBody();
  drawRifleHands();
  ctx.restore();
}

function drawSniper() {
  const w = currentGun();
  drawArms();
  ctx.save();
  ctx.rotate(gunPitch(w));               // sighted in: the scoped rifle comes up level
  drawSniperBody();
  drawSniperHands();
  ctx.restore();
}

function drawPistol() {
  drawArmsPistol();
  drawPistolBody();
  drawPistolHands();
}

function drawShotgun() {
  const w = currentGun();
  drawArms();
  ctx.save();
  ctx.rotate(gunPitch(w));               // sighted in: the gun comes up level
  drawShotgunBody();
  drawShotgunHands();
  ctx.restore();
}

function drawEnergyPistols() {
  const w = currentGun();
  drawArmsEnergy();
  const pitch = gunPitch(w);               // sighted in: both pistols come up level
  const lit = game.charged ? 1 : 0.34;     // unloaded, the coils only smoulder
  // right hand: barrel up and in toward the crosshair
  ctx.save();
  ctx.translate(-140, 30);
  ctx.scale(0.86, 0.86);
  ctx.rotate(pitch);
  drawEnergyBody(lit);
  ctx.restore();
  // left hand: mirrored
  ctx.save();
  ctx.translate(140, 30);
  ctx.scale(-0.86, 0.86);
  ctx.rotate(pitch);
  drawEnergyBody(lit);
  ctx.restore();
}

function drawArmsEnergy() {
  const w = currentGun();
  ctx.lineCap = 'round';
  // forearms in from both bottom corners, meeting at the grips. Each hand rides its
  // own pistol's pivot (see drawEnergyPistols), and the mirrored one turns the other way.
  ctx.strokeStyle = '#5b6244';
  ctx.lineWidth = 80;
  const lGrip = armWrist(w, -140, 30, -70, -40);
  ctx.beginPath();
  ctx.moveTo(-250, 470);
  ctx.lineTo(lGrip.x, lGrip.y);
  ctx.stroke();

  ctx.strokeStyle = '#4e5540';
  ctx.lineWidth = 80;
  const rGrip = armWrist(w, 140, 30, 70, -40, true);
  ctx.beginPath();
  ctx.moveTo(250, 470);
  ctx.lineTo(rGrip.x, rGrip.y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 26;
  const l1 = armAlong(-250, 470, -70, -40, lGrip, -196, 380);
  const l2 = armAlong(-250, 470, -70, -40, lGrip, -88, 30);
  ctx.beginPath();
  ctx.moveTo(l1.x, l1.y);
  ctx.lineTo(l2.x, l2.y);
  ctx.stroke();
  const r1 = armAlong(250, 470, 70, -40, rGrip, 196, 380);
  const r2 = armAlong(250, 470, 70, -40, rGrip, 88, 30);
  ctx.beginPath();
  ctx.moveTo(r1.x, r1.y);
  ctx.lineTo(r2.x, r2.y);
  ctx.stroke();
}

function drawEnergyBody(lit) {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  lit = lit === undefined ? 1 : lit;

  // the charge bleeding off the weapon
  if (lit > 0.4) {
    const halo = ctx.createRadialGradient(-90, -150, 10, -90, -150, 230);
    halo.addColorStop(0, 'rgba(120, 230, 255, ' + (0.2 * lit) + ')');
    halo.addColorStop(1, 'rgba(90, 200, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(-90, -150, 230, 0, TAU);
    ctx.fill();
  }

  // grip
  ctx.save();
  ctx.translate(30, -120);
  ctx.rotate(0.34);
  const gg = ctx.createLinearGradient(-32, -78, 30, 98);
  gg.addColorStop(0, '#39424e');
  gg.addColorStop(1, '#151a21');
  rrect(-32, -78, 62, 176, 16);
  ctx.fillStyle = gg;
  ctx.fill();

  // the cell seated in the grip
  const cg = ctx.createLinearGradient(0, 8, 0, 78);
  cg.addColorStop(0, 'rgba(' + Math.round(150 + 90 * lit) + ', 250, 255, ' + (0.35 + 0.6 * lit) + ')');
  cg.addColorStop(1, 'rgba(50, ' + Math.round(150 + 40 * lit) + ', 235, ' + (0.3 + 0.55 * lit) + ')');
  rrect(-21, 10, 42, 64, 9);
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(10, 20, 26, 0.5)';
  ctx.lineWidth = 3;
  ctx.stroke();
  rrect(-34, 92, 66, 16, 6);
  ctx.fillStyle = '#0f1318';
  ctx.fill();
  ctx.restore();

  // frame
  rrect(-196, -206, 238, 30, 8);
  ctx.fillStyle = '#39424e';
  ctx.fill();

  // trigger guard + trigger
  ctx.strokeStyle = '#2c323b';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-108, -182);
  ctx.quadraticCurveTo(-122, -132, -66, -132);
  ctx.quadraticCurveTo(-30, -132, -26, -170);
  ctx.stroke();
  rrect(-86, -178, 14, 40, 6);
  ctx.fillStyle = '#4a525e';
  ctx.fill();

  // slide
  const sg = ctx.createLinearGradient(0, -264, 0, -200);
  sg.addColorStop(0, '#5d6877');
  sg.addColorStop(0.45, '#39424e');
  sg.addColorStop(1, '#222932');
  rrect(-236, -262, 258, 58, 12);
  ctx.fillStyle = sg;
  ctx.fill();

  // the coil groove down the slide, and the coils crossing it
  ctx.strokeStyle = 'rgba(150, 240, 255, ' + (0.25 + 0.55 * lit) + ')';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-206, -232);
  ctx.lineTo(-16, -232);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120, 225, 255, ' + (0.12 + 0.45 * lit) + ')';
  ctx.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    rrect(-198 + i * 26, -254, 12, 42, 5);
    ctx.stroke();
  }

  // sights, muzzle, and the lit ring around it
  rrect(-228, -273, 14, 14, 3);
  ctx.fillStyle = '#101419';
  ctx.fill();
  rrect(-6, -273, 14, 14, 3);
  ctx.fillStyle = '#101419';
  ctx.fill();
  rrect(-246, -247, 18, 28, 6);
  ctx.fillStyle = '#0c0f14';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-237, -233, 6.5, 0, TAU);
  ctx.fillStyle = '#04060a';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-237, -233, 11, 0, TAU);
  ctx.strokeStyle = 'rgba(170, 246, 255, ' + (0.25 + 0.6 * lit) + ')';
  ctx.lineWidth = 3.5;
  ctx.stroke();
}

function drawRifleBody() {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // ---- barrel, gas tube, front sight, muzzle brake ----
  const steel = ctx.createLinearGradient(0, -40, 0, 26);
  steel.addColorStop(0, '#5b6572');
  steel.addColorStop(0.42, '#333a43');
  steel.addColorStop(1, '#191d22');

  rrect(-370, -16, 128, 20, 7);
  ctx.fillStyle = steel;
  ctx.fill();

  rrect(-302, -40, 138, 18, 7);
  ctx.fillStyle = '#262c33';
  ctx.fill();

  ctx.fillStyle = '#1b1f25';
  ctx.beginPath();
  ctx.moveTo(-356, -16);
  ctx.lineTo(-322, -16);
  ctx.lineTo(-338, -56);
  ctx.closePath();
  ctx.fill();
  rrect(-343, -62, 10, 14, 4);
  ctx.fill();

  rrect(-390, -24, 28, 36, 7);
  ctx.fillStyle = '#14181d';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-378, -6, 7, 0, TAU);
  ctx.fillStyle = '#04060a';
  ctx.fill();

  // ---- wooden handguard ----
  const wood = ctx.createLinearGradient(0, -34, 0, 52);
  wood.addColorStop(0, '#8d5b2b');
  wood.addColorStop(0.5, '#6b421e');
  wood.addColorStop(1, '#452812');

  rrect(-258, -32, 140, 34, 10);
  ctx.fillStyle = wood;
  ctx.fill();
  rrect(-252, 8, 128, 32, 10);
  ctx.fillStyle = wood;
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-238 + i * 32, -30);
    ctx.lineTo(-244 + i * 32, 38);
    ctx.stroke();
  }

  // ---- receiver ----
  const body = ctx.createLinearGradient(0, -64, 0, 34);
  body.addColorStop(0, '#4d5761');
  body.addColorStop(0.42, '#31383f');
  body.addColorStop(1, '#1b1f24');

  rrect(-128, -32, 216, 66, 9);
  ctx.fillStyle = body;
  ctx.fill();
  rrect(-124, -46, 198, 20, 6);
  ctx.fillStyle = '#3e4751';
  ctx.fill();
  rrect(-98, -60, 32, 16, 4);
  ctx.fillStyle = '#20242a';
  ctx.fill();
  rrect(-42, -26, 62, 20, 5);
  ctx.fillStyle = '#101419';
  ctx.fill();
  rrect(-16, -22, 48, 10, 4);
  ctx.fillStyle = '#525c69';
  ctx.fill();

  // ---- pistol grip ----
  ctx.save();
  ctx.translate(-6, 26);
  ctx.rotate(0.22);
  const grip = ctx.createLinearGradient(-26, 0, 28, 124);
  grip.addColorStop(0, '#3a3226');
  grip.addColorStop(1, '#1b1712');
  rrect(-26, 0, 52, 124, 16);
  ctx.fillStyle = grip;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-19, 24 + i * 25);
    ctx.lineTo(19, 30 + i * 25);
    ctx.stroke();
  }
  ctx.restore();

  // ---- trigger guard + trigger ----
  ctx.strokeStyle = '#242a31';
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-58, 30);
  ctx.quadraticCurveTo(-64, 78, -16, 78);
  ctx.quadraticCurveTo(16, 78, 22, 42);
  ctx.stroke();
  rrect(-32, 28, 13, 36, 5);
  ctx.fillStyle = '#4d5763';
  ctx.fill();

  // ---- curved 30-round magazine ----
  ctx.strokeStyle = '#1d211f';
  ctx.lineWidth = 60;
  ctx.beginPath();
  ctx.moveTo(-112, 18);
  ctx.quadraticCurveTo(-126, 86, -190, 118);
  ctx.stroke();

  ctx.strokeStyle = '#39402f';
  ctx.lineWidth = 42;
  ctx.beginPath();
  ctx.moveTo(-112, 22);
  ctx.quadraticCurveTo(-126, 90, -186, 118);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-120, 30);
  ctx.quadraticCurveTo(-134, 88, -180, 114);
  ctx.stroke();

  // ---- stock, running off the bottom-right corner ----
  ctx.save();
  ctx.translate(86, 8);
  ctx.rotate(0.16);
  const stock = ctx.createLinearGradient(0, -34, 0, 66);
  stock.addColorStop(0, '#7d5027');
  stock.addColorStop(1, '#3d2410');
  rrect(0, -30, 220, 78, 14);
  ctx.fillStyle = stock;
  ctx.fill();
  rrect(204, -34, 24, 88, 8);
  ctx.fillStyle = '#181c21';
  ctx.fill();
  ctx.restore();
}

function drawRifleHands() {
  // support hand cupping the wooden handguard: slim fingers so the wood still reads
  rrect(-238, 46, 112, 82, 26);
  ctx.fillStyle = SKIN_C;
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(-226 + i * 27, -32);
    rrect(-11, 0, 22, 58, 11);
    ctx.fillStyle = i % 2 ? SKIN_A : SKIN_B;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,50,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // trigger hand wrapped around the pistol grip
  ctx.save();
  ctx.translate(-8, 58);
  ctx.rotate(0.22);
  rrect(-46, -40, 92, 104, 26);
  ctx.fillStyle = SKIN_A;
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(-34, -22 + i * 26);
    ctx.rotate(-0.14);
    rrect(-26, -14, 78, 28, 14);
    ctx.fillStyle = i % 2 ? SKIN_B : SKIN_A;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,50,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(8, -40);
  ctx.rotate(0.5);
  rrect(-16, -34, 32, 76, 16);
  ctx.fillStyle = SKIN_C;
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/* ---- sniper rifle: a long, scoped bolt-action, built in the rifle's own frame ---- */
function drawSniperBody() {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // ---- heavy barrel out to a ported muzzle brake ----
  const steel = ctx.createLinearGradient(0, -40, 0, 26);
  steel.addColorStop(0, '#5b6572');
  steel.addColorStop(0.42, '#333a43');
  steel.addColorStop(1, '#191d22');

  rrect(-360, -20, 236, 24, 9);
  ctx.fillStyle = steel;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-352, -15);
  ctx.lineTo(-132, -15);
  ctx.stroke();

  rrect(-400, -32, 56, 48, 10);                 // muzzle brake
  ctx.fillStyle = '#14181d';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-380, -8, 9, 0, TAU);
  ctx.fillStyle = '#04060a';
  ctx.fill();
  for (let i = 0; i < 3; i++) {                 // vent slots
    rrect(-394, -24 + i * 15, 9, 8, 3);
    ctx.fillStyle = '#2b323a';
    ctx.fill();
  }
  rrect(-348, -46, 22, 60, 8);                  // barrel band
  ctx.fillStyle = '#1b1f25';
  ctx.fill();

  // ---- polymer handguard ----
  const poly = ctx.createLinearGradient(0, -36, 0, 54);
  poly.addColorStop(0, '#3f4750');
  poly.addColorStop(0.5, '#2a3037');
  poly.addColorStop(1, '#171b20');
  rrect(-262, -34, 150, 40, 12);
  ctx.fillStyle = poly;
  ctx.fill();
  rrect(-256, 12, 138, 34, 12);
  ctx.fillStyle = poly;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-244 + i * 30, -32);
    ctx.lineTo(-250 + i * 30, 44);
    ctx.stroke();
  }

  // ---- receiver ----
  const body = ctx.createLinearGradient(0, -66, 0, 36);
  body.addColorStop(0, '#4d5761');
  body.addColorStop(0.42, '#31383f');
  body.addColorStop(1, '#1b1f24');
  rrect(-128, -34, 220, 68, 9);
  ctx.fillStyle = body;
  ctx.fill();
  rrect(-124, -48, 202, 20, 6);
  ctx.fillStyle = '#3e4751';
  ctx.fill();
  rrect(-44, -28, 64, 22, 5);                   // ejection port
  ctx.fillStyle = '#101419';
  ctx.fill();

  ctx.save();                                   // bolt handle, out the right side
  ctx.translate(24, 6);
  ctx.rotate(0.5);
  rrect(0, -9, 54, 18, 8);
  ctx.fillStyle = '#454e59';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(60, 0, 13, 0, TAU);
  ctx.fillStyle = '#39424c';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // ---- the scope: tube, turret, both bells and an eyepiece ----
  const scope = ctx.createLinearGradient(0, -118, 0, -62);
  scope.addColorStop(0, '#5f6a76');
  scope.addColorStop(0.45, '#2c333b');
  scope.addColorStop(1, '#161a1f');
  rrect(-182, -106, 258, 40, 16);               // tube
  ctx.fillStyle = scope;
  ctx.fill();
  rrect(-196, -118, 40, 64, 14);                // objective bell
  ctx.fillStyle = '#22282f';
  ctx.fill();
  rrect(50, -114, 42, 56, 14);                  // ocular bell
  ctx.fillStyle = '#22282f';
  ctx.fill();
  const lens = ctx.createLinearGradient(0, -112, 0, -66);
  lens.addColorStop(0, '#cfe9ff');
  lens.addColorStop(0.5, '#4f7fa8');
  lens.addColorStop(1, '#0b1116');
  rrect(-192, -112, 12, 52, 6);                 // front glass
  ctx.fillStyle = lens;
  ctx.fill();
  rrect(84, -108, 10, 44, 5);                   // eye glass
  ctx.fillStyle = lens;
  ctx.fill();
  rrect(-84, -128, 46, 28, 8);                  // elevation turret
  ctx.fillStyle = '#333b44';
  ctx.fill();
  rrect(-106, -86, 92, 22, 8);                  // mount, clamped to the receiver
  ctx.fillStyle = '#20252b';
  ctx.fill();

  // ---- pistol grip, trigger, box magazine ----
  ctx.save();
  ctx.translate(-6, 26);
  ctx.rotate(0.22);
  const grip = ctx.createLinearGradient(-26, 0, 28, 124);
  grip.addColorStop(0, '#3a3f46');
  grip.addColorStop(1, '#15181c');
  rrect(-26, 0, 52, 124, 16);
  ctx.fillStyle = grip;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-19, 24 + i * 25);
    ctx.lineTo(19, 30 + i * 25);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = '#242a31';
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-58, 30);
  ctx.quadraticCurveTo(-64, 78, -16, 78);
  ctx.quadraticCurveTo(16, 78, 22, 42);
  ctx.stroke();
  rrect(-32, 28, 13, 36, 5);
  ctx.fillStyle = '#4d5763';
  ctx.fill();

  const mag = ctx.createLinearGradient(0, 12, 0, 112);
  mag.addColorStop(0, '#333b44');
  mag.addColorStop(1, '#14181d');
  rrect(-136, 12, 78, 96, 12);                  // box magazine
  ctx.fillStyle = mag;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-124, 28);
  ctx.lineTo(-70, 28);
  ctx.stroke();

  // ---- straight stock with a cheek riser, running off the corner ----
  ctx.save();
  ctx.translate(88, 4);
  ctx.rotate(0.1);
  const stock = ctx.createLinearGradient(0, -40, 0, 72);
  stock.addColorStop(0, '#39414a');
  stock.addColorStop(1, '#171b20');
  rrect(0, -34, 224, 84, 16);
  ctx.fillStyle = stock;
  ctx.fill();
  rrect(-4, -56, 120, 34, 12);                  // cheek riser
  ctx.fillStyle = '#2c333b';
  ctx.fill();
  rrect(206, -38, 26, 94, 9);                   // butt pad
  ctx.fillStyle = '#12161a';
  ctx.fill();
  ctx.restore();
}

// The hands sit on the same handguard and grip as the rifle's, so they are drawn the same.
function drawSniperHands() {
  drawRifleHands();
}

/* ---- pistol (from the first-person pistol build) ---- */
function drawPistolBody() {
  // grip
  ctx.save();
  ctx.translate(30, -120);
  ctx.rotate(0.34);
  const gg = ctx.createLinearGradient(-32, -78, 30, 98);
  gg.addColorStop(0, '#2f353f');
  gg.addColorStop(1, '#14181e');
  rrect(-32, -78, 62, 176, 16);
  ctx.fillStyle = gg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(-24, -36 + i * 22);
    ctx.lineTo(22, -42 + i * 22);
    ctx.stroke();
  }
  rrect(-34, 92, 66, 16, 6);
  ctx.fillStyle = '#0f1318';
  ctx.fill();
  ctx.restore();

  // frame
  rrect(-196, -206, 238, 30, 8);
  ctx.fillStyle = '#333b44';
  ctx.fill();

  // trigger guard + trigger
  ctx.strokeStyle = '#2c323b';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-108, -182);
  ctx.quadraticCurveTo(-122, -132, -66, -132);
  ctx.quadraticCurveTo(-30, -132, -26, -170);
  ctx.stroke();
  rrect(-86, -178, 14, 40, 6);
  ctx.fillStyle = '#4a525e';
  ctx.fill();

  // slide
  const sg = ctx.createLinearGradient(0, -264, 0, -200);
  sg.addColorStop(0, '#525b6a');
  sg.addColorStop(0.42, '#353d48');
  sg.addColorStop(1, '#1f242b');
  rrect(-236, -262, 258, 58, 12);
  ctx.fillStyle = sg;
  ctx.fill();

  // ejection port + serrations
  rrect(-150, -252, 64, 22, 5);
  ctx.fillStyle = '#12161c';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(-8 + i * 6, -256);
    ctx.lineTo(-12 + i * 6, -210);
    ctx.stroke();
  }

  // sights
  rrect(-228, -273, 14, 14, 3);
  ctx.fillStyle = '#101419';
  ctx.fill();
  rrect(-6, -273, 14, 14, 3);
  ctx.fill();

  // barrel + muzzle opening
  rrect(-246, -247, 18, 28, 6);
  ctx.fillStyle = '#0c0f14';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-237, -233, 6.5, 0, TAU);
  ctx.fillStyle = '#04060a';
  ctx.fill();
}

function drawPistolHands() {
  // support hand under the frame
  ctx.save();
  ctx.translate(-86, -152);
  ctx.rotate(0.18);
  rrect(-46, -12, 88, 84, 28);
  ctx.fillStyle = SKIN_C;
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(26, -4 + i * 27);
    ctx.rotate(0.22 - i * 0.05);
    rrect(-22, -13, 68, 26, 13);
    ctx.fillStyle = i % 2 ? SKIN_A : SKIN_B;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,50,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // trigger hand on the grip
  ctx.save();
  ctx.translate(26, -116);
  ctx.rotate(0.34);
  rrect(-42, -48, 86, 110, 26);
  ctx.fillStyle = SKIN_A;
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(-32, -24 + i * 26);
    ctx.rotate(-0.16);
    rrect(-26, -13, 74, 26, 13);
    ctx.fillStyle = i % 2 ? SKIN_B : SKIN_A;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,50,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(-14, -54);
  ctx.rotate(0.5);
  rrect(-15, -34, 30, 72, 15);
  ctx.fillStyle = SKIN_C;
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/* ---- pump-action shotgun ---- */
function drawShotgunBody() {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  const steel = ctx.createLinearGradient(0, -44, 0, 24);
  steel.addColorStop(0, '#6a7481');
  steel.addColorStop(0.42, '#3a424b');
  steel.addColorStop(1, '#1a1e23');

  const wood = ctx.createLinearGradient(0, -40, 0, 56);
  wood.addColorStop(0, '#8d5b2b');
  wood.addColorStop(0.5, '#6b421e');
  wood.addColorStop(1, '#452812');

  // ---- barrel, ventilated rib, front bead ----
  rrect(-400, -26, 244, 26, 8);
  ctx.fillStyle = steel;
  ctx.fill();
  rrect(-404, -33, 252, 8, 3);
  ctx.fillStyle = '#2a3038';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-386, -38, 5, 0, TAU);
  ctx.fillStyle = '#e8d98a';
  ctx.fill();

  // ---- under-barrel magazine tube + barrel band ----
  rrect(-386, 4, 232, 22, 9);
  ctx.fillStyle = '#242a32';
  ctx.fill();
  rrect(-346, -30, 16, 60, 5);
  ctx.fillStyle = '#39414b';
  ctx.fill();

  // ---- wooden pump forend ----
  rrect(-308, -8, 116, 54, 16);
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.24)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-290 + i * 26, -6);
    ctx.lineTo(-296 + i * 26, 44);
    ctx.stroke();
  }

  // ---- receiver ----
  const body = ctx.createLinearGradient(0, -70, 0, 40);
  body.addColorStop(0, '#4d5761');
  body.addColorStop(0.42, '#31383f');
  body.addColorStop(1, '#1b1f24');
  rrect(-192, -40, 176, 80, 10);
  ctx.fillStyle = body;
  ctx.fill();
  rrect(-188, -52, 158, 18, 6);
  ctx.fillStyle = '#3e4751';
  ctx.fill();
  rrect(-116, -28, 62, 24, 6);        // loading port
  ctx.fillStyle = '#101419';
  ctx.fill();
  rrect(-48, -26, 50, 22, 5);         // ejection port
  ctx.fillStyle = '#141920';
  ctx.fill();

  // ---- spare shells carried on the receiver ----
  for (let i = 0; i < 2; i++) {
    rrect(-176 + i * 26, 26, 20, 32, 6);
    ctx.fillStyle = '#a63f2c';
    ctx.fill();
    rrect(-176 + i * 26, 50, 20, 9, 4);
    ctx.fillStyle = '#c8a24a';
    ctx.fill();
  }

  // ---- trigger guard + trigger ----
  ctx.strokeStyle = '#242a31';
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-104, 34);
  ctx.quadraticCurveTo(-118, 86, -62, 86);
  ctx.quadraticCurveTo(-24, 86, -20, 40);
  ctx.stroke();
  rrect(-84, 30, 13, 42, 6);
  ctx.fillStyle = '#4a525e';
  ctx.fill();

  // ---- pistol grip ----
  ctx.save();
  ctx.translate(-4, 34);
  ctx.rotate(0.3);
  rrect(-28, 0, 56, 124, 17);
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-20, 26 + i * 24);
    ctx.lineTo(20, 32 + i * 24);
    ctx.stroke();
  }
  ctx.restore();

  // ---- butt stock ----
  rrect(60, -38, 186, 76, 20);
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(96, -28);
  ctx.lineTo(228, -28);
  ctx.stroke();
  rrect(236, -46, 30, 92, 11);        // recoil pad
  ctx.fillStyle = '#20242a';
  ctx.fill();
}

function drawShotgunHands() {
  // support hand wrapped around the wooden pump
  rrect(-286, 24, 118, 88, 28);
  ctx.fillStyle = SKIN_C;
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(-272 + i * 28, -26);
    rrect(-12, 0, 24, 62, 12);
    ctx.fillStyle = i % 2 ? SKIN_A : SKIN_B;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,50,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // trigger hand on the pistol grip
  ctx.save();
  ctx.translate(-14, 62);
  ctx.rotate(0.3);
  rrect(-48, -42, 96, 108, 27);
  ctx.fillStyle = SKIN_A;
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(-36, -24 + i * 26);
    ctx.rotate(-0.14);
    rrect(-26, -14, 80, 28, 14);
    ctx.fillStyle = i % 2 ? SKIN_B : SKIN_A;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,50,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(10, -42);
  ctx.rotate(0.5);
  rrect(-16, -34, 32, 78, 16);
  ctx.fillStyle = SKIN_C;
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/* ---- katana ----
   Same local space as the guns: +y down, the wrists at the lower right. The
   blade is drawn along +x and the group is turned up-left, so the edge sweeps
   the upper left of the frame. The right mouse button brings it to the guard. */
/* The flamethrower: a fuel tank slung under the receiver, a hose running forward
   to a fat heat-shielded tube, and a flared bell mouth with a pilot flame on it. */

/* ---------------- the fire extinguisher in your hands ---------------- */
function drawExtinguisher() {
  const w = currentGun();
  drawArms();
  ctx.save();
  ctx.rotate(gunPitch(w));               // sighted in: the nozzle comes up level
  drawExtinguisherBody();
  ctx.restore();
}

function drawExtinguisherBody() {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // ---- the tank: a red steel cylinder cradled at the hip ----
  ctx.save();
  ctx.translate(118, -128);
  ctx.rotate(-0.22);
  const tank = ctx.createLinearGradient(-74, 0, 74, 0);
  tank.addColorStop(0, '#6f1710');
  tank.addColorStop(0.18, '#c8301c');
  tank.addColorStop(0.46, '#ec5330');
  tank.addColorStop(0.72, '#bb2a17');
  tank.addColorStop(1, '#671410');
  rrect(-74, -104, 148, 216, 50);
  ctx.fillStyle = tank;
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,6,4,0.5)';
  ctx.lineWidth = 3;
  rrect(-74, -104, 148, 216, 50);
  ctx.stroke();

  // a gloss down the left of the cylinder, and the welded seam at the foot
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  rrect(-56, -92, 22, 150, 11);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-70, 74);
  ctx.lineTo(70, 74);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  rrect(-70, 82, 140, 26, 12);
  ctx.fill();

  // the instruction label wrapped round the middle
  ctx.fillStyle = '#f2ede2';
  rrect(-66, -44, 132, 62, 8);
  ctx.fill();
  ctx.fillStyle = '#9c1c10';
  rrect(-58, -34, 60, 12, 6);
  ctx.fill();
  ctx.fillStyle = '#3a3a3a';
  for (let i = 0; i < 3; i++) {
    rrect(-58, -12 + i * 13, 108 - i * 22, 7, 3);
    ctx.fill();
  }

  // ---- the neck, the valve, and the black squeeze lever on top ----
  ctx.fillStyle = '#8f9498';
  rrect(-28, -136, 56, 42, 10);
  ctx.fill();
  ctx.fillStyle = '#3f4449';
  rrect(-38, -168, 76, 38, 12);
  ctx.fill();
  ctx.fillStyle = '#1c1f22';
  rrect(-34, -196, 96, 20, 9);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  rrect(-30, -192, 84, 7, 4);
  ctx.fill();

  // the pressure gauge on its short elbow
  ctx.fillStyle = '#e9eef1';
  ctx.beginPath();
  ctx.arc(60, -128, 22, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#2a2f33';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(60, -128);
  ctx.lineTo(70, -142);
  ctx.stroke();
  ctx.fillStyle = '#4a5157';
  ctx.beginPath();
  ctx.arc(60, -128, 3, 0, TAU);
  ctx.fill();

  // carry handle over the valve
  ctx.strokeStyle = '#20242a';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(-24, -206);
  ctx.quadraticCurveTo(10, -244, 44, -204);
  ctx.stroke();
  ctx.restore();

  // ---- the discharge hose: black rubber, looped up to the wand ----
  const hose = ctx.createLinearGradient(0, -250, 0, -60);
  hose.addColorStop(0, '#2b2f34');
  hose.addColorStop(0.5, '#15181b');
  hose.addColorStop(1, '#2f343a');
  ctx.strokeStyle = hose;
  ctx.lineWidth = 30;
  ctx.beginPath();
  ctx.moveTo(116, -70);
  ctx.quadraticCurveTo(96, -196, -34, -212);
  ctx.quadraticCurveTo(-120, -220, -170, -230);
  ctx.stroke();
  // a highlight along the top of the hose, so it reads as round
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(114, -84);
  ctx.quadraticCurveTo(94, -196, -34, -221);
  ctx.quadraticCurveTo(-118, -229, -166, -238);
  ctx.stroke();

  // ---- the wand: a short steel lance with a flared foam horn on the end ----
  ctx.fillStyle = '#2a2e33';
  rrect(-190, -248, 96, 30, 14);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  rrect(-184, -243, 82, 8, 4);
  ctx.fill();

  // brass collar where the hose meets the lance
  const brass = ctx.createLinearGradient(0, -256, 0, -212);
  brass.addColorStop(0, '#e8c777');
  brass.addColorStop(0.5, '#b98f31');
  brass.addColorStop(1, '#7d5c17');
  ctx.fillStyle = brass;
  rrect(-206, -256, 26, 46, 8);
  ctx.fill();

  // the horn: a black cone opening at the muzzle
  ctx.fillStyle = '#14171a';
  ctx.beginPath();
  ctx.moveTo(-246, -238);
  ctx.lineTo(-268, -262);
  ctx.lineTo(-268, -212);
  ctx.lineTo(-246, -224);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.moveTo(-248, -236);
  ctx.lineTo(-266, -258);
  ctx.lineTo(-266, -246);
  ctx.lineTo(-248, -230);
  ctx.closePath();
  ctx.fill();

  drawExtinguisherHands();
}

function drawExtinguisherHands() {
  const skin = ctx.createLinearGradient(0, -60, 0, 40);
  skin.addColorStop(0, '#e8b491');
  skin.addColorStop(1, '#b9825f');

  // the trigger hand, wrapped round the valve and the squeeze lever
  ctx.save();
  ctx.translate(112, -52);
  ctx.rotate(0.10);
  ctx.fillStyle = skin;
  rrect(-52, -46, 104, 96, 30);
  ctx.fill();
  ctx.strokeStyle = 'rgba(78,38,22,0.34)';
  ctx.lineWidth = 3.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-40, -22 + i * 26);
    ctx.lineTo(34, -30 + i * 26);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  rrect(-44, -40, 90, 12, 6);
  ctx.fill();
  ctx.restore();

  // the support hand out on the lance, thumb over the collar
  ctx.save();
  ctx.translate(-186, -224);
  ctx.rotate(-0.28);
  ctx.fillStyle = skin;
  rrect(-46, -34, 96, 82, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(78,38,22,0.34)';
  ctx.lineWidth = 3.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-34, -14 + i * 24);
    ctx.lineTo(40, -20 + i * 24);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  rrect(-38, -28, 82, 11, 5);
  ctx.fill();
  ctx.restore();
}

/* ---------------- the blast of foam ---------------- */
function drawFoamJet() {
  if (!(gun.foamT > 0)) return;
  const w = currentGun();
  if (!w.ext) return;
  const m = gunMuzzle();
  const a = clamp(gun.foamT / FOAM_JET, 0, 1);
  const tx = cross.x, ty = cross.y;
  const dx = tx - m.x, dy = ty - m.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const t = game.time;
  const wob = (q) => Math.sin(t * 17 + q * 7) * q * 9 * a;
  const cx = (m.x + tx) * 0.5 + px * wob(0.4);
  const cy = (m.y + ty) * 0.5 + py * wob(0.4) - 12;

  ctx.save();

  // the cone of foam: wide at the muzzle, opening out as it goes
  const cone = ctx.createLinearGradient(m.x, m.y, tx, ty);
  cone.addColorStop(0, 'rgba(255,255,255,0.62)');
  cone.addColorStop(0.45, 'rgba(246,250,252,0.38)');
  cone.addColorStop(1, 'rgba(228,240,246,0.10)');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(m.x + px * 9, m.y + py * 9);
  ctx.quadraticCurveTo(cx + px * 62, cy + py * 62, tx + px * 10, ty + py * 10);
  ctx.quadraticCurveTo(cx - px * 62, cy - py * 62, m.x - px * 9, m.y - py * 9);
  ctx.closePath();
  ctx.fill();

  // billows: fat soft puffs riding the cone outwards
  for (let i = 0; i < 7; i++) {
    const q = ((t * 1.9 + i * 0.143) % 1);
    const bx = m.x + (tx - m.x) * q + px * wob(q) * 1.6;
    const by = m.y + (ty - m.y) * q + py * wob(q) * 1.6;
    const r = (10 + q * 34) * (0.7 + 0.3 * Math.sin(t * 9 + i * 2.1));
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, 'rgba(255,255,255,' + (0.30 - q * 0.16).toFixed(3) + ')');
    g.addColorStop(0.65, 'rgba(240,246,250,' + (0.16 - q * 0.09).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(226,238,244,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, TAU);
    ctx.fill();
  }

  // flakes blown off the edge of the blast, falling away
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 14; i++) {
    const q = ((t * 1.5 + i * 0.071) % 1);
    const x = m.x + (tx - m.x) * q + px * wob(q) * 2.2;
    const y = m.y + (ty - m.y) * q + py * wob(q) * 2.2 + q * q * 54;
    ctx.beginPath();
    ctx.arc(x, y, 1.4 + q * 2.4, 0, TAU);
    ctx.fill();
  }

  // where it lands: a burst of foam breaking over the target
  const r = 26 + Math.sin(t * 12) * 5;
  const land = ctx.createRadialGradient(tx, ty, 0, tx, ty, r * a + 6);
  land.addColorStop(0, 'rgba(255,255,255,0.62)');
  land.addColorStop(0.5, 'rgba(238,246,250,0.30)');
  land.addColorStop(1, 'rgba(226,240,246,0)');
  ctx.fillStyle = land;
  ctx.beginPath();
  ctx.arc(tx, ty, r * a + 6, 0, TAU);
  ctx.fill();

  // a few clinging bubbles at the impact point
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 6; i++) {
    const ang = t * 1.4 + i * 1.05;
    const rr = (r * 0.5) * (0.5 + 0.5 * Math.sin(t * 3 + i));
    ctx.beginPath();
    ctx.arc(tx + Math.cos(ang) * rr, ty + Math.sin(ang) * rr * 0.65, 3 + (i % 3) * 1.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}


function drawFlamethrower() {
  const w = currentGun();
  drawArms();
  ctx.save();
  ctx.rotate(gunPitch(w));               // sighted in: the nozzle comes up level
  drawFlamethrowerBody();
  drawFlamethrowerHands();
  ctx.restore();
  drawPilotFlame();
}

function drawFlamethrowerBody() {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // ---- hose, from the tank forward to the nozzle (behind everything else) ----
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1d1915';
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(96, 126);
  ctx.bezierCurveTo(-30, 196, -248, 104, -330, 34);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(96, 118);
  ctx.bezierCurveTo(-30, 188, -248, 96, -330, 26);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // ---- fuel tank, slung under the receiver and running off the bottom ----
  ctx.save();
  ctx.translate(66, 30);
  ctx.rotate(0.32);
  const tank = ctx.createLinearGradient(-48, 0, 48, 0);
  tank.addColorStop(0, '#59614a');
  tank.addColorStop(0.42, '#7e8760');
  tank.addColorStop(1, '#2f3526');
  rrect(-48, -6, 96, 198, 44);
  ctx.fillStyle = tank;
  ctx.fill();
  ctx.fillStyle = '#242a1d';
  rrect(-30, -22, 60, 28, 10); ctx.fill();          // valve collar
  rrect(-42, 92, 84, 14, 6); ctx.fill();            // straps
  rrect(-42, 140, 84, 14, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  rrect(-34, 20, 14, 150, 7); ctx.fill();           // a highlight down the tank
  ctx.restore();

  // ---- the tube: fat, ribbed, with a heat shield ----
  const steel = ctx.createLinearGradient(0, -44, 0, 36);
  steel.addColorStop(0, '#6e7783');
  steel.addColorStop(0.4, '#3a424c');
  steel.addColorStop(1, '#181c22');
  rrect(-392, -36, 300, 64, 28);
  ctx.fillStyle = steel;
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.34)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-338 + i * 44, -34);
    ctx.lineTo(-346 + i * 44, 26);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-380, -28);
  ctx.lineTo(-100, -28);
  ctx.stroke();

  // ---- flared bell mouth, and its dark throat ----
  ctx.fillStyle = '#2b323a';
  ctx.beginPath();
  ctx.moveTo(-386, -36);
  ctx.quadraticCurveTo(-416, -44, -430, -66);
  ctx.lineTo(-430, 54);
  ctx.quadraticCurveTo(-416, 34, -386, 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0a0c10';
  ctx.beginPath();
  ctx.ellipse(-424, -6, 16, 58, 0.06, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,205,220,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(-424, -6, 16, 58, 0.06, 0, TAU);
  ctx.stroke();

  // ---- receiver, gauge and pistol grip ----
  const body = ctx.createLinearGradient(0, -66, 0, 34);
  body.addColorStop(0, '#4f5964');
  body.addColorStop(0.42, '#333b43');
  body.addColorStop(1, '#1b1f24');
  rrect(-96, -32, 186, 66, 10);
  ctx.fillStyle = body;
  ctx.fill();
  rrect(-90, -48, 168, 20, 6);
  ctx.fillStyle = '#3c454f';
  ctx.fill();
  rrect(-30, -24, 54, 18, 5);
  ctx.fillStyle = '#101318';
  ctx.fill();

  // pressure gauge on the receiver's shoulder
  ctx.beginPath();
  ctx.arc(-46, -66, 26, 0, TAU);
  ctx.fillStyle = '#20262c';
  ctx.fill();
  const face = ctx.createRadialGradient(-50, -72, 3, -46, -66, 24);
  face.addColorStop(0, '#f4efe0');
  face.addColorStop(1, '#c3bda9');
  ctx.beginPath();
  ctx.arc(-46, -66, 19, 0, TAU);
  ctx.fillStyle = face;
  ctx.fill();
  const na = -2.2 + (gun.flameT > 0 ? 0.5 : 0.05);
  ctx.strokeStyle = '#c2381f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-46, -66);
  ctx.lineTo(-46 + Math.cos(na) * 15, -66 + Math.sin(na) * 15);
  ctx.stroke();
  ctx.strokeStyle = '#2a2f35';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(-46, -66, 19, 0, TAU);
  ctx.stroke();

  // the grip and its trigger
  ctx.save();
  ctx.translate(-6, 26);
  ctx.rotate(0.24);
  const grip = ctx.createLinearGradient(-26, 0, 28, 124);
  grip.addColorStop(0, '#33383a');
  grip.addColorStop(1, '#15181a');
  rrect(-26, 0, 52, 124, 16);
  ctx.fillStyle = grip;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-19, 24 + i * 25);
    ctx.lineTo(19, 30 + i * 25);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = '#242a31';
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-62, 30);
  ctx.quadraticCurveTo(-68, 78, -20, 78);
  ctx.quadraticCurveTo(12, 78, 18, 42);
  ctx.stroke();
  rrect(-34, 28, 13, 36, 5);
  ctx.fillStyle = '#4d5763';
  ctx.fill();
  ctx.lineCap = 'butt';
}

function drawFlamethrowerHands() {
  // a gloved trigger hand, and a gloved hand under the tube
  ctx.fillStyle = '#3f3628';
  ctx.save();
  ctx.translate(-10, 44);
  ctx.rotate(0.16);
  rrect(-30, -16, 62, 56, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(18, -6 + i * 15);
    ctx.lineTo(30, -2 + i * 15);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#463c2c';
  ctx.save();
  ctx.translate(-150, 6);
  ctx.rotate(-0.1);
  rrect(-34, -8, 70, 54, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-26, 12 + i * 12);
    ctx.lineTo(-6, 14 + i * 12);
    ctx.stroke();
  }
  ctx.restore();
}

// The little blue pilot jet burning at the bell mouth: it is what tells you the
// thing is loaded even when you are not spraying.
function drawPilotFlame() {
  const t = game.time;
  const flick = 1 + Math.sin(t * 17) * 0.16 + Math.sin(t * 29) * 0.08;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(120,190,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-430, -6, 7 * flick, 11 * flick, 0.06, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,232,170,0.85)';
  ctx.beginPath();
  ctx.ellipse(-430, -6, 3.2 * flick, 5.5 * flick, 0.06, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// The jet itself, from the nozzle to wherever you are pointing. Drawn in screen
// space on top of the gun, so it reads as leaving the bell mouth toward the target.
function drawFlameJet() {
  if (gun.flameT <= 0.001) return;
  const w = currentGun();
  if (!w.flame) return;
  const m = gunMuzzle();
  const a = clamp(gun.flameT / FLAME_JET, 0, 1);
  const t = game.time;
  const tx = cross.x, ty = cross.y;
  const dx = tx - m.x, dy = ty - m.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;                       // straight across the jet

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // three nested tongues: a wide dim sheath, a hot middle, and a white-hot core
  const layers = [
    { w0: 30, w1: 74, color: 'rgba(226,72,26,0.30)' },
    { w0: 17, w1: 44, color: 'rgba(255,138,34,0.42)' },
    { w0: 8, w1: 20, color: 'rgba(255,226,150,0.50)' }
  ];
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    const wob = Math.sin(t * 13 + i) * 0.06;
    ctx.fillStyle = L.color;
    ctx.beginPath();
    ctx.moveTo(m.x + px * L.w0 * 0.6, m.y + py * L.w0 * 0.6);
    ctx.quadraticCurveTo(
      m.x + ux * len * 0.5 + px * L.w1 * (0.5 + wob),
      m.y + uy * len * 0.5 + py * L.w1 * (0.5 + wob),
      tx, ty
    );
    ctx.quadraticCurveTo(
      m.x + ux * len * 0.5 - px * L.w1 * (0.5 - wob),
      m.y + uy * len * 0.5 - py * L.w1 * (0.5 - wob),
      m.x - px * L.w0 * 0.6, m.y - py * L.w0 * 0.6
    );
    ctx.closePath();
    ctx.fill();
  }

  // puffs rolling along the jet
  for (let i = 0; i < 9; i++) {
    const q = (t * 1.7 + i * 0.11) % 1;
    const along = len * (0.08 + q * 0.92);
    const spread = (10 + q * 56) * (0.6 + 0.4 * Math.sin(t * 9 + i * 2.1));
    const ox = px * spread * (i % 2 ? 1 : -1) * 0.7 + px * Math.sin(t * 6 + i) * 8;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,186,80,0.24)' : 'rgba(232,96,32,0.20)';
    ctx.beginPath();
    ctx.arc(m.x + ux * along + ox, m.y + uy * along + py * ox * 0.2, 10 + q * 26, 0, TAU);
    ctx.fill();
  }

  // where it lands
  const r = 26 + Math.sin(t * 21) * 5;
  const glow = ctx.createRadialGradient(tx, ty, 1, tx, ty, r * 1.9);
  glow.addColorStop(0, 'rgba(255,242,200,' + (0.55 * a).toFixed(3) + ')');
  glow.addColorStop(0.5, 'rgba(255,140,40,' + (0.30 * a).toFixed(3) + ')');
  glow.addColorStop(1, 'rgba(220,60,20,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(tx, ty, r * 1.9, 0, TAU);
  ctx.fill();

  // the root, right at the pilot light
  const root = ctx.createRadialGradient(m.x, m.y, 2, m.x, m.y, 46);
  root.addColorStop(0, 'rgba(255,246,214,' + (0.7 * a).toFixed(3) + ')');
  root.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = root;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 46, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawKatanaArms(hx, hy) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#5b6244';
  ctx.lineWidth = 94;
  ctx.beginPath();
  ctx.moveTo(300, 400);
  ctx.lineTo(hx + 46, hy + 78);
  ctx.stroke();
  ctx.strokeStyle = '#4e5540';
  ctx.lineWidth = 86;
  ctx.beginPath();
  ctx.moveTo(-40, 430);
  ctx.lineTo(hx - 30, hy + 96);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.moveTo(250, 330);
  ctx.lineTo(hx + 40, hy + 96);
  ctx.stroke();
}

function drawKatana() {
  const aim = aimBlend();
  const hx = -30 - aim * 46;
  const hy = 60 - aim * 130;
  drawKatanaArms(hx, hy);

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(-2.02 - aim * 0.16);

  // grip, wrapped
  ctx.fillStyle = '#22262c';
  rrect(-150, -19, 156, 38, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(214, 226, 240, 0.55)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 5; i++) {
    const x = -138 + i * 30;
    ctx.beginPath();
    ctx.moveTo(x, -17);
    ctx.lineTo(x + 16, 17);
    ctx.moveTo(x + 16, -17);
    ctx.lineTo(x, 17);
    ctx.stroke();
  }

  // tsuba (guard)
  ctx.beginPath();
  ctx.ellipse(8, 0, 26, 12, 0, 0, TAU);
  ctx.fillStyle = '#3d444d';
  ctx.fill();
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 4;
  ctx.stroke();

  // blade
  const bx = 22, bl = 690;
  ctx.beginPath();
  ctx.moveTo(bx, -19);
  ctx.quadraticCurveTo(bx + bl * 0.55, -27, bx + bl, -5);
  ctx.quadraticCurveTo(bx + bl * 0.55, 9, bx + 5, 21);
  ctx.closePath();
  const g = ctx.createLinearGradient(bx, -22, bx, 24);
  g.addColorStop(0, '#f2f7fd');
  g.addColorStop(0.42, '#b7c6d8');
  g.addColorStop(0.72, '#e6eef7');
  g.addColorStop(1, '#8b9aab');
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';    // the temper line along the edge
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(bx + 12, 15);
  ctx.quadraticCurveTo(bx + bl * 0.55, 2, bx + bl - 8, -4);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx, -18);
  ctx.quadraticCurveTo(bx + bl * 0.55, -25, bx + bl, -5);
  ctx.stroke();
  ctx.restore();

  // the blur of a swing, fading out after the cut
  if (gun.recoil > 0.02) {
    ctx.save();
    ctx.globalAlpha = clamp(gun.recoil, 0, 1) * 0.4;
    ctx.strokeStyle = '#eaf3ff';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(hx, hy, 430, -2.5 + aim * 0.2, -0.6 + aim * 0.2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawMuzzleFlash() {
  const w = currentGun();
  const m = gunMuzzle();
  const mx = m.x, my = m.y;
  const a = clamp(gun.flash, 0, 1);
  const r = (54 + 42 * a) * gunScale() * gunAimScale(w) * w.flashScale;

  const bolt = !!w.bolt;
  const g = ctx.createRadialGradient(mx, my, 0, mx, my, r * 1.7);
  g.addColorStop(0, bolt ? 'rgba(232, 252, 255, ' + (0.95 * a) + ')' : 'rgba(255, 250, 224, ' + (0.95 * a) + ')');
  g.addColorStop(0.3, bolt ? 'rgba(140, 235, 255, ' + (0.6 * a) + ')' : 'rgba(255, 206, 104, ' + (0.55 * a) + ')');
  g.addColorStop(1, bolt ? 'rgba(60, 180, 255, 0)' : 'rgba(255, 150, 40, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(mx, my, r * 1.7, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(game.time * 22);
  const spikes = w.flashSpikes;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 ? r * 0.4 : r * 1.1;
    const ang = (i / (spikes * 2)) * TAU;
    const px = Math.cos(ang) * rad;
    const py = Math.sin(ang) * rad * 0.68;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = bolt ? 'rgba(224, 250, 255, ' + (0.92 * a) + ')' : 'rgba(255, 246, 206, ' + (0.92 * a) + ')';
  ctx.fill();
  ctx.restore();
}

function drawGun() {
  const w = currentGun();
  const t = gunTransform();
  const s = gunScale() * gunAimScale(w);   // sighted in, the weapon is drawn smaller
  ctx.save();
  // down a scope the rifle itself gives way to the sight picture (see drawScope)
  if (w.scope) ctx.globalAlpha = 1 - clamp((aimBlend() - 0.35) / 0.45, 0, 1);
  ctx.translate(t.x, t.y);
  ctx.rotate(t.rot);
  ctx.scale(s, s);
  w.draw();                            // arms + weapon in the weapon's own sub-frame
  ctx.restore();
  if (gun.flash > 0.001) drawMuzzleFlash();
}

/* =========================================================================
   HUD + overlay + input + main loop
   ========================================================================= */
const els = {
  level: document.getElementById('levelNum'),
  targetProg: document.getElementById('targetProg'),
  flagProg: document.getElementById('flagProg'),
  enemyProg: document.getElementById('enemyProg'),
  knifeProg: document.getElementById('knifeProg'),
  fireProg: document.getElementById('fireProg'),
  targetBar: document.getElementById('targetBar'),
  flagBar: document.getElementById('flagBar'),
  enemyBar: document.getElementById('enemyBar'),
  knifeBar: document.getElementById('knifeBar'),
  fireBar: document.getElementById('fireBar'),
  score: document.getElementById('score'),
  acc: document.getElementById('acc'),
  slices: document.getElementById('sliceStat'),
  energy: document.getElementById('energyStat'),
  energyStat: document.getElementById('energyStat'),
  roundStat: document.getElementById('roundStat'),
  chargeHint: document.getElementById('chargeHint'),
  ammo: document.getElementById('ammo'),
  ammoBox: document.getElementById('ammoBox'),
  hpBox: document.getElementById('hpBox'),
  hpNum: document.getElementById('hpNum'),
  hpBar: document.getElementById('hpBar'),
  medBtn: document.getElementById('medBtn'),
  medNum: document.getElementById('medNum'),
  gunName: document.getElementById('gunName'),
  gunBar: document.getElementById('gunBar'),
  overlay: document.getElementById('overlay'),
  ovTitle: document.getElementById('ovTitle'),
  ovSub: document.getElementById('ovSub'),
  ovBody: document.getElementById('ovBody'),
  ovBtn: document.getElementById('ovBtn'),
  ovAlt: document.getElementById('ovAlt'),
  card: document.getElementById('ovCard'),
  perkBadge: document.getElementById('perkBadge'),
  perkName: document.getElementById('perkName')
};
const MENU_HTML = els.ovBody.innerHTML;

function setText(el, value) {
  if (el && el.textContent !== value) el.textContent = value;
}

function updateHud() {
  const w = currentGun();
  setText(els.level, String(game.level));
  setText(els.targetProg, game.targetsDone + ' / ' + game.targetsNeeded);
  setText(els.flagProg, game.flagsDone + ' / ' + game.flagsNeeded);
  setText(els.enemyProg, game.enemiesDone + ' / ' + game.enemiesNeeded);
  setText(els.knifeProg, game.knivesDone + ' / ' + game.knivesNeeded);
  setText(els.fireProg, game.firesDone + ' / ' + game.firesNeeded);
  setText(els.score, fmt(game.score));
  setText(els.acc, game.shots ? Math.round(accuracy() * 100) + '%' : '—');
  setText(els.slices, String(game.slices));
  const loaded = (w.energy === true && game.charged) || (w.sniper === true && game.sniperLoaded);
  setText(els.ammo, (w.melee || loaded) ? '∞' : ((w.energy || w.sniper) ? '0' : (gun.reloading > 0 ? '—' : String(gun.ammo))));
  setText(els.energy, game.charged ? '∞' : game.energy + ' / ' + ENERGY_MAX);
  if (els.energyStat) els.energyStat.classList.toggle('charged', game.charged);
  if (els.roundStat) {
    els.roundStat.textContent = game.sniperLoaded ? '∞' : game.rounds + ' / ' + ROUND_MAX;
    els.roundStat.classList.toggle('loaded', game.sniperLoaded);
  }
  if (els.chargeHint) {
    els.chargeHint.textContent = w.sniper ? (game.sniperLoaded ? 'loaded' : 'rounds') : 'charged';
  }
  setText(els.gunName, w.name);
  if (els.targetBar) els.targetBar.style.width = (game.targetsNeeded ? clamp(game.targetsDone / game.targetsNeeded, 0, 1) * 100 : 0) + '%';
  if (els.flagBar) els.flagBar.style.width = (game.flagsNeeded ? clamp(game.flagsDone / game.flagsNeeded, 0, 1) * 100 : 0) + '%';
  if (els.enemyBar) els.enemyBar.style.width = (game.enemiesNeeded ? clamp(game.enemiesDone / game.enemiesNeeded, 0, 1) * 100 : 0) + '%';
  if (els.knifeBar) els.knifeBar.style.width = (game.knivesNeeded ? clamp(game.knivesDone / game.knivesNeeded, 0, 1) * 100 : 0) + '%';
  if (els.fireBar) els.fireBar.style.width = (game.firesNeeded ? clamp(game.firesDone / game.firesNeeded, 0, 1) * 100 : 0) + '%';
  if (els.ammoBox) {
    els.ammoBox.classList.toggle('energy', w.energy === true);
    els.ammoBox.classList.toggle('sniper', w.sniper === true);
    els.ammoBox.classList.toggle('empty', !w.melee && !loaded && gun.ammo <= 0 && gun.reloading <= 0);
    els.ammoBox.classList.toggle('charged', loaded);
  }

  // health
  const hp = Math.max(0, Math.round(game.hp));
  setText(els.hpNum, String(hp));
  setText(els.medNum, String(game.medKits));
  if (els.hpBar) els.hpBar.style.width = clamp(game.hp / MAX_HP, 0, 1) * 100 + '%';
  if (els.hpBox) {
    els.hpBox.classList.toggle('hurt', game.hp <= MAX_HP * 0.6 && game.hp > MAX_HP * 0.3);
    els.hpBox.classList.toggle('crit', game.hp <= MAX_HP * 0.3);
  }
  if (els.medBtn) els.medBtn.disabled = !(game.state === 'playing' && game.medKits > 0 && game.hp < MAX_HP && game.healing <= 0);

  if (els.perkBadge) {
    const active = game.perk ? perkById(game.perk) : null;
    els.perkBadge.classList.toggle('hidden', !active);
    if (active) setText(els.perkName, active.name);
  }

  if (els.gunBar) {
    for (let i = 0; i < els.gunBar.children.length; i++) {
      const chip = els.gunBar.children[i];
      chip.classList.toggle('is-on', chip.getAttribute('data-gun') === w.id);
    }
  }
}

function showOverlay(mode, data) {
  els.overlay.classList.remove('hidden');
  if (els.card) els.card.classList.toggle('wide', mode === 'levelclear');
  if (els.ovAlt && mode !== 'levelclear') els.ovAlt.classList.add('hidden');
  els.overlay.classList.toggle('hidden-chrome', mode !== 'menu');
  if (mode === 'menu') {
    els.ovTitle.textContent = 'Bullseye Range';
    els.ovSub.textContent = 'A first-person shooting gallery';
    els.ovBody.innerHTML = MENU_HTML;
    els.ovBtn.textContent = 'Start shooting';
    els.ovBtn.dataset.action = 'start';
  } else if (mode === 'levelclear') {
    const offers = Array.isArray(game.offer) ? game.offer : [];
    let anyAfford = false;
    let cards = '';
    offers.forEach(function (o, i) {
      const perk = perkById(o.id);
      if (!perk) return;
      const afford = game.score >= o.price;
      anyAfford = anyAfford || afford;
      cards +=
        '<div class="offer">' +
        '<div class="offer-tag">One round only</div>' +
        '<b class="offer-name">' + perk.name + '</b>' +
        '<p>' + perk.blurb + '</p>' +
        '<button class="btn offer-buy' + (afford ? '' : ' is-short') + '" type="button"' +
        ' data-buy="' + i + '"' + (afford ? '' : ' disabled') + '>' +
        (afford ? 'Buy &middot; ' + fmt(o.price) : fmt(o.price) + ' pts') +
        '</button>' +
        '<span class="offer-note">' +
        (afford ? 'you have ' + fmt(game.score) : 'you are ' + fmt(o.price - game.score) + ' short') +
        '</span>' +
        '</div>';
    });
    els.ovTitle.textContent = 'Level ' + game.level + ' cleared';
    els.ovSub.textContent = game.levelTime.toFixed(1) + 's · ' + Math.round(data.acc * 100) + '% accuracy';
    els.ovBody.innerHTML =
      '<div class="tally">' +
      '<div><span>Level bonus</span><b>+' + data.clearBonus + '</b></div>' +
      '<div><span>Accuracy bonus</span><b>+' + data.accBonus + '</b></div>' +
      '<div><span>Speed bonus</span><b>+' + data.timeBonus + '</b></div>' +
      '<div class="total"><span>New score</span><b>' + fmt(game.score) + '</b></div>' +
      '</div>' + (cards ? '<div class="offers">' + cards + '</div>' : '');
    els.ovBtn.textContent = anyAfford ? 'No thanks →' : 'Next level →';
    els.ovBtn.dataset.action = 'decline';
    els.ovBtn.disabled = false;
    if (els.ovAlt) els.ovAlt.classList.add('hidden');
  } else if (mode === 'down') {
    els.ovTitle.textContent = 'You are down';
    els.ovSub.textContent = 'Level ' + game.level + ' · ' + data.kills + ' shooter' + (data.kills === 1 ? '' : 's') + ' put down';
    els.ovBody.innerHTML =
      '<div class="tally">' +
      '<div><span>Score</span><b>' + fmt(game.score) + '</b></div>' +
      '<div><span>Shooters put down</span><b>' + data.kills + '</b></div>' +
      '<div><span>Shots deflected</span><b>' + data.deflects + '</b></div>' +
      '<div><span>Rounds sliced</span><b>' + data.slices + '</b></div>' +
      '<div class="total"><span>Accuracy</span><b>' + Math.round(data.acc * 100) + '%</b></div>' +
      '</div>' +
      '<p class="sub">A fresh level, full health and three med kits.</p>';
    els.ovBtn.textContent = 'Have another go';
    els.ovBtn.dataset.action = 'restart';
  } else {
    els.ovTitle.textContent = 'Paused';
    els.ovSub.textContent = 'Level ' + game.level + ' · score ' + fmt(game.score);
    els.ovBody.innerHTML = '<p>Take your time. The range will wait.</p>';
    els.ovBtn.textContent = 'Resume';
    els.ovBtn.dataset.action = 'resume';
  }
}

function hideOverlay() {
  els.overlay.classList.add('hidden');
}

els.ovBtn.addEventListener('click', function () {
  const action = els.ovBtn.dataset.action;
  if (action === 'start') startGame();
  else if (action === 'buy') buyOffer();
  else if (action === 'decline') declineOffer();
  else if (action === 'next') nextLevel();
  else if (action === 'restart') startGame();
  else if (action === 'resume') togglePause();
});

els.ovBody.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-buy]');
  if (btn && !btn.disabled) buyOffer(parseInt(btn.dataset.buy, 10));
});

if (els.ovAlt) {
  els.ovAlt.addEventListener('click', function () {
    if (els.ovAlt.dataset.action === 'decline') declineOffer();
  });
}

if (els.gunBar) {
  els.gunBar.addEventListener('click', function (e) {
    const chip = e.target && e.target.closest ? e.target.closest('.gun-chip') : null;
    if (chip) selectWeapon(chip.getAttribute('data-gun'));
  });
}

if (els.medBtn) {
  els.medBtn.addEventListener('click', function (e) {
    e.preventDefault();
    useMedKit();
  });
}

/* ---------------- input ---------------- */
const keys = Object.create(null);

function setCross(x, y) {
  cross.x = clamp(x, 6, W - 6);
  cross.y = clamp(y, 6, H - 6);
}

window.addEventListener('mousemove', e => setCross(e.clientX, e.clientY));
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  e.preventDefault();
  if (e.button === 2) {            // right button: bring the gun up to the sights
    setCross(e.clientX, e.clientY);
    aiming = true;
    sightKicked = false;                           // a fresh shoulder brings the sights up
    if (katanaOut()) game.guardT = GUARD_LATCH;   // the guard covers a quick tap too
    return;
  }
  if (e.button !== 0) return;      // only the left button pulls the trigger
  setCross(e.clientX, e.clientY);
  triggerHeld = true;
  fire();
});
window.addEventListener('mouseup', e => {
  if (e.button === 2) { aiming = false; sightKicked = false; }   // re-shouldering resets it
  else triggerHeld = false;
});
window.addEventListener('blur', () => { triggerHeld = false; aiming = false; sightKicked = false; });
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  setCross(t.clientX, t.clientY);
  triggerHeld = true;
  fire();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  setCross(t.clientX, t.clientY);
}, { passive: false });
const releaseTrigger = () => { triggerHeld = false; };
canvas.addEventListener('touchend', releaseTrigger);
canvas.addEventListener('touchcancel', releaseTrigger);

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) !== -1) e.preventDefault();
  if (e.repeat) return;
  const pickIdx = WEAPONS.findIndex(w => w.code === e.code);
  if (pickIdx !== -1) selectWeapon(pickIdx);
  else if (e.code === 'KeyQ') cycleWeapon(-1);
  else if (e.code === 'KeyE') cycleWeapon(1);
  else if (e.code === 'KeyR') startReload();
  else if (e.code === 'KeyF') useMedKit();
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'Space') fire();
  else if (e.code === 'Enter' && game.state === 'levelclear') declineOffer();   // Enter = no thanks
  else if (e.code === 'Enter' && game.state === 'down') startGame();
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  cycleWeapon(e.deltaY > 0 ? 1 : -1);
}, { passive: false });
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; triggerHeld = false; });

/* ---------------- per frame ---------------- */
function updateCamera(dt) {
  if (game.state !== 'playing' && game.state !== 'levelclear') return;
  let turn = 0;
  if (keys['KeyA'] || keys['ArrowLeft']) turn -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) turn += 1;
  let rate = turn * 1.9;
  if (turn === 0) {                                  // steer when the aim pushes the edge
    if (cross.x < W * 0.07) rate = -1.5;
    else if (cross.x > W * 0.93) rate = 1.5;
  }
  rate *= 1 - (1 - AIM_TURN) * aimBlend();           // steady down the sights
  cam.yaw += rate * dt;
  if (cam.yaw > Math.PI) cam.yaw -= TAU;
  if (cam.yaw < -Math.PI) cam.yaw += TAU;
  cam.pitch = damp(cam.pitch, 0, 6, dt);
  cam.shake = Math.max(0, cam.shake - dt * 5.5);
  cross.hover = game.state === 'playing' ? !!findHit() : false;
}

function step(dt) {
  if (game.state !== 'paused') {
    game.time += dt;
    if (game.state === 'playing') game.levelTime += dt;
    updateEntities(dt);
    updateEffects(dt);
    updateBullets(dt);
    tickReload(dt);
    tickHeal(dt);
    if (game.state === 'playing' && (triggerHeld || keys['Space'])) fire();   // full-auto while held
    gun.recoil = Math.max(0, gun.recoil - dt * 4.2);
    gun.flash = Math.max(0, gun.flash - dt * 9);
    gun.flameT = Math.max(0, gun.flameT - dt);      // the jet fades once you let go
    gun.foamT = Math.max(0, gun.foamT - dt);
    game.sliceT = Math.max(0, game.sliceT - dt);     // the swing stops being live
    game.guardT = Math.max(0, game.guardT - dt);     // ...and so does the tapped guard
    // the sights come up and down at a steady speed; a katana tap holds them up,
    // and a shot off the sniper's shoulder keeps them down until it is re-shouldered
    const aimTarget = (((aiming && !sightKicked) || (game.guardT > 0 && katanaOut()))
      && game.state === 'playing') ? 1 : 0;
    gun.aim += clamp(aimTarget - gun.aim, -dt / 0.16, dt / 0.16);
    updateCamera(dt);
  }
  game.hurtFlash = Math.max(0, game.hurtFlash - dt * 1.6);
  updateHud();
}

let lastStamp = 0;
function frame(now) {
  if (!lastStamp) lastStamp = now;
  const dt = clamp((now - lastStamp) / 1000, 0.001, 0.05);
  lastStamp = now;
  step(dt);
  render();
  requestAnimationFrame(frame);
}

/* ---------------- boot ---------------- */
cross.x = W * 0.5;
cross.y = H * 0.42;
spawnLevel(1);
game.state = 'menu';
showOverlay('menu');
updateHud();
requestAnimationFrame(frame);

/* Debug / test hook (harmless in play): lets automation aim and inspect state. */
window.__range = {
  game: game, cam: cam, cross: cross, gun: gun,
  weapons: WEAPONS, currentGun: currentGun, selectWeapon: selectWeapon, cycleWeapon: cycleWeapon,
  get gunIndex() { return gunIndex; },
  project: project, hitTest: hitTest, findHit: findHit, findHits: findHits, fire: fire,
  get weapon() {
    const w = currentGun();
    return { id: w.id, interval: w.interval, pierce: w.pierce || 1, recoil: w.recoil,
             kick: w.kick, shake: w.shake, ammo: gun.ammo, mag: w.mag };
  },
  startGame: startGame, nextLevel: nextLevel, spawnLevel: spawnLevel,
  showOverlay: showOverlay, hideOverlay: hideOverlay,
  startReload: startReload, completeLevel: completeLevel,
  perks: PERKS, perkById: perkById, perkOn: perkOn, magSize: magSize, reloadTime: reloadTime,
  perkPrice: perkPrice, rollOffer: rollOffer, buyOffer: buyOffer, declineOffer: declineOffer,
  get perk() { return game.perk; },
  get offer() { return game.offer; },
  get magNow() { return magSize(currentGun()); },
  get reloadNow() { return reloadTime(currentGun()); },
  drawGun: drawGun, gunTransform: gunTransform, gunScale: gunScale,
  gunMuzzleOffset: gunMuzzleOffset, aimRef: AIM_REF,
  gunAimScale: gunAimScale,
  get sightDrop() { return SIGHT_DROP; },
  gunPitch: gunPitch, gunTilt: function () { return currentGun().tilt || 0; },
  get fires() { return game.fires; },
  get firesNeeded() { return game.firesNeeded; },
  get firesDone() { return game.firesDone; },
  fireAnchor: fireAnchor, fireTargets: fireTargets, douse: douse, sprayFoam: sprayFoam,
  coneTargets: coneTargets,
  get foamRange() { return FOAM_RANGE; },
  get foamDose() { return FOAM_DOSE; },
  get fireScore() { return FIRE_SCORE; },
  get chokeTime() { return CHOKE_TIME; },
  drawFire: drawFire, drawExtinguisher: drawExtinguisher, drawFoamJet: drawFoamJet,
  armWrist: armWrist,
  aimBlend: aimBlend,
  get triggerHeld() { return triggerHeld; },
  get sightKicked() { return sightKicked; },
  focalLength: focalLength, gunMuzzle: gunMuzzle, targetFace: targetFace, flagShape: flagShape,
  entityPoint: function (e) {
    if (e.type === 'target') {
      const f = targetFace(e);
      return f ? { x: f.x, y: f.y } : null;
    }
    if (e.type === 'enemy' || e.type === 'knife') {
      const f = enemyFace(e);
      return f ? { x: f.x, y: f.bot - e.h * f.k * 0.62 } : null;   // chest height
    }
    const s = flagShape(e);
    return s ? { x: s.pTop.x + s.w * 0.45, y: s.pTop.y + s.h * 0.5 } : null;
  },
  nearest: function (type) {
    let best = null;
    for (let i = 0; i < game.entities.length; i++) {
      const e = game.entities[i];
      if (e.state !== 'alive') continue;
      if (type && e.type !== type) continue;
      const ex = e.type === 'flag' ? e.x : e.hx, ez = e.type === 'flag' ? e.z : e.hz;
      const d = depthOf(ex, ez);
      if (!best || d < best.d) best = { e: e, d: d };
    }
    return best ? best.e : null;
  },
  // energy pistols: cells, the drop roll and the charge
  energyMax: ENERGY_MAX, energyDropChance: ENERGY_DROP_CHANCE,
  get energy() { return game.energy; },
  get charged() { return game.charged; },
  get dropChance() { return dropChance; },
  setDropChance: function (v) { dropChance = v; },
  energyRoll: energyRoll, dropEnergy: dropEnergy, collectEnergy: collectEnergy,
  maybeCharge: maybeCharge, energyPistolsOut: energyPistolsOut, needEnergy: needEnergy,
  drawEnergyCell: drawEnergyCell, drawEnergyPistols: drawEnergyPistols,
  // the sniper rifle: cartridges, the drop roll and the load
  roundMax: ROUND_MAX, roundDropChance: ROUND_DROP_CHANCE,
  get rounds() { return game.rounds; },
  get sniperLoaded() { return game.sniperLoaded; },
  get roundChance() { return roundChance; },
  setRoundChance: function (v) { roundChance = v; },
  roundRoll: roundRoll, dropRound: dropRound, collectRound: collectRound,
  maybeLoadSniper: maybeLoadSniper, sniperOut: sniperOut, needRounds: needRounds,
  drawRound: drawRound, drawSniper: drawSniper, drawSniperBody: drawSniperBody,
  drawScope: drawScope,
  // new-feature hooks for the headless tests
  enemyFace: enemyFace, enemyFire: enemyFire, slash: slash, resolveBullet: resolveBullet,
  useMedKit: useMedKit, tickHeal: tickHeal, updateBullets: updateBullets, hurt: hurt,
  guarding: guarding, deflectsShot: deflectsShot, playerDown: playerDown,
  sliceBullet: sliceBullet, inSliceReach: inSliceReach, sliceReach: SLICE_REACH,
  turnAside: turnAside, inGuardReach: inGuardReach,
  sendBack: sendBack, returnHit: returnHit, spawnLevel: spawnLevel,
  guardReach: GUARD_REACH, guardLatch: GUARD_LATCH,
  // a round put on the range by hand, for the headless tests
  spawnBullet: function (opts) {
    opts = opts || {};
    const a = opts.angle === undefined ? 0 : opts.angle;       // 0 = straight ahead
    const d = opts.dist === undefined ? 8 : opts.dist;
    const x = cam.x + Math.sin(a) * d, z = cam.z + Math.cos(a) * d;
    const b = {
      x0: x, y0: 1.45, z0: z, x: x, y: 1.45, z: z,
      tx: cam.x, ty: cam.y - 0.34, tz: cam.z,
      dist: 0, travelled: 0, speed: opts.speed || 95,
      aimed: opts.aimed === undefined ? true : !!opts.aimed, life: 1.6
    };
    b.dist = Math.hypot(b.tx - b.x0, b.ty - b.y0, b.tz - b.z0);
    game.bullets.push(b);
    return b;
  },
  render: render, drawEnemy: drawEnemy, drawKatana: drawKatana,
  setAiming: function (on) { aiming = !!on; },
  get aiming() { return aiming; },
  setHp: function (v) { game.hp = clamp(v, 0, MAX_HP); updateHud(); },
  bullets: function () { return game.bullets; },
  step: step, updateEntities: updateEntities,
  // knife men and the flamethrower
  knifeReach: KNIFE_REACH, knifeWindup: KNIFE_WINDUP, knifeMax: KNIFE_MAX,
  knifeDamage: KNIFE_DAMAGE, knifeSpeed: KNIFE_SPEED, knifeCooldown: KNIFE_COOLDOWN,
  get knivesNeeded() { return game.knivesNeeded; },
  get knivesDone() { return game.knivesDone; },
  get burned() { return game.burned; },
  knifeMen: function () {
    return game.entities.filter(function (e) { return e.type === 'knife'; });
  },
  spawnKnife: function (opts) {
    opts = opts || {};
    const a = opts.angle === undefined ? 0 : opts.angle;
    const d = opts.dist === undefined ? 7 : opts.dist;
    const e = {
      type: 'knife', x: cam.x + Math.sin(a) * d, z: cam.z + Math.cos(a) * d,
      h: 1.74, r: 0.38, state: 'alive', t: 0, drop: 0, alpha: 1,
      speed: opts.speed === undefined ? KNIFE_SPEED[0] : opts.speed,
      stride: 0, swing: 0, cool: opts.cool === undefined ? 0 : opts.cool,
      burn: 0, burnFrom: 0, choke: 0, ember: rand(0, TAU), jacket: randInt(0, 3)
    };
    e.hx = e.x; e.hz = e.z;
    game.entities.push(e);
    return e;
  },
  flameRange: FLAME_RANGE, flameTol: FLAME_TOL, flameBurn: FLAME_BURN,
  flameJet: FLAME_JET, flameScorch: FLAME_SCORCH,
  entityAnchor: entityAnchor, flameDistance: flameDistance, flameTargets: flameTargets,
  ignite: ignite, scorch: scorch, sprayFlame: sprayFlame,
  get flameT() { return gun.flameT; },
  drawFlamethrower: drawFlamethrower, drawFlameJet: drawFlameJet, drawKnife: drawKnife,
  drawBurn: drawBurn
};

