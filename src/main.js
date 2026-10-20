/* Sim controller: owns engine, scenario, patient clock, events, interventions, snapshots. */
class Sim {
  constructor() {
    this.e = new Engine(); this.rh = new Rhythm(); this.sc = null;
    this.disp = { hr: 70, sbp: 120, dbp: 80, map: 93, spo2: 0.97, rr: 16, temp: 36.8, cvp: 6 };
    Object.assign(this, this.freshState());
    this.listeners = [];
  }
  /* Every per-run field lives here so load() starts from scratch. */
  freshState() {
    return { t: 0, dispT: 0, ff: false, running: true, idleRate: 1, logs: [], results: [], gases: [], ecgs: [], timers: [], pending: [], fired: {}, lowSince: {}, rhythmSince: 0, _rhythm: undefined, patencySince: null, overrides: {}, o2label: 'air', lastGas: null, echoDone: false, echoSnapshot: null, lastAction: null, shocks: 0 };
  }
  get out() { const o = Object.assign({}, this.e.out); for (const k in this.overrides) if (this.overrides[k] != null) o[k] = this.overrides[k]; if (o.sbp != null && o.dbp != null && (this.overrides.sbp != null || this.overrides.dbp != null)) o.map = o.dbp + (o.sbp - o.dbp) / 3; return o; }
  get wt() { return this.sc ? this.sc.patient.wt : 80; }
  clock(t) { return (this.sc ? this.sc.clock0 : 0) + t; }
  onChange(fn) { this.listeners.push(fn); }
  changed() { if (this.sc) this.e.compute(); for (const f of this.listeners) try { f(); } catch (e) { console.error(e); } }

  load(id) {
    const sc = SCENARIOS.find(s => s.id === id); if (!sc) return;
    Object.assign(this, this.freshState());
    this.sc = sc; this.e = new Engine(); this.rh = new Rhythm();
    Views.reset(); Echo.reset();
    const params = Object.assign({}, sc.engine.params || {}); if (sc.start.Rs) params.Rs = sc.start.Rs;
    this.e.reset({ params, k: JSON.parse(JSON.stringify(sc.engine.k)), lactate0: sc.engine.lactate0, pco2_0: sc.engine.pco2_0 });
    this.e.fio2 = sc.start.fio2; this.o2label = sc.start.o2label;
    if (sc.start.catecholDepleted) this.e.flags.catecholDepleted = true;
    if (sc.start.ventilatedByBag) { this.e.ventilated = true; this.e.peep = 0; Object.assign(this.e.vent, sc.start.vent || { mode: 'VC', vt: 6, rr: 10, pinsp: 20 }); this.e.flags.igel = true; }
    this.e.settle();
    Object.assign(this.disp, this.pick(this.out));
    this.nibp(true);
    this.acquireEcg(false, true); this.acquireAbg(false, true);
    this.log(`Scenario loaded: ${sc.name}`);
    Views.renderEcg(this.ecgs[this.ecgs.length - 1]); Views.renderAbg(this.gases); Views.renderHistory(); Views.setTab('obs');
    if (typeof Control !== 'undefined') Control.onLoad();
    this.changed();
  }
  pick(o) { return { hr: o.hr, sbp: o.sbp, dbp: o.dbp, map: o.map, spo2: o.spo2, rr: o.rr, temp: o.temp, cvp: o.cvp }; }

