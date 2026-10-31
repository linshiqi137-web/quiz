(() => {
  'use strict';
  const QUESTIONS = Array.isArray(window.QUESTIONS) ? window.QUESTIONS : [];
  const byId = new Map(QUESTIONS.map(q => [q.id, q]));
  const TYPES = ['单选', '判断', '简答', '计算', '论述'];
  // 未指定数量的组织学计算、论述暂各抽 1 题，可在这里调整。
  const EXAM_STRUCTURE = {
    '组织学': { '单选': 10, '判断': 10, '简答': 6, '计算': 1, '论述': 1 },
    '物理': { '单选': 10, '判断': 10, '计算': 8 },
    '测量': { '计算': 4 }
  };
  const KEY = 'xiaokan-quiz-v1';
  const $ = id => document.getElementById(id);
  const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const objective = q => ['单选', '判断'].includes(q.type);
  const answerIndex = q => q.options.findIndex((o, i) => q.answer.trim() === String.fromCharCode(65 + i) || q.answer.trim() === o);
  const blankState = () => ({ version: 1, view: 'practice', subject: '组织学', type: '全部', order: 'sequential', records: {}, wrong: {}, sessions: {}, exams: {} });
  let state = blankState();
  let storageMessage = '';
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.version === 1) {
      state = { ...state, ...saved };
      for (const key of ['records', 'wrong', 'sessions', 'exams']) {
        if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) state[key] = {};
      }
    }
  } catch (_) {
    storageMessage = '无法读取本地记录。本次仍可练习；请检查浏览器是否允许本地存储。';
  }
  if (!['practice', 'wrong', 'exam'].includes(state.view)) state.view = 'practice';
  if (!EXAM_STRUCTURE[state.subject]) state.subject = '组织学';
  if (!['sequential', 'random'].includes(state.order)) state.order = 'sequential';
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (_) {
      storageMessage = '本地保存失败，刷新可能丢失本次进度。请检查存储空间或浏览器隐私设置。';
      showStorageWarning();
    }
  }
  function showStorageWarning() {
    $('storage-warning').hidden = !storageMessage;
    $('storage-warning').textContent = storageMessage;
  }
  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function notify(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { $('toast').hidden = true; }, 3000);
  }
  function record(id, correct) {
    const old = state.records[id];
    state.records[id] = { correct, attempts: (old?.attempts || 0) + 1, at: Date.now() };
    if (correct) delete state.wrong[id];
    else state.wrong[id] = true;
    save();
    renderStats();
  }
  function renderStats() {
    const done = QUESTIONS.filter(q => state.records[q.id]).length;
    const wrong = QUESTIONS.filter(q => state.wrong[q.id]).length;
    $('total-stat').textContent = QUESTIONS.length;
    $('done-stat').textContent = done;
    $('wrong-stat').textContent = wrong;
    $('wrong-count').textContent = wrong;
    $('overall-bar').style.width = `${QUESTIONS.length ? done / QUESTIONS.length * 100 : 0}%`;
    $('overall-text').textContent = `已练 ${done} / ${QUESTIONS.length} 题`;
  }
  function setupFilters() {
    $('subject').value = state.subject;
    const available = TYPES.filter(type => QUESTIONS.some(q => q.subject === state.subject && q.type === type));
    if (!available.includes(state.type)) state.type = '全部';
    $('type').innerHTML = '<option value="全部">全部题型</option>' + available.map(t => `<option value="${h(t)}">${h(t)}</option>`).join('');
    $('type').value = state.type;
    $('order').value = state.order;
    $('type-filter').hidden = state.view === 'exam';
    $('order-filter').hidden = state.view === 'exam';
    document.querySelectorAll('[data-view]').forEach(button => {
      const active = button.dataset.view === state.view;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }
  const sessionKey = () => [state.view, state.subject, state.type, state.order].join('|');
  function practiceSession() {
    const key = sessionKey();
    let session = state.sessions[key];
    if (!session || !Array.isArray(session.ids) || !session.answers || typeof session.answers !== 'object') {
      const pool = QUESTIONS.filter(q => q.subject === state.subject && (state.type === '全部' || q.type === state.type) && (state.view !== 'wrong' || state.wrong[q.id]));
      session = { ids: (state.order === 'random' ? shuffle(pool) : pool).map(q => q.id), index: 0, answers: {} };
      state.sessions[key] = session;
    }
    session.ids = session.ids.filter(id => byId.has(id));
    session.index = Math.max(0, Math.min(Number(session.index) || 0, session.ids.length - 1));
    return session;
  }
  function examSession() {
    const exam = state.exams[state.subject];
    if (!exam) return null;
    // 题库内容改变后，不保留缺题的旧试卷。
    if (!Array.isArray(exam.ids) || !exam.ids.length || exam.ids.some(id => !byId.has(id)) || !exam.answers || !['running', 'grading', 'complete'].includes(exam.phase)) {
      delete state.exams[state.subject];
      return null;
    }
    exam.index = Math.max(0, Math.min(Number(exam.index) || 0, exam.ids.length - 1));
    return exam;
  }
  const currentSession = () => state.view === 'exam' ? examSession() : practiceSession();
  function answerPanel(q, a, exam) {
    if (!a.revealed) return '';
    const graded = typeof a.correct === 'boolean';
    return `<div class="answer-panel" aria-live="polite">
      <div class="feedback ${a.correct === false ? 'wrong' : ''}">${graded ? (a.correct ? '回答正确' : '本题需再巩固，已加入错题本') : '对照参考答案，完成自评'}</div>
      ${!q.verified ? '<p class="warning">本题待核实，参考答案和自评结果请结合教材确认。</p>' : ''}
      <p class="answer-label">参考答案</p><p>${h(objective(q) ? q.options[answerIndex(q)] : q.answer)}</p>
      <p class="answer-label">解析</p><p>${h(q.explanation)}</p>
      ${!objective(q) && !graded ? '<div class="actions"><button type="button" data-action="grade-wrong" class="danger">我答错了</button><button type="button" data-action="grade-correct" class="primary">我答对了</button></div>' : ''}
      ${graded && !exam ? '<div class="actions"><button type="button" data-action="retry">再练一次</button></div>' : ''}
    </div>`;
  }
  function questionHTML(session, exam = false) {
    const q = byId.get(session.ids[session.index]);
    const a = session.answers[q.id] || {};
    const running = exam && session.phase === 'running';
    const locked = exam ? !running : a.revealed;
    const graded = typeof a.correct === 'boolean';
    const answered = session.ids.filter(id => {
      const item = session.answers[id];
      return item && (typeof item.choice === 'number' || Boolean(item.draft?.trim()));
    }).length;
    return `${exam ? `<div class="exam-status"><span>${running ? `作答中 · 已作答 ${answered} / ${session.ids.length}` : session.phase === 'grading' ? '已交卷 · 请自评主观题' : '试卷回顾'}</span><button type="button" data-action="${running ? 'submit-exam' : session.phase === 'complete' ? 'show-result' : 'next-ungraded'}">${running ? '交卷' : session.phase === 'complete' ? '查看成绩' : '前往待自评题'}</button></div>` : ''}
    <article class="question-card">
      <div class="card-top"><span class="badge">${h(q.subject)}</span><span class="badge">${h(q.type)}</span>${!q.verified ? '<span class="badge pending">待核实</span>' : ''}<span class="position">第 ${session.index + 1} / ${session.ids.length} 题</span></div>
      <h2 class="question-text" tabindex="-1">${h(q.question)}</h2>
      ${objective(q) ? `<div class="options">${q.options.map((option, i) => {
        const classes = ['option'];
        if (a.choice === i) classes.push('selected');
        if (a.revealed && i === answerIndex(q)) classes.push('correct');
        if (a.revealed && a.choice === i && a.correct === false) classes.push('incorrect');
        const status = a.revealed && i === answerIndex(q) ? '（正确答案）' : a.revealed && a.choice === i && a.correct === false ? '（选择错误）' : a.choice === i ? '（已选择）' : '';
        return `<button type="button" data-action="choose" data-index="${i}" class="${classes.join(' ')}" aria-pressed="${a.choice === i}" ${locked ? 'disabled' : ''}><span class="option-letter">${String.fromCharCode(65 + i)}</span><span>${h(option.replace(/^[A-Z][.．、\s]+/, ''))}${status}</span></button>`;
      }).join('')}</div>` : `<label for="draft" class="draft-label">我的作答 · ${running ? '交卷后对照答案自评' : '先独立思考，再查看答案'}</label><textarea id="draft" placeholder="在这里写下答案、计算过程或思路……" ${locked ? 'disabled' : ''}>${h(a.draft || '')}</textarea>${!exam && !a.revealed ? '<div class="actions"><button type="button" data-action="reveal" class="primary">显示答案</button></div>' : ''}`}
      ${answerPanel(q, a, exam)}
      ${!exam && !a.revealed && objective(q) ? '<p class="small muted" style="margin-top:20px">点选选项，即可查看答案与解析。</p>' : ''}
      <p class="source">来源：${h(q.source)}${graded ? ' · 本题已完成' : ''}</p>
      <div class="nav-actions"><button type="button" data-action="prev" ${session.index === 0 ? 'disabled' : ''}>上一题</button><button type="button" data-action="${session.index === session.ids.length - 1 ? (exam ? running ? 'submit-exam' : session.phase === 'complete' ? 'show-result' : 'next-ungraded' : 'round-end') : 'next'}" class="primary">${session.index === session.ids.length - 1 ? (exam ? running ? '交卷' : session.phase === 'complete' ? '查看成绩' : '继续自评' : '完成本轮') : '下一题'}</button></div>
    </article>
    ${exam ? `<div class="palette" aria-label="试卷题目导航">${session.ids.map((id, i) => {
      const item = session.answers[id] || {};
      return `<button type="button" data-action="jump" data-index="${i}" class="${i === session.index ? 'current' : ''} ${item.correct === false ? 'mistake' : item.correct === true || (running && (typeof item.choice === 'number' || item.draft?.trim())) ? 'filled' : !running && !objective(byId.get(id)) ? 'ungraded' : ''}" aria-label="第 ${i + 1} 题，${item.correct === false ? '答错' : item.correct === true ? '答对' : !running && !objective(byId.get(id)) ? '待自评' : typeof item.choice === 'number' || item.draft?.trim() ? '已作答' : '未作答'}" ${i === session.index ? 'aria-current="step"' : ''}>${i + 1}</button>`;
    }).join('')}</div><p class="small muted" style="margin-top:10px">${running ? '点击题号可跳题，交卷前可修改作答。' : '绿色为答对，红色为答错，黄色为待自评。'}</p>` : ''}`;
  }
  function renderPractice() {
    const session = practiceSession();
    if (!session.ids.length) {
      return `<section class="empty-card"><p class="eyebrow">${state.view === 'wrong' ? '给自己一点肯定' : '换个方向继续'}</p><h2>${state.view === 'wrong' ? '这里暂时没有错题' : '暂无符合条件的题目'}</h2><p class="muted">${state.view === 'wrong' ? '当前科目与题型没有待复习题目，继续保持。' : '请切换科目或题型再试。'}</p><button type="button" data-action="go-practice" class="primary">回到日常练习</button></section>`;
    }
    return questionHTML(session);
  }
  function renderExam() {
    const exam = examSession();
    if (exam) {
      if (exam.phase === 'complete' && !exam.review) {
        const correct = exam.ids.filter(id => exam.answers[id]?.correct).length;
        const pending = exam.ids.filter(id => !byId.get(id).verified).length;
        return `<section class="result-card"><p class="eyebrow">本次模拟已完成</p><h2>${h(state.subject)} · 练习成绩</h2><p class="result-number">${correct}<small> / ${exam.ids.length} 题正确</small></p><p class="muted">正确率 ${Math.round(correct / exam.ids.length * 100)}%，主观题按你的自评计入。</p><p class="small muted" style="margin-top:14px">未作答的客观题按错误计入。错题已同步到错题本。${pending ? `本卷含 ${pending} 道待核实题，结果仅供复习参考。` : ''}</p><div class="actions"><button type="button" data-action="review-exam">回顾试卷</button><button type="button" data-action="new-exam" class="primary">重新抽卷</button></div></section>`;
      }
      return questionHTML(exam, true);
    }
    const structure = EXAM_STRUCTURE[state.subject];
    const count = Object.values(structure).reduce((a, b) => a + b, 0);
    return `<section class="exam-card"><p class="eyebrow">认真练一次，心里更有底</p><h2>${h(state.subject)}模拟考</h2><p class="muted">按题型结构随机抽题，共 ${count} 题。</p><div class="exam-structure">${Object.entries(structure).map(([type, n]) => `<span>${h(type)} <strong>${n}</strong> 题</span>`).join('')}</div><p class="small muted">每题只出现一次。交卷后批改客观题，主观题对照答案自评。以答对题数统计成绩，不设置考试时限或分值权重。</p>${state.subject === '组织学' ? '<p class="small muted" style="margin-top:12px">计算、论述暂各抽 1 题；数量可在配置中调整。</p>' : ''}<div class="actions"><button type="button" data-action="start-exam" class="primary">开始模拟考</button></div><p class="source">试卷和作答自动保存在当前浏览器，可随时回来继续。</p></section>`;
  }
  function render(focus = false) {
    setupFilters();
    renderStats();
    showStorageWarning();
    if (!QUESTIONS.length) {
      $('workspace').innerHTML = '<section class="empty-card"><h2>题库尚未加载</h2><p>请先运行 node build.js，并确认 questions.js 与网页在同一目录。</p></section>';
      return;
    }
    $('workspace').innerHTML = state.view === 'exam' ? renderExam() : renderPractice();
    save();
    if (focus) $('workspace').querySelector('.question-text')?.focus({ preventScroll: true });
  }
  function startExam() {
    const ids = [];
    for (const [type, count] of Object.entries(EXAM_STRUCTURE[state.subject])) {
      const pool = QUESTIONS.filter(q => q.subject === state.subject && q.type === type);
      if (pool.length < count) { notify(`${type}题不足：需要 ${count} 题，现有 ${pool.length} 题。请更新题库。`); return; }
      ids.push(...shuffle(pool).slice(0, count).map(q => q.id));
    }
    state.exams[state.subject] = { ids, index: 0, answers: {}, phase: 'running', startedAt: Date.now(), review: false };
    render(true);
  }
  function finishGrading(exam) {
    if (exam.ids.every(id => typeof exam.answers[id]?.correct === 'boolean')) {
      exam.phase = 'complete';
      exam.finishedAt = Date.now();
      exam.review = false;
    }
  }
  function nextUngraded(exam) {
    const index = exam.ids.findIndex(id => !objective(byId.get(id)) && typeof exam.answers[id]?.correct !== 'boolean');
    if (index >= 0) exam.index = index;
    else finishGrading(exam);
  }
  $('workspace').addEventListener('input', event => {
    if (event.target.id !== 'draft') return;
    const session = currentSession();
    if (!session || (state.view === 'exam' && session.phase !== 'running')) return;
    const id = session.ids[session.index];
    const a = session.answers[id] ||= {};
    if (a.revealed) return;
    a.draft = event.target.value;
    save();
    if (state.view === 'exam') {
      const n = session.ids.filter(id => { const a = session.answers[id]; return a && (typeof a.choice === 'number' || a.draft?.trim()); }).length;
      $('workspace').querySelector('.exam-status span').textContent = `作答中 · 已作答 ${n} / ${session.ids.length}`;
      const marker = $('workspace').querySelector(`[data-action="jump"][data-index="${session.index}"]`);
      marker?.classList.toggle('filled', Boolean(a.draft.trim()));
      marker?.setAttribute('aria-label', `第 ${session.index + 1} 题，${a.draft.trim() ? '已作答' : '未作答'}`);
    }
  });
  $('workspace').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'go-practice') { state.view = 'practice'; render(); return; }
    if (action === 'start-exam' || action === 'new-exam') { startExam(); return; }
    const exam = state.view === 'exam';
    const session = currentSession();
    if (!session || !session.ids.length) return;
    const id = session.ids[session.index];
    const q = byId.get(id);
    const a = session.answers[id] ||= {};
    if (action === 'choose') {
      if ((!exam && a.revealed) || (exam && session.phase !== 'running')) return;
      a.choice = Number(button.dataset.index);
      if (!exam) {
        a.revealed = true;
        a.correct = a.choice === answerIndex(q);
        record(id, a.correct);
      }
    } else if (action === 'reveal') {
      if (!a.draft?.trim()) { notify('请先写下自己的答案或思路，再对照参考答案。'); $('draft')?.focus(); return; }
      a.revealed = true;
    } else if (action === 'grade-correct' || action === 'grade-wrong') {
      if (!a.revealed || objective(q) || typeof a.correct === 'boolean') return;
      a.correct = action === 'grade-correct';
      record(id, a.correct);
      if (exam) finishGrading(session);
    } else if (action === 'retry' && !exam) {
      delete session.answers[id];
    } else if (action === 'prev') session.index = Math.max(0, session.index - 1);
    else if (action === 'next') session.index = Math.min(session.ids.length - 1, session.index + 1);
    else if (action === 'jump') session.index = Number(button.dataset.index);
    else if (action === 'round-end') {
      const n = session.ids.filter(id => typeof session.answers[id]?.correct === 'boolean').length;
      if (!window.confirm(`本轮已完成 ${n} / ${session.ids.length} 题。是否开始新一轮？已保存的学习进度和错题会保留。`)) return;
      delete state.sessions[sessionKey()];
    } else if (action === 'submit-exam' && exam && session.phase === 'running') {
      const unanswered = session.ids.filter(id => { const a = session.answers[id]; return !a || (typeof a.choice !== 'number' && !a.draft?.trim()); }).length;
      if (!window.confirm(`${unanswered ? `还有 ${unanswered} 题未作答。` : '所有题目已作答。'}确定交卷吗？交卷后不能修改作答，主观题需自评。`)) return;
      session.phase = 'grading';
      for (const id of session.ids) {
        const q = byId.get(id);
        const a = session.answers[id] ||= {};
        a.revealed = true;
        if (objective(q)) { a.correct = a.choice === answerIndex(q); record(id, a.correct); }
        else if (!a.draft?.trim()) { a.correct = false; record(id, false); }
      }
      nextUngraded(session);
    } else if (action === 'next-ungraded' && exam) nextUngraded(session);
    else if (action === 'show-result' && exam) session.review = false;
    else if (action === 'review-exam' && exam) { session.review = true; session.index = 0; }
    render(['prev', 'next', 'jump', 'next-ungraded', 'submit-exam', 'retry'].includes(action));
  });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    if (state.view === button.dataset.view) return;
    state.view = button.dataset.view;
    // 每次进入错题本都按当前错题重新组卷，避免旧缓存遗漏新增错题。
    if (state.view === 'wrong') {
      for (const key of Object.keys(state.sessions)) if (key.startsWith('wrong|')) delete state.sessions[key];
    }
    render();
  }));
  for (const key of ['subject', 'type', 'order']) $(key).addEventListener('change', event => {
    state[key] = event.target.value;
    render();
  });
  render();
})();
