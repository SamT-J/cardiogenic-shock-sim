/* Scenario definitions: patient, engine knobs, ECG morphology, echo assets, script and events.
   Event `when(sim)` is evaluated each patient-second; `countdown` (s) shows in the control panel and can be cancelled. */

const CREDIT_POCUS = 'The POCUS Atlas, CC BY-NC 4.0';
const LUNG_B = { id: 'lung', label: 'Lung', asset: 'lung_blines.gif', caption: 'Anterior chest: confluent B lines (interstitial / alveolar oedema)', credit: CREDIT_POCUS };
const LUNG_A = { id: 'lung', label: 'Lung', asset: 'lung_alines.gif', caption: 'Anterior chest: A lines, lung sliding, no B lines (dry lungs)', credit: CREDIT_POCUS };
const NORMALS = [
  { id: 'na4c', label: 'Normal A4C (ref)', asset: 'normal_a4c.gif', caption: 'Reference: normal apical 4-chamber', credit: CREDIT_POCUS },
  { id: 'nplax', label: 'Normal PLAX (ref)', asset: 'normal_plax.gif', caption: 'Reference: normal parasternal long axis', credit: CREDIT_POCUS },
];
const INF_ST = { II: 2, III: 3, aVF: 2.5, aVL: -1.5, I: -1 };
const pct = x => Math.round(x * 100) + '%';
const f1 = x => (Math.round(x * 10) / 10).toFixed(1);

