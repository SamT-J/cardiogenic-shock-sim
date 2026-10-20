/* Presenter control panel. Renders into a popup window (same-origin about:blank written by this page) or the in-window drawer. */
const CONTROL_CSS = `
  body { margin:0; background:#0a141f; color:#dfe8f1; font: 13px "Segoe UI", system-ui, sans-serif; }
  * { box-sizing: border-box; }
  #cp { display:grid; grid-template-columns: 430px 1fr; gap:10px; padding:10px; height:100vh; }
  .col { display:flex; flex-direction:column; gap:8px; min-height:0; overflow:auto; }
  .box { background:#122132; border:1px solid #27415c; border-radius:6px; padding:8px 10px; }
  .box h4 { margin:0 0 6px; font-size:12px; color:#5ee6a0; text-transform:uppercase; letter-spacing:0.5px; }
  button { background:#1b2f44; color:#e8eef5; border:1px solid #2f4a66; border-radius:4px; padding:4px 8px; margin:2px; cursor:pointer; font-size:12px; }
  button:hover { background:#27415c; } button.on { background:#2d6a4f; border-color:#5ee6a0; color:#fff; } button.warn { border-color:#ff7b72; color:#ff9a93; }
  select, input { background:#0f1b2a; color:#e8eef5; border:1px solid #2f4a66; border-radius:4px; padding:4px 6px; font-size:12px; }
  .row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .runbig { font-size:18px; font-weight:700; padding:10px 18px; border-radius:8px; min-width:150px; }
  .runbig.paused { background:#4a3800; border-color:#ffc53d; color:#ffd866; } .runbig.running { background:#1f5a3a; border-color:#5ee6a0; color:#9ff5c8; }
  .rtabs { display:flex; gap:0; border-bottom:2px solid #27415c; margin-bottom:8px; position:sticky; top:0; background:#0a141f; z-index:2; }
  .rtabs button { font-size:15px; padding:8px 20px; margin:0; border:none; border-bottom:3px solid transparent; background:transparent; border-radius:0; color:#9fb3c8; }
  .rtabs button.on { color:#5ee6a0; border-bottom-color:#5ee6a0; background:transparent; }
  .iv { display:grid; grid-template-columns: 150px 1fr; gap:4px; align-items:center; border-bottom:1px solid #1d3147; padding:3px 0; }
  .iv .lbl { color:#9fb3c8; } .iv .lbl b { color:#e8eef5; display:block; } .iv .lbl small { color:#6f8299; }
  .iv .seg button { border-radius:0; margin:0 -1px 0 0; } .iv .seg button:first-child { border-radius:4px 0 0 4px; } .iv .seg button:last-child { border-radius:0 4px 4px 0; }
  .iv.radio .seg button.on { background:#2d4f6a; border-color:#7cc4ff; color:#fff; }
  .iv.buttons .seg button.recent:not(.on) { background:#4a3800; border-color:#ffc53d; color:#ffd866; }
  .iv.disabled { opacity:0.45; } button:disabled { cursor:not-allowed; }
  .iv .sl { display:grid; grid-template-columns: 1fr 200px; gap:8px; align-items:center; }
  .iv .sl input[type=range] { width:100%; accent-color:#7cc4ff; } .iv .sl input[type=range].on { accent-color:#5ee6a0; }
  .iv .sl .ro { font-variant-numeric: tabular-nums; color:#9fb3c8; font-size:12px; } .iv .sl .ro.on { color:#9ff5c8; font-weight:600; }
  .group { margin-bottom:8px; } .group h5 { margin:6px 0 2px; font-size:12px; color:#ffc53d; }
  #log { font-family: Consolas, monospace; font-size:12px; max-height:240px; overflow:auto; white-space:pre-wrap; line-height:1.35; }
  #log .ev { color:#ff9a93; } #log .t { color:#6f8299; }
  .pend { background:#3b1d1d; border:1px solid #ff7b72; border-radius:4px; padding:4px 8px; margin:3px 0; display:flex; align-items:center; gap:8px; }
  .pend b { color:#ff9a93; } .pend .cd { font-variant-numeric: tabular-nums; min-width:40px; }
  .phase { margin:4px 0; } .phase summary { cursor:pointer; color:#7cc4ff; font-weight:600; } .phase p { margin:4px 0; color:#c9d6e3; } .phase li { color:#ffc53d; }
  .hid { display:grid; grid-template-columns: repeat(4, 1fr); gap:2px 8px; font-variant-numeric: tabular-nums; }
  .hid span { color:#9fb3c8; } .hid b { color:#e8eef5; font-weight:600; }
  .resp { display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:2px 10px; font-variant-numeric: tabular-nums; font-size:13px; }
  .resp .k { color:#9fb3c8; } .resp .up { color:#5ee6a0; } .resp .down { color:#ff9a93; } .resp .flat { color:#c9d6e3; }
  .stage { padding:2px 8px; border-radius:4px; font-weight:700; background:#27415c; }
  .stage.C { background:#8a6d00; } .stage.D { background:#9a3b00; } .stage.E { background:#a01010; }
  .ov { display:grid; grid-template-columns: 60px 1fr 60px; gap:6px; align-items:center; margin:2px 0; }
  .tabs button.on { background:#2d4f6a; }
  #cp-clock { font-size:16px; font-weight:700; font-variant-numeric: tabular-nums; }
  .onlist { color:#9ff5c8; font-size:12px; }
  .modal-bg { position:fixed; inset:0; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; z-index:50; }
  .modal { background:#122132; border:2px solid #5ee6a0; border-radius:12px; padding:26px 32px; max-width:820px; width:90%; font-size:19px; line-height:1.55; color:#e8eef5; box-shadow:0 10px 40px rgba(0,0,0,0.6); }
  .modal h3 { margin:0 0 12px; font-size:24px; color:#5ee6a0; }
  .modal .ok { display:block; margin:20px 0 0 auto; font-size:18px; font-weight:700; padding:10px 28px; background:#2d6a4f; border-color:#5ee6a0; color:#fff; border-radius:8px; }
`;

