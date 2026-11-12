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
  const reportsTableBody = document.getElementById('reports-table-body');
  const inputSearchReports = document.getElementById('input-search-reports');
  const btnRefreshReports = document.getElementById('btn-refresh-reports');
  let allReports = [];

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
  const quizEditorCard = document.getElementById('quiz-editor-card');
  const btnCloseEditor = document.getElementById('btn-close-editor');
  const editQuizId = document.getElementById('edit-quiz-id');
  const editSubjectId = document.getElementById('edit-subject-id');
  const editGradeLevel = document.getElementById('edit-grade-level');
  const editTimeLimit = document.getElementById('edit-time-limit');
  const editQuizTitle = document.getElementById('edit-quiz-title');
  const editorQuestionsList = document.getElementById('editor-questions-list');
  const btnAddQuestion = document.getElementById('btn-add-question');
  const btnSaveQuiz = document.getElementById('btn-save-quiz');

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
      if (isFinished) {
        if (sessionBadgeChannel) {
          sessionBadgeChannel.className = 'admin-session-finished-pill';
          sessionBadgeChannel.innerHTML = '⏹️ Dolgozat lezárva';
        }
        if (tabBtnLive) {
          tabBtnLive.textContent = '📊 Lezárt Dolgozat (Mátrix)';
        }
        liveSessionTitle.textContent = data.session.quiz_title + ' [LEZÁRT ARCHÍVUM]';
        const endedFormatted = data.session.ended_at ? data.session.ended_at.replace('T', ' ').substring(0, 16) : '–';
        liveSessionInfo.textContent = `Tantárgy: ${data.session.subject_name} | Évfolyam: ${data.session.grade_level}. évfolyam | Mód: ${data.session.mode} | Befejezve: ${endedFormatted}`;
        if (btnFinishSession) btnFinishSession.style.display = 'none';
        if (btnAdminStartRace) btnAdminStartRace.style.display = 'none';
        if (badgeSessionFinished) badgeSessionFinished.style.display = 'inline-flex';
      } else {
        if (sessionBadgeChannel) {
          sessionBadgeChannel.className = 'admin-session-badge';
          sessionBadgeChannel.innerHTML = '<span class="admin-pulse-dot"></span><span>Kitöltés folyamatban</span>';
        }
        if (tabBtnLive) {
          tabBtnLive.textContent = '📊 Élő Dolgozat (Mátrix)';
        }
        liveSessionTitle.textContent = data.session.quiz_title;
        liveSessionInfo.textContent = `Tantárgy: ${data.session.subject_name} | Évfolyam: ${data.session.grade_level}. évfolyam | Mód: ${data.session.mode}`;
        if (btnFinishSession) btnFinishSession.style.display = 'inline-flex';
        if (badgeSessionFinished) badgeSessionFinished.style.display = 'none';

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
    if (tabBtnLive) {
      tabBtnLive.textContent = '📊 Élő Dolgozat (Mátrix)';
    }
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
    matrixHeadRow.innerHTML = `
      <th class="col-num">#</th>
      <th class="col-name">Tanuló neve &amp; Státusz</th>
      <th style="min-width: 60px;">Gép</th>
    `;

    questions.forEach((q, idx) => {
      const th = document.createElement('th');
      th.innerHTML = `K${idx + 1}<br><span style="font-size: 0.72rem; font-weight: normal; opacity: 0.85;">(${q.points}p)</span>`;
      th.title = q.question_text;
      matrixHeadRow.appendChild(th);
    });

    matrixHeadRow.innerHTML += `
      <th style="min-width: 75px;">Összpont</th>
      <th style="min-width: 65px;">%</th>
      <th style="min-width: 105px;">Jegy</th>
      <th style="min-width: 65px;">Fókusz</th>
      <th style="min-width: 170px;">Műveletek</th>
    `;

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

      // 1. Név, avatár és befejezett állapot
      const tdName = document.createElement('td');
      tdName.className = 'col-name';
      const initials = getStudentInitials(p.student_name);
      const statusHtml = p.is_finished
        ? `<span class="admin-student-status status-finished"><span class="material-symbols-outlined" style="font-size: 13px;">check_circle</span> Kész</span>`
        : `<span class="admin-student-status status-working"><span class="material-symbols-outlined" style="font-size: 13px;">edit_note</span> Folyamatban...</span>`;

      tdName.innerHTML = `
        <div class="admin-student-cell">
          <div class="admin-student-avatar">${escapeHtml(initials)}</div>
          <div class="admin-student-info">
            <span class="admin-student-name">${escapeHtml(p.student_name)}</span>
            ${statusHtml}
          </div>
        </div>
      `;
      tr.appendChild(tdName);

      // 2. Gépszám
      const tdPc = document.createElement('td');
      tdPc.innerHTML = p.pc_number
        ? `<span style="font-weight: 700; color: var(--text-muted); font-size: 0.85rem;">PC-${p.pc_number}</span>`
        : '<span style="color: #94a3b8;">–</span>';
      tr.appendChild(tdPc);

      // 3. Kérdés cellák (1-kattintásos felülbírálás!)
      questions.forEach(q => {
        const tdQ = document.createElement('td');
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
          cellSpan.className = `matrix-cell ${cellClass}`;
          cellSpan.innerHTML = `<span class="material-symbols-outlined" style="font-size: 14px; margin-right: 2px;">${icon}</span>${text}`;
          cellSpan.title = `Diák válasza: ${ans.submitted_answer} (Kattints a felülbíráláshoz)`;

          cellSpan.addEventListener('click', async () => {
            let nextStatus = 'CORRECT';
            if (ans.eval_status === 'CORRECT') nextStatus = 'PARTIAL';
            else if (ans.eval_status === 'PARTIAL') nextStatus = 'WRONG';
            else nextStatus = 'CORRECT';

            await overrideCell(ans.id, nextStatus);
          });

          tdQ.appendChild(cellSpan);
        }

        tr.appendChild(tdQ);
      });

      // 4. Összpontszám
      const tdPoints = document.createElement('td');
      tdPoints.innerHTML = `<strong style="font-size: 0.95rem; color: var(--text-main);">${p.total_points}</strong> <span style="font-size: 0.78rem; color: var(--text-muted);">/ ${data.totalMaxPoints}</span>`;
      tr.appendChild(tdPoints);

      // 5. Százalék
      const tdPct = document.createElement('td');
      let pctColor = 'var(--text-main)';
      if (p.percentage >= 85) pctColor = 'var(--success, #16a34a)';
      else if (p.percentage < 50) pctColor = 'var(--danger, #dc2626)';
      tdPct.innerHTML = `<strong style="color: ${pctColor}; font-size: 0.92rem;">${p.percentage}%</strong>`;
      tr.appendChild(tdPct);

      // 6. KRÉTA érdemjegy
      const tdGrade = document.createElement('td');
      const gradeNum = parseInt(p.grade, 10) || 1;
      const gradeLabels = { 5: '5 (Jeles)', 4: '4 (Jó)', 3: '3 (Közepes)', 2: '2 (Elégséges)', 1: '1 (Elégtelen)' };
      const gradeLabel = gradeLabels[gradeNum] || `${gradeNum}`;
      tdGrade.innerHTML = `<span class="admin-grade-badge grade-${gradeNum}">${gradeLabel}</span>`;
      tr.appendChild(tdGrade);

      // 7. Fókuszvesztések
      const tdFocus = document.createElement('td');
      if (p.focus_lost_count > 0) {
        tdFocus.innerHTML = `<span class="focus-alert">⚠️ ${p.focus_lost_count}x</span>`;
      } else {
        tdFocus.innerHTML = `<span style="color: #94a3b8; font-size: 0.85rem;">0</span>`;
      }
      tr.appendChild(tdFocus);

      // 8. Diák műveletek: Gép váltása és Név törlése (Calm Learner Stílus & Report 12 / 2.2)
      const tdAction = document.createElement('td');
      tdAction.style.whiteSpace = 'nowrap';

      const actionWrap = document.createElement('div');
      actionWrap.style.display = 'inline-flex';
      actionWrap.style.gap = '6px';
      actionWrap.style.alignItems = 'center';
      actionWrap.style.justifyContent = 'center';

      const isSessionActive = session && session.status === 'ACTIVE';

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
          showAdminAlert('⚠️ Rajt hiba', err.error || 'Hiba a rajt indításakor!');
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

  /**
   * Új Dolgozat Indítása (Modal)
   */
  btnOpenStartModal.addEventListener('click', () => openModal('modal-start-session'));
  btnOpenStartModalAlt.addEventListener('click', () => openModal('modal-start-session'));

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
  async function loadQuizzes() {
    try {
      const res = await fetch('/api/admin/quizzes');
      quizzesList = await res.json();

      // Indító modal legördülő frissítése
      startQuizId.innerHTML = '';
      quizzesList.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.id;
        opt.textContent = `${q.title} (${q.question_count} kérdés)`;
        startQuizId.appendChild(opt);
      });

      // Tesztszerkesztő lista kártyái (Mindig szabadon szerkeszthető sablonok)
      quizzesListContainer.innerHTML = '';
      quizzesList.forEach(q => {
        const card = document.createElement('div');
        card.className = 'quiz-card';

        card.innerHTML = `
          <div class="quiz-card-header">
            <h4 class="quiz-card-title">${escapeHtml(q.title)}</h4>
            <span style="font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; background:#dcfce7; color:#166534; white-space: nowrap;">
              🟢 Szerkeszthető
            </span>
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
            <button type="button" class="quiz-btn-icon quiz-btn-delete btn-delete" data-id="${q.id}" title="Teszt törlése">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        `;

        // Gomb eseménykezelők
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

    } catch (err) {
      console.error('Hiba a tesztek betöltésekor:', err);
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
        await loadQuizzes();
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
        await loadQuizzes();
      } else {
        const err = await res.json();
        showAdminAlert('⚠️ Törlési hiba', err.error || 'Hiba a törlés során!');
      }
    } catch (err) {
      showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba a törléskor!');
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
      addQuestionBlock(); // 1 üres kérdés alapból
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

      editorQuestionsList.innerHTML = '';
      quiz.questions.forEach(q => {
        addQuestionBlock(q);
      });
    } catch (err) {
      console.error('Hiba a teszt betöltésekor:', err);
    }
  }

  btnNewQuiz.addEventListener('click', () => openQuizEditor(null));
  btnCloseEditor.addEventListener('click', () => {
    quizEditorCard.style.display = 'none';
  });

  // Kérdés blokk hozzáadása a szerkesztőhöz
  btnAddQuestion.addEventListener('click', () => addQuestionBlock());

  function addQuestionBlock(existing = null) {
    const qIndex = editorQuestionsList.children.length + 1;
    const block = document.createElement('div');
    block.className = 'card';
    block.style.padding = '16px';
    block.style.marginBottom = '16px';
    block.style.backgroundColor = '#f8fafc';

    const qType = existing ? existing.question_type : 'ABCD';
    const qText = existing ? existing.question_text : '';
    const qPoints = existing ? existing.points : 1.0;
    const qCorrect = existing ? existing.correct_answer : '';
    const qExpl = existing ? existing.explanation : '';
    const qOptions = existing && Array.isArray(existing.options) ? existing.options : ['', '', '', ''];

    block.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h5>${qIndex}. Kérdés</h5>
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
          <label class="form-label">Kérdés szövege (használd a \`kód\` jelölést!):</label>
          <input type="text" class="form-control q-text" value="${escapeHtml(qText)}" placeholder="pl. Melyik képlet számol összeget?">
        </div>
      </div>

      <!-- Válaszlehetőségek szerkesztése ABCD esetén -->
      <div class="q-options-box" style="${qType === 'ABCD' ? '' : 'display:none;'} margin-bottom: 12px;">
        <label class="form-label">Válaszopciók és helyes válasz:</label>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
          <input type="text" class="form-control q-opt-0" placeholder="A válasz" value="${escapeHtml(qOptions[0] || '')}">
          <input type="text" class="form-control q-opt-1" placeholder="B válasz" value="${escapeHtml(qOptions[1] || '')}">
          <input type="text" class="form-control q-opt-2" placeholder="C válasz" value="${escapeHtml(qOptions[2] || '')}">
          <input type="text" class="form-control q-opt-3" placeholder="D válasz" value="${escapeHtml(qOptions[3] || '')}">
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <label class="form-label">Helyes válasz pontos értéke:</label>
          <input type="text" class="form-control q-correct" value="${escapeHtml(qCorrect)}" placeholder="pl. =SZUM(A1:A10)">
        </div>
        <div>
          <label class="form-label">Magyarázat (visszajelzéshez):</label>
          <input type="text" class="form-control q-explanation" value="${escapeHtml(qExpl)}" placeholder="A megoldás magyarázata...">
        </div>
      </div>
    `;

    // Típusváltás figyelése
    const typeSelect = block.querySelector('.q-type-select');
    const optBox = block.querySelector('.q-options-box');
    typeSelect.addEventListener('change', () => {
      optBox.style.display = typeSelect.value === 'ABCD' ? 'block' : 'none';
      if (typeSelect.value === 'TF') {
        block.querySelector('.q-correct').placeholder = 'Igaz vagy Hamis';
      }
    });

    // Eltávolítás
    block.querySelector('.btn-remove-q').addEventListener('click', () => {
      block.remove();
    });

    editorQuestionsList.appendChild(block);
  }

  // Teszt mentése
  btnSaveQuiz.addEventListener('click', async () => {
    const title = editQuizTitle.value.trim();
    if (!title) {
      showAdminAlert('⚠️ Hiányzó cím', 'A feladatsor címének megadása kötelező!');
      return;
    }

    const quizId = editQuizId.value;
    const questions = [];

    const blocks = editorQuestionsList.children;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const type = b.querySelector('.q-type-select').value;
      const text = b.querySelector('.q-text').value.trim();
      const points = parseFloat(b.querySelector('.q-points').value) || 1.0;
      const correct = b.querySelector('.q-correct').value.trim();
      const explanation = b.querySelector('.q-explanation').value.trim();

      let options = [];
      if (type === 'ABCD') {
        options = [
          b.querySelector('.q-opt-0').value.trim(),
          b.querySelector('.q-opt-1').value.trim(),
          b.querySelector('.q-opt-2').value.trim(),
          b.querySelector('.q-opt-3').value.trim()
        ].filter(Boolean);
      } else if (type === 'TF') {
        options = ['Igaz', 'Hamis'];
      }

      questions.push({
        question_order: i + 1,
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
        await loadQuizzes();
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
        showAdminAlert('⚠️ Névsor hiba', data.error || 'Hiba a névsor mentésekor!');
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

  // Osztály törlése
  btnDeleteClass.addEventListener('click', async () => {
    if (!selectedRosterClass) return;
    if (!confirm(`Biztosan törlöd a(z) ${selectedRosterClass} osztályt és összes diákját?`)) {
      return;
    }

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
      showAdminAlert('⚠️ Hálózati hiba', 'Hálózati hiba a törléskor!');
    }
  });

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
      filterAndRenderReports();
    } catch (err) {
      console.error('Hiba a jelentések betöltésekor:', err);
    }
  }

  function filterAndRenderReports() {
    if (!reportsTableBody) return;
    const query = inputSearchReports ? inputSearchReports.value.trim().toLowerCase() : '';

    let filtered = allReports;
    if (query) {
      filtered = allReports.filter(s => 
        (s.quiz_title && s.quiz_title.toLowerCase().includes(query)) ||
        (s.subject_name && s.subject_name.toLowerCase().includes(query)) ||
        (s.class_name && s.class_name.toLowerCase().includes(query)) ||
        (s.grade_level && String(s.grade_level).includes(query))
      );
    }

    if (filtered.length === 0) {
      reportsTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Nem található a keresésnek megfelelő dolgozat az archívumban.
          </td>
        </tr>
      `;
      return;
    }

    reportsTableBody.innerHTML = '';
    filtered.forEach(s => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';

      const startedFormatted = s.started_at ? s.started_at.replace('T', ' ').substring(0, 16) : '–';
      const isAct = s.status === 'ACTIVE';
      const statusBadge = isAct
        ? `<span class="badge" style="background-color: rgba(34, 197, 94, 0.15); color: var(--success); font-weight: 600;">🟢 Folyamatban</span>`
        : `<span class="badge" style="background-color: rgba(100, 116, 139, 0.15); color: var(--text-muted); font-weight: 600;">⏹️ Lezárva</span>`;

      tr.innerHTML = `
        <td style="padding: 12px 16px; font-size: 0.9rem; color: var(--text-muted);">${startedFormatted}</td>
        <td style="padding: 12px 16px;"><strong>${escapeHtml(s.subject_name)}</strong> <span style="color: var(--text-muted);">(${s.grade_level}. évf.)</span></td>
        <td style="padding: 12px 16px; font-weight: 600;">${escapeHtml(s.quiz_title)}</td>
        <td style="padding: 12px 16px;">${s.class_name ? escapeHtml(s.class_name) : '<span style="color: var(--text-muted);">–</span>'}</td>
        <td style="padding: 12px 16px; text-align: center;"><strong>${s.participant_count || 0}</strong> diák</td>
        <td style="padding: 12px 16px; text-align: center;">${statusBadge}</td>
        <td style="padding: 12px 16px; text-align: right;">
          <div style="display: inline-flex; gap: 6px; align-items: center; justify-content: flex-end;">
            <button class="btn btn-primary btn-sm btn-view-report" data-id="${s.id}" title="Mátrix és diákválaszok megnyitása">
              👁️ Mátrix
            </button>
            <a href="/api/admin/export/excel/${s.id}" class="btn btn-success btn-sm" title="KRÉTA Excel riport letöltése" target="_blank">
              📊 Excel
            </a>
            <a href="/api/admin/export/html/${s.id}" class="btn btn-secondary btn-sm" title="Csoportos interaktív HTML letöltése" target="_blank">
              🌐 HTML
            </a>
            <a href="/api/admin/export/zip/${s.id}" class="btn btn-secondary btn-sm" title="Egyéni tanulói lapok ZIP letöltése" target="_blank">
              📦 ZIP
            </a>
            <a href="/print?sessionId=${s.id}" class="btn btn-secondary btn-sm" title="Nyomtatható A4 PDF lapok" target="_blank">
              🖨️ PDF
            </a>
            <button class="btn btn-danger btn-sm btn-delete-report" data-id="${s.id}" title="Dolgozat végleges törlése az archívumból">
              🗑️ Törlés
            </button>
          </div>
        </td>
      `;

      const btnView = tr.querySelector('.btn-view-report');
      if (btnView) {
        btnView.addEventListener('click', () => {
          switchSession(s.id);
        });
      }

      const btnDelReport = tr.querySelector('.btn-delete-report');
      if (btnDelReport) {
        btnDelReport.addEventListener('click', () => {
          pendingDeleteSessionId = s.id;
          const targetEl = document.getElementById('delete-session-title');
          if (targetEl) targetEl.textContent = `${s.quiz_title} (${s.subject_name} ${s.grade_level}. évf. ${s.class_name || ''})`;
          openModal('modal-confirm-delete-session');
        });
      }

      reportsTableBody.appendChild(tr);
    });
  }

  if (inputSearchReports) {
    inputSearchReports.addEventListener('input', filterAndRenderReports);
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

  function switchTab(tabId) {
    currentTab = tabId;
    navTabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabId);
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