  // ---------- time ----------
  tick(realDt) {
    if (this.sc && this.running && this.idleRate > 0 && !this.ff) this.advance(realDt * this.idleRate, false);
    // display smoothing
    const o = this.pick(this.out), f = 1 - Math.exp(-realDt / 1.0);
    for (const k in o) this.disp[k] += (o[k] - this.disp[k]) * f;
    if (this.ff) { this.dispT += (this.t - this.dispT) * (1 - Math.exp(-realDt / 0.5)); if (this.t - this.dispT < 2) { this.dispT = this.t; this.ff = false; } } else this.dispT = this.t;
  }
  jump(minutes) { if (minutes <= 0) return; this.advance(minutes * 60, true); if (minutes >= 2) this.ff = true; this.changed(); }
  advance(seconds, isJump) {
    let left = seconds;
    while (left > 0) {
      const dt = Math.min(1, left); left -= dt;
      this.e.step(dt); this.t = this.e.t;
      const o = this.out;
      this.track(o);
      if (this.e.devices.nibpNext <= this.t) this.nibp(true);
      const due = this.timers.filter(tm => tm.at <= this.t); this.timers = this.timers.filter(tm => tm.at > this.t);
      for (const tm of due) tm.fn(this);   // callbacks may schedule new timers
      const fired = this.events(dt);
      if (fired && isJump) break;
    }
  }
  track(o) {
    for (const [k, thr] of [['map', 45], ['map', 42], ['map', 40], ['spo2', 0.72]]) { const key = k + thr; if (o[k] < thr) { if (this.lowSince[key] == null) this.lowSince[key] = this.t; } else this.lowSince[key] = null; }
    if (this._rhythm !== this.e.k.rhythm) { this._rhythm = this.e.k.rhythm; this.rhythmSince = this.t; }
    if (this.e.k.patency > 0.6) { if (this.patencySince == null) this.patencySince = this.t; } else this.patencySince = null;
  }
  sinceLow(k, thr) { const s = this.lowSince[k + thr]; return s == null ? 0 : this.t - s; }
  perfusing() { return !['vf', 'pea', 'asystole'].includes(this.e.k.rhythm) && !this.e.devices.cpr; }
  sinceRhythm(r) { return this.e.k.rhythm === r ? this.t - this.rhythmSince : 0; }
  sincePatency() { return this.patencySince == null ? 0 : this.t - this.patencySince; }
  later(sec, fn) { this.timers.push({ at: this.t + sec, fn }); }
  events(dt) {
    let fired = false;
    for (const ev of this.sc.script.events) {
      if (this.fired[ev.id]) continue;
      let p = this.pending.find(x => x.id === ev.id);
      if (!p) {
        const due = (ev.at == null || this.t >= ev.at) && (!ev.when || ev.when(this));
        if (due) { p = { id: ev.id, label: ev.label, left: ev.countdown || 0, ev }; this.pending.push(p); this.changed(); }
      }
      if (p) {
        if (ev.when && !ev.when(this) && ev.at == null) { this.pending = this.pending.filter(x => x !== p); this.changed(); continue; } // condition resolved
        p.left -= dt;
        if (p.left <= 0) { this.pending = this.pending.filter(x => x !== p); this.fired[ev.id] = this.t; ev.action(this); this.log('Event: ' + ev.label); fired = true; this.changed(); }
      }
    }
    return fired;
  }
  cancelEvent(id) { this.pending = this.pending.filter(x => x.id !== id); this.fired[id] = -1; this.log('Event cancelled by presenter: ' + id); this.changed(); }
  forceEvent(id) { const ev = this.sc.script.events.find(e => e.id === id); if (ev) { this.pending = this.pending.filter(x => x.id !== id); this.fired[id] = this.t; ev.action(this); this.log('Event forced: ' + ev.label); this.changed(); } }

