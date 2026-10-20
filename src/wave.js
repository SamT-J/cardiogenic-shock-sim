/* Waveform synthesis: ECG (12 lead), arterial line, pleth, respiration.
   All functions are pure in (time, params); the rhythm generator keeps the beat list. */

const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

// Normal amplitudes (mV) per lead: P, Q, R, S, T
const LEAD_BASE = {
  I:   { p: 0.08, q: -0.03, r: 0.70, s: -0.10, t: 0.25 },
  II:  { p: 0.15, q: -0.05, r: 1.10, s: -0.15, t: 0.35 },
  III: { p: 0.06, q: -0.05, r: 0.50, s: -0.20, t: 0.15 },
  aVR: { p: -0.10, q: 0.00, r: -0.90, s: 0.00, t: -0.30 },
  aVL: { p: 0.04, q: -0.02, r: 0.35, s: -0.15, t: 0.12 },
  aVF: { p: 0.10, q: -0.04, r: 0.80, s: -0.15, t: 0.25 },
  V1:  { p: 0.05, q: 0.00, r: 0.20, s: -1.20, t: -0.15 },
  V2:  { p: 0.05, q: 0.00, r: 0.45, s: -1.60, t: 0.40 },
  V3:  { p: 0.05, q: 0.00, r: 0.90, s: -1.00, t: 0.50 },
  V4:  { p: 0.08, q: -0.03, r: 1.60, s: -0.50, t: 0.45 },
  V5:  { p: 0.08, q: -0.05, r: 1.40, s: -0.25, t: 0.35 },
  V6:  { p: 0.08, q: -0.05, r: 1.00, s: -0.15, t: 0.30 },
};

function gauss(x, c, s) { const d = (x - c) / s; return Math.exp(-0.5 * d * d); }

/* One beat's ECG contribution at time tau (s) relative to QRS onset.
   morph: { st:{lead:mm}, q:{lead:mV}, tinv:{lead:true}, broad:bool, pr:s, hasP:bool, escape:bool, pvc:bool, paced:bool, rr:s, tall_t:{lead:mV}, lowvolt:number } */
function ecgBeat(lead, tau, morph) {
  const b = LEAD_BASE[lead];
  const broad = morph.broad ? 2.2 : 1;
  const gain = morph.lowvolt || 1;
  let v = 0;
  if (morph.hasP !== false && !morph.broad && !morph.pvc) {
    v += b.p * gauss(tau, -(morph.pr || 0.16) + 0.04, 0.025);
  }
  if (morph.paced) v += (tau > -0.012 && tau < -0.006) ? 1.5 : 0; // pacing spike
  const q = b.q + ((morph.q && morph.q[lead]) || 0);
  let r = b.r, s = b.s;
  if (morph.pvc || morph.broad) { // broad complexes: bigger, opposite-ish polarity in some leads
    r = b.r * 1.4; s = b.s * 1.6;
    if (morph.pvc && (lead === 'V1' || lead === 'V2' || lead === 'aVR')) { r = 1.2; s = -0.4; }
  }
  v += q * gauss(tau, 0.012 * broad, 0.008 * broad);
  v += r * gauss(tau, 0.035 * broad, 0.012 * broad);
  v += s * gauss(tau, 0.060 * broad, 0.014 * broad);
  if (morph.rbbb && (lead === 'V1' || lead === 'V2')) v += 0.6 * gauss(tau, 0.085, 0.015); // R'
  if (morph.rbbb && (lead === 'I' || lead === 'V6' || lead === 'aVL')) v += -0.3 * gauss(tau, 0.095, 0.02); // slurred S
  // ST segment and T wave
  const rr = morph.rr || 0.8;
  const qt = 0.40 * Math.sqrt(Math.min(1.2, Math.max(0.3, rr)));
  const stmm = (morph.st && morph.st[lead]) || 0;
  const stmv = stmm / 10;
  let t = b.t + ((morph.tall_t && morph.tall_t[lead]) || 0);
  if (morph.tinv && morph.tinv[lead]) t = -Math.abs(t) * 0.8;
  if (morph.broad || morph.pvc) t = -Math.sign(r) * Math.abs(t) * 1.8; // discordant T
  // ST shift modelled as a wide hump that merges into the T wave (convex when elevated)
  v += stmv * 1.05 * gauss(tau, 0.17 * broad, 0.085);
  v += stmv * 0.45 * gauss(tau, 0.10 * broad, 0.03);
  v += (t + stmv * 0.6) * gauss(tau, 0.75 * qt * (morph.broad ? 1.15 : 1), 0.045 + 0.01 * (rr > 1 ? 1 : 0));
  return v * gain;
}

