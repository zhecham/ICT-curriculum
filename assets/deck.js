(() => {
const L = window.LESSON, slides = document.querySelector('.slides');
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const PH = ['Starter', 'Learn', 'Practise', 'Check', 'Reflect'];
const seq = L.plan.sequence || [];
const mins = i => parseInt((seq[i] || {}).time, 10) || 5;

function sec(phase, notes, cls) {
  const s = el('section', cls || ''); s.dataset.phase = phase;
  if (notes) { const a = el('aside', 'notes'); a.textContent = notes; s.appendChild(a); }
  slides.appendChild(s); return s;
}
const h2 = (s, t) => s.appendChild(el('h2', null, esc(t)));

/* ---------- widgets ---------- */
function timer(min) {
  const w = el('div', 'timer'), d = el('span', 't'), b = el('button', 'btn', 'Start'), r = el('button', 'btn ghost', 'Reset');
  let t = min * 60, id = null;
  const show = () => { d.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; w.classList.toggle('done', t === 0); };
  const stop = () => { clearInterval(id); id = null; b.textContent = 'Start'; };
  b.onclick = () => { if (id) return stop(); if (t === 0) t = min * 60; b.textContent = 'Pause'; id = setInterval(() => { t = Math.max(0, t - 1); show(); if (!t) stop(); }, 1000); };
  r.onclick = () => { stop(); t = min * 60; show(); };
  w.append('⏱', d, b, r); show(); return w;
}
function mcq([q, opts, a, e]) {
  const w = el('div', 'mcq'), g = el('div', 'opts'), fb = el('p', 'fb');
  w.appendChild(el('p', 'q', esc(q)));
  opts.forEach((o, i) => {
    const b = el('button', 'opt', `<b>${'ABCD'[i]}</b>${esc(o)}`);
    b.onclick = () => {
      if (w.dataset.done) return; w.dataset.done = 1;
      b.classList.add(i === a ? 'right' : 'wrong'); g.children[a].classList.add('right');
      fb.textContent = (i === a ? '✔ Correct. ' : '✘ Not quite. ') + (e || ''); fb.className = 'fb show ' + (i === a ? 'ok' : 'no');
    };
    g.appendChild(b);
  });
  w.append(g, fb); return w;
}
function tf(list) {
  const w = el('div', 'tf');
  list.forEach(([st, ans, why]) => {
    const r = el('div', 'r'); r.appendChild(el('span', null, esc(st)));
    ['True', 'False'].forEach((lab, i) => {
      const b = el('button', 'btn ghost', lab);
      b.onclick = () => { const ok = (i === 0) === !!ans; r.className = 'r ' + (ok ? 'ok' : 'no'); r.firstChild.innerHTML = esc(st) + ` <span class="tiny">${ok ? '✔' : '✘'} ${ans ? 'True' : 'False'}${why ? ' – ' + esc(why) : ''}</span>`; };
      r.appendChild(b);
    });
    w.appendChild(r);
  });
  return w;
}
function order([q, items]) {
  const w = el('div', 'order'), box = el('div', 'items' + (items.length > 5 ? ' many' : '')), picked = [];
  w.appendChild(el('p', 'q', esc(q)));
  shuffle(items.map((t, i) => ({ t, i }))).forEach(o => {
    const b = el('button', 'it', `<span class="n"></span>${esc(o.t)}`);
    b.onclick = () => { if (picked.includes(o)) return; picked.push(o); b.classList.add('picked'); b.firstChild.textContent = picked.length; };
    box.appendChild(b);
  });
  const chk = el('button', 'btn', 'Check order'), rst = el('button', 'btn ghost', 'Reset'), fb = el('span', 'small');
  chk.onclick = () => { const ok = picked.length === items.length && picked.every((o, k) => o.i === k); w.className = 'order ' + (ok ? 'ok' : 'no'); fb.textContent = ok ? '✔ Correct order!' : '✘ Try again – check each step.'; };
  rst.onclick = () => { picked.length = 0; w.className = 'order'; fb.textContent = ''; box.querySelectorAll('.it').forEach(b => { b.classList.remove('picked'); b.firstChild.textContent = ''; }); };
  const row = el('div', 'row'); row.append(chk, rst, fb); w.append(box, row); return w;
}
function revealBox(q, a, label) {
  const w = el('div', 'reveal-box');
  if (q) w.appendChild(el('p', 'q', esc(q)));
  const b = el('button', 'btn ghost', label || 'Show answer');
  b.onclick = () => { w.classList.toggle('open'); b.textContent = w.classList.contains('open') ? 'Hide answer' : (label || 'Show answer'); };
  w.append(b, el('div', 'ans', esc(a).replace(/\n/g, '<br>'))); return w;
}
function code(src, lang) {
  const p = el('pre'), c = el('code', 'language-' + (lang || 'python'));
  c.setAttribute('data-trim', ''); c.setAttribute('data-noescape', ''); c.textContent = src; p.appendChild(c); return p;
}
function flow(str) {
  const w = el('div', 'flow');
  str.split(';').forEach((part, i) => {
    const [t, ...rest] = part.split(':'); const txt = rest.join(':').trim();
    if (i) w.appendChild(el('div', 'a'));
    if (t === 'D') { const [cond, side] = txt.split('|'); const n = el('div', 'n D', `<span>${esc(cond)}</span>`); if (side) n.appendChild(el('em', null, esc(side))); w.appendChild(n); w.appendChild(el('div', 'yes', 'Yes')); }
    else w.appendChild(el('div', 'n ' + t, `<span>${esc(txt)}</span>`));
  });
  return w;
}
function bits(n, mode, challenge) {
  const w = el('div'), grid = el('div', 'bits'), out = el('p', 'readout'), state = Array(n).fill(0);
  grid.style.gridTemplateColumns = `repeat(${n}, 62px)`;
  const pv = i => { const p = 2 ** (n - 1 - i); return mode === 'tc' && i === 0 ? -p : p; };
  for (let i = 0; i < n; i++) grid.appendChild(el('div', 'pv', pv(i)));
  let target = null; const tg = el('span', 'target');
  const val = () => state.reduce((s, b, i) => s + b * pv(i), 0);
  const upd = () => {
    const v = val(), uns = state.reduce((s, b, i) => s + b * 2 ** (n - 1 - i), 0);
    out.innerHTML = `Binary <b>${state.join('')}</b> &nbsp; Denary <b>${v}</b> &nbsp; Hex <b>${uns.toString(16).toUpperCase().padStart(Math.ceil(n / 4), '0')}</b>`;
    if (target !== null) { tg.textContent = v === target ? `🎯 ${target} – got it!` : `🎯 Make ${target}`; tg.classList.toggle('hit', v === target); }
  };
  for (let i = 0; i < n; i++) { const c = el('button', 'cell', '0'); c.onclick = () => { state[i] ^= 1; c.textContent = state[i]; c.classList.toggle('on', !!state[i]); upd(); }; grid.appendChild(c); }
  w.append(grid, out);
  if (challenge) {
    const b = el('button', 'btn', 'New challenge'), row = el('div', 'row');
    b.onclick = () => { const lo = mode === 'tc' ? -(2 ** (n - 1)) : 0, hi = mode === 'tc' ? 2 ** (n - 1) - 1 : 2 ** n - 1; target = lo + Math.floor(Math.random() * (hi - lo + 1)); upd(); };
    row.append(b, tg); w.appendChild(row);
  }
  upd(); return w;
}
function table(rows) {
  const t = el('table');
  rows.forEach((r, i) => { const tr = el('tr'); r.forEach(c => tr.appendChild(el(i ? 'td' : 'th', null, esc(c)))); t.appendChild(tr); });
  return t;
}
function list(items, frag) {
  const ul = el('ul'); items.forEach(t => { const li = el('li', frag ? 'fragment' : '', esc(t).replace(/`([^`]+)`/g, '<code>$1</code>')); ul.appendChild(li); }); return ul;
}
function block(s, b) { // one teaching slide body
  const parts = [];
  if (b.b) parts.push(list(b.b, b.frag));
  if (b.code) parts.push(code(b.code, b.lang || L.lang));
  if (b.flow) parts.push(flow(b.flow));
  if (b.bits) parts.push(bits(b.bits, b.mode, b.challenge));
  if (b.table) parts.push(table(b.table));
  if (b.reveal) parts.push(revealBox(b.reveal[0], b.reveal[1]));
  if (b.mcq) parts.push(mcq(b.mcq));
  if (b.order) parts.push(order(b.order));
  if (b.side && parts.length > 1) { const c = el('div', 'cols'); const l = el('div'), r = el('div'); l.appendChild(parts.shift()); parts.forEach(p => r.appendChild(p)); c.append(l, r); s.appendChild(c); }
  else parts.forEach(p => s.appendChild(p));
}

/* ---------- slides ---------- */
const P = L.plan, C = L.content;
// 1 title
{
  const s = sec('Starter', 'Welcome. Share the objectives on the next slide.', 'title-slide');
  const strip = el('div', 'bitstrip'); const wk = L.week.toString(2).padStart(8, '0');
  [...wk].forEach(b => strip.appendChild(el('i', b === '1' ? 'one' : '', b)));
  s.append(el('p', 'meta', `${esc(L.grade)} · Week ${L.week}, Lesson ${L.lesson}`), el('h1', null, esc(L.topic)), strip,
    el('p', 'bitnote', `Week ${L.week} in 8-bit binary`), el('p', 'meta', `${esc(L.pages)} &nbsp;|&nbsp; ${esc(P.currRef || '')}`));
}
// 2 objectives
{
  const s = sec('Starter', 'Read the objectives aloud. Students copy the success criteria.');
  h2(s, 'Today’s learning');
  const c = el('div', 'cols'), a = el('div', 'box tint'), b = el('div', 'box');
  a.append(el('h3', null, 'We are learning to…'), list(P.objectives || []));
  b.append(el('h3', null, 'I can…'), list((P.success || []).map(t => t.replace(/^I can /, ''))));
  c.append(a, b); s.appendChild(c);
}
// 3 starter
{
  const st = seq[0] || {}, s = sec('Starter', `Teacher: ${st.teacher || ''}`, 'quiz');
  h2(s, C.s && C.s.h || 'Starter');
  const x = C.s || {};
  if (x.tf) s.appendChild(tf(x.tf));
  if (x.mcq) s.appendChild(mcq(x.mcq));
  if (x.order) s.appendChild(order(x.order));
  if (x.code) s.appendChild(code(x.code, x.lang || L.lang));
  if (x.table) s.appendChild(table(x.table));
  if (x.p) s.appendChild(el('p', 'task', esc(x.p)));
  if (x.reveal) s.appendChild(revealBox(x.reveal[0], x.reveal[1]));
  const r = el('div', 'row'); r.style.marginTop = '.5em'; r.appendChild(timer(mins(0))); s.appendChild(r);
}
// 4 vocabulary
if ((P.vocab || []).some(v => v.includes(' – '))) {
  const s = sec('Learn', 'Students guess each definition before flipping. Encourage home-language equivalents.');
  h2(s, 'Key words'); s.appendChild(el('p', 'tiny', 'Say the word, guess the meaning, then click to check.'));
  const g = el('div', 'cards');
  P.vocab.filter(v => v.includes(' – ')).slice(0, 6).forEach(v => {
    const [w, d] = v.split(' – '); const c = el('button', 'card', `<div class="in"><div class="f">${esc(w)}</div><div class="b">${esc(d)}</div></div>`);
    c.onclick = () => c.classList.toggle('flip'); g.appendChild(c);
  });
  s.appendChild(g);
}
// 5 teaching slides
(C.t || []).forEach((b, i) => { const s = sec('Learn', i === 0 ? `Teacher: ${(seq[1] || {}).teacher || ''}` : (b.note || '')); h2(s, b.h); block(s, b); });
// 6 predict
if (C.p) { const s = sec('Practise', 'Predict individually, compare with a partner, then reveal.'); h2(s, 'Predict'); s.appendChild(el('p', 'small', 'What will this output? Write your prediction first.')); s.appendChild(code(C.p[0], C.p[2] || L.lang)); s.appendChild(revealBox(null, C.p[1], 'Reveal output')); }
if (C.o) { const s = sec('Practise', 'Pairs agree the order, then click to check.', 'quiz'); h2(s, 'Put it in order'); s.appendChild(order(C.o)); }
// 7 activities
[2, 3].forEach((k, j) => {
  const st = seq[k]; if (!st) return;
  const s = sec('Practise', `Teacher: ${st.teacher}`);
  const pair = /pair|partner|group|swap|peer/i.test(st.students + ' ' + st.teacher);
  h2(s, `Activity ${j + 1}`); s.appendChild(el('p', 'tiny', pair ? '👥 Work with a partner or group' : '👤 Work on your own'));
  s.appendChild(el('p', 'task', esc(st.students)));
  const ref = (st.teacher.match(/(Offline lab|Code lab|Code studio|Digital workshop|Activity|Investigation|Design-and-code lab|Worked example|WE|Research task|Check|Review|Progress check|Exam-style Q)\s*[\d.]*[A-Z]?\s*(['‘][^'’]+['’])?(\s*\(pp?\.\s*[\d–-]+\))?/g) || []).map(x => x.trim()).filter(x => x.length > 4).join(' · ');
  if (ref) s.appendChild(el('p', 'tiny', '📘 ' + esc(ref)));
  const r = el('div', 'row'); r.style.margin = '.5em 0'; r.appendChild(timer(mins(k))); s.appendChild(r);
  {
    const h = el('div', 'help');
    [['Need help?', P.support], ['Finished?', P.stretch], ['Language help', P.eal]].forEach(([t, v]) => { if (v) { const b = el('div', 'box tint'); b.append(el('h3', null, t), el('p', null, esc(v))); h.appendChild(b); } });
    s.appendChild(h);
  }
});
// 8 quick check
(C.q || []).forEach((q, i) => { const s = sec('Check', i === 0 ? 'Mini-whiteboards: everyone shows A–D, then click the class answer. Use the team scores if you like.' : '', 'quiz'); h2(s, `Quick check ${i + 1} of ${C.q.length}`); s.appendChild(mcq(q)); s.dataset.score = 1; });
// 9 myths
if ((P.misconceptions || []).length) {
  const s = sec('Check', 'Ask: myth or fact? Take votes, then reveal the fix.');
  h2(s, 'Mistake spotter'); s.appendChild(el('p', 'tiny', 'Each line is a common mistake. Explain why it causes problems, then click to check.'));
  P.misconceptions.slice(0, 3).forEach(m => {
    const [myth, fix] = m.split(' – '); const d = el('button', 'myth', `<span class="tag">✘</span>${esc(myth)}<div class="fix">✔ ${esc(fix || 'Talk with a partner: what goes wrong, and how do you avoid it?')}</div>`);
    d.style.display = 'block'; d.style.width = '100%'; d.style.textAlign = 'left'; d.onclick = () => d.classList.toggle('open'); s.appendChild(d);
  });
}
// 10 exit ticket
if (C.x) {
  const st = seq[4] || {}, s = sec('Reflect', `Teacher: ${st.teacher || ''}`);
  h2(s, 'Exit ticket'); s.appendChild(el('p', 'tiny', 'Answer on paper on your own. Hand it in as you leave.'));
  s.appendChild(revealBox(C.x[0], C.x[1]));
  const r = el('div', 'row'); r.style.marginTop = '.6em'; r.appendChild(timer(mins(4))); s.appendChild(r);
}
// 11 reflect
{
  const s = sec('Reflect', 'Students rate each success criterion. Note reds for next lesson.');
  h2(s, 'How did you do?');
  const w = el('div', 'lights');
  (P.success || []).forEach(t => {
    const r = el('div', 'r'), btns = el('span');
    r.appendChild(el('span', null, esc(t)));
    [['g', 'Confident'], ['a', 'Nearly'], ['x', 'Need help']].forEach(([c, lab]) => { const b = el('button', c); b.title = lab; b.setAttribute('aria-label', lab); b.onclick = () => { btns.querySelectorAll('button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); }; btns.appendChild(b); });
    r.appendChild(btns); w.appendChild(r);
  });
  s.appendChild(w);
  if (P.homework) { const b = el('div', 'box tint'); b.style.marginTop = '.6em'; b.append(el('h3', null, 'Homework'), el('p', 'small', esc(P.homework))); s.appendChild(b); }
}

/* ---------- chrome ---------- */
const rail = el('div'); rail.id = 'rail'; PH.forEach(p => rail.appendChild(el('span', null, p))); document.body.appendChild(rail);
const foot = el('div', null, `${esc(L.grade)} · Week ${L.week} · Lesson ${L.lesson} · ${esc(L.pages)}`); foot.id = 'foot'; document.body.appendChild(foot);
const sc = el('div'); sc.id = 'score';
['Team A', 'Team B'].forEach(t => { const d = el('div', null, `${t} <b>0</b>`), m = el('button', null, '−'), p = el('button', null, '+'), v = d.querySelector('b'); m.onclick = () => v.textContent = Math.max(0, +v.textContent - 1); p.onclick = () => v.textContent = +v.textContent + 1; d.append(m, p); sc.appendChild(d); });
document.body.appendChild(sc);
const sync = e => { const s = e.currentSlide, k = PH.indexOf(s.dataset.phase); [...rail.children].forEach((x, i) => x.className = i === k ? 'on' : i < k ? 'done' : ''); sc.classList.toggle('show', !!s.dataset.score); };

Reveal.initialize({ width: 1280, height: 720, margin: 0.03, hash: true, slideNumber: 'c/t', transition: 'fade', transitionSpeed: 'fast', center: false, plugins: [RevealHighlight, RevealNotes] })
  .then(() => sync({ currentSlide: Reveal.getCurrentSlide() }));
Reveal.on('slidechanged', sync);
})();