  // ---------- interventions ----------
  act(id, idx) {
    const iv = INTERVENTIONS.find(i => i.id === id); if (!iv || iv.type === 'slider') return;
    const opt = iv.opts[idx]; if (!opt) return;
    if (iv.enabled && !iv.enabled(this)) { this.log(`${iv.label}: not available now`); return; }
    this.perform(`${iv.label} ${opt.label}`, opt.min, () => { this.log(`${iv.label}: ${opt.label}`); opt.run(this); }, id);
  }
  setSlider(id, value) {
    const iv = INTERVENTIONS.find(i => i.id === id); if (!iv || iv.type !== 'slider') return;
    if (iv.enabled && !iv.enabled(this)) { this.log(`${iv.label}: not available now`); return; }
    const v = Math.round(value / iv.step) * iv.step, cur = iv.get(this);
    if (Math.abs(v - cur) < 1e-9) return;
    this.perform(`${iv.label} ${iv.readout(this, +v.toFixed(4))}`, iv.minutes, () => iv.set(this, +v.toFixed(4)), id);
  }
  perform(label, minutes, fn, id) {
    const before = Object.assign({}, this.out);
    fn();
    if (this.sc.script.onIntervention) this.sc.script.onIntervention(this, id);
    this.jump(minutes);
    if (!this.e.devices.artline) this.nibp(true);   // cuff re-cycled after every action so the tiles reflect the new state
    this.lastAction = { label, minutes, before, after: Object.assign({}, this.out), t: this.t, shown: performance.now(), seq: (this.lastAction ? this.lastAction.seq : 0) + 1 };
    this.changed();
  }
  toggleRun() { this.running = !this.running; this.changed(); }
  log(text) { this.logs.push({ t: this.t, text }); if (this.logs.length > 400) this.logs.shift(); this.changed(); }
  banner(text) { Views.banner(text); this.log('** ' + text); }
  fluid(ml, min) { this.e.infusing.push({ ml, total: ml, rate: ml / (min * 60) }); this.log(`${ml} ml crystalloid over ${min} min`); }
  o2(fio2, label) { this.e.fio2 = fio2; this.o2label = label; }
  cpapOn(cm) { const e = this.e; if (e.ventilated) { this.log('Intubated: CPAP not applicable'); return; } e.cpap = true; e.peep = cm; const f = Math.max(0.6, e.fio2); this.o2(f, `CPAP ${cm}, FiO2 ${f.toFixed(2)}`); }
  infuse(name, dose, tauOn, tauOff, text) { this.e.setInfusion(name, dose, tauOn, tauOff); this.log(text); }
  intubate(agent, dose) {
    if (this.e.ventilated && !this.e.flags.igel) { this.log('Already intubated'); return; }
    if (agent === 'ketamine') this.e.bolus('ketamine', dose, 900, 30);
    else if (agent === 'propofol') this.e.bolus('propofol', dose, 480, 20);
    else this.e.bolus('sedation', 0.8, 300, 20);
    this.e.flags.rsiAgent = `${agent} ${dose}`;
    this.log(`RSI: ${agent} ${dose} mg/kg (${Math.round(dose * this.wt)} mg) + rocuronium ${Math.round(1.2 * this.wt)} mg`);
    this.later(90, s => { s.e.ventilated = true; s.e.cpap = false; s.e.flags.igel = false; s.e.peep = 5; s.e.fio2 = 1.0; Object.assign(s.e.vent, { mode: 'VC', vt: 6, rr: 16, pinsp: 20 }); s.o2label = 'ETT, FiO2 1.00'; s.log('Intubated, ventilated: VC, VT 6 ml/kg, rate 16, PEEP 5, FiO2 1.0'); });
    this.later(6 * 60, s => { if (s.e.ventilated) { s.e.setInfusion('sedation', 1, 300, 600); s.log('Propofol infusion 100 mg/h started'); } });
  }
  lyse() {
    if (this.e.flags.lysed) { this.log('Already lysed'); return; }
    const w = this.wt, dose = w < 60 ? 30 : w < 70 ? 35 : w < 80 ? 40 : w < 90 ? 45 : 50;
    this.e.flags.lysed = this.t; this.log(`Tenecteplase ${this.sc.patient.age >= 75 ? dose / 2 : dose} mg IV bolus, enoxaparin 30 mg IV, clopidogrel 300 mg`);
    const ok = Math.random() < 0.6;
    this.later(35 * 60, s => { if (ok) { s.log('ST segments resolving (>50%), chest pain easing'); s.ramp('patency', 0.85, 20 * 60); } else s.log('60 min post lysis: <50% ST resolution. Failed lysis, needs rescue PCI'); });
  }
  ramp(key, target, sec) { const steps = Math.max(1, Math.round(sec / 60)); const d = (target - this.e.k[key]) / steps; for (let i = 1; i <= steps; i++) this.later(i * 60, s => { s.e.k[key] = i === steps ? target : s.e.k[key] + d; }); }
  amiodarone() {
    this.e.bolus('amio', 300, 3600, 600); this.log('Amiodarone 300 mg IV over 20 min');
    if (this.e.k.rhythm === 'vt') this.later(15 * 60, s => { if (s.e.k.rhythm === 'vt' && Math.random() < 0.5) { s.e.k.rhythm = 'sinus'; s.banner('VT terminated'); } });
  }
  nibp(auto) {
    const o = this.e.out; const fail = o.sbp < 55 || o.rhythm === 'vf' || o.rhythm === 'asystole' || o.rhythm === 'pea' || (this.e.devices.cpr);
    this.e.devices.nibpLast = { sbp: Math.round(o.sbp + (Math.random() - 0.5) * 4), dbp: Math.round(o.dbp + (Math.random() - 0.5) * 4), map: Math.round(o.map), t: this.t, fail };
    this.e.devices.nibpNext = this.t + 5 * 60;
    if (!auto) this.log(fail ? 'NIBP: unable to measure' : `NIBP ${this.e.devices.nibpLast.sbp}/${this.e.devices.nibpLast.dbp}`);
  }
  waveState() {
    const o = this.out, e = this.e, k = e.k, ecg = this.sc ? this.sc.ecg : {};
    let hr = o.hr, rhythm = o.rhythm, broad = false;
    if (rhythm === 'pea') { hr = 35; broad = true; }
    return { hr, rhythm, pr: k.pr, broad: broad || (rhythm === 'chb' && k.broadEscape), broadEscape: k.broadEscape, atrialRate: k.atrialRate, rbbb: k.rbbb || ecg.rbbb, st: ecg.st, q: ecg.q, tinv: ecg.tinv, tall_t: ecg.tall_t, ectopy: k.ectopy, sbp: o.sbp, dbp: o.dbp, svrNorm: o.svrNorm, iabp: e.devices.iabp, cpr: e.devices.cpr, pi: o.pi, rr: o.rr, ventilated: e.ventilated, artline: e.devices.artline, coarseVf: this.sinceRhythm('vf') < 8 * 60, capno: e.ventilated || e.cpap, etco2: o.etco2, cvp: o.cvp, ppv: o.ppv };
  }
  acquireEcg(v4r, silent) {
    const st = this.waveState();
    if (v4r && this.sc.ecg.v4r) Object.assign(st, { st: this.sc.ecg.v4r.st });
    st.hr = st.hr || 0;
    const data = render12Lead(st, 250, 10);
    const rr = st.hr > 0 ? 60 / st.hr : 1;
    const qt = Math.round(400 * Math.sqrt(Math.min(1.2, rr)) * (st.broad ? 1.15 : 1)), qtc = Math.round(qt / Math.sqrt(rr));
    const snap = { t: this.t, st, data, v4r: !!v4r, rate: st.rhythm === 'vf' ? '---' : Math.round(st.hr), pr: st.rhythm === 'sinus' ? Math.round(st.pr * 1000) + ' ms' : '--', qrs: (st.broad || st.rbbb ? 136 : 92) + ' ms', qt: st.hr > 0 ? `${qt}/${this.sc.ecg.qtc || qtc} ms` : '--', axis: this.sc.ecg.axis || '--', text: v4r && this.sc.ecg.v4r ? this.sc.ecg.v4r.text : this.sc.ecg.text };
    this.ecgs.push(snap); Views.renderEcg(snap);
    if (!silent) { this.log('12 lead acquired' + (v4r ? ' (V4R / posterior)' : '')); Views.setTab('ecg'); }
  }
  acquireAbg(venous, silent) {
    const o = this.e.out, k = this.e.k;
    const g = { t: this.t, venous, fio2: this.e.fio2, temp: o.temp, o2label: this.o2label, ph: o.ph - (venous ? 0.04 : 0), pco2: o.pco2 + (venous ? 0.8 : 0), po2: venous ? Math.max(2, 2.5 + 4 * o.svo2) : o.pao2, hco3: o.hco3, be: o.be, lact: o.lact + (venous ? 0.2 : 0), so2: venous ? o.svo2 : o.spo2, na: 137, k: o.K, cl: 104, ca: 1.12, glucose: o.glucose, hb: o.Hb, note: venous ? 'Peripheral venous sample' : (this.e.devices.artline ? 'Arterial line sample' : 'Radial stab') };
    this.gases.push(g); this.lastGas = g; Views.renderAbg(this.gases);
    if (!silent) { this.log(`${venous ? 'VBG' : 'ABG'}: pH ${g.ph.toFixed(2)}, pCO2 ${g.pco2.toFixed(1)}, pO2 ${g.po2.toFixed(1)}, lactate ${g.lact.toFixed(1)}`); Views.setTab('abg'); }
  }
  acquireEcho() { this.echoDone = true; this.echoSnapshot = Object.assign({}, this.out); this.log('Bedside echo performed'); Views.setTab('echo'); Echo.render(this); }
  cxr() { this.e.flags.cxr = true; this.later(10 * 60, s => { const p = s.e.out.pcwp; const txt = p > 25 ? 'CXR: bilateral alveolar shadowing, bat-wing distribution, small effusions, normal mediastinum' : p > 18 ? 'CXR: upper lobe diversion, interstitial oedema, Kerley B lines' : 'CXR: clear lung fields, normal cardiac silhouette'; s.results.push(txt); s.log(txt); }); this.log('Portable CXR requested'); }
  bloods() { this.e.flags.bloods = true; this.later(40 * 60, s => { const o = s.e.out; const txt = `Bloods: Hb ${Math.round(o.Hb * 10)}, WCC 13.4, plt 240, Na 137, K ${o.K.toFixed(1)}, urea 9.8, creat ${Math.round(o.creat * (1 + 0.1 * Math.max(0, 65 - o.map) / 10))}, troponin ${s.sc.id === 'lvcs' ? '>10,000' : 'high, rising'} ng/L, INR 1.1`; s.results.push(txt); s.log(txt); }); this.log('Bloods sent (FBC, U&E, LFT, coag, troponin)'); }
  pace(mA, rate) {
    const k = this.e.k, o = this.e.out;
    if (['vf', 'vt'].includes(k.rhythm)) { this.log('Pacing not indicated in ' + k.rhythm.toUpperCase()); return; }
    const need = k.rhythm === 'chb' || k.rhythm === 'junctional' || k.rhythm === 'asystole' || k.rhythm === 'pea' || o.hr < 50;
    if (!need) { this.log('Pacing set up, intrinsic rate above the demand rate'); return; }
    if (mA === 'tvp') {
      if (!this.e.flags.cardioPresent) { this.log('Transvenous wire needs the cardiology registrar at the bedside (call local cardiology)'); return; }
      if (Math.random() < 0.95) { this.e.devices.pacing = { prev: k.rhythm, prevRate: k.escapeRate, mA: 'tvp', rate }; k.rhythm = 'paced'; k.pacedRate = rate; this.e.flags.agitated = false; this.log(`Temporary transvenous wire via the right IJ, VVI ${rate}/min: capture at 2 mA, threshold 0.8 mA`); }
      else this.log('Transvenous wire: lost capture on positioning, repositioning');
      return;
    }
    const p = k.rhythm === 'asystole' || k.rhythm === 'pea' ? 0.2 : mA >= 100 ? 0.9 : 0.6;
    if (Math.random() < p) { this.e.devices.pacing = { prev: k.rhythm, prevRate: k.escapeRate, mA, rate }; k.rhythm = 'paced'; k.pacedRate = rate; this.log(`Transcutaneous pacing ${mA} mA at ${rate}: mechanical capture confirmed on pulse check`); }
    else this.log(`Transcutaneous pacing ${mA} mA: electrical spikes, NO mechanical capture (no pulse with pacing). Increase current / reposition pads`);
    if (o.gcs > 8 && this.e.level('ketamine') < 0.2 && this.e.level('propofol') < 0.2 && this.e.level('morph') < 2) { this.e.flags.agitated = true; this.log('Patient distressed by pacing: needs sedation (ketamine 0.25 mg/kg)'); }
  }
  stopPacing() { const p = this.e.devices.pacing; if (p) { this.e.k.rhythm = p.prev; this.e.devices.pacing = null; this.e.flags.agitated = false; this.log('Pacing stopped'); } }
  shock(sync) {
    const k = this.e.k;
    if (k.rhythm === 'vt') { if (Math.random() < (sync ? 0.85 : 0.8)) { k.rhythm = 'sinus'; this.banner('Cardioversion successful: sinus rhythm'); } else this.log('Shock delivered, still VT'); this.e.contr.lv *= 0.95; return; }
    if (k.rhythm === 'vf') {
      if (sync) { this.log('Synchronised mode in VF: no QRS to synchronise to, shock not delivered. Switch to unsynchronised'); return; }
      this.shocks = (this.shocks || 0) + 1;
      const p = this.shocks === 1 ? 0.6 : 0.5;
      const r = Math.random();
      if (r < p) { k.rhythm = 'sinus'; this.e.contr.lv *= 0.9; this.e.devices.cpr = false; this.shocks = 0; this.banner('ROSC: organised rhythm with output'); }
      else if (r < p + 0.12) { k.rhythm = 'pea'; this.e.devices.cpr = false; this.banner('Organised rhythm, no pulse: PEA. Continue CPR'); }
      else this.log(`Shock ${this.shocks} delivered: still VF`);
      return;
    }
    if (sync) this.log('Synchronised shock delivered in ' + k.rhythm + ': no change'); else { this.log('Unsynchronised shock on an organised rhythm: induced VF'); k.rhythm = 'vf'; }
  }
  cpr(on) {
    const k = this.e.k;
    if (on) { if (!['vf', 'pea', 'asystole'].includes(k.rhythm) && this.e.out.map > 30) { this.log('Patient has a pulse, CPR not started'); return; } this.e.devices.cpr = true; this.log('CPR in progress, 2 min cycle'); return; }
    this.e.devices.cpr = false;
    const adr = this.e.level('adren') > 0.3;
    if (k.rhythm === 'pea' || k.rhythm === 'asystole') {
      const p = (k.rhythm === 'pea' ? 0.35 : 0.15) * (adr ? 1.3 : 0.7) * (this.e.out.spo2 > 0.85 ? 1 : 0.7);
      if (Math.random() < p) { k.rhythm = 'sinus'; this.e.contr.lv *= 0.85; this.banner('ROSC'); } else this.log(`Rhythm check: ${k.rhythm.toUpperCase()}, no pulse. Resume CPR`);
    } else if (k.rhythm === 'vf') this.log('Rhythm check: VF, shock indicated');
    else this.log('Rhythm check: organised rhythm with a pulse');
  }
  arrest(type) { this.e.k.rhythm = type; this.shocks = 0; this.e.devices.pacing = null; this.banner({ vf: 'Cardiac arrest: VF', pea: 'Cardiac arrest: PEA', asystole: 'Cardiac arrest: asystole' }[type]); }
  restoreSinus(hrBase) { const k = this.e.k; if (hrBase) k.hrBase = hrBase; if (k.rhythm === 'paced' && this.e.devices.pacing) this.e.devices.pacing.prev = 'sinus'; else k.rhythm = 'sinus'; }
  iabp() { if (this.e.devices.iabp) { this.log('IABP already in'); return; } this.e.devices.iabp = true; this.log('IABP inserted via femoral artery, 1:1 augmentation. Not available at Ysbyty Gwynedd: modelled as if placed in the Glan Clwyd cath lab, for discussion'); }
  call(kind) {
    const f = this.e.flags;
    if (kind === 'pci') { if (f.pciCalled) { this.log('Glan Clwyd already accepted; cath lab remains on standby'); return; } f.pciCalled = true; f.pciAccepted = true; this.reply('Glan Clwyd interventional consultant', 'Accepted, cath lab activated. Advises: load antiplatelets, no fluid boluses without echo, lyse now if wire crossing cannot happen within 120 min of diagnosis (55 min by road from Bangor plus packaging), keep MAP above 65 with noradrenaline before dobutamine. IABP available there on arrival if needed'); }
    if (kind === 'surgery') { if (f.surgeryCalled) { this.log('Liverpool Heart and Chest already accepted'); return; } f.surgeryCalled = true; f.surgeryAccepted = true; this.reply('Liverpool Heart and Chest cardiac surgical consultant', 'Accepted. Advises: inodilator (dobutamine or milrinone) rather than vasoconstrictors, afterload reduction if pressure allows, intubate before transfer if borderline, no fluid. Route: direct by air (EMRTS, about 35 min) if holding; via Glan Clwyd for an IABP bridge if not. About 100 min by road'); }
    if (kind === 'retrieval') { if (f.retrievalCalled) { this.log('Transfer team already dispatched'); return; } f.retrievalCalled = true; this.reply('Critical care transfer (EMRTS / ICU transfer team)', 'Conference call with the receiving centre done, team dispatched, ETA 40 min. Asks for: art line, two points of access, pressor running, arrest drugs drawn up, notes and ECGs copied. Glan Clwyd 55 min by road or 20 min by air; Liverpool 100 min by road or 35 min by air'); this.later(40 * 60, s => { f.teamPresent = true; s.banner('Transfer team arrived (transfer ventilator, pumps, pacing box)'); }); this.later(75 * 60, s => s.banner('Patient packaged and departed. Scenario end')); }
    if (kind === 'cardio') { if (f.cardioCalled) { this.log('Ysbyty Gwynedd cardiology already involved'); return; } f.cardioCalled = true; const adv = (this.sc.script.localCardiology) || 'Agrees this is cardiogenic shock after ACS; will do a formal echo, supports early transfer discussion'; this.reply('Ysbyty Gwynedd cardiology registrar (on call; pacing and CCU with dobutamine here, no cath lab)', adv); this.later(10 * 60, s => { f.cardioPresent = true; s.log('Cardiology registrar at the bedside with the echo machine, confirms the findings, joins the call to Glan Clwyd. Can place a temporary transvenous wire on CCU if needed'); }); }
    if (kind === 'anaes') { if (f.anaesCalled) { this.log('Anaesthetist already present'); return; } f.anaesCalled = true; f.anaesPresent = true; this.reply('Anaesthetist / ICU registrar', 'At the bedside, RSI drugs drawn up. Asks: pressor running before induction, reduced-dose ketamine, plan for post-intubation hypotension'); }
  }
  /* Generalised seizure: physiological load in the engine, shown on the exam panel; self-terminates at 5 min unless treated. */
  seizure(on) {
    const f = this.e.flags;
    if (on) {
      if (f.seizing) { this.log('Already seizing'); return; }
      f.seizing = true; f.seizureStart = this.t; f.agitated = true;
      this.banner('Generalised tonic-clonic seizure');
      this.later(5 * 60, s => { if (s.e.flags.seizing && s.e.flags.seizureStart === f.seizureStart) { s.e.flags.seizing = false; s.e.flags.agitated = false; s.log('Seizure self-terminated after 5 min, post-ictal'); } });
    } else { f.seizing = false; f.agitated = false; }
  }
  benzo(label, amount, half) {
    this.e.bolus('sedation', amount, half, 60); this.log(label);
    if (this.e.flags.seizing) {
      if (Math.random() < 0.8) { this.seizure(false); this.banner('Seizure terminated'); }
      else this.log('Still seizing: repeat the benzodiazepine, then second line (levetiracetam / phenytoin) or RSI');
    }
  }
  /* Call result: log it and show a large confirm dialog for the presenter to read out. */
  reply(title, text) { this.log(`${title}: ${text}`); if (typeof Control !== 'undefined' && !this.flags_noModal) Control.modal(title, text); }
  override(key, value) { if (value == null || value === '') delete this.overrides[key]; else this.overrides[key] = +value; this.changed(); }
  setRhythm(r) { this.e.k.rhythm = r; if (r === 'vt') this.e.k.vtRate = 170; this.e.step(2); this.t = this.e.t; this.log('Rhythm set by presenter: ' + r); this.changed(); }
}

const sim = new Sim();
window.sim = sim;