const Control = {
  win: null, root: null, doc: null, tab: 'main', recent: {},
  open() {
    let w = null;
    try { w = window.open('', 'cs-control', 'width=1220,height=940'); } catch (e) { w = null; }
    if (!w) { this.drawer(true); Views.banner('Popup blocked: using in-window drawer (Shift+C)'); return; }
    if (!w.document.getElementById('cp')) {
      w.document.open(); w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>CS sim control</title><style>${CONTROL_CSS}</style></head><body><div id="cp"></div></body></html>`); w.document.close();
    }
    this.win = w; this.doc = w.document; this.root = w.document.getElementById('cp');
    w.focus();
    this.build();
    w.onbeforeunload = () => { if (this.root === w.document.getElementById('cp')) { this.root = null; this.win = null; } };
  },
  drawer(force) {
    const d = document.getElementById('drawer');
    if (force === true) d.classList.add('open'); else d.classList.toggle('open');
    if (!d.classList.contains('open')) return;
    if (!d.firstChild) { const st = document.createElement('style'); st.textContent = CONTROL_CSS.replace(/body \{[^}]*\}/, '#drawer { color:#dfe8f1; font:13px "Segoe UI",system-ui,sans-serif; }').replace('#cp { display:grid; grid-template-columns: 430px 1fr;', '#cp { display:grid; grid-template-columns: 1fr;'); d.appendChild(st); const cp = document.createElement('div'); cp.id = 'cp'; d.appendChild(cp); }
    this.doc = document; this.root = d.querySelector('#cp'); this.win = window;
    this.build();
  },
  build() {
    const r = this.root; if (!r) return;
    r.innerHTML = `
      <div class="col">
        <div class="box">
          <div class="row"><select id="c-sc">${SCENARIOS.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select><button id="c-load" class="warn">Load / reset</button></div>
          <div class="row" style="margin-top:8px"><button id="c-run" class="runbig paused">&#9654; Start</button><span>Idle speed</span>${[0, 1, 2, 4].map(x => `<button data-rate="${x}" class="rate ${x === 1 ? 'on' : ''}">${x === 0 ? 'hold' : x + 'x'}</button>`).join('')}<span id="cp-clock"></span><span id="c-stage" class="stage">-</span></div>
          <div class="row tabs" style="margin-top:8px">Display: ${TABS.map(t => `<button data-tab="${t}">${TAB_LABEL[t]}</button>`).join('')}</div>
        </div>
        <div class="box"><h4>Response to last action</h4><div id="response" class="resp"><span style="color:#6f8299">none yet</span></div></div>
        <div class="box"><h4>Pending events</h4><div id="pending">none</div></div>
        <div class="box"><h4>Hidden numbers (model truth)</h4><div class="hid" id="hidden"></div></div>
        <div class="box"><h4>Script</h4><div id="script"></div></div>
        <div class="box"><h4>Event log</h4><div id="log"></div></div>
      </div>
      <div class="col" id="rightcol">
        <div class="rtabs"><button id="c-main" class="on">Controls</button><button id="c-ovr">Overrides</button><span style="margin-left:auto;align-self:center" class="onlist" id="c-onlist"></span></div>
        <div id="right"></div>
      </div>`;
    const d = this.doc;
    d.getElementById('c-load').onclick = () => sim.load(d.getElementById('c-sc').value);
    d.getElementById('c-run').onclick = () => sim.toggleRun();
    r.querySelectorAll('.rate').forEach(b => b.onclick = () => { sim.idleRate = +b.dataset.rate; r.querySelectorAll('.rate').forEach(x => x.classList.toggle('on', x === b)); sim.changed(); });
    r.querySelectorAll('.tabs button[data-tab]').forEach(b => b.onclick = () => Views.setTab(b.dataset.tab));
    d.getElementById('c-main').onclick = () => { this.tab = 'main'; this.renderRight(); };
    d.getElementById('c-ovr').onclick = () => { this.tab = 'ovr'; this.renderRight(); };
    if (sim.sc) d.getElementById('c-sc').value = sim.sc.id;
    this.renderRight(); this.renderScript(); this.update();
    if (!this._hooked) { this._hooked = true; sim.onChange(() => this.update()); setInterval(() => this.update(), 1000); }
  },
  /* Large confirm dialog in the control window (falls back to the display window if no panel is open). */
  modal(title, text) {
    if (!(this.doc && this.root && this.root.isConnected)) this.open();           // no panel open: open one (popup, or drawer if blocked)
    const d = this.doc, inDrawer = d === document;
    const host = inDrawer ? document.getElementById('drawer') : d.body;
    const bg = d.createElement('div'); bg.className = 'modal-bg'; if (inDrawer) bg.style.position = 'absolute';
    bg.innerHTML = `<div class="modal"><h3></h3><div class="txt"></div><button class="ok">OK</button></div>`;
    bg.querySelector('h3').textContent = title; bg.querySelector('.txt').textContent = text;
    const close = () => { bg.remove(); d.removeEventListener('keydown', onKey); };
    const onKey = ev => { if (ev.key === 'Escape' || ev.key === 'Enter') { close(); ev.preventDefault(); } };
    bg.querySelector('.ok').onclick = close; bg.onclick = ev => { if (ev.target === bg) close(); };
    d.addEventListener('keydown', onKey);
    host.appendChild(bg); bg.querySelector('.ok').focus();
  },
  /* Called by sim.load(): back to the Controls tab with everything re-rendered for the new scenario. */
  onLoad() {
    this.recent = {};
    if (!this.doc || !this.root || !this.root.isConnected) return;
    this.tab = 'main';
    const sel = this.doc.getElementById('c-sc'); if (sel && sim.sc) sel.value = sim.sc.id;
    this.renderScript(); this.renderRight(); this.update();
  },
  renderRight() {
    const r = this.doc.getElementById('right'); if (!r) return;
    this.doc.getElementById('c-main').classList.toggle('on', this.tab === 'main'); this.doc.getElementById('c-ovr').classList.toggle('on', this.tab === 'ovr');
    if (this.tab === 'ovr') { this.renderOverrides(r); return; }
    const groups = [...new Set(INTERVENTIONS.map(i => i.group))];
    const row = iv => {
      const lbl = `<div class="lbl" title="${(iv.note || '').replace(/"/g, '&quot;')}"><b>${iv.label}</b>${iv.unit || iv.conc ? `<small>${[iv.unit, iv.conc].filter(Boolean).join(', ')}</small>` : ''}</div>`;
      if (iv.type === 'slider') return `<div class="iv" data-row="${iv.id}">${lbl}<div class="sl"><input type="range" min="${iv.min}" max="${iv.max}" step="${iv.step}" data-sl="${iv.id}" title="${iv.minutes} patient-min per change"><span class="ro" data-ro="${iv.id}"></span></div></div>`;
      return `<div class="iv ${iv.type}" data-row="${iv.id}">${lbl}<div class="seg">${iv.opts.map((o, i) => `<button data-iv="${iv.id}" data-i="${i}" title="${o.min} patient-min">${o.label}</button>`).join('')}</div></div>`;
    };
    r.innerHTML = '<div class="box">' + groups.map(g => `<div class="group"><h5>${g}</h5>` + INTERVENTIONS.filter(i => i.group === g).map(row).join('') + '</div>').join('') + '</div>';
    r.querySelectorAll('button[data-iv]').forEach(b => b.onclick = () => { if (!sim.sc) return; this.recent[b.dataset.iv + ':' + b.dataset.i] = performance.now(); sim.act(b.dataset.iv, +b.dataset.i); });
    r.querySelectorAll('input[data-sl]').forEach(inp => {
      const iv = INTERVENTIONS.find(i => i.id === inp.dataset.sl);
      inp.oninput = () => { inp.dataset.drag = '1'; const ro = r.querySelector(`[data-ro="${iv.id}"]`); if (ro) ro.textContent = iv.readout(sim, +(+inp.value).toFixed(4)) + ' (release to apply)'; };
      inp.onchange = () => { delete inp.dataset.drag; sim.setSlider(iv.id, +inp.value); };
    });
    this.highlight();
  },
  isOn(iv, o) { try { return !!(o.on && o.on(sim)); } catch (e) { return false; } },
  highlight() {
    const r = this.doc && this.doc.getElementById('right'); if (!r || !sim.sc) return;
    const ol = this.doc.getElementById('c-onlist'); const a = this.runningList(); if (ol) ol.textContent = a.length ? 'Running: ' + a.join(', ') : '';
    if (this.tab !== 'main') return;
    for (const iv of INTERVENTIONS) {
      const enabled = !iv.enabled || iv.enabled(sim);
      const rowEl = r.querySelector(`[data-row="${iv.id}"]`); if (rowEl) rowEl.classList.toggle('disabled', !enabled);
      if (iv.type === 'slider') {
        const inp = r.querySelector(`input[data-sl="${iv.id}"]`), ro = r.querySelector(`[data-ro="${iv.id}"]`); if (!inp) continue;
        const v = iv.get(sim); inp.disabled = !enabled;
        if (!inp.dataset.drag) { inp.value = v; if (ro) ro.textContent = enabled ? iv.readout(sim, +(+v).toFixed(4)) : 'n/a'; }
        inp.classList.toggle('on', enabled && v > iv.min + 1e-9); if (ro) ro.classList.toggle('on', enabled && v > iv.min + 1e-9);
      } else {
        iv.opts.forEach((o, i) => { const b = r.querySelector(`button[data-iv="${iv.id}"][data-i="${i}"]`); if (!b) return; b.disabled = !enabled; b.classList.toggle('on', enabled && this.isOn(iv, o)); const rc = this.recent[iv.id + ':' + i]; b.classList.toggle('recent', !!rc && performance.now() - rc < 20000); });
      }
    }
  },
  runningList() {
    const skip = ['call', 'aspirin', 'p2y12', 'heparin', 'lysis', 'echo', 'cxr', 'bloods', 'catheter', 'cvc', 'vmode', 'vfio2', 'vpeep', 'vrr', 'vvt', 'vpinsp'];
    const active = [];
    for (const iv of INTERVENTIONS) {
      if (skip.includes(iv.id) || (iv.enabled && !iv.enabled(sim))) continue;
      if (iv.type === 'slider') { const v = iv.get(sim); if (v > iv.min + 1e-9) active.push(`${iv.label} ${iv.readout(sim, +(+v).toFixed(4))}`); }
      else if (iv.type === 'radio') { const o = iv.opts.find(o => this.isOn(iv, o)); if (o && o.label !== 'Off' && o.label !== 'Air') active.push(`${iv.label} ${o.label}`); }
      else for (const o of iv.opts) if (this.isOn(iv, o)) active.push(`${iv.label} ${o.label}`);
    }
    if (sim.e.ventilated) { const v = sim.e.vent, c = sim.e.ventCalc; active.push(`Ventilator ${v.mode} rate ${v.rr}, ${v.mode === 'VC' ? `VT ${v.vt} ml/kg, Pplat ${Math.round(c.pplat)}` : `Pinsp ${v.pinsp}, VT ${Math.round(c.vtMl)} ml`}, PEEP ${sim.e.peep}, FiO2 ${sim.e.fio2.toFixed(2)}`); }
    return active;
  },
  renderOverrides(r) {
    const fields = [['hr', 'HR', 0, 220, 1], ['sbp', 'SBP', 0, 250, 1], ['dbp', 'DBP', 0, 150, 1], ['spo2', 'SpO2', 0.3, 1, 0.01], ['rr', 'RR', 0, 50, 1], ['gcs', 'GCS', 3, 15, 1], ['temp', 'Temp', 32, 41, 0.1]];
    r.innerHTML = `<div class="box"><h4>Display overrides (model keeps running underneath)</h4>` + fields.map(([k, l, lo, hi, st]) => `<div class="ov"><span>${l}</span><input type="range" min="${lo}" max="${hi}" step="${st}" data-k="${k}" value="${sim.out[k] || 0}"><span><input type="checkbox" data-on="${k}" ${sim.overrides[k] != null ? 'checked' : ''}> <span id="ovv-${k}"></span></span></div>`).join('') + `<button id="ov-clear">Clear all overrides</button></div>
      <div class="box"><h4>Rhythm</h4><div class="row">${['sinus', 'af', 'junctional', 'chb', 'vt', 'vf', 'pea', 'asystole', 'paced'].map(x => `<button data-rh="${x}">${x}</button>`).join('')}</div>
        <div class="row" style="margin-top:6px">Sinus rate base <input type="number" id="ov-hrbase" style="width:70px" value="${sim.sc ? sim.e.k.hrBase : 75}"> Escape rate <input type="number" id="ov-esc" style="width:70px" value="${sim.sc ? sim.e.k.escapeRate : 40}"> <button id="ov-apply">Apply</button></div></div>
      <div class="box"><h4>Force scripted event</h4><div class="row">${sim.sc ? sim.sc.script.events.map(e => `<button data-force="${e.id}">${e.label}</button>`).join('') : ''}</div></div>
      <div class="box"><h4>Model knobs</h4><div class="row">Patency <input type="range" min="0" max="1" step="0.05" id="ov-pat" value="${sim.sc ? sim.e.k.patency : 1}"> LV contractility x <input type="range" min="0.2" max="1.5" step="0.05" id="ov-ees" value="${sim.sc ? sim.e.k.eesLv : 1}"> Venous shift <input type="range" min="-500" max="800" step="25" id="ov-vs" value="${sim.sc ? sim.e.k.venousShift : 0}"> <button id="ov-knobs">Apply</button></div>
        <div class="row" style="margin-top:6px"><button id="ov-team">Retrieval team present</button><button id="ov-seize">Trigger seizure</button><button id="ov-art">Toggle arterial line</button><button id="ov-selftest">Run self test (console)</button></div></div>`;
    const d = this.doc;
    r.querySelectorAll('input[type=range][data-k]').forEach(inp => { inp.oninput = () => { const k = inp.dataset.k; d.querySelector(`[data-on="${k}"]`).checked = true; sim.override(k, inp.value); d.getElementById('ovv-' + k).textContent = inp.value; }; });
    r.querySelectorAll('input[type=checkbox][data-on]').forEach(cb => cb.onchange = () => { const k = cb.dataset.on; sim.override(k, cb.checked ? r.querySelector(`input[data-k="${k}"]`).value : null); });
    d.getElementById('ov-clear').onclick = () => { sim.overrides = {}; sim.changed(); this.renderOverrides(r); };
    r.querySelectorAll('button[data-rh]').forEach(b => b.onclick = () => sim.setRhythm(b.dataset.rh));
    d.getElementById('ov-apply').onclick = () => { sim.e.k.hrBase = +d.getElementById('ov-hrbase').value; sim.e.k.escapeRate = +d.getElementById('ov-esc').value; sim.log('Rates adjusted by presenter'); };
    r.querySelectorAll('button[data-force]').forEach(b => b.onclick = () => sim.forceEvent(b.dataset.force));
    d.getElementById('ov-knobs').onclick = () => { sim.e.k.patency = +d.getElementById('ov-pat').value; sim.e.k.eesLv = +d.getElementById('ov-ees').value; sim.e.k.venousShift = +d.getElementById('ov-vs').value; sim.log('Model knobs adjusted by presenter'); };
    d.getElementById('ov-seize').onclick = () => sim.seizure(true);
    d.getElementById('ov-team').onclick = () => { sim.e.flags.teamPresent = true; sim.log('Retrieval team marked present'); };
    d.getElementById('ov-art').onclick = () => { sim.e.devices.artline = !sim.e.devices.artline; sim.log('Arterial line ' + (sim.e.devices.artline ? 'on' : 'off') + ' (presenter)'); sim.changed(); };
    d.getElementById('ov-selftest').onclick = () => console.log(engineSelfTest());
  },
  renderScript() {
    const el = this.doc && this.doc.getElementById('script'); if (!el) return;
    if (!sim.sc) { el.innerHTML = 'Load a scenario'; return; }
    const s = sim.sc;
    el.innerHTML = `<p style="margin:0 0 6px;color:#c9d6e3"><b>${s.patient.name}</b>, ${s.patient.age}${s.patient.sex}, ${s.patient.wt} kg. ${s.headline}</p>` +
      s.script.phases.map((p, i) => `<details class="phase" ${i === 0 ? 'open' : ''}><summary>${i + 1}. ${p.title}</summary><p>${p.text}</p><ul>${p.prompts.map(q => `<li>${q}</li>`).join('')}</ul></details>`).join('') +
      `<details class="phase"><summary>Pointers</summary><ul>${s.script.pointers.map(q => `<li style="color:#c9d6e3">${q}</li>`).join('')}</ul></details>` +
      `<details class="phase"><summary>Debrief</summary><ul>${s.debrief.map(q => `<li style="color:#c9d6e3">${q}</li>`).join('')}</ul></details>` +
      `<details class="phase"><summary>ECG description</summary><p>${s.ecg.text}</p>${s.ecg.v4r ? `<p>${s.ecg.v4r.text}</p>` : ''}</details>` +
      (s.optimal ? `<details class="phase"><summary>Optimal treatment path</summary><ol style="padding-left:20px">${s.optimal.map(q => `<li style="color:#c9d6e3;margin:3px 0">${q}</li>`).join('')}</ol></details>` : '');
  },
  update() {
    const d = this.doc; if (!d || !this.root || !this.root.isConnected) return;
    const run = d.getElementById('c-run'); if (run) { run.innerHTML = sim.running ? '&#10074;&#10074; Pause' : '&#9654; Start'; run.className = 'runbig ' + (sim.running ? 'running' : 'paused'); }
    const clk = d.getElementById('cp-clock'); if (clk && sim.sc) clk.textContent = `${hhmm(sim.clock(sim.t))}  (+${Math.round(sim.t / 60)} min)`;
    d.querySelectorAll('.tabs button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === Views.tab));
    d.querySelectorAll('.rate').forEach(b => b.classList.toggle('on', +b.dataset.rate === sim.idleRate));
    const o = sim.sc ? sim.out : null;
    const st = d.getElementById('c-stage'); if (st && o) { st.textContent = 'SCAI ' + o.stage; st.className = 'stage ' + o.stage; }
    const resp = d.getElementById('response');
    if (resp && !sim.lastAction && resp.dataset.t !== '') { resp.dataset.t = ''; resp.innerHTML = '<span style="color:#6f8299">none yet</span>'; }
    if (resp && sim.lastAction && resp.dataset.t !== String(sim.lastAction.seq)) {
      resp.dataset.t = String(sim.lastAction.seq);
      const la = sim.lastAction, b = la.before, a = la.after;
      const item = (k, label, f, scale = 1) => { const dv = (a[k] - b[k]) * scale; const cls = Math.abs(dv) < 0.5 ? 'flat' : dv > 0 ? 'up' : 'down'; return `<div><span class="k">${label}</span> ${f(b[k] * scale)} &#8594; <b class="${cls}">${f(a[k] * scale)}</b> <span class="${cls}">(${dv > 0 ? '+' : ''}${f(dv)})</span></div>`; };
      const i0 = x => Math.round(x).toString(), i1 = x => (Math.round(x * 10) / 10).toFixed(1), i2 = x => x.toFixed(2);
      resp.innerHTML = `<div style="grid-column:1/-1;color:#ffc53d"><b>${la.label}</b>, ${la.minutes} patient-min</div>` + item('map', 'MAP', i0) + item('hr', 'HR', i0) + item('ci', 'CI', i2) + item('sbp', 'SBP', i0) + item('pcwp', 'PCWP', i0) + item('cvp', 'CVP', i0) + item('spo2', 'SpO2', i0, 100) + item('rr', 'RR', i0) + item('lact', 'Lactate', i1) + item('cpp', 'CPP', i0) + item('svr', 'SVR', i0) + item('urine', 'Urine/h', i0);
    }
    const pend = d.getElementById('pending'); if (pend) { pend.innerHTML = sim.pending.length ? sim.pending.map(p => `<div class="pend"><b>${p.label}</b><span class="cd">${Math.max(0, Math.ceil(p.left))} s</span><button data-cancel="${p.id}">Cancel</button><button data-now="${p.id}">Now</button></div>`).join('') : '<span style="color:#6f8299">none</span>'; pend.querySelectorAll('button[data-cancel]').forEach(b => b.onclick = () => sim.cancelEvent(b.dataset.cancel)); pend.querySelectorAll('button[data-now]').forEach(b => b.onclick = () => sim.forceEvent(b.dataset.now)); }
    const hid = d.getElementById('hidden'); if (hid && o) {
      const e = sim.e; const inf = Object.entries(e.drugs).filter(([k, v]) => v.level > 0.001 || v.target > 0).map(([k, v]) => `${k} ${v.target}`).join(', ');
      const items = [['CO', o.co.toFixed(1) + ' L/min'], ['CI', o.ci.toFixed(2)], ['SV', Math.round(o.sv) + ' ml'], ['MAP', Math.round(o.map)], ['PCWP', Math.round(o.pcwp)], ['CVP', Math.round(o.cvp)], ['PA', `${Math.round(o.pap.s)}/${Math.round(o.pap.d)}`], ['SVR', Math.round(o.svr)], ['SvO2', Math.round(o.svo2 * 100) + '%'], ['Lactate', o.lact.toFixed(1)], ['pH', o.ph.toFixed(2)], ['pCO2', o.pco2.toFixed(1)], ['CPP', Math.round(o.cpp)], ['LV contr', (o.contr.lv * 100).toFixed(0) + '%'], ['RV contr', (o.contr.rv * 100).toFixed(0) + '%'], ['Patency', (e.k.patency * 100).toFixed(0) + '%'], ['LVEF', Math.round(o.efLv * 100) + '%'], ['MR RF', Math.round(o.rf * 100) + '%'], ['Qp:Qs', o.qpqs.toFixed(1)], ['Urine', Math.round(o.urine) + ' ml/h'], ['PPV', Math.round(o.ppv) + '%' + (o.ppvValid ? '' : '*')], ['Preload gain', (o.preloadGain * 100).toFixed(0) + '%'], ['Shunt', Math.round(o.shunt * 100) + '%'], ['PI', o.pi.toFixed(2)], ['CRT', o.crt.toFixed(1) + ' s'], ['Fluid in', Math.round(o.exoVol) + ' ml'], ['Infusions', inf || 'none'], ['FiO2/PEEP', `${e.fio2.toFixed(2)} / ${e.peep}`], ['Devices', [e.devices.artline && 'art', e.devices.cvc && 'cvc', e.devices.iabp && 'IABP', e.devices.pacing && 'TCP', e.flags.teamPresent && 'team'].filter(Boolean).join(' ') || '-'], ['Overrides', Object.keys(sim.overrides).join(' ') || 'none']];
      hid.innerHTML = items.map(([k, v]) => `<div><span>${k}</span> <b>${v}</b></div>`).join('');
    }
    const log = d.getElementById('log'); if (log) { const html = sim.logs.slice().reverse().map(l => `<div class="${l.text.startsWith('Event') || l.text.startsWith('**') ? 'ev' : ''}"><span class="t">${hhmm(sim.clock(l.t))}</span> ${l.text}</div>`).join(''); if (log.innerHTML !== html) log.innerHTML = html; }
    this.highlight();
  },
};

