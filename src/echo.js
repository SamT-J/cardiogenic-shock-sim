/* Echo tab: plays embedded clips (gif/mp4 via data URI) with scenario findings. */
const Echo = {
  current: null,
  reset() {
    this.current = null;
    const m = document.getElementById('echo-media'); if (m) { m.dataset.key = ''; m.innerHTML = '<div id="echo-empty">No echo yet</div>'; }
    for (const id of ['echo-views']) { const el = document.getElementById(id); if (el) el.innerHTML = ''; }
    for (const sel of ['#echo-findings ul', '#echo-measures table']) { const el = document.querySelector(sel); if (el) el.innerHTML = ''; }
  },
  render(sim) {
    const media = document.getElementById('echo-media');
    const viewsEl = document.getElementById('echo-views');
    const f = document.querySelector('#echo-findings ul');
    const m = document.querySelector('#echo-measures table');
    const sc = sim.sc;
    if (!sim.echoDone) { media.innerHTML = '<div id="echo-empty">No echo yet</div>'; viewsEl.innerHTML = ''; f.innerHTML = ''; m.innerHTML = ''; return; }
    const views = sc.echo.views;
    if (!this.current || !views.find(v => v.id === this.current)) this.current = views[0].id;
    viewsEl.innerHTML = views.map(v => `<button data-v="${v.id}" class="${v.id === this.current ? 'active' : ''}">${v.label}</button>`).join('');
    viewsEl.querySelectorAll('button').forEach(b => b.onclick = () => { this.current = b.dataset.v; this.render(sim); });
    const v = views.find(x => x.id === this.current);
    const src = (typeof ASSETS !== 'undefined' && ASSETS[v.asset]) || ('assets/echo/' + v.asset);
    const isVideo = /\.(mp4|webm)$/i.test(v.asset);
    const key = v.asset + '|' + this.current;
    if (media.dataset.key !== key) {
      media.dataset.key = key;
      media.innerHTML = (isVideo ? `<video src="${src}" autoplay muted loop playsinline></video>` : `<img src="${src}" alt="${v.label}">`) + `<div class="cap">${v.caption}</div><div class="credit">${v.credit}</div>`;
    }
    const o = sim.echoSnapshot || sim.out;
    f.innerHTML = sc.echo.findings(o).map(x => `<li>${x}</li>`).join('');
    m.innerHTML = sc.echo.measures(o).map(([k, val]) => `<tr><td>${k}</td><td>${val}</td></tr>`).join('');
  },
};
