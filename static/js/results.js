let resultsData = null;
let currentFilter = 'all';
let currentSectionFilter = 'all';

function optionLabel(idx) {
  return idx < 26 ? String.fromCharCode(65 + idx) : String(idx + 1);
}

function bindEventHandlers() {
  const startNewBtn = document.getElementById('startNewBtn');
  const cancelNewTestBtn = document.getElementById('cancelNewTestBtn');
  const confirmNewTestBtn = document.getElementById('confirmNewTestBtn');
  const tabAnalysisBtn = document.getElementById('tabAnalysis');
  const tabReviewBtn = document.getElementById('tabReview');
  const reviewFilterBar = document.getElementById('reviewFilterBar');
  const sectionFilter = document.getElementById('sectionFilter');
  const reviewList = document.getElementById('reviewList');

  if (startNewBtn) {
    startNewBtn.addEventListener('click', startNew);
  }

  if (cancelNewTestBtn) {
    cancelNewTestBtn.addEventListener('click', () => {
      document.getElementById('newTestModal').classList.remove('show');
    });
  }

  if (confirmNewTestBtn) {
    confirmNewTestBtn.addEventListener('click', confirmNew);
  }

  if (tabAnalysisBtn) {
    tabAnalysisBtn.addEventListener('click', () => switchTab('analysis'));
  }

  if (tabReviewBtn) {
    tabReviewBtn.addEventListener('click', () => switchTab('review'));
  }

  if (reviewFilterBar) {
    reviewFilterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      filterReview(btn.dataset.filter || 'all', btn);
    });
  }

  if (sectionFilter) {
    sectionFilter.addEventListener('change', onSectionFilterChange);
  }

  if (reviewList) {
    reviewList.addEventListener('click', (e) => {
      const header = e.target.closest('.review-item-header');
      if (!header) return;
      const item = header.closest('.review-item');
      if (item) toggleReview(item);
    });
  }
}

async function init() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) loadingOverlay.classList.remove('is-hidden');

  try {
    const res = await fetch('/api/results');
    if (!res.ok) {
      window.location.href = '/';
      return;
    }

    resultsData = await res.json();
    if (loadingOverlay) loadingOverlay.classList.add('is-hidden');
    renderResults();
  } catch (e) {
    if (loadingOverlay) loadingOverlay.classList.add('is-hidden');
    window.location.href = '/';
  }
}

function renderResults() {
  const s = resultsData.summary;
  const questions = resultsData.questions || [];

  document.getElementById('heroTitle').textContent = `${s.filename} - Complete!`;
  document.getElementById('heroSub').textContent = `Submitted ${new Date().toLocaleTimeString()}`;
  document.getElementById('heroCorrect').textContent = s.correct;
  document.getElementById('heroIncorrect').textContent = s.incorrect;
  document.getElementById('heroSkipped').textContent = s.skipped;
  document.getElementById('heroTotal').textContent = s.total;

  document.getElementById('scorePct').textContent = `${s.accuracy}%`;
  setTimeout(() => {
    const circumference = 326.7;
    const offset = circumference - (s.accuracy / 100) * circumference;
    document.getElementById('ringFill').style.strokeDashoffset = offset;
  }, 300);

  document.getElementById('mAccuracy').textContent = `${s.accuracy}%`;
  document.getElementById('mScore').textContent = `${Number(s.score ?? 0).toFixed(2).replace(/\.00$/, '')} / ${Number(s.max_score ?? 0).toFixed(2).replace(/\.00$/, '')}`;
  document.getElementById('mCorrect').textContent = s.correct;
  document.getElementById('mIncorrect').textContent = s.incorrect;
  document.getElementById('mSkipped').textContent = s.skipped;
  document.getElementById('mTotalTime').textContent = `${(s.total_time / 60).toFixed(1)} min`;
  document.getElementById('mAvgTime').textContent = `${s.avg_time_per_question}s`;

  const attempted = s.correct + s.incorrect;
  const attemptRate = s.total > 0 ? (attempted / s.total) * 100 : 0;
  const attemptedAccuracy = attempted > 0 ? (s.correct / attempted) * 100 : 0;
  document.getElementById('mAttemptedPercent').textContent = `${attemptRate.toFixed(1)}%`;

  const correctQs = questions.filter((q) => q.status === 'correct');
  const fastestCorrect = correctQs.length > 0
    ? correctQs.reduce((minQ, q) => (q.time_spent < minQ.time_spent ? q : minQ), correctQs[0])
    : null;
  const slowestQuestion = questions.length > 0
    ? questions.reduce((maxQ, q) => (q.time_spent > maxQ.time_spent ? q : maxQ), questions[0])
    : null;

  document.getElementById('iAttempted').textContent = `${attempted}/${s.total}`;
  document.getElementById('iAttemptRate').textContent = `${attemptRate.toFixed(1)}% attempted`;
  document.getElementById('iAttemptedAccuracy').textContent = `${attemptedAccuracy.toFixed(1)}%`;
  document.getElementById('iFastestCorrect').textContent = fastestCorrect
    ? `Q${fastestCorrect.id} · ${fastestCorrect.time_spent}s`
    : 'N/A';
  document.getElementById('iSlowestQuestion').textContent = slowestQuestion
    ? `Q${slowestQuestion.id} · ${slowestQuestion.time_spent}s`
    : 'N/A';

  renderSectionAnalysis(resultsData.sections_summary || []);
  renderTimeChart(questions);
  populateSectionFilter();
  renderReview();
}

