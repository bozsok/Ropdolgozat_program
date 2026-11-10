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
        alert(data.message || 'Helytelen tanári jelszó!');
        inputPin.value = '';
        inputPin.focus();
      }
    } catch (err) {
      alert('Hálózati hiba a bejelentkezés során!');
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

  function renderBadges() {
    liveBadgesList.innerHTML = '';
    if (activeSessionsList.length === 0) {
      liveBadgesList.innerHTML = '<span style="color: #64748b; font-size: 0.85rem; padding: 4px;">Nincs futó dolgozat</span>';
      return;
    }

    activeSessionsList.forEach(session => {
      const badge = document.createElement('div');
      badge.className = `live-badge ${String(session.id) === String(currentSessionId) ? 'badge-active' : ''}`;
      badge.innerHTML = `
        <span>🟢 ${escapeHtml(session.subject_name)} ${escapeHtml(session.grade_level)}. évf.</span>
        <span style="opacity: 0.8;">(„${escapeHtml(session.quiz_title)}” – ${session.participant_count} diák)</span>
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
          sessionBadgeChannel.className = 'live-badge badge-finished';
          sessionBadgeChannel.textContent = '⏹️ LEZÁRT ARCHÍVUM';
        }
        if (tabBtnLive) {
          tabBtnLive.textContent = '📊 Lezárt Dolgozat (Mátrix)';
        }
        liveSessionTitle.textContent = data.session.quiz_title + ' [LEZÁRT ARCHÍVUM]';
        const endedFormatted = data.session.ended_at ? data.session.ended_at.replace('T', ' ').substring(0, 16) : '–';
        liveSessionInfo.textContent = `Tantárgy: ${data.session.subject_name} | Évfolyam: ${data.session.grade_level}. évfolyam | Mód: ${data.session.mode} | Befejezve: ${endedFormatted}`;
        if (btnFinishSession) btnFinishSession.style.display = 'none';
        if (badgeSessionFinished) badgeSessionFinished.style.display = 'inline-block';
      } else {
        if (sessionBadgeChannel) {
          sessionBadgeChannel.className = 'live-badge badge-active';
          sessionBadgeChannel.textContent = '🟢 ÉLŐ';
        }
        if (tabBtnLive) {
          tabBtnLive.textContent = '📊 Élő Dolgozat (Mátrix)';
        }
        liveSessionTitle.textContent = data.session.quiz_title;
        liveSessionInfo.textContent = `Tantárgy: ${data.session.subject_name} | Évfolyam: ${data.session.grade_level}. évfolyam | Mód: ${data.session.mode}`;
        if (btnFinishSession) btnFinishSession.style.display = 'inline-block';
        if (badgeSessionFinished) badgeSessionFinished.style.display = 'none';
      }

      // Export linkek beállítása
      btnExportExcel.href = `/api/admin/export/excel/${sessionId}`;
      btnExportHtml.href = `/api/admin/export/html/${sessionId}`;
      btnExportZip.href = `/api/admin/export/zip/${sessionId}`;
      if (btnExportPrint) {
        btnExportPrint.href = `/print?sessionId=${sessionId}`;
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
    noActiveSessionBox.style.display = 'block';
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
   * Élő Mátrix Táblázat Kirajzolása
   */
  function renderMatrix(data) {
    const { questions, participants, answers, session } = data;

    // Fejléc sor összeállítása
    matrixHeadRow.innerHTML = `
      <th class="col-name">Tanuló neve</th>
      <th>Gép</th>
    `;

    questions.forEach((q, idx) => {
      const th = document.createElement('th');
      th.innerHTML = `K${idx + 1}<br><span style="font-size: 0.75rem; font-weight: normal;">(${q.points}p)</span>`;
      th.title = q.question_text;
      matrixHeadRow.appendChild(th);
    });

    matrixHeadRow.innerHTML += `
      <th>Összpont</th>
      <th>%</th>
      <th>Jegy</th>
      <th>Fókusz</th>
      <th>Művelet</th>
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
      emptyRow.innerHTML = `<td colspan="${questions.length + 7}" style="text-align: center; color: var(--text-muted); padding: 24px;">Még nem csatlakozott diák a dolgozathoz.</td>`;
      matrixBody.appendChild(emptyRow);
      return;
    }

    participants.forEach(p => {
      const tr = document.createElement('tr');

      // 1. Név és befejezett állapot
      const tdName = document.createElement('td');
      tdName.className = 'col-name';
      tdName.innerHTML = `<strong>${escapeHtml(p.student_name)}</strong> ${p.is_finished ? '✅' : ''}`;
      tr.appendChild(tdName);

      // 2. Gépszám
      const tdPc = document.createElement('td');
      tdPc.textContent = p.pc_number ? `${p.pc_number}` : '–';
      tr.appendChild(tdPc);

      // 3. Kérdés cellák (1-kattintásos felülbírálás!)
      questions.forEach(q => {
        const tdQ = document.createElement('td');
        const ans = answerMap.get(`${p.id}:${q.id}`);

        if (!ans) {
          tdQ.className = 'matrix-cell cell-empty';
          tdQ.textContent = '–';
        } else {
          if (ans.eval_status === 'CORRECT') {
            tdQ.className = 'matrix-cell cell-correct';
            tdQ.textContent = `${ans.points_earned}p`;
          } else if (ans.eval_status === 'PARTIAL') {
            tdQ.className = 'matrix-cell cell-partial';
            tdQ.textContent = `${ans.points_earned}p`;
          } else {
            tdQ.className = 'matrix-cell cell-wrong';
            tdQ.textContent = '0p';
          }

          tdQ.title = `Diák válasza: ${ans.submitted_answer} (Kattints a felülbíráláshoz)`;

          // 1-kattintásos állapotváltás: CORRECT -> PARTIAL -> WRONG -> CORRECT
          tdQ.addEventListener('click', async () => {
            let nextStatus = 'CORRECT';
            if (ans.eval_status === 'CORRECT') nextStatus = 'PARTIAL';
            else if (ans.eval_status === 'PARTIAL') nextStatus = 'WRONG';
            else nextStatus = 'CORRECT';

            await overrideCell(ans.id, nextStatus);
          });
        }

        tr.appendChild(tdQ);
      });

      // 4. Összpontszám
      const tdPoints = document.createElement('td');
      tdPoints.innerHTML = `<strong>${p.total_points}</strong> / ${data.totalMaxPoints}`;
      tr.appendChild(tdPoints);

      // 5. Százalék
      const tdPct = document.createElement('td');
      tdPct.textContent = `${p.percentage}%`;
      tr.appendChild(tdPct);

      // 6. KRÉTA érdemjegy
      const tdGrade = document.createElement('td');
      tdGrade.innerHTML = `<span style="font-size: 1.1rem; font-weight: 700;">${p.grade}</span>`;
      tr.appendChild(tdGrade);

      // 7. Fókuszvesztések
      const tdFocus = document.createElement('td');
      if (p.focus_lost_count > 0) {
        tdFocus.innerHTML = `<span class="focus-alert">⚠️ ${p.focus_lost_count}x</span>`;
      } else {
        tdFocus.textContent = '0';
      }
      tr.appendChild(tdFocus);

      // 8. Diák műveletek: Gépváltás adatvesztés nélkül és Téves névfoglalás törlése (Report 12 / 2.2)
      const tdAction = document.createElement('td');
      tdAction.style.whiteSpace = 'nowrap';

      if (!p.is_finished && session && session.status === 'ACTIVE') {
        const btnSeatChange = document.createElement('button');
        btnSeatChange.className = 'btn btn-secondary';
        btnSeatChange.style.padding = '4px 6px';
        btnSeatChange.style.fontSize = '0.78rem';
        btnSeatChange.style.marginRight = '4px';
        btnSeatChange.innerHTML = '💺 Gépváltás';
        btnSeatChange.title = 'Gépváltás engedélyezése adatvesztés nélkül (a korábbi válaszok megmaradnak)';
        btnSeatChange.addEventListener('click', async () => {
          if (confirm(`Biztosan engedélyezed a gépváltást ${p.student_name} számára? Az eddigi válaszai megmaradnak, és az új gépéről azonnal folytathatja a dolgozatot.`)) {
            await authorizeSeatChange(p.id);
          }
        });
        tdAction.appendChild(btnSeatChange);
      }

      if (session && session.status === 'ACTIVE') {
        const btnReset = document.createElement('button');
        btnReset.className = 'btn btn-secondary';
        btnReset.style.padding = '4px 6px';
        btnReset.style.fontSize = '0.78rem';
        btnReset.innerHTML = '🗑️ Név törlése';
        btnReset.title = 'Téves névválasztás visszavonása (törli a rekordot és a válaszokat)';
        btnReset.addEventListener('click', async () => {
          if (confirm(`FIGYELEM: Biztosan törlöd ${p.student_name} nevét a dolgozatból? Ez törli a tanuló eddigi válaszait téves névválasztás esetén!`)) {
            await resetParticipant(p.id);
          }
        });
        tdAction.appendChild(btnReset);
      }

      tr.appendChild(tdAction);

      matrixBody.appendChild(tr);
    });
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
        alert(err.error || 'Hiba a felülbíráláskor!');
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
        alert(err.error || 'Hiba a gépváltás engedélyezésekor!');
      }
    } catch (err) {
      console.error('Hiba a gépváltáskor:', err);
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
        alert(err.error || 'Hiba a név törlésekor!');
      }
    } catch (err) {
      console.error('Hiba a név törlésekor:', err);
    }
  }

  // Kompatibilitási névfeloldó alias
  async function unlockParticipant(participantId) {
    return resetParticipant(participantId);
  }

  // Dolgozat befejezése (Finish)
  btnFinishSession.addEventListener('click', async () => {
    if (!currentSessionId) return;
    if (!confirm('Biztosan befejezed és lezárod a dolgozatot? A tanulók több választ már nem küldhetnek be.')) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/sessions/${currentSessionId}/finish`, { method: 'POST' });
      if (res.ok) {
        showToast('Dolgozat sikeresen lezárva!', 'success');
        await loadActiveSessions();
        await switchSession(currentSessionId);
      } else {
        const err = await res.json();
        alert(err.error || 'Hiba a dolgozat lezárásakor!');
      }
    } catch (err) {
      console.error('Hiba a dolgozat lezárásakor:', err);
    }
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
        alert(data.error || 'Hiba a dolgozat indításakor!');
      }
    } catch (err) {
      alert('Hálózati hiba a dolgozat indításakor!');
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

      // Tesztszerkesztő lista kártyái
      quizzesListContainer.innerHTML = '';
      quizzesList.forEach(q => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.margin = '0';

        const isLocked = q.locked_at !== null;
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <h4 style="font-size: 1.1rem;">${escapeHtml(q.title)}</h4>
            <span style="font-size: 0.8rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; ${isLocked ? 'background:#fee2e2; color:#991b1b;' : 'background:#dcfce7; color:#166534;'}">
              ${isLocked ? '🔒 Zárolt' : '🟢 Szerkeszthető'}
            </span>
          </div>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 14px;">
            Tantárgy: ${escapeHtml(q.subject_name)} | Évfolyam: ${escapeHtml(q.subject_grade)}. évf. | Kérdések: ${q.question_count} db (${q.total_points} pont)
          </p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${isLocked
              ? `<button class="btn btn-secondary btn-duplicate" data-id="${q.id}">📋 Másolat (Duplikálás)</button>`
              : `<button class="btn btn-primary btn-edit" data-id="${q.id}">✏️ Szerkesztés</button>
                 <button class="btn btn-secondary btn-duplicate" data-id="${q.id}">📋 Másolás</button>
                 <button class="btn btn-danger btn-delete" data-id="${q.id}">🗑️ Törlés</button>`
            }
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
            if (confirm(`Készítesz egy független, szerkeszthető másolatot a(z) „${q.title}” tesztből?`)) {
              await duplicateQuiz(q.id);
            }
          });
        }

        const btnDel = card.querySelector('.btn-delete');
        if (btnDel) {
          btnDel.addEventListener('click', async () => {
            if (confirm(`Biztosan törlöd a(z) „${q.title}” tesztet?`)) {
              await deleteQuiz(q.id);
            }
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
        alert(data.error || 'Hiba a másolás során!');
      }
    } catch (err) {
      alert('Hálózati hiba a másoláskor!');
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
        alert(err.error || 'Hiba a törlés során!');
      }
    } catch (err) {
      alert('Hálózati hiba a törléskor!');
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
      alert('A teszt címe kötelező!');
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
        alert(data.error || 'Hiba a mentés során!');
      }
    } catch (err) {
      alert('Hálózati hiba a mentéskor!');
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
        alert(data.error || 'Hiba a névsor mentésekor!');
      }
    } catch (err) {
      alert('Hálózati hiba a mentés során!');
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
        alert(err.error || 'Hiba az osztály törlésekor!');
      }
    } catch (err) {
      alert('Hálózati hiba a törléskor!');
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
          </div>
        </td>
      `;

      const btnView = tr.querySelector('.btn-view-report');
      if (btnView) {
        btnView.addEventListener('click', () => {
          switchSession(s.id);
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