/* VF: chaotic sum of sines with wandering amplitude. */
function vfSample(t, coarse) {
  const a = coarse ? 0.55 : 0.2;
  return a * (Math.sin(2 * Math.PI * 4.3 * t) + 0.7 * Math.sin(2 * Math.PI * 6.1 * t + 1.3) + 0.5 * Math.sin(2 * Math.PI * 2.7 * t + 0.4) + 0.3 * Math.sin(2 * Math.PI * 9.3 * t)) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.35 * t));
}

/* Rhythm generator: produces beat events with per-beat morphology given current engine state. */
class Rhythm {
  constructor() { this.beats = []; this.nextT = 0; this.pT = 0; this.ps = []; this.seed = 1; this.lastHR = 70; this.nextPvc = 0; }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  /* Advance to time t (s, waveform clock) using live state: {hr, rhythm, pr, broad, ectopyRate, paced, aflutter} */
  advance(t, st) {
    const hr = Math.max(0, st.hr || 0);
    const rhythm = st.rhythm || 'sinus';
    if (rhythm === 'vf' || rhythm === 'asystole') { this.nextT = t + 0.5; this.beats = this.beats.filter(b => b.t0 > t - 2); this.lastHR = hr; return; }
    if (hr < 5) { this.nextT = t + 1; return; }
    while (this.nextT <= t + 0.05) {
      let rr = 60 / hr;
      let morph = { rr, hasP: true, pr: st.pr || 0.16, broad: !!st.broad, rbbb: !!st.rbbb, st: st.st, q: st.q, tinv: st.tinv, tall_t: st.tall_t, lowvolt: st.lowvolt };
      if (rhythm === 'af') { rr *= 0.65 + 0.7 * this.rnd(); morph.hasP = false; }
      else if (rhythm === 'chb') { morph.hasP = false; morph.broad = !!st.broadEscape; morph.escape = true; }
      else if (rhythm === 'vt') { morph.hasP = false; morph.pvc = true; morph.broad = true; rr = 60 / Math.max(hr, 120); }
      else if (rhythm === 'paced') { morph.hasP = false; morph.paced = true; morph.broad = true; }
      else if (rhythm === 'junctional') { morph.hasP = false; }
      else { rr *= 1 + (this.rnd() - 0.5) * 0.04; } // sinus HRV
      // ectopy: occasional PVC with compensatory pause
      if (rhythm === 'sinus' && st.ectopy > 0 && this.rnd() < st.ectopy) {
        const pvc = { t0: this.nextT - rr * 0.35, morph: Object.assign({}, morph, { pvc: true, broad: true, hasP: false }) };
        if (!this.beats.length || pvc.t0 - this.beats[this.beats.length - 1].t0 > 0.3) this.beats.push(pvc);
        this.nextT += rr * 0.4; // compensatory pause
      }
      this.beats.push({ t0: this.nextT, morph });
      this.nextT += rr;
    }
    if (rhythm === 'chb') { // independent P waves at atrial rate
      const prr = 60 / (st.atrialRate || 90);
      while (this.pT <= t + 0.05) { this.ps.push(this.pT); this.pT += prr; }
      this.ps = this.ps.filter(p => p > t - 2);
    }
    this.beats = this.beats.filter(b => b.t0 > t - 3);
    this.lastHR = hr;
  }
  ecg(lead, t, st) {
    if (st.rhythm === 'vf') return vfSample(t, st.coarseVf !== false) * (lead === 'aVR' ? -1 : 1) * (LEAD_BASE[lead].r > 0.5 ? 1 : 0.7);
    if (st.rhythm === 'asystole') return 0.02 * Math.sin(2 * Math.PI * 0.3 * t);
    let v = 0;
    for (const b of this.beats) { const tau = t - b.t0; if (tau > -0.35 && tau < 0.75) v += ecgBeat(lead, tau, b.morph); }
    if (st.rhythm === 'chb') for (const p of this.ps) { const tau = t - p; if (tau > -0.1 && tau < 0.1) v += LEAD_BASE[lead].p * gauss(tau, 0, 0.025); }
    if (st.rhythm === 'af') v += 0.04 * Math.sin(2 * Math.PI * 7 * t) + 0.03 * Math.sin(2 * Math.PI * 11.3 * t + 1);
    if (st.cpr) v += 0.6 * Math.sin(2 * Math.PI * (110 / 60) * t); // compression artefact
    return v;
  }
  /* Most recent beat with QRS onset <= t, and the one before. */
  lastBeats(t) {
    let a = null, b = null;
    for (let i = this.beats.length - 1; i >= 0; i--) { if (this.beats[i].t0 <= t) { if (!a) a = this.beats[i]; else { b = this.beats[i]; break; } } }
    return [a, b];
  }
}

