/* Intervention catalogue.
   type 'slider': continuous dose {min, max, step, minutes, get(s), set(s, v), readout(s, v), enabled(s)}; applied on slider release.
   type 'radio':  mutually exclusive states, opts with on(s) (exactly one lit).
   type 'buttons': one-shot actions, opts with on(s) lit while the effect is active.
   s is the Sim controller (s.e = engine). */

const mlh = (dose, wt, conc) => (dose * wt * 60 / conc).toFixed(1) + ' ml/h'; // mcg/kg/min at conc mcg/ml
const target = (s, n) => (s.e.drugs[n] ? s.e.drugs[n].target : 0);
const slider = (id, group, label, unit, conc, min, max, step, minutes, name, tauOn, tauOff, readout, note) => ({
  id, type: 'slider', group, label, unit, conc, min, max, step, minutes, note,
  get: s => target(s, name),
  set: (s, v) => s.infuse(name, v, tauOn, tauOff, v ? `${label} ${v} ${unit}` + (readout ? ` (${readout(s, v)})` : '') : `${label} stopped`),
  readout: (s, v) => v ? `${v} ${unit}` + (readout ? `, ${readout(s, v)}` : '') : 'off',
});
const vent = s => s.e.vent;

const INTERVENTIONS = [
  { id: 'fluid', type: 'buttons', group: 'Fluids', label: 'Crystalloid bolus', opts: [
    { label: '250 ml', min: 6, run: s => s.fluid(250, 5), on: () => false },
    { label: '500 ml', min: 11, run: s => s.fluid(500, 10), on: () => false },
    { label: '1000 ml', min: 16, run: s => s.fluid(1000, 15), on: () => false },
  ], note: 'Starling: forward gain only when preload dependent. Watch JVP, SpO2 and wedge.' },

  { id: 'oxygen', type: 'radio', group: 'Oxygen / airway', label: 'Oxygen', opts: [
    { label: 'Air', min: 2, run: s => s.o2(0.21, 'air'), on: s => !s.e.cpap && !s.e.ventilated && s.e.fio2 === 0.21 },
    { label: 'Nasal 4 L', min: 2, run: s => s.o2(0.30, 'nasal 4 L'), on: s => !s.e.cpap && !s.e.ventilated && s.e.fio2 === 0.30 },
    { label: 'Mask 10 L', min: 2, run: s => s.o2(0.50, 'mask 10 L'), on: s => !s.e.cpap && !s.e.ventilated && s.e.fio2 === 0.50 },
    { label: 'NRB 15 L', min: 2, run: s => s.o2(0.85, '15 L NRB'), on: s => !s.e.cpap && !s.e.ventilated && s.e.fio2 === 0.85 },
  ], enabled: s => !s.e.ventilated },
  { id: 'cpap', type: 'radio', group: 'Oxygen / airway', label: 'CPAP', opts: [
    { label: 'Off', min: 2, run: s => { if (s.e.cpap) { s.e.cpap = false; s.e.peep = 0; s.o2(0.85, '15 L NRB'); } }, on: s => !s.e.cpap },
    { label: '5 cmH2O', min: 6, run: s => s.cpapOn(5), on: s => s.e.cpap && s.e.peep === 5 },
    { label: '10 cmH2O', min: 6, run: s => s.cpapOn(10), on: s => s.e.cpap && s.e.peep === 10 },
  ], enabled: s => !s.e.ventilated, note: 'Keeps the current FiO2 (minimum 0.6). Bradley 1992: CPAP 5 raised CI 14% when PCWP >12 and lowered it 8% when PCWP <12.' },
  { id: 'rsi', type: 'buttons', group: 'Oxygen / airway', label: 'RSI and ventilate', opts: [
    { label: 'Ketamine 1 mg/kg + roc', min: 10, run: s => s.intubate('ketamine', 1.0), on: s => s.e.ventilated && s.e.flags.rsiAgent === 'ketamine 1' },
    { label: 'Ketamine 0.5 mg/kg + roc', min: 10, run: s => s.intubate('ketamine', 0.5), on: s => s.e.ventilated && s.e.flags.rsiAgent === 'ketamine 0.5' },
    { label: 'Propofol 1.5 mg/kg + roc', min: 10, run: s => s.intubate('propofol', 1.5), on: s => s.e.ventilated && s.e.flags.rsiAgent === 'propofol 1.5' },
    { label: 'Propofol 0.5 mg/kg + roc', min: 10, run: s => s.intubate('propofol', 0.5), on: s => s.e.ventilated && s.e.flags.rsiAgent === 'propofol 0.5' },
    { label: 'Etomidate 0.3 mg/kg + roc', min: 10, run: s => s.intubate('etomidate', 0.3), on: s => s.e.ventilated && s.e.flags.rsiAgent === 'etomidate 0.3' },
  ], note: 'Post-intubation hypotension in ~25%; shock index >0.9 is the strongest predictor. Pressor running, reduced dose, PEEP 5, FiO2 1.0 then wean.' },

  { id: 'vmode', type: 'radio', group: 'Ventilator', label: 'Mode', opts: [
    { label: 'Volume control', min: 2, run: s => { vent(s).mode = 'VC'; s.log('Ventilator: volume control'); }, on: s => vent(s).mode === 'VC' },
    { label: 'Pressure control', min: 2, run: s => { vent(s).mode = 'PC'; s.log('Ventilator: pressure control'); }, on: s => vent(s).mode === 'PC' },
  ], enabled: s => s.e.ventilated, note: 'VC sets tidal volume and reads plateau pressure; PC sets inspiratory pressure and reads delivered volume. Compliance falls with pulmonary oedema.' },
  { id: 'vfio2', type: 'slider', group: 'Ventilator', label: 'FiO2', unit: '', min: 0.21, max: 1.0, step: 0.05, minutes: 3, get: s => s.e.fio2, set: (s, v) => { s.e.fio2 = v; s.o2label = `ETT, FiO2 ${v.toFixed(2)}`; s.log(`FiO2 ${v.toFixed(2)}`); }, readout: (s, v) => (v * 100).toFixed(0) + '%', enabled: s => s.e.ventilated },
  { id: 'vpeep', type: 'slider', group: 'Ventilator', label: 'PEEP', unit: 'cmH2O', min: 0, max: 15, step: 1, minutes: 3, get: s => s.e.peep, set: (s, v) => { s.e.peep = v; s.log(`PEEP ${v} cmH2O`); }, readout: (s, v) => `${v} cmH2O`, enabled: s => s.e.ventilated },
  { id: 'vrr', type: 'slider', group: 'Ventilator', label: 'Set rate', unit: '/min', min: 8, max: 35, step: 1, minutes: 3, get: s => vent(s).rr, set: (s, v) => { vent(s).rr = v; s.log(`Ventilator rate ${v}/min`); }, readout: (s, v) => `${v}/min`, enabled: s => s.e.ventilated },
  { id: 'vvt', type: 'slider', group: 'Ventilator', label: 'Tidal volume (VC)', unit: 'ml/kg', min: 4, max: 10, step: 0.5, minutes: 3, get: s => vent(s).vt, set: (s, v) => { vent(s).vt = v; s.log(`Tidal volume ${v} ml/kg (${Math.round(v * s.wt)} ml)`); }, readout: (s, v) => { const c = s.e.ventCalc || {}; return `${v} ml/kg = ${Math.round(v * s.wt)} ml` + (c.pplat ? `, Pplat ${Math.round(c.pplat)}` : ''); }, enabled: s => s.e.ventilated && vent(s).mode === 'VC' },
  { id: 'vpinsp', type: 'slider', group: 'Ventilator', label: 'Pinsp (PC)', unit: 'cmH2O', min: 10, max: 35, step: 1, minutes: 3, get: s => vent(s).pinsp, set: (s, v) => { vent(s).pinsp = v; s.log(`Inspiratory pressure ${v} cmH2O`); }, readout: (s, v) => { const c = s.e.ventCalc || {}; return `${v} cmH2O` + (c.vtMl && vent(s).mode === 'PC' ? `, VT ${Math.round(c.vtMl)} ml` : ''); }, enabled: s => s.e.ventilated && vent(s).mode === 'PC' },

  slider('norad', 'Vasoactive', 'Noradrenaline', 'mcg/kg/min', '4 mg/50 ml (80 mcg/ml)', 0, 1.0, 0.05, 5, 'norad', 90, 150, (s, v) => mlh(v, s.wt, 80), 'Alpha with modest beta: raises SVR and MAP, recruits venous volume; CO roughly flat. Review above 0.4.'),
  slider('adren', 'Vasoactive', 'Adrenaline infusion', 'mcg/kg/min', '4 mg/50 ml', 0, 0.5, 0.05, 5, 'adren', 60, 120, (s, v) => mlh(v, s.wt, 80), 'Beta then alpha with dose; drives lactate and HR; more refractory shock than noradrenaline (OptimaCC).'),
  slider('dobut', 'Vasoactive', 'Dobutamine', 'mcg/kg/min', '250 mg/50 ml', 0, 20, 2.5, 5, 'dobut', 120, 150, (s, v) => mlh(v, s.wt, 5000), 'Beta1 inodilator: CI +25% at 5, HR +10%, SVR and PCWP fall. Tachycardia raises oxygen demand.'),
  slider('milri', 'Vasoactive', 'Milrinone', 'mcg/kg/min', '10 mg/50 ml', 0, 0.75, 0.125, 15, 'milri', 20 * 60, 2.3 * 3600, (s, v) => mlh(v, s.wt, 200), 'PDE3 inodilator: slow onset without a load (15 min jump), long half-life, hypotension; less tachycardia than dobutamine.'),
  slider('vaso', 'Vasoactive', 'Vasopressin', 'U/min', '20 U/50 ml', 0, 0.04, 0.01, 8, 'vaso', 300, 600, (s, v) => (v * 60 / 0.4).toFixed(1) + ' ml/h', 'Pure V1 vasoconstrictor, no chronotropy, PVR neutral.'),
  slider('isop', 'Vasoactive', 'Isoprenaline', 'mcg/min', '2 mg/50 ml', 0, 10, 1, 5, 'isop', 90, 120, (s, v) => (v * 60 / 40).toFixed(1) + ' ml/h', 'Beta1/2: chronotropy with vasodilation. For escape rhythms that ignore atropine.'),
  slider('gtn_inf', 'Vasoactive', 'GTN infusion', 'mg/h', '50 mg/50 ml', 0, 10, 1, 4, 'gtn', 90, 180, (s, v) => `${v} ml/h`, 'Venous below ~2 mg/h, arteriolar above; tolerance after 8-24 h.'),
  { id: 'adren_bolus', type: 'buttons', group: 'Vasoactive', label: 'Adrenaline bolus', opts: [
    { label: '50 mcg push', min: 2, run: s => { s.e.bolus('adren', 0.25, 120, 15); s.log('Adrenaline 50 mcg IV'); }, on: () => false },
    { label: '1 mg (arrest)', min: 2, run: s => { s.e.bolus('adren', 1.2, 180, 20); s.log('Adrenaline 1 mg IV'); }, on: () => false },
  ] },
  { id: 'metar', type: 'buttons', group: 'Vasoactive', label: 'Metaraminol', opts: [
    { label: '0.5 mg bolus', min: 2, run: s => { s.e.bolus('metar', 0.5, 900, 30); s.log('Metaraminol 0.5 mg IV'); }, on: () => false },
    { label: '1 mg bolus', min: 2, run: s => { s.e.bolus('metar', 1.0, 900, 30); s.log('Metaraminol 1 mg IV'); }, on: () => false },
  ], note: 'Alpha agonist bolus: SVR up, reflex bradycardia, 20-60 min.' },
  { id: 'ephed', type: 'buttons', group: 'Vasoactive', label: 'Ephedrine', opts: [
    { label: '6 mg bolus', min: 2, run: s => { s.e.bolus('ephed', 6, 600, 60); s.log('Ephedrine 6 mg IV'); }, on: () => false },
  ], note: 'Mixed direct and indirect alpha/beta: HR, contractility and SVR up for 10-15 min; blunted when catecholamine depleted; tachyphylaxis with repeats.' },
  { id: 'metar_inf', type: 'slider', group: 'Vasoactive', label: 'Metaraminol infusion', unit: 'mg/h', conc: '20 mg/40 ml (0.5 mg/ml)', min: 0, max: 10, step: 0.5, minutes: 5,
    get: s => (s.e.drugs.metar ? s.e.drugs.metar.target / 0.36 : 0),
    set: (s, v) => s.infuse('metar', v * 0.36, 600, 900, v ? `metaraminol infusion ${v} mg/h (${(v / 0.5).toFixed(1)} ml/h)` : 'metaraminol infusion stopped'),
    readout: (s, v) => v ? `${v} mg/h, ${(v / 0.5).toFixed(1)} ml/h` : 'off',
    note: 'Peripheral alpha agonist infusion, 0.5-10 mg/h; bridge until a central line and noradrenaline.' },
  { id: 'milri_load', type: 'buttons', group: 'Vasoactive', label: 'Milrinone load', opts: [{ label: '50 mcg/kg over 10 min', min: 10, run: s => { s.e.bolus('milri', 0.6, 2.3 * 3600, 300); s.log('Milrinone load 50 mcg/kg over 10 min'); }, on: () => false }], note: 'Usually omitted in the UK: hypotension.' },

  { id: 'gtn_sl', type: 'buttons', group: 'Drugs', label: 'GTN sublingual', opts: [
    { label: '400 mcg', min: 3, run: s => { s.e.bolus('gtn', 2, 240, 60); s.log('GTN 400 mcg SL'); }, on: () => false },
    { label: '800 mcg', min: 3, run: s => { s.e.bolus('gtn', 4, 240, 60); s.log('GTN 800 mcg SL'); }, on: () => false },
  ], note: 'Venodilator: PAWP falls most when it starts high (19 to 9) and barely when normal.' },
  { id: 'aspirin', type: 'buttons', group: 'Drugs', label: 'Aspirin 300 mg', opts: [{ label: 'Give', min: 1, run: s => { s.e.flags.aspirin = true; s.log('Aspirin 300 mg chewed'); }, on: s => !!s.e.flags.aspirin }] },
  { id: 'p2y12', type: 'buttons', group: 'Drugs', label: 'P2Y12 loading', opts: [
    { label: 'Ticagrelor 180', min: 1, run: s => { s.e.flags.p2y12 = 'ticagrelor'; s.log('Ticagrelor 180 mg PO'); }, on: s => s.e.flags.p2y12 === 'ticagrelor' },
    { label: 'Clopidogrel 600', min: 1, run: s => { s.e.flags.p2y12 = 'clopidogrel600'; s.log('Clopidogrel 600 mg PO'); }, on: s => s.e.flags.p2y12 === 'clopidogrel600' },
    { label: 'Clopidogrel 300 (lysis)', min: 1, run: s => { s.e.flags.p2y12 = 'clopidogrel300'; s.log('Clopidogrel 300 mg PO'); }, on: s => s.e.flags.p2y12 === 'clopidogrel300' },
  ], note: 'Absorption is poor in shock; oral agents may not work for hours. Receiving centre chooses.' },
  { id: 'heparin', type: 'buttons', group: 'Drugs', label: 'Heparin', opts: [
    { label: 'UFH 5000 U', min: 1, run: s => { s.e.flags.heparin = 'ufh'; s.log('Unfractionated heparin 5000 U IV'); }, on: s => s.e.flags.heparin === 'ufh' },
    { label: 'Enoxaparin 30 mg IV', min: 1, run: s => { s.e.flags.heparin = 'enox'; s.log('Enoxaparin 30 mg IV (lysis regimen)'); }, on: s => s.e.flags.heparin === 'enox' },
  ] },
  { id: 'lysis', type: 'buttons', group: 'Drugs', label: 'Fibrinolysis', opts: [
    { label: 'Tenecteplase (weight based)', min: 5, run: s => s.lyse(), on: s => !!s.e.flags.lysed },
  ], note: 'Within 12 h, PCI not achievable within 120 min, echo excludes mechanical complication. ~60% reperfuse by 90 min.' },
  { id: 'morphine', type: 'buttons', group: 'Drugs', label: 'Morphine', opts: [2.5, 5, 10].map(d => ({ label: d + ' mg', min: 5, run: s => { s.e.bolus('morph', d, 2.5 * 3600, 300); s.log(`Morphine ${d} mg IV`); }, on: () => false })),
    note: 'Venodilation and respiratory depression; associated with harm in ACS and acute HF (CRUSADE, ADHERE).' },
  { id: 'furosemide', type: 'buttons', group: 'Drugs', label: 'Furosemide', opts: [40, 80].map(d => ({ label: d + ' mg', min: 5, run: s => { s.e.bolus('furos', d, 2 * 3600, 300); s.e.furosT = s.e.t; s.log(`Furosemide ${d} mg IV`); }, on: () => false })),
    note: 'Early neurohormonal phase (SVR up, SV down) then diuresis from 30 min if the kidney is perfused.' },
  { id: 'atropine', type: 'buttons', group: 'Drugs', label: 'Atropine', opts: [
    { label: '500 mcg', min: 3, run: s => { s.e.bolus('atrop', 0.5, 2 * 3600, 60); s.log('Atropine 500 mcg IV'); }, on: () => false },
    { label: '1 mg', min: 3, run: s => { s.e.bolus('atrop', 1.0, 2 * 3600, 60); s.log('Atropine 1 mg IV'); }, on: () => false },
  ], note: 'Nodal (vagal) block responds; infranodal block with a broad escape does not. Repeat to 3 mg.' },
  { id: 'glyco', type: 'buttons', group: 'Drugs', label: 'Glycopyrronium', opts: [
    { label: '200 mcg', min: 3, run: s => { s.e.bolus('glyco', 0.2, 2 * 3600, 120); s.log('Glycopyrronium 200 mcg IV'); }, on: () => false },
  ], note: 'Antimuscarinic: slower onset (2-3 min) and gentler than atropine, no central effects; same limits in infranodal block.' },
  { id: 'amio', type: 'buttons', group: 'Drugs', label: 'Amiodarone 300 mg', opts: [{ label: 'Over 20 min', min: 20, run: s => s.amiodarone(), on: () => false }], note: 'Hypotension in ~15%, chemical cardioversion of tolerated VT is slow (median 42 min).' },
  { id: 'benzo', type: 'buttons', group: 'Drugs', label: 'Benzodiazepine (seizure)', opts: [
    { label: 'Lorazepam 4 mg IV', min: 2, run: s => s.benzo('Lorazepam 4 mg IV', 0.5, 2 * 3600), on: () => false },
    { label: 'Midazolam 5 mg IV', min: 2, run: s => s.benzo('Midazolam 5 mg IV', 0.6, 40 * 60), on: () => false },
    { label: 'Midazolam 10 mg IM', min: 4, run: s => s.benzo('Midazolam 10 mg IM', 0.55, 60 * 60), on: () => false },
    { label: 'Diazepam 10 mg IV', min: 2, run: s => s.benzo('Diazepam 10 mg IV', 0.5, 60 * 60), on: () => false },
  ], note: 'First line for a generalised seizure (80% terminate per dose, repeat once). Sedation and respiratory depression follow; a seizure self-terminates at 5 min if untreated.' },
  { id: 'sedate', type: 'buttons', group: 'Drugs', label: 'Procedural sedation', opts: [
    { label: 'Ketamine 0.5 mg/kg', min: 2, run: s => { s.e.bolus('ketamine', 0.5, 900, 30); s.e.flags.agitated = false; s.log(`Ketamine ${Math.round(0.5 * s.wt)} mg IV for sedation (cardioversion / pacing)`); }, on: () => false },
    { label: 'Midazolam 2 mg', min: 2, run: s => { s.e.bolus('sedation', 0.35, 1800, 90); s.e.flags.agitated = false; s.log('Midazolam 2 mg IV'); }, on: () => false },
    { label: 'Propofol 0.5 mg/kg', min: 2, run: s => { s.e.bolus('propofol', 0.5, 480, 20); s.e.flags.agitated = false; s.log(`Propofol ${Math.round(0.5 * s.wt)} mg IV for sedation`); }, on: () => false },
  ], note: 'Before cardioversion or pacing. Ketamine keeps the pressure; midazolam drops it a little; propofol drops it a lot in shock.' },
  slider('sedation', 'Drugs', 'Propofol sedation', 'mg/h', '1% (10 mg/ml)', 0, 300, 50, 3, 'sedation', 300, 600, (s, v) => `${(v / 10).toFixed(0)} ml/h`, 'Only once intubated. Vasodilation and myocardial depression at higher rates.'),

  { id: 'artline', type: 'buttons', group: 'Lines and monitoring', label: 'Arterial line', opts: [{ label: 'Radial', min: 5, run: s => { s.e.devices.artline = true; s.log('Arterial line sited'); }, on: s => s.e.devices.artline }] },
  { id: 'cvc', type: 'buttons', group: 'Lines and monitoring', label: 'Central line', opts: [{ label: 'IJ CVC', min: 15, run: s => { s.e.devices.cvc = true; s.log('CVC sited, CVP transduced'); }, on: s => s.e.devices.cvc }] },
  { id: 'nibp', type: 'buttons', group: 'Lines and monitoring', label: 'NIBP now', opts: [{ label: 'Cycle', min: 1, run: s => s.nibp(), on: () => false }] },
  { id: 'catheter', type: 'buttons', group: 'Lines and monitoring', label: 'Urinary catheter', opts: [{ label: 'Insert', min: 5, run: s => { s.e.devices.catheter = true; s.log('Catheter in, hourly urine measured'); }, on: s => !!s.e.devices.catheter }] },

  { id: 'ecg12', type: 'buttons', group: 'Investigations', label: '12 lead ECG', opts: [{ label: 'Acquire', min: 2, run: s => s.acquireEcg(), on: () => false }, { label: 'V4R / posterior', min: 2, run: s => s.acquireEcg(true), on: () => false }] },
  { id: 'abg', type: 'buttons', group: 'Investigations', label: 'Blood gas', opts: [{ label: 'Arterial', min: 3, run: s => s.acquireAbg(false), on: () => false }, { label: 'Venous', min: 2, run: s => s.acquireAbg(true), on: () => false }] },
  { id: 'echo', type: 'buttons', group: 'Investigations', label: 'Bedside echo', opts: [{ label: 'Scan', min: 5, run: s => s.acquireEcho(), on: s => s.echoDone }] },
  { id: 'cxr', type: 'buttons', group: 'Investigations', label: 'Portable CXR', opts: [{ label: 'Request', min: 10, run: s => s.cxr(), on: s => !!s.e.flags.cxr }] },
  { id: 'bloods', type: 'buttons', group: 'Investigations', label: 'Bloods', opts: [{ label: 'Send', min: 2, run: s => s.bloods(), on: s => !!s.e.flags.bloods }] },

  { id: 'tcp', type: 'radio', group: 'Electrical', label: 'Transcutaneous pacing', opts: [
    { label: 'Off', min: 1, run: s => s.stopPacing(), on: s => !s.e.devices.pacing },
    { label: '70 mA, 80/min', min: 3, run: s => s.pace(70, 80), on: s => !!s.e.devices.pacing && s.e.devices.pacing.mA === 70 },
    { label: '100 mA, 80/min', min: 3, run: s => s.pace(100, 80), on: s => !!s.e.devices.pacing && s.e.devices.pacing.mA === 100 },
    { label: 'Transvenous wire 80/min', min: 20, run: s => s.pace('tvp', 80), on: s => !!s.e.devices.pacing && s.e.devices.pacing.mA === 'tvp' },
  ], note: 'Lit only with mechanical capture. AP pads, confirm capture on pulse / art trace, sedate (ketamine 0.25 mg/kg). Transvenous wire: Ysbyty Gwynedd cardiology can place one once at the bedside (call local cardiology).' },
  { id: 'shock', type: 'buttons', group: 'Electrical', label: 'DC shock', opts: [
    { label: '150 J synchronised', min: 2, run: s => s.shock(true), on: () => false },
    { label: '200 J unsynchronised', min: 1, run: s => s.shock(false), on: () => false },
  ] },
  { id: 'cpr', type: 'radio', group: 'Electrical', label: 'CPR', opts: [
    { label: 'Off (rhythm check)', min: 0.5, run: s => s.cpr(false), on: s => !s.e.devices.cpr },
    { label: 'On, 2 min cycle', min: 2, run: s => s.cpr(true), on: s => s.e.devices.cpr },
  ], note: 'On runs a 2 minute cycle of compressions; Off is the rhythm check (ROSC chance depends on rhythm, adrenaline and oxygenation).' },
  { id: 'iabp', type: 'buttons', group: 'Devices', label: 'IABP', opts: [{ label: 'Insert (as at Glan Clwyd)', min: 20, run: s => s.iabp(), on: s => s.e.devices.iabp }], note: 'Not available at Ysbyty Gwynedd; Glan Clwyd places them. Use to show the room what it would do. Augments CO 0.5-1 L/min, cuts afterload; reasonable in acute MR / VSD.' },

  { id: 'call', type: 'buttons', group: 'Calls', label: 'Calls', opts: [
    { label: 'Ysbyty Gwynedd cardiology', min: 3, run: s => s.call('cardio'), on: s => !!s.e.flags.cardioCalled },
    { label: 'Glan Clwyd PCI', min: 3, run: s => s.call('pci'), on: s => !!s.e.flags.pciCalled },
    { label: 'Liverpool Heart and Chest', min: 3, run: s => s.call('surgery'), on: s => !!s.e.flags.surgeryCalled },
    { label: 'Critical care transfer (EMRTS)', min: 3, run: s => s.call('retrieval'), on: s => !!s.e.flags.retrievalCalled },
    { label: 'Anaesthetist / ICU', min: 2, run: s => s.call('anaes'), on: s => !!s.e.flags.anaesCalled },
  ] },
  { id: 'wait', type: 'buttons', group: 'Time', label: 'Wait', opts: [
    { label: '+2 min', min: 2, run: s => {}, on: () => false }, { label: '+5 min', min: 5, run: s => {}, on: () => false }, { label: '+10 min', min: 10, run: s => {}, on: () => false },
  ] },
];