const SCENARIOS = [
  // ------------------------------------------------------------------ 1
  {
    id: 'pmr', name: '1. Inferior MI day 3: papillary muscle rupture',
    headline: '72-year-old woman, sudden breathlessness, "indigestion" 3 days ago',
    patient: { name: 'Margaret Hale', age: 72, sex: 'F', wt: 68 }, clock0: 10 * 3600 + 20 * 60,
    engine: { params: { wt: 68, BSA: 1.7, Hb: 12.5 }, lactate0: 4.5, pco2_0: 3.9,
      k: { eesLv: 0.65, lam_lv_mul: 1.35, eroa: 0.85, territory: 'lv', patency: 0.45, hrBase: 118, venousShift: 170, reflexGain: 0.3, rrBase: 20, gcsBase: 14, baseDeficit: 7, temp: 36.4, glucose: 11.8, K: 4.9, creat: 118 } },
    start: { fio2: 0.85, o2label: '15 L NRB' },
    ecg: { st: { II: 1, III: 1.2, aVF: 1, V1: -1.5, V2: -2, V3: -1.5 }, q: { II: -0.25, III: -0.35, aVF: -0.3 }, tall_t: { V1: 0.3, V2: 0.4 }, pr: 0.17, axis: '+75', text: 'Sinus tachycardia 118. Q waves II, III, aVF with residual 1 mm ST elevation. ST depression V1-V3 with tall R and upright T (posterior extension). No new conduction block.' },
    history: {
      pc: 'Sudden severe breathlessness for 40 minutes, frothy pink sputum, brought in by ambulance.',
      hpc: ['Three days ago: 2 hours of "indigestion" and sweating at home, settled, did not call anyone.', 'Tired since, this morning woke acutely breathless, could not lie flat.', 'No chest pain now. No palpitations, no syncope.'],
      pmh: ['Hypertension', 'Hypercholesterolaemia', 'Osteoarthritis', 'Smoker, 30 pack-years'],
      dh: ['Amlodipine 10 mg', 'Atorvastatin 20 mg', 'Co-codamol prn', 'NKDA'],
      sh: ['Lives with husband, independent, walks 2 miles', 'Full escalation appropriate'],
      baseline: 'Fully independent, walks 2 miles daily, drives, no carers. Clinical Frailty Scale 3',
      exam: ['Sitting bolt upright, distressed, grey and sweaty, cool mottled legs, CRT 4 s', 'JVP 5 cm, crackles to both apices, pink frothy sputum', 'Heart sounds: tachycardic, no obvious murmur (noisy chest)', 'Abdomen soft, no oedema', 'Urine: none since arrival'],
      ambulance: ['SpO2 78% on air, 86% on 15 L', 'BP 92/60, HR 120 sinus', 'GTN withheld (hypotensive), no aspirin given', '12 lead: "old inferior changes?"'],
      bloods: [ 'Glucose 11.8', 'ECG and ABG on arrival as shown'],
    },
    echo: {
      views: [
        { id: 'a4c', label: 'Apical / PLAX 2D', asset: 'pmr_flail_2d.mp4', caption: 'Flail mitral leaflet with mobile ruptured papillary head prolapsing into the LA; hyperdynamic LV', credit: 'Clin Case Rep 2025, CC BY 4.0' },
        { id: 'col', label: 'Colour Doppler', asset: 'pmr_mr_colour.mp4', caption: 'Severe eccentric mitral regurgitation, jet hugging the atrial wall', credit: 'Clin Case Rep 2025, CC BY 4.0' },
        LUNG_B, ...NORMALS],
      findings: o => ['Flail posterior mitral leaflet, mobile mass attached (ruptured posteromedial papillary head)', `Severe eccentric MR, regurgitant fraction about ${pct(o.rf)}`, `LV small and hyperdynamic, LVEF ${pct(o.efLv)}; inferoposterior wall akinetic`, 'Dilated LA, no pericardial effusion', 'RV normal size and function', 'Lungs: confluent bilateral B lines'],
      measures: o => [['LVEF', pct(o.efLv)], ['LVEDV', Math.round(o.edvLv) + ' ml'], ['MR regurgitant fraction', pct(o.rf)], ['Estimated PCWP (E/e\')', Math.round(o.pcwp) + ' mmHg'], ['TAPSE', '21 mm'], ['IVC', o.cvp > 12 ? '2.3 cm, <50% collapse' : '1.9 cm, >50% collapse'], ['Pericardial effusion', 'None']],
    },
    script: {
      localCardiology: 'Sudden pulmonary oedema three days after an untreated inferior MI with a soft murmur: papillary muscle rupture until the echo says otherwise. Do not lyse. Wants the echo now, an inodilator rather than noradrenaline alone, CPAP, and Liverpool Heart and Chest called directly rather than Glan Clwyd',
      phases: [
        { title: 'Recognition', text: 'Acute pulmonary oedema and shock 3 days after an untreated inferior MI. A new mechanical complication until proven otherwise: papillary muscle rupture (soft or absent murmur because LA and LV pressures equalise), VSR (harsh murmur with thrill), free wall rupture (tamponade). The ECG shows an evolved inferoposterior MI. Lysis has no role at day 3.', prompts: ['What is the differential for sudden collapse days after an MI?', 'What do you want at the bedside in the next 5 minutes?', 'Does the absence of a loud murmur reassure you?'] },
        { title: 'Stabilise', text: 'Forward flow depends on reducing the regurgitant fraction: lower the afterload, keep the heart rate up, support contractility. Pure vasopressors raise SVR and push more blood backwards; fluid raises LA pressure and oedema without forward gain. CPAP buys time; intubation is likely but induction is dangerous.', prompts: ['Fluid bolus for hypotension?', 'Noradrenaline, dobutamine, or both?', 'CPAP or tube? Which induction agent and dose?'] },
        { title: 'Referral and transfer', text: 'Needs Liverpool Heart and Chest (cardiac surgery), not just the cath lab at Glan Clwyd. An IABP (reasonable in acute MR) can be placed at Glan Clwyd as a bridge, or she goes straight to Liverpool by air if she is holding. Operative mortality 20-25%; medical management alone about 50% dead at 24 h and 80% at a week.', prompts: ['Who do you call, and what do you ask for?', 'What does the retrieval team need from you before they arrive?'] },
      ],
      pointers: ['Mechanical complications present within 24 h of hospitalisation in most contemporary series, but classically day 2-7.', 'Posteromedial papillary muscle: single blood supply (PDA from RCA or dominant Cx), so inferior/posterior MI.', 'Giant v waves on the wedge trace; no O2 step-up (that is VSR).', 'IABP reduces afterload and regurgitant fraction; noradrenaline alone increases it.', 'Only about 40% of registry MR-shock patients were offered surgery.'],
      events: [
        { id: 'tiring', label: 'Patient tiring, SpO2 falling', at: 9 * 60, countdown: 60, when: s => !s.e.ventilated && !s.e.cpap, action: s => { s.e.k.shuntExtra += 0.08; s.e.k.rrBase += 6; s.banner('Patient exhausted, RR 40, SpO2 falling'); } },
        { id: 'resp_arrest', label: 'Respiratory arrest then PEA', countdown: 45, when: s => !s.e.ventilated && s.out.spo2 < 0.72 && s.sinceLow('spo2', 0.72) > 180, action: s => s.arrest('pea') },
        { id: 'arrest_map', label: 'PEA arrest (prolonged MAP < 45)', countdown: 60, when: s => s.out.map < 45 && s.sinceLow('map', 45) > 240 && s.perfusing(), action: s => s.arrest('pea') },
        { id: 'vf_norad', label: 'VF (ischaemic, high catecholamines)', countdown: 30, when: s => s.e.level('norad') > 0.45 && s.out.cpp < 25 && s.t > 15 * 60, action: s => s.arrest('vf') },
      ],
    },
    debrief: ['Sudden pulmonary oedema days after MI = mechanical complication until echo says otherwise.', 'Afterload reduction and inodilation beat fluids and vasopressors in acute MR.', 'Refer to cardiac surgery early; stabilise with IABP for transfer where available.'],
    optimal: [
      'Sit up, 15 L NRB then CPAP 10 within the first 5 minutes (keeps FiO2 at 0.85); this is the single biggest early gain.',
      'Arterial line and a bedside echo straight away: flail mitral leaflet with severe eccentric MR settles the diagnosis. No lysis at day 3.',
      'Calls in this order: Liverpool Heart and Chest directly (surgical case), critical care transfer, Ysbyty Gwynedd cardiology for a formal echo, anaesthetist.',
      'Dobutamine 5 then 10 mcg/kg/min (inodilator). Noradrenaline only as a bridge at 0.05 to 0.1 if MAP falls under 60; it raises the regurgitant fraction.',
      'GTN infusion 1 to 2 mg/h once MAP holds at 65 or above: afterload reduction cuts the regurgitant fraction and the wedge.',
      'No fluid, no morphine, no diuretic for the pressure. Aspirin 300 if not already given; hold P2Y12 loading pending the surgical decision.',
      'Catheter, repeat ABG at 30 minutes, keep the MAP target modest (60 to 65).',
      'Intubate before transfer if SpO2 stays under 90 on CPAP or she tires: ketamine 0.5 mg/kg with a pressor running, VC 6 ml/kg, PEEP 10, FiO2 1.0 then wean.',
      'Route: via Glan Clwyd for an IABP bridge if she cannot hold a MAP of 60 on inodilator alone; otherwise direct to Liverpool by air. Candid prognosis conversation with the family.',
    ],
  },
  // ------------------------------------------------------------------ 2
  {
    id: 'rvi', name: '2. Inferior STEMI with RV infarction',
    headline: '58-year-old man, 2 hours of chest pain, hypotensive after GTN',
    patient: { name: 'David Okafor', age: 58, sex: 'M', wt: 92 }, clock0: 21 * 3600 + 5 * 60,
    engine: { params: { wt: 92, BSA: 2.1, Hb: 15 }, lactate0: 2.8, pco2_0: 4.8,
      k: { eesRv: 0.3, territory: 'rv', patency: 0.1, hrBase: 68, vagal: 20, hrReflexGain: 0, venousShift: 150, reflexGain: 0.3, pr: 0.22, rrBase: 16, baseDeficit: 5, temp: 36.6, glucose: 9.4, K: 4.3, creat: 95 } },
    start: { fio2: 0.21, o2label: 'air' },
    ecg: { st: Object.assign({}, INF_ST, { V1: 1, V2: 0, V3: -0.5 }), pr: 0.22, axis: '+95', text: 'Sinus bradycardia 48, PR 220 ms. ST elevation III 3 mm > II 2 mm, aVF 2.5 mm; reciprocal depression I and aVL. ST elevation 1 mm in V1 with isoelectric V2. V4R (if recorded): ST elevation 1.5 mm.',
      v4r: { st: { II: 2, III: 3, aVF: 2.5, aVL: -1.5, I: -1, V1: 1, V2: 0, V3: -0.5, V4: 1.5, V5: 1.2, V6: 0.8 }, text: 'Right-sided leads V3R-V6R: ST elevation 1.5 mm in V4R.' } },
    history: {
      pc: 'Central crushing chest pain for 2 hours, nausea, vomited twice.',
      hpc: ['Pain started at rest watching television, radiates to the jaw.', 'Ambulance: aspirin 300 mg, one GTN spray: BP fell from 118/70 to 88/56, felt faint, vomited.', 'Arrived pale, nauseated, "feels like I am going to pass out".'],
      pmh: ['Type 2 diabetes (metformin)', 'Hypertension', 'Smoker, 20/day'],
      dh: ['Metformin 1 g bd', 'Ramipril 5 mg', 'NKDA'],
      sh: ['Lorry driver, lives alone', 'Full escalation'],
      baseline: 'Working full time, no exercise limitation, no carers. Clinical Frailty Scale 2',
      exam: ['Pale, cool peripheries, CRT 3 s, nauseated', 'JVP 8 cm, rises on inspiration', 'Chest clear, no crackles', 'Heart sounds normal, no murmur', 'No oedema. Catheter: 10 ml in the bag'],
      ambulance: ['HR 52, BP 118/70 then 88/56 after GTN', 'SpO2 96% air', 'Pre-alert as inferior STEMI to Ysbyty Gwynedd (no cath lab). Glan Clwyd (PCI, IABP) 55 min by road'],
      bloods: [ 'Glucose 9.4'],
    },
    echo: {
      views: [
        { id: 'a4c', label: 'Apical 4-chamber', asset: 'rvi_a4c_mcconnell.gif', caption: 'Dilated right ventricle with free wall akinesis (RCA occlusion), RV larger than LV', credit: CREDIT_POCUS },
        { id: 'ivc', label: 'Subcostal IVC', asset: 'ivc_plethoric.gif', caption: 'Plethoric IVC, no respiratory collapse', credit: CREDIT_POCUS },
        LUNG_A, ...NORMALS],
      findings: o => [`Dilated, poorly contracting RV free wall; RV:LV ratio ${o.edvRv > 185 ? '>1.2' : '>1'}`, 'Septal flattening in diastole (D-shaped LV)', `Inferior wall hypokinesis; LVEF ${pct(o.efLv)} otherwise preserved`, `IVC ${o.cvp > 12 ? 'plethoric, no collapse' : 'dilated, <50% collapse'}`, 'No pericardial effusion, no significant MR', 'Lungs: A lines, dry'],
      measures: o => [['LVEF', pct(o.efLv)], ['RV basal diameter', (3.6 + 0.012 * (o.edvRv - 160)).toFixed(1) + ' cm'], ['TAPSE', Math.round(9 + 12 * o.efRv).toString() + ' mm'], ['IVC', o.cvp > 12 ? '2.5 cm, <20% collapse' : '2.2 cm, <50% collapse'], ['Estimated RAP', Math.round(o.cvp) + ' mmHg'], ['Estimated PCWP (E/e\')', Math.round(o.pcwp) + ' mmHg']],
    },
    script: {
      localCardiology: 'Inferior STEMI with hypotension and clear lungs: record V4R, stop nitrates, give measured fluid and watch the JVP, atropine for the bradycardia, dobutamine if still low output. Lyse now if Glan Clwyd cannot get a wire in within 120 minutes; call them regardless. We can put a temporary wire in here if he blocks',
      phases: [
        { title: 'Recognition', text: 'Inferior STEMI with hypotension, raised JVP and clear lungs: RV infarction until proven otherwise. III > II, ST elevation in V1 with a flat V2, and the collapse after GTN all point the same way. Record V4R now.', prompts: ['What does the triad hypotension / raised JVP / clear chest mean here?', 'Which extra leads do you record, and what are you looking for?', 'Why did GTN do this?'] },
        { title: 'Resuscitate', text: 'The RV is preload dependent and the LV is under-filled. Stop nitrates, opiates and diuretics. Give measured fluid (250-500 ml) and reassess JVP and BP each time: beyond a CVP of about 15 the RV dilates, the septum shifts and LV filling falls. Bradycardia and AV block are common (Bezold-Jarisch, vagal, ischaemic node): atropine first, pacing if needed, AV synchrony matters. Dobutamine if output stays low after filling; noradrenaline to keep the MAP up while you do all this.', prompts: ['How much fluid, and when do you stop?', 'The HR is 45 and he is hypotensive: atropine, pacing, or both?', 'Inotrope choice?'] },
        { title: 'Reperfusion and transfer', text: 'Ysbyty Gwynedd has no cath lab: can he be on the table at Glan Clwyd within 120 minutes of diagnosis? If not, lyse (no contraindication; shock is not one) and transfer anyway. RV recovery after reperfusion is often dramatic.', prompts: ['Lyse or drive? What is the clock?', 'What do you hand over to the retrieval team?'] },
      ],
      pointers: ['RV involvement in 30-50% of inferior MI; haemodynamically significant in about half.', 'V4R ST elevation >= 1 mm: sensitivity 88%, specificity 78%.', 'Nitrate-induced SBP fall >30 mmHg: 75% of those had RV involvement (Ferguson).', 'Dell\'Italia: volume raised RAP 11 to 15 but CI only 1.9 to 2.1; dobutamine 2.0 to 2.7.', 'AV sequential pacing in RVI with AV block: SBP 88 to 133 (Love).'],
      events: [
        { id: 'chb', label: 'Complete heart block, escape 40', at: 12 * 60, countdown: 45, when: s => s.e.k.patency < 0.6 && s.e.k.rhythm === 'sinus', action: s => { s.e.k.rhythm = 'chb'; s.e.k.escapeRate = 40; s.e.k.atrialRate = 85; s.e.k.broadEscape = false; s.banner('Complete heart block, ventricular rate 40'); } },
        { id: 'vf', label: 'VF (prolonged hypotension)', countdown: 45, when: s => s.out.map < 42 && s.sinceLow('map', 42) > 180 && s.perfusing(), action: s => s.arrest('vf') },
        { id: 'reperf', label: 'Reperfusion: AIVR, block resolving', countdown: 30, when: s => s.e.k.patency > 0.7 && (s.e.k.rhythm === 'chb' || s.e.k.rhythm === 'paced'), action: s => { s.restoreSinus(); s.e.k.vagal = 6; s.e.k.ectopy = 0.1; s.banner('Accelerated idioventricular rhythm then sinus: reperfusion' + (s.e.k.rhythm === 'paced' ? ' (underlying rhythm now sinus, pacing can stop)' : '')); } },
      ],
      onIntervention: (s, id) => {
        if (id === 'gtn_sl' || id === 'gtn_inf' || id === 'morphine' || id === 'furosemide') { s.e.k.vagal += 10; s.e.k.venousShift -= 120; s.later(15 * 60, () => { s.e.k.vagal -= 10; s.e.k.venousShift += 120; }); s.log('Vagal response: bradycardia and venodilation'); }
      },
    },
    debrief: ['Inferior STEMI + hypotension + clear lungs: record V4R, withhold nitrates.', 'Fluid in measured boluses with reassessment; stop when the JVP climbs without a BP response.', 'Rate and AV synchrony matter; dobutamine when filling is not enough.', 'Reperfusion is the real treatment: lysis if PCI cannot happen within 120 minutes.'],
    optimal: [
      'Stop nitrates; no morphine, no diuretic. Lie him flat, 12 lead with V4R (ST elevation in V4R clinches it).',
      'Aspirin already given; ticagrelor 180 and heparin 5000 U now (confirm choice with Glan Clwyd).',
      'Fluid 250 to 500 ml, reassess JVP and BP, repeat once. Stop when the JVP climbs without a BP rise (CVP about 15): the RV is already on the flat part of its curve.',
      'Atropine 500 mcg (repeat to 3 mg) for the vagal bradycardia. If he blocks: transcutaneous pacing at 100 mA with ketamine 0.5 mg/kg, or a transvenous wire from Ysbyty Gwynedd cardiology, without delaying reperfusion.',
      'Dobutamine 5 mcg/kg/min if the index stays low after filling (Dell Italia: fluid 1.9 to 2.1, dobutamine 2.0 to 2.7). Noradrenaline 0.05 to 0.1 only to hold MAP 65 meanwhile.',
      'Call Glan Clwyd at once. Wire crossing within 120 minutes of diagnosis is marginal from Bangor (55 min road plus packaging): if not achievable, tenecteplase with clopidogrel 300 and enoxaparin 30 mg IV, then transfer anyway.',
      'Bedside echo to confirm the dilated akinetic RV and exclude tamponade and MR; ABG; catheter.',
      'Arterial line, critical care transfer with pressor and pacing pads on; reperfusion is the real treatment and RV recovery is often dramatic.',
    ],
  },
  // ------------------------------------------------------------------ 3
  {
    id: 'lvcs', name: '3. Anterior STEMI: cold-wet LV failure shock',
    headline: '64-year-old man, 3 hours of central chest pain',
    patient: { name: 'Tom Barrett', age: 64, sex: 'M', wt: 88 }, clock0: 14 * 3600 + 45 * 60,
    engine: { params: { wt: 88, BSA: 2.05, Hb: 14 }, lactate0: 5.8, pco2_0: 4.2,
      k: { eesLv: 0.28, lam_lv_mul: 1.0, territory: 'lv', patency: 0.05, hrBase: 118, venousShift: 80, reflexGain: 0.3, rrBase: 18, gcsBase: 14, baseDeficit: 7, temp: 35.8, glucose: 14.6, K: 5.1, creat: 132 } },
    start: { fio2: 0.85, o2label: '15 L NRB', catecholDepleted: true },
    ecg: { st: { V1: 3, V2: 5, V3: 6, V4: 5, V5: 3, V6: 1.5, I: 1.5, aVL: 2, aVR: 1, III: -2, aVF: -1.5 }, tall_t: { V2: 0.4, V3: 0.5 }, rbbb: true, pr: 0.16, axis: '-30', text: 'Sinus tachycardia 118. ST elevation V1-V5 (up to 6 mm, tombstone), I and aVL, with ST elevation in aVR; reciprocal depression III and aVF. New RBBB. Proximal LAD occlusion.' },
    history: {
      pc: 'Central crushing chest pain for 3 hours, breathless, sweaty.',
      hpc: ['Pain started digging the garden, 10/10, radiating to left arm.', 'Called 999 after 2 hours. Aspirin 300 mg and GTN given by ambulance with little effect.', 'Increasingly breathless over the last hour, now cannot complete sentences.'],
      pmh: ['Type 2 diabetes (gliclazide, metformin)', 'Hypertension', 'Smoker, 40 pack-years', 'No previous cardiac history'],
      dh: ['Metformin', 'Gliclazide', 'Amlodipine', 'NKDA'],
      sh: ['Lives with wife, works as a builder', 'Full escalation'],
      baseline: 'Independent, gardens and walks the dog daily, drives. Clinical Frailty Scale 3',
      baseline: 'Works as a builder, climbs ladders, no exercise limitation. Clinical Frailty Scale 2',
      exam: ['Grey, clammy, mottled knees, CRT 5 s, cold to the elbows', 'JVP raised to the earlobes, crackles to mid-zones', 'Third heart sound, no murmur', 'Drowsy but rousable, oriented', 'No urine since arrival'],
      ambulance: ['BP 84/58, HR 120, SpO2 89% on 15 L', 'Pre-alert as anterior STEMI to Ysbyty Gwynedd (no cath lab). Glan Clwyd (PCI, IABP) 55 min by road'],
      bloods: [ 'Glucose 14.6, K 5.1', 'ABG on arrival shown'],
    },
    echo: {
      views: [
        { id: 'a4c', label: 'Apical 4-chamber', asset: 'ant_apical_akinesis.mp4', caption: 'Akinetic apex and distal septum with basal hypercontractility; large anterior infarct', credit: 'Cureus 2025, CC BY 4.0' },
        LUNG_B, ...NORMALS],
      findings: o => [`Severely impaired LV, LVEF ${pct(o.efLv)}; akinetic anteroseptal wall and apex, basal segments hyperkinetic`, 'No apical thrombus yet', 'Mild functional MR, no flail', 'RV mildly impaired, not dilated', `IVC ${o.cvp > 12 ? 'plethoric' : 'dilated with reduced collapse'}`, 'Lungs: confluent B lines bilaterally', 'No pericardial effusion'],
      measures: o => [['LVEF', pct(o.efLv)], ['LVEDV', Math.round(o.edvLv) + ' ml'], ['LVOT VTI', (8 + 14 * o.sv / 70).toFixed(0) + ' cm'], ['Estimated CO', f1(o.co) + ' L/min'], ['Estimated PCWP (E/e\')', Math.round(o.pcwp) + ' mmHg'], ['TAPSE', Math.round(10 + 11 * o.efRv) + ' mm'], ['IVC', o.cvp > 12 ? '2.4 cm, <20% collapse' : '2.1 cm, <50% collapse']],
    },
    script: {
      localCardiology: 'Proximal LAD occlusion with cardiogenic shock. Noradrenaline to a MAP of 65 first, dobutamine second, no fluid for a wedge like that. Lyse if wire crossing within 120 minutes is impossible, and ask Glan Clwyd about an IABP or Impella on arrival. CCU here can run dobutamine but this needs Glan Clwyd now. Intubate only with a pressor running',
      phases: [
        { title: 'Recognition and staging', text: 'Classic cold-wet cardiogenic shock from a proximal LAD occlusion: SCAI stage C on arrival (lactate 5.8, MAP 65, oliguria, cold). Revascularisation is the only therapy that changes mortality; everything else buys time. You are 70 minutes from a cath lab: can the wire cross within 120 minutes of diagnosis?', prompts: ['What stage is he, and why does that matter for the conversation with the PCI centre?', 'Lyse now or load and go?', 'What kills him in the next hour?'] },
        { title: 'Support', text: 'Noradrenaline first to restore a perfusing MAP (coronary perfusion pressure = diastolic minus LVEDP), then dobutamine for output once the pressure is holding. Fluid is unlikely to help a wedge of 26. CPAP reduces work of breathing and LV afterload. If he needs a tube: pressor running, reduced induction dose, be ready for PEA. Watch for VT.', prompts: ['First-line vasoactive, and your MAP target?', 'He is tiring: CPAP or RSI? Which agent?', 'A run of VT at 170 with a pressure of 60: what now?'] },
        { title: 'Escalation and transfer', text: 'Mechanical support: IABP-SHOCK II negative, ECLS-SHOCK negative, DanGer Shock positive for Impella CP in STEMI shock (with a cost in bleeding and renal failure). The decision belongs to the shock centre; your job is a timely referral and a safe transfer with pressors running and arrest drugs drawn up.', prompts: ['Who decides on MCS, and what information do they need?', 'What are the transfer risks and how do you mitigate them?'] },
      ],
      pointers: ['SCAI hospital mortality: B 7%, C 12%, D 40%, E 67%.', 'MAP target 65 is extrapolated; titrate to lactate, urine and mentation.', 'Dopamine: more arrhythmia and worse outcome in the SOAP II CS subgroup. Adrenaline: more refractory shock than noradrenaline (OptimaCC).', 'Post-intubation hypotension in 1 in 4 ED intubations; shock index is the strongest predictor.', 'ESC: if PCI is not possible within 120 min, fibrinolysis then transfer, after echo excludes a mechanical complication.'],
      events: [
        { id: 'vt', label: 'Monomorphic VT 170 (pulsed)', at: 9 * 60, countdown: 45, when: s => s.e.k.rhythm === 'sinus', action: s => { s.e.k.rhythm = 'vt'; s.e.k.vtRate = 170; s.banner('Broad complex tachycardia 170'); } },
        { id: 'vt_to_vf', label: 'VT degenerates to VF', countdown: 90, when: s => s.e.k.rhythm === 'vt' && s.sinceRhythm('vt') > 150, action: s => s.arrest('vf') },
        { id: 'pea', label: 'PEA arrest (prolonged MAP < 45)', countdown: 60, when: s => s.out.map < 45 && s.sinceLow('map', 45) > 300 && s.perfusing() && s.e.k.rhythm !== 'vt', action: s => s.arrest('pea') },
        { id: 'tiring', label: 'Exhaustion: hypercapnia, drowsy', at: 14 * 60, countdown: 60, when: s => !s.e.ventilated && !s.e.cpap, action: s => { s.e.k.rrBase += 4; s.e.k.shuntExtra += 0.08; s.banner('Tiring: shallow breathing, SpO2 falling'); } },
      ],
    },
    debrief: ['Stage the shock, name it to the receiving team, and start the transfer clock immediately.', 'Noradrenaline for pressure, then dobutamine for flow; avoid fluid-loading a congested LV.', 'Intubation in shock is a resuscitation, not an airway procedure.', 'Reperfusion within 120 minutes or lysis after echo.'],
    optimal: [
      '15 L NRB, then CPAP 5 to 10 once he is tiring or SpO2 is under 92; it also cuts LV afterload.',
      '12 lead, ABG and bedside echo inside 10 minutes: echo excludes a mechanical complication before any lysis decision.',
      'Aspirin 300 given; ticagrelor 180 and heparin 5000 U.',
      'Call Glan Clwyd immediately (shock means immediate transfer regardless of time from onset), critical care transfer, Ysbyty Gwynedd cardiology, anaesthetist.',
      'Noradrenaline 0.1 then 0.2 mcg/kg/min to a MAP of 65 (peripherally to start); arterial line; central line when it does not delay anything.',
      'Dobutamine 2.5 to 5 once the pressure holds. No fluid for a wedge of 33. Catheter; repeat lactate at 60 minutes.',
      'Lysis only if wire crossing within 120 minutes is impossible: from Bangor that usually means load and go, lyse if the transfer stalls.',
      'VT at 9 minutes: with a pulse, ketamine 0.5 mg/kg then synchronised 150 J, amiodarone 300 mg after; pulseless, unsynchronised 200 J and CPR.',
      'Intubate if SpO2 is under 90 on CPAP, RR over 35 or GCS falls: pressor running first, ketamine 0.5 mg/kg, VC 6 ml/kg, PEEP 8, FiO2 1.0 then wean to 94 to 98%.',
      'Hand over SCAI stage, lactate trend and pressor doses; ask Glan Clwyd about an IABP or Impella on arrival (DanGer Shock population). Transfer by road with arrest drugs drawn up.',
    ],
  },
  // ------------------------------------------------------------------ 4
  {
    id: 'chb', name: '4. Inferior STEMI with complete heart block',
    headline: '71-year-old woman, chest pain and presyncope, heart rate 38',
    patient: { name: 'Joan Whitfield', age: 71, sex: 'F', wt: 70 }, clock0: 6 * 3600 + 50 * 60,
    engine: { params: { wt: 70, BSA: 1.75, Hb: 13 }, lactate0: 2.8, pco2_0: 4.8,
      k: { rhythm: 'chb', escapeRate: 38, atrialRate: 92, broadEscape: false, eesLv: 0.8, territory: 'lv', patency: 0.1, hrBase: 90, venousShift: 150, reflexGain: 0.3, rrBase: 18, baseDeficit: 5, temp: 36.5, glucose: 8.2, K: 4.6, creat: 88 } },
    start: { fio2: 0.21, o2label: 'air' },
    ecg: { st: Object.assign({}, INF_ST, { V1: -1, V2: -1.5, V3: -1 }), tall_t: { V2: 0.3 }, axis: '+90', text: 'Complete heart block: P rate 92, narrow junctional escape 38, AV dissociation. ST elevation II 2 mm, III 3 mm, aVF 2.5 mm; reciprocal depression aVL and I; ST depression V1-V3 (posterior involvement).' },
    history: {
      pc: 'Chest tightness for 90 minutes, two episodes of near-fainting on standing.',
      hpc: ['Woke at 05:15 with central chest tightness and nausea.', 'Husband called 999 when she nearly collapsed walking to the bathroom.', 'Ambulance: aspirin 300 mg, no GTN (bradycardic), pads on.'],
      pmh: ['Hypertension', 'Hypothyroidism', 'Previous TIA 2019 (on clopidogrel)'],
      dh: ['Bisoprolol 2.5 mg', 'Ramipril 10 mg', 'Clopidogrel 75 mg', 'Levothyroxine 100 mcg', 'Allergy: penicillin (rash)'],
      sh: ['Independent, retired teacher', 'Full escalation'],
      exam: ['Pale, cool hands, CRT 3 s, lightheaded lying flat', 'Cannon a waves in the neck, JVP 4 cm', 'Chest clear', 'Heart sounds: slow, variable first heart sound, no murmur', 'Urine: 20 ml in the first hour'],
      ambulance: ['HR 36-40, BP 82/48', 'SpO2 95% air', 'Pre-alert as inferior STEMI with CHB to Ysbyty Gwynedd. Glan Clwyd (PCI) 55 min by road; cardiology here can pace'],
      bloods: [ 'K 4.6, glucose 8.2'],
    },
    echo: {
      views: [
        { id: 'plax', label: 'Parasternal long axis', asset: 'inf_hypokinesis.gif', caption: 'Inferior wall hypokinesis (RCA territory), otherwise preserved LV function; slow rate', credit: CREDIT_POCUS },
        LUNG_A, ...NORMALS],
      findings: o => [`Inferior wall akinesis, LVEF ${pct(o.efLv)}, otherwise preserved`, 'RV normal size, mildly reduced free wall motion', 'No MR beyond trivial, no VSD jet, no effusion', 'Slow ventricular rate with intermittent atrial contraction against closed AV valves', `IVC ${o.cvp > 10 ? 'dilated' : 'normal, >50% collapse'}`, 'Lungs: A lines'],
      measures: o => [['LVEF', pct(o.efLv)], ['LVOT VTI', (8 + 14 * o.sv / 70).toFixed(0) + ' cm (large stroke volume, slow rate)'], ['Estimated CO', f1(o.co) + ' L/min'], ['TAPSE', Math.round(12 + 10 * o.efRv) + ' mm'], ['IVC', o.cvp > 10 ? '2.2 cm, <50% collapse' : '1.8 cm, >50% collapse'], ['Pericardial effusion', 'None']],
    },
    script: {
      localCardiology: 'Inferior STEMI with narrow-complex complete heart block: nodal, usually vagal early, will often resolve with reperfusion. Atropine, then isoprenaline or external pacing with sedation; we can put a temporary wire in on CCU here but do not let that delay lysis or transfer. Check V4R',
      phases: [
        { title: 'Recognition', text: 'Bradycardic shock: CO = HR x SV and the SV is already maximal. Inferior MI with CHB is usually supra-Hisian (narrow escape, often vagal early, often resolves with reperfusion); a broad escape under 30 means infranodal block and a worse prognosis. She is on a beta-blocker. Check for RV involvement too.', prompts: ['Narrow or broad escape, and why does it change what you do?', 'What is contributing besides the infarct?', 'Is this patient a lysis candidate (previous TIA, clopidogrel)?'] },
        { title: 'Rate and rhythm', text: 'Atropine 500 mcg boluses to 3 mg help nodal block about half the time (complete response 28%, partial 20%). Isoprenaline is the drug for an escape that will not respond. Transcutaneous pacing: anteroposterior pads, threshold usually 50-100 mA, confirm mechanical capture with a pulse or art line, sedate. Do not delay reperfusion for a transvenous wire: pace externally and go.', prompts: ['Atropine, isoprenaline or straight to pacing?', 'How do you confirm capture?', 'What sedation for pacing in a hypotensive patient?'] },
        { title: 'Reperfusion and transfer', text: 'The block is ischaemic and reperfusion is the fix. Lysis contraindications: TIA within 6 months is relative, 2019 is not. If the 120-minute rule cannot be met, lyse and transfer paced.', prompts: ['Lyse, or go directly?', 'What happens to the block after reperfusion, and when?'] },
      ],
      pointers: ['CHB complicates 12-13% of inferior MI in the lytic era; half progress via Wenckebach.', 'TCP electrical capture overstates mechanical capture; check a pulse or arterial trace.', 'Isoprenaline 84% response vs dopamine 31% in unstable third-degree block (De Lazzari 2023).', 'Mortality with CHB 20% vs 4% without, largely through shock and VT/VF.'],
      events: [
        { id: 'slow', label: 'Escape slows to 30 and broadens', at: 10 * 60, countdown: 60, when: s => s.e.k.rhythm === 'chb' && s.e.k.patency < 0.6, action: s => { s.e.k.escapeRate = 30; s.e.k.broadEscape = true; s.banner('Escape rhythm 30, broad: infranodal'); } },
        { id: 'asys', label: 'Asystole (prolonged MAP < 40)', countdown: 45, when: s => s.out.map < 40 && s.sinceLow('map', 40) > 150 && s.perfusing(), action: s => s.arrest('asystole') },
        { id: 'reperf', label: 'Reperfusion: block resolves', countdown: 30, when: s => s.e.k.patency > 0.7 && (s.e.k.rhythm === 'chb' || s.e.k.rhythm === 'paced') && s.sincePatency() > 20 * 60, action: s => { s.restoreSinus(72); s.e.k.ectopy = 0.08; s.banner('Sinus rhythm restored after reperfusion' + (s.e.k.rhythm === 'paced' ? ' (underlying rhythm now sinus, pacing can stop)' : '')); } },
      ],
    },
    debrief: ['Bradycardic shock: treat the rate first, then the cause.', 'Narrow escape: atropine, isoprenaline, pace. Broad escape: pace.', 'External pacing with sedation is a bridge; do not wait for a transvenous wire before reperfusion.'],
    optimal: [
      'Pads on, 12 lead with V4R (half of these have RV involvement), aspirin already given.',
      'Atropine 500 mcg, repeat to 3 mg: narrow junctional escape in inferior MI is nodal and often responds.',
      'If partial response, isoprenaline 5 mcg/min; if not, transcutaneous pacing at 100 mA with ketamine 0.5 mg/kg, confirm mechanical capture on the pulse or art line.',
      'Ysbyty Gwynedd cardiology for a transvenous wire if capture is poor, but pace externally and go rather than wait for the wire.',
      'Ticagrelor 180 (prior TIA rules out prasugrel, not ticagrelor) and heparin 5000 U.',
      'Call Glan Clwyd: 55 minutes by road. If wire crossing within 120 minutes cannot be met, tenecteplase (TIA in 2019 is no contraindication) then transfer paced.',
      'Small fluid bolus (250 ml) only if RV involvement and still hypotensive once the rate is corrected; otherwise no fluid.',
      'Arterial line, ABG, catheter, critical care transfer with the pacing box. The block usually resolves within an hour of reperfusion.',
    ],
  },
  // ------------------------------------------------------------------ 5
  {
    id: 'rosc', name: '5. Post-arrest anterior MI: mixed vasodilatory shock',
    headline: '55-year-old man, VF arrest at the gym, ROSC after 18 minutes',
    patient: { name: 'Steve Lawson', age: 55, sex: 'M', wt: 95 }, clock0: 18 * 3600 + 32 * 60,
    engine: { params: { wt: 95, BSA: 2.15, Hb: 14.5 }, lactate0: 9, pco2_0: 6.5,
      k: { eesLv: 0.45, lam_lv_mul: 1.0, territory: 'lv', patency: 0.1, hrBase: 110, venousShift: -150, reflexGain: 0.3, comatose: true, temp: 35.2, baseDeficit: 1, shuntExtra: 0.12, rrBase: 14, glucose: 16, K: 3.6, creat: 110 } },
    start: { fio2: 1.0, o2label: 'BVM via i-gel', ventilatedByBag: true, Rs: 0.55, vent: { mode: 'VC', vt: 6, rr: 10, pinsp: 20 } },
    ecg: { st: { V1: 3, V2: 4, V3: 4, V4: 3, V5: 1.5, aVL: 1, III: -1.5, aVF: -1 }, tall_t: { V2: 0.3, V3: 0.3 }, pr: 0.16, axis: '-10', qtc: 480, text: 'Sinus tachycardia 110, ST elevation V1-V4 (3-4 mm) and aVL, reciprocal depression III and aVF, QTc 480 ms. Recorded 12 minutes after ROSC.' },
    history: {
      pc: 'Witnessed collapse on a treadmill; bystander CPR within 1 minute; VF, 2 shocks by ambulance; ROSC at 18 minutes.',
      hpc: ['Told friends he had "heartburn" for an hour before collapsing.', 'i-gel sited by paramedics, ventilated with BVM, no sedation.', 'Adrenaline 1 mg x1, amiodarone 300 mg given during the arrest.'],
      pmh: ['Nil known. Not under a GP.'],
      dh: ['None. Allergies unknown.'],
      sh: ['Fit, runs marathons. Wife on her way in.'],
      baseline: 'Marathon runner, no limitation whatsoever. Clinical Frailty Scale 1',
      exam: ['GCS 3, pupils 4 mm sluggish, no gag with the i-gel in situ', 'Warm peripheries, bounding pulse, wide pulse pressure, CRT 2 s', 'JVP not visible, bibasal crackles', 'Temp 35.2 tympanic', 'Occasional myoclonic jerks of the face'],
      ambulance: ['Post-ROSC: HR 110, BP 85/40, SpO2 99% on 15 L via i-gel', 'ETCO2 4.8 kPa', 'Brought to Ysbyty Gwynedd (nearest ED). Glan Clwyd (PCI) 55 min by road, 20 min by air'],
      bloods: ['VBG at 5 min post ROSC: pH 7.08, lactate 11', 'Glucose 16', 'K 3.6'],
    },
    echo: {
      views: [
        { id: 'a4c', label: 'Apical 4-chamber', asset: 'global_ef12.gif', caption: 'Global severe LV hypokinesis with dilated chambers (post-arrest stunning on an anterior infarct)', credit: CREDIT_POCUS },
        LUNG_B, ...NORMALS],
      findings: o => [`Globally impaired LV, LVEF ${pct(o.efLv)}, anteroseptal segments worst`, 'RV mildly impaired', 'No effusion, no mechanical complication', `IVC ${o.cvp > 10 ? 'dilated' : 'small, collapsing (vasodilated, under-filled)'}`, 'Lungs: B lines bilaterally (aspiration and oedema)'],
      measures: o => [['LVEF', pct(o.efLv)], ['LVOT VTI', (8 + 14 * o.sv / 70).toFixed(0) + ' cm'], ['Estimated CO', f1(o.co) + ' L/min'], ['SVR (if measured)', Math.round(o.svr) + ' dyn.s.cm-5'], ['IVC', o.cvp > 10 ? '2.1 cm' : '1.4 cm, >50% collapse'], ['Estimated PCWP (E/e\')', Math.round(o.pcwp) + ' mmHg']],
    },
    script: {
      localCardiology: 'Post-arrest with ST elevation: the destination is the cath lab regardless of neurology. Noradrenaline for the vasoplegia, measured fluid, avoid hyperoxia and hypocapnia, 12 lead again after 8 minutes, and discuss lysis with Glan Clwyd if transfer is slow (18 minutes of CPR is only a relative contraindication)',
      phases: [
        { title: 'Post-ROSC care', text: 'Airway first: an i-gel in a GCS 3 patient who will travel. RSI with a pressor running. Ventilate to SpO2 94-98 and PaCO2 4.5-6.0; avoid hyperoxia and hyperventilation. The 12 lead after 8 minutes shows a STEMI, so the destination is the cath lab regardless of neurology. Temperature: avoid fever, do not actively warm above 36.', prompts: ['Tube now or at the receiving centre?', 'Ventilation and oxygen targets after ROSC?', 'Does the early ECG change the plan?'] },
        { title: 'Shock phenotype', text: 'Low SVR (warm, wide pulse pressure, high SvO2) plus myocardial stunning: post-cardiac-arrest syndrome behaves like sepsis with a bad heart. Noradrenaline is first line; a measured fluid bolus is reasonable; dobutamine when the output is the limit. Lactate 9 and pH 7.15 are expected and should clear with perfusion.', prompts: ['Is this cardiogenic or vasodilatory, and how do you tell at the bedside?', 'MAP target and first drug?', 'Would you lyse him? Prolonged CPR was 18 minutes.'] },
        { title: 'Transfer and prognosis', text: 'COACT and TOMAHAWK showed no benefit from immediate angiography without ST elevation, but he has ST elevation: immediate transfer for PCI. No prognostication before 72 hours. Myocardial function usually recovers over 48-72 hours.', prompts: ['What do you tell his wife?', 'What goes in the transfer bag?'] },
      ],
      pointers: ['Post-ROSC ECG within 7 min: 18.5% false-positive STEMI vs 7% after 8 min (Baldi).', 'Myocardial dysfunction in up to 60% after arrest; CI 2.0 at 8 h recovering to 3.2 at 24 h (Laurent).', 'Noradrenaline weaned at a median of 75 h in post-arrest shock; lactate median 6.4.', 'TTM2: 33 degrees vs normothermia, no difference; avoid fever for 72 h.'],
      events: [
        { id: 'revf', label: 'Recurrent VF', at: 6 * 60, countdown: 30, when: s => s.e.k.rhythm === 'sinus', action: s => s.arrest('vf') },
        { id: 'seizure', label: 'Generalised seizure (myoclonus)', at: 13 * 60, countdown: 30, when: s => s.perfusing() && s.e.level('sedation') < 0.3 && s.e.level('propofol') < 0.3 && s.e.level('ketamine') < 0.3, action: s => s.seizure(true) },
        { id: 'pea', label: 'PEA arrest (prolonged MAP < 45)', countdown: 60, when: s => s.out.map < 45 && s.sinceLow('map', 45) > 300 && s.perfusing(), action: s => s.arrest('pea') },
      ],
    },
    debrief: ['Post-arrest shock is mixed: stunning plus vasoplegia. Noradrenaline first, measured fluid, then inotrope.', 'ROSC bundle: airway, oxygen and CO2 targets, MAP 65, glucose, temperature, 12 lead after 8 minutes.', 'STEMI after ROSC goes to the cath lab now; no neuroprognostication before 72 hours.'],
    optimal: [
      'RSI now: ketamine 1 mg/kg (0.5 if the pressure is marginal) with noradrenaline drawn up or running, rocuronium 1.2 mg/kg; VC 6 ml/kg, rate 16, PEEP 5, FiO2 1.0 then titrate to SpO2 94 to 98% and EtCO2 4.5 to 6.',
      'Arterial line and central line; noradrenaline 0.1 to 0.2 to a MAP of 65 to 70; one 500 ml bolus if PPV is high; dobutamine if the index stays under 2.2 after that.',
      'Repeat the 12 lead 8 minutes or more after ROSC: ST elevation stands, so Glan Clwyd now (20 minutes by air).',
      'ABG, glucose (insulin if over 10), potassium, lactate trend. Temperature: no active warming above 36, treat any fever; no neuroprognostication before 72 hours.',
      'Recurrent VF at 6 minutes: unsynchronised 200 J, CPR cycles, adrenaline 1 mg after the second shock, amiodarone 300 mg after the third.',
      'Seizure at 13 minutes: lorazepam 4 mg, repeat once, then propofol sedation infusion as the second line.',
      'Aspirin via the NG tube and heparin 5000 U; P2Y12 choice with Glan Clwyd (absorption is unreliable).',
      'Echo: global stunning versus a regional anterior wall; exclude tamponade and massive PE.',
      'Propofol 100 to 200 mg/h once the pressure allows; critical care transfer by air; family update that stresses the 48 to 72 hour timeline.',
    ],
  },
  // ------------------------------------------------------------------ 6
  {
    id: 'vsr', name: '6. Anterior MI day 4: ventricular septal rupture',
    headline: '76-year-old woman, 4 days after a late-presenting anterior MI, new murmur',
    patient: { name: 'Barbara Lennox', age: 76, sex: 'F', wt: 62 }, clock0: 2 * 3600 + 15 * 60,
    engine: { params: { wt: 62, BSA: 1.65, Hb: 11.8 }, lactate0: 4.0, pco2_0: 4.5,
      k: { eesLv: 0.45, lam_lv_mul: 1.0, vsdA: 0.9, territory: 'lv', patency: 0.2, hrBase: 115, venousShift: 110, reflexGain: 0.3, rbbb: true, rrBase: 18, baseDeficit: 6, temp: 37.2, glucose: 10.5, K: 4.2, creat: 140 } },
    start: { fio2: 0.5, o2label: '10 L mask' },
    ecg: { st: { V1: 2, V2: 2.5, V3: 2.5, V4: 2, aVL: 0.5 }, q: { V1: -0.3, V2: -0.5, V3: -0.5, V4: -0.4 }, tinv: { V5: true, V6: true, I: true, aVL: true }, rbbb: true, pr: 0.18, axis: '-20', text: 'Sinus tachycardia 115. Q waves V1-V4 with persistent 2-2.5 mm ST elevation (evolved anterior MI); T inversion I, aVL, V5-V6. New RBBB.' },
    history: {
      pc: 'Sudden breathlessness and collapse on the ward at 01:30; new loud murmur; brought to resus.',
      hpc: ['Day 4 of admission: presented 20 hours after onset of chest pain (outside the lysis window), managed medically as a late anterior STEMI, awaiting inpatient transfer for angiography.', 'Had been mobilising to the bathroom. Tonight: sudden dyspnoea, hypotension, a harsh new murmur noted by the night SHO.'],
      pmh: ['Hypertension', 'Chronic kidney disease stage 3', 'Osteoporosis', 'Never smoked'],
      dh: ['Aspirin 75 mg, clopidogrel 75 mg, atorvastatin 80 mg, fondaparinux 2.5 mg', 'Bisoprolol 1.25 mg (started day 2)', 'NKDA'],
      sh: ['Lives alone, independent; daughter lives nearby', 'Escalation: for full treatment, discussed on admission'],
      baseline: 'Independent at home, uses a stick outdoors, shops with her daughter. Clinical Frailty Scale 4',
      exam: ['Breathless at rest, cool peripheries, CRT 4 s', 'JVP raised to 7 cm', 'Harsh pansystolic murmur loudest at the left lower sternal edge with a palpable thrill, loud P2', 'Bibasal crackles', 'Urine 15 ml/h'],
      ambulance: ['Ward obs 2 hours earlier: HR 92, BP 118/70, SpO2 96% air'],
      bloods: ['Troponin day 1: 18,000 ng/L', 'Creatinine 140 (baseline 110)', 'Hb 11.8'],
    },
    echo: {
      views: [
        { id: 'plax', label: 'PLAX with colour', asset: 'vsr_plax_colour.gif', caption: 'Colour Doppler left-to-right jet across the interventricular septum after anterior STEMI', credit: CREDIT_POCUS },
        LUNG_B, ...NORMALS],
      findings: o => ['Apical septal defect about 1.5 cm with left-to-right colour jet in systole', `Qp:Qs approximately ${f1(o.qpqs)}`, `Anteroapical akinesis, LVEF ${pct(o.efLv)}`, 'RV dilated and volume overloaded', 'No mitral flail; mild functional MR', 'No pericardial effusion', 'Lungs: B lines'],
      measures: o => [['LVEF', pct(o.efLv)], ['Qp:Qs', f1(o.qpqs)], ['Defect size', '1.5 cm, apical'], ['RV basal diameter', (3.9 + 0.01 * (o.edvRv - 160)).toFixed(1) + ' cm'], ['Estimated PA systolic', Math.round(o.pap.s) + ' mmHg'], ['Estimated PCWP (E/e\')', Math.round(o.pcwp) + ' mmHg']],
    },
    script: {
      localCardiology: 'New harsh pansystolic murmur with a thrill on day four of an anterior MI: septal rupture. Echo to confirm, inodilator and afterload reduction if the pressure allows, no pure vasoconstrictors, no fluid; this needs Liverpool Heart and Chest, with an IABP at Glan Clwyd on the way if she is too unstable for the longer journey. Candid conversation with the family about mortality',
      phases: [
        { title: 'Recognition', text: 'A harsh new pansystolic murmur with a thrill days after an anterior MI is a septal rupture until echo says otherwise (papillary rupture is the soft-murmur cousin). Left-to-right shunt: the RV is volume loaded, the lungs get flooded, the systemic output falls. Oxygen step-up on a PA catheter distinguishes it from MR.', prompts: ['Murmur plus thrill plus shock: what is your differential?', 'How does the shunt physiology change what pressors do?'] },
        { title: 'Haemodynamics', text: 'Reduce systemic afterload where the pressure allows (GTN), support contractility (dobutamine or milrinone), and avoid pure vasoconstrictors, which raise the shunt fraction. IABP lowers the shunt and is used in over 80% of emergency repairs. Fluids worsen pulmonary oedema without helping systemic flow.', prompts: ['She is hypotensive: noradrenaline, dobutamine, or GTN?', 'Where does an IABP help, and who can bring one?'] },
        { title: 'Definitive care', text: 'Emergency surgery for refractory shock (operative mortality about 40%), delayed repair if she can be stabilised (lower operative mortality but survivor bias), percutaneous closure in selected cases. Medical management alone: 90%+ mortality. Transfer to a cardiac surgical centre.', prompts: ['What are the options and what would you recommend to her and her daughter?', 'What is the ceiling of care conversation here?'] },
      ],
      pointers: ['VSR: 0.2-0.3% of reperfused MI, 1-3% unreperfused; anterior 70%, median day 1 post lysis, day 3-5 unreperfused.', 'Risk factors: age, female, first MI, no collaterals, non-smoker (Crenshaw, GUSTO-I).', 'PA catheter: O2 step-up RA to PA >= 5%; Qp:Qs 2-3:1.', 'SHOCK registry VSR mortality 87% (surgical 81%, medical 96%).'],
      events: [
        { id: 'arrest_map', label: 'PEA arrest (prolonged MAP < 45)', countdown: 60, when: s => s.out.map < 45 && s.sinceLow('map', 45) > 300 && s.perfusing(), action: s => s.arrest('pea') },
        { id: 'vt', label: 'VT 160', at: 16 * 60, countdown: 45, when: s => s.e.k.rhythm === 'sinus', action: s => { s.e.k.rhythm = 'vt'; s.e.k.vtRate = 160; s.banner('Broad complex tachycardia 160'); } },
        { id: 'vt_to_vf', label: 'VT degenerates to VF', countdown: 90, when: s => s.e.k.rhythm === 'vt' && s.sinceRhythm('vt') > 150, action: s => s.arrest('vf') },
      ],
    },
    debrief: ['New harsh murmur with thrill after MI: VSR; echo immediately.', 'Afterload reduction and inodilation; vasopressors increase the shunt.', 'IABP as a bridge, surgical centre referral, candid prognosis.'],
    optimal: [
      '15 L NRB, CPAP 5 to 10, arterial line; bedside echo shows the septal jet and the volume-loaded RV.',
      'Calls: Liverpool Heart and Chest directly, Glan Clwyd for an IABP bridge, critical care transfer, Ysbyty Gwynedd cardiology, anaesthetist.',
      'Dobutamine 5 to 10 mcg/kg/min (or milrinone 0.375); GTN 1 to 2 mg/h once MAP holds at 65 or above. Avoid noradrenaline unless MAP is under 55: it raises the shunt.',
      'No fluid; catheter; repeat ABG. Continue aspirin; hold clopidogrel and fondaparinux ahead of surgery; no lysis.',
      'Intubate before transfer if she deteriorates: ketamine 0.5 mg/kg with a pressor to hand, PEEP 8.',
      'Route: Glan Clwyd for IABP then Liverpool if unstable, direct to Liverpool if she holds. Operative mortality about 40%, medical alone over 90%: an early, candid conversation with her and her daughter.',
    ],
  },
];