/* Arterial pressure sample. st: {sbp, dbp, hr, rhythm, iabp, cpr, et} ; one pulse per beat, ejecting beats only. */
function artSample(t, rh, st) {
  const sbp = st.sbp, dbp = st.dbp;
  if (st.rhythm === 'vf' || st.rhythm === 'asystole' || st.hr < 5 || (st.rhythm === 'vt' && st.sbp < 40)) {
    if (st.cpr) { const ph = (t * 110 / 60) % 1; return 15 + 60 * Math.max(0, Math.sin(Math.PI * ph)) ** 1.5; }
    return 8 + 2 * Math.sin(2 * Math.PI * 0.25 * t) + (Math.random() - 0.5);
  }
  const [a, b] = rh.lastBeats(t - 0.20); // 200 ms pre-ejection + transit delay
  if (!a) return dbp;
  const pp = Math.max(0, sbp - dbp);
  const hr = st.hr || 70;
  const et = Math.max(0.16, 0.38 - 0.0012 * hr); // ejection time
  const rr = a.morph.rr || 60 / hr;
  const tau = t - 0.20 - a.t0;
  const prevTail = b ? (t - 0.20 - b.t0) : null;
  // decay from the previous beat still ongoing at this beat's onset: approximate baseline
  let base = dbp;
  if (tau < 0) return dbp;
  let p;
  const notchLevel = 0.38, notchBump = 0.08;
  const weak = a.morph.pvc ? 0.35 : 1; // PVC: small pulse
  // respiratory pulse pressure variation: positive-pressure breaths raise PP in inspiration, spontaneous breaths lower it
  const rrb = Math.max(0, st.rr || 0), ppv = (st.ppv || 0) / 100;
  const respMod = rrb > 0 ? 1 + (ppv / 2) * (st.ventilated ? 1 : -1) * Math.sin(2 * Math.PI * (rrb / 60) * a.t0) : 1;
  const ppb = pp * weak * respMod;
  if (tau < 0.09) p = base + ppb * Math.sin((Math.PI / 2) * (tau / 0.09)) ** 1.2;
  else if (tau < et) { const f = (tau - 0.09) / (et - 0.09); p = base + ppb * (1 - (1 - notchLevel) * f * f); }
  else {
    const d = tau - et;
    const bump = notchBump * ppb * gauss(d, 0.03, 0.02);
    const tc = 0.33 + 0.12 * (st.svrNorm || 1);
    p = base + ppb * notchLevel * Math.exp(-d / tc) * (1 - Math.exp(-d / 0.01)) + bump;
    if (st.iabp) { // diastolic augmentation and end-diastolic dip
      p += ppb * 0.9 * gauss(d, 0.11, 0.07) * Math.max(0, 1 - d / (rr - et)) ;
      p -= 12 * gauss(d, rr - et - 0.03, 0.05);
    }
  }
  return p + (Math.random() - 0.5) * 0.6;
}

