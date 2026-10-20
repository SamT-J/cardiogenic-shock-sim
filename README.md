# Cardiogenic shock patient simulator

Single-file teaching simulator for a talk on cardiogenic shock after ACS. Open `cs-sim.html` in Chrome. No server, no dependencies.

## Running a session

1. Open `cs-sim.html` on the projector screen. Press `F11` for full screen.
2. Press `c` to open the control panel popup (drag it to the laptop screen). `Shift+C` opens the same panel as an in-window drawer if popups are blocked.
3. In the control panel: pick a scenario and `Load / reset`. The patient clock starts running at once (pause with the big button or `space`). Idle speed sets how fast patient time runs while the room talks (hold, 1x, 2x, 4x).
4. Every intervention button fast-forwards patient time far enough for the effect to show (shown on hover, e.g. noradrenaline 5 min, milrinone 15 min, fluid 500 ml 11 min). The model integrates that time at once, the tiles show change arrows for 15 s, the clock shows `>> fast forward`, and the control panel `Response to last action` box lists before/after MAP, HR, CI, PCWP, CVP, SpO2, RR, lactate, CPP, SVR, urine.
5. Three control types. Infusions (noradrenaline, adrenaline, dobutamine, milrinone, vasopressin, isoprenaline, GTN, propofol) and ventilator settings are sliders from zero to the usual maximum in steps of the smallest dose, with a readout of the dose and pump rate; dragging previews, releasing applies. Oxygen, CPAP and ventilator mode are radio groups (one state lit). One-shot items (fluids, boluses, lines, investigations, pacing, shocks, calls) are buttons that stay lit while their effect is active. Disabled controls are greyed (ventilator before intubation, oxygen mask after). The `Running:` strip above the controls lists active therapy.
6. `Procedural sedation` buttons (ketamine 0.5 mg/kg, midazolam 2 mg, propofol 0.5 mg/kg) for cardioversion or pacing: GCS drops to 8 (ketamine, propofol) or 13 (midazolam) for the drug's duration; only intubation gives "sedated and paralysed".
7. Ventilator: mode (volume or pressure control), FiO2, PEEP, rate, tidal volume in VC (reads plateau pressure) or inspiratory pressure in PC (reads delivered volume). Compliance falls with pulmonary oedema, so the same pressure delivers less volume and the same volume costs more pressure. On CPAP or a ventilator the fourth monitor row becomes capnography with EtCO2 (falls with low output, zero in arrest, 1.5-3 kPa during CPR).
8. Pending scripted events show a countdown with `Cancel` and `Now`.

Monitor shows NIBP by default (auto 5 min); the Art row appears once an arterial line is sited (`Lines and monitoring` or the Overrides tab). The right third of the Obs tab is a bedside examination panel derived from the model: alertness, chest movement, lung sounds, pulse, capillary refill, peripheries, temperature, skin, central cyanosis, urine output (needs a catheter).

Keys on the display: `1`-`6` switch tabs (Obs, 12 lead, ABG, Echo, Exam, History), `space` start/pause. The big play/pause button is top right next to `Control panel`.

The `Overrides` tab in the control panel forces any displayed vital, sets rhythm, forces events and tweaks model knobs. The model keeps running underneath.

## Scenarios

All set in Ysbyty Gwynedd ED (cardiology on site with temporary pacing and a CCU that can run dobutamine, no cath lab). Glan Clwyd has PCI and IABP (55 min by road, 20 by air); Liverpool Heart and Chest does the surgery (100 min by road, 35 by air). Calls answer immediately with advice in the log; the transfer team arrives at 40 min and the patient departs at 75 min. Scripts, prompts for the room, pointers and debrief points are in the control panel `Script` box.

1. Inferior MI day 3, papillary muscle rupture
2. Inferior STEMI with RV infarction, hypotensive after GTN
3. Anterior STEMI, cold-wet LV failure shock (SCAI C to D, VT at 9 min)
4. Inferior STEMI with complete heart block
5. Post-arrest anterior MI, mixed vasodilatory shock
6. Anterior MI day 4, ventricular septal rupture

## Model

Beat-averaged closed-loop circulation (Burkhoff / CVSim style: LV and RV elastances, four vascular compartments, Gorlin orifice for MR and VSD, ventricular interdependence), blunted baroreflex, ischaemic spiral tied to coronary perfusion pressure and rate-pressure product, shunt-based oxygen transport with Severinghaus dissociation, lactate production and clearance from oxygen delivery, dead-space and ventilation drive for CO2. Drug effects use the dose-response numbers in `docs/` and the research notes (noradrenaline, adrenaline, dobutamine, milrinone, vasopressin, metaraminol, isoprenaline, GTN, morphine, furosemide, atropine, amiodarone, ketamine, propofol, CPAP/PEEP, IABP, fluids, lysis). Numbers are plausible, not validated.

## Files

- `src/` editable sources; `build.py` concatenates them and base64-embeds `assets/echo/*` into `cs-sim.html`
- `test/engine_test.js`, `test/scenario_test.js` headless checks: `node test/scenario_test.js [pmr|rvi|lvcs|chb|rosc|vsr]`
- `cs-sim.html?scenario=rvi&tab=echo&echo=1` URL hooks for screenshots; `?auto=norad:2,dobut:1` runs an intervention sequence headlessly; `?resettest=1` runs a burst of 45 actions, overrides, an arrest and events, reloads the scenario and diffs 80 state keys (sim, engine, display, control panel) against a fresh load, printing `RESETTEST OK` or the differing keys to the console

Rebuild after editing sources:

```
python build.py
```

## Echo clip credits

Clips are embedded under their licences and credited on screen: The POCUS Atlas (CC BY-NC 4.0), Clinical Case Reports 2025 (CC BY 4.0, papillary muscle rupture), Cureus 2025 (CC BY 4.0, apical akinesis).
