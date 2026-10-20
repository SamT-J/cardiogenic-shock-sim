/* Beat-averaged closed-loop circulation (Burkhoff / CVSim style) with oxygen transport, lactate,
   baroreflex, ischaemia spiral, drugs and devices. Units: mmHg, ml, s. Patient time in seconds. */

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, f) => a + (b - a) * f;
const sat = (x, s) => s * Math.atan(x / s);

// Normal adult parameters (RCVSIM / CVSim / Smith 2004, see research notes)
const NORMAL = {
  Ca: 1.6, Cv: 100, Cpa: 4.3, Cpv: 8.4,       // compliances ml/mmHg
  Rs: 1.0, Rp: 0.09,                          // resistances mmHg.s/ml (1.0 = 1333 dyn)
  lv: { Ees: 2.5, V0: 25, P0: 0.30, lam: 0.030 },
  rv: { Ees: 0.7, V0: 60, P0: 0.30, lam: 0.032 },
  stressed: 900,                              // vascular stressed volume ml (chambers not stored)
  Hb: 14, VO2: 250, BSA: 1.9, wt: 80,
};

function sevSat(po2kpa) { const p = po2kpa * 7.5; return 1 / (23400 / (p * p * p + 150 * p) + 1); }
function sevPo2(s) { let lo = 0.1, hi = 90; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (sevSat(m) < s) lo = m; else hi = m; } return (lo + hi) / 2; }
function edvFromP(p, v) { return v.V0 + Math.log(Math.max(p, 0) / v.P0 + 1) / v.lam; }

class Engine {
  constructor() { this.reset({}); }

  reset(sc) {
    const p = Object.assign({}, NORMAL, sc.params || {});
    this.p = p;
    this.t = 0;                                  // patient time (s)
    this.clock0 = sc.clock0 || 14 * 3600;        // wall clock at start
    // pathology knobs (scenario sets these)
    this.k = Object.assign({
      eesLv: 1, eesRv: 1,            // chronic/infarct depression multipliers
      eroa: 0, vsdA: 0,              // mitral regurgitant orifice cm2, VSD area cm2
      patency: 1,                    // culprit vessel 0..1 (supply)
      territory: 'lv',               // which ventricle the culprit supplies
      hrBase: 75, psp: 93, reflexGain: 1, hrReflexGain: 1,
      vagal: 0,                      // extra vagal tone (bpm reduction), atropine reverses
      rhythm: 'sinus', escapeRate: 40, atrialRate: 90, broadEscape: false, pr: 0.16,
      ectopy: 0, rbbb: false,
      shuntExtra: 0, baseDeficit: 0, temp: 36.8, glucose: 7, K: 4.2, creat: 90,
      rrBase: 16, gcsBase: 15, sedated: false, comatose: false,
      venousShift: 0,                // ml moved into stressed pool (sympathetic / disease)
      lam_lv_mul: 1,
    }, sc.k || {});
    // volumes: distribute stressed volume at a plausible steady state then let ODE settle
    const S = p.stressed + (this.k.venousShift || 0);
    this.V = { a: 0.11 * S, v: 0.66 * S, pa: 0.07 * S, pv: 0.16 * S };
    this.exoVol = 0;                             // crystalloid still intravascular
    this.contr = { lv: 1, rv: 1 };               // ischaemic spiral multipliers
    this.reflex = { hr: 0, r: 0, v: 0, e: 0 };
    this.lact = sc.lactate0 != null ? sc.lactate0 : 1.2;
    this.pco2 = sc.pco2_0 || 5.3;
    this.lastCI = 2.5; this.spo2 = 0.97; this.rr = this.k.rrBase; this.hr = this.k.hrBase; this.pao2 = 12; this.svo2 = 0.7; this.do2 = 1000; this.shunt = 0.05;
    this.fio2 = 0.21; this.peep = 0; this.ventilated = false; this.cpap = false;
    this.vent = { mode: 'VC', vt: 6, rr: 16, pinsp: 20 }; this.ventCalc = { vtMl: 0, pplat: 0, compliance: 50 }; this.furosT = 0;
    this.drugs = {};                             // name -> {level, target, tauOn, tauOff, bolusDecay}
    this.boluses = [];                           // transient effects {name, t0, dur, half}
    this.infusing = [];                          // fluids {ml, rate}
    this.devices = { artline: false, cvc: false, iabp: false, impella: 0, ecmo: 0, pacing: null, nibpLast: null, nibpNext: 0, cpr: false };
    this.rf = 0; this.qpqs = 1;
    this.urineTotal = 0; this.lastNibp = null;
    this.flags = {};
    this.log = [];
    this.out = {};
    this.settle();
  }

