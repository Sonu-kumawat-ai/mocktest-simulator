function optionLabel(idx) {
  return idx < 26 ? String.fromCharCode(65 + idx) : String(idx + 1);
}

// -- State --
let testData = null;
let currentQ = 0;
let answers = {}; // { qId: optionIndex }
let timePerQuestion = {}; // { qId: seconds }
let skipped = new Set();
let totalSeconds = 0;
let timerInterval = null;
let qStartTime = Date.now();
let autoSaveTimeout = null;
let hasSubmitted = false;
let sectionMode = false;
let sections = [];
let currentSectionIdx = 0;
let sectionRemaining = 0;

function bindEventHandlers() {
  const prevBtn = document.getElementById('prevBtn');
  const skipBtn = document.getElementById('skipBtn');
  const nextSectionBtn = document.getElementById('nextSectionBtn');
  const nextBtn = document.getElementById('nextBtn');
  const endBtn = document.getElementById('endBtn');
  const sidebarEndBtn = document.getElementById('sidebarEndBtn');
  const modalContinueBtn = document.getElementById('modalContinueBtn');
  const modalSubmitBtn = document.getElementById('modalSubmitBtn');

  if (prevBtn) prevBtn.addEventListener('click', () => navigate(-1));
  if (skipBtn) skipBtn.addEventListener('click', skipQuestion);
  if (nextSectionBtn) nextSectionBtn.addEventListener('click', () => moveToNextSection(false));
  if (nextBtn) nextBtn.addEventListener('click', () => navigate(1));
  if (endBtn) endBtn.addEventListener('click', confirmEnd);
  if (sidebarEndBtn) sidebarEndBtn.addEventListener('click', confirmEnd);
  if (modalContinueBtn) modalContinueBtn.addEventListener('click', closeModal);
  if (modalSubmitBtn) modalSubmitBtn.addEventListener('click', () => submitTest());
}

// -- Init --
async function init() {
  try {
    const res = await fetch('/api/test-data');
    if (!res.ok) {
      window.location.href = '/';
      return;
    }
    testData = await res.json();

    // Restore from localStorage if available.
    const stored = localStorage.getItem('mocktest_answers_' + testData.test_id);
    if (stored) {
      const parsed = JSON.parse(stored);
      answers = parsed.answers || {};
      timePerQuestion = parsed.timePerQuestion || {};
      skipped = new Set(parsed.skipped || []);
    }

    totalSeconds = testData.total_time;
    sectionMode = Boolean(testData.has_sections && Array.isArray(testData.sections) && testData.sections.length > 0);
    sections = sectionMode
      ? testData.sections
      : [{ id: 1, name: 'All Questions', start_idx: 0, end_idx: testData.total_questions - 1 }];
    currentSectionIdx = 0;
    sectionRemaining = sectionMode ? Number(testData.section_time_seconds || 0) : 0;
    currentQ = sections[0] && Number.isInteger(sections[0].start_idx) ? sections[0].start_idx : 0;

    document.getElementById('testTitle').textContent = testData.filename || 'Mock Test';
    const metaParts = [
      `${testData.total_questions} Questions`,
      `+${Number(testData.marks_per_question || 1).toFixed(2).replace(/\.00$/, '')} marks`
    ];

    if (Number(testData.negative_marks || 0) > 0) {
      metaParts.push(`-${Number(testData.negative_marks).toFixed(2).replace(/\.00$/, '')} negative`);
    }

    if (sectionMode) {
      const eachSectionMin = sectionRemaining > 0 ? Math.round(sectionRemaining / 60) : 0;
      metaParts.push(`${sections.length} sections`);
      if (eachSectionMin > 0) metaParts.push(`${eachSectionMin} min each section`);
      metaParts.push('No return to previous section');
    } else if (Number(testData.sectional_time || 0) > 0) {
      metaParts.push(`Section ${Math.round(testData.sectional_time / 60)} min`);
    } else {
      metaParts.push(`${Math.round(totalSeconds / 60)} min`);
    }

    if (testData.shuffle_questions) {
      metaParts.push('Shuffled');
    }

    metaParts.push('Auto-submit on timeout');
    document.getElementById('testSub').textContent = metaParts.join(' · ');
    document.getElementById('statTotal').textContent = testData.total_questions;

    buildPalette();
    renderQuestion();
    startTimer();
  } catch (e) {
    console.error(e);
    window.location.href = '/';
  }
}

