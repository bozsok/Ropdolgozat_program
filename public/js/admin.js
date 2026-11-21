/**
 * admin.js - Tanári 1. Monitor kliensoldali logika (Zero-Build Vanilla ES6, 100% Offline)
 */

(function () {
  'use strict';

  // Állapot
  let socket = null;
  let currentSessionId = null;
  let activeSessionsList = [];
  let subjectsList = [];
  let quizzesList = [];
  let currentTab = 'tab-live';

  // DOM Elemek
  const loginModal = document.getElementById('login-modal');
  const inputPin = document.getElementById('input-pin');
  const btnLoginSubmit = document.getElementById('btn-login-submit');
  const btnLogout = document.getElementById('btn-logout');
  const adminLogoLink = document.getElementById('admin-logo-link');
  const headerMetaBox = document.getElementById('header-meta-box');
  const badgeNavBar = document.getElementById('badge-nav-bar');
  const adminMainContainer = document.getElementById('admin-main-container');

  const liveBadgesList = document.getElementById('live-badges-list');
  const navTabBtns = document.querySelectorAll('.nav-tab-btn');
  const tabContents = document.querySelectorAll('.admin-tab-content');
  const tabBtnLive = document.getElementById('tab-btn-live');

  // Mátrix elemek
  const noActiveSessionBox = document.getElementById('no-active-session-box');
  const activeSessionPanel = document.getElementById('active-session-panel');
  const sessionBadgeChannel = document.getElementById('session-badge-channel');
  const liveSessionTitle = document.getElementById('live-session-title');
  const liveSessionInfo = document.getElementById('live-session-info');
  const btnToggleKpi = document.getElementById('btn-toggle-kpi');
  const adminKpiGrid = document.getElementById('admin-kpi-grid');
  let isKpiVisible = localStorage.getItem('ropdolgozat_kpi_visible') === 'true';

  function applyKpiVisibility() {
    if (!adminKpiGrid) return;
    if (isKpiVisible) {
      adminKpiGrid.classList.add('is-visible');
      if (btnToggleKpi) {
        btnToggleKpi.classList.add('active');
        btnToggleKpi.title = 'KPI mutatók elrejtése';
      }
    } else {
      adminKpiGrid.classList.remove('is-visible');
      if (btnToggleKpi) {
        btnToggleKpi.classList.remove('active');
        btnToggleKpi.title = 'KPI mutatók megjelenítése';
      }
    }
  }

  if (btnToggleKpi) {
    btnToggleKpi.addEventListener('click', () => {
      isKpiVisible = !isKpiVisible;
      localStorage.setItem('ropdolgozat_kpi_visible', String(isKpiVisible));
      applyKpiVisibility();
    });
  }

  const btnFinishSession = document.getElementById('btn-finish-session');
  const btnAdminStartRace = document.getElementById('btn-admin-start-race');
  const badgeSessionFinished = document.getElementById('badge-session-finished');
  const matrixTable = document.getElementById('matrix-table');
  const matrixHeadRow = document.getElementById('matrix-head-row');
  const matrixBody = document.getElementById('matrix-body');

  const btnExportExcel = document.getElementById('btn-export-excel');
  const btnExportHtml = document.getElementById('btn-export-html');
  const btnExportZip = document.getElementById('btn-export-zip');
  const btnExportPrint = document.getElementById('btn-export-print');

  // Reports (Archívum) elemek
  const reportsCardsContainer = document.getElementById('reports-cards-container');
  const inputSearchReports = document.getElementById('input-search-reports');
  const selectFilterReportsClass = document.getElementById('select-filter-reports-class');
  const btnRefreshReports = document.getElementById('btn-refresh-reports');
  let allReports = [];

  function formatSessionMode(mode) {
    const modeMap = {
      'STUDENT_PACED': 'Diák-tempó',
      'SPACE_RACE': 'Űrhajós csapatverseny',
      'TEACHER_PACED': 'Tanári léptetés'
    };
    return modeMap[mode] || mode || 'Diák-tempó';
  }

  // Start modal
  const modalStartSession = document.getElementById('modal-start-session');
  const btnOpenStartModal = document.getElementById('btn-open-start-modal');
  const btnOpenStartModalAlt = document.getElementById('btn-open-start-modal-alt');
  const startSubjectId = document.getElementById('start-subject-id');
  const startGradeLevel = document.getElementById('start-grade-level');
  const startQuizId = document.getElementById('start-quiz-id');
  const startMode = document.getElementById('start-mode');
  const startTimeLimit = document.getElementById('start-time-limit');
  const startShuffleQuestions = document.getElementById('start-shuffle-questions');
  const startShuffleOptions = document.getElementById('start-shuffle-options');
  const formStartSession = document.getElementById('form-start-session');

  // Tesztszerkesztő elemek
  const quizzesListContainer = document.getElementById('quizzes-list-container');
  const btnNewQuiz = document.getElementById('btn-new-quiz');
  const btnMergeQuizzes = document.getElementById('btn-merge-quizzes');
  const modalMergeQuizzes = document.getElementById('modal-merge-quizzes');
  const mergeQuizSource1 = document.getElementById('merge-quiz-source-1');
  const mergeQuizSource2 = document.getElementById('merge-quiz-source-2');
  const mergeQuizNewTitle = document.getElementById('merge-quiz-new-title');
  const mergeQuizTargetFolder = document.getElementById('merge-quiz-target-folder');
  const mergeQuizTimeLimit = document.getElementById('merge-quiz-time-limit');
  const mergeQuizSummaryBox = document.getElementById('merge-quiz-summary-box');
  const btnSubmitMergeQuizzes = document.getElementById('btn-submit-merge-quizzes');
  const btnNewFolder = document.getElementById('btn-new-folder');
  const btnImportQuizPdf = document.getElementById('btn-import-quiz-pdf');
  const modalImportQuizPdf = document.getElementById('modal-import-quiz-pdf');
  const importPdfSubjectId = document.getElementById('import-pdf-subject-id');
  const importPdfGrade = document.getElementById('import-pdf-grade');
  const quizPdfDropzone = document.getElementById('quiz-pdf-dropzone');
  const inputQuizPdfFile = document.getElementById('input-quiz-pdf-file');
  const quizPdfSelectedFileInfo = document.getElementById('quiz-pdf-selected-file-info');
  const quizPdfSelectedFileName = document.getElementById('quiz-pdf-selected-file-name');
  const quizPdfImportStatus = document.getElementById('quiz-pdf-import-status');
  const btnSubmitImportQuizPdf = document.getElementById('btn-submit-import-quiz-pdf');
  let selectedQuizPdfFile = null;
  const quizBreadcrumbsBar = document.getElementById('quiz-breadcrumbs-bar');
  const quizBreadcrumbsList = document.getElementById('quiz-breadcrumbs-list');
  const quizEditorCard = document.getElementById('quiz-editor-card');
  const btnCloseEditor = document.getElementById('btn-close-editor');
  const editQuizId = document.getElementById('edit-quiz-id');
  const editQuizFolderId = document.getElementById('edit-quiz-folder-id');
  const editSubjectId = document.getElementById('edit-subject-id');
  const editGradeLevel = document.getElementById('edit-grade-level');
  const editTimeLimit = document.getElementById('edit-time-limit');
  const editQuizTitle = document.getElementById('edit-quiz-title');
  const editorQuestionsList = document.getElementById('editor-questions-list');
  const btnAddQuestion = document.getElementById('btn-add-question');
  const btnSaveQuiz = document.getElementById('btn-save-quiz');

  // Mapparendszer állapotváltozói
  let currentFolderId = null;
  let currentBreadcrumbs = [];
  let pendingDeleteFolderId = null;

  // Névsor elemek
  const adminRosterClassList = document.getElementById('admin-roster-class-list');
  const rosterClassCountBadge = document.getElementById('roster-class-count-badge');
  const rosterStudentCountPill = document.getElementById('roster-student-count-pill');
  const btnToggleRosterMode = document.getElementById('btn-toggle-roster-mode');
  const btnToggleRosterModeText = document.getElementById('btn-toggle-roster-mode-text');
  const rosterColumnsView = document.getElementById('roster-columns-view');
  const rosterRawEditView = document.getElementById('roster-raw-edit-view');
  const rosterEditorBox = document.getElementById('roster-editor-box');
  const rosterClassTitle = document.getElementById('roster-class-title');
  const rosterNamesTextarea = document.getElementById('roster-names-textarea');
  const btnSaveRoster = document.getElementById('btn-save-roster');
  const btnNewClass = document.getElementById('btn-new-class');
  const btnDeleteClass = document.getElementById('btn-delete-class');
  let selectedRosterClass = null;
  let isRosterRawEditMode = false;

  // Modális jóváhagyások állapotváltozói (Calm Learner UX)
  let pendingDeleteParticipantId = null;
  let pendingSeatChangeParticipantId = null;
  let pendingDeleteSessionId = null;
  let pendingDeleteQuizId = null;
  let pendingMoveQuizId = null;

  /**
   * Rendszerértesítés megjelenítése elegáns modálban (böngészős alert helyett)
   */
  function showAdminAlert(title, message) {
    const titleEl = document.getElementById('admin-alert-title');
    const msgEl = document.getElementById('admin-alert-message');
    if (titleEl) titleEl.textContent = title || 'Értesítés';
    if (msgEl) msgEl.textContent = message || '';
    openModal('modal-admin-alert');
  }

  function openLoginModal() {
    openModal('login-modal');
    if (adminMainContainer) adminMainContainer.style.display = 'none';
    if (badgeNavBar) badgeNavBar.style.display = 'none';
    if (headerMetaBox) headerMetaBox.style.display = 'none';
    if (inputPin) {
      inputPin.value = '';
      setTimeout(() => inputPin.focus(), 100);
    }
  }

  function closeLoginModal() {
    closeModal('login-modal');
    if (adminMainContainer) adminMainContainer.style.display = 'block';
    if (badgeNavBar) badgeNavBar.style.display = 'flex';
    if (headerMetaBox) headerMetaBox.style.display = 'flex';
  }

  /**
   * Alkalmazás indítása
   */
  async function init() {
    // Hitelesítés ellenőrzése
    const isAuth = await checkAuth();
    if (!isAuth) {
      openLoginModal();
      return;
    }

    closeLoginModal();
    applyKpiVisibility();
    setupSocket();
    initSettingsHandlers();
    await loadInitialData();
    loadSettings();
  }

  /**
   * Hitelesítés ellenőrzése
   */
  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/check');
      const data = await res.json();
      return !!data.isAuthenticated;
    } catch {
      return false;
    }
  }

  // Bejelentkezés
  btnLoginSubmit.addEventListener('click', async () => {
    const pin = inputPin.value.trim();
    if (!pin) return;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        closeLoginModal();
        setupSocket();
        await loadInitialData();
      } else {
        showAdminAlert('🔐 Helytelen tanári jelszó', data.message || 'A megadott tanári jelszó érvénytelen!');
        inputPin.value = '';
        inputPin.focus();
      }
    } catch (err) {
      showAdminAlert('⚠️ Hálózati hiba', 'Nem sikerült kapcsolatot létesíteni a szerverrel a bejelentkezés során.');
    }
  });

  inputPin.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnLoginSubmit.click();
    }
  });

  // Kijelentkezés
  btnLogout.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    window.location.href = '/';
  });

  // Logóra kattintás: mindig a 'Jelenleg nincs folyamatban lévő dolgozat' kezdőképernyőt jeleníti meg
  if (adminLogoLink) {
    adminLogoLink.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('tab-live');
      showNoSessionView();
      renderBadges();
    });
  }

  /**
   * Kezdeti adatok betöltése
   */
  async function loadInitialData() {
    await loadSubjects();
    await loadActiveSessions();
    await loadQuizzes();
    await loadRosterClasses();

    // Ha van éppen aktív dolgozat, automatikusan megnyitjuk az elsőt
    if (activeSessionsList.length > 0) {
      switchSession(activeSessionsList[0].id);
    } else {
      showNoSessionView();
    }
  }

  /**
   * Socket.io inicializálása
   */
  function setupSocket() {
    if (socket || typeof io === 'undefined') return;
    socket = io();

    // Újracsatlakozáskor automatikus állapot-újraszinkronizálás (Report 14 / 20.)
    socket.on('connect', () => {
      loadActiveSessions();
      if (currentSessionId) {
        socket.emit('join:session', { sessionId: currentSessionId, role: 'teacher' });
        switchSession(currentSessionId);
      }
    });

    socket.on('badges:updated', (badges) => {
      activeSessionsList = badges;
      renderBadges();
    });

    socket.on('matrix:updated', (data) => {
      if (currentSessionId && String(data.session.id) === String(currentSessionId)) {
        renderMatrix(data);
      }
    });

    socket.on('participant:focus_lost', (data) => {
      // Csak az aktuálisan kezelt dolgozat fókuszvesztéseit jelezzük ki (Report 14 / 21.)
      if (!data || !currentSessionId || String(data.sessionId) === String(currentSessionId)) {
        showToast(`⚠️ Fókuszvesztés: ${escapeHtml(data.studentName)} (${data.focusLostCount}x)`, 'danger');
      }
    });

    socket.on('session:finished', (data) => {
      if (currentSessionId && (!data || !data.sessionId || String(data.sessionId) === String(currentSessionId))) {
        showToast('A dolgozat befejeződött!', 'info');
        switchSession(currentSessionId);
      }
    });

    socket.on('race:started', () => {
      if (btnAdminStartRace) btnAdminStartRace.style.display = 'none';
    });
  }

  /**
   * Felső Live Badges Sáv (Single Source of Truth)
   */
  async function loadActiveSessions() {
    try {
      const res = await fetch('/api/sessions/active');
      activeSessionsList = await res.json();
      renderBadges();
    } catch (err) {
      console.error('Hiba az aktív munkamenetek lekérésekor:', err);
    }
  }

  function getSubjectTheme(subjectName) {
    const norm = String(subjectName || '').toLowerCase().trim();
    if (norm.includes('digit') || norm.includes('info')) {
      return { cssClass: 'badge-subject-digital', color: '#38bdf8' };
    }
    if (norm.includes('tech')) {
      return { cssClass: 'badge-subject-tech', color: '#fbbf24' };
    }
    if (norm.includes('fejl') || norm.includes('fogl')) {
      return { cssClass: 'badge-subject-dev', color: '#c084fc' };
    }
    return { cssClass: 'badge-subject-other', color: '#2dd4bf' };
  }

  function renderBadges() {
    liveBadgesList.innerHTML = '';
    if (activeSessionsList.length === 0) {
      liveBadgesList.innerHTML = '<span style="color: #64748b; font-size: 0.85rem; padding: 4px;">Nincs futó dolgozat</span>';
      return;
    }

    activeSessionsList.forEach(session => {
      const theme = getSubjectTheme(session.subject_name);
      const isCurrent = String(session.id) === String(currentSessionId);
      const badge = document.createElement('div');
      badge.className = `live-badge ${theme.cssClass} ${isCurrent ? 'badge-active' : ''}`;
      badge.title = `${session.subject_name} ${session.grade_level}. évfolyam – „${session.quiz_title}” (${session.participant_count} diák)`;
      badge.innerHTML = `
        <span class="badge-subject-dot" style="background-color: ${theme.color};"></span>
        <span class="badge-text-compact"><strong>${escapeHtml(session.grade_level)}. évf.</strong> · ${escapeHtml(session.quiz_title)}</span>
        <span class="badge-count-pill">${session.participant_count}</span>
      `;

      badge.addEventListener('click', () => {
        switchSession(session.id);
      });

      liveBadgesList.appendChild(badge);
    });
  }

  /**
   * Váltás egy adott munkamenet élő mátrixára
   */
  async function switchSession(sessionId) {
    // Ha volt előző dolgozat, kilépünk annak a szobájából (Report 14 / 20.)
    if (currentSessionId && String(currentSessionId) !== String(sessionId) && socket) {
      socket.emit('leave:session', { sessionId: currentSessionId });
    }
    currentSessionId = sessionId;
    renderBadges();

    if (socket) {
      socket.emit('join:session', { sessionId, role: 'teacher' });
    }

    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/matrix`);
      const data = await res.json();
      if (!res.ok) {
        showNoSessionView();
        return;
      }

      noActiveSessionBox.style.display = 'none';
      activeSessionPanel.style.display = 'block';

      // Fejléc és státusz frissítése
      const isFinished = data.session.status === 'FINISHED';
      const classMeta = data.session.class_name ? ` | Osztály: ${escapeHtml(data.session.class_name)}` : '';
      if (isFinished) {
        if (sessionBadgeChannel) {
          sessionBadgeChannel.className = 'admin-session-finished-pill';
          sessionBadgeChannel.innerHTML = '<span class="material-symbols-outlined" style="font-size: 14px;">lock</span><span>Lezárva</span>';
        }
        liveSessionTitle.textContent = data.session.quiz_title;
        const endedFormatted = data.session.ended_at ? data.session.ended_at.replace('T', ' ').substring(0, 16) : '–';
        liveSessionInfo.textContent = `Tantárgy: ${data.session.subject_name} | Évfolyam: ${data.session.grade_level}. évfolyam${classMeta} | Mód: ${formatSessionMode(data.session.mode)} | Befejezve: ${endedFormatted}`;
        if (btnFinishSession) btnFinishSession.style.display = 'none';
        if (btnAdminStartRace) btnAdminStartRace.style.display = 'none';
      } else {
        if (sessionBadgeChannel) {
          sessionBadgeChannel.className = 'admin-session-badge';
          sessionBadgeChannel.innerHTML = '<span class="admin-pulse-dot"></span><span>Kitöltés folyamatban</span>';
        }
        liveSessionTitle.textContent = data.session.quiz_title;
        liveSessionInfo.textContent = `Tantárgy: ${data.session.subject_name} | Évfolyam: ${data.session.grade_level}. évfolyam${classMeta} | Mód: ${formatSessionMode(data.session.mode)}`;
        if (btnFinishSession) btnFinishSession.style.display = 'inline-flex';

        if (btnAdminStartRace) {
          const isSpaceRace = data.session.mode === 'SPACE_RACE';
          const isWaiting = isSpaceRace && (!data.session.current_question_index || data.session.current_question_index === 0);
          btnAdminStartRace.style.display = isWaiting ? 'inline-flex' : 'none';
        }
      }

      // Export linkek beállítása
      if (btnExportExcel) btnExportExcel.href = `/api/admin/export/excel/${sessionId}`;
      if (btnExportHtml) btnExportHtml.href = `/api/admin/export/html/${sessionId}`;
      if (btnExportZip) btnExportZip.href = `/api/admin/export/zip/${sessionId}`;
      if (btnExportPrint) btnExportPrint.href = `/print?sessionId=${sessionId}`;

      const exportCenterExcel = document.getElementById('export-center-excel');
      const exportCenterHtml = document.getElementById('export-center-html');
      const exportCenterZip = document.getElementById('export-center-zip');
      const exportCenterPrint = document.getElementById('export-center-print');
      if (exportCenterExcel) exportCenterExcel.href = `/api/admin/export/excel/${sessionId}`;
      if (exportCenterHtml) exportCenterHtml.href = `/api/admin/export/html/${sessionId}`;
      if (exportCenterZip) exportCenterZip.href = `/api/admin/export/zip/${sessionId}`;
      if (exportCenterPrint) exportCenterPrint.href = `/print?sessionId=${sessionId}`;

      const liveExportExcel = document.getElementById('live-export-excel');
      const liveExportPrint = document.getElementById('live-export-print');
      const liveExportHtml = document.getElementById('live-export-html');
      const liveExportZip = document.getElementById('live-export-zip');
      const liveExportSubtitle = document.getElementById('live-export-modal-subtitle');
      if (liveExportExcel) liveExportExcel.href = `/api/admin/export/excel/${sessionId}`;
      if (liveExportPrint) liveExportPrint.href = `/print?sessionId=${sessionId}`;
      if (liveExportHtml) liveExportHtml.href = `/api/admin/export/html/${sessionId}`;
      if (liveExportZip) liveExportZip.href = `/api/admin/export/zip/${sessionId}`;
      if (liveExportSubtitle && data.session) {
        liveExportSubtitle.textContent = `${data.session.quiz_title} (${data.session.grade_level}. évf.)`;
      }

      renderMatrix(data);

      // Biztosítjuk, hogy a tab-live fül legyen aktív
      switchTab('tab-live');
    } catch (err) {
      console.error('Hiba a mátrix betöltésekor:', err);
    }
  }

  function showNoSessionView() {
    if (currentSessionId && socket) {
      socket.emit('leave:session', { sessionId: currentSessionId });
    }
    currentSessionId = null;
    noActiveSessionBox.style.display = 'flex';
    activeSessionPanel.style.display = 'none';
    if (sessionBadgeChannel) {
      sessionBadgeChannel.className = 'live-badge badge-active';
      sessionBadgeChannel.textContent = '🟢 ÉLŐ';
    }
    if (badgeSessionFinished) {
      badgeSessionFinished.style.display = 'none';
    }
    if (btnFinishSession) {
      btnFinishSession.style.display = 'inline-block';
    }
  }

  /**
   * 4 Kompakt KPI Összegző Kártya Kiszámítása és Megjelenítése
   */
  function renderKpiCards(data) {
    const { questions = [], participants = [], answers = [] } = data;

    const kpiAvgGrade = document.getElementById('kpi-avg-grade');
    const kpiAvgPercent = document.getElementById('kpi-avg-percent');
    const kpiAvgDesc = document.getElementById('kpi-avg-desc');

    const kpiCompletedCount = document.getElementById('kpi-completed-count');
    const kpiCompletedPercent = document.getElementById('kpi-completed-percent');
    const kpiCompletedDesc = document.getElementById('kpi-completed-desc');

    const kpiHardestTitle = document.getElementById('kpi-hardest-title');
    const kpiHardestRate = document.getElementById('kpi-hardest-rate');

    const kpiBestTitle = document.getElementById('kpi-best-title');
    const kpiBestRate = document.getElementById('kpi-best-rate');

    // 1. KÁRTYA: Osztályátlag és százalék
    if (participants.length > 0) {
      let sumGrades = 0;
      let sumPercentages = 0;
      let validCount = 0;

      participants.forEach(p => {
        if (p.grade) {
          sumGrades += Number(p.grade);
          sumPercentages += Number(p.percentage || 0);
          validCount++;
        }
      });

      if (validCount > 0 && answers.length > 0) {
        const avgGrade = (sumGrades / validCount).toFixed(1);
        const avgPct = Math.round(sumPercentages / validCount);

        if (kpiAvgGrade) kpiAvgGrade.textContent = avgGrade;
        if (kpiAvgPercent) kpiAvgPercent.textContent = `${avgPct}%`;

        if (kpiAvgDesc) {
          const numAvg = parseFloat(avgGrade);
          if (numAvg >= 4.5) {
            kpiAvgDesc.textContent = 'Kiemelkedő felkészültség';
          } else if (numAvg >= 3.5) {
            kpiAvgDesc.textContent = 'Stabil, jó felkészültség';
          } else if (numAvg >= 2.5) {
            kpiAvgDesc.textContent = 'Közepes szint, gyakorlást igényel';
          } else {
            kpiAvgDesc.textContent = 'Alapos átismétlés szükséges';
          }
        }
      } else {
        if (kpiAvgGrade) kpiAvgGrade.textContent = '–';
        if (kpiAvgPercent) kpiAvgPercent.textContent = '–%';
        if (kpiAvgDesc) kpiAvgDesc.textContent = 'Még nincs leadott válasz';
      }
    } else {
      if (kpiAvgGrade) kpiAvgGrade.textContent = '–';
      if (kpiAvgPercent) kpiAvgPercent.textContent = '–%';
      if (kpiAvgDesc) kpiAvgDesc.textContent = 'Még nem csatlakozott diák';
    }

    // 2. KÁRTYA: Leadott dolgozatok
    const totalStudents = participants.length;
    const finishedStudents = participants.filter(p => p.is_finished).length;
    const pendingStudents = totalStudents - finishedStudents;
    const finishPercent = totalStudents > 0 ? Math.round((finishedStudents / totalStudents) * 100) : 0;

    if (kpiCompletedCount) kpiCompletedCount.textContent = `${finishedStudents} / ${totalStudents}`;
    if (kpiCompletedPercent) kpiCompletedPercent.textContent = `${finishPercent}%`;

    if (kpiCompletedDesc) {
      if (totalStudents === 0) {
        kpiCompletedDesc.textContent = 'Még nem csatlakozott diák';
      } else if (finishedStudents === totalStudents) {
        kpiCompletedDesc.textContent = 'Minden tanuló leadta';
      } else if (pendingStudents === 1) {
        kpiCompletedDesc.textContent = '1 tanuló még válaszol';
      } else if (finishedStudents === 0) {
        kpiCompletedDesc.textContent = `${pendingStudents} tanuló még dolgozik`;
      } else {
        kpiCompletedDesc.textContent = `${pendingStudents} tanuló még válaszol`;
      }
    }

    // 3. és 4. KÁRTYA: Legnehezebb és legjobb feladat számítása
    if (questions.length > 0 && answers.length > 0) {
      const qStats = questions.map((q, idx) => {
        const qAnswers = answers.filter(a => a.question_id === q.id);
        if (qAnswers.length === 0) return null;

        const maxPossiblePoints = q.points * qAnswers.length;
        const totalEarnedPoints = qAnswers.reduce((sum, a) => sum + (Number(a.points_earned) || 0), 0);
        const rate = maxPossiblePoints > 0 ? Math.round((totalEarnedPoints / maxPossiblePoints) * 100) : 0;

        let title = q.question_text || `K${idx + 1}`;
        if (title.length > 18) {
          title = title.substring(0, 16) + '…';
        }

        return {
          idx: idx + 1,
          title: `${idx + 1}. ${title}`,
          rate,
          answersCount: qAnswers.length
        };
      }).filter(Boolean);

      if (qStats.length > 0) {
        const sorted = [...qStats].sort((a, b) => a.rate - b.rate);
        const hardest = sorted[0];
        const best = sorted[sorted.length - 1];

        if (kpiHardestTitle) kpiHardestTitle.textContent = hardest.title;
        if (kpiHardestRate) kpiHardestRate.textContent = `${hardest.rate}%`;

        if (kpiBestTitle) kpiBestTitle.textContent = best.title;
        if (kpiBestRate) kpiBestRate.textContent = `${best.rate}%`;
      } else {
        if (kpiHardestTitle) kpiHardestTitle.textContent = '–';
        if (kpiHardestRate) kpiHardestRate.textContent = '–';
        if (kpiBestTitle) kpiBestTitle.textContent = '–';
        if (kpiBestRate) kpiBestRate.textContent = '–';
      }
    } else {
      if (kpiHardestTitle) kpiHardestTitle.textContent = '–';
      if (kpiHardestRate) kpiHardestRate.textContent = '–';
      if (kpiBestTitle) kpiBestTitle.textContent = '–';
      if (kpiBestRate) kpiBestRate.textContent = '–';
    }
  }

  /**
   * Tanuló monogramjának képzése az avatárhoz
   */
  function getStudentInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  let lastMatrixData = null;
  let isMatrixAnonymous = true;

  /**
   * Élő Mátrix Táblázat Kirajzolása
   */
  function renderMatrix(data) {
    lastMatrixData = data;
    const { questions, participants, answers, session } = data;

    // KPI összegző kártyák azonnali kiszámítása és frissítése
    renderKpiCards(data);

    // Fejléc sor összeállítása (Calm Learner Mátrix)
    const qColsHtml = questions.map((q, idx) => `
      <th class="matrix-q-col col-question" data-q-idx="${idx}" title="${escapeHtml(q.question_text || `${idx + 1}. kérdés`)}">${idx + 1}</th>
    `).join('');

    matrixHeadRow.innerHTML = `
      <th class="col-num">#</th>
      <th class="col-name">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span>Tanuló neve</span>
          <label class="matrix-anon-wrap" title="Anonim mód: nevek elrejtése / felfedése" onclick="event.stopPropagation();">
            <span class="material-symbols-outlined">${isMatrixAnonymous ? 'visibility_off' : 'visibility'}</span>
            <span class="matrix-anon-label">Anonim</span>
            <input type="checkbox" id="matrix-anon-checkbox" class="matrix-anon-checkbox" ${isMatrixAnonymous ? 'checked' : ''}>
            <span class="matrix-anon-slider"></span>
          </label>
        </div>
      </th>
      <th class="col-pc">Gép</th>
      ${qColsHtml}
      <th class="col-points">Pont</th>
      <th class="col-pct">%</th>
      <th class="col-grade">Jegy</th>
      <th class="col-focus">Fókusz</th>
      <th class="col-actions">Műveletek</th>
    `;

    const anonCheckbox = matrixHeadRow.querySelector('#matrix-anon-checkbox');
    if (anonCheckbox) {
      anonCheckbox.onchange = (e) => {
        isMatrixAnonymous = e.target.checked;
        if (lastMatrixData) renderMatrix(lastMatrixData);
      };
    }

    // Eseménydelegáció a fejléc sorra (Best Practice - soha nem vész el)
    matrixHeadRow.onclick = (e) => {
      const qCol = e.target.closest('.matrix-q-col');
      if (!qCol) return;
      const qIdx = parseInt(qCol.dataset.qIdx, 10);
      if (!isNaN(qIdx) && questions[qIdx]) {
        openQuestionDetailModal(questions[qIdx], qIdx + 1, data);
      }
    };

    // Válaszok indexelése gyors eléréshez: `participant_id:question_id` -> answer
    const answerMap = new Map();
    answers.forEach(a => {
      answerMap.set(`${a.participant_id}:${a.question_id}`, a);
    });

    // Sorok renderelése
    matrixBody.innerHTML = '';
    if (participants.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `<td colspan="${questions.length + 8}" style="text-align: center; color: var(--text-muted); padding: 36px 20px; font-weight: 600;">Még nem csatlakozott diák a dolgozathoz.</td>`;
      matrixBody.appendChild(emptyRow);
      return;
    }

    participants.forEach((p, pIdx) => {
      const tr = document.createElement('tr');

      // 0. Sorszám
      const tdNum = document.createElement('td');
      tdNum.className = 'col-num';
      tdNum.style.fontWeight = '700';
      tdNum.style.color = 'var(--text-muted, #5a4138)';
      tdNum.textContent = String(pIdx + 1);
      tr.appendChild(tdNum);

      // 1. Név és befejezett állapot
      const tdName = document.createElement('td');
      tdName.className = 'col-name';
      const statusHtml = p.is_finished
        ? `<span class="admin-student-status status-finished"><span class="material-symbols-outlined" style="font-size: 13px;">check_circle</span> Kész</span>`
        : `<span class="admin-student-status status-working"><span class="material-symbols-outlined" style="font-size: 13px;">edit_note</span> Folyamatban...</span>`;

      const displayedName = isMatrixAnonymous
        ? (p.pc_number ? `PC-${p.pc_number} tanulója` : `${pIdx + 1}. diák`)
        : escapeHtml(p.student_name);

      tdName.innerHTML = `
        <div class="admin-student-cell">
          <div class="admin-student-info">
            <span class="admin-student-name" title="${isMatrixAnonymous ? 'Anonim mód aktív (kattints a fenti csúszkára a nevek felfedéséhez)' : escapeHtml(p.student_name)}">${displayedName}</span>
            ${statusHtml}
          </div>
        </div>
      `;
      tr.appendChild(tdName);

      // 2. Gépszám
      const tdPc = document.createElement('td');
      tdPc.className = 'col-pc';
      tdPc.innerHTML = p.pc_number
        ? `<span style="font-weight: 700; color: var(--text-muted); font-size: 0.85rem;">PC-${p.pc_number}</span>`
        : '<span style="color: #94a3b8;">–</span>';
      tr.appendChild(tdPc);

      // 3. Kérdés cellák (1-kattintásos felülbírálás kizárólag aktív dolgozatban!)
      const isSessionActive = session && session.status === 'ACTIVE';

      questions.forEach(q => {
        const tdQ = document.createElement('td');
        tdQ.className = 'col-question';
        const ans = answerMap.get(`${p.id}:${q.id}`);

        if (!ans) {
          tdQ.innerHTML = `<span class="matrix-cell cell-empty">–</span>`;
        } else {
          let cellClass = 'cell-wrong';
          let icon = 'close';
          let text = '0p';

          if (ans.eval_status === 'CORRECT') {
            cellClass = 'cell-correct';
            icon = 'check';
            text = `${ans.points_earned}p`;
          } else if (ans.eval_status === 'PARTIAL') {
            cellClass = 'cell-partial';
            icon = 'remove';
            text = `${ans.points_earned}p`;
          }

          const cellSpan = document.createElement('span');
          cellSpan.innerHTML = `<span class="material-symbols-outlined" style="font-size: 14px; margin-right: 2px;">${icon}</span>${text}`;

          if (isSessionActive) {
            cellSpan.className = `matrix-cell ${cellClass}`;
            cellSpan.title = `Diák válasza: ${ans.submitted_answer} (Kattints a felülbíráláshoz)`;

            cellSpan.addEventListener('click', async () => {
              let nextStatus = 'CORRECT';
              if (ans.eval_status === 'CORRECT') nextStatus = 'PARTIAL';
              else if (ans.eval_status === 'PARTIAL') nextStatus = 'WRONG';
              else nextStatus = 'CORRECT';

              await overrideCell(ans.id, nextStatus);
            });
          } else {
            cellSpan.className = `matrix-cell ${cellClass} cell-locked`;
            cellSpan.title = `Diák válasza: ${ans.submitted_answer} (Lezárt dolgozat – a pontszám végleges)`;
          }

          tdQ.appendChild(cellSpan);
        }

        tr.appendChild(tdQ);
      });

      // 4. Összpontszám
      const tdPoints = document.createElement('td');
      tdPoints.className = 'col-points';
      tdPoints.innerHTML = `<strong style="font-size: 0.95rem; color: var(--text-main);">${p.total_points}</strong> <span style="font-size: 0.78rem; color: var(--text-muted);">/ ${data.totalMaxPoints}</span>`;
      tr.appendChild(tdPoints);

      // 5. Százalék
      const tdPct = document.createElement('td');
      tdPct.className = 'col-pct';
      let pctColor = 'var(--text-main)';
      if (p.percentage >= 85) pctColor = 'var(--success, #16a34a)';
      else if (p.percentage < 50) pctColor = 'var(--danger, #dc2626)';
      tdPct.innerHTML = `<strong style="color: ${pctColor}; font-size: 0.92rem;">${p.percentage}%</strong>`;
      tr.appendChild(tdPct);

      // 6. KRÉTA érdemjegy (MTA 12. kiadása szerinti kisbetűs alakok)
      const tdGrade = document.createElement('td');
      tdGrade.className = 'col-grade';
      const gradeNum = parseInt(p.grade, 10) || 1;
      const gradeLabels = { 5: '5 (jeles)', 4: '4 (jó)', 3: '3 (közepes)', 2: '2 (elégséges)', 1: '1 (elégtelen)' };
      const gradeLabel = gradeLabels[gradeNum] || `${gradeNum}`;
      tdGrade.innerHTML = `<span class="admin-grade-badge grade-${gradeNum}">${gradeLabel}</span>`;
      tr.appendChild(tdGrade);

      // 7. Fókuszvesztések
      const tdFocus = document.createElement('td');
      tdFocus.className = 'col-focus';
      if (p.focus_lost_count > 0) {
        tdFocus.innerHTML = `<span class="focus-alert">⚠️ ${p.focus_lost_count}x</span>`;
      } else {
        tdFocus.innerHTML = `<span style="color: #94a3b8; font-size: 0.85rem;">0</span>`;
      }
      tr.appendChild(tdFocus);

      // 8. Diák műveletek: Gép váltása és Név törlése (Calm Learner Stílus & Report 12 / 2.2)
      const tdAction = document.createElement('td');
      tdAction.className = 'col-actions';
      tdAction.style.whiteSpace = 'nowrap';

      const actionWrap = document.createElement('div');
      actionWrap.style.display = 'inline-flex';
      actionWrap.style.gap = '6px';
      actionWrap.style.alignItems = 'center';
      actionWrap.style.justifyContent = 'center';

      if (isSessionActive) {
        // Gép váltása gomb (tantermi munkaállomás átvitele adatvesztés nélkül)
        const btnSeatChange = document.createElement('button');
        btnSeatChange.className = 'admin-btn-seat-change';
        btnSeatChange.type = 'button';
        btnSeatChange.innerHTML = '<span class="material-symbols-outlined">swap_horiz</span> <span>Gép váltása</span>';

        if (p.is_finished) {
          btnSeatChange.disabled = true;
          btnSeatChange.title = 'A tanuló már befejezte a dolgozatot, a gépváltás nem szükséges';
        } else {
          btnSeatChange.disabled = false;
          btnSeatChange.title = 'Gép átvitele fagyás esetén (a tanuló eddigi válaszai megmaradnak)';
          btnSeatChange.addEventListener('click', () => {
            pendingSeatChangeParticipantId = p.id;
            const targetEl = document.getElementById('seat-change-student-name');
            if (targetEl) targetEl.textContent = p.student_name;
            openModal('modal-confirm-seat-change');
          });
        }
        actionWrap.appendChild(btnSeatChange);

        // Név törlése gomb (téves névválasztás korrekciójára)
        const btnReset = document.createElement('button');
        btnReset.className = 'admin-btn-delete-name';
        btnReset.type = 'button';
        btnReset.innerHTML = '<span class="material-symbols-outlined">delete</span> <span>Név törlése</span>';
        btnReset.title = 'Téves névválasztás törlése a dolgozatból (ha a tanuló téves névre kattintott bejelentkezéskor)';
        btnReset.addEventListener('click', () => {
          pendingDeleteParticipantId = p.id;
          const targetEl = document.getElementById('delete-name-student-name');
          if (targetEl) targetEl.textContent = p.student_name;
          openModal('modal-confirm-delete-name');
        });
        actionWrap.appendChild(btnReset);
      } else {
        const spanFinished = document.createElement('span');
        spanFinished.style.color = '#94a3b8';
        spanFinished.style.fontSize = '0.78rem';
        spanFinished.style.fontWeight = '600';
        spanFinished.textContent = 'Dolgozat lezárva';
        actionWrap.appendChild(spanFinished);
      }

      tdAction.appendChild(actionWrap);
      tr.appendChild(tdAction);

      matrixBody.appendChild(tr);
    });

    // Értesítési központ időbélyeg frissítése
    const notifyTime = document.getElementById('notify-server-time');
    if (notifyTime) {
      notifyTime.textContent = 'Rendszeridő: ' + new Date().toLocaleTimeString('hu-HU');
    }
  }

  /**
   * Kérdés és Tanulói Válaszok Részletező Modál Megnyitása
   */
  function openQuestionDetailModal(q, qNum, matrixData) {
    if (!q) return;

    // 1. Cím és típus / pontszám
    const titleEl = document.getElementById('qd-modal-title');
    const subtitleEl = document.getElementById('qd-modal-subtitle');
    if (titleEl) titleEl.textContent = `❓ ${qNum}. kérdés részletei`;

    const typeNames = {
      'ABCD': 'Feleletválasztó (ABCD)',
      'TF': 'Igaz / Hamis (TF)',
      'SHORT': 'Rövid szöveges válasz'
    };
    const typeLabel = typeNames[q.question_type] || q.question_type;
    if (subtitleEl) subtitleEl.textContent = `${typeLabel} • ${q.points} pont`;

    // 2. Kérdés szövege és formázása
    const textEl = document.getElementById('qd-modal-text');
    if (textEl) textEl.innerHTML = formatCode(q.question_text || '');

    // 3. Kép megjelenítése (ha van)
    const imageBox = document.getElementById('qd-modal-image-box');
    const imageEl = document.getElementById('qd-modal-image');
    if (imageBox && imageEl) {
      if (q.image_path) {
        imageEl.src = q.image_path;
        imageBox.style.display = 'block';
      } else {
        imageBox.style.display = 'none';
        imageEl.src = '';
      }
    }

    // 4. Helyes válaszok és opciók felépítése
    const optionsWrap = document.getElementById('qd-modal-options-wrap');
    if (optionsWrap) {
      optionsWrap.innerHTML = '';

      let acceptedAnswers = [];
      try {
        const parsed = JSON.parse(q.correct_answer);
        if (Array.isArray(parsed)) {
          acceptedAnswers = parsed.map(a => String(a).trim());
        } else {
          acceptedAnswers = [String(q.correct_answer).trim()];
        }
      } catch {
        if (q.question_type === 'SHORT' && q.correct_answer && q.correct_answer.includes('|')) {
          acceptedAnswers = q.correct_answer.split('|').map(s => s.trim());
        } else if (q.question_type === 'SHORT' && q.correct_answer && q.correct_answer.includes(';')) {
          acceptedAnswers = q.correct_answer.split(';').map(s => s.trim());
        } else {
          acceptedAnswers = [String(q.correct_answer || '').trim()];
        }
      }

      if (q.question_type === 'ABCD') {
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        let opts = [];
        if (Array.isArray(q.options) && q.options.length > 0) {
          opts = q.options;
        } else if (typeof q.options_json === 'string') {
          try {
            opts = JSON.parse(q.options_json || '[]');
          } catch {
            opts = [];
          }
        }

        opts.forEach((optText, optIdx) => {
          const letter = letters[optIdx] || String(optIdx + 1);
          const optRow = document.createElement('div');

          const isCorrectOpt = acceptedAnswers.some(ans =>
            ans.toLowerCase() === letter.toLowerCase() ||
            ans.toLowerCase() === String(optText).trim().toLowerCase()
          );

          optRow.className = `qd-option-row ${isCorrectOpt ? 'is-correct' : ''}`;
          optRow.innerHTML = `
            <span class="qd-option-badge">${letter}</span>
            <span class="qd-option-text">${formatCode(optText)}</span>
            ${isCorrectOpt ? '<span class="qd-option-tag"><span class="material-symbols-outlined" style="font-size: 14px;">check</span> Helyes megoldás</span>' : ''}
          `;
          optionsWrap.appendChild(optRow);
        });

      } else if (q.question_type === 'TF') {
        const tfOptions = [
          { label: 'Igaz', val: 'Igaz', badge: 'I' },
          { label: 'Hamis', val: 'Hamis', badge: 'H' }
        ];

        tfOptions.forEach(opt => {
          const optRow = document.createElement('div');
          const isCorrectOpt = acceptedAnswers.some(ans => {
            const n = ans.toLowerCase();
            if (opt.val === 'Igaz') return ['igaz', 'true', 'i', 't', '1'].includes(n);
            if (opt.val === 'Hamis') return ['hamis', 'false', 'h', 'f', '0'].includes(n);
            return false;
          });

          optRow.className = `qd-option-row ${isCorrectOpt ? 'is-correct' : ''}`;
          optRow.innerHTML = `
            <span class="qd-option-badge">${opt.badge}</span>
            <span class="qd-option-text"><strong>${opt.label}</strong></span>
            ${isCorrectOpt ? '<span class="qd-option-tag"><span class="material-symbols-outlined" style="font-size: 14px;">check</span> Helyes megoldás</span>' : ''}
          `;
          optionsWrap.appendChild(optRow);
        });

      } else if (q.question_type === 'SHORT') {
        const shortRow = document.createElement('div');
        shortRow.className = 'qd-option-row is-correct';
        shortRow.innerHTML = `
          <span class="qd-option-badge"><span class="material-symbols-outlined" style="font-size: 16px;">edit_note</span></span>
          <div class="qd-option-text">
            <div style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--success, #16a34a); font-weight: 800; margin-bottom: 2px;">Elfogadott helyes válasz(ok):</div>
            <div>${acceptedAnswers.map(a => `<code>${escapeHtml(a)}</code>`).join(' <span style="color: var(--text-muted); font-weight: 600;">vagy</span> ')}</div>
          </div>
        `;
        optionsWrap.appendChild(shortRow);
      }
    }

    // 5. Tanári magyarázat (ha van)
    const expBox = document.getElementById('qd-modal-explanation-box');
    const expEl = document.getElementById('qd-modal-explanation');
    if (expBox && expEl) {
      if (q.explanation && q.explanation.trim()) {
        expEl.innerHTML = formatCode(q.explanation);
        expBox.style.display = 'block';
      } else {
        expBox.style.display = 'none';
        expEl.innerHTML = '';
      }
    }

    // 6. Tanulói válaszok táblázat feltöltése és statisztikák
    const answersBody = document.getElementById('qd-modal-answers-body');
    if (answersBody) {
      answersBody.innerHTML = '';

      const participants = matrixData.participants || [];
      const answers = matrixData.answers || [];

      let answeredCount = 0;
      let correctCount = 0;
      let partialCount = 0;
      let wrongCount = 0;

      if (participants.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px; font-weight: 600;">Még nem csatlakozott tanuló a dolgozathoz.</td>`;
        answersBody.appendChild(emptyRow);
      } else {
        participants.forEach((p, pIdx) => {
          const tr = document.createElement('tr');
          const ans = answers.find(a => String(a.participant_id) === String(p.id) && String(a.question_id) === String(q.id));

          let answerHtml = '<span style="color: var(--text-muted); font-style: italic;">Még nem válaszolt</span>';
          let timeText = '–';
          let evalBadge = '<span class="qd-eval-badge qd-eval-none">–</span>';

          if (ans) {
            answeredCount++;
            answerHtml = formatCode(ans.submitted_answer || '–');
            if (ans.time_spent_sec) {
              timeText = `${ans.time_spent_sec} mp`;
            }

            if (ans.eval_status === 'CORRECT') {
              correctCount++;
              evalBadge = `<span class="qd-eval-badge qd-eval-correct"><span class="material-symbols-outlined" style="font-size: 13px;">check</span> ${ans.points_earned}p</span>`;
            } else if (ans.eval_status === 'PARTIAL') {
              partialCount++;
              evalBadge = `<span class="qd-eval-badge qd-eval-partial"><span class="material-symbols-outlined" style="font-size: 13px;">remove</span> ${ans.points_earned}p</span>`;
            } else {
              wrongCount++;
              evalBadge = `<span class="qd-eval-badge qd-eval-wrong"><span class="material-symbols-outlined" style="font-size: 13px;">close</span> 0p</span>`;
            }
          }

          tr.innerHTML = `
            <td style="text-align: center; font-weight: 700; color: var(--text-muted);">${pIdx + 1}</td>
            <td>
              <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(p.student_name)}</div>
            </td>
            <td>${answerHtml}</td>
            <td style="text-align: center; color: var(--text-muted); font-size: 0.85rem;">${timeText}</td>
            <td style="text-align: center;">${evalBadge}</td>
          `;
          answersBody.appendChild(tr);
        });
      }

      const statsBadge = document.getElementById('qd-modal-stats-badge');
      if (statsBadge) {
        if (participants.length === 0) {
          statsBadge.textContent = 'Még nem csatlakozott tanuló';
        } else {
          statsBadge.textContent = `${answeredCount} / ${participants.length} tanuló válaszolt • ${correctCount} helyes, ${wrongCount} hibás`;
        }
      }
    }

    openModal('modal-question-detail');
  }

  // Globálisan is elérhetővé tesszük a konzolos diagnosztikához és teszteléshez
  window.openQuestionDetailModal = openQuestionDetailModal;

  // 1-kattintásos tanári felülbírálás
  async function overrideCell(answerId, nextStatus) {
    try {
      const res = await fetch(`/api/admin/answers/${answerId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eval_status: nextStatus })
      });
      if (!res.ok) {
        const err = await res.json();
        showAdminAlert('⚠️ Értékelési hiba', err.error || 'Hiba a felülbíráláskor!');
      }
    } catch (err) {
      console.error('Hiba a felülbíráláskor:', err);
    }
  }

  // Gépváltás engedélyezése adatvesztés nélkül (Report 12 / 2.2)
  async function authorizeSeatChange(participantId) {
    try {
      const res = await fetch(`/api/admin/participants/${participantId}/authorize-seat-change`, { method: 'POST' });
      if (res.ok) {
        showToast('Gépváltás engedélyezve! A diák bejelentkezhet az új gépéről.', 'success');
        if (currentSessionId) switchSession(currentSessionId);
      } else {
        const err = await res.json();
        showAdminAlert('⚠️ Sikertelen gépváltás', err.error || 'Hiba a gépváltás engedélyezésekor!');
      }
    } catch (err) {
      console.error('Hiba a gépváltáskor:', err);
      showAdminAlert('⚠️ Hálózati hiba', 'Nem sikerült kommunikálni a szerverrel.');
    }
  }

  // Téves névfoglalás törlése (Report 12 / 2.2 - Reset)
  async function resetParticipant(participantId) {
    try {
      const res = await fetch(`/api/admin/participants/${participantId}/reset`, { method: 'POST' });
      if (res.ok) {
        showToast('Téves név sikeresen törölve a dolgozatból!', 'success');
        if (currentSessionId) switchSession(currentSessionId);
      } else {
        const err = await res.json();
        showAdminAlert('⚠️ Sikertelen törlés', err.error || 'Hiba a név törlésekor!');
      }
    } catch (err) {
      console.error('Hiba a név törlésekor:', err);
      showAdminAlert('⚠️ Hálózati hiba', 'Nem sikerült kommunikálni a szerverrel.');
    }
  }

  // Kompatibilitási névfeloldó alias
  async function unlockParticipant(participantId) {
    return resetParticipant(participantId);
  }

  // Modális jóváhagyó gombok eseménykezelői
  const btnSubmitFinishSession = document.getElementById('btn-submit-finish-session');
  if (btnSubmitFinishSession) {
    btnSubmitFinishSession.addEventListener('click', async () => {
      closeModal('modal-confirm-finish');
      if (!currentSessionId) return;

      try {
        const res = await fetch(`/api/admin/sessions/${currentSessionId}/finish`, { method: 'POST' });
        if (res.ok) {
          showToast('Dolgozat sikeresen lezárva!', 'success');
          await loadActiveSessions();
          await switchSession(currentSessionId);
        } else {
          const err = await res.json();
          showAdminAlert('⚠️ Hiba a lezáráskor', err.error || 'Hiba a dolgozat lezárásakor!');
        }
      } catch (err) {
        console.error('Hiba a dolgozat lezárásakor:', err);
        showAdminAlert('⚠️ Hálózati hiba', 'Nem sikerült elérni a szervert a lezáráshoz.');
      }
    });
  }

  const btnSubmitDeleteName = document.getElementById('btn-submit-delete-name');
  if (btnSubmitDeleteName) {
    btnSubmitDeleteName.addEventListener('click', async () => {
      closeModal('modal-confirm-delete-name');
      if (pendingDeleteParticipantId) {
        await resetParticipant(pendingDeleteParticipantId);
        pendingDeleteParticipantId = null;
      }
    });
  }

  const btnSubmitSeatChange = document.getElementById('btn-submit-seat-change');
  if (btnSubmitSeatChange) {
    btnSubmitSeatChange.addEventListener('click', async () => {
      closeModal('modal-confirm-seat-change');
      if (pendingSeatChangeParticipantId) {
        await authorizeSeatChange(pendingSeatChangeParticipantId);
        pendingSeatChangeParticipantId = null;
      }
    });
  }

  const btnSubmitDeleteSession = document.getElementById('btn-submit-delete-session');
  if (btnSubmitDeleteSession) {
    btnSubmitDeleteSession.addEventListener('click', async () => {
      closeModal('modal-confirm-delete-session');
      if (!pendingDeleteSessionId) return;

      try {
        const res = await fetch(`/api/admin/sessions/${pendingDeleteSessionId}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Dolgozat sikeresen törölve az archívumból!', 'success');
          if (currentSessionId === pendingDeleteSessionId) {
            currentSessionId = null;
            await loadActiveSessions();
            switchSession(null);
          } else {
            await loadActiveSessions();
          }
          await loadReports();
        } else {
          const err = await res.json();
          showAdminAlert('⚠️ Törlési hiba', err.error || 'Hiba a dolgozat törlése során!');
        }
      } catch (err) {
        console.error('Hiba a dolgozat törlésekor:', err);
        showAdminAlert('⚠️ Hálózati hiba', 'Nem sikerült elérni a szervert a törléshez.');
      } finally {
        pendingDeleteSessionId = null;
      }
    });
  }

  const btnSubmitDeleteQuiz = document.getElementById('btn-submit-delete-quiz');
  if (btnSubmitDeleteQuiz) {
    btnSubmitDeleteQuiz.addEventListener('click', async () => {
      closeModal('modal-confirm-delete-quiz');
      if (!pendingDeleteQuizId) return;

      try {
        await deleteQuiz(pendingDeleteQuizId);
      } catch (err) {
        console.error('Hiba a kvíz törlésekor:', err);
      } finally {
        pendingDeleteQuizId = null;
      }
    });
  }

  const btnSubmitDeleteFolder = document.getElementById('btn-submit-delete-folder');
  if (btnSubmitDeleteFolder) {
    btnSubmitDeleteFolder.addEventListener('click', async () => {
      closeModal('modal-confirm-delete-folder');
      if (!pendingDeleteFolderId) return;

      try {
        await deleteFolder(pendingDeleteFolderId);
      } catch (err) {
        console.error('Hiba a mappa törlésekor:', err);
      } finally {
        pendingDeleteFolderId = null;
      }
    });
  }

  const btnSubmitMoveQuiz = document.getElementById('btn-submit-move-quiz');
  const moveQuizTargetFolder = document.getElementById('move-quiz-target-folder');
  if (btnSubmitMoveQuiz) {
    btnSubmitMoveQuiz.addEventListener('click', async () => {
      closeModal('modal-move-quiz');
      if (!pendingMoveQuizId) return;

      try {
        const targetFolderId = moveQuizTargetFolder && moveQuizTargetFolder.value ? moveQuizTargetFolder.value : null;
        await moveQuiz(pendingMoveQuizId, targetFolderId);
      } catch (err) {
        console.error('Hiba a teszt áthelyezésekor:', err);
      } finally {
        pendingMoveQuizId = null;
      }
    });
  }

  // Űrhajós verseny indítása (RAJT gomb)
  if (btnAdminStartRace) {
    btnAdminStartRace.addEventListener('click', async () => {
      if (!currentSessionId) return;
      try {
        btnAdminStartRace.disabled = true;
        btnAdminStartRace.textContent = '🚀 Indítás...';
        const res = await fetch(`/api/admin/sessions/${currentSessionId}/start-race`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
          showToast('🚀 A verseny sikeresen elindult!', 'success');
          btnAdminStartRace.style.display = 'none';
        } else {
          const err = await res.json();
          showAdminAlert('⚠️ Rajthiba', err.error || 'Hiba a rajt indításakor!');
          btnAdminStartRace.disabled = false;
          btnAdminStartRace.textContent = '🚀 RAJT! Verseny indítása';
        }
      } catch (err) {
        console.error('Hiba a rajt indításakor:', err);
        btnAdminStartRace.disabled = false;
        btnAdminStartRace.textContent = '🚀 RAJT! Verseny indítása';
      }
    });
  }

  // Dolgozat befejezése (Finish gomb a jobb felső sarokban)
  btnFinishSession.addEventListener('click', () => {
    if (!currentSessionId) return;
    openModal('modal-confirm-finish');
  });

  // Élő dolgozat exportálásának megnyitása
  const btnLiveExport = document.getElementById('btn-live-export');
  if (btnLiveExport) {
    btnLiveExport.addEventListener('click', () => {
      if (!currentSessionId) {
        showToast('Nincs kiválasztott dolgozat az exportáláshoz!', 'error');
        return;
      }
      openModal('modal-live-export');
    });
  }

  /**
   * Új Dolgozat Indítása (Modal)
   */
  function syncStartQuizTimeLimit() {
    if (!startQuizId || !startTimeLimit) return;
    const selOpt = startQuizId.options[startQuizId.selectedIndex];
    if (selOpt && selOpt.dataset.timeLimit !== undefined) {
      startTimeLimit.value = selOpt.dataset.timeLimit;
    }
    if (currentClassroomSettings && currentClassroomSettings.shuffle_questions !== undefined) {
      if (startShuffleQuestions) startShuffleQuestions.checked = Boolean(currentClassroomSettings.shuffle_questions);
    }
    if (currentClassroomSettings && currentClassroomSettings.shuffle_options !== undefined) {
      if (startShuffleOptions) startShuffleOptions.checked = Boolean(currentClassroomSettings.shuffle_options);
    }
  }

  btnOpenStartModal.addEventListener('click', async () => {
    await updateStartSessionQuizOptions(true);
    syncStartQuizTimeLimit();
    openModal('modal-start-session');
  });
  btnOpenStartModalAlt.addEventListener('click', async () => {
    await updateStartSessionQuizOptions(true);
    syncStartQuizTimeLimit();
    openModal('modal-start-session');
  });

  if (startQuizId) {
    startQuizId.addEventListener('change', () => {
      syncStartQuizTimeLimit();
      const selOpt = startQuizId.options[startQuizId.selectedIndex];
      if (selOpt && selOpt.dataset && selOpt.dataset.grade && startGradeLevel) {
        const optGrade = selOpt.dataset.grade.trim();
        if (optGrade && startGradeLevel.value.trim() !== optGrade) {
          startGradeLevel.value = optGrade;
        }
      }
    });
  }

  if (startGradeLevel) {
    startGradeLevel.addEventListener('input', () => {
      updateStartSessionQuizOptions(false);
    });
  }

  formStartSession.addEventListener('submit', async () => {
    const payload = {
      subject_id: parseInt(startSubjectId.value, 10),
      grade_level: startGradeLevel.value.trim(),
      quiz_id: parseInt(startQuizId.value, 10),
      mode: startMode.value,
      time_limit_min: parseInt(startTimeLimit.value, 10) || 0,
      shuffle_questions: startShuffleQuestions.checked ? 1 : 0,
      shuffle_options: startShuffleOptions.checked ? 1 : 0
    };

    try {
      const res = await fetch('/api/admin/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        closeModal('modal-start-session');
        showToast('Dolgozat sikeresen elindítva!', 'success');
        await loadActiveSessions();
        switchSession(data.session.id);
      } else {
        showAdminAlert('⚠️ Indítási hiba', data.error || 'Hiba a dolgozat indításakor!');
      }
    } catch (err) {
      showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba a dolgozat indításakor!');
    }
  });

  /**
   * Tantárgyak betöltése
   */
  async function loadSubjects() {
    try {
      const res = await fetch('/api/subjects');
      subjectsList = await res.json();

      startSubjectId.innerHTML = '';
      editSubjectId.innerHTML = '';
      if (importPdfSubjectId) importPdfSubjectId.innerHTML = '';

      subjectsList.forEach(s => {
        const opt1 = document.createElement('option');
        opt1.value = s.id;
        opt1.textContent = s.name;
        if (s.is_default) opt1.selected = true;
        startSubjectId.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = s.id;
        opt2.textContent = s.name;
        if (s.is_default) opt2.selected = true;
        editSubjectId.appendChild(opt2);

        if (importPdfSubjectId) {
          const opt3 = document.createElement('option');
          opt3.value = s.id;
          opt3.textContent = s.name;
          if (s.is_default) opt3.selected = true;
          importPdfSubjectId.appendChild(opt3);
        }
      });
    } catch (err) {
      console.error('Hiba a tantárgyak betöltésekor:', err);
    }
  }

  /**
   * Tesztek betöltése (Tesztszerkesztő)
   */
  /**
   * Tesztek és mappák betöltése (Tesztszerkesztő hierarchikus nézet)
   */
  async function loadQuizzes(targetFolderId = currentFolderId) {
    currentFolderId = (targetFolderId !== undefined) ? targetFolderId : currentFolderId;
    try {
      const folderParam = (currentFolderId === null || currentFolderId === undefined) ? 'root' : currentFolderId;

      // 1. Almappák és morzsamenü lekérése
      const folderRes = await fetch(`/api/admin/quiz-folders?parentId=${folderParam}`);
      const folderData = await folderRes.json();
      const currentFolders = folderData.folders || [];
      currentBreadcrumbs = folderData.breadcrumbs || [];

      // 2. Kvízek lekérése az aktuális mappában
      const quizRes = await fetch(`/api/admin/quizzes?folderId=${folderParam}`);
      quizzesList = await quizRes.json();

      // 3. Dolgozatindító modál legördülő frissítése az összes teszttel
      await updateStartSessionQuizOptions(true);

      // 4. Morzsamenü és navigáció kirajzolása
      renderBreadcrumbs();

      // 5. Kártyarács kirajzolása (mappák elöl, utána tesztek)
      renderQuizGrid(currentFolders, quizzesList);

    } catch (err) {
      console.error('Hiba a tesztek és mappák betöltésekor:', err);
    }
  }

  let cachedQuizzesForStart = [];

  /**
   * Dolgozatindító modál kvíz-választó mezőjének frissítése:
   * - Évfolyam szerinti csoportosítás (<optgroup label="X. évfolyam">)
   * - Egyértelmű felirat: "3. évf. · [Mappa] Cím (X kérdés)"
   * - Intelligens dinamikus szűrés a beírt évfolyam alapján
   * - Kétirányú szinkronizáció az évfolyam mezővel
   */
  async function updateStartSessionQuizOptions(forceRefresh = false) {
    if (!startQuizId) return;
    try {
      if (forceRefresh || !cachedQuizzesForStart || cachedQuizzesForStart.length === 0) {
        const res = await fetch('/api/admin/quizzes');
        if (res.ok) {
          cachedQuizzesForStart = await res.json();
        }
      }

      const allQuizzes = Array.isArray(cachedQuizzesForStart) ? cachedQuizzesForStart : [];
      const currentSelectedId = startQuizId.value ? parseInt(startQuizId.value, 10) : null;
      const rawGradeFilter = startGradeLevel ? startGradeLevel.value.trim() : '';
      const numGradeFilter = rawGradeFilter.replace(/\D/g, '');

      // Szűrés évfolyamra, ha a tanár beírt egy évfolyamot
      let matchingQuizzes = allQuizzes;
      if (numGradeFilter) {
        const filtered = allQuizzes.filter(q => {
          const qGradeNum = String(q.subject_grade || '').replace(/\D/g, '');
          return qGradeNum === numGradeFilter;
        });
        if (filtered.length > 0) {
          matchingQuizzes = filtered;
        }
      }

      startQuizId.innerHTML = '';

      if (matchingQuizzes.length === 0) {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.disabled = true;
        emptyOpt.selected = true;
        emptyOpt.textContent = 'Nincs elérhető teszt';
        startQuizId.appendChild(emptyOpt);
        syncStartQuizTimeLimit();
        return;
      }

      // Kvízek csoportosítása évfolyamok szerint
      const gradeGroups = {};
      matchingQuizzes.forEach(q => {
        const gradeKey = q.subject_grade ? `${q.subject_grade}. évfolyam` : 'Egyéb évfolyam';
        if (!gradeGroups[gradeKey]) gradeGroups[gradeKey] = [];
        gradeGroups[gradeKey].push(q);
      });

      // Évfolyam kulcsok rendezése növekvő sorrendbe
      const sortedGradeKeys = Object.keys(gradeGroups).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 999;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 999;
        return numA - numB;
      });

      let foundPreviousSelection = false;

      sortedGradeKeys.forEach(gradeKey => {
        const groupEl = document.createElement('optgroup');
        groupEl.label = `▼ ${gradeKey}`;

        // Csoporton belül cím szerint rendezve
        gradeGroups[gradeKey].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'hu'));

        gradeGroups[gradeKey].forEach(q => {
          const opt = document.createElement('option');
          opt.value = q.id;
          opt.dataset.timeLimit = (q.default_time_limit_min !== null && q.default_time_limit_min !== undefined) ? q.default_time_limit_min : 0;
          opt.dataset.grade = q.subject_grade || '';
          opt.dataset.subjectId = q.subject_id || '';

          const gradeBadge = q.subject_grade ? `${q.subject_grade}. évf.` : '';
          const folderTag = q.folder_name ? `[${q.folder_name}] ` : '';
          const prefix = gradeBadge ? `${gradeBadge} · ` : '';

          opt.textContent = `${prefix}${folderTag}${q.title} (${q.question_count} kérdés)`;

          if (currentSelectedId && q.id === currentSelectedId) {
            opt.selected = true;
            foundPreviousSelection = true;
          }

          groupEl.appendChild(opt);
        });

        startQuizId.appendChild(groupEl);
      });

      // Ha az előző kijelölés nem szerepelt a szűrt listában, akkor az első elem kiválasztása
      if (!foundPreviousSelection && startQuizId.options.length > 0) {
        startQuizId.selectedIndex = 0;
      }

      syncStartQuizTimeLimit();
    } catch (err) {
      console.error('Hiba az indító tesztválasztó frissítésekor:', err);
    }
  }

  /**
   * Morzsamenü sáv renderelése
   */
  function renderBreadcrumbs() {
    if (!quizBreadcrumbsList) return;
    quizBreadcrumbsList.innerHTML = '';

    // Főmappa (Gyökér)
    if (currentFolderId === null || currentFolderId === undefined) {
      const rootSpan = document.createElement('span');
      rootSpan.className = 'quiz-breadcrumb-item active';
      rootSpan.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">folder_open</span> <span>Főmappa</span>';
      quizBreadcrumbsList.appendChild(rootSpan);
    } else {
      const rootBtn = document.createElement('button');
      rootBtn.type = 'button';
      rootBtn.className = 'quiz-breadcrumb-item';
      rootBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">folder</span> <span>Főmappa</span>';
      rootBtn.addEventListener('click', () => loadQuizzes(null));
      quizBreadcrumbsList.appendChild(rootBtn);
    }

    // Útvonal elemei
    if (Array.isArray(currentBreadcrumbs)) {
      currentBreadcrumbs.forEach((bc, idx) => {
        const sep = document.createElement('span');
        sep.className = 'quiz-breadcrumb-separator';
        sep.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">chevron_right</span>';
        quizBreadcrumbsList.appendChild(sep);

        const isLast = (idx === currentBreadcrumbs.length - 1);
        if (isLast) {
          const itemSpan = document.createElement('span');
          itemSpan.className = 'quiz-breadcrumb-item active';
          itemSpan.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">folder_open</span> <span>${escapeHtml(bc.name)}</span>`;
          quizBreadcrumbsList.appendChild(itemSpan);
        } else {
          const itemBtn = document.createElement('button');
          itemBtn.type = 'button';
          itemBtn.className = 'quiz-breadcrumb-item';
          itemBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle;">folder</span> <span>${escapeHtml(bc.name)}</span>`;
          itemBtn.addEventListener('click', () => loadQuizzes(bc.id));
          quizBreadcrumbsList.appendChild(itemBtn);
        }
      });
    }

    // Szülőmappa gomb kezelése
    if (quizBreadcrumbsBar) {
      let upBtn = quizBreadcrumbsBar.querySelector('.quiz-breadcrumb-up-btn');
      if (currentFolderId !== null && currentFolderId !== undefined) {
        if (!upBtn) {
          upBtn = document.createElement('button');
          upBtn.type = 'button';
          upBtn.className = 'quiz-breadcrumb-up-btn';
          quizBreadcrumbsBar.appendChild(upBtn);
        }
        upBtn.style.display = 'inline-flex';
        upBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 17px; vertical-align: middle;">arrow_upward</span> <span>Szülőmappa</span>';
        const parentId = (currentBreadcrumbs.length > 1) ? currentBreadcrumbs[currentBreadcrumbs.length - 2].id : null;
        upBtn.onclick = () => loadQuizzes(parentId);
      } else if (upBtn) {
        upBtn.style.display = 'none';
      }
    }
  }

  /**
   * Tesztek és mappák kártyarácsának kirajzolása
   */
  function renderQuizGrid(folders, quizzes) {
    if (!quizzesListContainer) return;
    quizzesListContainer.innerHTML = '';

    // Üres állapot kezelése
    if ((!folders || folders.length === 0) && (!quizzes || quizzes.length === 0)) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.gridColumn = '1 / -1';
      emptyDiv.style.padding = '36px 20px';
      emptyDiv.style.textAlign = 'center';
      emptyDiv.style.backgroundColor = '#f8fafc';
      emptyDiv.style.border = '1.5px dashed #cbd5e1';
      emptyDiv.style.borderRadius = '12px';
      emptyDiv.style.color = 'var(--text-muted, #64748b)';
      emptyDiv.innerHTML = `
        <span class="material-symbols-outlined" style="font-size: 40px; color: #94a3b8; display: block; margin-bottom: 8px;">folder_open</span>
        <p style="margin: 0; font-size: 0.95rem; font-weight: 500;">Ebben a mappában még nincs teszt vagy almappa.</p>
        <p style="margin: 6px 0 0 0; font-size: 0.85rem; color: #94a3b8;">Hozz létre egy új mappát vagy új tesztet a fenti eszköztár gombjaival!</p>
      `;
      quizzesListContainer.appendChild(emptyDiv);
      return;
    }

    // 1. Mappakártyák kirajzolása
    if (Array.isArray(folders)) {
      folders.forEach(f => {
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.title = `${f.name} mappa megnyitása`;

        const subCount = f.subfolder_count || 0;
        const qCount = f.quiz_count || 0;
        let metaText = '';
        if (subCount > 0 && qCount > 0) {
          metaText = `${subCount} almappa &bull; ${qCount} teszt`;
        } else if (subCount > 0) {
          metaText = `${subCount} almappa`;
        } else if (qCount > 0) {
          metaText = `${qCount} teszt`;
        } else {
          metaText = 'Üres mappa';
        }

        card.innerHTML = `
          <div class="folder-card-header">
            <div class="folder-card-icon">
              <span class="material-symbols-outlined">folder</span>
            </div>
            <div class="folder-card-info">
              <h4 class="folder-card-title">${escapeHtml(f.name)}</h4>
              <p class="folder-card-meta">${metaText}</p>
            </div>
          </div>
          <div class="folder-card-actions">
            <button type="button" class="folder-btn-action btn-rename-folder" title="Mappa átnevezése">
              <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
            </button>
            <button type="button" class="folder-btn-action folder-btn-delete btn-delete-folder" title="Mappa törlése">
              <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
            </button>
          </div>
        `;

        // Belépés a mappába
        card.addEventListener('click', (e) => {
          if (e.target.closest('.folder-card-actions') || e.target.closest('input') || e.target.closest('button')) return;
          loadQuizzes(f.id);
        });

        // Átnevezés
        const btnRename = card.querySelector('.btn-rename-folder');
        if (btnRename) {
          btnRename.addEventListener('click', (e) => {
            e.stopPropagation();
            inlineRenameFolder(f, card);
          });
        }

        // Törlés
        const btnDel = card.querySelector('.btn-delete-folder');
        if (btnDel) {
          btnDel.addEventListener('click', (e) => {
            e.stopPropagation();
            pendingDeleteFolderId = f.id;
            const targetEl = document.getElementById('delete-folder-name');
            if (targetEl) targetEl.textContent = f.name;
            openModal('modal-confirm-delete-folder');
          });
        }

        quizzesListContainer.appendChild(card);
      });
    }

    // 2. Tesztkártyák kirajzolása
    if (Array.isArray(quizzes)) {
      quizzes.forEach(q => {
        const card = document.createElement('div');
        card.className = 'quiz-card';

        card.innerHTML = `
          <div class="quiz-card-header">
            <h4 class="quiz-card-title">${escapeHtml(q.title)}</h4>
          </div>
          <p class="quiz-card-meta">
            ${escapeHtml(q.subject_name)} &bull; ${escapeHtml(q.subject_grade)}. évfolyam<br>
            <span style="font-weight: 600;">${q.question_count} kérdés</span> (${q.total_points} pont)
          </p>
          <div class="quiz-card-actions">
            <button type="button" class="quiz-btn-icon quiz-btn-edit btn-edit" data-id="${q.id}" title="Teszt szerkesztése">
              <span class="material-symbols-outlined">edit</span>
            </button>
            <button type="button" class="quiz-btn-icon quiz-btn-copy btn-duplicate" data-id="${q.id}" title="Másolat készítése">
              <span class="material-symbols-outlined">content_copy</span>
            </button>
            <button type="button" class="quiz-btn-icon quiz-btn-merge btn-merge" data-id="${q.id}" title="Teszt egyesítése egy másikkal">
              <span class="material-symbols-outlined">call_merge</span>
            </button>
            <button type="button" class="quiz-btn-icon quiz-btn-move btn-move" data-id="${q.id}" title="Teszt áthelyezése másik mappába">
              <span class="material-symbols-outlined">drive_file_move</span>
            </button>
            <button type="button" class="quiz-btn-icon quiz-btn-delete btn-delete" data-id="${q.id}" title="Teszt törlése">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        `;

        const btnEdit = card.querySelector('.btn-edit');
        if (btnEdit) {
          btnEdit.addEventListener('click', () => openQuizEditor(q.id));
        }

        const btnDup = card.querySelector('.btn-duplicate');
        if (btnDup) {
          btnDup.addEventListener('click', async () => {
            await duplicateQuiz(q.id);
          });
        }

        const btnMerge = card.querySelector('.btn-merge');
        if (btnMerge) {
          btnMerge.addEventListener('click', () => {
            openMergeQuizzesModal(q.id);
          });
        }

        const btnMove = card.querySelector('.btn-move');
        if (btnMove) {
          btnMove.addEventListener('click', async () => {
            pendingMoveQuizId = q.id;
            const targetEl = document.getElementById('move-quiz-title');
            if (targetEl) targetEl.textContent = q.title;
            await loadMoveFolderOptions(q.folder_id);
            openModal('modal-move-quiz');
          });
        }

        const btnDel = card.querySelector('.btn-delete');
        if (btnDel) {
          btnDel.addEventListener('click', () => {
            pendingDeleteQuizId = q.id;
            const targetEl = document.getElementById('delete-quiz-title');
            if (targetEl) targetEl.textContent = q.title;
            openModal('modal-confirm-delete-quiz');
          });
        }

        quizzesListContainer.appendChild(card);
      });
    }
  }

  /**
   * Mappa közvetlen helyi (in-place) átnevezése
   */
  function inlineRenameFolder(folder, card) {
    const infoEl = card.querySelector('.folder-card-info');
    const actionsEl = card.querySelector('.folder-card-actions');
    if (!infoEl) return;

    const originalHtml = infoEl.innerHTML;
    const originalActionsDisplay = actionsEl ? actionsEl.style.display : '';
    if (actionsEl) actionsEl.style.display = 'none';

    infoEl.innerHTML = `
      <input type="text" class="folder-card-new-input" value="${escapeHtml(folder.name)}" style="margin-bottom: 6px;">
      <div style="display: flex; gap: 6px;">
        <button type="button" class="btn btn-primary btn-save-rename" style="padding: 4px 10px; font-size: 0.8rem;">Mentés</button>
        <button type="button" class="btn btn-secondary btn-cancel-rename" style="padding: 4px 10px; font-size: 0.8rem;">Mégse</button>
      </div>
    `;

    const input = infoEl.querySelector('input');
    const btnSave = infoEl.querySelector('.btn-save-rename');
    const btnCancel = infoEl.querySelector('.btn-cancel-rename');

    input.focus();
    input.select();

    const cancel = (e) => {
      if (e) e.stopPropagation();
      infoEl.innerHTML = originalHtml;
      if (actionsEl) actionsEl.style.display = originalActionsDisplay;
    };

    const save = async (e) => {
      if (e) e.stopPropagation();
      const newName = input.value.trim();
      if (!newName) {
        showToast('A mappa neve nem lehet üres!', 'error');
        input.focus();
        return;
      }
      if (newName === folder.name) {
        cancel();
        return;
      }

      try {
        const res = await fetch(`/api/admin/quiz-folders/${folder.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName })
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Mappa sikeresen átnevezve!', 'success');
          await loadQuizzes(currentFolderId);
        } else {
          showAdminAlert('⚠️ Hiba', data.error || 'Hiba a mappa átnevezésekor!');
          cancel();
        }
      } catch (err) {
        showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba a mappa átnevezésekor!');
        cancel();
      }
    };

    btnCancel.addEventListener('click', cancel);
    btnSave.addEventListener('click', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save(e);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel(e);
      }
    });
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  // Új mappa létrehozása gomb (eszköztár)
  if (btnNewFolder) {
    btnNewFolder.addEventListener('click', () => {
      if (!quizzesListContainer) return;

      const existingNewCard = quizzesListContainer.querySelector('.folder-card-new');
      if (existingNewCard) {
        const existingInput = existingNewCard.querySelector('.folder-card-new-input');
        if (existingInput) {
          existingInput.focus();
          existingInput.select();
        }
        return;
      }

      const newCard = document.createElement('div');
      newCard.className = 'folder-card-new';
      newCard.innerHTML = `
        <div class="folder-card-new-header">
          <span class="material-symbols-outlined" style="font-size: 26px; color: #d97706;">create_new_folder</span>
          <strong style="color: #78350f; font-size: 0.95rem;">Új mappa</strong>
        </div>
        <input type="text" class="folder-card-new-input" value="Új mappa" placeholder="Mappa neve...">
        <div class="folder-card-new-actions">
          <button type="button" class="btn btn-secondary btn-cancel-new-folder" style="padding: 6px 12px; font-size: 0.85rem;">Mégse</button>
          <button type="button" class="btn btn-primary btn-save-new-folder" style="padding: 6px 12px; font-size: 0.85rem;">Létrehozás</button>
        </div>
      `;

      quizzesListContainer.prepend(newCard);

      const input = newCard.querySelector('.folder-card-new-input');
      const btnSave = newCard.querySelector('.btn-save-new-folder');
      const btnCancel = newCard.querySelector('.btn-cancel-new-folder');

      input.focus();
      input.select();

      const cancel = () => {
        newCard.remove();
      };

      const save = async () => {
        const folderName = input.value.trim();
        if (!folderName) {
          showToast('A mappa neve nem lehet üres!', 'error');
          input.focus();
          return;
        }

        try {
          btnSave.disabled = true;
          const res = await fetch('/api/admin/quiz-folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: folderName,
              parent_id: currentFolderId
            })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast('Mappa sikeresen létrehozva!', 'success');
            await loadQuizzes(currentFolderId);
          } else {
            showAdminAlert('⚠️ Hiba', data.error || 'Hiba a mappa létrehozásakor!');
            btnSave.disabled = false;
          }
        } catch (err) {
          showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba a mappa létrehozásakor!');
          btnSave.disabled = false;
        }
      };

      btnCancel.addEventListener('click', cancel);
      btnSave.addEventListener('click', save);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      });
    });
  }

  // Mappa törlése a szerveren
  async function deleteFolder(folderId) {
    try {
      const res = await fetch(`/api/admin/quiz-folders/${folderId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast('Mappa sikeresen törölve! A tesztek a szülő mappába kerültek.', 'success');
        await loadQuizzes(currentFolderId);
      } else {
        showAdminAlert('⚠️ Törlési hiba', data.error || 'Hiba a mappa törlésekor!');
      }
    } catch (err) {
      showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba a mappa törlésekor!');
    }
  }

  // Duplikálás
  async function duplicateQuiz(quizId) {
    try {
      const res = await fetch(`/api/admin/quizzes/${quizId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Teszt sikeresen másolva és duplikálva!', 'success');
        await loadQuizzes(currentFolderId);
        openQuizEditor(data.quiz.id);
      } else {
        showAdminAlert('⚠️ Másolási hiba', data.error || 'Hiba a másolás során!');
      }
    } catch (err) {
      showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba a másoláskor!');
    }
  }

  // Törlés
  async function deleteQuiz(quizId) {
    try {
      const res = await fetch(`/api/admin/quizzes/${quizId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Teszt sikeresen törölve!', 'success');
        await loadQuizzes(currentFolderId);
      } else {
        const err = await res.json();
        showAdminAlert('⚠️ Törlési hiba', err.error || 'Hiba a törlés során!');
      }
    } catch (err) {
      showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba a törléskor!');
    }
  }

  let allQuizzesForMerge = [];

  /**
   * Tesztek egyesítése modális ablak megnyitása és előkészítése
   */
  async function openMergeQuizzesModal(preselectedQuizId = null) {
    if (!modalMergeQuizzes) return;

    // 1. Mezők alaphelyzetbe állítása
    mergeQuizSource1.innerHTML = '<option value="">⏳ Tesztek betöltése...</option>';
    mergeQuizSource2.innerHTML = '<option value="">⏳ Tesztek betöltése...</option>';
    mergeQuizNewTitle.value = '';
    mergeQuizNewTitle.dataset.autoGenerated = 'false';
    mergeQuizTimeLimit.value = '0';
    if (mergeQuizSummaryBox) {
      mergeQuizSummaryBox.innerHTML = 'ℹ️ <strong>Tájékoztatás:</strong> Válassz ki két tesztet az egyesítéshez!';
    }

    // 2. Összes kvíz lekérése
    try {
      const res = await fetch('/api/admin/quizzes');
      if (res.ok) {
        allQuizzesForMerge = await res.json();
      } else {
        allQuizzesForMerge = [];
      }
    } catch {
      allQuizzesForMerge = [];
    }

    if (!Array.isArray(allQuizzesForMerge) || allQuizzesForMerge.length < 2) {
      showAdminAlert('⚠️ Kevés teszt', 'A tesztek egyesítéséhez legalább 2 meglévő teszt szükséges a rendszerben!');
      return;
    }

    // 3. Mappák betöltése a célmappa választóhoz
    await loadMergeFolderOptions();

    // 4. Legördülők feltöltése évfolyamonkénti optgroup csoportosítással
    populateMergeSelect(mergeQuizSource1, allQuizzesForMerge, preselectedQuizId ? Number(preselectedQuizId) : null);
    populateMergeSelect(mergeQuizSource2, allQuizzesForMerge, null);

    // 5. Összegzés és javasolt cím frissítése
    updateMergeSummary();

    // 6. Modál megnyitása
    openModal('modal-merge-quizzes');
  }

  /**
   * Tesztválasztó legördülő feltöltése évfolyamcsoportosítással
   */
  function populateMergeSelect(selectEl, quizzes, selectedId = null) {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">-- Válassz tesztet... --</option>';

    const grouped = new Map();
    quizzes.forEach(q => {
      const rawGrade = String(q.subject_grade || '').trim();
      const numMatch = rawGrade.match(/\d+/);
      const gradeKey = numMatch ? `${numMatch[0]}. évfolyam` : (rawGrade ? `${rawGrade}. évfolyam` : 'Egyéb évfolyam');
      if (!grouped.has(gradeKey)) grouped.set(gradeKey, []);
      grouped.get(gradeKey).push(q);
    });

    const sortedKeys = Array.from(grouped.keys()).sort((a, b) => {
      const na = parseInt(a, 10) || 999;
      const nb = parseInt(b, 10) || 999;
      return na - nb;
    });

    sortedKeys.forEach(gradeKey => {
      const optGroup = document.createElement('optgroup');
      optGroup.label = `📚 ${gradeKey}`;
      const items = grouped.get(gradeKey);
      items.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'hu'));

      items.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.id;
        const qCount = q.question_count !== undefined ? q.question_count : (q.questions ? q.questions.length : 0);
        const pCount = q.total_points !== undefined ? q.total_points : 0;
        opt.textContent = `${q.title} (${qCount} kérdés, ${pCount} pont)`;
        if (selectedId && Number(q.id) === Number(selectedId)) {
          opt.selected = true;
        }
        optGroup.appendChild(opt);
      });

      selectEl.appendChild(optGroup);
    });
  }

  /**
   * Célmappa választó feltöltése
   */
  async function loadMergeFolderOptions() {
    if (!mergeQuizTargetFolder) return;
    mergeQuizTargetFolder.innerHTML = '<option value="">📁 Főmappa (Gyökér)</option>';

    try {
      const res = await fetch('/api/admin/quiz-folders?all=true');
      const allFolders = await res.json();
      if (Array.isArray(allFolders)) {
        const folderMap = new Map();
        allFolders.forEach(f => folderMap.set(f.id, f));

        function getFolderPath(folder) {
          const names = [folder.name];
          let cur = folder;
          while (cur.parent_id && folderMap.has(cur.parent_id)) {
            cur = folderMap.get(cur.parent_id);
            names.unshift(cur.name);
          }
          return names.join(' / ');
        }

        allFolders.sort((a, b) => getFolderPath(a).localeCompare(getFolderPath(b), 'hu'));

        allFolders.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f.id;
          opt.textContent = `📁 ${getFolderPath(f)}`;
          if (currentFolderId && Number(f.id) === Number(currentFolderId)) {
            opt.selected = true;
          }
          mergeQuizTargetFolder.appendChild(opt);
        });
      }
    } catch {
      // ignore
    }
  }

  /**
   * Összegző doboz és javasolt cím kalkulációja a két kiválasztott teszt alapján
   */
  function updateMergeSummary() {
    const id1 = mergeQuizSource1.value ? Number(mergeQuizSource1.value) : null;
    const id2 = mergeQuizSource2.value ? Number(mergeQuizSource2.value) : null;

    Array.from(mergeQuizSource2.options).forEach(opt => {
      if (opt.value && Number(opt.value) === id1) {
        opt.disabled = true;
      } else {
        opt.disabled = false;
      }
    });

    if (!id1 || !id2) {
      if (mergeQuizSummaryBox) {
        mergeQuizSummaryBox.innerHTML = 'ℹ️ <strong>Tájékoztatás:</strong> Válassz ki mindkét legördülőből egy-egy tesztet az egyesítéshez!';
      }
      return;
    }

    if (id1 === id2) {
      if (mergeQuizSummaryBox) {
        mergeQuizSummaryBox.innerHTML = '⚠️ <strong>Hiba:</strong> Két különböző tesztet kell kiválasztanod!';
      }
      return;
    }

    const q1 = allQuizzesForMerge.find(q => q.id === id1);
    const q2 = allQuizzesForMerge.find(q => q.id === id2);
    if (!q1 || !q2) return;

    const count1 = q1.question_count || 0;
    const count2 = q2.question_count || 0;
    const points1 = q1.total_points || 0;
    const points2 = q2.total_points || 0;
    const totalCount = count1 + count2;
    const totalPoints = points1 + points2;

    const defaultTitle = `${q1.title} + ${q2.title}`;
    if (!mergeQuizNewTitle.value.trim() || mergeQuizNewTitle.dataset.autoGenerated === 'true') {
      mergeQuizNewTitle.value = defaultTitle;
      mergeQuizNewTitle.dataset.autoGenerated = 'true';
    }

    const time1 = Number(q1.default_time_limit_min) || 0;
    const time2 = Number(q2.default_time_limit_min) || 0;
    const suggestedTime = Math.max(time1, time2);
    if (!mergeQuizTimeLimit.value || mergeQuizTimeLimit.value === '0') {
      mergeQuizTimeLimit.value = String(suggestedTime);
    }

    if (mergeQuizSummaryBox) {
      mergeQuizSummaryBox.innerHTML = `
        🎯 <strong>Összegzés:</strong> Az új teszt <strong>${totalCount} kérdést</strong> fog tartalmazni (${count1} + ${count2} kérdés), összpontszáma: <strong>${totalPoints} pont</strong>.<br>
        <span style="font-size: 0.82rem; color: #64748b; margin-top: 4px; display: inline-block;">
          Az eredeti tesztek (<em>„${escapeHtml(q1.title)}”</em> és <em>„${escapeHtml(q2.title)}”</em>) és az azokhoz tartozó képek változatlanok maradnak!
        </span>
      `;
    }
  }

  /**
   * Egyesítés végrehajtása
   */
  async function submitMergeQuizzes() {
    const id1 = mergeQuizSource1.value ? Number(mergeQuizSource1.value) : null;
    const id2 = mergeQuizSource2.value ? Number(mergeQuizSource2.value) : null;
    const title = mergeQuizNewTitle.value.trim();
    const folderId = mergeQuizTargetFolder.value ? Number(mergeQuizTargetFolder.value) : null;
    const timeLimit = parseInt(mergeQuizTimeLimit.value, 10) || 0;

    if (!id1 || !id2) {
      showAdminAlert('⚠️ Hiányzó teszt', 'Kérlek, válaszd ki mindkét egyesítendő tesztet!');
      return;
    }

    if (id1 === id2) {
      showAdminAlert('⚠️ Azonos tesztek', 'Egy tesztet nem lehet önmagával egyesíteni! Válassz két különböző tesztet.');
      return;
    }

    if (!title) {
      showAdminAlert('⚠️ Hiányzó cím', 'Kérlek, add meg az új egyesített teszt nevét!');
      mergeQuizNewTitle.focus();
      return;
    }

    const q1 = allQuizzesForMerge.find(q => q.id === id1);
    const q2 = allQuizzesForMerge.find(q => q.id === id2);

    btnSubmitMergeQuizzes.disabled = true;
    btnSubmitMergeQuizzes.innerHTML = '<span class="material-symbols-outlined spin" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">sync</span> Egyesítés folyamatban...';

    try {
      const res = await fetch('/api/admin/quizzes/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quiz_id_1: id1,
          quiz_id_2: id2,
          title,
          folder_id: folderId,
          subject_id: q1 ? q1.subject_id : 1,
          subject_grade: (q1 && q1.subject_grade) || (q2 && q2.subject_grade) || '',
          default_time_limit_min: timeLimit
        })
      });

      const data = await res.json();
      if (res.ok && data.success && data.quiz) {
        closeModal('modal-merge-quizzes');
        showToast(`„${data.quiz.title}” sikeresen létrehozva ${data.quiz.questions ? data.quiz.questions.length : ''} kérdéssel!`, 'success');
        await loadQuizzes(currentFolderId);
        openQuizEditor(data.quiz.id);
      } else {
        showAdminAlert('⚠️ Egyesítési hiba', data.error || 'Nem sikerült az egyesítés!');
      }
    } catch (err) {
      showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba történt a tesztek egyesítésekor!');
    } finally {
      btnSubmitMergeQuizzes.disabled = false;
      btnSubmitMergeQuizzes.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">call_merge</span> Egyesített teszt létrehozása';
    }
  }

  /**
   * Célmappa választó legördülő mező feltöltése és ellenőrzése az áthelyezési modálban
   */
  async function loadMoveFolderOptions(selectedFolderId = null) {
    const targetSelect = document.getElementById('move-quiz-target-folder');
    if (!targetSelect) return;

    targetSelect.innerHTML = '<option value="">⏳ Mappák betöltése és ellenőrzése...</option>';

    try {
      const res = await fetch('/api/admin/quiz-folders?all=true');
      const allFolders = await res.json();

      targetSelect.innerHTML = '<option value="">📁 Főmappa (Gyökér)</option>';

      const folderMap = new Map();
      allFolders.forEach(f => folderMap.set(f.id, f));

      function getPath(f) {
        const parts = [f.name];
        let curr = f;
        const visited = new Set([curr.id]);
        while (curr.parent_id && folderMap.has(curr.parent_id)) {
          curr = folderMap.get(curr.parent_id);
          if (visited.has(curr.id)) break;
          visited.add(curr.id);
          parts.unshift(curr.name);
        }
        return parts.join(' / ');
      }

      const sortedFolders = allFolders.map(f => ({
        id: f.id,
        name: f.name,
        path: getPath(f)
      })).sort((a, b) => a.path.localeCompare(b.path, 'hu'));

      sortedFolders.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = `📁 ${f.path}`;
        if (selectedFolderId !== null && selectedFolderId !== undefined && Number(selectedFolderId) === f.id) {
          opt.selected = true;
        }
        targetSelect.appendChild(opt);
      });

      if (selectedFolderId === null || selectedFolderId === undefined || selectedFolderId === '') {
        targetSelect.value = '';
      }
    } catch (err) {
      console.error('Hiba a mappák lekérésekor az áthelyezési modálhoz:', err);
      targetSelect.innerHTML = '<option value="">📁 Főmappa (Gyökér)</option>';
    }
  }

  /**
   * Teszt áthelyezése a szerveren
   */
  async function moveQuiz(quizId, targetFolderId) {
    try {
      const res = await fetch(`/api/admin/quizzes/${quizId}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: targetFolderId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Teszt sikeresen áthelyezve!', 'success');
        await loadQuizzes(currentFolderId);
      } else {
        showAdminAlert('⚠️ Áthelyezési hiba', data.error || 'Hiba a teszt áthelyezésekor!');
      }
    } catch (err) {
      showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba a teszt áthelyezésekor!');
    }
  }

  /**
   * Mappa választó legördülő mező feltöltése a tesztszerkesztőben
   */
  async function loadFolderSelectOptions(selectedId = null) {
    if (!editQuizFolderId) return;
    try {
      const res = await fetch('/api/admin/quiz-folders?all=true');
      const allFolders = await res.json();

      editQuizFolderId.innerHTML = '<option value="">📁 Főmappa (Gyökér)</option>';

      const folderMap = new Map();
      allFolders.forEach(f => folderMap.set(f.id, f));

      function getPath(f) {
        const parts = [f.name];
        let curr = f;
        const visited = new Set([curr.id]);
        while (curr.parent_id && folderMap.has(curr.parent_id)) {
          curr = folderMap.get(curr.parent_id);
          if (visited.has(curr.id)) break;
          visited.add(curr.id);
          parts.unshift(curr.name);
        }
        return parts.join(' / ');
      }

      const sortedFolders = allFolders.map(f => ({
        id: f.id,
        name: f.name,
        path: getPath(f)
      })).sort((a, b) => a.path.localeCompare(b.path, 'hu'));

      sortedFolders.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = `📁 ${f.path}`;
        if (selectedId !== null && selectedId !== undefined && Number(selectedId) === f.id) {
          opt.selected = true;
        }
        editQuizFolderId.appendChild(opt);
      });

      if (selectedId === null || selectedId === undefined || selectedId === '') {
        editQuizFolderId.value = '';
      }
    } catch (err) {
      console.error('Hiba a mappák betöltésekor a választóba:', err);
    }
  }

  // Tesztszerkesztő megnyitása
  async function openQuizEditor(quizId = null) {
    quizEditorCard.style.display = 'block';
    quizEditorCard.scrollIntoView({ behavior: 'smooth' });

    if (!quizId) {
      // Új teszt
      editQuizId.value = '';
      editQuizTitle.value = '';
      editGradeLevel.value = '6';
      editTimeLimit.value = '10';
      editorQuestionsList.innerHTML = '';
      await loadFolderSelectOptions(currentFolderId);
      if (editQuizFolderId) {
        editQuizFolderId.value = (currentFolderId !== null && currentFolderId !== undefined) ? String(currentFolderId) : '';
      }
      addQuestionBlock(); // 1 üres kérdés alapból
      renumberQuestions();
      return;
    }

    // Meglévő teszt betöltése
    try {
      const res = await fetch(`/api/admin/quizzes/${quizId}`);
      const quiz = await res.json();

      editQuizId.value = quiz.id;
      editQuizTitle.value = quiz.title;
      editSubjectId.value = quiz.subject_id;
      editGradeLevel.value = quiz.subject_grade;
      editTimeLimit.value = quiz.default_time_limit_min;
      await loadFolderSelectOptions(quiz.folder_id);
      if (editQuizFolderId) {
        editQuizFolderId.value = (quiz.folder_id !== null && quiz.folder_id !== undefined) ? String(quiz.folder_id) : '';
      }

      editorQuestionsList.innerHTML = '';
      quiz.questions.forEach(q => {
        addQuestionBlock(q);
      });
      renumberQuestions();
    } catch (err) {
      console.error('Hiba a teszt betöltésekor:', err);
    }
  }

  if (btnMergeQuizzes) {
    btnMergeQuizzes.addEventListener('click', () => openMergeQuizzesModal(null));
  }
  if (btnSubmitMergeQuizzes) {
    btnSubmitMergeQuizzes.addEventListener('click', submitMergeQuizzes);
  }
  if (mergeQuizSource1) {
    mergeQuizSource1.addEventListener('change', updateMergeSummary);
  }
  if (mergeQuizSource2) {
    mergeQuizSource2.addEventListener('change', updateMergeSummary);
  }
  if (mergeQuizNewTitle) {
    mergeQuizNewTitle.addEventListener('input', () => {
      mergeQuizNewTitle.dataset.autoGenerated = 'false';
    });
  }

  btnNewQuiz.addEventListener('click', () => openQuizEditor(null));
  btnCloseEditor.addEventListener('click', () => {
    quizEditorCard.style.display = 'none';
  });

  // Tesztszerkesztő in-line beszúrás, modális választó és Drag & Drop állapotok
  const btnInsertTop = document.getElementById('btn-insert-top');
  const qInsertTopZone = document.getElementById('q-insert-top-zone');
  let draggedEditorItem = null;
  let isDraggingAny = false;
  let pendingInsertBeforeItem = null;

  /**
   * Kérdésszámok és beszúrózónák dinamikus újrasorszámozása
   */
  function renumberQuestions() {
    const items = editorQuestionsList.querySelectorAll('.q-editor-item');
    if (qInsertTopZone) {
      qInsertTopZone.style.display = items.length > 0 ? 'flex' : 'none';
    }
    items.forEach((item, idx) => {
      const numEl = item.querySelector('.q-card-number');
      if (numEl) numEl.textContent = `${idx + 1}. kérdés`;
    });
  }

  /**
   * Kérdéstípus-választó modális ablak megnyitása
   * @param {HTMLElement|null} targetItem - Az az elem, amely ELÉ be kell szúrni; ha null, a lista végére kerül
   */
  function openQuestionTypePicker(targetItem = null) {
    pendingInsertBeforeItem = targetItem;
    openModal('modal-qtype-picker');
  }

  // Modális típusválasztó kártyák eseménykezelői
  document.querySelectorAll('#modal-qtype-picker .qtype-picker-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const chosenType = btn.dataset.type || 'ABCD';
      closeModal('modal-qtype-picker');

      const target = pendingInsertBeforeItem;
      pendingInsertBeforeItem = null;

      const newBlock = addQuestionBlock({ question_type: chosenType }, target);
      renumberQuestions();

      if (newBlock) {
        const textInput = newBlock.querySelector('.q-text');
        if (textInput) textInput.focus();
        newBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  });

  // Felső Kérdés hozzáadása és Legelejére beszúrás gombok
  btnAddQuestion.addEventListener('click', () => openQuestionTypePicker(null));
  if (btnInsertTop) {
    btnInsertTop.addEventListener('click', () => {
      const firstItem = editorQuestionsList.querySelector('.q-editor-item');
      openQuestionTypePicker(firstItem);
    });
  }

  // Lista-szintű Drag & Drop kezelés (valós idejű átrendezés)
  editorQuestionsList.addEventListener('dragover', (e) => {
    if (!draggedEditorItem) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const targetItem = e.target.closest('.q-editor-item');
    if (!targetItem || targetItem === draggedEditorItem) return;

    const rect = targetItem.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (e.clientY < midpoint) {
      editorQuestionsList.insertBefore(draggedEditorItem, targetItem);
    } else {
      editorQuestionsList.insertBefore(draggedEditorItem, targetItem.nextElementSibling);
    }
  });

  editorQuestionsList.addEventListener('drop', (e) => {
    if (!draggedEditorItem) return;
    e.preventDefault();
    renumberQuestions();
  });

  /**
   * Kérdésblokk létrehozása és beillesztése a szerkesztőhöz
   * @param {Object|null} existing - Meglévő kérdés adatai
   * @param {HTMLElement|null} insertBeforeItem - Beszúrási célpont
   */
  function addQuestionBlock(existing = null, insertBeforeItem = null) {
    const item = document.createElement('div');
    item.className = 'q-editor-item';
    item.draggable = false;
    if (existing && existing.id) {
      item.dataset.questionId = existing.id;
    }

    const qType = existing ? existing.question_type : 'ABCD';
    const qText = existing ? existing.question_text : '';
    const qPoints = existing ? existing.points : 1.0;
    const qCorrect = existing ? String(existing.correct_answer || '').trim() : '';
    const qExpl = existing ? existing.explanation : '';
    const qOptions = existing && Array.isArray(existing.options) ? existing.options : ['', '', '', ''];
    const qImagePath = existing && existing.image_path ? existing.image_path : '';

    const defaultInstructionsMap = {
      'ABCD': 'Válaszd ki az egyetlen helyes megoldást!',
      'TF': 'Döntsd el, hogy az állítás igaz vagy hamis!',
      'SHORT': 'Írd be a helyes választ a szövegmezőbe!'
    };
    const qInstructions = existing
      ? (existing.instructions !== undefined && existing.instructions !== null ? existing.instructions : (defaultInstructionsMap[qType] || ''))
      : (defaultInstructionsMap[qType] || '');

    // Meglévő helyes válaszok feldolgozása SHORT esetén (szinonimák / alternatívák)
    let initialShortAnswers = [''];
    if (qType === 'SHORT' && qCorrect) {
      try {
        const parsed = JSON.parse(qCorrect);
        if (Array.isArray(parsed) && parsed.length > 0) {
          initialShortAnswers = parsed.map(s => String(s).trim()).filter(Boolean);
        } else {
          initialShortAnswers = [qCorrect];
        }
      } catch {
        if (qCorrect.includes('|')) {
          initialShortAnswers = qCorrect.split('|').map(s => s.trim()).filter(Boolean);
        } else if (qCorrect.includes(';')) {
          initialShortAnswers = qCorrect.split(';').map(s => s.trim()).filter(Boolean);
        } else {
          initialShortAnswers = [qCorrect];
        }
      }
    }
    if (initialShortAnswers.length === 0) initialShortAnswers = [''];

    // Meglévő helyes válasz indexének azonosítása ABCD esetén
    let correctOptionIndex = -1;
    if (qType === 'ABCD' && qCorrect) {
      const letterIndexMap = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
      if (letterIndexMap[qCorrect.toUpperCase()] !== undefined) {
        correctOptionIndex = letterIndexMap[qCorrect.toUpperCase()];
      } else {
        correctOptionIndex = qOptions.findIndex(opt => String(opt).trim().toLowerCase() === qCorrect.toLowerCase());
      }
    }

    // Meglévő helyes válasz azonosítása TF esetén
    let tfCorrectVal = '';
    if (qType === 'TF' && qCorrect) {
      const norm = qCorrect.toLowerCase();
      if (['igaz', 'true', '1', 't', 'i'].includes(norm)) tfCorrectVal = 'Igaz';
      else if (['hamis', 'false', '0', 'f', 'h'].includes(norm)) tfCorrectVal = 'Hamis';
    }

    item.innerHTML = `
      <div class="card q-editor-card">
        <div class="q-card-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="q-drag-handle" title="Húzd a kérdés átrendezéséhez">
              <span class="material-symbols-outlined">drag_indicator</span>
            </div>
            <h5 class="q-card-number">Kérdés</h5>
          </div>
          <button type="button" class="btn btn-secondary btn-remove-q" style="padding: 4px 8px; font-size: 0.8rem;">❌ Eltávolítás</button>
        </div>

        <div style="display: grid; grid-template-columns: 200px 100px 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label class="form-label">Típus:</label>
            <select class="form-control q-type-select">
              <option value="ABCD" ${qType === 'ABCD' ? 'selected' : ''}>Feleletválasztós (ABCD)</option>
              <option value="TF" ${qType === 'TF' ? 'selected' : ''}>Igaz / Hamis (TF)</option>
              <option value="SHORT" ${qType === 'SHORT' ? 'selected' : ''}>Rövid válasz (SHORT)</option>
            </select>
          </div>
          <div>
            <label class="form-label">Pont:</label>
            <input type="number" step="0.5" min="0.5" class="form-control q-points" value="${qPoints}">
          </div>
          <div>
            <label class="form-label" style="display: inline-flex; align-items: center; gap: 5px;">
              <span>Kérdés szövege:</span>
              <span class="material-symbols-outlined help-tooltip-icon" title="Kódrészlet, képlet vagy billentyűkombináció kiemeléséhez használd a visszahajló idézőjelet (backtick --> AltGr+9): \`kód\` (pl. \`=SZUM(A1:A10)\` vagy \`Ctrl+C\`).">help</span>
            </label>
            <input type="text" class="form-control q-text" value="${escapeHtml(qText)}" placeholder="pl. Melyik képlet számol összeget?">
          </div>
        </div>

        <!-- Instrukció és kép sáv (2 oszlopos ergonómikus elrendezés) -->
        <div class="q-instruction-image-row">
          <div class="q-instruction-col">
            <label class="form-label" style="font-size: 0.82rem; font-weight: 600; margin-bottom: 4px; display: inline-flex; align-items: center; gap: 4px;">
              <span>További instrukciók a kérdéshez:</span>
              <span class="material-symbols-outlined help-tooltip-icon" title="A kérdés alatt megjelenő segédszöveg a diák képernyőjén. Sortöréshez nyomj Entert, kódformázáshoz használj \`kód\` visszahajló idézőjelet.">help</span>
            </label>
            <textarea class="form-control q-instructions" rows="2" placeholder="pl. Írd le egy szóval, kisbetűs írással, toldalékolás nélkül a megoldást!">${escapeHtml(qInstructions)}</textarea>
          </div>

          <div class="q-image-section">
            <input type="hidden" class="q-image-path" value="${escapeHtml(qImagePath)}">
            <input type="file" class="q-image-file-input" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" style="display: none;">

            <div class="q-image-empty-zone" style="${qImagePath ? 'display: none;' : 'display: flex;'}">
              <button type="button" class="btn btn-secondary q-btn-attach-image" style="font-size: 0.85rem; padding: 6px 14px; gap: 6px;">
                <span class="material-symbols-outlined" style="font-size: 18px;">add_photo_alternate</span>
                <span>Kép / ábra csatolása</span>
              </button>
              <span class="q-image-hint" style="font-size: 0.8rem; color: var(--text-muted); margin-left: 8px;">
                (opcionális, max. 2 MB)
              </span>
            </div>

            <div class="q-image-preview-zone" style="${qImagePath ? 'display: flex;' : 'display: none;'}">
              <div class="q-image-preview-thumb-wrap">
                <img src="${escapeHtml(qImagePath)}" alt="Kérdéshez csatolt ábra" class="q-image-preview-thumb">
              </div>
              <div class="q-image-preview-info">
                <span class="q-image-preview-name">${qImagePath ? escapeHtml(qImagePath.split('/').pop()) : ''}</span>
                <div class="q-image-preview-actions">
                  <button type="button" class="btn btn-secondary q-btn-change-image" style="padding: 4px 10px; font-size: 0.8rem;">
                    <span class="material-symbols-outlined" style="font-size: 16px;">cached</span>
                    <span>Csere</span>
                  </button>
                  <button type="button" class="btn btn-secondary q-btn-remove-image" style="padding: 4px 10px; font-size: 0.8rem; color: var(--danger);">
                    <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
                    <span>Törlés</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 1. Válaszlehetőségek szerkesztése ABCD esetén (Számozott gombokra kattintva kizöldül a helyes) -->
        <div class="q-options-box" style="${qType === 'ABCD' ? '' : 'display:none;'} margin-bottom: 12px;">
          <label class="form-label" style="display: flex; align-items: center; justify-content: space-between;">
            <span>A helyes válasz megadásához kattints a kérdés számára!</span>
            <span style="font-size: 0.82rem; font-weight: normal; color: var(--text-muted);">🟢 1 kötelezően kijelölendő</span>
          </label>
          <div class="q-opt-grid">
            ${[0, 1, 2, 3].map(i => `
              <div class="q-opt-row ${correctOptionIndex === i ? 'is-correct' : ''}">
                <button type="button" class="q-opt-correct-toggle ${correctOptionIndex === i ? 'is-correct' : ''}" data-opt-index="${i}" title="Kattints ide a helyes válasz kizöldítéséhez!">
                  <span class="q-opt-num">${i + 1}</span>
                  <span class="material-symbols-outlined q-opt-check">check</span>
                </button>
                <input type="text" class="form-control q-opt-input q-opt-${i}" placeholder="${i + 1}. válaszlehetőség" value="${escapeHtml(qOptions[i] || '')}">
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 2. Igaz / Hamis (TF) esetén kizöldíthető gombok -->
        <div class="q-tf-box" style="${qType === 'TF' ? '' : 'display:none;'} margin-bottom: 12px;">
          <label class="form-label">A helyes állítás megadásához kattints az állításra!</label>
          <div class="q-tf-select-wrap">
            <button type="button" class="btn-tf-pick ${tfCorrectVal === 'Igaz' ? 'is-correct' : ''}" data-value="Igaz">
              <span class="material-symbols-outlined tf-pick-icon">check_circle</span>
              <span>IGAZ</span>
            </button>
            <button type="button" class="btn-tf-pick ${tfCorrectVal === 'Hamis' ? 'is-correct' : ''}" data-value="Hamis">
              <span class="material-symbols-outlined tf-pick-icon">check_circle</span>
              <span>HAMIS</span>
            </button>
          </div>
        </div>

        <!-- 3. Rövid válasz (SHORT) esetén elfogadott válaszok (szinonimák) -->
        <div class="q-short-box" style="${qType === 'SHORT' ? '' : 'display:none;'} margin-bottom: 12px;">
          <label class="form-label" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span>Elfogadott helyes válasz(ok) – szinonimák, alternatív írásmódok:</span>
            <span style="font-size: 0.82rem; font-weight: normal; color: var(--text-muted);">Bármelyik megadott változatért jár a pont</span>
          </label>
          <div class="q-short-answers-container" style="display: flex; flex-direction: column; gap: 8px;">
            ${initialShortAnswers.map((ans, idx) => `
              <div class="q-short-answer-row" style="display: flex; gap: 8px; align-items: center;">
                <span class="q-short-answer-num" style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted); min-width: 24px;">${idx + 1}.</span>
                <input type="text" class="form-control q-short-input-val" value="${escapeHtml(ans)}" placeholder="pl. ${idx === 0 ? 'fő megoldás (pl. Internet Protocol)' : 'szinonima / alternatíva (pl. IP)'}" style="flex: 1;">
                <button type="button" class="btn btn-secondary btn-remove-short-ans" title="Alternatíva törlése" style="padding: 6px 10px; font-size: 0.85rem; ${initialShortAnswers.length > 1 ? '' : 'display: none;'}">
                  <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">close</span>
                </button>
              </div>
            `).join('')}
          </div>
          <div style="margin-top: 8px;">
            <button type="button" class="btn btn-secondary btn-add-short-ans" style="padding: 5px 12px; font-size: 0.84rem;">
              <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">add</span>
              <span>További elfogadott válasz (szinonima) hozzáadása</span>
            </button>
          </div>
        </div>

        <!-- Magyarázat sor (elrejtve, szükség esetén a display: none eltávolításával azonnal felfedhető) -->
        <div style="display: none; margin-top: 10px;">
          <label class="form-label">Magyarázat (opcionális tanári indoklás a diák visszajelzéséhez):</label>
          <input type="text" class="form-control q-explanation" value="${escapeHtml(qExpl)}" placeholder="A megoldás magyarázata a diák képernyőjén megjelenő visszajelzéshez...">
        </div>
      </div>

      <!-- In-line lebegő kérdésbeszúró sáv közvetlenül a kérdés alatt -->
      <div class="q-insert-divider">
        <div class="q-insert-line"></div>
        <button type="button" class="q-insert-btn" title="Új kérdés beszúrása ide">
          <span class="material-symbols-outlined">add</span>
          <span class="q-insert-btn-label">Kérdés beszúrása</span>
        </button>
        <div class="q-insert-line"></div>
      </div>
    `;

    // Típusváltás figyelése
    const typeSelect = item.querySelector('.q-type-select');
    const optBox = item.querySelector('.q-options-box');
    const tfBox = item.querySelector('.q-tf-box');
    const shortBox = item.querySelector('.q-short-box');
    const instructionsTextarea = item.querySelector('.q-instructions');

    typeSelect.addEventListener('change', () => {
      const newType = typeSelect.value;
      optBox.style.display = newType === 'ABCD' ? 'block' : 'none';
      tfBox.style.display = newType === 'TF' ? 'block' : 'none';
      shortBox.style.display = newType === 'SHORT' ? 'block' : 'none';

      if (instructionsTextarea) {
        const currentVal = instructionsTextarea.value.trim();
        const defaultVals = Object.values(defaultInstructionsMap);
        if (!currentVal || defaultVals.includes(currentVal)) {
          instructionsTextarea.value = defaultInstructionsMap[newType] || '';
        }
      }
    });

    // ABCD opciók kizöldítése számozott gombra kattintva
    const optRows = item.querySelectorAll('.q-opt-row');
    const optToggles = item.querySelectorAll('.q-opt-correct-toggle');
    optToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        const isAlreadyCorrect = toggle.classList.contains('is-correct');
        optRows.forEach(r => r.classList.remove('is-correct'));
        optToggles.forEach(t => t.classList.remove('is-correct'));
        if (!isAlreadyCorrect) {
          toggle.classList.add('is-correct');
          toggle.closest('.q-opt-row').classList.add('is-correct');
        }
      });
    });

    // TF gombok kizöldítése kattintásra
    const tfButtons = item.querySelectorAll('.btn-tf-pick');
    tfButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const isAlreadyCorrect = btn.classList.contains('is-correct');
        tfButtons.forEach(b => b.classList.remove('is-correct'));
        if (!isAlreadyCorrect) {
          btn.classList.add('is-correct');
        }
      });
    });

    // Rövid válasz (SHORT) alternatívák dinamikus kezelése
    const shortContainer = item.querySelector('.q-short-answers-container');
    const btnAddShort = item.querySelector('.btn-add-short-ans');

    function refreshShortAnswerRows() {
      if (!shortContainer) return;
      const rows = shortContainer.querySelectorAll('.q-short-answer-row');
      rows.forEach((row, idx) => {
        const numSpan = row.querySelector('.q-short-answer-num');
        if (numSpan) numSpan.textContent = `${idx + 1}.`;
        const btnDel = row.querySelector('.btn-remove-short-ans');
        if (btnDel) {
          btnDel.style.display = rows.length > 1 ? 'inline-flex' : 'none';
        }
      });
    }

    if (btnAddShort && shortContainer) {
      btnAddShort.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'q-short-answer-row';
        row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
        row.innerHTML = `
          <span class="q-short-answer-num" style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted); min-width: 24px;"></span>
          <input type="text" class="form-control q-short-input-val" placeholder="szinonima / alternatíva..." style="flex: 1;">
          <button type="button" class="btn btn-secondary btn-remove-short-ans" title="Alternatíva törlése" style="padding: 6px 10px; font-size: 0.85rem;">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">close</span>
          </button>
        `;
        const btnDel = row.querySelector('.btn-remove-short-ans');
        btnDel.addEventListener('click', () => {
          row.remove();
          refreshShortAnswerRows();
        });
        shortContainer.appendChild(row);
        refreshShortAnswerRows();
        const input = row.querySelector('input');
        if (input) input.focus();
      });

      shortContainer.querySelectorAll('.btn-remove-short-ans').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const row = e.target.closest('.q-short-answer-row');
          if (row) {
            row.remove();
            refreshShortAnswerRows();
          }
        });
      });
    }

    // Eltávolítás
    item.querySelector('.btn-remove-q').addEventListener('click', () => {
      item.remove();
      renumberQuestions();
    });

    // Képcsatolás eseménykezelői
    const imgPathInput = item.querySelector('.q-image-path');
    const fileInput = item.querySelector('.q-image-file-input');
    const emptyZone = item.querySelector('.q-image-empty-zone');
    const previewZone = item.querySelector('.q-image-preview-zone');
    const previewThumb = item.querySelector('.q-image-preview-thumb');
    const previewName = item.querySelector('.q-image-preview-name');
    const attachBtn = item.querySelector('.q-btn-attach-image');
    const changeBtn = item.querySelector('.q-btn-change-image');
    const removeBtn = item.querySelector('.q-btn-remove-image');

    const triggerFilePick = () => fileInput.click();
    attachBtn.addEventListener('click', triggerFilePick);
    changeBtn.addEventListener('click', triggerFilePick);

    removeBtn.addEventListener('click', () => {
      imgPathInput.value = '';
      previewThumb.src = '';
      previewName.textContent = '';
      previewZone.style.display = 'none';
      emptyZone.style.display = 'flex';
      fileInput.value = '';
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        showAdminAlert('⚠️ Túl nagy fájl', 'A kiválasztott kép mérete meghaladja az engedélyezett 5 MB-ot!');
        fileInput.value = '';
        return;
      }

      const formData = new FormData();
      formData.append('image', file);

      const currentQuizId = editQuizId ? editQuizId.value.trim() : '';
      const uploadUrl = currentQuizId
        ? `/api/admin/upload-image?quizId=${encodeURIComponent(currentQuizId)}`
        : '/api/admin/upload-image';

      attachBtn.disabled = true;
      changeBtn.disabled = true;

      try {
        const resp = await fetch(uploadUrl, {
          method: 'POST',
          body: formData
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
          throw new Error(data.error || 'A kép feltöltése sikertelen!');
        }

        imgPathInput.value = data.imagePath;
        previewThumb.src = data.imagePath;
        previewName.textContent = data.imagePath.split('/').pop();
        emptyZone.style.display = 'none';
        previewZone.style.display = 'flex';
      } catch (err) {
        showAdminAlert('❌ Feltöltési hiba', err.message);
      } finally {
        attachBtn.disabled = false;
        changeBtn.disabled = false;
        fileInput.value = '';
      }
    });

    // In-line beszúró gomb (ez az elem mögé = a következő elé szúr be)
    item.querySelector('.q-insert-btn').addEventListener('click', () => {
      openQuestionTypePicker(item.nextElementSibling);
    });

    // Drag Handle aktiválás
    const dragHandle = item.querySelector('.q-drag-handle');
    dragHandle.addEventListener('mouseenter', () => {
      if (!isDraggingAny) item.draggable = true;
    });
    dragHandle.addEventListener('mouseleave', () => {
      if (!isDraggingAny) item.draggable = false;
    });
    dragHandle.addEventListener('mousedown', () => {
      item.draggable = true;
    });

    // Item szintű Drag események
    item.addEventListener('dragstart', (e) => {
      isDraggingAny = true;
      draggedEditorItem = item;
      item.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    });

    item.addEventListener('dragend', () => {
      isDraggingAny = false;
      item.draggable = false;
      item.classList.remove('is-dragging');
      draggedEditorItem = null;
      renumberQuestions();
    });

    // Beillesztés a listába a megadott helyre
    if (insertBeforeItem && insertBeforeItem.parentNode === editorQuestionsList) {
      editorQuestionsList.insertBefore(item, insertBeforeItem);
    } else {
      editorQuestionsList.appendChild(item);
    }

    return item;
  }

  // Teszt mentése validációval
  btnSaveQuiz.addEventListener('click', async () => {
    const title = editQuizTitle.value.trim();
    if (!title) {
      showAdminAlert('⚠️ Hiányzó cím', 'A feladatsor címének megadása kötelező!');
      return;
    }

    const quizId = editQuizId.value;
    const questions = [];

    const items = editorQuestionsList.querySelectorAll('.q-editor-item');
    if (items.length === 0) {
      showAdminAlert('⚠️ Nincsenek kérdések', 'A feladatsorban legalább 1 kérdésnek szerepelnie kell!');
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      const qNum = i + 1;
      const type = b.querySelector('.q-type-select').value;
      const text = b.querySelector('.q-text').value.trim();
      const points = parseFloat(b.querySelector('.q-points').value) || 1.0;
      const explanation = b.querySelector('.q-explanation').value.trim();

      if (!text) {
        showAdminAlert('⚠️ Hiányzó kérdésszöveg', `A(z) ${qNum}. kérdés szövegének megadása kötelező!`);
        return;
      }

      let correct = '';
      let options = [];

      if (type === 'ABCD') {
        const selectedToggle = b.querySelector('.q-opt-correct-toggle.is-correct');
        if (!selectedToggle) {
          showAdminAlert('⚠️ Helyes válasz nincs kijelölve', `A(z) ${qNum}. feleletválasztós kérdésnél nem jelölted meg a helyes választ!\n\nKérlek, kattints a helyes válasz számozott körére (1–4).`);
          return;
        }

        const selIdx = parseInt(selectedToggle.dataset.optIndex, 10);
        const selInput = b.querySelector(`.q-opt-${selIdx}`);
        const correctVal = selInput ? selInput.value.trim() : '';

        if (!correctVal) {
          showAdminAlert('⚠️ Üres a helyes válasz', `A(z) ${qNum}. kérdésnél a helyesnek jelölt (${selIdx + 1}.) válaszlehetőség szövege nem lehet üres!`);
          return;
        }

        const opt0 = b.querySelector('.q-opt-0').value.trim();
        const opt1 = b.querySelector('.q-opt-1').value.trim();
        const opt2 = b.querySelector('.q-opt-2').value.trim();
        const opt3 = b.querySelector('.q-opt-3').value.trim();
        const filledOpts = [opt0, opt1, opt2, opt3].filter(Boolean);

        if (filledOpts.length < 2) {
          showAdminAlert('⚠️ Kevés válaszlehetőség', `A(z) ${qNum}. feleletválasztós kérdésnél legalább 2 válaszlehetőség kitöltése kötelező!`);
          return;
        }

        options = [opt0, opt1, opt2, opt3].filter(Boolean);
        correct = correctVal;

      } else if (type === 'TF') {
        const selectedTf = b.querySelector('.btn-tf-pick.is-correct');
        if (!selectedTf) {
          showAdminAlert('⚠️ Helyes válasz nincs kijelölve', `A(z) ${qNum}. Igaz / Hamis kérdésnél nem választottad ki a helyes állítást!\n\nKérlek, kattints az IGAZ vagy a HAMIS gombra a kizöldítéshez.`);
          return;
        }
        correct = selectedTf.dataset.value;
        options = ['Igaz', 'Hamis'];

      } else if (type === 'SHORT') {
        const shortInputs = b.querySelectorAll('.q-short-input-val');
        const shortValues = Array.from(shortInputs).map(inp => inp.value.trim()).filter(Boolean);
        if (shortValues.length === 0) {
          showAdminAlert('⚠️ Helyes válasz hiányzik', `A(z) ${qNum}. rövid válaszos kérdésnél legalább 1 elfogadott helyes válasz megadása kötelező!`);
          return;
        }
        correct = (shortValues.length === 1) ? shortValues[0] : JSON.stringify(shortValues);
        options = [];
      }

      const imagePathInput = b.querySelector('.q-image-path');
      const image_path = imagePathInput && imagePathInput.value.trim() ? imagePathInput.value.trim() : null;

      const instructionsInput = b.querySelector('.q-instructions');
      const instructions = instructionsInput ? instructionsInput.value.trim() : '';

      const qId = b.dataset.questionId ? parseInt(b.dataset.questionId, 10) : undefined;
      questions.push({
        id: qId,
        question_order: qNum,
        question_type: type,
        question_text: text,
        instructions,
        image_path,
        points,
        options,
        correct_answer: correct,
        explanation
      });
    }

    const payload = {
      subject_id: parseInt(editSubjectId.value, 10),
      folder_id: (editQuizFolderId && editQuizFolderId.value) ? parseInt(editQuizFolderId.value, 10) : null,
      title,
      subject_grade: editGradeLevel.value.trim(),
      default_time_limit_min: parseInt(editTimeLimit.value, 10) || 0,
      questions
    };

    try {
      const url = quizId ? `/api/admin/quizzes/${quizId}` : '/api/admin/quizzes';
      const method = quizId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast('Teszt sikeresen elmentve!', 'success');
        quizEditorCard.style.display = 'none';
        await loadQuizzes(currentFolderId);
      } else {
        showAdminAlert('⚠️ Mentési hiba', data.error || 'Hiba a mentés során!');
      }
    } catch (err) {
      showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba a mentéskor!');
    }
  });

  /**
   * Osztálynévsorok Kezelése
   */
  function renderRosterColumns(names) {
    if (!rosterColumnsView) return;
    if (!names || names.length === 0) {
      rosterColumnsView.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 32px 16px; color: var(--text-muted); background-color: var(--surface-low); border-radius: 12px; border: 1px dashed var(--border-color);">
          <span class="material-symbols-outlined" style="font-size: 32px; color: #94a3b8; display: block; margin-bottom: 6px;">person_off</span>
          <strong>Még nincsenek tanulók ebben az osztályban.</strong>
          <p style="margin: 4px 0 0 0; font-size: 0.85rem;">Kattints a fenti „Szöveges szerkesztés” gombra a nevek beillesztéséhez!</p>
        </div>
      `;
      return;
    }

    rosterColumnsView.innerHTML = names.map((name, idx) => `
      <div class="roster-student-item">
        <span class="roster-student-num">${String(idx + 1).padStart(2, '0')}.</span>
        <span class="roster-student-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      </div>
    `).join('');
  }

  async function loadRosterClasses() {
    try {
      const res = await fetch('/api/classes');
      const classes = await res.json();
      adminRosterClassList.innerHTML = '';

      if (rosterClassCountBadge) {
        rosterClassCountBadge.textContent = `${classes.length} osztály`;
      }

      if (classes.length === 0) {
        adminRosterClassList.innerHTML = `<span style="color: var(--text-muted); font-size: 0.9rem;">Még nincs rögzített osztály. Kattints az „Új osztály rögzítése” vagy az „Import” gombra!</span>`;
        if (rosterEditorBox) rosterEditorBox.style.display = 'none';
        return;
      }

      let lastGrade = null;
      classes.forEach((cls) => {
        const gradeMatch = String(cls).match(/^(\d+)/);
        const curGrade = gradeMatch ? gradeMatch[1] : null;

        // Évfolyamok közötti diszkrét elválasztó
        if (lastGrade !== null && curGrade !== null && curGrade !== lastGrade) {
          const sep = document.createElement('span');
          sep.className = 'roster-grade-separator';
          adminRosterClassList.appendChild(sep);
        }
        lastGrade = curGrade;

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `roster-class-chip ${cls === selectedRosterClass ? 'selected' : ''}`;
        chip.textContent = `${cls} osztály`;

        chip.addEventListener('click', () => {
          document.querySelectorAll('.roster-class-chip').forEach(b => b.classList.remove('selected'));
          chip.classList.add('selected');
          selectRosterClass(cls);
        });

        adminRosterClassList.appendChild(chip);
      });

      // Ha még nincs kiválasztott osztály vagy a korábbi már nem létezik, automatikusan nyissuk meg az elsőt!
      if (!selectedRosterClass || !classes.includes(selectedRosterClass)) {
        selectedRosterClass = classes[0];
        const firstChip = adminRosterClassList.querySelector('.roster-class-chip');
        if (firstChip) firstChip.classList.add('selected');
        await selectRosterClass(selectedRosterClass);
      } else {
        await selectRosterClass(selectedRosterClass);
      }
    } catch (err) {
      console.error('Hiba az osztályok betöltésekor:', err);
    }
  }

  async function selectRosterClass(className) {
    selectedRosterClass = className;
    if (rosterClassTitle) rosterClassTitle.textContent = `${className} osztály névsora`;
    if (rosterEditorBox) rosterEditorBox.style.display = 'block';

    // Alapértelmezetten a rendezett, számozott nézet jelenik meg
    isRosterRawEditMode = false;
    if (rosterColumnsView) rosterColumnsView.style.display = 'grid';
    if (rosterRawEditView) rosterRawEditView.style.display = 'none';
    if (btnSaveRoster) btnSaveRoster.style.display = 'none';
    if (btnToggleRosterModeText) btnToggleRosterModeText.textContent = 'Szöveges szerkesztés';
    if (btnToggleRosterMode) {
      const icon = btnToggleRosterMode.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = 'edit_note';
    }

    try {
      const res = await fetch(`/api/classes/${encodeURIComponent(className)}/students`);
      const students = await res.json();
      const names = students.map(s => s.student_name);

      if (rosterStudentCountPill) {
        rosterStudentCountPill.textContent = `${names.length} tanuló`;
      }
      if (rosterNamesTextarea) {
        rosterNamesTextarea.value = names.join('\n');
      }

      renderRosterColumns(names);
    } catch (err) {
      console.error('Hiba a diákok betöltésekor:', err);
    }
  }

  // Váltás a számozott áttekintés és a KRÉTA szöveges szerkesztő között
  if (btnToggleRosterMode) {
    btnToggleRosterMode.addEventListener('click', () => {
      isRosterRawEditMode = !isRosterRawEditMode;
      if (isRosterRawEditMode) {
        if (rosterColumnsView) rosterColumnsView.style.display = 'none';
        if (rosterRawEditView) rosterRawEditView.style.display = 'block';
        if (btnSaveRoster) btnSaveRoster.style.display = 'inline-flex';
        if (btnToggleRosterModeText) btnToggleRosterModeText.textContent = 'Számozott áttekintés';
        const icon = btnToggleRosterMode.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = 'format_list_numbered';
        if (rosterNamesTextarea) rosterNamesTextarea.focus();
      } else {
        const raw = rosterNamesTextarea ? rosterNamesTextarea.value : '';
        const names = raw.split('\n').map(n => n.trim()).filter(Boolean);
        renderRosterColumns(names);
        if (rosterStudentCountPill) {
          rosterStudentCountPill.textContent = `${names.length} tanuló`;
        }
        if (rosterColumnsView) rosterColumnsView.style.display = 'grid';
        if (rosterRawEditView) rosterRawEditView.style.display = 'none';
        if (btnSaveRoster) btnSaveRoster.style.display = 'none';
        if (btnToggleRosterModeText) btnToggleRosterModeText.textContent = 'Szöveges szerkesztés';
        const icon = btnToggleRosterMode.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = 'edit_note';
      }
    });
  }

  // Névsor mentése
  btnSaveRoster.addEventListener('click', async () => {
    if (!selectedRosterClass) return;

    const raw = rosterNamesTextarea.value;
    const names = raw.split('\n').map(n => n.trim()).filter(Boolean);

    try {
      const res = await fetch(`/api/admin/classes/${encodeURIComponent(selectedRosterClass)}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: names })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Névsor sikeresen elmentve!', 'success');
        if (rosterStudentCountPill) {
          rosterStudentCountPill.textContent = `${names.length} tanuló`;
        }
        renderRosterColumns(names);
        // Visszaváltás számozott nézetre
        isRosterRawEditMode = false;
        if (rosterColumnsView) rosterColumnsView.style.display = 'grid';
        if (rosterRawEditView) rosterRawEditView.style.display = 'none';
        if (btnSaveRoster) btnSaveRoster.style.display = 'none';
        if (btnToggleRosterModeText) btnToggleRosterModeText.textContent = 'Szöveges szerkesztés';
        const icon = btnToggleRosterMode ? btnToggleRosterMode.querySelector('.material-symbols-outlined') : null;
        if (icon) icon.textContent = 'edit_note';
      } else {
        showAdminAlert('⚠️ Névsorhiba', data.error || 'Hiba a névsor mentésekor!');
      }
    } catch (err) {
      showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba a névsor mentése során!');
    }
  });

  // Új osztály hozzáadása
  btnNewClass.addEventListener('click', () => {
    const name = prompt('Add meg az új osztály nevét (pl. 5.b):');
    if (!name || !name.trim()) return;

    selectedRosterClass = name.trim();
    if (rosterClassTitle) rosterClassTitle.textContent = `${selectedRosterClass} osztály névsora`;
    if (rosterNamesTextarea) rosterNamesTextarea.value = '';
    if (rosterStudentCountPill) rosterStudentCountPill.textContent = '0 tanuló';
    if (rosterEditorBox) rosterEditorBox.style.display = 'block';

    // Új osztály esetén rögtön a szerkesztő nyílik meg
    isRosterRawEditMode = true;
    if (rosterColumnsView) rosterColumnsView.style.display = 'none';
    if (rosterRawEditView) rosterRawEditView.style.display = 'block';
    if (btnSaveRoster) btnSaveRoster.style.display = 'inline-flex';
    if (btnToggleRosterModeText) btnToggleRosterModeText.textContent = 'Számozott áttekintés';
    const icon = btnToggleRosterMode ? btnToggleRosterMode.querySelector('.material-symbols-outlined') : null;
    if (icon) icon.textContent = 'format_list_numbered';
    if (rosterNamesTextarea) rosterNamesTextarea.focus();
  });

  // Osztály törlése modal megnyitása
  btnDeleteClass.addEventListener('click', () => {
    if (!selectedRosterClass) return;
    const deleteClassNameEl = document.getElementById('delete-class-name');
    if (deleteClassNameEl) {
      deleteClassNameEl.textContent = selectedRosterClass;
    }
    openModal('modal-confirm-delete-class');
  });

  // Osztály törlése megerősítése
  const btnSubmitDeleteClass = document.getElementById('btn-submit-delete-class');
  if (btnSubmitDeleteClass) {
    btnSubmitDeleteClass.addEventListener('click', async () => {
      closeModal('modal-confirm-delete-class');
      if (!selectedRosterClass) return;

      try {
        const res = await fetch(`/api/admin/classes/${encodeURIComponent(selectedRosterClass)}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Osztály sikeresen törölve!', 'success');
          rosterEditorBox.style.display = 'none';
          selectedRosterClass = null;
          await loadRosterClasses();
        } else {
          const err = await res.json();
          showAdminAlert('⚠️ Törlési hiba', err.error || 'Hiba az osztály törlésekor!');
        }
      } catch (err) {
        console.error('Hiba az osztály törlésekor:', err);
        showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba a törléskor!');
      }
    });
  }

  // Hivatalos Osztálynévsorok Exportálása (.xlsx letöltése)
  const btnExportRoster = document.getElementById('btn-export-roster');
  if (btnExportRoster) {
    btnExportRoster.addEventListener('click', () => {
      window.location.href = '/api/admin/roster/export';
    });
  }

  // Hivatalos Osztálynévsorok Importálása (.xlsx / .csv feltöltése)
  const btnImportRoster = document.getElementById('btn-import-roster');
  const modalImportRoster = document.getElementById('modal-import-roster');
  const rosterDropzone = document.getElementById('roster-dropzone');
  const inputRosterFile = document.getElementById('input-roster-file');
  const rosterSelectedFileInfo = document.getElementById('roster-selected-file-info');
  const rosterSelectedFileName = document.getElementById('roster-selected-file-name');
  const btnSubmitImportRoster = document.getElementById('btn-submit-import-roster');
  const rosterImportStatus = document.getElementById('roster-import-status');
  let selectedRosterFile = null;

  function resetRosterImportModal() {
    selectedRosterFile = null;
    if (inputRosterFile) inputRosterFile.value = '';
    if (rosterSelectedFileInfo) rosterSelectedFileInfo.style.display = 'none';
    if (rosterSelectedFileName) rosterSelectedFileName.textContent = '';
    if (rosterImportStatus) {
      rosterImportStatus.style.display = 'none';
      rosterImportStatus.textContent = '';
    }
    if (btnSubmitImportRoster) {
      btnSubmitImportRoster.disabled = true;
      btnSubmitImportRoster.innerHTML = '<span class="material-symbols-outlined" style="font-size: 19px;">upload</span><span>Névsorok importálása</span>';
    }
  }

  function handleRosterFileSelect(file) {
    if (!file) return;
    selectedRosterFile = file;
    if (rosterSelectedFileName) {
      const sizeKb = (file.size / 1024).toFixed(1);
      rosterSelectedFileName.textContent = `${file.name} (${sizeKb} KB)`;
    }
    if (rosterSelectedFileInfo) rosterSelectedFileInfo.style.display = 'block';
    if (rosterImportStatus) rosterImportStatus.style.display = 'none';
    if (btnSubmitImportRoster) btnSubmitImportRoster.disabled = false;
  }

  if (btnImportRoster) {
    btnImportRoster.addEventListener('click', () => {
      resetRosterImportModal();
      openModal('modal-import-roster');
    });
  }

  if (rosterDropzone && inputRosterFile) {
    rosterDropzone.addEventListener('click', () => {
      inputRosterFile.click();
    });

    inputRosterFile.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleRosterFileSelect(e.target.files[0]);
      }
    });

    rosterDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      rosterDropzone.style.borderColor = 'var(--primary, #ea580c)';
      rosterDropzone.style.backgroundColor = 'var(--primary-light, #fff7ed)';
    });

    rosterDropzone.addEventListener('dragleave', () => {
      rosterDropzone.style.borderColor = 'var(--border-color, #cbd5e1)';
      rosterDropzone.style.backgroundColor = '#ffffff';
    });

    rosterDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      rosterDropzone.style.borderColor = 'var(--border-color, #cbd5e1)';
      rosterDropzone.style.backgroundColor = '#ffffff';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleRosterFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  if (btnSubmitImportRoster) {
    btnSubmitImportRoster.addEventListener('click', async () => {
      if (!selectedRosterFile) return;

      btnSubmitImportRoster.disabled = true;
      btnSubmitImportRoster.innerHTML = '<span class="material-symbols-outlined" style="font-size: 19px; animation: spin 1s linear infinite;">sync</span><span>Importálás folyamatban...</span>';

      try {
        const formData = new FormData();
        formData.append('file', selectedRosterFile);

        const res = await fetch('/api/admin/roster/import', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        if (res.ok && data.success) {
          closeModal('modal-import-roster');
          showToast(`Sikeres importálás: ${data.classesCount} osztály, ${data.totalParsed} tanuló beolvasva! (${data.insertedCount} új)`, 'success');
          await loadRosterClasses();
        } else {
          btnSubmitImportRoster.disabled = false;
          btnSubmitImportRoster.innerHTML = '<span class="material-symbols-outlined" style="font-size: 19px;">upload</span><span>Névsorok importálása</span>';
          if (rosterImportStatus) {
            rosterImportStatus.style.display = 'block';
            rosterImportStatus.style.backgroundColor = 'var(--danger-bg, #fee2e2)';
            rosterImportStatus.style.color = 'var(--danger, #dc2626)';
            rosterImportStatus.textContent = data.error || 'Hiba történt a névsor importálása során!';
          }
        }
      } catch (err) {
        console.error('Import hiba:', err);
        btnSubmitImportRoster.disabled = false;
        btnSubmitImportRoster.innerHTML = '<span class="material-symbols-outlined" style="font-size: 19px;">upload</span><span>Névsorok importálása</span>';
        if (rosterImportStatus) {
          rosterImportStatus.style.display = 'block';
          rosterImportStatus.style.backgroundColor = 'var(--danger-bg, #fee2e2)';
          rosterImportStatus.style.color = 'var(--danger, #dc2626)';
          rosterImportStatus.textContent = 'Hálózati hiba a fájl feltöltése során!';
        }
      }
    });
  }

  // ==========================================================================
  // Socrative PDF Teszt Importálása Kezelő
  // ==========================================================================
  function resetQuizPdfImportModal() {
    selectedQuizPdfFile = null;
    if (inputQuizPdfFile) inputQuizPdfFile.value = '';
    if (quizPdfSelectedFileInfo) quizPdfSelectedFileInfo.style.display = 'none';
    if (quizPdfSelectedFileName) quizPdfSelectedFileName.textContent = '';
    if (quizPdfImportStatus) {
      quizPdfImportStatus.style.display = 'none';
      quizPdfImportStatus.textContent = '';
    }
    if (btnSubmitImportQuizPdf) {
      btnSubmitImportQuizPdf.disabled = true;
      btnSubmitImportQuizPdf.innerHTML = '<span class="material-symbols-outlined" style="font-size: 19px;">upload_file</span><span>Teszt importálása</span>';
    }
    if (importPdfGrade) importPdfGrade.value = '6';
  }

  function handleQuizPdfFileSelect(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      if (quizPdfImportStatus) {
        quizPdfImportStatus.style.display = 'block';
        quizPdfImportStatus.style.backgroundColor = 'var(--danger-bg, #fee2e2)';
        quizPdfImportStatus.style.color = 'var(--danger, #dc2626)';
        quizPdfImportStatus.textContent = 'Kizárólag PDF (.pdf) kiterjesztésű fájl tölthető fel!';
      }
      return;
    }
    selectedQuizPdfFile = file;
    if (quizPdfSelectedFileName) {
      const sizeKb = (file.size / 1024).toFixed(1);
      quizPdfSelectedFileName.textContent = `${file.name} (${sizeKb} KB)`;
    }
    if (quizPdfSelectedFileInfo) quizPdfSelectedFileInfo.style.display = 'block';
    if (quizPdfImportStatus) quizPdfImportStatus.style.display = 'none';
    if (btnSubmitImportQuizPdf) btnSubmitImportQuizPdf.disabled = false;
  }

  if (btnImportQuizPdf) {
    btnImportQuizPdf.addEventListener('click', () => {
      resetQuizPdfImportModal();
      openModal('modal-import-quiz-pdf');
    });
  }

  if (quizPdfDropzone && inputQuizPdfFile) {
    quizPdfDropzone.addEventListener('click', () => {
      inputQuizPdfFile.click();
    });

    inputQuizPdfFile.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleQuizPdfFileSelect(e.target.files[0]);
      }
    });

    quizPdfDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      quizPdfDropzone.style.borderColor = 'var(--primary, #ea580c)';
      quizPdfDropzone.style.backgroundColor = 'var(--primary-light, #fff7ed)';
    });

    quizPdfDropzone.addEventListener('dragleave', () => {
      quizPdfDropzone.style.borderColor = 'var(--border-color, #cbd5e1)';
      quizPdfDropzone.style.backgroundColor = '#ffffff';
    });

    quizPdfDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      quizPdfDropzone.style.borderColor = 'var(--border-color, #cbd5e1)';
      quizPdfDropzone.style.backgroundColor = '#ffffff';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleQuizPdfFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  if (btnSubmitImportQuizPdf) {
    btnSubmitImportQuizPdf.addEventListener('click', async () => {
      if (!selectedQuizPdfFile) return;

      btnSubmitImportQuizPdf.disabled = true;
      btnSubmitImportQuizPdf.innerHTML = '<span class="material-symbols-outlined" style="font-size: 19px; animation: spin 1s linear infinite;">sync</span><span>Importálás folyamatban...</span>';

      try {
        const formData = new FormData();
        formData.append('pdfFile', selectedQuizPdfFile);
        if (importPdfSubjectId) formData.append('subjectId', importPdfSubjectId.value);
        if (importPdfGrade) formData.append('gradeLevel', importPdfGrade.value);
        if (currentFolderId !== null && currentFolderId !== undefined) {
          formData.append('folderId', currentFolderId);
        }

        const res = await fetch('/api/admin/quizzes/import-socrative-pdf', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        if (res.ok && data.success && data.quiz) {
          closeModal('modal-import-quiz-pdf');
          showToast(data.message || 'Sikeres PDF importálás!', 'success');
          await loadQuizzes(currentFolderId);
          await openQuizEditor(data.quiz.id);
        } else {
          btnSubmitImportQuizPdf.disabled = false;
          btnSubmitImportQuizPdf.innerHTML = '<span class="material-symbols-outlined" style="font-size: 19px;">upload_file</span><span>Teszt importálása</span>';
          if (quizPdfImportStatus) {
            quizPdfImportStatus.style.display = 'block';
            quizPdfImportStatus.style.backgroundColor = 'var(--danger-bg, #fee2e2)';
            quizPdfImportStatus.style.color = 'var(--danger, #dc2626)';
            quizPdfImportStatus.textContent = data.error || 'Hiba történt a PDF importálása során!';
          }
        }
      } catch (err) {
        console.error('PDF import hiba:', err);
        btnSubmitImportQuizPdf.disabled = false;
        btnSubmitImportQuizPdf.innerHTML = '<span class="material-symbols-outlined" style="font-size: 19px;">upload_file</span><span>Teszt importálása</span>';
        if (quizPdfImportStatus) {
          quizPdfImportStatus.style.display = 'block';
          quizPdfImportStatus.style.backgroundColor = 'var(--danger-bg, #fee2e2)';
          quizPdfImportStatus.style.color = 'var(--danger, #dc2626)';
          quizPdfImportStatus.textContent = 'Hálózati hiba a PDF feltöltése során!';
        }
      }
    });
  }

  /**
   * Dolgozat exportálása modal megnyitása és hivatkozások beállítása (Calm Learner)
   */
  function openSessionExportModal(sessionId, quizTitle, gradeLevel, subjectName, className) {
    const liveExportExcel = document.getElementById('live-export-excel');
    const liveExportPrint = document.getElementById('live-export-print');
    const liveExportHtml = document.getElementById('live-export-html');
    const liveExportZip = document.getElementById('live-export-zip');
    const liveExportSubtitle = document.getElementById('live-export-modal-subtitle');
    if (liveExportExcel) liveExportExcel.href = `/api/admin/export/excel/${sessionId}`;
    if (liveExportPrint) liveExportPrint.href = `/print?sessionId=${sessionId}`;
    if (liveExportHtml) liveExportHtml.href = `/api/admin/export/html/${sessionId}`;
    if (liveExportZip) liveExportZip.href = `/api/admin/export/zip/${sessionId}`;
    if (liveExportSubtitle) {
      const classPart = className ? ` • ${className}` : '';
      const subjectPart = subjectName ? `${subjectName} ` : '';
      const gradePart = gradeLevel ? `(${gradeLevel}. évf.)` : '';
      liveExportSubtitle.textContent = `${quizTitle || 'Dolgozat'} – ${subjectPart}${gradePart}${classPart}`;
    }
    openModal('modal-live-export');
  }

  /**
   * Korábbi és aktív dolgozatok (Reports archívum) betöltése
   */
  async function loadReports() {
    try {
      const res = await fetch('/api/admin/sessions', {
        headers: { 'Accept': 'application/json' }
      });
      if (res.status === 401) {
        openLoginModal();
        return;
      }
      if (!res.ok) {
        console.error('Hiba a jelentések lekérésekor, status:', res.status);
        return;
      }
      const data = await res.json();
      allReports = Array.isArray(data) ? data : [];

      // Osztály szűrő legördülő feltöltése a meglévő dolgozatok osztályaival
      if (selectFilterReportsClass) {
        const curVal = selectFilterReportsClass.value;
        const classes = [...new Set(allReports.map(s => s.class_name).filter(Boolean))].sort();
        selectFilterReportsClass.innerHTML = '<option value="">Összes osztály</option>';
        classes.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.textContent = `${c} osztály`;
          selectFilterReportsClass.appendChild(opt);
        });
        if (curVal && classes.includes(curVal)) {
          selectFilterReportsClass.value = curVal;
        }
      }

      filterAndRenderReports();
    } catch (err) {
      console.error('Hiba a jelentések betöltésekor:', err);
    }
  }

  function filterAndRenderReports() {
    if (!reportsCardsContainer) return;
    const query = inputSearchReports ? inputSearchReports.value.trim().toLowerCase() : '';
    const selectedClass = selectFilterReportsClass ? selectFilterReportsClass.value.trim() : '';

    let filtered = allReports;
    if (selectedClass) {
      filtered = filtered.filter(s => s.class_name === selectedClass);
    }
    if (query) {
      filtered = filtered.filter(s =>
        (s.quiz_title && s.quiz_title.toLowerCase().includes(query)) ||
        (s.subject_name && s.subject_name.toLowerCase().includes(query)) ||
        (s.class_name && s.class_name.toLowerCase().includes(query)) ||
        (s.grade_level && String(s.grade_level).includes(query))
      );
    }

    if (filtered.length === 0) {
      reportsCardsContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 48px 24px; border-radius: 16px; border: 1px solid var(--border-color); background-color: #ffffff;">
          <div style="width: 56px; height: 56px; border-radius: 16px; background-color: var(--surface-low); color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
            <span class="material-symbols-outlined" style="font-size: 28px;">history_edu</span>
          </div>
          <h4 style="margin: 0 0 6px 0; font-size: 1.1rem; color: var(--text-main);">Nem található dolgozat</h4>
          <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">
            A megadott keresési vagy szűrési feltételeknek nem felel meg egyetlen dolgozat sem az archívumban.
          </p>
        </div>
      `;
      return;
    }

    reportsCardsContainer.innerHTML = '';
    filtered.forEach(s => {
      const card = document.createElement('div');
      card.className = 'report-card';

      const startedFormatted = s.started_at ? s.started_at.replace('T', ' ').substring(0, 16) : '–';
      const isAct = s.status === 'ACTIVE';
      const statusBadge = isAct
        ? `<span class="badge" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 9999px; background-color: rgba(34, 197, 94, 0.12); color: #15803d; font-weight: 700; font-size: 0.78rem;"><span class="material-symbols-outlined" style="font-size: 14px; color: #16a34a;">radio_button_checked</span><span>Folyamatban</span></span>`
        : `<span class="badge" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 9999px; background-color: rgba(100, 116, 139, 0.12); color: #475569; font-weight: 700; font-size: 0.78rem;"><span class="material-symbols-outlined" style="font-size: 14px; color: #64748b;">lock</span><span>Lezárva</span></span>`;

      const classPill = s.class_name
        ? `<span class="report-card-pill">${escapeHtml(s.class_name)} osztály</span>`
        : `<span class="report-card-pill" style="color: var(--text-muted);">${s.grade_level ? `${escapeHtml(s.grade_level)}. évfolyam` : 'Minden osztály'}</span>`;

      let avgText = '';
      if (s.avg_grade !== null && s.avg_grade !== undefined && s.participant_count > 0) {
        const formattedGrade = Number(s.avg_grade).toFixed(1);
        avgText = `<span class="report-card-avg">Átlag: ${formattedGrade} (${s.avg_percentage}%)</span>`;
      } else if (s.avg_points !== null && s.avg_points !== undefined && s.participant_count > 0) {
        avgText = `<span class="report-card-avg">Átlag: ${s.avg_points} pont</span>`;
      }

      card.innerHTML = `
        <div class="report-card-left">
          <div class="report-card-icon">
            <span class="material-symbols-outlined">history_edu</span>
          </div>
          <div class="report-card-content">
            <div class="report-card-title-row">
              <h3 class="report-card-title">${escapeHtml(s.quiz_title)}</h3>
              ${statusBadge}
            </div>
            <div class="report-card-meta-row">
              ${classPill}
              <span class="report-card-meta-item">
                <span class="material-symbols-outlined">school</span>
                <strong>${escapeHtml(s.subject_name)}</strong>
              </span>
              <span style="color: var(--border-color);">•</span>
              <span class="report-card-meta-item">
                <span class="material-symbols-outlined">calendar_today</span>
                <span>${startedFormatted}</span>
              </span>
              <span style="color: var(--border-color);">•</span>
              <span class="report-card-meta-item">
                <span class="material-symbols-outlined">group</span>
                <span><strong>${s.participant_count || 0}</strong> diák kitöltötte</span>
              </span>
              ${avgText ? `<span style="color: var(--border-color);">•</span> ${avgText}` : ''}
            </div>
          </div>
        </div>

        <div class="report-card-actions">
          <button class="btn btn-primary btn-report-view" data-id="${s.id}" type="button" title="Dolgozat eredménytáblájának (mátrix) megnyitása">
            <span class="material-symbols-outlined">grid_view</span>
            <span>Eredménytábla</span>
          </button>
          <button class="btn btn-secondary btn-report-export" data-id="${s.id}" type="button" title="Dolgozat exportálása (.xlsx, .pdf, .html, .zip)">
            <span class="material-symbols-outlined">download</span>
            <span>Exportálás</span>
          </button>
          <button class="btn btn-soft-danger btn-report-delete" data-id="${s.id}" type="button" title="Dolgozat végleges törlése az archívumból">
            <span class="material-symbols-outlined">delete</span>
            <span>Törlés</span>
          </button>
        </div>
      `;

      // 1. Eredménytábla (Mátrix) megnyitása
      const btnView = card.querySelector('.btn-report-view');
      if (btnView) {
        btnView.addEventListener('click', () => {
          switchSession(s.id);
        });
      }

      // 2. Exportálás modal megnyitása a kiválasztott dolgozathoz
      const btnExport = card.querySelector('.btn-report-export');
      if (btnExport) {
        btnExport.addEventListener('click', () => {
          openSessionExportModal(s.id, s.quiz_title, s.grade_level, s.subject_name, s.class_name);
        });
      }

      // 3. Törlés jóváhagyó modal megnyitása
      const btnDelete = card.querySelector('.btn-report-delete');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          pendingDeleteSessionId = s.id;
          const targetEl = document.getElementById('delete-session-title');
          if (targetEl) targetEl.textContent = `${s.quiz_title} (${s.subject_name} ${s.grade_level}. évf. ${s.class_name || ''})`;
          openModal('modal-confirm-delete-session');
        });
      }

      reportsCardsContainer.appendChild(card);
    });
  }

  if (inputSearchReports) {
    inputSearchReports.addEventListener('input', filterAndRenderReports);
  }

  if (selectFilterReportsClass) {
    selectFilterReportsClass.addEventListener('change', filterAndRenderReports);
  }

  if (btnRefreshReports) {
    btnRefreshReports.addEventListener('click', loadReports);
  }

  /**
   * Fülváltás kezelése
   */
  navTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });

  const btnOpenRosterManager = document.getElementById('btn-open-roster-manager');
  if (btnOpenRosterManager) {
    btnOpenRosterManager.addEventListener('click', () => {
      switchTab('tab-roster');
      loadRosterClasses();
    });
  }

  const btnRosterBreadcrumbBack = document.getElementById('btn-roster-breadcrumb-back');
  const btnRosterBackUp = document.getElementById('btn-roster-back-up');
  if (btnRosterBreadcrumbBack) {
    btnRosterBreadcrumbBack.addEventListener('click', () => {
      switchTab('tab-backup');
    });
  }
  if (btnRosterBackUp) {
    btnRosterBackUp.addEventListener('click', () => {
      switchTab('tab-backup');
    });
  }

  function switchTab(tabId) {
    currentTab = tabId;
    navTabBtns.forEach(b => {
      const isTargetTab = (tabId === 'tab-roster' && b.dataset.tab === 'tab-backup') || (b.dataset.tab === tabId);
      b.classList.toggle('active', isTargetTab);
    });
    tabContents.forEach(c => {
      c.style.display = c.id === tabId ? 'block' : 'none';
    });

    if (tabId === 'tab-reports') {
      loadReports();
    }
    if (tabId === 'tab-backup') {
      loadSettings();
    }
  }

  // ==========================================================================
  // BEÁLLÍTÁSOK ÉS BIZTONSÁGI MENTÉS KEZELÉSE
  // ==========================================================================

  let pendingRestoreFile = null;
  let currentClassroomSettings = null;

  async function loadSettings() {
    try {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.settings) return;

      const { grade_thresholds, classroom_settings } = data.settings;
      currentClassroomSettings = classroom_settings;

      const t5Input = document.getElementById('threshold-input-5');
      const t4Input = document.getElementById('threshold-input-4');
      const t3Input = document.getElementById('threshold-input-3');
      const t2Input = document.getElementById('threshold-input-2');

      if (t5Input && grade_thresholds) t5Input.value = grade_thresholds[5] ?? 90;
      if (t4Input && grade_thresholds) t4Input.value = grade_thresholds[4] ?? 75;
      if (t3Input && grade_thresholds) t3Input.value = grade_thresholds[3] ?? 55;
      if (t2Input && grade_thresholds) t2Input.value = grade_thresholds[2] ?? 30;

      updateThresholdLabels();

      if (classroom_settings) {
        const anon = document.getElementById('setting-anonym-mode');
        const shuf = document.getElementById('setting-shuffle-questions');
        const shufOpt = document.getElementById('setting-shuffle-options');
        const hide = document.getElementById('setting-hide-feedback');

        if (anon) anon.checked = Boolean(classroom_settings.anonym_mode_default);
        if (shuf) shuf.checked = Boolean(classroom_settings.shuffle_questions);
        if (shufOpt) shufOpt.checked = Boolean(classroom_settings.shuffle_options);
        if (hide) hide.checked = Boolean(classroom_settings.hide_immediate_feedback);

        isMatrixAnonymous = Boolean(classroom_settings.anonym_mode_default);
        if (lastMatrixData) renderMatrix(lastMatrixData);
      }

      // Diagnosztikai állapot betöltése
      await loadDiagnosticsStatus();
    } catch (err) {
      console.error('Hiba a beállítások betöltésekor:', err);
    }
  }

  async function loadDiagnosticsStatus() {
    try {
      const res = await fetch('/api/admin/diagnostics/status');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.status) return;

      const s = data.status;
      const badge = document.getElementById('diagnostics-status-badge');
      const runIdEl = document.getElementById('diag-run-id');
      const startedAtEl = document.getElementById('diag-started-at');
      const statusCodeEl = document.getElementById('diag-status-code');
      const totalEventsEl = document.getElementById('diag-total-events');
      const droppedEventsEl = document.getElementById('diag-dropped-events');
      const uncertainEventsEl = document.getElementById('diag-uncertain-events');
      const rejectedEventsEl = document.getElementById('diag-rejected-events');
      const diskSizeEl = document.getElementById('diag-disk-size');
      const btnDownload = document.getElementById('btn-download-diagnostics');

      if (runIdEl) runIdEl.textContent = s.runId ? s.runId.slice(0, 8) : '-';
      if (startedAtEl) {
        startedAtEl.textContent = s.startedAt ? new Date(s.startedAt).toLocaleTimeString('hu-HU') : '-';
      }
      if (statusCodeEl) statusCodeEl.textContent = s.statusCode || '-';
      if (totalEventsEl) totalEventsEl.textContent = String(s.totalWritten || 0);
      if (droppedEventsEl) droppedEventsEl.textContent = String(s.droppedEventsCount || 0);
      if (uncertainEventsEl) uncertainEventsEl.textContent = String(s.uncertainEventsCount || 0);
      if (rejectedEventsEl) rejectedEventsEl.textContent = String(s.rejectedBatchEventsCount || 0);
      if (diskSizeEl) {
        const kb = Math.round((s.diskSizeBytes || 0) / 1024);
        diskSizeEl.textContent = `${kb} KB`;
      }

      if (badge) {
        if (!s.enabled) {
          badge.textContent = 'Kikapcsolva';
          badge.style.backgroundColor = 'var(--surface-variant, #e7e0ec)';
          badge.style.color = 'var(--text-muted, #79747e)';
        } else if (s.configurationError) {
          badge.textContent = 'Konfigurációs hiba';
          badge.style.backgroundColor = 'var(--danger-bg, #fef2f2)';
          badge.style.color = 'var(--danger, #b91c1c)';
        } else if (s.isDegraded) {
          badge.textContent = `Korlátozott (${s.statusCode || 'HIBA'})`;
          badge.style.backgroundColor = 'var(--danger-bg, #fef2f2)';
          badge.style.color = 'var(--danger, #b91c1c)';
        } else {
          badge.textContent = 'Bekapcsolva (Aktív)';
          badge.style.backgroundColor = '#ecfdf5';
          badge.style.color = '#047857';
        }
      }

      if (btnDownload) {
        if (!s.exportAvailable) {
          btnDownload.classList.add('disabled');
          btnDownload.style.pointerEvents = 'none';
          btnDownload.style.opacity = '0.5';
        } else {
          btnDownload.classList.remove('disabled');
          btnDownload.style.pointerEvents = 'auto';
          btnDownload.style.opacity = '1';
        }
      }
    } catch (err) {
      console.warn('Nem sikerült lekérni a diagnosztikai állapotot:', err);
    }
  }

  function updateThresholdLabels() {
    const t5 = parseInt(document.getElementById('threshold-input-5')?.value, 10) || 90;
    const t4 = parseInt(document.getElementById('threshold-input-4')?.value, 10) || 75;
    const t3 = parseInt(document.getElementById('threshold-input-3')?.value, 10) || 55;
    const t2 = parseInt(document.getElementById('threshold-input-2')?.value, 10) || 30;

    const desc5 = document.getElementById('threshold-desc-5');
    const desc4 = document.getElementById('threshold-desc-4');
    const desc3 = document.getElementById('threshold-desc-3');
    const desc2 = document.getElementById('threshold-desc-2');
    const desc1 = document.getElementById('threshold-desc-1');

    if (desc5) desc5.textContent = `${t5}% – 100%`;
    if (desc4) desc4.textContent = `${t4}% – ${Math.max(t4, t5 - 1)}%`;
    if (desc3) desc3.textContent = `${t3}% – ${Math.max(t3, t4 - 1)}%`;
    if (desc2) desc2.textContent = `${t2}% – ${Math.max(t2, t3 - 1)}%`;
    if (desc1) desc1.textContent = `0% – ${Math.max(0, t2 - 1)}%`;
  }

  function showSettingsToast(msg) {
    const toast = document.getElementById('settings-toast');
    const toastMsg = document.getElementById('settings-toast-message');
    if (toast && toastMsg) {
      toastMsg.textContent = msg;
      toast.style.display = 'flex';
      setTimeout(() => {
        toast.style.display = 'none';
      }, 4000);
    } else {
      showToast(msg, 'success');
    }
  }

  async function saveSettings() {
    const t5 = parseInt(document.getElementById('threshold-input-5')?.value, 10);
    const t4 = parseInt(document.getElementById('threshold-input-4')?.value, 10);
    const t3 = parseInt(document.getElementById('threshold-input-3')?.value, 10);
    const t2 = parseInt(document.getElementById('threshold-input-2')?.value, 10);

    if (isNaN(t2) || isNaN(t3) || isNaN(t4) || isNaN(t5)) {
      showAdminAlert('⚠️ Érvénytelen ponthatárok', 'Kérjük, minden érdemjegyhez adj meg érvényes százalékos alsó határt!');
      return;
    }

    if (t2 <= 0 || t2 >= t3 || t3 >= t4 || t4 >= t5 || t5 > 100) {
      showAdminAlert('⚠️ Helytelen ponthatár-sorrend', 'A ponthatároknak szigorúan növekvő sorrendben kell lenniük:\n0 < 2-es < 3-as < 4-es < 5-ös <= 100%!');
      return;
    }

    const payload = {
      grade_thresholds: { 2: t2, 3: t3, 4: t4, 5: t5 },
      classroom_settings: {
        anonym_mode_default: Boolean(document.getElementById('setting-anonym-mode')?.checked),
        shuffle_questions: Boolean(document.getElementById('setting-shuffle-questions')?.checked),
        shuffle_options: Boolean(document.getElementById('setting-shuffle-options')?.checked),
        hide_immediate_feedback: Boolean(document.getElementById('setting-hide-feedback')?.checked)
      }
    };

    try {
      const btnSave = document.getElementById('btn-save-settings');
      if (btnSave) btnSave.disabled = true;

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showSettingsToast('A beállítások sikeresen mentve a helyi gép profiljában!');
      } else {
        showAdminAlert('⚠️ Mentési hiba', data.error || 'Nem sikerült elmenteni a beállításokat.');
      }
    } catch (err) {
      console.error('Hiba a beállítások mentésekor:', err);
      showAdminAlert('⚠️ Hálózati hiba', 'Nem sikerült elérni a szervert a mentéshez.');
    } finally {
      const btnSave = document.getElementById('btn-save-settings');
      if (btnSave) btnSave.disabled = false;
    }
  }

  async function executeResetSettings() {
    closeModal('modal-confirm-reset-settings');
    try {
      const res = await fetch('/api/admin/settings/reset', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        await loadSettings();
        showSettingsToast('A gyári alapértékek sikeresen visszaállítva!');
      } else {
        showAdminAlert('⚠️ Visszaállítási hiba', data.error || 'Nem sikerült visszaállítani az alapértékeket.');
      }
    } catch (err) {
      console.error('Hiba a beállítások alaphelyzetbe állításakor:', err);
      showAdminAlert('⚠️ Hálózati hiba', 'Nem sikerült elérni a szervert a visszaállításhoz.');
    }
  }

  function initSettingsHandlers() {
    // Ponthatár élő szövegfrissítés
    ['threshold-input-5', 'threshold-input-4', 'threshold-input-3', 'threshold-input-2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', updateThresholdLabels);
      }
    });

    // Mentés gomb
    const btnSave = document.getElementById('btn-save-settings');
    if (btnSave) {
      btnSave.addEventListener('click', saveSettings);
    }

    // Diagnosztikai állapot frissítése gomb
    const btnRefreshDiag = document.getElementById('btn-refresh-diagnostics');
    if (btnRefreshDiag) {
      btnRefreshDiag.addEventListener('click', () => {
        loadDiagnosticsStatus();
        showSettingsToast('Diagnosztikai állapot frissítve!');
      });
    }

    // Diagnosztikai eseménynapló letöltése (részleges/rövidített export egyértelmű jelzésével)
    const btnDownloadDiag = document.getElementById('btn-download-diagnostics');
    if (btnDownloadDiag) {
      btnDownloadDiag.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          const res = await fetch('/api/admin/diagnostics/export', { cache: 'no-store' });
          if (!res.ok) {
            let errText = 'Nem sikerült letölteni a diagnosztikai naplót.';
            try {
              const errData = await res.json();
              if (errData && errData.error) errText = errData.error;
            } catch {}
            showAdminAlert('⚠️ Exportálási hiba', errText);
            return;
          }

          const isTruncated = res.headers.get('X-Diagnostics-Export-Truncated') === 'true';
          const disposition = res.headers.get('Content-Disposition') || '';
          const nameMatch = disposition.match(/filename="([^"]+)"/);
          const fileName = nameMatch ? nameMatch[1] : 'okoskodo_diagnostics.jsonl';

          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);

          if (isTruncated) {
            showAdminAlert(
              '⚠️ Részleges diagnosztikai export',
              'Az eseménynapló mérete meghaladta az exportálási méretkorlátot, ezért a letöltött fájl csak részleges tartalmat tartalmaz (teljes sor határán lezárva).'
            );
          } else {
            showSettingsToast('Diagnosztikai eseménynapló sikeresen letöltve!');
          }
        } catch (err) {
          console.error('Hiba a diagnosztikai export letöltésekor:', err);
          showAdminAlert('⚠️ Hálózati hiba', 'Nem sikerült letölteni a diagnosztikai naplót.');
        }
      });
    }

    // Alapértelmezések visszaállítása gomb (modal megnyitása)
    const btnReset = document.getElementById('btn-reset-settings');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        openModal('modal-confirm-reset-settings');
      });
    }

    // Alapértelmezések véglegesítése a modálban
    const btnExecuteReset = document.getElementById('btn-execute-reset-settings');
    if (btnExecuteReset) {
      btnExecuteReset.addEventListener('click', executeResetSettings);
    }

    // Mentésfájl kiválasztása gomb
    const btnTriggerRestore = document.getElementById('btn-trigger-restore');
    const inputRestore = document.getElementById('input-restore-backup');
    if (btnTriggerRestore && inputRestore) {
      btnTriggerRestore.addEventListener('click', () => {
        inputRestore.value = '';
        inputRestore.click();
      });

      inputRestore.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        pendingRestoreFile = file;
        const nameEl = document.getElementById('restore-file-display-name');
        const sizeEl = document.getElementById('restore-file-display-size');
        if (nameEl) nameEl.textContent = file.name;
        if (sizeEl) sizeEl.textContent = `Fájlméret: ${(file.size / (1024 * 1024)).toFixed(2)} MB`;

        openModal('modal-confirm-restore');
      });
    }

    // Visszaállítás megerősítése
    const btnExecuteRestore = document.getElementById('btn-execute-restore');
    if (btnExecuteRestore) {
      btnExecuteRestore.addEventListener('click', async () => {
        if (!pendingRestoreFile) return;

        const originalHtml = btnExecuteRestore.innerHTML;
        btnExecuteRestore.disabled = true;
        btnExecuteRestore.innerHTML = `
          <span class="material-symbols-outlined spin">sync</span>
          <span>Visszaállítás folyamatban...</span>
        `;

        try {
          const formData = new FormData();
          formData.append('backupFile', pendingRestoreFile);

          const res = await fetch('/api/admin/restore', {
            method: 'POST',
            body: formData
          });

          const data = await res.json();
          if (res.ok && data.success) {
            closeModal('modal-confirm-restore');
            showToast('A rendszermentés sikeresen visszaállítva! Az oldal 2 másodperc múlva frissül...', 'success');
            setTimeout(() => {
              window.location.reload();
            }, 1800);
          } else {
            showAdminAlert('⚠️ Visszaállítási hiba', data.error || 'A mentés visszaállítása sikertelen volt!');
            btnExecuteRestore.disabled = false;
            btnExecuteRestore.innerHTML = originalHtml;
          }
        } catch (err) {
          console.error('Hiba a visszaállítás során:', err);
          showAdminAlert('⚠️ Hálózati hiba', 'Nem sikerült feltölteni a mentésfájlt a szerverre.');
          btnExecuteRestore.disabled = false;
          btnExecuteRestore.innerHTML = originalHtml;
        }
      });
    }
  }

  // Futtatás indításkor
  document.addEventListener('DOMContentLoaded', init);

})();