/* Pleth: smoothed, delayed pulse, autoscaled; noise rises as perfusion index falls. */
function plethSample(t, rh, st) {
  if (st.rhythm === 'vf' || st.rhythm === 'asystole' || st.hr < 5) return 0.5 + 0.08 * (Math.random() - 0.5) * (st.cpr ? 6 : 1);
  const [a] = rh.lastBeats(t - 0.30);
  if (!a) return 0.5;
  const tau = t - 0.30 - a.t0;
  const hr = st.hr || 70;
  const et = Math.max(0.16, 0.38 - 0.0012 * hr);
  const pi = Math.max(0.05, st.pi || 1);
  let y;
  if (tau < 0) y = 0;
  else if (tau < 0.12) y = Math.sin((Math.PI / 2) * (tau / 0.12)) ** 1.5;
  else { const d = tau - 0.12; y = Math.exp(-d / (0.25 + 0.1)) * (1 - 0.35 * (1 - Math.exp(-Math.abs(d - (et - 0.12)) / 0.02)) * (d > et - 0.12 ? 0 : 1)); y = Math.exp(-d / 0.3) + 0.12 * gauss(d, et - 0.05, 0.05); y = Math.min(1, y); }
  if (a.morph.pvc) y *= 0.3;
  const rrb = Math.max(0, st.rr || 0), ppv = (st.ppv || 0) / 100;
  if (rrb > 0) y *= 1 + (ppv / 2) * (st.ventilated ? 1 : -1) * Math.sin(2 * Math.PI * (rrb / 60) * a.t0);
  const noise = (Math.random() - 0.5) * (0.02 + 0.25 / (pi * 10 + 1));
  return 0.3 + 0.4 * y + noise;
}

/* Respiration: spontaneous sinusoid with asymmetric phases, or ventilator trapezoid. */
function respSample(t, st) {
  const rr = Math.max(0, st.rr || 0);
  if (rr < 1) return 0.5;
  const ph = (t * rr / 60) % 1;
  if (st.ventilated) { const ti = 0.33; return ph < ti ? Math.min(1, ph / ti * 1.2) : Math.max(0, 1 - (ph - ti) / 0.25); }
  const insp = 0.4;
  return ph < insp ? 0.5 - 0.5 * Math.cos(Math.PI * ph / insp) : 0.5 + 0.5 * Math.cos(Math.PI * (ph - insp) / (1 - insp));
}

/* Central venous pressure (mmHg): a, c and v waves with x and y descents, respiratory swing, cannon a waves in heart block, no a wave in AF. */
function cvpSample(t, rh, st) {
  const mean = st.cvp || 0;
  if (st.rhythm === 'vf' || st.rhythm === 'asystole' || st.hr < 5) return mean + (st.cpr ? 8 * Math.max(0, Math.sin(2 * Math.PI * (110 / 60) * t)) : 0) + 0.3 * Math.sin(2 * Math.PI * 0.25 * t);
  const [a] = rh.lastBeats(t + 0.15);
  let y = 0;
  const beats = rh.beats;
  for (const b of beats) {
    const tau = t - b.t0; if (tau < -0.3 || tau > 1.0) continue;
    const rr = b.morph.rr || 0.8;
    const aAmp = st.rhythm === 'af' ? 0 : st.rhythm === 'chb' ? (0.5 + 4 * ((Math.sin(b.t0 * 7.3) + 1) / 2)) : 1.6;
    y += aAmp * gauss(tau, -0.10, 0.035);                        // a wave (atrial contraction)
    y += 0.7 * gauss(tau, 0.06, 0.025);                           // c wave
    y -= 1.2 * gauss(tau, 0.18, 0.06);                            // x descent
    y += (1.4 + (st.trV || 0)) * gauss(tau, Math.min(0.42, rr * 0.5), 0.07);   // v wave
    y -= 1.0 * gauss(tau, Math.min(0.58, rr * 0.68), 0.06);       // y descent
  }
  const rr = Math.max(0, st.rr || 0);
  const resp = rr > 0 ? (st.ventilated ? 1.2 : -1.5) * Math.sin(2 * Math.PI * (rr / 60) * t) : 0;
  return mean + y + resp + (Math.random() - 0.5) * 0.2;
}

