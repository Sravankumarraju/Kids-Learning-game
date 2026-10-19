// Learning mini-game framework: spoken prompts, hints, stars, adaptive difficulty, in-game offers,
// a parent progress page and a break reminder. Results stay in the browser save (state.learn).
import { GAMES, AREAS, COLOURS, SHAPES, shapeSvg } from './learngames.js';
import { rng } from './util.js';

export const AGE_BANDS = [
  { id: '3-5', label: '3–5 years', level: 1, breakMin: 15 },
  { id: '6-7', label: '6–7 years', level: 2, breakMin: 30 },
  { id: '8-10', label: '8–10 years', level: 3, breakMin: 30 },
];
const ROUNDS = 5;
const IDEAS = {
  colours: ['Count the red cars on your next walk.', 'Find three round things in the kitchen.', 'Mix two paints and name the new colour together.'],
  letters: ['Spot the first letter of shop signs on the road.', 'Write your name in big and small letters.', 'Play "I spy something beginning with B".'],
  numbers: ['Count the stairs as you climb them.', 'Set the table: how many spoons do we need?', 'Count change together at the shop.'],
  thinking: ['Play "Simon says" with opposite days.', 'Put 4 toys on a tray, hide one: which is missing?', 'Plan a route to the park and follow it.'],
};
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);

export function defaultLearn() {
  return { age: '', levels: {}, stats: {}, seen: { letters: {}, numbers: {}, colours: {}, shapes: {} }, minutes: {}, play: {}, speak: true, offers: true, breakMin: null, lastOffer: 0 };
}

export class Learn {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('learn');
    this.timers = [];
    this.playSec = 0;
    this.offerTimer = null;
    this.recent = [];
    this.voice = null;
    if ('speechSynthesis' in window) {
      const pickVoice = () => {
        const vs = speechSynthesis.getVoices();
        this.voice = vs.find((v) => /en-IN/i.test(v.lang)) || vs.find((v) => /en-GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
      };
      pickVoice();
      speechSynthesis.onvoiceschanged = pickVoice;
    }
  }

  get L() {
    const s = this.game.state;
    s.learn ||= defaultLearn();
    return s.learn;
  }
  get name() { return this.game.state.player.name || 'friend'; }
  band() { return AGE_BANDS.find((b) => b.id === this.L.age) || AGE_BANDS[1]; }
  isOpen() { return !this.root.hidden; }

