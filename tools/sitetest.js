// Dev-only: plays a building project through every stage with the Help button, logging stages and errors.
// In the browser console: const t = await import('/tools/sitetest.js'); t.start(0); ... t.status()
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = new Map();
const log = [];
let pump = null;

function note(msg) { errs.set(msg, (errs.get(msg) || 0) + 1); }

export async function start(plot = 0, opts = {}) {
  for (let i = 0; i < 40 && !(window.game && window.game.construction); i++) await wait(500);
  const g = window.game, C = g.construction;
  if (!window.__sitetestHooked) {
    window.__sitetestHooked = true;
    addEventListener('error', (e) => note(`${e.message} @${e.filename}:${e.lineno}`));
    addEventListener('unhandledrejection', (e) => note(`rejection ${e.reason}`));
  }
  // hidden preview panes do not run requestAnimationFrame, so drive frames by timer
  clearInterval(pump);
  pump = setInterval(() => { try { g.frame(); } catch (e) { note(`frame: ${e.message} ${(e.stack || '').split('\n').slice(1, 3).join(' | ')}`); } }, 33);
  if (!document.getElementById('title').hidden) { document.querySelector('#title button')?.click(); await wait(800); }
  g.ui.closeOverlay?.();
  if (opts.unlockAll) g.state.plots.forEach((p) => { p.unlocked = true; });
  g.chooseBuild(plot, { type: 'x', color: opts.color || '#a9cfe6' });
  await wait(500);
  for (let n = 0; n < 600; n++) {
    const s = C.session;
    if (!s) { log.push('session ended'); break; }
    const ps = g.state.plots[plot];
    if (opts.stopAt != null && ps.stage >= opts.stopAt && s.phase === 'learn') { log.push(`stopped at ${ps.stage}`); break; }
    if (s.phase === 'learn') {
      const l = C.lesson();
      if (l.choice) C.onButton('opt:' + l.choice.opts.find((o) => o.good).id);
      C.onButton('start'); await wait(300);
      log.push(`start ${ps.stage} f${ps.floor}`);
    } else if (s.phase === 'work') {
      if (s.step === 'floor') { C.onButton('floor:marble'); await wait(300); continue; }
      if (s.quiz) { C.onButton('quiz:' + s.quiz.opts.find((o) => o.good).id); await wait(2500); continue; }
      if (s.step === 'open') { C.onButton('open'); await wait(4500); continue; }
      if (s.step === 'inspect' || s.step === 'arrive') { await wait(1000); continue; }
      if (C.busy() || s.auto || s.held) { await wait(500); continue; }
      C.onButton('help'); await wait(1500);
    } else if (s.phase === 'review') {
      log.push(`done ${s.doneStage} ★${s.stars} f${ps.floor}`);
      C.onButton('next'); await wait(500);
    } else { log.push(`phase ${s.phase}`); break; }
  }
  log.push(`END plot ${plot} stage ${g.state.plots[plot].stage} done ${g.state.plots[plot].done}`);
}
export function status() { return { log: log.slice(-30), errs: [...errs.entries()].slice(0, 15) }; }
export function stop() { clearInterval(pump); }