function renderTimeChart(questions) {
  const maxTime = Math.max(...questions.map((q) => Number(q.time_spent) || 0), 1);
  const timeChart = document.getElementById('timeChart');
  if (!timeChart) return;

  timeChart.innerHTML = '';
  const colors = { correct: '#22c55e', incorrect: '#ef4444', skipped: '#f59e0b' };

  [...questions]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .forEach((q) => {
      const col = document.createElement('div');
      const timeSpent = Number(q.time_spent) || 0;
      const height = Math.max(6, (timeSpent / maxTime) * 100);
      col.className = 'time-col';
      col.innerHTML = `
        <div class="time-col-value">${timeSpent}s</div>
        <div class="time-col-track" title="Q${q.id}: ${timeSpent}s (${q.status})">
          <div class="time-col-bar"></div>
        </div>
        <div class="time-col-label">Q${q.id}</div>
      `;

      const bar = col.querySelector('.time-col-bar');
      if (bar) {
        bar.style.height = `${height}%`;
        bar.style.background = colors[q.status] || '#94a3b8';
      }

      timeChart.appendChild(col);
    });
}

function populateSectionFilter() {
  const select = document.getElementById('sectionFilter');
  if (!select || !resultsData || !resultsData.questions) return;

  const sections = [...new Set(resultsData.questions.map((q) => q.section || 'General'))];
  select.innerHTML = '<option value="all">All Sections</option>';

  sections.forEach((sec) => {
    const option = document.createElement('option');
    option.value = sec;
    option.textContent = sec;
    select.appendChild(option);
  });

  if (!sections.includes(currentSectionFilter)) {
    currentSectionFilter = 'all';
  }
  select.value = currentSectionFilter;
}

function renderSectionAnalysis(sectionsSummary) {
  const container = document.getElementById('sectionAnalysisGrid');
  if (!container) return;

  container.innerHTML = '';
  if (!sectionsSummary || sectionsSummary.length === 0) {
    container.innerHTML = '<div class="section-analysis-empty">No section-wise data found.</div>';
    return;
  }

  sectionsSummary.forEach((sec) => {
    const card = document.createElement('div');
    card.className = 'section-analysis-card';
    card.innerHTML = `
      <div class="section-analysis-title">${sec.section}</div>
      <div class="section-analysis-row"><span>Score</span><strong>${sec.score} / ${sec.max_score}</strong></div>
      <div class="section-analysis-row"><span>Accuracy</span><strong>${sec.accuracy}%</strong></div>
      <div class="section-analysis-row"><span>Attempted</span><strong>${sec.attempted}/${sec.total}</strong></div>
      <div class="section-analysis-row"><span>Correct / Incorrect / Skipped</span><strong>${sec.correct} / ${sec.incorrect} / ${sec.skipped}</strong></div>
      <div class="section-analysis-row"><span>Total Time</span><strong>${(sec.time_spent / 60).toFixed(1)} min</strong></div>
      <div class="section-analysis-row"><span>Avg Time/Q</span><strong>${sec.avg_time_per_question}s</strong></div>
    `;
    container.appendChild(card);
  });
}