// -- Timer --
function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    totalSeconds -= 1;
    if (sectionMode && sectionRemaining > 0) {
      sectionRemaining -= 1;
    }

    updateTimerDisplay();

    if (sectionMode && sectionRemaining <= 0) {
      if (currentSectionIdx < sections.length - 1) {
        moveToNextSection(true);
      } else {
        clearInterval(timerInterval);
        submitTest(true);
        return;
      }
    }

    if (totalSeconds <= 0) {
      clearInterval(timerInterval);
      submitTest(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const formatClock = (seconds) => {
    const safe = Math.max(0, seconds);
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const timerLabel = document.querySelector('#timerDisplay .timer-label');
  if (sectionMode && sectionRemaining > 0) {
    document.getElementById('timerTime').textContent = formatClock(sectionRemaining);
    if (timerLabel) timerLabel.textContent = 'Section Remaining';
  } else {
    document.getElementById('timerTime').textContent = formatClock(totalSeconds);
    if (timerLabel) timerLabel.textContent = 'Remaining';
  }

  const el = document.getElementById('timerDisplay');
  el.className = 'timer-display';
  const base = sectionMode && sectionRemaining > 0
    ? Number(testData.section_time_seconds || 1)
    : Number(testData.total_time || 1);
  const current = sectionMode && sectionRemaining > 0 ? sectionRemaining : totalSeconds;
  const pct = current / base;
  if (pct <= 0.1) el.classList.add('danger');
  else if (pct <= 0.25) el.classList.add('warning');
}

function getCurrentSection() {
  return sections[currentSectionIdx] || {
    start_idx: 0,
    end_idx: testData.total_questions - 1,
    name: 'All Questions'
  };
}

function moveToNextSection(autoTriggered) {
  if (!sectionMode) return;
  if (currentSectionIdx >= sections.length - 1) {
    if (autoTriggered) submitTest(true);
    return;
  }

  const q = testData.questions[currentQ];
  if (q) recordTimeSpent(String(q.id));

  currentSectionIdx += 1;
  sectionRemaining = Number(testData.section_time_seconds || 0);
  currentQ = getCurrentSection().start_idx;
  renderQuestion();

  if (autoTriggered) {
    showToast(`Section time ended. Moved to ${getCurrentSection().name}.`, '');
  }
}

function isIndexInCurrentSection(idx) {
  const sec = getCurrentSection();
  return idx >= sec.start_idx && idx <= sec.end_idx;
}

// -- Render Question --
function renderQuestion() {
  if (!testData) return;
  if (sectionMode && !isIndexInCurrentSection(currentQ)) {
    currentQ = getCurrentSection().start_idx;
  }

  const q = testData.questions[currentQ];
  const qId = String(q.id);
  qStartTime = Date.now();

  const section = getCurrentSection();
  const isSectionLast = currentQ >= section.end_idx;
  const isSectionFirst = currentQ <= section.start_idx;
  const isLastSection = currentSectionIdx === sections.length - 1;

  document.getElementById('qNumBadge').textContent = currentQ + 1;
  if (sectionMode) {
    const within = currentQ - section.start_idx + 1;
    const secTotal = section.end_idx - section.start_idx + 1;
    document.getElementById('qCount').textContent = `${section.name} · Q${within} of ${secTotal}`;
  } else {
    document.getElementById('qCount').textContent = `Question ${currentQ + 1} of ${testData.total_questions}`;
  }

  const pct = ((currentQ + 1) / testData.total_questions * 100).toFixed(1);
  document.getElementById('qProgressFill').style.width = pct + '%';

  const badge = document.getElementById('qStatusBadge');
  const userAns = answers[qId];
  if (userAns !== undefined && userAns !== -1) {
    badge.className = 'q-status-badge answered';
    badge.textContent = 'Answered';
  } else if (skipped.has(qId)) {
    badge.className = 'q-status-badge skipped';
    badge.textContent = 'Skipped';
  } else {
    badge.className = 'q-status-badge unanswered';
    badge.textContent = 'Not Answered';
  }

  // Render question text with proper formatting and HTML escaping
  const qTextEl = document.getElementById('qText');
  qTextEl.textContent = q.text;
  qTextEl.className = 'q-text';
  if (q.has_special_chars) {
    qTextEl.classList.add('series-content');
  }

  // Render options with proper escaping and formatting
  const grid = document.getElementById('optionsGrid');
  grid.innerHTML = '';
  grid.classList.toggle('compact', q.options.length >= 5);
  q.options.forEach((opt, idx) => {
    const div = document.createElement('div');
    const optClasses = ['option-item'];
    if (answers[qId] === idx) optClasses.push('selected');
    if (q.has_special_chars) optClasses.push('symbol-heavy');
    
    div.className = optClasses.join(' ');
    
    // Create option letter (safe - just a character)
    const letterDiv = document.createElement('div');
    letterDiv.className = 'option-letter';
    letterDiv.textContent = optionLabel(idx);
    
    // Create option text (escaped to prevent HTML injection)
    const textDiv = document.createElement('div');
    textDiv.className = 'option-text';
    textDiv.textContent = opt;
    
    div.appendChild(letterDiv);
    div.appendChild(textDiv);
    div.addEventListener('click', () => selectAnswer(idx));
    grid.appendChild(div);
  });

  const nextBtn = document.getElementById('nextBtn');
  const nextSectionBtn = document.getElementById('nextSectionBtn');
  const endBtn = document.getElementById('endBtn');
  const prevBtn = document.getElementById('prevBtn');

  if (sectionMode) {
    nextBtn.style.display = isSectionLast ? 'none' : 'inline-flex';
    nextSectionBtn.style.display = isLastSection ? 'none' : 'inline-flex';
    endBtn.style.display = isLastSection && isSectionLast ? 'inline-flex' : 'none';
    prevBtn.disabled = isSectionFirst;
  } else {
    const isLast = currentQ === testData.total_questions - 1;
    nextBtn.style.display = isLast ? 'none' : 'inline-flex';
    nextSectionBtn.style.display = 'none';
    endBtn.style.display = isLast ? 'inline-flex' : 'none';
    prevBtn.disabled = currentQ === 0;
  }

  updatePalette();
  updateStats();
}

// -- Answer Selection --
function selectAnswer(idx) {
  const q = testData.questions[currentQ];
  const qId = String(q.id);
  answers[qId] = idx;
  skipped.delete(qId);
  renderQuestion();
  autoSave(qId, idx);
}

function skipQuestion() {
  const q = testData.questions[currentQ];
  const qId = String(q.id);
  recordTimeSpent(qId);
  skipped.add(qId);
  if (answers[qId] === undefined) answers[qId] = -1;
  saveToLocalStorage();
  showToast('Question skipped', '');

  if (sectionMode) {
    const sec = getCurrentSection();
    if (currentQ < sec.end_idx) navigate(1);
    else renderQuestion();
  } else if (currentQ < testData.total_questions - 1) {
    navigate(1);
  } else {
    renderQuestion();
  }
}

// -- Navigation --
function navigate(dir) {
  const q = testData.questions[currentQ];
  recordTimeSpent(String(q.id));

  if (sectionMode) {
    const sec = getCurrentSection();
    currentQ = Math.max(sec.start_idx, Math.min(sec.end_idx, currentQ + dir));
  } else {
    currentQ = Math.max(0, Math.min(testData.total_questions - 1, currentQ + dir));
  }

  renderQuestion();
}

function goToQuestion(idx) {
  if (sectionMode && !isIndexInCurrentSection(idx)) return;
  const q = testData.questions[currentQ];
  recordTimeSpent(String(q.id));
  currentQ = idx;
  renderQuestion();
}

function recordTimeSpent(qId) {
  const elapsed = (Date.now() - qStartTime) / 1000;
  timePerQuestion[qId] = (timePerQuestion[qId] || 0) + elapsed;
  qStartTime = Date.now();
}

// -- Auto Save --
function autoSave(qId, answer) {
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(async () => {
    recordTimeSpent(qId);
    saveToLocalStorage();
    try {
      await fetch('/api/save-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: qId,
          answer,
          time_spent: timePerQuestion[qId] || 0
        })
      });
    } catch (e) {
      // silent fail, localStorage backup covers this path
    }
  }, 400);
}