/* Capnogram (kPa): phase I baseline, sharp upstroke, rising plateau to EtCO2, vertical downstroke at inspiration. */
function capnoSample(t, st) {
  const rr = Math.max(0, st.rr || 0), et = st.etco2 || 0;
  if (rr < 1 || et <= 0) return 0.01 * Math.random();
  const T = 60 / rr, ph = ((t % T) + T) % T / T;
  const ti = st.ventilated ? 0.35 : 0.42;                 // inspiratory fraction of the cycle
  const sm = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const down = Math.min(0.05, 0.15 / T), up = Math.min(0.1, 0.2 / T / (1 - ti)); // ~150 ms downstroke, ~200 ms upstroke
  let y;
  if (ph < ti) y = 1 - sm(ph / down);                                               // phase 0/I: inspiratory downstroke then baseline
  else {
    const e = (ph - ti) / (1 - ti);                                                 // expiration 0..1
    const rise = 0.86 * sm(e / up);                                                 // phase II sigmoid
    const plateau = e < up ? 0 : 0.14 * sm((e - up) / (1 - up)) ;                  // phase III gentle alpha slope to end-tidal
    y = rise + plateau;
    if (!st.ventilated) y *= 0.985 + 0.015 * Math.sin(2 * Math.PI * 3 * e);        // spontaneous: slight plateau ripple
  }
  return y * et + (Math.random() - 0.5) * 0.012;
}

/* Static 12-lead: returns {lead: Float32Array} of 10 s at fs Hz using a fresh rhythm instance seeded for reproducibility. */
function render12Lead(st, fs = 250, seconds = 10) {
  const rh = new Rhythm(); rh.seed = 12345; rh.nextT = 0.3; rh.pT = 0.1;
  const n = Math.round(seconds * fs);
  const out = {};
  for (const l of LEADS) out[l] = new Float32Array(n);
  const noiseAmp = 0.012;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    rh.advance(t, st);
    const wander = 0.03 * Math.sin(2 * Math.PI * 0.25 * t) + 0.02 * Math.sin(2 * Math.PI * (st.rr || 16) / 60 * t);
    for (const l of LEADS) out[l][i] = rh.ecg(l, t, st) + wander + (Math.random() - 0.5) * noiseAmp;
  }
  return out;
}

const LEAD_ORDER_12 = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']];

