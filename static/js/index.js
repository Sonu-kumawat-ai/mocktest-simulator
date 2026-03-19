(() => {
  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const filePreview = document.getElementById('filePreview');
  const fileName = document.getElementById('fileName');
  const fileSize = document.getElementById('fileSize');
  const fileIcon = document.getElementById('fileIcon');
  const fileRemove = document.getElementById('fileRemove');
  const negativeMarkingEnabled = document.getElementById('negativeMarkingEnabled');
  const negativeMarksInput = document.getElementById('negativeMarks');
  const formatGuideBtn = document.getElementById('formatGuideBtn');
  const formatGuideCard = document.getElementById('formatGuideCard');
  const resetBtn = document.getElementById('resetBtn');
  const startBtn = document.getElementById('startBtn');
  const shuffleQuestions = document.getElementById('shuffleQuestions');
  const totalTimeInput = document.getElementById('totalTime');
  const sectionalTimeInput = document.getElementById('sectionalTime');
  const marksPerQuestionInput = document.getElementById('marksPerQuestion');
  const errorMsg = document.getElementById('errorMsg');
  const errorBanner = document.getElementById('errorBanner');
  const loadingText = document.getElementById('loadingText');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const toast = document.getElementById('toast');

  if (!fileInput || !dropZone || !filePreview || !startBtn) {
    return;
  }

  let selectedFile = null;

  negativeMarkingEnabled.addEventListener('change', () => {
    if (!negativeMarkingEnabled.checked && parseFloat(negativeMarksInput.value) < 0) {
      negativeMarksInput.value = '0';
    }
  });

  formatGuideBtn.addEventListener('click', () => {
    const willHide = !formatGuideCard.classList.contains('is-hidden');
    formatGuideCard.classList.toggle('is-hidden', willHide);
    formatGuideBtn.textContent = willHide ? 'Show Recommended Format' : 'Hide Recommended Format';
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) {
      handleFile(fileInput.files[0]);
    }
  });

  fileRemove.addEventListener('click', removeFile);

  resetBtn.addEventListener('click', () => {
    window.location = '/';
  });

  startBtn.addEventListener('click', startTest);

  function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'doc', 'docx', 'txt'].includes(ext)) {
      showToast('File type not supported. Use PDF, DOC, DOCX, or TXT.', 'error');
      return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatSize(file.size);
    const icons = { pdf: '📕', doc: '📘', docx: '📘', txt: '📄' };
    fileIcon.textContent = icons[ext] || '📄';
    filePreview.classList.add('show');
    hideError();
  }

  function removeFile() {
    selectedFile = null;
    fileInput.value = '';
    filePreview.classList.remove('show');
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function startTest() {
    if (!selectedFile) {
      showError('Please select a file to upload.');
      return;
    }

    const totalTime = parseInt(totalTimeInput.value, 10) || 60;
    const sectionalTime = parseInt(sectionalTimeInput.value, 10) || 0;
    const marksPerQuestion = parseFloat(marksPerQuestionInput.value) || 1;
    const isNegativeEnabled = negativeMarkingEnabled.checked;
    const negativeMarks = parseFloat(negativeMarksInput.value) || 0;
    const shouldShuffleQuestions = shuffleQuestions.checked;

    if (totalTime < 1) {
      showError('Total time must be at least 1 minute.');
      return;
    }
    if (marksPerQuestion <= 0) {
      showError('Marks per question must be greater than 0.');
      return;
    }
    if (isNegativeEnabled && negativeMarks < 0) {
      showError('Negative marking cannot be negative.');
      return;
    }

    showLoading('Processing your file...');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('total_time', totalTime);
    formData.append('sectional_time', sectionalTime);
    formData.append('marks_per_question', marksPerQuestion);
    formData.append('negative_marking_enabled', isNegativeEnabled ? 'true' : 'false');
    formData.append('negative_marks', isNegativeEnabled ? negativeMarks : 0);
    formData.append('shuffle_questions', shouldShuffleQuestions ? 'true' : 'false');

    try {
      const res = await fetch('/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok || data.error) {
        hideLoading();
        showError(data.error || 'Upload failed. Please try again.');
        return;
      }

      localStorage.setItem('mocktest_config', JSON.stringify({
        test_id: data.test_id,
        total_questions: data.total_questions,
        total_time: data.total_time,
        filename: data.filename,
        timestamp: Date.now()
      }));

      updateLoading('Preparing test environment...');
      setTimeout(() => {
        window.location.href = '/test';
      }, 600);
    } catch (err) {
      hideLoading();
      showError('Network error. Please check your connection and try again.');
    }
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorBanner.classList.add('show');
    errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    errorBanner.classList.remove('show');
  }

  function showLoading(msg) {
    loadingText.textContent = msg;
    loadingOverlay.style.display = 'flex';
  }

  function updateLoading(msg) {
    loadingText.textContent = msg;
  }

  function hideLoading() {
    loadingOverlay.style.display = 'none';
  }

  function showToast(msg, type = '') {
    toast.textContent = msg;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => toast.classList.remove('show'), 3000);
  }
})();