/* Dev hook: ?resettest=1 performs a broad set of actions then reloads the scenario and diffs the full state
   (sim, engine, display and control panel) against the state right after the first load. */
function stateSignature() {
  const e = sim.e, r = x => (typeof x === 'number' ? Math.round(x * 100) / 100 : x);
  const J = (x, round) => JSON.stringify(x, (k, v) => (round && typeof v === 'number' ? r(v) : v));
  const dev = Object.assign({}, e.devices, { nibpLast: e.devices.nibpLast ? 'present' : null, nibpNext: 0 });
  const tile = id => document.getElementById(id).textContent.trim();
  const sig = {
    'sim.t': sim.t, 'sim.dispT': sim.dispT, 'sim.ff': sim.ff, 'sim.running': sim.running, 'sim.idleRate': sim.idleRate, 'sim.sc': sim.sc.id,
    'sim.logs': sim.logs.length, 'sim.results': sim.results.length, 'sim.gases': sim.gases.length, 'sim.ecgs': sim.ecgs.length, 'sim.timers': sim.timers.length, 'sim.pending': sim.pending.length, 'sim.fired': J(sim.fired), 'sim.overrides': J(sim.overrides),
    'sim.echoDone': sim.echoDone, 'sim.echoSnapshot': !!sim.echoSnapshot, 'sim.lastAction': !!sim.lastAction, 'sim.o2label': sim.o2label, 'sim.shocks': sim.shocks, 'sim.lowSince': J(sim.lowSince), 'sim.patencySince': sim.patencySince, 'sim.rhythmSince': sim.rhythmSince, 'sim.lastGas': sim.lastGas ? r(sim.lastGas.lact) : null, 'sim.disp': J(sim.disp, true),
    'e.t': e.t, 'e.drugs': J(e.drugs), 'e.boluses': e.boluses.length, 'e.infusing': e.infusing.length, 'e.devices': J(dev), 'e.flags': J(e.flags), 'e.contr': J(e.contr, true), 'e.reflex': J(e.reflex, true), 'e.k': J(e.k), 'e.V': J(e.V, true), 'e.fio2': e.fio2, 'e.peep': e.peep, 'e.ventilated': e.ventilated, 'e.cpap': e.cpap, 'e.vent': J(e.vent), 'e.furosT': e.furosT, 'e.exoVol': r(e.exoVol), 'e.lact': r(e.lact), 'e.pco2': r(e.pco2), 'e.rr': r(e.rr), 'e.out.hr': r(e.out.hr), 'e.out.map': r(e.out.map), 'e.out.rhythm': e.out.rhythm, 'e.out.gcs': e.out.gcs,
    'rh.beats': sim.rh.beats.length,
    'ui.tab': Views.tab, 'ui.headline': tile('headline'), 'ui.t-hr': tile('t-hr') + '|' + tile('t-hr-sub'), 'ui.t-bp-lbl': tile('t-bp-lbl'), 'ui.t-rr': tile('t-rr') + '|' + tile('t-rr-sub'), 'ui.t-spo2': tile('t-spo2') + '|' + tile('t-spo2-lbl') + '|' + tile('t-spo2-sub'), 'ui.t-gcs': tile('t-gcs') + '|' + tile('t-gcs-sub'), 'ui.t-lac': tile('t-lac'),
    'ui.rowbp': document.getElementById('row-bp').className, 'ui.banner': document.getElementById('banner').className + '|' + tile('banner'), 'ui.ecgHead': document.getElementById('ecg-head').textContent.replace(/\s+/g, ' ').trim(), 'ui.abgSlips': document.querySelectorAll('.abg-slip').length, 'ui.echoKey': document.getElementById('echo-media').dataset.key || '', 'ui.echoViews': document.getElementById('echo-views').children.length, 'ui.exam': document.getElementById('view-exam').textContent.length, 'ui.hist': document.getElementById('view-hist').textContent.length, 'ui.runbtn': document.getElementById('btn-run').className, 'ui.clkff': tile('clk-ff'), 'ui.monAlarm': tile('mon-alarm'), 'ui.nbp-lbl': tile('n-bp-lbl'),
  };
  const cd = Control.doc && Control.root && Control.root.isConnected ? Control.doc : null;
  if (cd) {
    Control.update();
    sig['cp.response'] = cd.getElementById('response').textContent.trim(); sig['cp.pending'] = cd.getElementById('pending').textContent.trim(); sig['cp.log'] = cd.getElementById('log').children.length;
    sig['cp.on'] = [...cd.querySelectorAll('button[data-iv].on')].map(b => b.dataset.iv + ':' + b.dataset.i).join(','); sig['cp.sliders'] = [...cd.querySelectorAll('input[data-sl]')].map(i => i.dataset.sl + '=' + i.value + (i.disabled ? 'd' : '')).join(','); sig['cp.onlist'] = cd.getElementById('c-onlist').textContent; sig['cp.run'] = cd.getElementById('c-run').className; sig['cp.rate'] = [...cd.querySelectorAll('.rate.on')].map(b => b.dataset.rate).join(','); sig['cp.stage'] = cd.getElementById('c-stage').textContent; sig['cp.tab'] = Control.tab; sig['cp.sel'] = cd.getElementById('c-sc').value;
    sig['cp.hidden'] = cd.getElementById('hidden').textContent.replace(/\d+\.\d+|\d+/g, '#');
  }
  return sig;
}
function resetTest() {
  Control.drawer(true);
  const id = sim.sc.id;
  const a = stateSignature();
  const seq = 'artline:0,oxygen:1,cpap:1,norad=0.2,dobut=5,milri=0.375,gtn_sl:0,gtn_inf=2,fluid:1,morphine:1,furosemide:0,atropine:0,aspirin:0,p2y12:0,heparin:0,ecg12:1,abg:0,abg:1,echo:0,cxr:0,bloods:0,catheter:0,cvc:0,call:0,call:1,call:2,call:3,rsi:0,vmode:1,vpeep=10,vfio2=0.6,vrr=20,vpinsp=24,sedation=100,tcp:1,amio:0,lysis:0,metar:0,vaso=0.02,isop=5,wait:2';
  for (const s of seq.split(',')) { if (s.includes('=')) { const [i, v] = s.split('='); sim.setSlider(i, +v); } else { const [i, j] = s.split(':'); sim.act(i, +j); } }
  sim.override('hr', 150); sim.override('spo2', 0.8); sim.setRhythm('vf'); sim.act('shock', 1); sim.act('cpr', 1); sim.act('adren_bolus', 1);
  sim.forceEvent(sim.sc.script.events[0].id); sim.e.flags.teamPresent = true; sim.act('iabp', 0); sim.running = true; sim.idleRate = 4; sim.tick(2); Views.setTab('echo'); Control.tab = 'ovr'; Control.renderRight(); Views.banner('test banner');
  const mid = stateSignature();
  sim.load(id);
  const b = stateSignature();
  const diffs = Object.keys(a).filter(k => a[k] !== b[k]).map(k => `${k}: fresh=${String(a[k]).slice(0, 80)} after-reset=${String(b[k]).slice(0, 80)}`);
  const unchanged = Object.keys(a).filter(k => a[k] === mid[k]).length;
  console.warn(`RESETTEST ${diffs.length ? 'FAIL ' + diffs.length + ' || ' + diffs.join(' || ') : 'OK'} || keys ${Object.keys(a).length}, keys unchanged by the action burst ${unchanged}`);
}