  say(text, quick = false) {
    if (!this.L.speak || !('speechSynthesis' in window) || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = quick ? 1.0 : 0.92; u.pitch = 1.1;
      speechSynthesis.speak(u);
    } catch { /* speech is optional */ }
  }
  sfx(n) { this.game.audio.play(n); }
  later(ms, fn) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }

  show(html) {
    this.clearTimers();
    this.root.innerHTML = html;
    this.root.hidden = false;
    document.getElementById('hud').hidden = true;
    this.hideOffer();
    return this.root;
  }
  close() {
    this.clearTimers();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.root.hidden = true; this.root.innerHTML = '';
    this.session = null;
    if (document.getElementById('overlay').hidden) document.getElementById('hud').hidden = false;
    this.game.save();
  }

  // ---------------- game picker ----------------
  openPicker(back) {
    this._back = back || null;
    const L = this.L;
    let h = `<div class="lsheet"><div class="lhead"><h1>Learning Games</h1><button class="btn" id="lpBack">← Back</button></div>
      <p class="lead">Pick a game, ${esc(this.name)}! Each one is 5 quick rounds.</p>`;
    for (const area in AREAS) {
      h += `<h2>${AREAS[area].icon} ${AREAS[area].name}</h2><div class="lcards">`;
      for (const g of GAMES.filter((x) => x.area === area)) {
        const st = L.stats[g.id];
        const stars = st ? '★'.repeat(st.best) + '☆'.repeat(3 - st.best) : '☆☆☆';
        h += `<button class="lcard" data-g="${g.id}"><span class="lico">${g.icon}</span><span class="lnm">${g.name}</span><span class="lds">${g.desc}</span><span class="lstars" aria-label="best stars">${stars}</span></button>`;
      }
      h += '</div>';
    }
    h += '</div>';
    const r = this.show(h);
    r.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => this.open(b.dataset.g, () => this.openPicker(this._back)));
    r.querySelector('#lpBack').onclick = () => { this.close(); if (this._back) this._back(); };
    r.querySelector('[data-g]').focus();
  }

  // ---------------- a game session ----------------
  open(id, after) {
    const g = GAMES.find((x) => x.id === id);
    if (!g) return;
    this.hideOffer();
    const L = this.L;
    const level = L.levels[id] ?? this.band().level;
    this.session = { g, round: 0, firstTry: 0, level, streakOk: 0, streakBad: 0, after, t0: performance.now(), r: rng((Date.now() & 0xffffff) ^ (id.length * 977)) };
    const r = this.show(`<div class="lplay" role="dialog" aria-label="${g.name}">
      <div class="lbar"><span class="ltitle">${g.icon} ${g.name}</span><span class="ldots" id="lDots"></span><span class="llevel" id="lLevel"></span>
        <button class="btn sm" id="lSay" aria-label="Say it again">🔊</button><button class="btn sm" id="lSkip">Skip</button><button class="btn sm" id="lQuit">✕</button></div>
      <div class="lprompt" id="lPrompt" aria-live="polite"></div>
      <div class="lstage" id="lStage"></div>
      <div class="lfeed" id="lFeed" aria-live="polite"></div></div>`);
    r.querySelector('#lQuit').onclick = () => this.endSession(true);
    r.querySelector('#lSkip').onclick = () => { this.sfx('click'); this.nextRound(); };
    r.querySelector('#lSay').onclick = () => this.say(this.session?.spoken);
    this.nextRound();
  }

  nextRound() {
    const s = this.session;
    if (!s) return;
    this.clearTimers();
    if (s.round >= ROUNDS) { this.finish(); return; }
    s.round++;
    s.wrong = 0; s.locked = false; s.hints = []; s.hintOn = false; s.track = null;
    const dots = this.root.querySelector('#lDots');
    dots.innerHTML = Array.from({ length: ROUNDS }, (_, i) => `<i class="${i < s.round - 1 ? 'done' : i === s.round - 1 ? 'now' : ''}"></i>`).join('');
    this.root.querySelector('#lLevel').textContent = `Level ${s.level}`;
    const stage = this.root.querySelector('#lStage');
    stage.innerHTML = '';
    this.root.querySelector('#lFeed').textContent = '';
    const ctx = {
      stage, r: s.r, level: s.level,
      prompt: (spoken, html, keep) => {
        s.spoken = spoken;
        this.root.querySelector('#lPrompt').innerHTML = html || esc(spoken);
        this.say(spoken);
        void keep;
      },
      say: (t, q) => this.say(t, q),
      sfx: (n) => this.sfx(n),
      later: (ms, fn) => this.later(ms, fn),
      setHint: (elx) => { if (elx) { s.hints.push(elx); if (s.hintOn) this.showHint(); } },
      hintNext: () => { if (s.hintOn) this.showHint(); },
      track: (kind, value) => { s.track = [kind, value]; },
      answer: (right, opt = {}) => this.answer(right, opt),
    };
    try { s.g.round(ctx); } catch (e) { console.error(e); this.nextRound(); return; }
    // a gentle glow on the answer if nothing happens for a while
    this.later(12000, () => { if (this.session === s && !s.locked) this.showHint(); });
  }

  showHint() {
    const s = this.session;
    if (!s) return;
    s.hintOn = true;
    this.root.querySelectorAll('.glow').forEach((e) => e.classList.remove('glow'));
    const t = s.hints.find((e) => e && e.isConnected && !e.disabled);
    if (t) t.classList.add('glow');
  }

  answer(right, opt) {
    const s = this.session;
    if (!s || s.locked) return;
    const feed = this.root.querySelector('#lFeed');
    const n = esc(this.name);
    if (right) {
      s.locked = true;
      if (s.wrong === 0) { s.firstTry++; s.streakOk++; s.streakBad = 0; } else s.streakOk = 0;
      if (s.track && s.wrong === 0) { const [k, v] = s.track; const m = this.L.seen[k] ||= {}; m[v] = (m[v] || 0) + 1; }
      const praise = s.wrong ? [`You kept trying, ${n}!`, 'Never give up — well done!'] : [`Great job, ${n}!`, `Super, ${n}!`, 'Brilliant!', `You got it, ${n}!`, 'Fantastic!'];
      const p = praise[Math.floor(s.r() * praise.length)];
      feed.innerHTML = `<span class="yay">⭐ ${p}</span>`;
      this.say(p.replace(/&amp;/g, 'and'));
      this.sfx('chime');
      this.burst();
      this.later(1500, () => { this.adapt(); this.nextRound(); });
      return;
    }
    s.wrong++;
    if (s.wrong === 1) { s.streakBad++; s.streakOk = 0; }
    this.sfx('error');
    if (opt.final || s.wrong >= 3) {
      s.locked = true;
      this.showHint();
      feed.innerHTML = `<span class="oops">Good try, ${n}! Let's look at the answer together.</span>`;
      this.say(`Good try! Let's try another one.`);
      this.later(2400, () => { this.adapt(); this.nextRound(); });
      return;
    }
    feed.innerHTML = `<span class="oops">Not quite — try again! ${s.wrong >= 1 ? 'Look for the glow ✨' : ''}</span>`;
    this.showHint();
  }

  adapt() {
    const s = this.session;
    if (!s) return;
    const feed = this.root.querySelector('#lFeed');
    if (s.streakOk >= 3 && s.level < 3) { s.level++; s.streakOk = 0; feed.innerHTML = '<span class="yay">🚀 Level up!</span>'; this.say('Level up!'); }
    else if (s.streakBad >= 2 && s.level > 1) { s.level--; s.streakBad = 0; }
    this.L.levels[s.g.id] = s.level;
  }

  burst() {
    const stage = this.root.querySelector('#lStage');
    for (let i = 0; i < 10; i++) {
      const sp = document.createElement('span');
      sp.className = 'spark'; sp.textContent = ['⭐', '✨', '🎉'][i % 3];
      sp.style.left = `${45 + (Math.random() - 0.5) * 40}%`; sp.style.setProperty('--dx', `${(Math.random() - 0.5) * 260}px`);
      stage.appendChild(sp);
      setTimeout(() => sp.remove(), 1100);
    }
  }

  finish() {
    const s = this.session;
    const stars = s.firstTry >= 5 ? 3 : s.firstTry >= 3 ? 2 : 1;
    const coins = stars * 10;
    const L = this.L;
    const st = L.stats[s.g.id] ||= { plays: 0, rounds: 0, firstTry: 0, best: 0 };
    st.plays++; st.rounds += ROUNDS; st.firstTry += s.firstTry; st.best = Math.max(st.best, stars);
    this.addMinutes(s);
    this.game.state.coins += coins;
    const msg = stars === 3 ? `Amazing, ${this.name}! Three stars!` : stars === 2 ? `Well done, ${this.name}! Two stars!` : `Good effort, ${this.name}! Practice makes perfect.`;
    this.say(msg);
    this.sfx('fanfare');
    const r = this.show(`<div class="lsheet lend"><div class="bigstars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <h1>${esc(msg)}</h1><p class="lead">${s.firstTry} of ${ROUNDS} right first time · +${coins} coins · now on level ${s.level}</p>
      <div class="foot" style="justify-content:center"><button class="btn big" id="leBack">Back</button><button class="btn primary big" id="leAgain">Play again</button></div></div>`);
    const after = s.after;
    this.session = null;
    r.querySelector('#leAgain').onclick = () => this.open(s.g.id, after);
    r.querySelector('#leBack').onclick = () => { this.close(); if (after) after(); };
    r.querySelector('#leAgain').focus();
    this.game.save();
  }

  endSession(quit) {
    const s = this.session;
    if (s) this.addMinutes(s);
    const after = s?.after;
    this.close();
    if (quit && after) after();
  }

  addMinutes(s) {
    const m = (performance.now() - s.t0) / 60000;
    const d = today();
    this.L.minutes[d] = Math.round(((this.L.minutes[d] || 0) + m) * 10) / 10;
    s.t0 = performance.now();
  }

  // ---------------- offers inside the main game ----------------
  offer(ids, why) {
    const L = this.L;
    if (!L.offers || this.isOpen() || !document.getElementById('overlay').hidden) return;
    if (Date.now() - (L.lastOffer || 0) < 60000) return;
    const pool = ids.filter((id) => !this.recent.includes(id));
    const id = (pool.length ? pool : ids)[Math.floor(Math.random() * (pool.length ? pool : ids).length)];
    const g = GAMES.find((x) => x.id === id);
    if (!g) return;
    L.lastOffer = Date.now();
    this.recent = [id, ...this.recent].slice(0, 3);
    let chip = document.getElementById('learnOffer');
    if (!chip) { chip = document.createElement('div'); chip.id = 'learnOffer'; document.getElementById('hud').appendChild(chip); }
    chip.innerHTML = `<span class="oico">${g.icon}</span><span class="otxt"><b>${why}</b>Play ${g.name}?</span><button class="btn primary" id="offerYes">Play</button><button class="btn" id="offerNo" aria-label="Not now">Not now</button>`;
    chip.hidden = false;
    chip.querySelector('#offerYes').onclick = () => this.open(id, null);
    chip.querySelector('#offerNo').onclick = () => this.hideOffer();
    clearTimeout(this.offerTimer);
    this.offerTimer = setTimeout(() => this.hideOffer(), 15000);
  }
  hideOffer() { const c = document.getElementById('learnOffer'); if (c) c.hidden = true; }

  // ---------------- break reminder ----------------
  tick(dt, active) {
    if (!active) return;
    this.playSec += dt;
    const d = today();
    this._pacc = (this._pacc || 0) + dt;
    if (this._pacc > 30) { this.L.play[d] = Math.round(((this.L.play[d] || 0) + this._pacc / 60) * 10) / 10; this._pacc = 0; }
    const lim = (this.L.breakMin ?? this.band().breakMin) * 60;
    if (lim > 0 && this.playSec > lim && !this.isOpen() && document.getElementById('modal').hidden) {
      this.playSec = 0;
      const n = esc(this.name);
      this.game.ui.celebrate(`Time for a break, ${n}!`, ['You have been playing for a while. 🌳', 'Stand up and stretch like a tall tree, then take three slow breaths.', 'The trains will wait for you!']);
      this.say(`Time for a break, ${this.name}! Stand up and stretch like a tall tree.`);
    }
  }

  // ---------------- parent page ----------------
  openParentGate(back) {
    const a = 3 + Math.floor(Math.random() * 7), b = 4 + Math.floor(Math.random() * 6);
    const r = this.show(`<div class="lsheet" style="max-width:460px;text-align:center"><h1>Grown-ups only</h1>
      <p class="lead">Please type the answer to continue.</p><p style="font-size:30px;font-weight:800">${a} + ${b} = ?</p>
      <input id="pgIn" class="name-input" inputmode="numeric" autocomplete="off" style="width:140px;text-align:center">
      <div class="foot" style="justify-content:center"><button class="btn" id="pgNo">Back</button><button class="btn primary" id="pgOk">Continue</button></div></div>`);
    const inp = r.querySelector('#pgIn');
    inp.focus();
    const ok = () => { if (Number(inp.value) === a + b) this.openParent(back); else { inp.value = ''; inp.placeholder = 'Try again'; } };
    r.querySelector('#pgOk').onclick = ok;
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); ok(); } };
    r.querySelector('#pgNo').onclick = () => { this.close(); if (back) back(); };
  }

  areaScore(area) {
    const games = GAMES.filter((g) => g.area === area);
    let lv = 0, rounds = 0, first = 0;
    for (const g of games) { lv += this.L.levels[g.id] || 0; const st = this.L.stats[g.id]; if (st) { rounds += st.rounds; first += st.firstTry; } }
    return { level: lv / games.length, acc: rounds ? first / rounds : 0, rounds };
  }

  openParent(back) {
    const L = this.L, name = esc(this.name);
    const week = Object.entries(L.minutes).filter(([d]) => (Date.now() - Date.parse(d)) / 864e5 < 7).reduce((s, [, m]) => s + m, 0);
    const playWeek = Object.entries(L.play).filter(([d]) => (Date.now() - Date.parse(d)) / 864e5 < 7).reduce((s, [, m]) => s + m, 0);
    let h = `<div class="lsheet"><div class="lhead"><h1>${name}'s progress</h1><button class="btn" id="ppBack">← Back</button></div>
      <p class="lead">Learning games this week: <b>${Math.round(week)} min</b> · whole game this week: <b>${Math.round(playWeek)} min</b></p><h2>Skills</h2><div class="meters">`;
    for (const a in AREAS) {
      const sc = this.areaScore(a);
      const pct = Math.round(((sc.level / 3) * 0.5 + sc.acc * 0.5) * 100);
      h += `<div class="meter"><span>${AREAS[a].icon} ${AREAS[a].name}</span><div class="mbar"><i style="width:${pct}%"></i></div><small>${sc.rounds ? `${Math.round(sc.acc * 100)}% right first time · level ${sc.level.toFixed(1)}` : 'not played yet'}</small></div>`;
    }
    h += '</div><h2>Letters</h2><div class="tiles">';
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') h += `<span class="tile ${(L.seen.letters[c] || 0) >= 2 ? 'on' : (L.seen.letters[c] ? 'half' : '')}">${c}</span>`;
    h += '</div><h2>Numbers 1–20</h2><div class="tiles">';
    for (let i = 1; i <= 20; i++) h += `<span class="tile ${(L.seen.numbers[i] || 0) >= 2 ? 'on' : (L.seen.numbers[i] ? 'half' : '')}">${i}</span>`;
    h += '</div><h2>Colours and shapes</h2><div class="tiles">';
    for (const c of COLOURS) h += `<span class="tile sw ${(L.seen.colours[c.name] || 0) >= 1 ? 'on' : ''}" title="${c.name}"><i style="background:${c.hex}"></i></span>`;
    for (const s of Object.keys(SHAPES)) h += `<span class="tile sw ${(L.seen.shapes[s] || 0) >= 1 ? 'on' : ''}" title="${s}">${shapeSvg(s, '#9aa0a3')}</span>`;
    h += '</div><p class="small">Bright tiles: got right first time at least twice (colours and shapes: once). Faded: started.</p><h2>Play-together ideas</h2><ul class="ideas">';
    const weakest = Object.keys(AREAS).sort((x, y) => this.areaScore(x).acc - this.areaScore(y).acc)[0];
    for (const t of IDEAS[weakest]) h += `<li>${t}</li>`;
    h += `</ul><h2>Settings</h2>
      <div class="chips" role="radiogroup" aria-label="Age">${AGE_BANDS.map((b) => `<button class="chip-btn ${L.age === b.id ? 'sel' : ''}" data-age="${b.id}">${b.label}</button>`).join('')}</div>
      <label class="toggle"><input type="checkbox" id="ppSpeak" ${L.speak ? 'checked' : ''}> Read instructions aloud</label>
      <label class="toggle"><input type="checkbox" id="ppOffers" ${L.offers ? 'checked' : ''}> Offer learning games during play</label>
      <label class="slider">Break reminder <select id="ppBreak">${[['', 'By age'], ['15', 'Every 15 min'], ['30', 'Every 30 min'], ['45', 'Every 45 min'], ['0', 'Off']].map(([v, t]) => `<option value="${v}" ${String(L.breakMin ?? '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <p class="small">All progress stays in this browser. No account, ads or purchases.</p></div>`;
    const r = this.show(h);
    r.querySelector('#ppBack').onclick = () => { this.close(); if (back) back(); };
    r.querySelectorAll('[data-age]').forEach((b) => b.onclick = () => { L.age = b.dataset.age; L.levels = {}; this.game.save(); this.openParent(back); });
    r.querySelector('#ppSpeak').onchange = (e) => { L.speak = e.target.checked; this.game.save(); };
    r.querySelector('#ppOffers').onchange = (e) => { L.offers = e.target.checked; this.game.save(); };
    r.querySelector('#ppBreak').onchange = (e) => { L.breakMin = e.target.value === '' ? null : Number(e.target.value); this.game.save(); };
  }
}