function saveToLocalStorage() {
  if (!testData) return;
  localStorage.setItem('mocktest_answers_' + testData.test_id, JSON.stringify({
    answers,
    timePerQuestion,
    skipped: [...skipped],
    timestamp: Date.now()
  }));
}

// -- Palette --
function buildPalette() {
  const grid = document.getElementById('paletteGrid');
  grid.innerHTML = '';
  testData.questions.forEach((q, idx) => {
    const dot = document.createElement('button');
    dot.className = 'palette-dot';
    dot.textContent = idx + 1;
    dot.title = `Question ${idx + 1}`;
    dot.addEventListener('click', () => goToQuestion(idx));
    grid.appendChild(dot);
  });
}

function updatePalette() {
  const dots = document.querySelectorAll('.palette-dot');
  dots.forEach((dot, idx) => {
    const q = testData.questions[idx];
    const qId = String(q.id);
    dot.className = 'palette-dot';

    if (sectionMode && !isIndexInCurrentSection(idx)) {
      dot.classList.add('locked');
      dot.disabled = true;
      return;
    }

    dot.disabled = false;
    if (idx === currentQ) dot.classList.add('active');
    else if (answers[qId] !== undefined && answers[qId] !== -1) dot.classList.add('answered');
    else if (skipped.has(qId)) dot.classList.add('skipped');
  });
}