  settle() { const t0 = this.t; for (let i = 0; i < 2400; i++) this.integrate(0.25, false); this.t = t0; this.compute(); }

  // ---------- drug effect-site kinetics ----------
  setInfusion(name, dose, tauOn = 90, tauOff = 180) {
    const d = this.drugs[name] || (this.drugs[name] = { level: 0, target: 0, tauOn, tauOff });
    d.target = dose; d.tauOn = tauOn; d.tauOff = tauOff;
  }
  bolus(name, amount, half, onset = 60) { this.boluses.push({ name, amount, half, t0: this.t, onset }); }
  level(name) {
    let l = (this.drugs[name] && this.drugs[name].level) || 0;
    for (const b of this.boluses) if (b.name === name) { const dt = this.t - b.t0; l += b.amount * (1 - Math.exp(-dt / b.onset)) * Math.pow(0.5, dt / b.half); }
    return l;
  }

  // ---------- modifiers from drugs/devices ----------
  modifiers() {
    const L = n => this.level(n);
    const m = { hr: 0, hrMul: 1, eesLv: 1, eesRv: 1, rs: 1, cv: 1, cpv: 1, rp: 1, vo2: 1, resp: 0, lactAdd: 0, vagolytic: 0, venousShift: 0, sedation: 0, chrono: 0 };
    const sat1 = (x, k) => x / (x + k);
    let d;
    if ((d = L('norad'))) { m.rs *= 1 + 0.9 * sat1(d, 0.3); m.cv *= 1 - 0.3 * sat1(d, 0.15); m.eesLv *= 1 + 0.35 * sat1(d, 0.2); m.eesRv *= 1 + 0.35 * sat1(d, 0.2); m.hr += 4 * sat1(d, 0.3); }
    if ((d = L('adren'))) { m.eesLv *= 1 + 0.9 * sat1(d, 0.12); m.eesRv *= 1 + 0.9 * sat1(d, 0.12); m.hr += 30 * sat1(d, 0.15); m.rs *= 1 + 0.8 * sat1(d, 0.25) - 0.1 * sat1(d, 0.03); m.cv *= 1 - 0.2 * sat1(d, 0.2); m.lactAdd += 2.5 * sat1(d, 0.2); }
    if ((d = L('dobut'))) { m.eesLv *= 1 + 0.9 * sat1(d, 6); m.eesRv *= 1 + 0.9 * sat1(d, 6); m.hr += 28 * sat1(d, 8); m.rs *= 1 - 0.28 * sat1(d, 7); m.rp *= 1 - 0.25 * sat1(d, 7); }
    if ((d = L('milri'))) { m.eesLv *= 1 + 0.6 * sat1(d, 0.4); m.eesRv *= 1 + 0.6 * sat1(d, 0.4); m.rs *= 1 - 0.35 * sat1(d, 0.35); m.rp *= 1 - 0.35 * sat1(d, 0.35); m.hr += 6 * sat1(d, 0.5); }
    if ((d = L('vaso'))) { m.rs *= 1 + 0.45 * sat1(d, 0.025); }
    if ((d = L('metar'))) { m.rs *= 1 + 0.8 * sat1(d, 0.4); m.cv *= 1 - 0.3 * sat1(d, 0.4); m.hr -= 8 * sat1(d, 0.6); }
    if ((d = L('ephed'))) { const k = this.flags.catecholDepleted ? 0.6 : 1; m.hr += 15 * k * sat1(d, 6); m.eesLv *= 1 + 0.25 * k * sat1(d, 6); m.eesRv *= 1 + 0.25 * k * sat1(d, 6); m.rs *= 1 + 0.25 * sat1(d, 6); m.cv *= 1 - 0.12 * sat1(d, 6); }
    if ((d = L('glyco'))) { m.vagolytic += 0.75 * sat1(d, 0.15); }
    if ((d = L('gtn'))) { m.cv *= 1 + 1.2 * sat1(d, 2); m.cpv *= 1 + 0.5 * sat1(d, 2); m.rs *= 1 - 0.35 * sat1(d, 3); m.rp *= 1 - 0.25 * sat1(d, 4); m.hr += 6 * sat1(d, 3); }
    if ((d = L('isop'))) { m.hr += 45 * sat1(d, 4); m.eesLv *= 1 + 0.3 * sat1(d, 4); m.rs *= 1 - 0.3 * sat1(d, 4); m.chrono += d; }
    if ((d = L('atrop'))) { m.vagolytic += sat1(d, 0.25); }
    if ((d = L('morph'))) { m.cv *= 1 + 0.25 * sat1(d, 6); m.rs *= 1 - 0.1 * sat1(d, 8); m.resp -= 6 * sat1(d, 6); m.sedation += 0.4 * sat1(d, 8); m.vo2 *= 1 - 0.08 * sat1(d, 6); }
    if ((d = L('furos'))) { m.rs *= 1 + 0.1 * sat1(d, 40) * (this.t - (this.furosT || 0) < 1200 ? 1 : 0); m.cv *= 1 + 0.25 * sat1(d, 40); m.cpv *= 1 + 0.15 * sat1(d, 40); }
    if ((d = L('propofol'))) { m.rs *= 1 - 0.35 * sat1(d, 1); m.eesLv *= 1 - 0.2 * sat1(d, 1); m.eesRv *= 1 - 0.15 * sat1(d, 1); m.cv *= 1 + 0.2 * sat1(d, 1); m.hr -= 8 * sat1(d, 1); m.sedation += 0.5 + 0.6 * sat1(d, 0.7); m.vo2 *= 0.85; }
    if ((d = L('ketamine'))) { const depleted = this.flags.catecholDepleted ? 1 : 0; m.hr += (10 - 12 * depleted) * sat1(d, 1); m.rs *= 1 + (0.06 - 0.12 * depleted) * sat1(d, 1); m.eesLv *= 1 - (0.05 + 0.12 * depleted) * sat1(d, 1); m.sedation += 0.5 + 0.5 * sat1(d, 1); m.vo2 *= 0.9; }
    if ((d = L('amio'))) { m.rs *= 1 - 0.15 * sat1(d, 200); m.hr -= 6 * sat1(d, 200); }
    if ((d = L('sedation'))) { m.sedation += 1.1 * sat1(d, 0.6); m.rs *= 1 - 0.1 * sat1(d, 1); m.vo2 *= 1 - 0.15 * sat1(d, 1); }
    if (this.ventilated) m.vo2 *= 0.9;
    if (this.flags.seizing) { m.vo2 *= 1.45; m.hr += 15; m.resp -= 8; m.lactAdd += 1.5; m.rs *= 1.05; }
    return m;
  }