function onSectionFilterChange() {
  const select = document.getElementById('sectionFilter');
  currentSectionFilter = select ? select.value : 'all';
  renderReview(currentFilter, currentSectionFilter);
}

function renderReview(filter = 'all', sectionFilter = currentSectionFilter) {
  const list = document.getElementById('reviewList');
  if (!list) return;

  list.innerHTML = '';
  const statusIcons = { correct: '✅', incorrect: '❌', skipped: '⏭' };

  let questions = filter === 'all'
    ? resultsData.questions
    : resultsData.questions.filter((q) => q.status === filter);

  if (sectionFilter !== 'all') {
    questions = questions.filter((q) => (q.section || 'General') === sectionFilter);
  }

  questions.forEach((q) => {
    const item = document.createElement('div');
    item.className = 'review-item';
    item.dataset.status = q.status;

    const headerHTML = `
      <div class="review-item-header">
        <div class="review-status-icon ${q.status}">${statusIcons[q.status]}</div>
        <div class="review-q-text">Q${q.id}. ${q.text.substring(0, 80)}${q.text.length > 80 ? '...' : ''}</div>
        <div class="review-time-badge">⏱ ${q.time_spent}s</div>
        <div class="review-chevron">▼</div>
      </div>
    `;

    let optionsHTML = '<div class="review-options-list">';
    q.options.forEach((opt, idx) => {
      const isUser = q.user_answer === idx;
      const isCorrect = q.correct_answer === idx;
      let cls = 'neutral';
      let indicator = '';

      if (isUser && isCorrect) {
        cls = 'correct-answer';
        indicator = ' ✓';
      } else if (isUser && !isCorrect) {
        cls = 'user-answer';
        indicator = ' ✗';
      } else if (isCorrect) {
        cls = 'correct-answer';
        indicator = ' ✓';
      }

      optionsHTML += `
        <div class="review-opt ${cls}">
          <div class="r-letter">${optionLabel(idx)}</div>
          <span>${opt}${indicator}</span>
        </div>`;
    });
    optionsHTML += '</div>';

    const bodyHTML = `
      <div class="review-item-body">
        <div class="review-question-full">Q${q.id}. ${q.text}</div>
        ${optionsHTML}
        <div class="explanation-box">
          <div class="explanation-title">💡 Explanation</div>
          <div class="explanation-text">${q.explanation || 'No explanation available.'}</div>
        </div>
      </div>
    `;

    item.innerHTML = headerHTML + bodyHTML;
    list.appendChild(item);
  });

  if (questions.length === 0) {
    list.innerHTML = '<div class="review-empty">No questions in this category.</div>';
  }
}

function toggleReview(item) {
  item.classList.toggle('open');
}

function filterReview(filter, btn) {
  currentFilter = filter;
  renderReview(filter, currentSectionFilter);

  document.querySelectorAll('#reviewFilterBar .btn-sm').forEach((b) => {
    b.className = 'btn btn-sm btn-ghost';
  });

  btn.className = 'btn btn-sm btn-secondary active-filter';
}

function switchTab(tab) {
  const panelAnalysis = document.getElementById('panelAnalysis');
  const panelReview = document.getElementById('panelReview');
  const tabAnalysis = document.getElementById('tabAnalysis');
  const tabReview = document.getElementById('tabReview');

  if (panelAnalysis) panelAnalysis.classList.toggle('is-hidden', tab !== 'analysis');
  if (panelReview) panelReview.classList.toggle('is-hidden', tab !== 'review');
  if (tabAnalysis) tabAnalysis.className = 'tab-btn' + (tab === 'analysis' ? ' active' : '');
  if (tabReview) tabReview.className = 'tab-btn' + (tab === 'review' ? ' active' : '');
}

function startNew() {
  const modal = document.getElementById('newTestModal');
  if (modal) modal.classList.add('show');
}

async function confirmNew() {
  await fetch('/api/reset', { method: 'POST' });
  window.location.href = '/';
}

bindEventHandlers();
init();
