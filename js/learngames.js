// Batch 1 learning mini-games. Each game builds one round into ctx.stage and reports with ctx.answer(right).
// Levels: 1 = ages 3–5, 2 = ages 6–7, 3 = ages 8–10 (the framework moves the level up and down).

export const COLOURS = [
  { name: 'red', hex: '#e53935' }, { name: 'blue', hex: '#1e88e5' }, { name: 'yellow', hex: '#fdd835' },
  { name: 'green', hex: '#43a047' }, { name: 'orange', hex: '#fb8c00' }, { name: 'purple', hex: '#8e24aa' },
  { name: 'pink', hex: '#f06292' }, { name: 'brown', hex: '#8d6e63' }, { name: 'white', hex: '#fafafa' },
  { name: 'black', hex: '#333333' }, { name: 'grey', hex: '#9e9e9e' },
];
const MIXES = [['red', 'yellow', 'orange'], ['blue', 'yellow', 'green'], ['red', 'blue', 'purple'], ['red', 'white', 'pink'], ['black', 'white', 'grey']];
const col = (n) => COLOURS.find((c) => c.name === n);

export const SHAPES = {
  circle: '<circle cx="50" cy="50" r="40"/>',
  square: '<rect x="14" y="14" width="72" height="72" rx="4"/>',
  triangle: '<polygon points="50,10 92,86 8,86"/>',
  rectangle: '<rect x="6" y="26" width="88" height="48" rx="4"/>',
  star: '<polygon points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38"/>',
  heart: '<path d="M50 88 C10 60 4 34 22 20 C36 9 50 20 50 30 C50 20 64 9 78 20 C96 34 90 60 50 88Z"/>',
  diamond: '<polygon points="50,6 90,50 50,94 10,50"/>',
  oval: '<ellipse cx="50" cy="50" rx="44" ry="28"/>',
  pentagon: '<polygon points="50,8 92,40 76,90 24,90 8,40"/>',
  hexagon: '<polygon points="28,12 72,12 94,50 72,88 28,88 6,50"/>',
  octagon: '<polygon points="34,6 66,6 94,34 94,66 66,94 34,94 6,66 6,34"/>',
};
const EASY_SHAPES = ['circle', 'square', 'triangle', 'star', 'heart'];
const MID_SHAPES = [...EASY_SHAPES, 'rectangle', 'diamond', 'oval'];
const ALL_SHAPES = Object.keys(SHAPES);

export const CARGO = [
  { e: '🪵', name: 'logs' }, { e: '🧱', name: 'bricks' }, { e: '🥭', name: 'mangoes' }, { e: '🍌', name: 'bananas' },
  { e: '📦', name: 'a box' }, { e: '🪣', name: 'a bucket' }, { e: '🥥', name: 'coconuts' }, { e: '🌽', name: 'corn' },
  { e: '🧺', name: 'a basket' }, { e: '🍎', name: 'apples' }, { e: '🥕', name: 'carrots' }, { e: '⚽', name: 'a ball' },
];

// ---------- small helpers ----------
const pick = (r, a) => a[Math.floor(r() * a.length)];
function shuffle(r, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function sample(r, a, n) { return shuffle(r, a).slice(0, n); }
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
export function shapeSvg(name, fill, rot = 0, stroke = 'rgba(0,0,0,.35)') {
  return `<svg viewBox="0 0 100 100" class="shp" aria-hidden="true"><g fill="${fill}" stroke="${stroke}" stroke-width="3" transform="rotate(${rot} 50 50)">${SHAPES[name]}</g></svg>`;
}
function crateSvg(hex) {
  const edge = hex === '#fafafa' ? '#9e9e9e' : 'rgba(0,0,0,.35)';
  return `<svg viewBox="0 0 100 100" class="crate" aria-hidden="true"><rect x="8" y="14" width="84" height="74" rx="8" fill="${hex}" stroke="${edge}" stroke-width="4"/><path d="M8 34H92M8 68H92" stroke="${edge}" stroke-width="3"/><path d="M22 14V88M78 14V88" stroke="rgba(0,0,0,.18)" stroke-width="5"/></svg>`;
}
// a goods wagon holding some content (letters, numbers, cargo)
function wagon(content, cls = '') {
  return `<div class="wagon ${cls}"><div class="wbody">${content}</div><div class="wwheels"><i></i><i></i></div></div>`;
}
function optionButtons(ctx, opts, render, isRight, sayOf) {
  const row = el('div', 'opts');
  opts.forEach((o) => {
    const b = el('button', 'opt', render(o));
    b.onclick = () => {
      if (sayOf) ctx.say(sayOf(o), true);
      if (isRight(o)) { b.classList.add('right'); ctx.answer(true); } else { b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 500); ctx.answer(false); }
    };
    if (isRight(o)) ctx.setHint(b);
    row.appendChild(b);
  });
  return row;
}