  // ---------- one integration step ----------
  integrate(dt, live = true) {
    const p = this.p, k = this.k, V = this.V, m = this.modifiers();
    const S0 = p.stressed;
    // baroreflex (first order, blunted)
    const Pa0 = V.a / p.Ca;
    const e = sat(k.psp - Pa0, 18) * k.reflexGain;
    const rf = this.reflex;
    rf.hr += (1.4 * e * k.hrReflexGain - rf.hr) * dt / 10;
    rf.r += (0.011 * e - rf.r) * dt / 30;
    rf.v += (26.5 * e - rf.v) * dt / 40;
    rf.e += (0.02 * e - rf.e) * dt / 10;
    // effective parameters
    const Cv = p.Cv * m.cv, Cpv = p.Cpv * m.cpv;
    const Rs = p.Rs * (1 + rf.r) * m.rs;
    const Rp = p.Rp * m.rp * (1 + 0.03 * this.peep);
    const vc = this.ventCalc;
    const Pit = 0.3 * this.peep + (this.ventilated ? 1.0 + 0.08 * Math.max(0, vc.pplat - this.peep) : 0);   // mean intrathoracic pressure mmHg
    const EesLv = p.lv.Ees * k.eesLv * this.contr.lv * m.eesLv * (1 + rf.e);
    const EesRv = p.rv.Ees * k.eesRv * this.contr.rv * m.eesRv * (1 + rf.e);
    // heart rate and rhythm
    let hr;
    const rhythm = k.rhythm;
    const vagal = k.vagal * (1 - m.vagolytic);
    const sinus = k.hrBase + rf.hr + m.hr - vagal;
    if (rhythm === 'vf' || rhythm === 'asystole' || rhythm === 'pea') hr = 0;
    else if (rhythm === 'chb') hr = k.escapeRate + (k.broadEscape ? 0 : 20 * m.vagolytic) + (m.chrono ? 25 * m.chrono / (m.chrono + 3) : 0);
    else if (rhythm === 'vt') hr = k.vtRate || 170;
    else if (rhythm === 'paced') hr = k.pacedRate || 80;
    else if (rhythm === 'junctional') hr = Math.max(k.escapeRate, 45) + m.hr * 0.5;
    else hr = sinus;
    hr = clamp(hr, 0, 220);
    if (this.devices.cpr && hr === 0) hr = 110;
    this.hr = hr;
    // pressures
    const Pa = V.a / p.Ca, Pv = (V.v + rf.v + k.venousShift) / Cv, Ppa = V.pa / p.Cpa, Ppv = V.pv / Cpv;
    // ventricles
    const avSync = (rhythm === 'sinus' || rhythm === 'junctional' && false) ? 1 : 0.86;
    const fill = 1 - 0.35 * clamp((hr - 120) / 80, 0, 1);
    const edpLv = Math.max(0, Ppv - Pit), edpRv = Math.max(0, Pv - Pit);
    // RV dilation stiffens the LV (interdependence)
    const edvRv = edvFromP(edpRv, p.rv);
    const lvStiff = { V0: p.lv.V0, P0: p.lv.P0, lam: p.lv.lam * k.lam_lv_mul * (1 + 0.6 * clamp((edvRv - 185) / 50, 0, 1)) };
    const edvLv = p.lv.V0 + (edvFromP(edpLv, lvStiff) - p.lv.V0) * avSync * fill;
    const edvRvEff = p.rv.V0 + (edvRv - p.rv.V0) * avSync * fill;
    const pesLv = Math.max(5, (Pa - Pit) * (this.devices.iabp ? 0.88 : 1));
    const pesRv = Math.max(2, Ppa);
    let svLvTot = Math.max(0, edvLv - (p.lv.V0 + pesLv / EesLv));
    let svRv = Math.max(0, edvRvEff - (p.rv.V0 + pesRv / EesRv));
    if (hr === 0) { svLvTot = 0; svRv = 0; }
    if (this.devices.cpr) { svLvTot = 18; svRv = 18; }
    const tEj = Math.max(0.16, 0.38 - 0.0012 * hr);
    // mitral regurgitation (Gorlin) and VSD shunt
    let rvol = 0, qvsd = 0;
    if (k.eroa > 0 && hr > 0) rvol = Math.min(0.8 * svLvTot, 44.3 * k.eroa * Math.sqrt(Math.max(0, pesLv - Ppv)) * tEj);
    if (k.vsdA > 0 && hr > 0) qvsd = Math.min(0.7 * (svLvTot - rvol), 44.3 * k.vsdA * Math.sqrt(Math.max(0, pesLv - pesRv)) * tEj);
    const svFwd = Math.max(0, svLvTot - rvol - qvsd);
    this.rf = svLvTot > 0 ? rvol / svLvTot : 0;
    const bps = hr / 60;
    // device flows (ml/s)
    const fImp = (this.devices.impella || 0) * 1000 / 60, fEcmo = (this.devices.ecmo || 0) * 1000 / 60;
    // flows
    const fLv = bps * svFwd, fRv = bps * svRv, fVsd = bps * qvsd;
    const Qs = Math.max(0, (Pa - Pv) / Rs), Qp = Math.max(0, (Ppa - Ppv) / Rp);
    // fluids in / out
    let fIn = 0;
    for (const inf of this.infusing) { const d = Math.min(inf.ml, inf.rate * dt); inf.ml -= d; fIn += d / dt; this.exoVol += d; }
    this.infusing = this.infusing.filter(i => i.ml > 0.5);
    const leak = this.exoVol / (90 * 60) ;                      // crystalloid leaves the vascular space, tau 90 min
    this.exoVol = Math.max(0, this.exoVol - leak * dt);
    const diur = this.urineRate(Pa) / 3600;                      // ml/s
    V.a += (fLv + fImp + fEcmo - Qs) * dt;
    V.v += (Qs - fRv - fEcmo + fIn - leak - diur) * dt;
    V.pa += (fRv + fVsd - Qp) * dt;
    V.pv += (Qp - fLv - fVsd - fImp) * dt;
    this.qpqs = fLv > 0 ? (fRv + fVsd) / (fLv + fEcmo + fImp) : 1;
    // bleeding / third space hook
    if (this.flags.bleedRate) V.v -= this.flags.bleedRate * dt;
    // derived (cheap, stored for compute())
    this.cache = { Pa, Pv, Ppa, Ppv, edpLv, edpRv, edvLv, edvRv: edvRvEff, svFwd, svLvTot, svRv, rvol, qvsd, Rs, Rp, Cv, EesLv, EesRv, Pit, tEj, m, hr, co: (fLv + fImp + fEcmo) * 60 / 1000 };
    // ischaemia spiral: supply vs demand drives contractility multipliers (teaching heuristic)
    const pp = svFwd / p.Ca * 0.9;
    const dbp = Pa - pp / 3 + (this.devices.iabp ? 10 : 0);
    const cpp = dbp - edpLv;
    const supply = clamp((cpp - 20) / 40, 0, 1) * clamp((60 / Math.max(hr, 40)) / 0.86, 0.6, 1.3);
    const demand = clamp((hr / 70) * ((Pa + 2 * pp / 3) / 120), 0.3, 3);
    for (const side of ['lv', 'rv']) {
      const pat = k.territory === side || k.territory === 'both' ? k.patency : 1;
      const isch = clamp(1 - (supply * (0.35 + 0.65 * pat)) / demand, 0, 1);
      const c = this.contr[side];
      const down = (c - 0.4) * isch / (40 * 60);
      const up = (1 - c) * (1 - isch) * (pat > 0.6 ? 1 : 0.15) / (120 * 60);
      this.contr[side] = clamp(c - down * dt + up * dt, 0.4, 1);
    }
    // drug levels
    for (const n in this.drugs) { const d = this.drugs[n]; const tau = d.target > d.level ? d.tauOn : d.tauOff; d.level += (d.target - d.level) * (1 - Math.exp(-dt / tau)); }
    this.boluses = this.boluses.filter(b => (this.t - b.t0) < b.half * 8);
    // oxygen, lactate, CO2 (slower variables)
    this.gas(dt);
    this.t += dt;
  }