/* Draw a standard 4x3 + rhythm strip 12 lead onto a canvas. pxPerMm sets resolution. */
function draw12Lead(canvas, data, st, pxPerMm = 4) {
  const mmW = 250 + 12, mmH = 4 * 32 + 6; // 10 s at 25 mm/s + margin, 4 rows of 32 mm
  canvas.width = mmW * pxPerMm; canvas.height = mmH * pxPerMm;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // grid
  ctx.lineWidth = 1;
  for (let mm = 0; mm <= mmW; mm++) { ctx.strokeStyle = mm % 5 ? '#f6c6c6' : '#e88d8d'; ctx.beginPath(); ctx.moveTo(mm * pxPerMm + 0.5, 0); ctx.lineTo(mm * pxPerMm + 0.5, canvas.height); ctx.stroke(); }
  for (let mm = 0; mm <= mmH; mm++) { ctx.strokeStyle = mm % 5 ? '#f6c6c6' : '#e88d8d'; ctx.beginPath(); ctx.moveTo(0, mm * pxPerMm + 0.5); ctx.lineTo(canvas.width, mm * pxPerMm + 0.5); ctx.stroke(); }
  const fs = data.I.length / 10;
  const mmPerS = 25, mmPerMv = 10;
  ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, pxPerMm * 0.45); ctx.lineJoin = 'round';
  ctx.font = `${pxPerMm * 3.2}px Arial`; ctx.fillStyle = '#111';
  const rowBase = r => (r * 32 + 22) * pxPerMm;
  const calPulse = (x0, y0) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 1 * pxPerMm, y0); ctx.lineTo(x0 + 1 * pxPerMm, y0 - 10 * pxPerMm); ctx.lineTo(x0 + 6 * pxPerMm, y0 - 10 * pxPerMm); ctx.lineTo(x0 + 6 * pxPerMm, y0); ctx.lineTo(x0 + 8 * pxPerMm, y0); ctx.stroke(); };
  const xOff = 8 * pxPerMm;
  for (let r = 0; r < 3; r++) {
    const y0 = rowBase(r);
    calPulse(2 * pxPerMm, y0);
    for (let c = 0; c < 4; c++) {
      const lead = LEAD_ORDER_12[r][c];
      const arr = data[lead];
      const i0 = Math.round(c * 2.5 * fs), i1 = Math.round((c + 1) * 2.5 * fs);
      ctx.fillText(lead, xOff + (c * 2.5 * mmPerS + 2) * pxPerMm, y0 - 14 * pxPerMm);
      ctx.beginPath();
      for (let i = i0; i < i1; i++) {
        const x = xOff + (i / fs) * mmPerS * pxPerMm;
        const y = y0 - arr[i] * mmPerMv * pxPerMm;
        i === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (c < 3) { const xs = xOff + ((c + 1) * 2.5) * mmPerS * pxPerMm; ctx.beginPath(); ctx.moveTo(xs, y0 - 6 * pxPerMm); ctx.lineTo(xs, y0 + 6 * pxPerMm); ctx.stroke(); }
    }
  }
  const y0 = rowBase(3);
  calPulse(2 * pxPerMm, y0);
  ctx.fillText('II', xOff + 2 * pxPerMm, y0 - 14 * pxPerMm);
  ctx.beginPath();
  const arr = data.II;
  for (let i = 0; i < arr.length; i++) { const x = xOff + (i / fs) * mmPerS * pxPerMm; const y = y0 - arr[i] * mmPerMv * pxPerMm; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
}

/* Scrolling monitor channel on a canvas with an erase bar. */
class Scope {
  constructor(canvas, opts) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.color = opts.color; this.pxPerSec = opts.pxPerSec || 125; this.lo = opts.lo; this.hi = opts.hi;
    this.lastT = null; this.lastY = null; this.gap = 24;
    this.sampleFn = opts.sample; this.lineWidth = opts.lineWidth || 2;
  }
  resize() {
    const r = this.c.getBoundingClientRect();
    if (r.width && (this.c.width !== Math.round(r.width) || this.c.height !== Math.round(r.height))) {
      const old = document.createElement('canvas'); old.width = this.c.width; old.height = this.c.height;
      if (old.width && old.height) old.getContext('2d').drawImage(this.c, 0, 0);
      this.c.width = Math.round(r.width); this.c.height = Math.round(r.height);
      this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, this.c.width, this.c.height);
      if (old.width && old.height) this.ctx.drawImage(old, 0, 0, this.c.width, this.c.height);
      this.lastY = null;
    }
  }
  span() { return this.c.width / this.pxPerSec; }
  yOf(v) { const h = this.c.height; const f = (v - this.lo) / (this.hi - this.lo); return h - 6 - Math.max(0, Math.min(1, f)) * (h - 12); }
  draw(now, fs = 250) {
    this.resize();
    const w = this.c.width; if (!w) return;
    const span = this.span();
    if (this.lastT === null) this.lastT = now - 1 / fs;
    if (now - this.lastT > 1) this.lastT = now - 1 / fs;
    const ctx = this.ctx;
    ctx.strokeStyle = this.color; ctx.lineWidth = this.lineWidth; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let t = this.lastT + 1 / fs; t <= now; t += 1 / fs) {
      const x = (((t % span) + span) % span / span) * w;
      const xp = (((this.lastT % span) + span) % span / span) * w;
      const y = this.yOf(this.sampleFn(t));
      // erase bar ahead of the pen
      ctx.fillStyle = '#000'; ctx.fillRect(x + 1, 0, this.gap, this.c.height);
      if (x > w - this.gap - 1) ctx.fillRect(0, 0, (x + this.gap) - w + 1, this.c.height);
      if (this.lastY !== null && xp <= x) { ctx.beginPath(); ctx.moveTo(xp, this.lastY); ctx.lineTo(x, y); ctx.stroke(); }
      this.lastT = t; this.lastY = y;
    }
  }
}
