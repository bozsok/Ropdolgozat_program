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
  const btnNewFolder = document.getElementById('btn-new-folder');
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
  const rosterEditorBox = document.getElementById('roster-editor-box');
  const rosterClassTitle = document.getElementById('roster-class-title');
  const rosterNamesTextarea = document.getElementById('roster-names-textarea');
  const btnSaveRoster = document.getElementById('btn-save-roster');
  const btnNewClass = document.getElementById('btn-new-class');
  const btnDeleteClass = document.getElementById('btn-delete-class');
  let selectedRosterClass = null;

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
    await loadInitialData();
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
      showToast(`⚠️ Fókuszvesztés: ${escapeHtml(data.studentName)} (${data.focusLostCount}x)`, 'danger');
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

  /**
   * Élő Mátrix Táblázat Kirajzolása
   */
  function renderMatrix(data) {
    const { questions, participants, answers, session } = data;

    // KPI összegző kártyák azonnali kiszámítása és frissítése
    renderKpiCards(data);

    // Fejléc sor összeállítása (Calm Learner Mátrix)
    const qColsHtml = questions.map((q, idx) => `
      <th class="matrix-q-col col-question" data-q-idx="${idx}" title="${escapeHtml(q.question_text || `${idx + 1}. kérdés`)}">${idx + 1}</th>
    `).join('');

    matrixHeadRow.innerHTML = `
      <th class="col-num">#</th>
      <th class="col-name">Tanuló neve</th>
      <th class="col-pc">Gép</th>
      ${qColsHtml}
      <th class="col-points">Pont</th>
      <th class="col-pct">%</th>
      <th class="col-grade">Jegy</th>
      <th class="col-focus">Fókusz</th>
      <th class="col-actions">Műveletek</th>
    `;

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

      tdName.innerHTML = `
        <div class="admin-student-cell">
          <div class="admin-student-info">
            <span class="admin-student-name">${escapeHtml(p.student_name)}</span>
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
  }

  btnOpenStartModal.addEventListener('click', () => {
    syncStartQuizTimeLimit();
    openModal('modal-start-session');
  });
  btnOpenStartModalAlt.addEventListener('click', () => {
    syncStartQuizTimeLimit();
    openModal('modal-start-session');
  });

  if (startQuizId) {
    startQuizId.addEventListener('change', syncStartQuizTimeLimit);
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
      await updateStartSessionQuizOptions();

      // 4. Morzsamenü és navigáció kirajzolása
      renderBreadcrumbs();

      // 5. Kártyarács kirajzolása (mappák elöl, utána tesztek)
      renderQuizGrid(currentFolders, quizzesList);

    } catch (err) {
      console.error('Hiba a tesztek és mappák betöltésekor:', err);
    }
  }

  /**
   * Dolgozatindító modál kvíz-választó mezőjének frissítése az összes elérhető teszttel
   */
  async function updateStartSessionQuizOptions() {
    if (!startQuizId) return;
    try {
      const res = await fetch('/api/admin/quizzes');
      const allQuizzes = await res.json();
      startQuizId.innerHTML = '';
      allQuizzes.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.id;
        opt.dataset.timeLimit = (q.default_time_limit_min !== null && q.default_time_limit_min !== undefined) ? q.default_time_limit_min : 0;
        const folderTag = q.folder_name ? `[${q.folder_name}] ` : '';
        opt.textContent = `${folderTag}${q.title} (${q.question_count} kérdés)`;
        startQuizId.appendChild(opt);
      });
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

    typeSelect.addEventListener('change', () => {
      optBox.style.display = typeSelect.value === 'ABCD' ? 'block' : 'none';
      tfBox.style.display = typeSelect.value === 'TF' ? 'block' : 'none';
      shortBox.style.display = typeSelect.value === 'SHORT' ? 'block' : 'none';
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

      const qId = b.dataset.questionId ? parseInt(b.dataset.questionId, 10) : undefined;
      questions.push({
        id: qId,
        question_order: qNum,
        question_type: type,
        question_text: text,
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
  async function loadRosterClasses() {
    try {
      const res = await fetch('/api/classes');
      const classes = await res.json();
      adminRosterClassList.innerHTML = '';

      classes.forEach(cls => {
        const btn = document.createElement('div');
        btn.className = `option-btn ${cls === selectedRosterClass ? 'selected' : ''}`;
        btn.textContent = cls;

        btn.addEventListener('click', () => {
          document.querySelectorAll('#admin-roster-class-list .option-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectRosterClass(cls);
        });

        adminRosterClassList.appendChild(btn);
      });
    } catch (err) {
      console.error('Hiba az osztályok betöltésekor:', err);
    }
  }

  async function selectRosterClass(className) {
    selectedRosterClass = className;
    rosterClassTitle.textContent = `${className} osztály névsora`;
    rosterEditorBox.style.display = 'block';

    try {
      const res = await fetch(`/api/classes/${encodeURIComponent(className)}/students`);
      const students = await res.json();
      rosterNamesTextarea.value = students.map(s => s.student_name).join('\n');
    } catch (err) {
      console.error('Hiba a diákok betöltésekor:', err);
    }
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
    rosterClassTitle.textContent = `${selectedRosterClass} osztály névsora`;
    rosterNamesTextarea.value = '';
    rosterEditorBox.style.display = 'block';
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
  }

  // Futtatás indításkor
  document.addEventListener('DOMContentLoaded', init);

})();

