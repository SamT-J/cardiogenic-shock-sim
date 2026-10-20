// Headless engine check: node test/engine_test.js [normal|lvcs|rvi|pmr|vsr|chb|warm|arrest]
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Object, Array, Float32Array, JSON };
vm.createContext(ctx);
for (const f of ['wave.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
const E = vm.runInContext('Engine', ctx);
const fmt = o => `HR ${o.hr.toFixed(0)} BP ${o.sbp.toFixed(0)}/${o.dbp.toFixed(0)} (${o.map.toFixed(0)}) CO ${o.co.toFixed(1)} CI ${o.ci.toFixed(2)} SV ${o.sv.toFixed(0)} PCWP ${o.pcwp.toFixed(0)} CVP ${o.cvp.toFixed(0)} PAP ${o.pap.s.toFixed(0)}/${o.pap.d.toFixed(0)} SVR ${o.svr.toFixed(0)} EF ${(o.efLv * 100).toFixed(0)}% EDV ${o.edvLv.toFixed(0)} RVEDV ${o.edvRv.toFixed(0)} SpO2 ${(o.spo2 * 100).toFixed(0)} RR ${o.rr.toFixed(0)} pCO2 ${o.pco2.toFixed(1)} pH ${o.ph.toFixed(2)} lact ${o.lact.toFixed(1)} RF ${(o.rf * 100).toFixed(0)}% Qp:Qs ${o.qpqs.toFixed(1)} GCS ${o.gcs} CPP ${o.cpp.toFixed(0)} PI ${o.pi.toFixed(2)} ${o.stage}`;
const run = (name, sc, steps) => {
  const e = new E(); e.reset(sc);
  console.log(`\n== ${name}\n  t0                         ${fmt(e.compute())}`);
  for (const [label, fn, secs] of steps || []) { fn(e); e.step(secs); console.log(`  ${label.padEnd(26)} ${fmt(e.compute())}`); }
  return e;
};
const fluid = (ml, min) => e => e.infusing.push({ ml, rate: ml / (min * 60) });
const which = process.argv[2];
if (!which || which === 'normal') run('normal', {}, [['idle 10 min', e => {}, 600]]);
if (!which || which === 'lvcs') run('anterior LV CS', { k: { eesLv: 0.35, lam_lv_mul: 1.4, territory: 'lv', patency: 0.1, hrBase: 100, venousShift: 250, reflexGain: 0.3, baseDeficit: 4 }, lactate0: 4 }, [
  ['idle 10 min', e => {}, 600],
  ['norad 0.1', e => e.setInfusion('norad', 0.1), 300],
  ['norad 0.3', e => e.setInfusion('norad', 0.3), 300],
  ['+dobut 5', e => e.setInfusion('dobut', 5), 300],
  ['fluid 500', fluid(500, 10), 900],
  ['CPAP 10', e => { e.cpap = true; e.peep = 10; e.fio2 = 0.6; }, 600],
  ['GTN 2 mg/h', e => e.setInfusion('gtn', 2, 120, 240), 600],
]);
if (!which || which === 'rvi') run('RV infarct', { k: { eesRv: 0.3, territory: 'rv', patency: 0.1, hrBase: 55, vagal: 8, hrReflexGain: 0, venousShift: 250, reflexGain: 0.3 } }, [
  ['GTN 400 SL', e => e.bolus('gtn', 2, 300, 60), 240],
  ['fluid 500', fluid(500, 10), 900],
  ['fluid 500', fluid(500, 10), 900],
  ['fluid 1000', fluid(1000, 15), 1200],
  ['dobut 5', e => e.setInfusion('dobut', 5), 300],
  ['atropine', e => e.bolus('atrop', 0.6, 2400, 60), 180],
]);
if (!which || which === 'pmr') run('papillary muscle rupture', { k: { eesLv: 0.85, lam_lv_mul: 1.1, eroa: 0.7, territory: 'lv', patency: 0.5, hrBase: 110, venousShift: 250, reflexGain: 0.3 }, lactate0: 4 }, [
  ['norad 0.2', e => e.setInfusion('norad', 0.2), 300],
  ['fluid 500', fluid(500, 10), 900],
  ['stop norad, dobut 5', e => { e.setInfusion('norad', 0); e.setInfusion('dobut', 5); }, 600],
  ['IABP', e => e.devices.iabp = true, 300],
  ['GTN 2 mg/h', e => e.setInfusion('gtn', 2, 120, 240), 600],
]);
if (!which || which === 'vsr') run('VSR', { k: { eesLv: 0.6, vsdA: 0.9, territory: 'lv', patency: 0.3, hrBase: 105, venousShift: 250, reflexGain: 0.3 }, lactate0: 3.5 }, [
  ['norad 0.2', e => e.setInfusion('norad', 0.2), 300],
  ['IABP', e => e.devices.iabp = true, 300],
]);
if (!which || which === 'chb') run('CHB', { k: { rhythm: 'chb', escapeRate: 38, atrialRate: 90, territory: 'lv', patency: 0.2, eesLv: 0.8, venousShift: 150, reflexGain: 0.3 } }, [
  ['atropine 600', e => e.bolus('atrop', 0.6, 2400, 60), 180],
  ['pace 80', e => { e.k.rhythm = 'paced'; e.k.pacedRate = 80; }, 300],
]);
if (!which || which === 'warm') run('post-arrest warm-wet', { k: { eesLv: 0.5, territory: 'lv', patency: 0.1, hrBase: 105, venousShift: -150, comatose: true, temp: 35.2, baseDeficit: 6, shuntExtra: 0.1, reflexGain: 0.3 }, params: { Rs: 0.7 }, lactate0: 9 }, [
  ['vent', e => { e.ventilated = true; e.peep = 5; e.fio2 = 1.0; e.setInfusion('sedation', 1); }, 300],
  ['norad 0.2', e => e.setInfusion('norad', 0.2), 300],
  ['fluid 500', fluid(500, 10), 900],
]);
if (!which || which === 'arrest') run('VF then CPR then ROSC', { k: { eesLv: 0.4, lam_lv_mul: 1.3, territory: 'lv', patency: 0.1, hrBase: 100, venousShift: 250, reflexGain: 0.3 }, lactate0: 4 }, [
  ['VF 1 min', e => e.k.rhythm = 'vf', 60],
  ['CPR 2 min', e => e.devices.cpr = true, 120],
  ['ROSC', e => { e.devices.cpr = false; e.k.rhythm = 'sinus'; e.bolus('adren', 0.3, 180, 20); }, 300],
]);