function updateStats() {
  let answered = 0;
  let skippedCount = 0;
  let total = testData.total_questions;
  let idsInScope = null;

  if (sectionMode) {
    const sec = getCurrentSection();
    const idxs = [];
    for (let i = sec.start_idx; i <= sec.end_idx; i += 1) idxs.push(i);
    idsInScope = new Set(idxs.map((i) => String(testData.questions[i].id)));
    total = idxs.length;
  }

  Object.entries(answers).forEach(([k, v]) => {
    if (idsInScope && !idsInScope.has(k)) return;
    if (v !== -1 && v !== undefined) answered += 1;
    else if (v === -1 || skipped.has(k)) skippedCount += 1;
  });

  const remaining = total - answered - skippedCount;
  document.getElementById('statAnswered').textContent = answered;
  document.getElementById('statSkipped').textContent = skippedCount;
  document.getElementById('statUnanswered').textContent = Math.max(0, remaining);
  document.getElementById('statTotal').textContent = total;

  if (sectionMode) {
    document.getElementById('statAnsweredLbl').textContent = 'Section Ans';
    document.getElementById('statSkippedLbl').textContent = 'Section Skip';
    document.getElementById('statRemainingLbl').textContent = 'Section Left';
    document.getElementById('statTotalLbl').textContent = 'Section Total';
  } else {
    document.getElementById('statAnsweredLbl').textContent = 'Answered';
    document.getElementById('statSkippedLbl').textContent = 'Skipped';
    document.getElementById('statRemainingLbl').textContent = 'Remaining';
    document.getElementById('statTotalLbl').textContent = 'Total';
  }
}

// -- End Test --
function confirmEnd() {
  const answered = Object.values(answers).filter((v) => v !== -1 && v !== undefined).length;
  const unanswered = testData.total_questions - answered;
  const body = unanswered > 0
    ? `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Are you sure you want to submit?`
    : `All ${testData.total_questions} questions answered. Ready to submit?`;
  document.getElementById('endModalBody').textContent = body;
  document.getElementById('endModal').classList.add('show');
}

function closeModal() {
  document.getElementById('endModal').classList.remove('show');
}

async function submitTest(isAutoSubmit = false) {
  if (hasSubmitted) return;
  hasSubmitted = true;
  closeModal();
  clearInterval(timerInterval);

  const q = testData.questions[currentQ];
  recordTimeSpent(String(q.id));
  saveToLocalStorage();

  document.getElementById('loadingText').textContent = isAutoSubmit
    ? 'Time is up. Auto-submitting...'
    : 'Submitting test...';
  document.getElementById('loadingOverlay').style.display = 'flex';

  try {
    const res = await fetch('/api/submit-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, time_per_question: timePerQuestion })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.removeItem('mocktest_answers_' + testData.test_id);
      window.location.href = '/results';
    }
  } catch (e) {
    hasSubmitted = false;
    document.getElementById('loadingOverlay').style.display = 'none';
    showToast('Error submitting. Please try again.', 'error');
  }
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 2500);
}

// -- Keyboard Navigation --
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigate(1);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigate(-1);
  if (/^[a-z]$/i.test(e.key)) {
    const idx = e.key.toUpperCase().charCodeAt(0) - 65;
    const opts = testData && testData.questions[currentQ] ? testData.questions[currentQ].options : null;
    if (opts && idx >= 0 && idx < opts.length) selectAnswer(idx);
  }
});

bindEventHandlers();
init();