// ---------- the games ----------
export const GAMES = [
  {
    id: 'colour', name: 'Colour Station', area: 'colours', icon: '🎨', desc: 'Load the crates of the right colour.',
    round(ctx) {
      const { r, level } = ctx;
      if (level >= 3 && r() < 0.6) {
        const [a, b, res] = pick(r, MIXES);
        ctx.prompt(`Mix ${a} and ${b}. What colour do you get?`, `<span class="dot" style="background:${col(a).hex}"></span> + <span class="dot" style="background:${col(b).hex}"></span> = ?`);
        const opts = shuffle(r, [res, ...sample(r, COLOURS.map((c) => c.name).filter((n) => n !== res && n !== a && n !== b), 3)]);
        ctx.stage.appendChild(optionButtons(ctx, opts, (n) => `<span class="swatch-big" style="background:${col(n).hex}"></span><span class="lbl">${n}</span>`, (n) => n === res, (n) => n));
        ctx.track('colours', res);
        return;
      }
      const palette = level === 1 ? COLOURS.slice(0, 4) : COLOURS.slice(0, 8);
      const target = pick(r, palette);
      const nT = 1 + Math.floor(r() * (level === 1 ? 2 : 3));
      const n = level === 1 ? 6 : 8;
      const crates = shuffle(r, [...Array(nT).fill(target), ...Array.from({ length: n - nT }, () => pick(r, palette.filter((c) => c !== target)))]);
      ctx.prompt(`Load all the ${target.name} crates!`, `Load all the <b style="color:${target.hex === '#fafafa' ? '#555' : target.hex}">${target.name.toUpperCase()}</b> crates`);
      const train = el('div', 'loadwagon', wagon('<div class="hold"></div>'));
      const yard = el('div', 'yard');
      let left = nT;
      crates.forEach((c) => {
        const b = el('button', 'crate-btn', crateSvg(c.hex));
        b.setAttribute('aria-label', `${c.name} crate`);
        if (c === target) ctx.setHint(b);
        b.onclick = () => {
          ctx.say(c.name, true);
          if (c !== target) { b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 500); ctx.answer(false); return; }
          b.disabled = true; b.classList.add('gone');
          train.querySelector('.hold').insertAdjacentHTML('beforeend', crateSvg(c.hex));
          if (--left === 0) ctx.answer(true); else ctx.hintNext();
        };
        yard.appendChild(b);
      });
      ctx.stage.append(train, yard);
      ctx.track('colours', target.name);
    },
  },
  {
    id: 'shapes', name: 'Shape Sorter Yard', area: 'colours', icon: '🔷', desc: 'Fit each shape into the matching hole.',
    round(ctx) {
      const { r, level } = ctx;
      const pool = level === 1 ? EASY_SHAPES : level === 2 ? MID_SHAPES : ALL_SHAPES;
      const target = pick(r, pool);
      const nOpt = level === 1 ? 3 : level === 2 ? 4 : 6;
      const opts = shuffle(r, [target, ...sample(r, pool.filter((s) => s !== target), nOpt - 1)]);
      const colours = COLOURS.slice(0, 8);
      if (level >= 3) {
        ctx.prompt(`Find the ${target}!`, `Find the <b>${target.toUpperCase()}</b>`);
      } else {
        ctx.prompt('Which shape fits the hole in the wagon?', 'Which shape fits the hole?');
        ctx.stage.appendChild(el('div', 'loadwagon', wagon(`<div class="hole">${shapeSvg(target, 'rgba(0,0,0,.55)', 0, 'rgba(255,255,255,.6)')}</div>`)));
      }
      ctx.stage.appendChild(optionButtons(ctx, opts, (s) => shapeSvg(s, pick(r, colours).hex, level >= 2 ? Math.floor(r() * 4) * (s === 'circle' ? 0 : 45) : 0), (s) => s === target, (s) => s));
      ctx.track('shapes', target);
    },
  },
  {
    id: 'alphabet', name: 'Alphabet Express', area: 'letters', icon: '🔤', desc: 'Put the letter wagons in A-B-C order.',
    round(ctx) {
      const { r, level } = ctx;
      const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (level >= 3) {
        const start = Math.floor(r() * 22);
        const seq = A.slice(start, start + 4).split('');
        ctx.prompt('Tap the letters in A-B-C order.', 'Tap the letters in <b>A-B-C order</b>');
        const train = el('div', 'train-row');
        const opts = el('div', 'opts');
        let next = 0;
        shuffle(r, seq).forEach((L) => {
          const b = el('button', 'opt letter', L);
          if (L === seq[0]) ctx.setHint(b);
          b.onclick = () => {
            ctx.say(L, true);
            if (L !== seq[next]) { b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 500); ctx.answer(false); return; }
            b.disabled = true; b.classList.add('gone');
            train.insertAdjacentHTML('beforeend', wagon(`<span class="big">${L}</span>`));
            ctx.track('letters', L);
            next++;
            if (next === seq.length) ctx.answer(true); else ctx.setHint([...opts.children].find((c) => c.textContent === seq[next]));
          };
          opts.appendChild(b);
        });
        ctx.stage.append(train, opts);
        return;
      }
      const max = level === 1 ? 10 : 26;
      const start = Math.floor(r() * (max - 3));
      const seq = A.slice(start, start + 4).split('');
      const gap = level === 1 ? 3 : 1 + Math.floor(r() * 3);
      const ans = seq[gap];
      ctx.prompt('Which letter is missing?', 'Which letter is <b>missing</b>?');
      ctx.stage.appendChild(el('div', 'train-row', seq.map((L, i) => wagon(i === gap ? '<span class="big q">?</span>' : `<span class="big">${L}</span>`)).join('')));
      const others = sample(r, A.slice(0, max).split('').filter((L) => L !== ans), level === 1 ? 2 : 3);
      ctx.stage.appendChild(optionButtons(ctx, shuffle(r, [ans, ...others]), (L) => `<span class="big">${L}</span>`, (L) => L === ans, (L) => L));
      ctx.track('letters', ans);
    },
  },
  {
    id: 'bigsmall', name: 'Big & Small Letters', area: 'letters', icon: '🔡', desc: 'Couple each big letter to its small letter.',
    round(ctx) {
      const { r, level } = ctx;
      const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const tricky = { b: ['d', 'p', 'q'], d: ['b', 'p', 'q'], p: ['q', 'b', 'd'], q: ['p', 'd', 'b'], m: ['n', 'w', 'u'], n: ['m', 'u', 'h'], u: ['n', 'v', 'w'], i: ['l', 'j', 't'] };
      const pool = level === 1 ? A.slice(0, 13) : A;
      const L = level >= 3 && r() < 0.6 ? pick(r, Object.keys(tricky)).toUpperCase() : pick(r, pool);
      const small = L.toLowerCase();
      const upToLow = level !== 2 || r() < 0.5;
      const n = level === 1 ? 3 : 4;
      let opts;
      if (level >= 3 && tricky[small]) opts = [small, ...tricky[small].slice(0, n - 1)];
      else opts = [small, ...sample(r, pool.map((x) => x.toLowerCase()).filter((x) => x !== small), n - 1)];
      opts = shuffle(r, opts);
      if (upToLow) {
        ctx.prompt(`Find the small letter for big ${L}.`, `Find the <b>small</b> letter for`);
        ctx.stage.appendChild(el('div', 'train-row', wagon(`<span class="big">${L}</span>`)));
        ctx.stage.appendChild(optionButtons(ctx, opts, (x) => `<span class="big lower">${x}</span>`, (x) => x === small, (x) => x));
      } else {
        ctx.prompt(`Find the big letter for small ${small}.`, `Find the <b>big</b> letter for`);
        ctx.stage.appendChild(el('div', 'train-row', wagon(`<span class="big lower">${small}</span>`)));
        ctx.stage.appendChild(optionButtons(ctx, opts.map((x) => x.toUpperCase()), (x) => `<span class="big">${x}</span>`, (x) => x === L, (x) => x));
      }
      ctx.track('letters', L);
    },
  },
  {
    id: 'numbers', name: 'Number Train', area: 'numbers', icon: '🔢', desc: 'Find the missing number wagon.',
    round(ctx) {
      const { r, level } = ctx;
      let seq, step = 1;
      if (level === 1) { const s = 1 + Math.floor(r() * 7); seq = [s, s + 1, s + 2, s + 3]; }
      else if (level === 2) { const s = 1 + Math.floor(r() * 17); seq = [s, s + 1, s + 2, s + 3]; }
      else { step = pick(r, [1, 2, 5, 10]); const s = step === 1 ? 20 + Math.floor(r() * 76) : step * (1 + Math.floor(r() * (step === 10 ? 6 : 8))); seq = [s, s + step, s + 2 * step, s + 3 * step]; }
      const gap = level === 1 ? 3 : 1 + Math.floor(r() * 3);
      const ans = seq[gap];
      ctx.prompt(step > 1 ? `Count in ${step}s. Which number is missing?` : 'Which number is missing?', step > 1 ? `Count in <b>${step}s</b> — which number is missing?` : 'Which number is <b>missing</b>?');
      ctx.stage.appendChild(el('div', 'train-row', seq.map((n, i) => wagon(i === gap ? '<span class="big q">?</span>' : `<span class="big">${n}</span>`)).join('')));
      const near = new Set([ans]);
      while (near.size < (level === 1 ? 3 : 4)) { const d = (1 + Math.floor(r() * 3)) * step * (r() < 0.5 ? -1 : 1); if (ans + d > 0) near.add(ans + d); }
      ctx.stage.appendChild(optionButtons(ctx, shuffle(r, [...near]), (n) => `<span class="big">${n}</span>`, (n) => n === ans, (n) => String(n)));
      ctx.track('numbers', ans);
    },
  },
  {
    id: 'countload', name: 'Count & Load', area: 'numbers', icon: '📦', desc: 'Load exactly the number on the wagon.',
    round(ctx) {
      const { r, level } = ctx;
      const N = level === 1 ? 1 + Math.floor(r() * 5) : level === 2 ? 3 + Math.floor(r() * 8) : 11 + Math.floor(r() * 10);
      const item = pick(r, CARGO);
      ctx.prompt(`Load exactly ${N} ${item.name.replace(/^an? /, '')} into the wagon, then press Done.`, `Load exactly <b class="numtag">${N}</b>, then press Done`);
      const train = el('div', 'loadwagon', wagon(`<div class="numplate">${N}</div><div class="hold emoji"></div>`));
      const hold = train.querySelector('.hold');
      const yard = el('div', 'yard emoji');
      let count = 0;
      const counter = el('div', 'counter', '0');
      const refresh = () => { counter.textContent = count; };
      for (let i = 0; i < N + 3 + (level === 3 ? 4 : 0); i++) {
        const b = el('button', 'pile-btn', item.e);
        b.setAttribute('aria-label', 'load one');
        b.onclick = () => {
          b.disabled = true; b.classList.add('gone'); count++;
          const s = el('button', 'loaded', item.e);
          s.setAttribute('aria-label', 'take one out');
          s.onclick = () => { s.remove(); b.disabled = false; b.classList.remove('gone'); count--; refresh(); ctx.say(String(count), true); };
          hold.appendChild(s);
          refresh(); ctx.say(String(count), true);
        };
        yard.appendChild(b);
      }
      const done = el('button', 'btn primary big', 'Done ✓');
      done.onclick = () => {
        if (count === N) ctx.answer(true);
        else { ctx.answer(false); ctx.say(count < N ? `You have ${count}. You need ${N}. Add more!` : `You have ${count}. You need ${N}. Take some out!`); }
      };
      ctx.setHint(done);
      const bar = el('div', 'donebar'); bar.append(counter, done);
      ctx.stage.append(train, yard, bar);
      ctx.track('numbers', N);
    },
  },
  {
    id: 'passengers', name: 'Count the Passengers', area: 'numbers', icon: '🧍', desc: 'Watch people get on and off. How many now?',
    round(ctx) {
      const { r, level } = ctx;
      const P = ['🧍', '🧍‍♀️', '🧒', '👵', '👨', '👩'];
      let start, on = 0, off = 0, ans;
      if (level === 1) { start = 1 + Math.floor(r() * 5); ans = start; }
      else if (level === 2) { start = 1 + Math.floor(r() * 5); on = 1 + Math.floor(r() * 4); ans = start + on; }
      else { start = 4 + Math.floor(r() * 6); on = 1 + Math.floor(r() * 6); off = 1 + Math.floor(r() * Math.min(start, 6)); ans = start + on - off; }
      const coach = el('div', 'coach', '<div class="cwin"></div><div class="cwheels"><i></i><i></i><i></i><i></i></div>');
      const win = coach.querySelector('.cwin');
      const plat = el('div', 'platform-strip');
      const people = [];
      const add = (n) => { for (let i = 0; i < n; i++) { const p = el('span', 'pp pop', pick(r, P)); win.appendChild(p); people.push(p); } };
      add(start);
      ctx.stage.append(coach, plat);
      const ask = () => {
        if (level === 3) win.classList.add('shut'); // older children work it out in their heads
        ctx.prompt('How many people are on the train now?', 'How many people are on the train <b>now</b>?', true);
        const near = new Set([ans]);
        while (near.size < (level === 1 ? 3 : 4)) { const d = 1 + Math.floor(r() * 3); const v = ans + (r() < 0.5 ? -d : d); if (v >= 0) near.add(v); }
        ctx.stage.appendChild(optionButtons(ctx, [...near].sort((a, b) => a - b), (n) => `<span class="big">${n}</span>`, (n) => n === ans, (n) => String(n)));
      };
      if (level === 1) { ctx.prompt('Count the people on the train!', 'Count the people on the train!'); setTimeout(ask, 900); }
      else {
        ctx.prompt(`${start} people are on the train.`, `<b>${start}</b> people are on the train…`);
        ctx.later(2200, () => {
          ctx.prompt(`${on} more get on.`, `<b>${on}</b> more get on!`, true);
          for (let i = 0; i < on; i++) ctx.later(300 * i, () => add(1));
          ctx.later(2400, () => {
            if (off) {
              ctx.prompt(`${off} get off.`, `<b>${off}</b> get off!`, true);
              for (let i = 0; i < off; i++) ctx.later(300 * i, () => { const p = people.pop(); if (p) { p.classList.add('leave'); plat.appendChild(el('span', 'pp', p.textContent)); setTimeout(() => p.remove(), 300); } });
              ctx.later(2400, ask);
            } else ask();
          });
        });
      }
      ctx.track('numbers', ans);
    },
  },
  {
    id: 'signal', name: 'Signal Says', area: 'thinking', icon: '🚦', desc: 'Go on green, wait on red. Watch for rule changes!',
    round(ctx) {
      const { r, level } = ctx;
      const trials = 6;
      let i = 0, ok = 0, opposite = false, tapped = false, current = null, timer = null;
      const sig = el('div', 'signal', '<span class="lamp r"></span><span class="lamp g"></span>');
      const banner = el('div', 'rule');
      const go = el('button', 'gobtn', 'GO!');
      const fb = el('div', 'tick');
      const rule = () => { banner.innerHTML = opposite ? '🙃 <b>Opposite day:</b> GO on <span style="color:#e53935">RED</span>' : (level >= 3 ? 'GO only on <span style="color:#43a047">GREEN circles</span>' : 'GO on <span style="color:#43a047">GREEN</span>, wait on red'); };
      rule();
      ctx.prompt(level >= 3 ? 'Tap GO only for green circles. Wait for anything else!' : 'Tap GO when the signal is green. Wait when it is red!', 'Tap <b>GO</b> at the right time!');
      ctx.stage.append(banner, sig, go, fb);
      const isGo = (c) => {
        const colourOk = opposite ? c.colour === 'red' : c.colour === 'green';
        return level >= 3 ? colourOk && c.shape === 'circle' : colourOk;
      };
      const show = () => {
        if (i >= trials) { ctx.answer(ok >= trials - 1, { final: true }); return; }
        if (level >= 2 && i === 3 && !opposite) {
          opposite = true; rule(); ctx.say('Opposite day! Now go on red!');
          sig.className = 'signal'; ctx.later(2200, show); return;
        }
        tapped = false;
        current = { colour: r() < 0.55 ? (opposite ? 'red' : 'green') : (opposite ? 'green' : 'red'), shape: level >= 3 && r() < 0.35 ? 'square' : 'circle' };
        sig.className = `signal on-${current.colour} ${current.shape}`;
        const dur = level === 1 ? 2000 : level === 2 ? 1500 : 1200;
        timer = ctx.later(dur, () => {
          const should = isGo(current);
          if (!tapped) { if (!should) { ok++; fb.textContent = '👍 Good waiting!'; } else fb.textContent = '⏰ That was a GO!'; }
          sig.className = 'signal'; i++;
          ctx.later(500, show);
        });
      };
      go.onclick = () => {
        if (!current || tapped || sig.className === 'signal') return;
        tapped = true;
        if (isGo(current)) { ok++; fb.textContent = '✅ Great!'; ctx.sfx('click'); } else { fb.textContent = '✋ Wait for it!'; ctx.sfx('error'); }
      };
      ctx.setHint(go);
      ctx.later(1200, show);
      void timer;
    },
  },
  {
    id: 'memory', name: 'Cargo Memory', area: 'thinking', icon: '🧠', desc: 'Remember the cargo, then load it.',
    round(ctx) {
      const { r, level } = ctx;
      const n = level === 1 ? 2 : level === 2 ? 3 + Math.floor(r() * 2) : 5;
      const inOrder = level >= 3;
      const items = sample(r, CARGO, n);
      ctx.prompt(`Remember these ${n} things!`, `Remember these <b>${n}</b> things!`);
      const show = el('div', 'train-row emoji', items.map((it) => wagon(`<span class="em">${it.e}</span>`)).join(''));
      ctx.stage.appendChild(show);
      ctx.later(1500 + n * 800, () => {
        show.innerHTML = items.map(() => wagon('<span class="em">❔</span>')).join('');
        ctx.prompt(inOrder ? 'Now tap them in the same order!' : 'Now tap all the things you saw!', inOrder ? 'Tap them in the <b>same order</b>' : 'Tap <b>all</b> the things you saw', true);
        const opts = shuffle(r, [...items, ...sample(r, CARGO.filter((c) => !items.includes(c)), Math.min(4, 3 + level - 1))]);
        const row = el('div', 'opts emoji');
        let got = 0;
        const wagons = show.querySelectorAll('.wbody');
        opts.forEach((it) => {
          const b = el('button', 'opt', `<span class="em">${it.e}</span>`);
          b.setAttribute('aria-label', it.name);
          b.onclick = () => {
            ctx.say(it.name, true);
            const idx = items.indexOf(it);
            const right = inOrder ? idx === got : idx >= 0 && !b.classList.contains('gone');
            if (!right) { b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 500); ctx.answer(false); return; }
            b.disabled = true; b.classList.add('gone');
            wagons[inOrder ? got : idx].innerHTML = `<span class="em">${it.e}</span>`;
            got++;
            if (got === n) ctx.answer(true);
            else ctx.setHint([...row.children].find((c) => !c.disabled && items.includes(opts[[...row.children].indexOf(c)]) && (!inOrder || opts[[...row.children].indexOf(c)] === items[got])));
          };
          row.appendChild(b);
        });
        ctx.setHint([...row.children].find((c, k) => items.includes(opts[k]) && (!inOrder || opts[k] === items[0])));
        ctx.stage.appendChild(row);
      });
    },
  },
];

export const AREAS = {
  colours: { name: 'Colours & shapes', icon: '🎨' },
  letters: { name: 'Letters & words', icon: '🔤' },
  numbers: { name: 'Numbers & maths', icon: '🔢' },
  thinking: { name: 'Thinking skills', icon: '🧠' },
};