// ---------- boot ----------
window.addEventListener('DOMContentLoaded', () => {
  Views.init(sim);
  const q = new URLSearchParams(location.search);
  sim.load(q.get('scenario') || SCENARIOS[0].id);
  if (q.get('tab')) Views.setTab(q.get('tab'));
  if (q.get('echo')) sim.acquireEcho();
  if (q.get('artline')) sim.e.devices.artline = true;
  if (q.get('rhythm')) sim.setRhythm(q.get('rhythm'));
  if (q.get('iabp')) sim.e.devices.iabp = true;
  if (q.get('cpr')) sim.e.devices.cpr = true;
  if (q.get('seizure')) sim.seizure(true);
  if (q.get('control')) Control.drawer(true);
  if (q.get('auto')) { // headless end-to-end: ?auto=id:opt,id:opt,...
    for (const s of q.get('auto').split(',')) { if (s.includes('=')) { const [id, v] = s.split('='); sim.setSlider(id, +v); } else { const [id, i] = s.split(':'); sim.act(id, +(i || 0)); } }
    const o = sim.out;
    const la = sim.lastAction, pk = x => ['hr', 'map', 'sbp', 'ci', 'pcwp', 'spo2', 'rr', 'lact'].map(k => `${k}=${(+x[k]).toFixed(2)}`).join(' ');
    if (la) console.warn(`AUTO LAST ${la.label} ${la.minutes} min t=${la.t} || before ${pk(la.before)} || after ${pk(la.after)} || disp hr=${sim.disp.hr.toFixed(1)} map=${sim.disp.map.toFixed(1)} spo2=${sim.disp.spo2.toFixed(3)} rr=${sim.disp.rr.toFixed(1)}`);
    console.warn('AUTO LOG || ' + sim.logs.map(l => hhmm(sim.clock(l.t)) + ' ' + l.text).join(' || ') + ` || AUTO OUT HR ${o.hr.toFixed(0)} ${o.rhythm} BP ${o.sbp.toFixed(0)}/${o.dbp.toFixed(0)} CI ${o.ci.toFixed(2)} PCWP ${o.pcwp.toFixed(0)} SpO2 ${(o.spo2 * 100).toFixed(0)} lact ${o.lact.toFixed(1)} GCS ${o.gcs} stage ${o.stage} pending ${sim.pending.map(p => p.id + ':' + Math.round(p.left)).join(' ')}`);
  }
  if (q.get('prewarm')) requestAnimationFrame(() => { Views.setTab('obs'); Object.values(Views.scopes).forEach(s => s.resize()); for (let t = 0; t < 9000; t += 20) Views.frame(t); });
  let last = performance.now();
  const loop = now => { const dt = Math.min(0.25, (now - last) / 1000); last = now; sim.tick(dt); Views.frame(now); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  document.getElementById('btn-control').onclick = ev => { ev.shiftKey ? Control.drawer() : Control.open(); };
  window.addEventListener('keydown', ev => {
    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT') return;
    if (ev.key === 'c') Control.open(); else if (ev.key === 'C') Control.drawer();
    else if (ev.key === ' ') { sim.toggleRun(); ev.preventDefault(); }
    else if (ev.key >= '1' && ev.key <= '6') Views.setTab(TABS[+ev.key - 1]);
  });
  if (q.get('resettest')) resetTest();
});
