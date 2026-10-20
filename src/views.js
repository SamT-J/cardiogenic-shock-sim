/* Display window views: tiles, monitor, 12 lead, ABG, exam, history, clock. */
const $ = id => document.getElementById(id);
const hhmm = s => { s = Math.round(s) % 86400; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
const RHYTHM_LABEL = { sinus: 'Sinus', af: 'AF', chb: 'CHB', vt: 'VT', vf: 'VF', asystole: 'Asystole', pea: 'PEA', paced: 'Paced', junctional: 'Junctional' };
const TABS = ['obs', 'ecg', 'abg', 'echo', 'exam', 'hist'];
const TAB_LABEL = { obs: 'Obs', ecg: '12 lead', abg: 'ABG', echo: 'Echo', exam: 'Exam', hist: 'History' };

const Views = {
  tab: 'obs', scopes: {}, lastNum: 0,
  init(sim) {
    this.sim = sim;
    const st = () => sim.waveState();
    this.scopes.ecg = new Scope($('w-ecg'), { color: '#33ff66', lo: -1.6, hi: 2.2, sample: t => sim.rh.ecg('II', t, st()) });
    this.scopes.pleth = new Scope($('w-pleth'), { color: '#33e5ff', lo: 0, hi: 1, sample: t => plethSample(t, sim.rh, st()) });
    this.scopes.art = new Scope($('w-art'), { color: '#ff4d4d', lo: 0, hi: 150, sample: t => artSample(t, sim.rh, st()) });
    this.scopes.cvp = new Scope($('w-cvp'), { color: '#5b9bff', lo: 0, hi: 20, sample: t => cvpSample(t, sim.rh, st()) });
    this.scopes.resp = new Scope($('w-resp'), { color: '#ffe84d', lo: -0.1, hi: 1.2, sample: t => { const s = st(); return s.capno ? capnoSample(t, s) : respSample(t, s); } });
    document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => this.setTab(b.dataset.tab));
    $('btn-run').onclick = () => sim.toggleRun();
    window.addEventListener('resize', () => Object.values(this.scopes).forEach(s => s.resize()));
  },
  setTab(name) {
    if (!TABS.includes(name)) return;
    this.tab = name;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'echo') Echo.render(this.sim);
    if (name === 'obs') Object.values(this.scopes).forEach(s => s.resize());
    if (name === 'hist' || name === 'exam') this.renderHistory();
    this.sim.changed();
  },
  frame(now) {
    const sim = this.sim; if (!sim.sc) return;
    const d = sim.disp;
    if (this.tab === 'obs') {
      const wt = now / 1000;
      sim.rh.advance(wt, sim.waveState());
      const art = sim.e.devices.artline, cvc = sim.e.devices.cvc;
      $('row-bp').classList.toggle('nibp-mode', !art);
      if ($('mon-main').classList.contains('cvc') !== cvc) { $('mon-main').classList.toggle('cvc', cvc); Object.values(this.scopes).forEach(s => s.resize()); }
      if (cvc) { const cs = this.scopes.cvp, hi = d.cvp > 16 ? 30 : 20; if (cs.hi !== hi) { cs.hi = hi; $('w-cvp-scale').textContent = '0 - ' + hi; } }
      const capno = sim.e.ventilated || sim.e.cpap, rs = this.scopes.resp;
      if (capno && rs.hi !== 8) { rs.lo = 0; rs.hi = 8; $('w-resp-tag').innerHTML = 'CO2 <small>0 - 8 kPa</small>'; }
      if (!capno && rs.hi !== 1.2) { rs.lo = -0.1; rs.hi = 1.2; $('w-resp-tag').innerHTML = 'Resp'; }
      for (const [k, s] of Object.entries(this.scopes)) { if ((k === 'art' && !art) || (k === 'cvp' && !cvc)) continue; s.draw(wt); }
      // art scale tracks the pressures so the pulse fills the channel (Mindray-style manual scale, re-ranged in 10 mmHg steps)
      if (art) {
        const top = (sim.e.devices.iabp ? d.sbp + 45 : d.sbp + 25), bot = d.dbp - 25;
        let hi = Math.ceil(top / 10) * 10, lo = Math.max(0, Math.floor(bot / 10) * 10);
        if (hi - lo < 60) hi = lo + 60;
        const as = this.scopes.art;
        if (Math.abs(as.hi - hi) >= 10 || Math.abs(as.lo - lo) >= 10) { as.hi = hi; as.lo = lo; $('w-art-scale').textContent = `${lo} - ${hi}`; }
      }
    }
    if (now - this.lastNum > 250) { this.lastNum = now; this.numerics(); }
  },
  arrow(key) {
    const la = this.sim.lastAction; if (!la || performance.now() - la.shown > 15000) return '';
    const dv = la.after[key] - la.before[key];
    const scale = key === 'spo2' ? 100 : 1, thr = key === 'spo2' ? 0.015 : key === 'hr' ? 3 : key === 'rr' ? 2 : 3;
    if (Math.abs(dv) < thr) return '';
    return ` <span class="delta ${dv > 0 ? 'up' : 'down'}">${dv > 0 ? '&#9650;' : '&#9660;'} ${Math.abs(Math.round(dv * scale))}</span>`;
  },
  numerics() {
    const sim = this.sim, d = sim.disp, o = sim.out, e = sim.e;
    const hr = Math.round(d.hr), rhythm = RHYTHM_LABEL[o.rhythm] || o.rhythm;
    const noPulse = o.rhythm === 'vf' || o.rhythm === 'asystole' || o.rhythm === 'pea';
    const spo2 = Math.round(d.spo2 * 100);
    const poor = o.pi < 0.3 || noPulse;
    const art = e.devices.artline;
    const nb = e.devices.nibpLast;
    const nbTxt = nb ? (nb.fail ? '--/--' : `${nb.sbp}/${nb.dbp}`) : '--/--';
    // tiles
    $('headline').textContent = sim.sc.headline;
    $('t-hr').textContent = o.rhythm === 'vf' ? 'VF' : o.rhythm === 'asystole' ? '0' : hr; $('t-hr-sub').innerHTML = rhythm + (e.devices.cpr ? ' (CPR)' : '') + this.arrow('hr');
    const cvpTxt = e.devices.cvc ? `, CVP ${Math.round(d.cvp)}` + (art && !noPulse ? `, PPV ${Math.round(o.ppv)}%` : '') : '';
    if (art) { $('t-bp-lbl').textContent = 'Art BP'; $('t-bp').textContent = `${Math.round(d.sbp)}/${Math.round(d.dbp)}`; $('t-bp-sub').innerHTML = `MAP ${Math.round(d.map)}, PP ${Math.max(0, Math.round(d.sbp - d.dbp))}${cvpTxt}` + (e.devices.iabp ? ' (IABP 1:1)' : '') + this.arrow('map'); }
    else { $('t-bp-lbl').textContent = 'NIBP'; $('t-bp').textContent = nbTxt; $('t-bp-sub').innerHTML = (nb && !nb.fail ? `MAP ${nb.map}, PP ${nb.sbp - nb.dbp}${cvpTxt}, ${hhmm(sim.clock(nb.t))}` : 'unable to measure' + cvpTxt) + this.arrow('map'); }
    $('t-rr').textContent = Math.round(d.rr); $('t-rr-sub').innerHTML = (e.ventilated ? `ventilated, EtCO2 ${o.etco2.toFixed(1)}` : e.cpap ? `CPAP, EtCO2 ${o.etco2.toFixed(1)}` : '') + this.arrow('rr');
    $('t-spo2').textContent = poor && !e.ventilated && o.pi < 0.15 ? '--' : spo2 + '%'; $('t-spo2-lbl').textContent = 'SpO2, ' + sim.o2label; $('t-spo2-sub').innerHTML = (poor ? 'poor signal' : '') + this.arrow('spo2');
    $('t-gcs').textContent = o.gcs; $('t-gcs-sub').textContent = o.seizing ? 'SEIZING' : o.paralysed ? 'sedated and ventilated' : o.sedated ? 'deeply sedated' : o.sedLevel > 0.6 ? 'sedated' : o.gcs === 15 ? '' : o.gcs >= 13 ? 'drowsy / agitated' : o.gcs >= 9 ? 'responds to voice' : 'unresponsive';
    const lac = sim.lastGas; $('t-lac').textContent = lac ? lac.lact.toFixed(1) : '--'; $('t-lac-sub').textContent = lac ? `gas at ${hhmm(sim.clock(lac.t))}` : 'no gas yet';
    // monitor
    $('mon-pt').textContent = sim.sc.patient.name; $('mon-age').textContent = `${sim.sc.patient.age} ${sim.sc.patient.sex}`; $('mon-clock').textContent = hhmm(sim.clock(sim.t));
    $('n-hr').textContent = o.rhythm === 'asystole' ? '0' : o.rhythm === 'vf' ? '---' : hr; $('n-rhythm').textContent = rhythm;
    $('n-spo2').textContent = poor && o.pi < 0.15 ? '--' : spo2; $('n-pi').textContent = 'PI ' + (o.pi < 0.1 ? '<0.1' : o.pi.toFixed(1));
    const bpBox = $('n-bp');
    if (art) { bpBox.className = 'num art'; $('n-bp-lbl').innerHTML = 'Art <small>mmHg</small>'; $('n-bp-val').textContent = `${Math.round(d.sbp)}/${Math.round(d.dbp)}`; $('n-bp-sub').textContent = `(${Math.round(d.map)})  PP ${Math.max(0, Math.round(d.sbp - d.dbp))}   NIBP ${nbTxt}`; }
    else { bpBox.className = 'num nibp'; $('n-bp-lbl').innerHTML = 'NIBP <small>mmHg</small>'; $('n-bp-val').textContent = nbTxt; $('n-bp-sub').textContent = nb ? (nb.fail ? 'unable to measure ' : `(${nb.map})  PP ${nb.sbp - nb.dbp}   `) + hhmm(sim.clock(nb.t)) : '--:--'; $('nibp-pad-sub').textContent = `Auto 5 min, next ${hhmm(sim.clock(e.devices.nibpNext))}`; }
    if (e.devices.cvc) {
      $('n-cvp').textContent = Math.round(d.cvp);
      const wave = noPulse ? '' : o.rhythm === 'chb' ? 'cannon a waves' : o.rhythm === 'af' ? 'no a waves' : '';
      const ppvBox = $('n-cvp-box').querySelector('.ppv');
      ppvBox.classList.toggle('off', !art || noPulse);
      $('n-ppv').textContent = art && !noPulse ? Math.round(o.ppv) : '--';
      const note = !art ? 'PPV needs an art line' : noPulse ? '' : o.ppvValid ? 'PPV valid (ventilated, sinus)' : 'PPV unreliable (spontaneous breathing)';
      $('n-cvp-sub').textContent = [note, wave].filter(Boolean).join('   ');
    }
    const capno = e.ventilated || e.cpap;
    if (capno) { $('n-rr-lbl').innerHTML = 'EtCO2 <small>kPa</small>'; $('n-rr').textContent = o.etco2.toFixed(1); $('n-temp').textContent = `RR ${Math.round(d.rr)}   T ${d.temp.toFixed(1)}`; }
    else { $('n-rr-lbl').innerHTML = 'Resp <small>rpm</small>'; $('n-rr').textContent = Math.round(d.rr); $('n-temp').textContent = 'T ' + d.temp.toFixed(1); }
    $('n-rr').classList.toggle('bad', capno && o.etco2 < 2.5 && !noPulse);
    // alarms
    const alarms = [];
    if (o.rhythm === 'vf') alarms.push('VFIB'); if (o.rhythm === 'vt') alarms.push('VTACH'); if (o.rhythm === 'asystole') alarms.push('ASYSTOLE');
    if (!noPulse && hr > 130) alarms.push('HR HIGH'); if (!noPulse && hr < 45 && hr > 0) alarms.push('HR LOW');
    if (spo2 < 90 && !noPulse) alarms.push('SpO2 LOW'); if (capno && o.etco2 < 2.5 && !noPulse) alarms.push('EtCO2 LOW'); if (art && d.sbp < 90) alarms.push('ART SYS LOW'); if (!art && nb && !nb.fail && nb.sbp < 90) alarms.push('NIBP SYS LOW'); if (d.rr > 30) alarms.push('RR HIGH');
    const al = $('mon-alarm'); al.textContent = alarms.length ? alarms.join('   ') : 'No alarms'; al.className = 'alarm ' + (alarms.some(a => /VFIB|VTACH|ASYS|LOW/.test(a)) ? 'high' : alarms.length ? 'med' : 'none');
    $('n-hr').classList.toggle('bad', alarms.some(a => /HR|VFIB|VTACH|ASYS/.test(a)));
    $('n-spo2').classList.toggle('bad', spo2 < 90 && !noPulse);
    this.examPanel(o, d, e, noPulse);
    // clock and run button
    $('clk-pt').textContent = hhmm(sim.clock(sim.dispT)); $('clk-el').textContent = `(+${Math.round(sim.dispT / 60)} min)`; $('clk-ff').textContent = sim.ff ? '>> fast forward' : '';
    const rb = $('btn-run'); rb.className = 'runbtn ' + (sim.running ? 'running' : 'paused'); rb.querySelector('.ico').innerHTML = sim.running ? '&#10074;&#10074;' : '&#9654;'; rb.querySelector('.txt').textContent = sim.running ? `Running ${sim.idleRate}x` : 'Paused';
  },
  /* Bedside examination boxes beside the monitor, derived from the model state. */
  examPanel(o, d, e, noPulse) {
    const sim = this.sim, wt = sim.wt, cpr = e.devices.cpr, rr = Math.round(d.rr), hr = Math.round(d.hr);
    const set = (id, text, cls) => { const el = $(id); if (el.textContent !== text) el.textContent = text; el.className = 'val ' + (cls || ''); };
    const gcs = o.gcs;
    set('ex-alert', o.seizing ? 'Generalised tonic-clonic seizure' : o.paralysed ? 'Sedated and paralysed' : o.sedated ? 'Deeply sedated' : o.sedLevel > 0.6 && !noPulse ? 'Sedated, responds to pain' : noPulse ? 'Unresponsive' : gcs === 15 ? 'Alert, oriented' : gcs >= 13 ? 'Drowsy, rousable to voice' : gcs >= 9 ? 'Responds to voice only' : gcs >= 4 ? 'Responds to pain only' : 'Unresponsive', gcs === 15 && !o.sedated ? 'ok' : gcs >= 13 ? 'warn' : 'bad');
    const chest = o.seizing && !e.ventilated ? 'Tonic-clonic, irregular, grunting' : noPulse && !cpr && !e.ventilated ? 'No respiratory effort' : e.ventilated ? `Ventilated, symmetrical, ${rr}/min` : e.cpap ? `CPAP mask, ${rr}/min, working hard` : rr > 32 ? `Laboured, accessory muscles, ${rr}/min` : rr > 24 ? `Rapid and shallow, ${rr}/min` : rr < 8 ? `Slow and shallow, ${rr}/min` : `Normal, symmetrical, ${rr}/min`;
    set('ex-chest', chest, rr > 24 || rr < 8 || (noPulse && !e.ventilated) ? 'bad' : '');
    const pc = o.pcwp;
    set('ex-lungs', pc > 32 ? 'Crackles throughout, pink froth' : pc > 25 ? 'Crackles to the mid zones' : pc > 18 ? 'Bibasal crackles' : 'Clear, equal air entry', pc > 25 ? 'bad' : pc > 18 ? 'warn' : 'ok');
    let pulse, pcls = '';
    if (cpr) { pulse = 'CPR in progress'; pcls = 'bad'; }
    else if (noPulse) { pulse = 'Absent'; pcls = 'bad'; }
    else { const vol = o.pp < 25 || o.ci < 1.9 ? 'thready' : o.svrNorm < 0.85 ? 'bounding' : o.ci < 2.2 ? 'weak' : 'good volume'; pulse = `${hr}/min, ${o.rhythm === 'af' ? 'irregular' : 'regular'}, ${vol}`; pcls = vol === 'thready' ? 'bad' : vol === 'bounding' || vol === 'weak' ? 'warn' : ''; }
    set('ex-pulse', pulse, pcls);
    const crt = noPulse && !cpr ? 'No refill' : `${o.crt.toFixed(1)} s${o.crt > 3 ? ' (delayed)' : ''}`;
    set('ex-crt', crt, o.crt > 3 || noPulse ? 'bad' : 'ok');
    const periph = noPulse && !cpr ? 'Cold' : o.svrNorm < 0.85 ? 'Warm, vasodilated' : o.pi < 1.2 ? 'Cold to the elbows and knees' : o.pi < 1.8 ? 'Cool hands and feet' : 'Warm';
    set('ex-periph', periph, o.pi < 1.2 || noPulse ? 'bad' : o.pi < 1.8 ? 'warn' : '');
    set('ex-temp', `${d.temp.toFixed(1)} °C${d.temp < 36 ? ' (hypothermic)' : d.temp > 38 ? ' (febrile)' : ''}`, d.temp < 35.5 || d.temp > 38 ? 'warn' : '');
    const dusky = o.spo2 < 0.88 ? ', dusky' : '';
    const skin = noPulse && !cpr ? 'Grey, lifeless' : o.ci < 2.0 && o.svrNorm > 1.0 ? 'Grey, clammy, mottled knees' + dusky : o.ci < 2.3 ? 'Pale and sweaty' + dusky : o.svrNorm < 0.85 ? 'Flushed, warm' + dusky : 'Pink and dry' + dusky;
    set('ex-skin', skin, /Grey|mottled/.test(skin) ? 'bad' : /Pale|dusky|Flushed/.test(skin) ? 'warn' : '');
    set('ex-cyan', o.spo2 < 0.85 ? 'Present' : 'Absent', o.spo2 < 0.85 ? 'bad' : 'ok');
    const u = Math.round(o.urine);
    set('ex-urine', e.devices.catheter ? `${u} ml/h${u < 0.5 * wt ? ' (oliguric)' : ''}` : 'Not measured (no catheter)', !e.devices.catheter ? '' : u < 0.3 * wt ? 'bad' : u < 0.5 * wt ? 'warn' : 'ok');
  },
  renderEcg(snap) {
    if (!snap) { $('ecg-empty').style.display = ''; $('ecg12').style.display = 'none'; return; }
    $('ecg-empty').style.display = 'none'; const c = $('ecg12'); c.style.display = '';
    draw12Lead(c, snap.data, snap.st, 4);
    const sim = this.sim;
    $('ecg-h-pt').textContent = `${sim.sc.patient.name}  ${sim.sc.patient.age}${sim.sc.patient.sex}`; $('ecg-h-time').textContent = hhmm(sim.clock(snap.t)) + (snap.v4r ? '  (right-sided leads)' : '');
    $('ecg-h-rate').textContent = snap.rate; $('ecg-h-pr').textContent = snap.pr; $('ecg-h-qrs').textContent = snap.qrs; $('ecg-h-qt').textContent = snap.qt; $('ecg-h-axis').textContent = snap.axis;
  },
  renderAbg(list) {
    const v = $('view-abg');
    if (!list.length) { v.innerHTML = '<div id="abg-empty">No blood gas yet</div>'; return; }
    const sim = this.sim;
    const slip = (g, old) => {
      const r = g.venous;
      const line = (k, val, ref) => `${k.padEnd(10)}${String(val).padStart(7)}  ${ref || ''}`;
      return `<div class="abg-slip ${old ? 'old' : ''}">` + [
        `BLOOD GAS ANALYSIS        ${r ? 'VENOUS' : 'ARTERIAL'}`,
        `${sim.sc.patient.name.padEnd(22)} ${hhmm(sim.clock(g.t))}`,
        `FiO2 ${g.fio2.toFixed(2)}   Temp ${g.temp.toFixed(1)}`,
        `${String(g.o2label).slice(0, 32)}`,
        '----------------------------------',
        line('pH', g.ph.toFixed(2), '(7.35-7.45)'),
        line('pCO2', g.pco2.toFixed(1) + ' kPa', r ? '(5.5-6.8)' : '(4.7-6.0)'),
        line('pO2', g.po2.toFixed(1) + ' kPa', r ? '(4.0-6.5)' : '(11-13)'),
        line('HCO3-', g.hco3.toFixed(1), '(22-26)'),
        line('BE', (g.be > 0 ? '+' : '') + g.be.toFixed(1), '(-2 to +2)'),
        line('Lactate', g.lact.toFixed(1), '(0.5-2.0)'),
        line('sO2', Math.round(g.so2 * 100) + '%', ''),
        '----------------------------------',
        line('Na+', g.na, '(135-145)'), line('K+', g.k.toFixed(1), '(3.5-5.0)'), line('Cl-', g.cl, '(98-107)'), line('Ca++', g.ca.toFixed(2), '(1.15-1.3)'),
        line('Glucose', g.glucose.toFixed(1), '(4-7)'), line('Hb', Math.round(g.hb * 10) + ' g/L', ''),
        '----------------------------------',
        g.note || '',
      ].join('\n') + '</div>';
    };
    const last3 = list.slice(-3);
    v.innerHTML = last3.map((g, i) => slip(g, i < last3.length - 1)).join('');
  },
  renderHistory() {
    const sc = this.sim.sc, h = sc.history;
    const card = (t, items) => `<div class="card"><h3>${t}</h3><ul>${items.map(x => `<li>${x}</li>`).join('')}</ul></div>`;
    $('view-exam').innerHTML = card('Examination', h.exam) + card('Pre-hospital', h.ambulance);
    $('view-hist').innerHTML = card('Presenting complaint', [h.pc, ...h.hpc]) + card('Functional baseline', [h.baseline || 'Not recorded']) + card('Background', [...h.pmh.map(x => '<b>PMH</b> ' + x), ...h.dh.map(x => '<b>Drugs</b> ' + x), ...h.sh.map(x => '<b>Social</b> ' + x)]) + card('Results so far', [...h.bloods, ...this.sim.results]);
  },
  banner(text, ms = 8000) { const b = $('banner'); b.textContent = text; b.classList.add('show'); clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('show'), ms); },
  reset() {
    clearTimeout(this._bt); const b = $('banner'); b.classList.remove('show'); b.textContent = '';
    for (const s of Object.values(this.scopes)) { s.lastT = null; s.lastY = null; if (s.c.width) { s.ctx.fillStyle = '#000'; s.ctx.fillRect(0, 0, s.c.width, s.c.height); } }
    this.lastNum = 0;
  },
};
