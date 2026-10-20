// Runs each scenario's engine configuration through a standard sequence: node test/scenario_test.js [id]
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Object, Array, Float32Array, JSON };
vm.createContext(ctx);
for (const f of ['wave.js', 'engine.js', 'scenarios.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
const E = vm.runInContext('Engine', ctx), SC = vm.runInContext('SCENARIOS', ctx);
const fmt = o => `HR ${o.hr.toFixed(0)} BP ${o.sbp.toFixed(0)}/${o.dbp.toFixed(0)} (${o.map.toFixed(0)}) CI ${o.ci.toFixed(2)} SV ${o.sv.toFixed(0)} PCWP ${o.pcwp.toFixed(0)} CVP ${o.cvp.toFixed(0)} SVR ${o.svr.toFixed(0)} EF ${(o.efLv * 100).toFixed(0)} SpO2 ${(o.spo2 * 100).toFixed(0)} RR ${o.rr.toFixed(0)} pH ${o.ph.toFixed(2)} pCO2 ${o.pco2.toFixed(1)} pO2 ${o.pao2.toFixed(1)} lac ${o.lact.toFixed(1)} GCS ${o.gcs} CPP ${o.cpp.toFixed(0)} urine ${o.urine.toFixed(0)} ${o.stage}`;
const fluid = (ml, min) => e => e.infusing.push({ ml, rate: ml / (min * 60) });
const seq = {
  pmr: [['idle 5', e => {}, 300], ['CPAP10', e => { e.cpap = true; e.peep = 10; e.fio2 = 1; }, 300], ['dobut 5', e => e.setInfusion('dobut', 5, 120, 150), 300], ['norad 0.1', e => e.setInfusion('norad', 0.1, 90, 150), 300], ['fluid 500', fluid(500, 10), 600], ['IABP', e => e.devices.iabp = true, 600]],
  rvi: [['idle 5', e => {}, 300], ['GTN SL', e => { e.bolus('gtn', 2, 240, 60); e.k.vagal += 10; e.k.venousShift -= 120; }, 180], ['fluid 500', fluid(500, 10), 600], ['fluid 500', fluid(500, 10), 600], ['atropine 0.5', e => e.bolus('atrop', 0.5, 7200, 60), 180], ['dobut 5', e => e.setInfusion('dobut', 5, 120, 150), 300], ['norad 0.1', e => e.setInfusion('norad', 0.1, 90, 150), 300]],
  lvcs: [['idle 5', e => {}, 300], ['norad 0.1', e => e.setInfusion('norad', 0.1, 90, 150), 300], ['norad 0.2', e => e.setInfusion('norad', 0.2, 90, 150), 300], ['dobut 5', e => e.setInfusion('dobut', 5, 120, 150), 300], ['CPAP 10', e => { e.cpap = true; e.peep = 10; e.fio2 = 1; }, 300], ['RSI propofol 1.5', e => { e.bolus('propofol', 1.5, 480, 20); }, 120], ['vent', e => { e.ventilated = true; e.cpap = false; e.peep = 5; e.fio2 = 1; }, 600], ['fluid 500', fluid(500, 10), 600]],
  chb: [['idle 5', e => {}, 300], ['atropine 0.5', e => e.bolus('atrop', 0.5, 7200, 60), 180], ['isop 5', e => e.setInfusion('isop', 5, 90, 120), 300], ['paced 80', e => { e.k.rhythm = 'paced'; e.k.pacedRate = 80; e.setInfusion('isop', 0); }, 300]],
  rosc: [['idle 5', e => {}, 300], ['RSI ketamine 1', e => { e.flags.catecholDepleted = true; e.bolus('ketamine', 1, 900, 30); }, 120], ['vent PEEP5', e => { e.ventilated = true; e.peep = 5; e.flags.igel = false; }, 300], ['norad 0.2', e => e.setInfusion('norad', 0.2, 90, 150), 300], ['fluid 500', fluid(500, 10), 600], ['sedation', e => e.setInfusion('sedation', 1, 300, 600), 600]],
  vsr: [['idle 5', e => {}, 300], ['norad 0.2', e => e.setInfusion('norad', 0.2, 90, 150), 300], ['stop norad, dobut 5', e => { e.setInfusion('norad', 0); e.setInfusion('dobut', 5, 120, 150); }, 300], ['GTN 2', e => e.setInfusion('gtn', 2, 90, 180), 300], ['IABP', e => e.devices.iabp = true, 600]],
};
const which = process.argv[2];
for (const sc of SC) {
  if (which && sc.id !== which) continue;
  const e = new E();
  const params = Object.assign({}, sc.engine.params || {}); if (sc.start.Rs) params.Rs = sc.start.Rs;
  e.reset({ params, k: JSON.parse(JSON.stringify(sc.engine.k)), lactate0: sc.engine.lactate0, pco2_0: sc.engine.pco2_0 });
  e.fio2 = sc.start.fio2; if (sc.start.ventilatedByBag) { e.ventilated = true; e.peep = 0; Object.assign(e.vent, sc.start.vent || {}); }
  e.settle();
  console.log(`\n== ${sc.name}\n  t0                     ${fmt(e.compute())}`);
  for (const [label, fn, secs] of seq[sc.id] || []) { fn(e); e.step(secs); console.log(`  ${label.padEnd(22)} ${fmt(e.compute())}`); }
}
