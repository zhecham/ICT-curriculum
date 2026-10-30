/* Shared Revision Lab interface. Content and scoring are supplied separately. */
(() => {
  'use strict';

  const DATA = window.REVISION_DATA;
  const Core = window.RevisionCore;
  const main = document.getElementById('main');
  if (!DATA || !Core || !Array.isArray(DATA.questions)) {
    main.textContent = 'The revision workshop could not load. Please refresh the page.';
    return;
  }

  const questions = DATA.questions;
  const questionMap = new Map(questions.map(q => [q.id, q]));
  function challengeQuestions(session = state.exam) {
    return Array.isArray(session?.questionIds) ? session.questionIds.map(id => questionMap.get(id)).filter(Boolean) : [];
  }
  function questionLabel(q, mode = 'practice') {
    if (mode === 'practice') return `Practice ${String(questions.indexOf(q) + 1).padStart(2, '0')}`;
    const position = challengeQuestions().findIndex(item => item.id === q.id);
    return position >= 0 ? `Question ${position + 1}` : 'Question';
  }
  function kindLabel(q) {
    return q.kind === 'mcq' ? 'Multiple choice' : q.kind === 'applied' ? 'Applied practice' : 'Written practice';
  }
  function neutralRoute(value) {
    if (value === 'exam') return 'timed';
    if (value === 'exam-review') return 'challenge-review';
    return value;
  }
  const topicMap = new Map(DATA.topics.map(t => [t.id, t]));
  const storageKey = `cezeri-revision-grade-${DATA.grade}-v1`;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  const dialog = document.getElementById('dialog');
  const dialogContent = document.getElementById('dialog-content');
  const importInput = document.getElementById('progress-import');
  const rawAnimations = window.REVISION_ANIMATIONS || [];
  const animationFiles = new Map((Array.isArray(rawAnimations) ? rawAnimations : rawAnimations.animations || []).map(a => [a.id, a]));
  let state;
  let storageWarning = '';
  try {
    const saved = localStorage.getItem(storageKey);
    state = saved ? Core.validateImport(JSON.parse(saved), DATA) : Core.freshState(DATA.grade);
  } catch (_) {
    state = Core.freshState(DATA.grade);
    storageWarning = 'Saved progress could not be restored. You can still practise and import a saved progress file.';
  }
  state.filters = state.filters || { bank: 'all', topic: 'all' };
  let route = 'home';
  let deck = null;
  let viewAbort = null;
  let viewToken = 0;
  let visibleQuestions = [];
  let currentIndex = 0;
  let workshopMode = 'practice';
  let saveTimer = null;
  let toastTimer = null;
  let pendingImport = null;
  let finishingChallenge = false;
  let persistFailed = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lines = value => esc(value).replace(/\n/g, '<br>');
  const domId = (...parts) => parts.map(v => String(v).replace(/[^a-zA-Z0-9_-]/g, '-')).join('-');
  const key = (part, widget) => Core.key(part, widget);
  const qState = q => Core.ensureQState(state, typeof q === 'string' ? q : q.id);
  const hasOwn = (object, property) => Object.prototype.hasOwnProperty.call(object || {}, property);
  const selected = (value, expected) => value === expected ? ' selected' : '';
  const disabled = value => value ? ' disabled' : '';

  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    layers: '<path d="m12 3 10 6-10 6L2 9z"/><path d="m3 13 9 5 9-5M3 17l9 5 9-5"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
    chart: '<path d="M4 3v17h17M8 16v-5M13 16V7M18 16v-9"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    left: '<path d="m14 6-6 6 6 6"/>',
    right: '<path d="m10 6 6 6-6 6"/>',
    up: '<path d="m6 14 6-6 6 6"/>',
    down: '<path d="m6 10 6 6 6-6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    book: '<path d="M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3zM21 4h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h5z"/>',
    spark: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    retry: '<path d="M4 8V3m0 5h5M4.5 7.5A8 8 0 1 1 4 16"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2M12 17h.01"/>',
    bulb: '<path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0c-1 .8-1 1.6-1 2H9c0-.4 0-1.2-1-2"/>',
    moon: '<path d="M20 15a8 8 0 0 1-11-11 9 9 0 1 0 11 11z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>',
    printer: '<path d="M7 8V3h10v5M7 16H4V9h16v7h-3M7 13h10v8H7zM17 11h.01"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    medal: '<circle cx="12" cy="9" r="6"/><path d="m8 14-2 8 6-3 6 3-2-8"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
    folder: '<path d="M3 6V4h7l2 3h9v13H3z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'
  };
  function icon(name) {
    return `<svg class="icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.book}</svg>`;
  }
  function button(action, label, iconName = '', attributes = '', style = '') {
    return `<button type="button" class="btn ${style}" data-action="${esc(action)}" ${attributes}>${iconName ? icon(iconName) : ''}${esc(label)}</button>`;
  }
  function safeMedia(value) {
    const s = String(value || '');
    if (!s || /[<>"'\u0000-\u001f]/.test(s) || s.startsWith('//') || /(^|\/)\.\.(\/|$)/.test(s)) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return '';
    return s;
  }
  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4300);
  }
  function save(immediate = false) {
    clearTimeout(saveTimer);
    const write = () => {
      state.updatedAt = Date.now();
      try {
        localStorage.setItem(storageKey, JSON.stringify(Core.exportState(state)));
        persistFailed = false;
      } catch (_) {
        if (!persistFailed) toast('Your browser cannot save progress here. Export a progress file before leaving.');
        persistFailed = true;
      }
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 180);
  }
  function mastered(q) {
    const s = qState(q);
    return Boolean(s.mastered && !s.assisted && !s.needsRecall && s.attempts > 0 && Core.scoreQuestion(q, s.answers || {}).score === q.marks);
  }
  function hasChallengeMiss(q) {
    return state.exam?.status === 'finished' && hasOwn(state.exam.results, q.id) && state.exam.results[q.id].score < q.marks;
  }
  function needsReview(q) {
    const s = qState(q);
    return !mastered(q) && (s.needsRecall || s.attempts > 0 || s.assisted || hasChallengeMiss(q));
  }
  function stats() {
    return { ...Core.assessment(state, DATA), reviewCount: questions.filter(needsReview).length };
  }
  function topicStats(topicId) {
    const group = questions.filter(q => q.topics.includes(topicId));
    return { total: group.length, mastered: group.filter(mastered).length, review: group.filter(needsReview).length };
  }
  function formatDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function readableDate(value) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  }
  function isAnswered(w, value) {
    if (w.type === 'choice') return Number.isInteger(value) && value >= 0 && value < w.options.length;
    if (w.type === 'order') return Array.isArray(value) && value.length === w.items.length && new Set(value).size === w.items.length && value.every(i => Number.isInteger(i) && i >= 0 && i < w.items.length);
    return typeof value === 'string' && value.trim().length > 0;
  }
  function completeQuestion(q, answers) {
    return q.parts.every(p => p.widgets.every(w => isAnswered(w, answers?.[key(p, w)])));
  }
  function uiForPart(q, part) {
    const s = qState(q);
    s.stepOpen = s.stepOpen || {};
    const old = s.stepOpen[part.id];
    if (old && typeof old === 'object') return { shown: Math.min(part.steps.length, Math.max(0, Number(old.shown) || 0)), model: Boolean(old.model) };
    return { shown: old === true ? part.steps.length : Math.min(part.steps.length, Math.max(0, Number(old) || 0)), model: false };
  }
  function updateTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    const el = document.getElementById('theme-toggle');
    el.innerHTML = icon(dark ? 'sun' : 'moon');
    el.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
    el.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
  }
  function cleanupView() {
    viewToken += 1;
    main.querySelectorAll('video').forEach(v => v.pause());
    viewAbort?.abort();
    viewAbort = null;
    if (deck) {
      try { deck.destroy(); } catch (_) { /* A previous view may still be initializing. */ }
      deck = null;
    }
  }
  function navigate(next, options = {}) {
    next = neutralRoute(next);
    const allowed = ['home', 'practice', 'learn', 'progress', 'timed', 'results', 'challenge-review'];
    if (!allowed.includes(next)) next = 'home';
    if (state.exam?.status === 'active' && next !== 'timed' && !options.force) {
      try { history.replaceState(null, '', '#timed'); } catch (_) { /* Keep the challenge active. */ }
      openDialog(`<h2>Your challenge is running</h2><p>Finish your timed challenge before opening revision tools. Your answers are saved and the timer keeps running.</p><div class="button-row">${button('close-dialog', 'Keep working', 'arrow', '', 'btn-primary')}${button('confirm-finish-dialog', 'Finish and review', 'check')}</div>`);
      return;
    }
    if ((next === 'results' || next === 'challenge-review') && state.exam?.status !== 'finished') next = 'home';
    if (next === 'timed' && state.exam?.status !== 'active') next = state.exam?.status === 'finished' ? 'results' : 'home';
    if (options.bank) state.filters.bank = options.bank;
    if (options.topic) state.filters.topic = options.topic;
    if (options.questionId && questionMap.has(options.questionId)) {
      if (next === 'challenge-review' || next === 'timed') state.exam.currentQuestionId = options.questionId;
      else state.lastQuestion = options.questionId;
    }
    cleanupView();
    route = next;
    state.lastView = next;
    document.querySelectorAll('.nav-link').forEach(el => {
      const navRoute = ['timed', 'results', 'challenge-review'].includes(next) ? 'practice' : next;
      const active = el.dataset.route === navRoute;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    try { history.replaceState(null, '', `#${next}`); } catch (_) { /* Preview hosts can restrict history changes. */ }
    if (next === 'home') renderHome();
    else if (next === 'practice') renderPractice('practice');
    else if (next === 'timed') renderPractice('timed');
    else if (next === 'challenge-review') renderPractice('review');
    else if (next === 'learn') renderLearn();
    else if (next === 'progress') renderProgress();
    else renderResults();
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
    save();
  }

  function renderHome() {
    const s = stats();
    const percent = Math.round(s.masteredCount / questions.length * 100);
    main.innerHTML = `<div class="page">
      <section class="hero" aria-labelledby="home-title">
        <div class="hero-copy"><p class="eyebrow">Grade ${DATA.grade} · Computer Science</p><h1 id="home-title">Think clearly.<br><span>Build confidence.</span></h1><p>A mixed bank of ${questions.length} practice tasks, with clear steps when you get stuck. Practise a little, understand the reason, then try it from memory.</p>
          <div class="button-row">${button('open-workshop', state.lastQuestion ? 'Continue your workshop' : 'Open your workshop', 'arrow', '', 'btn-primary')}${button('start-challenge-dialog', 'Start a timed challenge', 'clock')}</div>
          <div class="hero-meta"><span>${icon('clock')}60-minute challenges</span><span>${icon('book')}Practice across all topics</span><span>${icon('shield')}Progress saved on this device</span></div>
        </div>
        <div class="mission-art" role="img" aria-label="Revision journey: explore the ideas, practise the questions, then recall them without solutions.">
          <div class="art-top"><span><i class="live-dot"></i>YOUR LEARNING ROUTE</span><span>G${DATA.grade}</span></div>
          <div class="route-visual"><div class="route-tower"><div class="route-step done"><span class="step-dot">01</span><div><small>EXPLORE</small><strong>${DATA.topics.length} connected topics</strong></div></div><div class="route-step active"><span class="step-dot">02</span><div><small>PRACTISE</small><strong>${questions.length} questions to try</strong></div></div><div class="route-step"><span class="step-dot">03</span><div><small>RECALL</small><strong>Make the ideas stick</strong></div></div></div><div class="art-orbit"><div class="art-core"><strong>${s.totalPoints}</strong><span>GUIDED POINTS</span></div></div></div>
          <div class="art-bottom"><span>One good step at a time.</span><code>LEARN → TRY → RECALL</code></div>
        </div>
      </section>
      <section class="stats-strip" aria-label="Your revision at a glance">
        ${statCard('book', questions.length, 'practice tasks')}${statCard('spark', s.totalPoints, 'guided practice points')}${statCard('target', `${percent}%`, 'of questions mastered')}${statCard('retry', s.reviewCount, 'questions to revisit')}
      </section>
      <section aria-labelledby="topics-heading"><div class="section-head"><div><h2 id="topics-heading">Choose a place to begin</h2><p>Start with one topic, or explore the full practice bank.</p></div>${button('open-guide', 'Topic guide', 'book', '', 'btn-quiet btn-sm')}</div>
        <div class="topic-grid">${DATA.topics.map((t, i) => { const tStat = topicStats(t.id); return `<button class="topic-card card" type="button" data-action="topic-practice" data-topic="${esc(t.id)}"><span class="topic-number">TOPIC ${String(i + 1).padStart(2, '0')} · ${esc(t.id)}</span><h3>${esc(t.title)}</h3><div class="progress-track" aria-hidden="true"><div class="progress-fill" style="--percent:${tStat.total ? tStat.mastered / tStat.total * 100 : 0}%"></div></div><div class="topic-footer"><span>${tStat.mastered} of ${tStat.total} questions mastered</span>${icon('arrow')}</div></button>`; }).join('')}</div>
      </section>
      ${paperNote()}
      <div class="footer-note"><span>CEZERI · Grade ${DATA.grade} Computer Science</span><span>School revision questions with guided checks and complete marking points.</span></div>
    </div>`;
  }
  function statCard(symbol, value, label) {
    return `<div class="stat card"><span class="stat-icon">${icon(symbol)}</span><div><strong>${esc(value)}</strong><small>${esc(label)}</small></div></div>`;
  }
  function paperNote() {
    return `<aside class="study-note">${icon('book')}<p><strong>Build the answer on paper, too.</strong> These guided checks help you practise the ideas. Write your own working and full responses, then compare them with the model answer and marking points.</p></aside>`;
  }
  function filteredQuestions() {
    const f = state.filters;
    return questions.filter(q => (f.bank === 'all' || f.bank === 'mcq' && q.kind === 'mcq' || f.bank === 'written' && q.kind !== 'mcq' || f.bank === 'review' && needsReview(q)) && (f.topic === 'all' || q.topics.includes(f.topic)));
  }
  function railStatus(q) {
    if (mastered(q)) return 'mastered';
    return needsReview(q) ? 'learning' : '';
  }
  function jumpButtons(mode) {
    return visibleQuestions.map((q, i) => {
      let status = mode === 'practice' ? railStatus(q) : '';
      if (mode === 'timed') status = completeQuestion(q, state.exam.answers[q.id] || {}) ? 'mastered' : 'learning';
      if (mode === 'review') status = state.exam.results[q.id]?.score === q.marks ? 'mastered' : 'learning';
      const statusLabel = mode === 'timed' ? (status === 'mastered' ? ', answered' : ', to complete') : status === 'mastered' ? (mode === 'review' ? ', full score' : ', mastered') : status === 'learning' ? ', revisit' : '';
      const label = mode === 'practice' ? String(questions.indexOf(q) + 1).padStart(2, '0') : String(i + 1);
      return `<button class="q-jump ${status} ${i === currentIndex ? 'current' : ''}" type="button" data-action="jump" data-index="${i}" aria-label="${esc(questionLabel(q, mode))}: ${esc(q.title)}${statusLabel}" ${i === currentIndex ? 'aria-current="true"' : ''}>${esc(label)}</button>`;
    }).join('');
  }
  function renderPractice(mode) {
    workshopMode = mode;
    if (!['all', 'mcq', 'written', 'review'].includes(state.filters.bank)) state.filters.bank = 'all';
    if (state.filters.topic !== 'all' && !topicMap.has(state.filters.topic)) state.filters.topic = 'all';
    visibleQuestions = mode === 'practice' ? filteredQuestions() : challengeQuestions();
    const resume = mode === 'practice' ? state.lastQuestion : state.exam.currentQuestionId;
    currentIndex = Math.max(0, visibleQuestions.findIndex(q => q.id === resume));
    const s = stats();
    const railValue = mode === 'timed' ? challengeQuestions().filter(q => completeQuestion(q, state.exam.answers[q.id] || {})).length : mode === 'review' ? state.exam.score : s.masteredCount;
    const railMaximum = mode === 'timed' ? challengeQuestions().length : mode === 'review' ? 50 : questions.length;
    const pageTitle = mode === 'timed' ? 'Timed challenge' : mode === 'review' ? 'Challenge review' : 'Your revision workshop';
    const subtitle = mode === 'timed' ? 'Use your own working. Checking and solutions unlock when you finish.' : mode === 'review' ? 'Your submitted answers are kept here. Study the solution, then try a fresh recall attempt.' : 'Try the question first. Use a hint or work through the steps when you need them.';
    let filters = '';
    if (mode === 'practice') filters = `<div class="filters"><label><span class="small muted">Practice type</span><br><select id="bank-filter" class="select" aria-label="Filter practice type"><option value="all"${selected(state.filters.bank, 'all')}>All practice</option><option value="mcq"${selected(state.filters.bank, 'mcq')}>Multiple choice</option><option value="written"${selected(state.filters.bank, 'written')}>Written practice</option><option value="review"${selected(state.filters.bank, 'review')}>Review queue (${s.reviewCount})</option></select></label><label><span class="small muted">Topic</span><br><select id="topic-filter" class="select" aria-label="Filter by topic"><option value="all"${selected(state.filters.topic, 'all')}>All topics</option>${DATA.topics.map(t => `<option value="${esc(t.id)}"${selected(state.filters.topic, t.id)}>${esc(t.title)}</option>`).join('')}</select></label></div>`;
    else if (mode === 'timed') filters = `<div class="timer-pill" id="challenge-timer" role="timer" aria-label="Time remaining">${formatDuration((state.exam.deadline - Date.now()) / 1000)}</div>`;
    else filters = button('show-results', 'Back to results', 'chart');
    main.innerHTML = `<div class="practice-page"><div class="practice-toolbar"><div><h1>${pageTitle}</h1><div class="subtitle">${subtitle}</div></div>${filters}</div>
      ${mode === 'timed' ? `<div class="challenge-banner"><span><strong>60 minutes · 50 marks.</strong> Your answers are saved as you work. The timer continues if this page is closed.</span>${button('confirm-finish-dialog', 'Finish challenge', 'check', '', 'btn-sm')}</div>` : ''}
      ${visibleQuestions.length ? `<details class="mobile-jump"><summary><span id="mobile-position">Question ${currentIndex + 1} of ${visibleQuestions.length}</span> · Jump to a question</summary><div class="question-grid">${jumpButtons(mode)}</div></details><div class="practice-layout"><aside class="question-rail card" aria-label="Question navigation"><h3>${mode === 'practice' ? 'YOUR PRACTICE MAP' : 'YOUR TIMED CHALLENGE'}</h3><div class="question-grid">${jumpButtons(mode)}</div><div class="rail-legend"><span><i class="legend-dot good"></i>${mode === 'timed' ? 'Answered' : mode === 'review' ? 'Full score' : 'Mastered'}</span><span><i class="legend-dot warn"></i>${mode === 'timed' ? 'To complete' : 'Revisit'}</span></div><div class="rail-summary">${mode === 'timed' ? 'Questions answered' : mode === 'review' ? 'Your challenge score' : 'Questions mastered'}<strong id="rail-total">${railValue} / ${railMaximum}</strong><div class="progress-track"><div class="progress-fill" id="rail-progress" style="--percent:${railValue / railMaximum * 100}%"></div></div>${mode === 'practice' ? button('open-progress', 'View progress', 'chart', '', 'btn-sm') : ''}</div></aside><div class="deck-shell"><div class="reveal" id="revision-deck" role="region" aria-label="Question workshop"><div class="slides">${visibleQuestions.map((q, i) => `<section data-qid="${esc(q.id)}" class="${i === currentIndex ? 'present' : ''}" aria-label="${esc(questionLabel(q, mode))}">${renderQuestion(q, mode)}</section>`).join('')}</div></div><div class="deck-footer">${button('previous-question', 'Previous', 'left', disabled(currentIndex === 0))}<span class="deck-position" id="deck-position">${currentIndex + 1} of ${visibleQuestions.length}</span>${button('next-question', 'Next', 'right', disabled(currentIndex === visibleQuestions.length - 1))}</div></div></div>` : `<div class="empty-state card">${icon('check')}<h2>${state.filters.bank === 'review' ? 'Your review queue is clear' : 'No questions in this selection'}</h2><p class="muted">${state.filters.bank === 'review' ? 'Questions you miss or study with a solution will appear here until you recall them successfully. There are still more ideas to practise in the practice bank.' : 'Choose another topic or open the full practice bank.'}</p>${button('reset-filters', 'Open the full practice bank', 'layers', '', 'btn-primary')}</div>`}
      <p class="paper-note">Guided checks prepare you for complete written answers. ${mode === 'timed' ? 'Models and marking points become available after you finish.' : 'Keep your working on paper; every question includes its full model and marking points.'}</p></div>`;
    if (!visibleQuestions.length) return;
    const token = viewToken;
    const startIndex = currentIndex;
    if (typeof window.Reveal === 'function') {
      const instance = new window.Reveal(document.getElementById('revision-deck'), {
        embedded: true, disableLayout: true, controls: false, progress: false, keyboard: false,
        touch: false, center: false, hash: false, history: false, respondToHashChanges: false,
        overview: false, help: false, transition: reducedMotion.matches ? 'none' : 'fade',
        backgroundTransition: 'none', autoAnimate: false, slideNumber: false,
        scrollActivationWidth: null, navigationMode: 'linear', display: 'block'
      });
      deck = instance;
      Promise.resolve(instance.initialize()).then(() => {
        if (token !== viewToken) { instance.destroy(); return; }
        instance.on('slidechanged', event => setCurrentQuestion(event.indexh));
        instance.slide(startIndex);
        setCurrentQuestion(startIndex);
      }).catch(() => {
        if (token === viewToken) {
          deck = null;
          setCurrentQuestion(startIndex);
        }
      });
    } else setCurrentQuestion(startIndex);
  }
  function answersFor(q, mode = workshopMode) {
    return mode === 'practice' ? qState(q).answers || {} : state.exam?.answers?.[q.id] || {};
  }
  function resultFor(q, mode) {
    if (mode === 'timed') return null;
    if (mode === 'review') return Core.scoreQuestion(q, answersFor(q, mode));
    return qState(q).checked ? Core.scoreQuestion(q, answersFor(q, mode)) : null;
  }
  function renderQuestion(q, mode) {
    const s = qState(q);
    const answers = answersFor(q, mode);
    const result = resultFor(q, mode);
    return `<div class="question-scroll"><header class="q-header"><div><div class="q-kicker"><span class="bank-tag">${esc(kindLabel(q))}</span><span>${esc(questionLabel(q, mode))}</span></div><h2>${esc(q.title)}</h2></div><span class="mark-badge">${q.marks} ${q.marks === 1 ? 'mark' : 'marks'}</span></header>
      <div class="q-topics">${q.topics.map(t => `<span class="topic-chip">${esc(topicMap.get(t)?.title || t)}</span>`).join('')}</div>
      ${q.context?.length ? `<div class="context">${renderBlocks(q.context, q.id)}</div>` : ''}
      ${q.visual?.type === 'trace-flowchart' ? traceFlowchart(q) : ''}
      ${q.parts.map(p => renderPart(q, p, answers, result, mode)).join('')}
      ${q.visual?.type === 'flowchart-builder' ? `<div id="${domId('visual', q.id)}">${builderFlowchart(q, answers)}</div>` : ''}
      <div id="${domId('feedback', q.id)}" aria-live="polite">${result ? questionFeedback(q, result, mode) : ''}</div>
      <div class="question-actions">${mode === 'timed' ? `<p class="small muted">Continue when you are ready. You can return to this question before finishing.</p>` : mode === 'review' ? button('recall-from-challenge', 'Try a fresh recall attempt', 'retry', `data-qid="${esc(q.id)}"`, 'btn-primary') : `${button('check-question', 'Check this question', 'check', `data-qid="${esc(q.id)}"`, 'btn-primary')}${button('recall-retry', 'Recall retry', 'retry', `data-qid="${esc(q.id)}"`)}${s.assisted ? '<p class="small muted">A fresh recall attempt hides the solution and clears your answers. Your best score and earlier attempts stay saved.</p>' : ''}`}</div>
    </div>`;
  }
  function renderPart(q, p, answers, result, mode) {
    const s = qState(q);
    const hintOpen = Boolean(s.hints?.[p.id]);
    return `<div class="part" id="${domId('part', q.id, p.id)}"><div class="part-prompt"><p>${q.parts.length > 1 ? `<span class="part-label">${esc(p.id)}</span>` : ''}${lines(p.prompt)}</p><span class="part-marks">[${p.marks}]</span></div>${renderBlocks(p.blocks || [], `${q.id}-${p.id}`)}
      <div class="widgets">${p.widgets.map(w => renderWidget(q, p, w, answers[key(p, w)], result?.fields?.[key(p, w)], mode)).join('')}</div>
      ${mode === 'timed' ? '' : `<div class="part-tools">${button('toggle-hint', hintOpen ? 'Hide hint' : 'A small hint', 'bulb', `data-qid="${esc(q.id)}" data-pid="${esc(p.id)}" aria-expanded="${hintOpen}"`, 'btn-sm btn-quiet')}${button('show-step', 'Step by step', 'play', `id="${domId('steps-button', q.id, p.id)}" data-qid="${esc(q.id)}" data-pid="${esc(p.id)}"`, 'btn-sm btn-accent')}${button('show-model', 'Model and marking points', 'book', `data-qid="${esc(q.id)}" data-pid="${esc(p.id)}"`, 'btn-sm btn-quiet')}</div>${hintOpen ? `<div class="hint-box"><strong>Try this:</strong> ${esc(p.hint)}</div>` : ''}${renderSolution(q, p)}`}
    </div>`;
  }
  function renderWidget(q, p, w, value, correctness, mode) {
    const id = domId('answer', q.id, p.id, w.id);
    const readonly = mode === 'review';
    const status = correctness === true ? 'correct' : correctness === false ? 'incorrect' : '';
    const common = `data-qid="${esc(q.id)}" data-pid="${esc(p.id)}" data-wid="${esc(w.id)}" data-key="${esc(key(p, w))}"`;
    let control = '';
    if (w.type === 'choice') {
      control = `<fieldset><legend>${esc(w.label)}</legend><div class="choices">${w.options.map((option, i) => `<label class="choice" for="${id}-${i}"><input type="radio" id="${id}-${i}" name="${id}" value="${i}" ${common}${value === i ? ' checked' : ''}${disabled(readonly)}><span><span class="option-letter">${String.fromCharCode(65 + i)}.</span>${esc(option)}</span></label>`).join('')}</div></fieldset>`;
    } else if (w.type === 'text') {
      control = `<label class="widget-label" for="${id}">${esc(w.label)}</label><input class="answer-input" id="${id}" type="text" value="${esc(typeof value === 'string' ? value : '')}" placeholder="${esc(w.placeholder || 'Type your answer')}" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="4096" ${w.normalize === 'binary' ? 'inputmode="numeric"' : ''} ${common}${disabled(readonly)} aria-describedby="${id}-feedback">`;
    } else {
      const order = isAnswered(w, value) ? value : w.items.map((_, i) => i);
      control = `<div class="widget-label" id="${id}-label">${esc(w.label)}</div><div class="order-list" aria-labelledby="${id}-label">${order.map((itemIndex, i) => `<div class="order-row"><span>${i + 1}. ${esc(w.items[itemIndex])}</span><button type="button" class="icon-button" data-action="move-order" ${common} data-position="${i}" data-direction="-1" aria-label="Move ${esc(w.items[itemIndex])} up"${disabled(readonly || i === 0)}>${icon('up')}</button><button type="button" class="icon-button" data-action="move-order" ${common} data-position="${i}" data-direction="1" aria-label="Move ${esc(w.items[itemIndex])} down"${disabled(readonly || i === order.length - 1)}>${icon('down')}</button></div>`).join('')}</div>${!readonly && !isAnswered(w, value) ? `<div class="button-row" style="margin-top:10px">${button('record-order', 'Use this order', 'check', common, 'btn-sm')}</div>` : ''}`;
    }
    const feedback = correctness === true ? 'Correct · ' + w.marks + (w.marks === 1 ? ' point' : ' points') : correctness === false ? (isAnswered(w, value) ? mode === 'review' ? 'Not correct in this challenge' : 'Not yet · check the question and try again' : 'No answer recorded for this check') : '';
    return `<div class="widget ${status}" id="${id}-widget">${control}<div class="field-feedback" id="${id}-feedback">${esc(feedback)}</div></div>`;
  }
  function renderSolution(q, p) {
    const ui = uiForPart(q, p);
    if (!ui.shown && !ui.model) return '';
    return `<div class="solution-panel"><div class="solution-head"><h4>Work it through</h4><small>${ui.shown} of ${p.steps.length} steps</small></div><div aria-live="polite">${p.steps.slice(0, ui.shown).map((s, i) => `<div class="solution-step"><span class="step-index">${i + 1}</span><div><h4>${esc(s.title)}</h4><p>${esc(s.text)}</p>${s.code ? `<pre class="code-block"><code>${esc(s.code)}</code></pre>` : ''}</div></div>`).join('')}</div><div class="solution-controls">${button('next-step', 'Next step', 'right', `data-qid="${esc(q.id)}" data-pid="${esc(p.id)}"${disabled(ui.shown >= p.steps.length)}`, 'btn-sm btn-accent')}${button('replay-steps', 'Replay', 'retry', `data-qid="${esc(q.id)}" data-pid="${esc(p.id)}"`, 'btn-sm')}${button('all-steps', 'Show all steps', 'layers', `data-qid="${esc(q.id)}" data-pid="${esc(p.id)}"${disabled(ui.shown >= p.steps.length)}`, 'btn-sm')}</div><details class="model-answer" data-model-qid="${esc(q.id)}" data-model-pid="${esc(p.id)}"${ui.model ? ' open' : ''}><summary>Full model answer and marking points</summary><pre>${esc(p.model)}</pre><ul class="rubric">${p.rubric.map(r => `<li>${esc(r)}</li>`).join('')}</ul><p class="small muted">Use these points to check your full written answer. Guided checks score the selections and entries above.</p></details></div>`;
  }
  function questionFeedback(q, result, mode) {
    if (mode === 'review') return `<div class="q-feedback ${result.score === result.max ? 'success' : ''}"><strong>Challenge score: ${result.score} / ${result.max}</strong><p>Your submitted answers stay unchanged. Use the steps and marking points to understand anything you missed.</p></div>`;
    const s = qState(q);
    const full = result.score === result.max;
    const isMastered = mastered(q);
    const previousResult = full && !s.assisted && !isMastered;
    let message;
    if (isMastered) message = 'You answered every guided check correctly without opening the solution in this attempt. This question is mastered.';
    else if (full && s.assisted) message = 'All the guided checks are correct. You have studied the solution, so use Recall retry to try again without it.';
    else if (previousResult) message = hasChallengeMiss(q) ? 'These are your previous workshop answers. Your recent challenge showed that this question needs another recall attempt. Use Recall retry to clear the answers and try again from memory.' : 'These are your previous workshop answers. Use Recall retry to clear them and complete a fresh unassisted attempt before this question is mastered.';
    else message = 'You have earned some of the points, or still have answers to add. Keep the correct ideas and revisit the highlighted checks.';
    return `<div class="q-feedback ${isMastered ? 'success' : ''}"><strong>${previousResult ? 'Previous workshop result: ' : ''}${result.score} / ${result.max} guided points${isMastered ? ' · Mastered' : ''}</strong><p>${message}</p></div>`;
  }

  function renderBlocks(blocks, prefix) {
    return blocks.map((block, i) => {
      if (block.type === 'text') return `<p>${lines(block.text)}</p>`;
      if (block.type === 'code') return `<pre class="code-block"><code>${esc(block.text)}</code></pre>`;
      if (block.type === 'table') return `<div class="table-wrap"><table class="data-table"><thead><tr>${block.headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td${cell === '' ? ' class="empty" aria-label="Answer space"' : ''}>${cell === '' ? '—' : lines(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      if (block.type === 'diagram') return sourceDiagram(block, `${prefix}-${i}`);
      return '';
    }).join('');
  }
  function svgText(label, x, y, width = 28) {
    const words = String(label).split(/\s+/);
    const rows = [];
    let row = '';
    for (let word of words) {
      while (word.length > width) {
        if (row) { rows.push(row); row = ''; }
        rows.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (row && row.length + word.length + 1 > width) { rows.push(row); row = ''; }
      row += (row ? ' ' : '') + word;
    }
    if (row || !rows.length) rows.push(row);
    const clipped = rows.slice(0, 3);
    if (rows.length > 3) clipped[2] = clipped[2].slice(0, width - 1) + '…';
    return `<text class="flow-label" text-anchor="middle" x="${x}" y="${y - (clipped.length - 1) * 8 + 4}">${clipped.map((line, i) => `<tspan x="${x}" dy="${i ? 16 : 0}">${esc(line)}</tspan>`).join('')}</text>`;
  }
  function svgNode(shape, label, x, y, w = 220, h = 48, uncertain = false) {
    const left = x - w / 2;
    const top = y - h / 2;
    const attr = `class="flow-shape"${uncertain ? ' stroke-dasharray="5 4"' : ''}`;
    let geometry;
    if (shape === 'terminator' || shape === 'Oval') geometry = `<rect ${attr} x="${left}" y="${top}" width="${w}" height="${h}" rx="${h / 2}"/>`;
    else if (shape === 'decision' || shape === 'Diamond') geometry = `<polygon ${attr} points="${x},${top} ${left + w},${y} ${x},${top + h} ${left},${y}"/>`;
    else if (shape === 'io' || shape === 'Parallelogram') geometry = `<polygon ${attr} points="${left + 18},${top} ${left + w},${top} ${left + w - 18},${top + h} ${left},${top + h}"/>`;
    else geometry = `<rect ${attr} x="${left}" y="${top}" width="${w}" height="${h}" rx="${uncertain ? 5 : 1}"/>${shape === 'subroutine' ? `<path class="flow-line" d="M${left + 13} ${top}v${h}M${left + w - 13} ${top}v${h}"/>` : ''}`;
    return `<g>${geometry}${svgText(label, x, y, Math.max(12, Math.floor(w / 7.7)))}</g>`;
  }
  function svgArrow(id) {
    return `<defs><marker id="${id}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 7 3.5 0 7z" fill="var(--muted)"/></marker></defs>`;
  }
  function sourceDiagram(block, prefix) {
    const id = domId('arrow', prefix);
    const height = Math.max(210, block.nodes.length * 84 + 20);
    const positions = new Map(block.nodes.map((n, i) => [n.id, { x: 280, y: 42 + i * 84 }]));
    return `<figure class="flow-figure"><svg viewBox="0 0 560 ${height}" role="img" aria-label="${esc(block.nodes.map(n => n.label).join(' then '))}">${svgArrow(id)}${block.edges.map(e => { const a = positions.get(e.from); const b = positions.get(e.to); return a && b ? `<path class="flow-line" d="M${a.x} ${a.y + 24}V${b.y - 27}" marker-end="url(#${id})"/>${e.label ? svgText(e.label, a.x + 45, (a.y + b.y) / 2) : ''}` : ''; }).join('')}${block.nodes.map(n => { const p = positions.get(n.id); return svgNode(n.shape, n.label, p.x, p.y, 240, 48); }).join('')}</svg><figcaption>Follow the arrows from the first instruction to the last.</figcaption></figure>`;
  }
  function traceFlowchart(q) {
    const id = domId('trace-arrow', q.id);
    const nodes = [{ label: 'Start', shape: 'terminator' }, ...q.visual.steps.map((s, i) => ({ label: `${i + 1}. ${s}`, shape: /^OUTPUT\b|^INPUT\b/i.test(s) ? 'io' : 'process' })), { label: 'Stop', shape: 'terminator' }];
    const height = nodes.length * 70 + 10;
    return `<figure class="flow-figure"><svg viewBox="0 0 580 ${height}" role="img" aria-label="Flowchart: ${esc(q.visual.steps.join('; '))}">${svgArrow(id)}${nodes.map((n, i) => `<g class="trace-node">${i < nodes.length - 1 ? `<path class="flow-line" d="M290 ${36 + i * 70 + 22}v23" marker-end="url(#${id})"/>` : ''}${svgNode(n.shape, n.label, 290, 36 + i * 70, n.shape === 'terminator' ? 130 : 330, 44)}</g>`).join('')}</svg><figcaption>The same numbered instructions, shown with their flowchart symbols.</figcaption></figure>`;
  }
  function builderFlowchart(q, answers) {
    const p = q.parts[0];
    const find = id => p.widgets.find(w => w.id === id);
    const option = id => { const w = find(id); const answer = answers[key(p, w)]; return Number.isInteger(answer) ? w.options[answer] : ''; };
    const termShape = option('terminators');
    const inputShape = option('inputShape');
    const outputShape = option('outputShape');
    const conditionWidget = find('condition');
    const condition = String(answers[key(p, conditionWidget)] || '').slice(0, 100);
    const routes = option('branches');
    const yes = routes.match(/Yes\s*[→>-]+\s*([^;]+)/i)?.[1]?.trim() || 'Choose Yes output';
    const no = routes.match(/No\s*[→>-]+\s*([^;]+)/i)?.[1]?.trim() || 'Choose No output';
    const id = domId('builder-arrow', q.id);
    return `<figure class="flow-figure"><svg viewBox="0 0 660 465" role="img" aria-label="Your flowchart construction, updated from the five guided answers.">${svgArrow(id)}${['M330 60V80', 'M330 130V153', 'M220 202H165V273', 'M440 202H495V273', 'M165 323V377H330V400', 'M495 323V377H330'].map(path => `<path class="flow-line" d="${path}" marker-end="url(#${id})"/>`).join('')}${svgNode(termShape, 'Start', 330, 38, 135, 44, !termShape)}${svgNode(inputShape, `INPUT ${q.visual.variable}`, 330, 106, 230, 48, !inputShape)}${svgNode('decision', condition || 'Enter a condition', 330, 202, 220, 88, !condition)}<text class="flow-branch" x="175" y="192">Yes</text><text class="flow-branch" x="463" y="192">No</text>${svgNode(outputShape, routes ? `OUTPUT ${yes}` : yes, 165, 299, 240, 48, !outputShape)}${svgNode(outputShape, routes ? `OUTPUT ${no}` : no, 495, 299, 240, 48, !outputShape)}${svgNode(termShape, 'Stop', 330, 425, 135, 44, !termShape)}</svg><figcaption>Your choices build this flowchart. Check the symbols, condition and routes before submitting.</figcaption></figure>`;
  }

  function setCurrentQuestion(index) {
    if (!visibleQuestions.length) return;
    currentIndex = Math.max(0, Math.min(visibleQuestions.length - 1, Number(index) || 0));
    const q = visibleQuestions[currentIndex];
    if (workshopMode === 'practice') {
      state.lastQuestion = q.id;
      qState(q).everSeen = true;
    } else if (state.exam) state.exam.currentQuestionId = q.id;
    if (!deck) main.querySelectorAll('.slides > section').forEach((section, i) => {
      section.hidden = i !== currentIndex;
      section.classList.toggle('present', i === currentIndex);
    });
    updateQuestionMap();
    save();
  }
  function updateQuestionMap() {
    if (!['practice', 'timed', 'challenge-review'].includes(route)) return;
    main.querySelectorAll('.question-grid').forEach(grid => { grid.innerHTML = jumpButtons(workshopMode); });
    const position = `${currentIndex + 1} of ${visibleQuestions.length}`;
    const footer = document.getElementById('deck-position');
    if (footer) footer.textContent = position;
    const mobile = document.getElementById('mobile-position');
    if (mobile) mobile.textContent = `Question ${position}`;
    const previous = main.querySelector('[data-action="previous-question"]');
    const next = main.querySelector('[data-action="next-question"]');
    if (previous) previous.disabled = currentIndex <= 0;
    if (next) next.disabled = currentIndex >= visibleQuestions.length - 1;
    const total = document.getElementById('rail-total');
    const bar = document.getElementById('rail-progress');
    let value = 0;
    let maximum = questions.length;
    if (workshopMode === 'timed') {
      value = challengeQuestions().filter(q => completeQuestion(q, state.exam.answers[q.id] || {})).length;
      maximum = challengeQuestions().length;
    } else if (workshopMode === 'review') {
      value = state.exam.score;
      maximum = 50;
    } else value = stats().masteredCount;
    if (total) total.textContent = `${value} / ${maximum}`;
    if (bar) bar.style.setProperty('--percent', `${value / maximum * 100}%`);
    const reviewOption = document.querySelector('#bank-filter option[value="review"]');
    if (reviewOption) reviewOption.textContent = `Review queue (${questions.filter(needsReview).length})`;
  }
  function goToQuestion(index) {
    if (!Number.isInteger(index) || index < 0 || index >= visibleQuestions.length) return;
    if (deck) deck.slide(index);
    setCurrentQuestion(index);
    const mobile = main.querySelector('.mobile-jump');
    if (mobile) mobile.open = false;
  }
  function sectionFor(qid) {
    return Array.from(main.querySelectorAll('.slides > section')).find(section => section.dataset.qid === qid);
  }
  function refreshQuestion(q, resetScroll = false, focusId = '') {
    const section = sectionFor(q.id);
    if (!section) return;
    const scrollTop = resetScroll ? 0 : section.querySelector('.question-scroll')?.scrollTop || 0;
    section.innerHTML = renderQuestion(q, workshopMode);
    const scroll = section.querySelector('.question-scroll');
    if (scroll) scroll.scrollTop = scrollTop;
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    updateQuestionMap();
  }
  function clearVisibleFeedback(q) {
    const section = sectionFor(q.id);
    if (!section) return;
    section.querySelectorAll('.widget').forEach(el => el.classList.remove('correct', 'incorrect'));
    section.querySelectorAll('.field-feedback').forEach(el => { el.textContent = ''; });
    const feedback = document.getElementById(domId('feedback', q.id));
    if (feedback) feedback.innerHTML = '';
  }
  function storeAnswer(q, p, w, value) {
    if (workshopMode === 'review') return;
    const k = key(p, w);
    if (workshopMode === 'timed') {
      if (state.exam?.status !== 'active' || Date.now() >= state.exam.deadline) { tickChallenge(); return; }
      state.exam.answers[q.id] = state.exam.answers[q.id] || {};
      state.exam.answers[q.id][k] = value;
    } else {
      const s = qState(q);
      s.answers[k] = value;
      s.checked = false;
      s.lastResult = null;
      s.mastered = false;
      s.everSeen = true;
      clearVisibleFeedback(q);
    }
    if (q.visual?.type === 'flowchart-builder') {
      const visual = document.getElementById(domId('visual', q.id));
      if (visual) visual.innerHTML = builderFlowchart(q, answersFor(q));
    }
    updateQuestionMap();
    save();
  }
  function eventQuestion(element) {
    const q = questionMap.get(element.dataset.qid);
    const p = q?.parts.find(p => p.id === element.dataset.pid);
    const w = p?.widgets.find(w => w.id === element.dataset.wid);
    return { q, p, w };
  }
  function checkQuestion(q) {
    if (!q || route !== 'practice' || workshopMode !== 'practice' || state.exam?.status === 'active') return;
    const s = qState(q);
    if (s.checked) {
      refreshQuestion(q);
      toast('These answers are already checked. Change an answer or use Recall retry for a new attempt.');
      return;
    }
    const wasMastered = mastered(q);
    const result = Core.scoreQuestion(q, s.answers);
    s.attempts += 1;
    s.best = Math.max(Number(s.best) || 0, result.score);
    s.lastScore = result.score;
    s.lastResult = result;
    s.checked = true;
    s.everSeen = true;
    s.mastered = result.score === result.max && completeQuestion(q, s.answers) && !s.assisted;
    if (s.mastered) s.needsRecall = false;
    refreshQuestion(q);
    save(true);
    if (s.mastered && !wasMastered) celebrate();
    const feedback = document.getElementById(domId('feedback', q.id));
    feedback?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
    toast(`${questionLabel(q)}: ${result.score} of ${result.max} guided points.${s.mastered ? ' Mastered.' : s.assisted && result.score === result.max ? ' Try a fresh recall attempt next.' : ''}`);
  }
  function showHelp(q, p, action) {
    if (!q || !p || workshopMode === 'timed' || state.exam?.status === 'active') return;
    const s = qState(q);
    if (action === 'toggle-hint') {
      s.hints = s.hints || {};
      s.hints[p.id] = !s.hints[p.id];
    } else {
      s.assisted = true;
      s.mastered = false;
      s.everSeen = true;
      const ui = uiForPart(q, p);
      if (action === 'show-model') ui.model = true;
      else if (action === 'all-steps') ui.shown = p.steps.length;
      else if (action === 'replay-steps') { ui.shown = 1; ui.model = false; }
      else if (action === 'next-step') ui.shown = Math.min(p.steps.length, ui.shown + 1);
      else ui.shown = Math.max(1, ui.shown);
      s.stepOpen[p.id] = ui;
    }
    refreshQuestion(q, false, action === 'show-step' ? domId('steps-button', q.id, p.id) : '');
    save();
  }
  function recallRetry(q, fromChallenge = false) {
    if (!q || state.exam?.status === 'active') return;
    const s = qState(q);
    s.answers = {};
    s.assisted = false;
    s.mastered = false;
    s.checked = false;
    s.lastScore = 0;
    s.lastResult = null;
    s.stepOpen = {};
    s.hints = {};
    s.everSeen = true;
    save(true);
    if (fromChallenge) navigate('practice', { questionId: q.id, bank: 'all', topic: 'all' });
    else refreshQuestion(q, true);
    toast('Fresh recall attempt: answers and help are hidden. Your attempts and best score are preserved.');
  }
  function celebrate() {
    if (reducedMotion.matches) return;
    const target = document.getElementById('celebration');
    const colours = ['#8e1537', '#d3b069', '#5a62df', '#70dcb1'];
    target.innerHTML = Array.from({ length: 26 }, (_, i) => `<span class="confetti" style="--x:${Math.round(Math.random() * 100)}%;--c:${colours[i % colours.length]};--delay:${Math.random() * 0.2}s"></span>`).join('');
    setTimeout(() => { target.innerHTML = ''; }, 1900);
  }

  function chapterList(animation) {
    const file = animationFiles.get(animation.id);
    if (Array.isArray(file?.chapters) && file.chapters.length) return file.chapters.map((chapter, i) => ({ title: chapter.title || animation.frames[i]?.title || `Chapter ${i + 1}`, start: Math.max(0, Number(chapter.start ?? chapter.time) || 0), end: Number(chapter.end) || 0 }));
    return [];
  }
  function renderLearn() {
    main.innerHTML = `<div class="page"><div class="page-heading"><div><p class="eyebrow">Watch the idea unfold</p><h1>See each step happen.</h1><p class="muted">Pause, replay a chapter, or read the transcript. Then put the idea into practice.</p></div>${button('open-workshop', 'Open workshop', 'arrow')}</div>
      <div class="animation-grid">${DATA.animations.map(a => {
        const file = animationFiles.get(a.id);
        const video = safeMedia(file?.video);
        const poster = safeMedia(file?.poster);
        const captions = safeMedia(file?.captions);
        const chapters = chapterList(a);
        return `<article class="animation-card card"><div class="media">${video ? `<video id="${domId('video', a.id)}" controls playsinline preload="metadata"${poster ? ` poster="${esc(poster)}"` : ''} aria-label="${esc(a.title)}" data-animation="${esc(a.id)}"><source src="${esc(video)}" type="video/mp4">${captions ? `<track kind="captions" src="${esc(captions)}" srclang="en" label="English" default>` : ''}Your browser cannot play this video. The complete transcript is provided below.</video>` : `<div class="loading-state">The video is unavailable here. Follow every step in the transcript below.</div>`}</div><div class="animation-info"><span class="eyebrow">${esc(topicMap.get(a.topic)?.title || 'Revision animation')}</span><h2>${esc(a.title)}</h2><p>${esc(a.caption)}</p><div class="chapter-controls">${button('chapter-previous', 'Previous', 'left', `data-animation="${esc(a.id)}"${disabled(!video || !chapters.length)}`, 'btn-sm')}<label class="small">Speed <select class="select" data-speed="${esc(a.id)}" aria-label="Playback speed for ${esc(a.title)}"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label>${button('chapter-next', 'Next', 'right', `data-animation="${esc(a.id)}"${disabled(!video || chapters.length < 2)}`, 'btn-sm')}</div><div class="chapter-label" id="${domId('chapter', a.id)}">${chapters.length ? `Chapter 1 of ${chapters.length}: ${esc(chapters[0].title)}` : 'Read the transcript at your own pace.'}</div><details class="transcript"><summary>Read the complete transcript</summary><ol>${a.frames.map((f, i) => `<li><strong>${esc(f.title)}</strong><div>${f.lines.map(line => `<code>${esc(line)}</code>`).join('<br>')}</div><p>${esc(f.note)}</p>${video && chapters[i] ? button('chapter-seek', 'Watch this step', 'play', `data-animation="${esc(a.id)}" data-chapter="${i}"`, 'btn-sm btn-quiet') : ''}</li>`).join('')}</ol></details></div></article>`;
      }).join('')}</div>
      <section id="topic-guide" style="margin-top:42px"><div class="section-head"><div><h2>Your topic guide</h2><p>Keep these rules beside you while you practise.</p></div></div><div class="topic-guide-grid">${DATA.topics.map(t => `<article class="topic-guide card"><span class="eyebrow">${esc(t.id)}</span><h3>${esc(t.title)}</h3><p>${esc(t.summary)}</p><ul>${t.tips.map(tip => `<li>${esc(tip)}</li>`).join('')}</ul>${button('topic-practice', 'Practise this topic', 'arrow', `data-topic="${esc(t.id)}"`, 'btn-sm btn-accent')}</article>`).join('')}</div></section>${paperNote()}</div>`;
    viewAbort = new AbortController();
    main.querySelectorAll('video[data-animation]').forEach(video => {
      const update = () => updateChapter(video);
      video.addEventListener('timeupdate', update, { signal: viewAbort.signal });
      video.addEventListener('loadedmetadata', update, { signal: viewAbort.signal });
      video.addEventListener('play', () => {
        main.querySelectorAll('video').forEach(other => { if (other !== video) other.pause(); });
      }, { signal: viewAbort.signal });
      update();
    });
  }
  function chapterIndex(video, chapters) {
    let index = 0;
    chapters.forEach((chapter, i) => { if (video.currentTime + 0.08 >= chapter.start) index = i; });
    return index;
  }
  function updateChapter(video) {
    const animation = DATA.animations.find(a => a.id === video.dataset.animation);
    if (!animation) return;
    const chapters = chapterList(animation);
    if (!chapters.length) return;
    const index = chapterIndex(video, chapters);
    const label = document.getElementById(domId('chapter', animation.id));
    if (label) label.textContent = `Chapter ${index + 1} of ${chapters.length}: ${chapters[index].title}`;
    const previous = main.querySelector(`[data-action="chapter-previous"][data-animation="${animation.id}"]`);
    const next = main.querySelector(`[data-action="chapter-next"][data-animation="${animation.id}"]`);
    if (previous) previous.disabled = index === 0;
    if (next) next.disabled = index === chapters.length - 1;
  }
  function seekChapter(animationId, wantedIndex) {
    const animation = DATA.animations.find(a => a.id === animationId);
    const video = document.getElementById(domId('video', animationId));
    if (!animation || !video) return;
    const chapters = chapterList(animation);
    const index = Math.max(0, Math.min(chapters.length - 1, wantedIndex));
    if (!chapters[index]) return;
    const seek = () => {
      video.currentTime = chapters[index].start;
      updateChapter(video);
      const promise = video.play();
      if (promise?.catch) promise.catch(() => toast('Press the video’s play button to start this chapter.'));
    };
    if (video.readyState >= 1) seek();
    else {
      video.addEventListener('loadedmetadata', seek, { once: true, signal: viewAbort?.signal });
      video.load();
    }
  }

  function renderProgress() {
    const s = stats();
    const percent = Math.round(s.masteredCount / questions.length * 100);
    const attempts = questions.reduce((total, q) => total + (Number(qState(q).attempts) || 0), 0);
    const badges = [
      { title: 'First check', earned: s.attemptedCount > 0, icon: 'spark' },
      { title: 'Five mastered', earned: s.masteredCount >= 5, icon: 'medal' },
      { title: 'Halfway', earned: s.masteredCount >= Math.ceil(questions.length / 2), icon: 'shield' },
      { title: 'Whole bank mastered', earned: s.masteredCount === questions.length, icon: 'target' }
    ];
    main.innerHTML = `<div class="page"><div class="page-heading"><div><p class="eyebrow">Your steady progress</p><h1>See what is sticking.</h1><p class="muted">Mastery comes from a full correct recall attempt without opening a solution.</p></div>${button('open-review', 'Open review queue', 'retry', '', 'btn-primary')}</div>
      <div class="progress-layout"><section class="readiness-card card"><div class="readiness-ring" style="--angle:${percent * 3.6}deg" role="img" aria-label="${percent} percent of questions mastered"><div><strong>${percent}%</strong><span>questions mastered</span></div></div><h2>${s.masteredCount === questions.length ? 'You have covered the whole bank.' : s.masteredCount ? 'Keep building on what you know.' : 'Your next step starts here.'}</h2><p>Opening a solution makes that attempt assisted. Use Recall retry to hide the help and answer again from memory.</p><div class="progress-breakdown"><div class="progress-line"><span>Mastered questions</span><strong>${s.masteredCount} / ${questions.length}</strong></div><div class="progress-line"><span>Questions attempted</span><strong>${s.attemptedCount} / ${questions.length}</strong></div><div class="progress-line"><span>Best guided points</span><strong>${s.bestPoints} / ${s.totalPoints}</strong></div><div class="progress-line"><span>Questions to revisit</span><strong>${s.reviewCount}</strong></div><div class="progress-line"><span>Workshop checks made</span><strong>${attempts}</strong></div></div></section>
        <section class="progress-list card"><h2>Progress by topic</h2><p class="small muted">A question can practise more than one topic. Each bar counts questions mastered within that topic.</p>${DATA.topics.map(t => { const ts = topicStats(t.id); return `<div class="progress-topic"><div class="progress-topic-header"><button type="button" data-action="topic-practice" data-topic="${esc(t.id)}">${esc(t.title)}</button><span>${ts.mastered} / ${ts.total} mastered</span></div><div class="progress-track" role="progressbar" aria-label="${esc(t.title)}" aria-valuemin="0" aria-valuemax="${ts.total}" aria-valuenow="${ts.mastered}"><div class="progress-fill" style="--percent:${ts.total ? ts.mastered / ts.total * 100 : 0}%"></div></div></div>`; }).join('')}</section></div>
      <div class="badge-row" aria-label="Revision milestones">${badges.map(b => `<span class="badge ${b.earned ? 'earned' : ''}" aria-label="${esc(b.title)}: ${b.earned ? 'earned' : 'not yet earned'}">${icon(b.icon)}${esc(b.title)}${b.earned ? ' ✓' : ''}</span>`).join('')}</div>
      ${state.exam?.status === 'finished' ? `<section class="result-summary card"><div class="section-head"><div><h2>Your latest timed challenge</h2><p>${readableDate(state.exam.finishedAt)} · ${formatDuration(Math.min(3600, (state.exam.finishedAt - state.exam.startedAt) / 1000))} used</p></div><span class="result-score">${state.exam.score}<small class="muted" style="font-size:20px"> / 50</small></span></div><p>Challenge answers are saved separately from your workshop attempts.</p>${button('show-results', 'Review challenge results', 'chart')}</section>` : ''}
      ${Array.isArray(state.examHistory) && state.examHistory.length > 1 ? `<section class="card progress-list"><h3>Recent challenge scores</h3><div class="table-wrap"><table class="result-table"><thead><tr><th>Date</th><th>Score</th><th>Time used</th></tr></thead><tbody>${state.examHistory.slice(-5).reverse().map(e => `<tr><td>${readableDate(e.finishedAt)}</td><td>${Number(e.score) || 0} / 50</td><td>${formatDuration(e.elapsedSeconds)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      <section class="progress-tools card"><h3>Keep a copy of your progress</h3><p>Your progress is saved in this browser for Grade ${DATA.grade}. Export a copy to keep it or move it to another device. Importing replaces this grade’s saved progress.</p><div class="button-row">${button('export-progress', 'Export progress', 'download')}${button('import-progress', 'Import progress', 'upload')}${button('print-progress', 'Print summary', 'printer')}${button('reset-progress-dialog', 'Reset this grade', 'trash', '', 'btn-danger')}</div></section>${paperNote()}</div>`;
  }

  function challengeStartDialog() {
    if (state.exam?.status === 'active') { navigate('timed', { force: true }); return; }
    openDialog(`<h2>A fresh 60-minute challenge</h2><p>Try a new mixed selection worth <strong>50 guided marks</strong>, drawn from the whole practice bank and covering every topic. Keep your calculations and full answers on paper as well.</p><ul><li>The questions are freshly selected and shuffled each time.</li><li>Your challenge starts with fresh answers.</li><li>The timer keeps running if you refresh or close the page.</li><li>Hints, checking and solutions unlock when you finish or time runs out.</li><li>Your workshop answers and best scores are kept separately.</li></ul>${state.exam?.status === 'finished' ? '<p>Your previous score stays in your progress history. This starts a new question selection and answer sheet.</p>' : ''}<div class="button-row">${button('begin-challenge', 'Start the 60-minute timer', 'clock', '', 'btn-primary')}${button('close-dialog', 'Not yet', '', 'autofocus')}</div>`);
  }
  function beginChallenge() {
    if (state.exam?.status === 'active') { closeDialog(); navigate('timed', { force: true }); return; }
    let selection;
    try {
      selection = Core.createRehearsal(DATA, state.exam?.questionIds || []);
      const selected = Array.isArray(selection?.questionIds) ? selection.questionIds.map(id => questionMap.get(id)) : [];
      const topics = new Set(selected.flatMap(q => q?.topics || []));
      if (!selected.length || selected.some(q => !q) || new Set(selection.questionIds).size !== selected.length || selected.reduce((sum, q) => sum + q.marks, 0) !== 50 || DATA.topics.some(t => !topics.has(t.id))) throw new Error('Selection unavailable');
    } catch (_) {
      toast('A timed challenge could not be prepared. Please refresh the page and try again.');
      return;
    }
    const now = Date.now();
    state.exam = { status: 'active', questionIds: [...selection.questionIds], startedAt: now, deadline: now + 60 * 60 * 1000, finishedAt: null, currentQuestionId: selection.questionIds[0], answers: {}, results: {}, score: 0, max: 50 };
    closeDialog();
    save(true);
    navigate('timed', { force: true });
    tickChallenge();
  }
  function finishDialog() {
    if (state.exam?.status !== 'active') return;
    const count = challengeQuestions().filter(q => completeQuestion(q, state.exam.answers[q.id] || {})).length;
    openDialog(`<h2>Finish your challenge?</h2><p>You have entered answers for every guided check in <strong>${count} of ${challengeQuestions().length} questions</strong>. You can still return to any question before finishing.</p><p>Finishing saves this answer sheet and opens your score, feedback and complete solutions.</p><div class="button-row">${button('finish-challenge', 'Finish and see results', 'check', '', 'btn-primary')}${button('close-dialog', 'Keep working', '', 'autofocus')}</div>`);
  }
  function finishChallenge(timedOut = false, initial = false) {
    if (finishingChallenge || state.exam?.status !== 'active') return;
    finishingChallenge = true;
    const challenge = state.exam;
    const now = Date.now();
    timedOut = Boolean(timedOut || now >= challenge.deadline);
    let score = 0;
    const results = {};
    challengeQuestions().forEach(q => {
      const result = Core.scoreQuestion(q, challenge.answers[q.id] || {});
      results[q.id] = result;
      score += result.score;
      if (result.score < q.marks) {
        qState(q).mastered = false;
        qState(q).needsRecall = true;
      }
    });
    challenge.status = 'finished';
    challenge.finishedAt = timedOut ? Math.min(now, challenge.deadline) : now;
    challenge.results = results;
    challenge.score = score;
    challenge.max = 50;
    challenge.timedOut = Boolean(timedOut);
    state.examHistory = Array.isArray(state.examHistory) ? state.examHistory : [];
    state.examHistory.push({ startedAt: challenge.startedAt, finishedAt: challenge.finishedAt, score, max: 50, elapsedSeconds: Math.min(3600, Math.max(0, Math.round((challenge.finishedAt - challenge.startedAt) / 1000))), timedOut: Boolean(timedOut) });
    state.examHistory = state.examHistory.slice(-20);
    closeDialog();
    save(true);
    finishingChallenge = false;
    if (!initial) {
      navigate('results', { force: true });
      toast(timedOut ? 'Time is up. Your saved answers have been marked.' : 'Your challenge is finished. Your results are ready.');
    }
  }
  function tickChallenge() {
    const challenge = state.exam;
    if (challenge?.status !== 'active') return;
    const remaining = challenge.deadline - Date.now();
    if (remaining <= 0) { finishChallenge(true); return; }
    const timer = document.getElementById('challenge-timer');
    if (timer) {
      timer.textContent = formatDuration(Math.ceil(remaining / 1000));
      timer.classList.toggle('urgent', remaining <= 5 * 60 * 1000);
    }
  }
  function renderResults() {
    const challenge = state.exam;
    if (!challenge || challenge.status !== 'finished') { renderHome(); return; }
    const fullCount = challengeQuestions().filter(q => challenge.results[q.id]?.score === q.marks).length;
    const wrong = challengeQuestions().find(q => challenge.results[q.id]?.score < q.marks);
    main.innerHTML = `<div class="page"><div class="page-heading"><div><p class="eyebrow">Timed challenge complete</p><h1>Now turn your results into learning.</h1><p class="muted">${challenge.timedOut ? 'The timer ended and your saved answers were marked.' : 'Your submitted answers are saved for review.'}</p></div>${button('open-workshop', 'Open workshop', 'layers')}</div>
      <section class="result-summary card"><div class="section-head"><div><h2>Your guided challenge score</h2><p>${readableDate(challenge.finishedAt)} · ${formatDuration(Math.min(3600, (challenge.finishedAt - challenge.startedAt) / 1000))} used · ${fullCount} of ${challengeQuestions().length} questions fully correct</p></div><span class="result-score">${challenge.score}<small class="muted" style="font-size:22px"> / 50</small></span></div><p>These guided marks check your selections and entries. Use the complete rubrics to assess the detail of your written answers, including any allowed follow-through.</p><div class="button-row">${button('review-challenge-question', 'Review the questions', 'book', `data-qid="${esc(wrong?.id || challengeQuestions()[0].id)}"`, 'btn-primary')}${button('start-challenge-dialog', 'Start a new challenge', 'clock')}${button('open-progress', 'View progress', 'chart')}</div></section>
      <section class="card progress-list"><h2>Your question breakdown</h2><div class="table-wrap"><table class="result-table"><thead><tr><th>Question</th><th>Topic / task</th><th>Score</th><th>Next step</th></tr></thead><tbody>${challengeQuestions().map(q => { const r = challenge.results[q.id] || { score: 0, max: q.marks }; return `<tr><td>${esc(questionLabel(q, 'review'))}</td><td>${esc(q.title)}</td><td>${r.score} / ${q.marks}</td><td><button type="button" data-action="review-challenge-question" data-qid="${esc(q.id)}">${r.score === q.marks ? 'Review answer' : 'Learn from this'}</button></td></tr>`; }).join('')}</tbody></table></div></section>${paperNote()}</div>`;
  }

  function openDialog(content) {
    if (dialog.open) dialog.close();
    dialogContent.innerHTML = `<button type="button" class="icon-button dialog-close" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button>${content}`;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  function closeDialog() {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }
  function resetDialog() {
    openDialog(`<h2>Reset Grade ${DATA.grade} progress?</h2><p>This removes your saved answers, mastery, workshop attempts and challenge history for this grade on this device. Your theme preference stays the same.</p><p>Export a copy first if you would like to keep your current progress.</p><div class="button-row">${button('close-dialog', 'Keep my progress', '', 'autofocus', 'btn-primary')}${button('reset-progress', 'Reset this grade', 'trash', '', 'btn-danger')}</div>`);
  }
  function exportProgress() {
    save(true);
    const text = JSON.stringify(Core.exportState(state), null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `grade-${DATA.grade}-revision-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Your progress copy is ready to save.');
  }
  async function importProgress(file) {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a progress file smaller than 2 MB.');
      const parsed = JSON.parse(await file.text());
      const restored = Core.validateImport(parsed, DATA);
      if (state.exam?.status === 'active') { toast('Finish the timed challenge before importing progress.'); return; }
      pendingImport = restored;
      const summary = Core.assessment(restored, DATA);
      openDialog(`<h2>Import Grade ${DATA.grade} progress?</h2><p><strong>${esc(file.name)}</strong> contains ${summary.masteredCount} mastered questions and ${summary.attemptedCount} attempted questions.</p><p>This will replace the saved progress for this grade on this device.</p>${restored.exam?.status === 'active' ? '<p>This file contains a timed challenge. Its saved deadline will still apply when it is restored.</p>' : ''}<div class="button-row">${button('confirm-import', 'Import this progress', 'upload', '', 'btn-primary')}${button('close-dialog', 'Keep current progress', '', 'autofocus')}</div>`);
    } catch (error) {
      pendingImport = null;
      toast(`This progress file could not be imported. ${error.message || 'Check that it belongs to this grade.'}`);
    } finally {
      importInput.value = '';
    }
  }
  function confirmImport() {
    if (!pendingImport) return;
    state = pendingImport;
    pendingImport = null;
    state.filters = state.filters || { bank: 'all', topic: 'all' };
    closeDialog();
    if (state.exam?.status === 'active' && state.exam.deadline <= Date.now()) finishChallenge(true, true);
    save(true);
    navigate(state.exam?.status === 'active' ? 'timed' : 'progress', { force: true });
    toast('Your progress has been imported.');
  }

  function handleAction(element) {
    const action = element.dataset.action;
    const { q, p, w } = eventQuestion(element);
    if (['toggle-hint', 'show-step', 'show-model', 'next-step', 'replay-steps', 'all-steps'].includes(action)) { showHelp(q, p, action); return; }
    switch (action) {
      case 'open-workshop': navigate('practice'); break;
      case 'open-progress': navigate('progress'); break;
      case 'open-review': navigate('practice', { bank: 'review', topic: 'all' }); break;
      case 'open-guide':
        navigate('learn');
        requestAnimationFrame(() => document.getElementById('topic-guide')?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' }));
        break;
      case 'topic-practice': navigate('practice', { bank: 'all', topic: element.dataset.topic }); break;
      case 'reset-filters': navigate('practice', { bank: 'all', topic: 'all' }); break;
      case 'previous-question': goToQuestion(currentIndex - 1); break;
      case 'next-question': goToQuestion(currentIndex + 1); break;
      case 'jump': goToQuestion(Number(element.dataset.index)); break;
      case 'check-question': checkQuestion(q); break;
      case 'recall-retry': recallRetry(q); break;
      case 'recall-from-challenge': recallRetry(q, true); break;
      case 'move-order': {
        if (!q || !p || !w || w.type !== 'order' || workshopMode === 'review') return;
        const saved = answersFor(q)[key(p, w)];
        const order = isAnswered(w, saved) ? [...saved] : w.items.map((_, i) => i);
        const from = Number(element.dataset.position);
        const to = from + Number(element.dataset.direction);
        if (to < 0 || to >= order.length) return;
        [order[from], order[to]] = [order[to], order[from]];
        storeAnswer(q, p, w, order);
        refreshQuestion(q);
        const wrapper = document.getElementById(`${domId('answer', q.id, p.id, w.id)}-widget`);
        wrapper?.querySelectorAll('.order-row')[to]?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
        break;
      }
      case 'record-order':
        if (q && p && w && w.type === 'order' && workshopMode !== 'review') { storeAnswer(q, p, w, w.items.map((_, i) => i)); refreshQuestion(q); }
        break;
      case 'chapter-previous':
      case 'chapter-next': {
        const animation = DATA.animations.find(a => a.id === element.dataset.animation);
        const video = document.getElementById(domId('video', element.dataset.animation));
        if (animation && video) seekChapter(animation.id, chapterIndex(video, chapterList(animation)) + (action === 'chapter-next' ? 1 : -1));
        break;
      }
      case 'chapter-seek': seekChapter(element.dataset.animation, Number(element.dataset.chapter)); break;
      case 'start-challenge-dialog': challengeStartDialog(); break;
      case 'begin-challenge': beginChallenge(); break;
      case 'confirm-finish-dialog': finishDialog(); break;
      case 'finish-challenge': finishChallenge(false); break;
      case 'show-results': navigate('results'); break;
      case 'review-challenge-question': navigate('challenge-review', { questionId: element.dataset.qid }); break;
      case 'close-dialog': closeDialog(); break;
      case 'export-progress': exportProgress(); break;
      case 'import-progress': importInput.click(); break;
      case 'confirm-import': confirmImport(); break;
      case 'print-progress': window.print(); break;
      case 'reset-progress-dialog': resetDialog(); break;
      case 'reset-progress':
        state = Core.freshState(DATA.grade);
        state.filters = { bank: 'all', topic: 'all' };
        closeDialog();
        save(true);
        navigate('progress', { force: true });
        toast(`Grade ${DATA.grade} progress has been reset.`);
        break;
      default: break;
    }
  }
  function actionClick(event) {
    const element = event.target.closest?.('[data-action]');
    if (!element || element.disabled) return;
    event.preventDefault();
    handleAction(element);
  }
  main.addEventListener('click', actionClick);
  dialogContent.addEventListener('click', actionClick);
  main.addEventListener('input', event => {
    const input = event.target;
    if (!input.matches('.answer-input')) return;
    const { q, p, w } = eventQuestion(input);
    if (q && p && w) storeAnswer(q, p, w, input.value);
  });
  main.addEventListener('change', event => {
    const element = event.target;
    if (element.id === 'bank-filter') { state.filters.bank = element.value; navigate('practice'); return; }
    if (element.id === 'topic-filter') { state.filters.topic = element.value; navigate('practice'); return; }
    if (element.dataset.speed) {
      const video = document.getElementById(domId('video', element.dataset.speed));
      const speed = Number(element.value);
      if (video && [0.75, 1, 1.25, 1.5].includes(speed)) video.playbackRate = speed;
      return;
    }
    if (element.matches('input[type="radio"][data-key]')) {
      const { q, p, w } = eventQuestion(element);
      if (q && p && w) storeAnswer(q, p, w, Number(element.value));
    }
  });
  main.addEventListener('toggle', event => {
    const details = event.target;
    if (!details.matches?.('details.model-answer') || workshopMode === 'timed') return;
    const q = questionMap.get(details.dataset.modelQid);
    const p = q?.parts.find(part => part.id === details.dataset.modelPid);
    if (!q || !p) return;
    const s = qState(q);
    const ui = uiForPart(q, p);
    ui.model = details.open;
    s.stepOpen[p.id] = ui;
    if (details.open) { s.assisted = true; s.mastered = false; s.everSeen = true; }
    updateQuestionMap();
    save();
  }, true);
  document.querySelectorAll('[data-route]').forEach(element => {
    element.addEventListener('click', event => { event.preventDefault(); navigate(element.dataset.route); });
  });
  document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('cezeri-revision-theme', theme); } catch (_) { /* Theme still changes for this visit. */ }
    updateTheme();
  });
  themeMedia.addEventListener?.('change', event => {
    let preference = '';
    try { preference = localStorage.getItem('cezeri-revision-theme'); } catch (_) { /* Use the system preference. */ }
    if (!preference) { document.documentElement.dataset.theme = event.matches ? 'dark' : 'light'; updateTheme(); }
  });
  importInput.addEventListener('change', () => importProgress(importInput.files?.[0]));
  window.addEventListener('hashchange', () => {
    const next = neutralRoute(location.hash.slice(1));
    if (['home', 'practice', 'learn', 'progress', 'timed', 'results', 'challenge-review'].includes(next) && next !== route) navigate(next);
  });
  window.addEventListener('beforeunload', () => save(true));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { save(true); main.querySelectorAll('video').forEach(video => video.pause()); }
    tickChallenge();
  });
  setInterval(tickChallenge, 1000);

  document.title = `Grade ${DATA.grade} Revision Lab · Cezeri`;
  const gradePill = document.querySelector('.grade-pill');
  if (gradePill) gradePill.textContent = `GRADE ${DATA.grade}`;
  updateTheme();
  if (state.exam?.status === 'active' && state.exam.deadline <= Date.now()) finishChallenge(true, true);
  const requestedRoute = neutralRoute(location.hash.slice(1));
  const initialRoute = state.exam?.status === 'active' ? 'timed' : ['home', 'practice', 'learn', 'progress', 'results', 'challenge-review'].includes(requestedRoute) ? requestedRoute : neutralRoute(state.lastView) || 'home';
  navigate(initialRoute, { force: true });
  if (storageWarning) toast(storageWarning);
})();