  urineRate(map) { // ml/h
    const fur = this.level('furos');
    const base = 0.5 * this.p.wt * clamp((map - 50) / 15, 0, 1.4) * clamp((this.lastCI - 1.0) / 1.4, 0, 1.2);
    const extra = fur && (this.t - (this.furosT || 0)) > 1800 ? 400 * (fur / (fur + 40)) * clamp((map - 55) / 10, 0, 1) : 0;
    return base + extra;
  }

  gas(dt) {
    const c = this.cache, p = this.p, k = this.k, m = c.m;
    const co = Math.max(0.3, c.co);
    this.lastCI = co / p.BSA;
    const pcwp = c.Ppv;
    let shunt = 0.03 + 0.32 * clamp((pcwp - 18) / 12, 0, 1) + k.shuntExtra + (this.flags.seizing && !this.ventilated ? 0.1 : 0);
    shunt *= 1 - 0.035 * this.peep;
    shunt = clamp(shunt, 0.03, 0.6);
    // ventilation
    const vo2 = p.VO2 * m.vo2 * (1 + 0.1 * (k.temp - 37)) * (this.flags.agitated ? 1.15 : 1);
    let rrT, pco2T;
    if (this.ventilated) {
      // lung: compliance falls with oedema; VC sets volume and yields plateau pressure, PC the reverse
      const v = this.vent, C = 50 * (1 - 0.5 * clamp((pcwp - 18) / 12, 0, 1));
      const vtMl = v.mode === 'VC' ? v.vt * p.wt : Math.max(0, (v.pinsp - this.peep) * C);
      const pplat = this.peep + vtMl / C;
      this.ventCalc = { vtMl, pplat, compliance: C };
      const ibw = Math.min(p.wt, 75);
      const alvMV = v.rr * Math.max(0, vtMl - 2.2 * ibw) / 1000;                        // L/min above anatomical dead space
      const vdExtra = 1 + 0.6 * clamp((pcwp - 18) / 12, 0, 1);                           // oedema dead space
      rrT = v.rr; pco2T = clamp(5.3 * (0.06 * ibw * vdExtra) / Math.max(0.3, alvMV), 2.5, 15);
    }
    else {
      const sp = this.spo2 || 0.97;
      rrT = k.rrBase + 0.9 * Math.max(0, pcwp - 15) + 2.2 * Math.max(0, this.lact - 2) + 60 * Math.max(0, 0.92 - sp) + m.resp - 4 * m.sedation;
      if (this.cpap) rrT -= 4;
      rrT = clamp(rrT, 4, 44);
      const vt = 500 * (1 - 0.45 * clamp((rrT - 28) / 16, 0, 1)) * (1 - 0.3 * clamp(m.sedation, 0, 1));
      const vdvt = 0.3 + 0.22 * clamp((pcwp - 18) / 12, 0, 1);              // oedema raises dead space
      pco2T = clamp(5.3 * (16 * 500 * 0.7) / (rrT * vt * (1 - vdvt)), 2.6, 13);
      if (k.rhythm === 'vf' || k.rhythm === 'asystole' || k.rhythm === 'pea') { rrT = this.devices.cpr ? 10 : 0; pco2T = 8; }
    }
    const arrested = k.rhythm === 'vf' || k.rhythm === 'asystole' || k.rhythm === 'pea';
    this.rr = this.rr == null || arrested ? rrT : this.rr + (rrT - this.rr) * (1 - Math.exp(-dt / 60));
    this.pco2 += (pco2T - this.pco2) * (1 - Math.exp(-dt / 300));
    // oxygen content
    const pao2A = this.fio2 * (101.3 - 6.3) - this.pco2 / 0.8;
    const cc = 1.34 * p.Hb * sevSat(pao2A) + 0.0225 * pao2A;
    let ca = cc - (shunt / (1 - shunt)) * vo2 / (10 * co);
    ca = clamp(ca, 2, cc);
    // invert content -> PaO2 (bound + dissolved), then saturation
    let lo = 0.5, hi = pao2A;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; (1.34 * p.Hb * sevSat(m) + 0.0225 * m < ca) ? lo = m : hi = m; }
    this.pao2 = (lo + hi) / 2; const sa = clamp(sevSat(this.pao2), 0.3, 1);
    this.spo2 = sa;
    const cv = ca - vo2 / (10 * co);
    this.svo2 = clamp(cv / (1.34 * p.Hb), 0.1, 0.95);
    const do2 = co * ca * 10, do2crit = 330 * p.BSA;
    this.do2 = do2;
    // lactate (mmol/L per hour)
    const cf = clamp(do2 / do2crit, 0.3, 1.0);
    const dL = 3.75 * Math.max(0, 1 - do2 / do2crit) + m.lactAdd * 0.4 - 0.17 * cf * (this.lact - 1.0);
    this.lact = clamp(this.lact + dL * dt / 3600, 0.5, 25);
    this.shunt = shunt;
  }

  // ---------- public step: advance patient time by seconds ----------
  step(seconds, onEvent) {
    const dt = 0.25;
    let n = Math.round(seconds / dt);
    while (n-- > 0) { this.integrate(dt); if (onEvent && onEvent(this)) break; }
    this.compute();
  }

  compute() {
    const c = this.cache, p = this.p, k = this.k, V = this.V;
    const pp = clamp(c.svFwd / p.Ca * 0.9 * (1 + 0.8 * Math.max(0, 1 - c.Rs / p.Rs)), 0, 120); // faster diastolic run-off when vasodilated
    const map = c.Pa;
    let sbp = map + 2 * pp / 3, dbp = map - pp / 3;
    if (this.hr === 0 && !this.devices.cpr) { sbp = dbp = Math.max(5, map); }
    if (this.devices.cpr) { sbp = map + 30; dbp = Math.max(5, map - 18); }
    const o = this.out;
    o.hr = this.hr; o.rhythm = k.rhythm;
    o.map = map; o.sbp = sbp; o.dbp = dbp; o.pp = pp;
    o.co = c.co; o.ci = o.co / p.BSA;
    o.sv = c.svFwd; o.cvp = c.Pv + 0.5 * c.Pit; o.pcwp = c.Ppv + (c.rvol > 0 ? 0.3 * c.rvol / 8 : 0); o.vwave = c.Ppv + c.rvol / 8;
    o.pap = { s: c.Ppa + c.svRv / p.Cpa * 0.6, d: Math.max(2, c.Ppa - c.svRv / p.Cpa * 0.3), m: c.Ppa };
    o.svr = c.Rs * 1333; o.svrNorm = c.Rs / NORMAL.Rs;   // relative to a normal adult, not the scenario baseline
    o.rf = this.rf; o.qpqs = this.qpqs;
    o.edvLv = c.edvLv; o.edvRv = c.edvRv; o.efLv = c.edvLv > 0 ? c.svLvTot / c.edvLv : 0; o.efRv = c.edvRv > 0 ? c.svRv / c.edvRv : 0;
    o.spo2 = this.spo2; o.pao2 = this.pao2; o.pco2 = this.pco2; o.svo2 = this.svo2; o.lact = this.lact; o.rr = this.rr;
    o.etco2 = this.devices.cpr ? clamp(1.0 + 0.6 * o.co, 0, 3.5) : (this.hr === 0 ? 0 : clamp(this.pco2 - (0.3 + 1.6 / Math.max(0.6, o.co)), 0, 15));
    o.vent = this.vent; o.ventCalc = this.ventCalc;
    o.hco3 = clamp(24 - 0.85 * (this.lact - 1) - k.baseDeficit, 5, 32);
    o.ph = 6.1 + Math.log10(o.hco3 / (0.03 * this.pco2 * 7.5));
    o.be = 0.93 * (o.hco3 - 24.4 + 14.8 * (o.ph - 7.4));
    o.K = k.K + 0.25 * Math.max(0, 7.35 - o.ph) / 0.1 * 0.3; o.glucose = k.glucose; o.Hb = p.Hb; o.temp = k.temp; o.creat = k.creat;
    o.fio2 = this.fio2; o.peep = this.peep; o.ventilated = this.ventilated; o.cpap = this.cpap;
    o.shunt = this.shunt; o.do2 = this.do2;
    o.pi = clamp(2.5 * Math.pow(o.ci / 3, 1.5) / Math.max(0.5, o.svrNorm), 0.05, 6);
    o.crt = clamp(2 + 3 * clamp((2.4 - o.ci) / 1.0, 0, 1) + 1.0 * clamp((o.svrNorm - 1.0) / 0.5, 0, 1), 1.5, 8);
    o.urine = this.urineRate(map);
    // conscious level
    const sed = c.m.sedation;
    let gcs = k.gcsBase;
    if (map < 60) gcs = Math.min(gcs, 14); if (map < 55) gcs = Math.min(gcs, 13); if (map < 50) gcs = Math.min(gcs, 11); if (map < 45) gcs = Math.min(gcs, 9); if (map < 40) gcs = Math.min(gcs, 6); if (map < 33 || this.hr === 0) gcs = 3;
    if (this.spo2 < 0.8) gcs = Math.min(gcs, 12); if (this.pco2 > 9) gcs = Math.min(gcs, 12);
    const paralysed = this.ventilated && !this.flags.igel;
    if (sed >= 1 || k.comatose || paralysed) gcs = 3; else if (sed > 0.6) gcs = Math.min(gcs, 8); else if (sed > 0.3) gcs = Math.min(gcs, 13);
    if (this.flags.seizing) gcs = Math.min(gcs, 5);
    o.gcs = gcs; o.sedated = sed >= 1 || paralysed; o.sedLevel = sed; o.paralysed = paralysed; o.seizing = !!this.flags.seizing;
    o.cpp = dbp + (this.devices.iabp ? 10 : 0) - c.edpLv;
    // Fluid responsiveness: stroke-volume gain for a small rise in filling pressure on both ventricles (steep vs flat part of Starling)
    {
      const lvG = (edvFromP(c.edpLv + 1.5, p.lv) - edvFromP(c.edpLv, p.lv)) / Math.max(5, c.svLvTot);
      const rvG = (edvFromP(c.edpRv + 2, p.rv) - edvFromP(c.edpRv, p.rv)) / Math.max(5, c.svRv);
      o.preloadGain = clamp(Math.min(lvG, rvG), 0, 1);
      const vtFactor = this.ventilated ? clamp((this.ventCalc.vtMl / p.wt) / 8, 0.4, 1.2) : 0.6;
      o.ppv = this.hr === 0 ? 0 : clamp(3 + 55 * o.preloadGain * vtFactor, 2, 35);
      o.ppvValid = this.ventilated && k.rhythm !== 'af' && this.hr < 140;
    }
    o.contr = this.contr; o.exoVol = this.exoVol;
    o.stage = this.scaiStage(o);
    return o;
  }

  scaiStage(o) {
    if (this.hr === 0 || o.lact >= 8 || o.ph < 7.2) return 'E';
    const pressors = ['norad', 'adren', 'vaso', 'dobut', 'milri'].filter(n => this.level(n) > 0.001).length;
    if (o.lact >= 2 && (pressors >= 2 || (this.flags.lactRising && pressors >= 1))) return 'D';
    if (o.lact >= 2 || o.ci < 2.2 && o.map < 65) return 'C';
    if (o.sbp < 90 || o.map < 60 || o.hr >= 100) return 'B';
    return 'A';
  }
}

// Minimal self check: run as `node -e "require('./src/engine.js')"` is not possible (browser globals),
// so expose for the in-page console: sim.selfTest().
function engineSelfTest() {
  const e = new Engine();
  e.reset({});
  const n = e.compute();
  console.assert(n.map > 80 && n.map < 110, 'normal MAP', n.map);
  console.assert(n.co > 4 && n.co < 7, 'normal CO', n.co);
  console.assert(n.pcwp > 4 && n.pcwp < 14, 'normal PCWP', n.pcwp);
  // RV infarct: GTN should drop MAP, fluid should recover some of it
  e.reset({ k: { eesRv: 0.3, territory: 'rv', patency: 0.1, hrBase: 55, vagal: 8, hrReflexGain: 0, venousShift: 350 } });
  const a = e.compute().map;
  e.bolus('gtn', 2, 300, 60); e.step(240);
  const b = e.compute().map;
  e.infusing.push({ ml: 500, rate: 500 / 600 }); e.step(900);
  const c = e.compute().map;
  console.assert(b < a - 10, 'GTN drops MAP in RVI', a, b);
  console.assert(c > b + 5, 'fluid recovers MAP in RVI', b, c);
  return { normal: n, rvi: { a, b, c } };
}
