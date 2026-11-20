/**
 * student.js - Diák kliensoldali logika (Zero-Build Vanilla ES6, 100% Offline)
 */

(function () {
  'use strict';

  // Állapotváltozók
  let socket = null;
  let pcNumber = null;
  let selectedSubjectId = null;
  let selectedClass = null;
  let selectedStudent = null;
  let selectedTeamColor = 'Kék';
  let activeSession = null;
  let sessionToken = null;

  let currentQuiz = null;
  let currentQuestions = [];
  let currentQuestionIndex = 0;
  let answeredQuestionIds = new Set();
  let questionStartTime = Date.now();
  let timerInterval = null;

  // DOM elemek gyors elérése
  const studentEntryWrapper = document.querySelector('.student-entry-wrapper');
  const studentEntryInner = document.querySelector('.student-entry-inner');
  const pcBadge = document.getElementById('pc-badge');
  const pcNumberText = document.getElementById('pc-number-text');
  const entryPcBadge = document.getElementById('entry-pc-badge');
  const entryPcNumberText = document.getElementById('entry-pc-number-text');
  const timerBadge = document.getElementById('timer-badge');
  const timerText = document.getElementById('timer-text');

  // Dolgozat fejléc elemek (Admin Live Badge stílusú csatorna-jelvénnyel)
  const quizTopBar = document.getElementById('quiz-top-bar');
  const quizLiveChannelBadge = document.getElementById('quiz-live-channel-badge');
  const quizLiveChannelDot = document.getElementById('quiz-live-channel-dot');
  const quizLiveChannelText = document.getElementById('quiz-live-channel-text');
  const quizHeaderUsername = document.getElementById('quiz-header-username');
  const btnQuizExit = document.getElementById('btn-quiz-exit');

  // Kilépés megerősítő párbeszédpanel elemei
  const modalConfirmExit = document.getElementById('modal-confirm-exit');
  const btnCancelExit = document.getElementById('btn-cancel-exit');
  const btnConfirmExit = document.getElementById('btn-confirm-exit');
  const btnExitModalClose = document.getElementById('btn-exit-modal-close');

  // Értesítő és figyelmeztető modál elemei (Calm stílus)
  const modalAlert = document.getElementById('modal-alert');
  const modalAlertTitle = document.getElementById('modal-alert-title');
  const modalAlertMessage = document.getElementById('modal-alert-message');
  const modalAlertIcon = document.getElementById('modal-alert-icon');
  const modalAlertIconBadge = document.getElementById('modal-alert-icon-badge');
  const btnModalAlertOk = document.getElementById('btn-modal-alert-ok');
  const btnModalAlertClose = document.getElementById('btn-modal-alert-close');
  let modalAlertCloseCallback = null;

  // Tanári bejelentkezési elemek
  const btnOpenLogin = document.getElementById('btn-open-login');
  const loginModal = document.getElementById('login-modal');
  const inputPin = document.getElementById('input-pin');
  const btnLoginSubmit = document.getElementById('btn-login-submit');
  const btnLoginCancel = document.getElementById('btn-login-cancel');
  const btnLoginClose = document.getElementById('btn-login-close');
  const btnTogglePinVisibility = document.getElementById('btn-toggle-pin-visibility');
  const eyeIcon = document.getElementById('eye-icon');
  const teacherLoginError = document.getElementById('teacher-login-error');
  const teacherLoginErrorText = document.getElementById('teacher-login-error-text');
  const studentTopBar = document.getElementById('student-top-bar');
  const formTeacherLogin = document.getElementById('form-teacher-login');

  // Belépési lenyíló listák és gombok (2 lépéses varázsló, 0 Gépelés)
  const loginContainer = document.getElementById('login-container');
  const loginStep1 = document.getElementById('login-step-1');
  const loginStep2 = document.getElementById('login-step-2');
  const btnStep1Next = document.getElementById('btn-step1-next');
  const btnStep2Back = document.getElementById('btn-step2-back');
  const selectSubject = document.getElementById('select-subject');
  const selectClass = document.getElementById('select-class');
  const selectStudent = document.getElementById('select-student');
  const sessionInfoBox = document.getElementById('session-info-box');
  const sessionInfoContent = document.getElementById('session-info-content');
  const stepTeam = document.getElementById('step-team');
  const btnJoinSession = document.getElementById('btn-join-session');

  // Tanulók gyorsítótára az osztályhoz (id -> student object)
  const studentsMap = new Map();
  let currentOccupiedStudentIds = new Set();
  const DEFAULT_CLASSES = [
    '3.a', '3.b', '3.c',
    '4.a', '4.b', '4.c',
    '5.a', '5.b', '5.c',
    '6.a', '6.b', '6.c',
    '7.a', '7.b', '7.c',
    '8.a', '8.b', '8.c'
  ];

  const quizContainer = document.getElementById('quiz-container');
  const lobbyContainer = document.getElementById('lobby-container');
  const lobbyRocketBadge = document.getElementById('lobby-rocket-badge');
  const lobbyTeamName = document.getElementById('lobby-team-name');
  const quizTitle = document.getElementById('quiz-title');
  const studentDisplayName = document.getElementById('student-display-name');

  // Új Calm Learner állapot és haladás elemek
  const questionProgress = document.getElementById('question-progress');
  const questionTypeBadge = document.getElementById('question-type-badge');
  const quizMetricScoreVal = document.getElementById('quiz-metric-score-val');
  const quizMetricScoreChip = document.getElementById('quiz-metric-score-chip');
  const quizMetricGradeVal = document.getElementById('quiz-metric-grade-val');
  const quizProgressBarFill = document.getElementById('quiz-progress-bar-fill');
  const progressTextDone = document.getElementById('progress-text-done');
  const progressTextCurrent = document.getElementById('progress-text-current');
  const progressTextRemaining = document.getElementById('progress-text-remaining');

  // Kérdés kártya elemei
  const quizCardsRow = document.getElementById('quiz-cards-row');
  const quizMainCard = document.getElementById('quiz-main-card');
  const quizQnumText = document.getElementById('quiz-qnum-text');
  const questionText = document.getElementById('question-text');
  const questionHintText = document.getElementById('question-hint-text');
  const questionImageBox = document.getElementById('question-image-box');
  const questionImage = document.getElementById('question-image');
  const btnZoomImage = document.getElementById('btn-zoom-image');
  const modalImageLightbox = document.getElementById('modal-image-lightbox');
  const lightboxFullImage = document.getElementById('lightbox-full-image');
  const btnCloseLightbox = document.getElementById('btn-close-lightbox');
  const optionsContainer = document.getElementById('options-container');
  const shortAnswerContainer = document.getElementById('short-answer-container');
  const shortAnswerInput = document.getElementById('short-answer-input');
  const actionButtonsBox = document.getElementById('action-buttons-box');
  const btnSubmitAnswer = document.getElementById('btn-submit-answer');

  // Socrative visszajelzés kártya elemei
  const feedbackCard = document.getElementById('feedback-card');
  const feedbackIconWrap = document.getElementById('feedback-icon-wrap');
  const feedbackIcon = document.getElementById('feedback-icon');
  const feedbackTitle = document.getElementById('feedback-title');
  const feedbackPoints = document.getElementById('feedback-points');
  const feedbackBody = document.getElementById('feedback-body');
  const btnNextQuestion = document.getElementById('btn-next-question');

  const summaryContainer = document.getElementById('summary-container');
  const finalScore = document.getElementById('final-score');
  const finalGrade = document.getElementById('final-grade');
  const btnRestartStudent = document.getElementById('btn-restart-student');

  // Új Calm Learner értékelő felület DOM elemei
  const summaryGreeting = document.getElementById('summary-greeting');
  const summaryPerformanceBadge = document.getElementById('summary-performance-badge');
  const summaryPerformanceText = document.getElementById('summary-performance-text');
  const summaryCircleBar = document.getElementById('summary-circle-bar');
  const summaryPercentVal = document.getElementById('summary-percent-val');
  const summaryGradeNum = document.getElementById('summary-grade-num');
  const summaryGradeQuote = document.getElementById('summary-grade-quote');
  const summaryTimeSpent = document.getElementById('summary-time-spent');
  const summaryQuestionsCount = document.getElementById('summary-questions-count');
  const summaryQuestionsList = document.getElementById('summary-questions-list');
  const summaryPortalPopover = document.getElementById('summary-portal-popover');
  const summaryPortalBody = document.getElementById('summary-portal-body');
  const summaryPortalExp = document.getElementById('summary-portal-exp');
  let activePortalButton = null;

  // Dinamikus eredmény- és jegyszámítási állapot
  let earnedPoints = 0;
  let sessionThresholds = { 2: 30, 3: 55, 4: 75, 5: 90 };
  let quizStartTime = null;
  const studentSubmittedAnswers = new Map();

  /**
   * Alkalmazás inicializálása
   */
  async function init() {
    // 1. Gépszám és Tanári munkaállomás felismerése az URL-ből (?gep=X vagy ?pc=X vagy ?gep=tanar)
    const gepParam = getUrlParam('gep') || getUrlParam('pc');
    let isTeacherWorkstation = false;
    if (gepParam) {
      const gepLower = gepParam.trim().toLowerCase();
      if (gepLower === 'tanar' || gepLower === 'tanari') {
        isTeacherWorkstation = true;
        if (pcNumberText) pcNumberText.textContent = 'Tanári munkaállomás';
        if (entryPcNumberText) entryPcNumberText.textContent = 'Tanári munkaállomás';
        if (entryPcBadge) entryPcBadge.style.display = 'inline-flex';
      } else {
        pcNumber = parseInt(gepParam, 10);
        if (!isNaN(pcNumber) && pcNumber >= 1 && pcNumber <= 42) {
          if (pcNumberText) pcNumberText.textContent = `${pcNumber}. gép`;
          if (entryPcNumberText) entryPcNumberText.textContent = `${pcNumber}. gép`;
          if (entryPcBadge) entryPcBadge.style.display = 'inline-flex';
        }
      }
    }

    // 2. Felületi eseménykezelők azonnali regisztrálása (Modalok, Kilépés gomb, stb.)
    setupCommonUIListeners();

    // 3. Tanári munkaállomás kényelmi automatizmus (?gep=tanar):
    // Ha a tanári gépről nyitották meg a felületet és nincs folyamatban lévő diák token
    if (isTeacherWorkstation && !sessionStorage.getItem('ropdolgozat_token')) {
      try {
        const authRes = await fetch('/api/auth/check');
        const authData = await authRes.json();
        if (authData && authData.isAuthenticated) {
          window.location.href = '/admin';
          return;
        } else {
          openModal('login-modal');
          if (inputPin) {
            setTimeout(() => inputPin.focus(), 150);
          }
        }
      } catch (err) {
        console.warn('Nem sikerült ellenőrizni a tanári hitelesítést:', err);
      }
    }

    // 4. Socket.io kapcsolat
    if (typeof io !== 'undefined') {
      socket = io();
      setupSocketListeners();
    }

    // 5. Fókuszvesztés figyelő regisztrálása
    setupFocusListener();

    // 6. Mentett munkamenet ellenőrzése (Session Recovery újranyitás esetén)
    const savedToken = sessionStorage.getItem('ropdolgozat_token');
    if (savedToken) {
      const restored = await tryRestoreSession(savedToken);
      if (restored) return;
    }

    // 7. Tantárgyak és osztályok betöltése az 1. fázishoz
    await loadSubjects();
    await loadClasses();
  }

  /**
   * Socket.io események kezelése
   */
  function setupSocketListeners() {
    socket.on('session:finished', (data) => {
      if (activeSession && String(data.sessionId) === String(activeSession.id)) {
        showToast('A tanár lezárta a dolgozatot!', 'warning');
        finishQuiz();
      }
    });

    socket.on('participant:kicked', (data) => {
      // Csak akkor lépünk ki, ha az esemény kifejezetten a mi munkamenetünket vagy tanulónkat célozza
      const matchesParticipant = data && currentParticipant && String(data.participantId) === String(currentParticipant.id);
      const matchesStudent = data && data.studentId && selectedStudent && String(data.studentId) === String(selectedStudent.id);
      const isTargeted = data && (data.participantId || data.studentId);

      if (!isTargeted || matchesParticipant || matchesStudent) {
        sessionStorage.removeItem('ropdolgozat_token');
        showCalmAlert('A tanár feloldotta a munkamenetedet vagy engedélyezte a gépváltást. Az oldal újratöltődik.', 'Munkamenet feloldva', 'info', () => {
          window.location.reload();
        });
      }
    });

    // Űrhajós verseny rajtot jelző esemény (Space Race indítása - Report 14 / 16. pont)
    socket.on('race:started', async (data) => {
      if (activeSession && (!data || !data.sessionId || String(data.sessionId) === String(activeSession.id))) {
        showToast('🚀 A verseny elindult! Sok sikert!', 'success');
        // Kérdések és elindított időzítő azonnali lekérése a szerverről
        await startQuizInterface(null);
      }
    });

    // Ha a tanár elindít egy új dolgozatot, azonnal reagál a diák felület, ha a 2. lépésben van
    socket.on('badges:updated', () => {
      if (!sessionToken && selectedSubjectId && selectedClass && loginStep2 && loginStep2.style.display !== 'none') {
        checkActiveSession();
      }
    });

    // Valós idejű tanulói névfoglalás és jelenlét frissítése (aktív teszt nélkül is)
    socket.on('students:occupied_updated', (data) => {
      if (data && selectedClass && String(data.className) === String(selectedClass)) {
        currentOccupiedStudentIds = new Set((data.occupiedStudentIds || []).map(String));
        updateStudentOptionsOccupied();
      }
    });

    // Újracsatlakozáskor a foglaltsági állapot és az aktív szobatagság megújítása (Report 14 / 20.)
    socket.on('connect', () => {
      if (selectedClass && loginStep2 && loginStep2.style.display !== 'none') {
        socket.emit('student:get_occupied', { className: selectedClass });
      }
      if (activeSession && sessionToken) {
        socket.emit('join:session', { sessionId: activeSession.id, role: 'student', token: sessionToken });
      }
    });
  }

  /**
   * Stílusos Calm modál figyelmeztető / tájékoztató ablak megjelenítése
   * @param {string} message - A megjelenítendő üzenet
   * @param {string} [title='Figyelmeztetés'] - Az ablak címe
   * @param {string} [type='warning'] - Típus: 'warning' | 'error' | 'info' | 'success'
   * @param {Function} [onClose] - Opcionális hívandó függvény a bezáráskor
   */
  function showCalmAlert(message, title = 'Figyelmeztetés', type = 'warning', onClose = null) {
    if (!modalAlert) {
      alert(message);
      if (typeof onClose === 'function') onClose();
      return;
    }

    modalAlertCloseCallback = onClose;
    if (modalAlertTitle) modalAlertTitle.textContent = title;
    if (modalAlertMessage) modalAlertMessage.textContent = message;

    if (modalAlertIcon && modalAlertIconBadge) {
      if (type === 'error') {
        modalAlertIcon.textContent = 'error';
        modalAlertIconBadge.style.backgroundColor = 'var(--danger-bg)';
        modalAlertIconBadge.style.color = 'var(--danger)';
      } else if (type === 'info') {
        modalAlertIcon.textContent = 'info';
        modalAlertIconBadge.style.backgroundColor = 'var(--surface-high)';
        modalAlertIconBadge.style.color = 'var(--primary)';
      } else if (type === 'success') {
        modalAlertIcon.textContent = 'task_alt';
        modalAlertIconBadge.style.backgroundColor = 'var(--success-bg)';
        modalAlertIconBadge.style.color = 'var(--success)';
      } else {
        // Alapértelmezett: warning
        modalAlertIcon.textContent = 'warning';
        modalAlertIconBadge.style.backgroundColor = 'var(--secondary-fixed)';
        modalAlertIconBadge.style.color = 'var(--on-secondary-fixed)';
      }
    }

    openModal('modal-alert');
  }

  /**
   * Calm modál figyelmeztető ablak bezárása és callback végrehajtása
   */
  function closeCalmAlert() {
    closeModal('modal-alert');
    if (typeof modalAlertCloseCallback === 'function') {
      const cb = modalAlertCloseCallback;
      modalAlertCloseCallback = null;
      cb();
    }
  }

  /**
   * Tanulók lenyíló listájának vizuális frissítése (foglalt nevek kiszürkítése és inaktívvá tétele)
   */
  function updateStudentOptionsOccupied() {
    if (!selectStudent || !selectStudent.options) return;

    for (let i = 1; i < selectStudent.options.length; i++) {
      const opt = selectStudent.options[i];
      const stuId = opt.value;
      const stu = studentsMap.get(stuId);
      if (!stu) continue;

      const isOccupiedByOther = currentOccupiedStudentIds.has(stuId) &&
        (!selectedStudent || String(selectedStudent.id) !== stuId);

      if (isOccupiedByOther) {
        opt.disabled = true;
        opt.textContent = `${stu.student_name} (már bejelentkezett)`;
      } else {
        opt.disabled = false;
        opt.textContent = stu.student_name;
      }
    }
  }

  /**
   * Közös felület eseménykezelői (Tanári belépés és lenyíló listák)
   */
  function setupCommonUIListeners() {
    // Tanári belépés modal kezelése
    if (btnOpenLogin) {
      btnOpenLogin.addEventListener('click', () => {
        openModal('login-modal');
        if (teacherLoginError) teacherLoginError.style.display = 'none';
        if (inputPin) {
          inputPin.value = '';
          inputPin.type = 'password';
          if (eyeIcon) eyeIcon.textContent = 'visibility';
          setTimeout(() => inputPin.focus(), 100);
        }
      });
    }

    if (btnLoginClose) {
      btnLoginClose.addEventListener('click', () => {
        closeModal('login-modal');
      });
    }

    if (btnTogglePinVisibility && inputPin && eyeIcon) {
      btnTogglePinVisibility.addEventListener('click', () => {
        const isPassword = inputPin.type === 'password';
        inputPin.type = isPassword ? 'text' : 'password';
        eyeIcon.textContent = isPassword ? 'visibility_off' : 'visibility';
      });
    }

    if (btnLoginCancel) {
      btnLoginCancel.addEventListener('click', () => {
        closeModal('login-modal');
      });
    }

    if (formTeacherLogin) {
      formTeacherLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pin = inputPin.value.trim();
        if (!pin) {
          inputPin.focus();
          return;
        }

        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            window.location.href = '/admin';
          } else {
            if (teacherLoginError) {
              teacherLoginError.style.display = 'flex';
              if (teacherLoginErrorText) {
                teacherLoginErrorText.textContent = data.message || 'Helytelen tanári jelszó! Próbáld újra.';
              }
            } else {
              showCalmAlert(data.message || 'Helytelen tanári jelszó!', 'Hiba', 'error');
            }
            inputPin.value = '';
            inputPin.focus();
          }
        } catch (err) {
          if (teacherLoginError) {
            teacherLoginError.style.display = 'flex';
            if (teacherLoginErrorText) {
              teacherLoginErrorText.textContent = 'Hálózati hiba a bejelentkezés során!';
            }
          } else {
            showCalmAlert('Hálózati hiba a bejelentkezés során!', 'Hálózati hiba', 'error');
          }
        }
      });
    }

    // Tantárgyválasztó lenyíló lista
    if (selectSubject) {
      selectSubject.addEventListener('change', () => {
        selectedSubjectId = parseInt(selectSubject.value, 10);
        if (loginStep2 && loginStep2.style.display !== 'none') {
          checkActiveSession();
        }
      });
    }

    // Osztályválasztó lenyíló lista
    if (selectClass) {
      selectClass.addEventListener('change', async () => {
        if (socket && selectedStudent) {
          socket.emit('student:release_name');
        }
        selectedStudent = null;
        selectedClass = selectClass.value;
        if (loginStep2 && loginStep2.style.display !== 'none') {
          await checkActiveSession();
          await loadStudentsForClass(selectedClass);
        }
      });
    }

    // 1. lépés: Következő gomb kezelője (átváltás a 2. fázisra)
    if (btnStep1Next) {
      btnStep1Next.addEventListener('click', async () => {
        if (!selectedSubjectId || !selectedClass) return;
        if (loginStep1) loginStep1.style.display = 'none';
        if (loginStep2) loginStep2.style.display = 'flex';

        await checkActiveSession();
        await loadStudentsForClass(selectedClass);
        if (selectStudent) {
          selectStudent.focus();
        }
      });
    }

    // 2. lépés: Vissza gomb kezelője (visszatérés az 1. fázisra)
    if (btnStep2Back) {
      btnStep2Back.addEventListener('click', () => {
        if (socket && selectedStudent) {
          socket.emit('student:release_name');
        }
        selectedStudent = null;
        if (selectStudent) selectStudent.value = '';
        if (btnJoinSession) btnJoinSession.disabled = true;
        if (stepTeam) stepTeam.style.display = 'none';
        if (loginStep2) loginStep2.style.display = 'none';
        if (loginStep1) loginStep1.style.display = 'flex';
      });
    }

    // Névválasztó lenyíló lista
    if (selectStudent) {
      selectStudent.addEventListener('change', () => {
        const stuId = selectStudent.value;
        if (stuId && studentsMap.has(stuId)) {
          selectedStudent = studentsMap.get(stuId);
          if (socket) {
            socket.emit('student:claim_name', {
              className: selectedClass,
              studentId: selectedStudent.id,
              studentName: selectedStudent.student_name,
              pcNumber
            }, (res) => {
              if (res && !res.success) {
                showCalmAlert(
                  res.message || 'Ezt a tanulót már kiválasztották egy másik gépen.',
                  'A név már foglalt',
                  'warning'
                );
                selectedStudent = null;
                selectStudent.value = '';
                if (btnJoinSession) btnJoinSession.disabled = true;
                if (stepTeam) stepTeam.style.display = 'none';
              }
            });
          }
          if (activeSession) {
            if (activeSession.mode === 'SPACE_RACE') {
              if (stepTeam) stepTeam.style.display = 'block';
            } else {
              if (stepTeam) stepTeam.style.display = 'none';
            }
            if (btnJoinSession) btnJoinSession.disabled = false;
          } else {
            if (btnJoinSession) btnJoinSession.disabled = true;
          }
        } else {
          selectedStudent = null;
          if (socket) {
            socket.emit('student:release_name');
          }
          if (btnJoinSession) btnJoinSession.disabled = true;
          if (stepTeam) stepTeam.style.display = 'none';
        }
      });
    }

    // Csatlakozás gomb
    if (btnJoinSession) {
      btnJoinSession.addEventListener('click', () => {
        joinQuiz();
      });
    }

    // Dolgozat megszakítása és kilépési modal eseménykezelői
    if (btnQuizExit) {
      btnQuizExit.addEventListener('click', () => {
        openModal('modal-confirm-exit');
      });
    }

    if (btnCancelExit) {
      btnCancelExit.addEventListener('click', () => {
        closeModal('modal-confirm-exit');
      });
    }

    if (btnExitModalClose) {
      btnExitModalClose.addEventListener('click', () => {
        closeModal('modal-confirm-exit');
      });
    }

    if (btnConfirmExit) {
      btnConfirmExit.addEventListener('click', () => {
        closeModal('modal-confirm-exit');
        finishQuiz();
      });
    }

    // Calm stílusú figyelmeztető és értesítő modál eseménykezelői
    if (btnModalAlertOk) {
      btnModalAlertOk.addEventListener('click', closeCalmAlert);
    }
    if (btnModalAlertClose) {
      btnModalAlertClose.addEventListener('click', closeCalmAlert);
    }
    if (modalAlert) {
      modalAlert.addEventListener('click', (e) => {
        if (e.target === modalAlert) {
          closeCalmAlert();
        }
      });
    }

    // Lightbox képnagyító kezelése
    function openImageLightbox() {
      if (!questionImage || !questionImage.src || !modalImageLightbox) return;
      if (lightboxFullImage) lightboxFullImage.src = questionImage.src;
      openModal('modal-image-lightbox');
    }

    function closeImageLightbox() {
      closeModal('modal-image-lightbox');
      if (lightboxFullImage) lightboxFullImage.src = '';
    }

    if (questionImage) {
      questionImage.addEventListener('click', openImageLightbox);
    }
    if (btnZoomImage) {
      btnZoomImage.addEventListener('click', openImageLightbox);
    }
    if (btnCloseLightbox) {
      btnCloseLightbox.addEventListener('click', closeImageLightbox);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalImageLightbox && modalImageLightbox.classList.contains('active')) {
        closeImageLightbox();
      }
    });
  }

  /**
   * Élő mérőszámok (Eredmény % és Érdemjegy) frissítése a felső kártyán
   */
  function updateLiveMetrics() {
    const answeredCount = answeredQuestionIds.size;
    if (answeredCount === 0) {
      if (quizMetricScoreVal) quizMetricScoreVal.textContent = '–';
      if (quizMetricGradeVal) quizMetricGradeVal.textContent = '–';
      if (quizMetricScoreChip) {
        quizMetricScoreChip.classList.remove('grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5');
      }
      return;
    }

    let totalMaxPoints = 0;
    if (currentQuestions && currentQuestions.length > 0) {
      totalMaxPoints = currentQuestions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);
    } else if (currentQuiz && currentQuiz.total_points > 0) {
      totalMaxPoints = currentQuiz.total_points;
    }
    if (totalMaxPoints <= 0) {
      totalMaxPoints = (currentQuestions && currentQuestions.length) || 1;
    }

    const percentage = Math.min(100, Math.round((earnedPoints / totalMaxPoints) * 100));
    const grade = calculateKRÉTAGrade(percentage, sessionThresholds);

    if (quizMetricScoreVal) quizMetricScoreVal.textContent = `${percentage}%`;
    if (quizMetricGradeVal) quizMetricGradeVal.textContent = `${grade}`;
    if (quizMetricScoreChip) {
      quizMetricScoreChip.classList.remove('grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5');
      quizMetricScoreChip.classList.add(`grade-${grade}`);
    }
  }

  /**
   * Hivatalos KRÉTA érdemjegy számítása a százalékból
   */
  function calculateKRÉTAGrade(percentage, thresholds) {
    const pct = Math.round(Number(percentage) || 0);
    const t = thresholds || { 2: 30, 3: 55, 4: 75, 5: 90 };
    const t5 = Number(t[5] ?? t['5'] ?? 90);
    const t4 = Number(t[4] ?? t['4'] ?? 75);
    const t3 = Number(t[3] ?? t['3'] ?? 55);
    const t2 = Number(t[2] ?? t['2'] ?? 30);

    if (pct >= t5) return 5;
    if (pct >= t4) return 4;
    if (pct >= t3) return 3;
    if (pct >= t2) return 2;
    return 1;
  }

  /**
   * Szöveges KRÉTA érdemjegy minősítés (MTA 12. kiadása szerint kis kezdőbetűvel)
   */
  function getKRÉTAGradeText(grade) {
    switch (Number(grade)) {
      case 5: return 'jeles';
      case 4: return 'jó';
      case 3: return 'közepes';
      case 2: return 'elégséges';
      case 1: return 'elégtelen';
      default: return '–';
    }
  }

  /**
   * Tantárgyszínek és témák a Csatorna jelvényhez (Admin Live Badge-dzsel egyező)
   */
  function getSubjectTheme(subjName) {
    const norm = String(subjName || '').toLowerCase();
    if (norm.includes('digit') || norm.includes('info') || norm.includes('számít')) {
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

  /**
   * Tantárgyak betöltése a lenyíló listába
   */
  async function loadSubjects() {
    if (!selectSubject) return;
    try {
      const res = await fetch('/api/subjects');
      const subjects = await res.json();
      selectSubject.innerHTML = '';

      subjects.forEach((subj) => {
        const opt = document.createElement('option');
        opt.value = subj.id;
        opt.textContent = subj.name;

        if (subj.is_default) {
          opt.selected = true;
          selectedSubjectId = subj.id;
        }

        selectSubject.appendChild(opt);
      });

      if (!selectedSubjectId && subjects.length > 0) {
        selectedSubjectId = subjects[0].id;
      }
    } catch (err) {
      console.error('Hiba a tantárgyak betöltésekor:', err);
    }
  }

  /**
   * Osztályok betöltése a lenyíló listába (3.a–7.c alapértelmezetten)
   */
  async function loadClasses() {
    if (!selectClass) return;
    try {
      let dbClasses = [];
      try {
        const res = await fetch('/api/classes');
        if (res.ok) {
          dbClasses = await res.json();
        }
      } catch {
        // fallback az alapértelmezett standard osztályokra
      }

      // 3–8. évfolyamos osztályok (az 1–2. évfolyam még nem tanul digitális kultúrát)
      const rawClasses = Array.from(new Set([...DEFAULT_CLASSES, ...(Array.isArray(dbClasses) ? dbClasses : [])]));
      const allClasses = rawClasses.filter(cls => {
        const m = String(cls).match(/^(\d+)/);
        return !m || parseInt(m[1], 10) >= 3;
      });
      selectClass.innerHTML = '';

      allClasses.forEach((cls) => {
        const opt = document.createElement('option');
        opt.value = cls;
        opt.textContent = `${cls} osztály`;

        if (cls === '3.a') {
          opt.selected = true;
          selectedClass = cls;
        }

        selectClass.appendChild(opt);
      });

      if (!selectedClass && allClasses.length > 0) {
        selectedClass = allClasses[0];
      }
    } catch (err) {
      console.error('Hiba az osztályok betöltésekor:', err);
    }
  }

  /**
   * Aktív dolgozat ellenőrzése az adott tantárgyra és évfolyamra
   */
  async function checkActiveSession() {
    if (!selectedSubjectId || !selectedClass || !sessionInfoBox) return;

    // Évfolyam kinyerése az osztály nevéből (pl. "3.a" -> "3", "6.b" -> "6")
    const match = selectedClass.match(/^(\d+)/);
    const gradeLevel = match ? match[1] : '';

    if (!gradeLevel) {
      showToast('Nem sikerült beazonosítani az évfolyamot az osztálynévből!', 'danger');
      return;
    }

    try {
      const res = await fetch(`/api/sessions/active-by-channel?subjectId=${selectedSubjectId}&gradeLevel=${gradeLevel}`);
      activeSession = await res.json();

      if (!activeSession) {
        sessionInfoBox.style.display = 'flex';
        sessionInfoContent.innerHTML = `
          <div style="color: var(--warning); font-weight: 700; font-size: 1.15rem; line-height: 1.5; text-align: center; padding: 16px; background: rgba(245, 158, 11, 0.12); border-radius: 12px; border: 1.5px solid rgba(245, 158, 11, 0.25);">
            ⚠️ Jelenleg nincs aktív dolgozat ehhez az évfolyamhoz (${gradeLevel}. évfolyam).<br>
            Kérlek, várj türelemmel, amíg a tanár elindítja!
          </div>
        `;
        if (stepTeam) stepTeam.style.display = 'none';
        if (btnJoinSession) btnJoinSession.disabled = true;
        return;
      }

      // Van aktív dolgozat!
      sessionInfoBox.style.display = 'flex';
      sessionInfoContent.innerHTML = `
        <div style="color: var(--success); font-weight: 700; font-size: 1.2rem; line-height: 1.5; text-align: center; padding: 16px; background: rgba(34, 197, 94, 0.12); border-radius: 12px; border: 1.5px solid rgba(34, 197, 94, 0.25);">
          🟢 Aktív dolgozat elérhető: <strong>${escapeHtml(activeSession.quiz_title)}</strong>
        </div>
      `;

      if (selectedStudent) {
        if (activeSession.mode === 'SPACE_RACE') {
          if (stepTeam) stepTeam.style.display = 'block';
        } else {
          if (stepTeam) stepTeam.style.display = 'none';
        }
        if (btnJoinSession) btnJoinSession.disabled = false;
      }

    } catch (err) {
      console.error('Hiba az aktív dolgozat ellenőrzésekor:', err);
    }
  }

  /**
   * Osztály hivatalos névsorának betöltése a lenyíló listába
   */
  async function loadStudentsForClass(className) {
    if (!selectStudent) return;
    selectStudent.disabled = true;
    selectStudent.innerHTML = '<option value="">Névsor betöltése...</option>';
    studentsMap.clear();
    selectedStudent = null;
    if (btnJoinSession) btnJoinSession.disabled = true;

    try {
      const res = await fetch(`/api/classes/${encodeURIComponent(className)}/students`);
      const students = await res.json();
      selectStudent.innerHTML = '';

      if (!Array.isArray(students) || students.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- Nincs tanuló rögzítve ebben az osztályban --';
        selectStudent.appendChild(opt);
        selectStudent.disabled = true;
        return;
      }

      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = '-- Válassz a névsorból --';
      selectStudent.appendChild(defaultOpt);

      currentOccupiedStudentIds.clear();
      students.forEach((stu) => {
        const strId = String(stu.id);
        studentsMap.set(strId, stu);
        if (stu.is_occupied) {
          currentOccupiedStudentIds.add(strId);
        }
        const opt = document.createElement('option');
        opt.value = strId;
        const isOccupiedByOther = stu.is_occupied && (!selectedStudent || String(selectedStudent.id) !== strId);
        if (isOccupiedByOther) {
          opt.disabled = true;
          opt.textContent = `${stu.student_name} (már bejelentkezett)`;
        } else {
          opt.textContent = stu.student_name;
        }
        selectStudent.appendChild(opt);
      });

      selectStudent.disabled = false;

      // Friss valós idejű foglalási állapot lekérdezése socketen keresztül is
      if (socket && socket.connected) {
        socket.emit('student:get_occupied', { className });
      }

    } catch (err) {
      console.error('Hiba a diákok betöltésekor:', err);
      selectStudent.innerHTML = '<option value="">Hiba a névsor betöltésekor</option>';
      selectStudent.disabled = true;
    }
  }

  // Space Race színválasztó
  document.querySelectorAll('.color-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.color-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedTeamColor = card.dataset.color;
    });
  });

  /**
   * Belépés a dolgozatba (join)
   */
  async function joinQuiz() {
    if (!activeSession || !selectedStudent) return;

    try {
      const payload = {
        session_id: activeSession.id,
        student_id: selectedStudent.id,
        student_name: selectedStudent.student_name,
        pc_number: pcNumber,
        team_color: activeSession.mode === 'SPACE_RACE' ? selectedTeamColor : null,
        session_token: sessionStorage.getItem('ropdolgozat_token') || null
      };

      const res = await fetch('/api/student/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error || 'Hiba történt a belépés során!';
        const isAlreadyJoined = errorMsg.includes('már csatlakozott');
        showCalmAlert(
          errorMsg,
          isAlreadyJoined ? 'A név már foglalt!' : 'Belépési figyelmeztetés',
          isAlreadyJoined ? 'warning' : 'error'
        );
        if (isAlreadyJoined) {
          selectedStudent = null;
          if (selectStudent) selectStudent.value = '';
          if (btnJoinSession) btnJoinSession.disabled = true;
          if (selectedClass) {
            loadStudentsForClass(selectedClass);
          }
        }
        return;
      }

      sessionToken = data.token;
      sessionStorage.setItem('ropdolgozat_token', sessionToken);

      // Socket szobához csatlakozás hitelesítő tokennel
      if (socket) {
        socket.emit('join:session', { sessionId: activeSession.id, role: 'student', token: sessionToken });
      }

      // Megválaszolt kérdések eltárolása (ha volt)
      if (Array.isArray(data.answers)) {
        data.answers.forEach(ans => answeredQuestionIds.add(ans.question_id));
      }

      // Kvíz felület elindítása
      await startQuizInterface();

    } catch (err) {
      console.error('Hiba a belépés során:', err);
      showCalmAlert('Hálózati hiba a belépéskor! Kérlek, próbáld újra.', 'Hálózati hiba', 'error');
    }
  }

  /**
   * Munkamenet helyreállítása (Session Recovery)
   */
  async function tryRestoreSession(token) {
    try {
      const res = await fetch('/api/student/session-data', {
        headers: { 'x-session-token': token }
      });
      if (!res.ok) {
        sessionStorage.removeItem('ropdolgozat_token');
        return false;
      }

      const data = await res.json();
      sessionToken = token;
      activeSession = {
        id: data.participant.session_id,
        title: data.quiz.title,
        status: data.participant.session_status
      };

      if (socket) {
        socket.emit('join:session', { sessionId: activeSession.id, role: 'student', token: sessionToken });
      }

      if (data.participant.is_finished === 1) {
        showSummary({
          totalPoints: data.results ? data.results.total_points : 0,
          maxPoints: (data.results && data.results.max_points) || (data.quiz && data.quiz.total_points),
          percentage: data.results ? data.results.percentage : 0,
          grade: data.results ? data.results.grade : null,
          gradeText: data.results ? data.results.grade_text : '',
          showFeedback: data.participant.show_feedback_on_end === 1,
          participant: data.participant,
          session: data.session,
          quiz: data.quiz,
          answers: data.answers || []
        });
        return true;
      }

      await startQuizInterface(data);
      return true;
    } catch {
      sessionStorage.removeItem('ropdolgozat_token');
      return false;
    }
  }

  /**
   * Kvíz felület elindítása és kérdések betöltése
   */
  async function startQuizInterface(cachedData = null) {
    let data = cachedData;
    if (!data) {
      const res = await fetch('/api/student/session-data', {
        headers: { 'x-session-token': sessionToken }
      });
      data = await res.json();
    }

    currentQuiz = data.quiz;
    currentQuestions = data.quiz.questions;
    if (!quizStartTime) quizStartTime = Date.now();

    // Korábban leadott válaszok betöltése a memóriába (Recovery esetén)
    if (Array.isArray(data.answers)) {
      data.answers.forEach(a => studentSubmittedAnswers.set(a.question_id, a));
    }

    // Felület váltás
    loginContainer.style.display = 'none';
    if (studentTopBar) studentTopBar.style.display = 'none';

    // Űrhajós verseny ellenőrzése: ha Space Race módban vagyunk és a verseny még nem rajtolt el
    const isSpaceRace = (data.participant && data.participant.session_mode === 'SPACE_RACE') || (activeSession && activeSession.mode === 'SPACE_RACE');
    const isWaitingForStart = data.participant ? (data.participant.is_race_started === false) : true;

    if (isSpaceRace && isWaitingForStart) {
      if (quizContainer) quizContainer.style.display = 'none';
      if (lobbyContainer) {
        lobbyContainer.style.display = 'block';
        const teamColors = {
          'Kék': { bg: '#2563eb', shadow: 'rgba(37, 99, 235, 0.35)' },
          'Piros': { bg: '#dc2626', shadow: 'rgba(220, 38, 38, 0.35)' },
          'Zöld': { bg: '#16a34a', shadow: 'rgba(22, 163, 74, 0.35)' },
          'Sárga': { bg: '#ca8a04', shadow: 'rgba(202, 138, 4, 0.35)' }
        };
        const colorName = (data.participant && data.participant.team_color) || selectedTeamColor || 'Kék';
        const cInfo = teamColors[colorName] || teamColors['Kék'];
        if (lobbyRocketBadge) {
          lobbyRocketBadge.style.backgroundColor = cInfo.bg;
          lobbyRocketBadge.style.boxShadow = `0 8px 24px ${cInfo.shadow}`;
        }
        if (lobbyTeamName) {
          lobbyTeamName.textContent = colorName;
          lobbyTeamName.style.color = cInfo.bg;
        }
      }
      return;
    }

    // Normál dolgozat vagy már elrajtolt verseny
    if (lobbyContainer) lobbyContainer.style.display = 'none';
    if (studentEntryWrapper) studentEntryWrapper.classList.add('quiz-active');
    if (studentEntryInner) studentEntryInner.classList.add('quiz-active');
    if (quizTopBar) quizTopBar.style.display = 'flex';
    quizContainer.style.display = 'block';

    // Fejléc csatorna jelvény frissítése (Admin Live Badge-dzsel egyező)
    const subjName = (data.session && data.session.subject_name) || (selectedSubjectId && selectSubject.options[selectSubject.selectedIndex]?.text) || 'Digitális kultúra';
    const gradeVal = (data.session && data.session.grade_level) || (selectedClass ? selectedClass.split('.')[0] : '6');
    const quizTitleText = (data.session && data.session.quiz_title) || (currentQuiz && currentQuiz.title) || 'Dolgozat';

    const theme = getSubjectTheme(subjName);
    if (quizLiveChannelBadge) {
      quizLiveChannelBadge.className = `live-badge ${theme.cssClass} badge-active`;
    }
    if (quizLiveChannelDot) {
      quizLiveChannelDot.style.backgroundColor = theme.color;
    }
    if (quizLiveChannelText) {
      quizLiveChannelText.innerHTML = `<strong>${escapeHtml(gradeVal)}. évf.</strong> · ${escapeHtml(quizTitleText)}`;
    }

    if (quizHeaderUsername) {
      quizHeaderUsername.textContent = `${data.participant.student_name}${data.participant.pc_number ? ' (' + data.participant.pc_number + '. gép)' : ''}`;
    }

    quizTitle.textContent = currentQuiz.title;
    studentDisplayName.textContent = `${data.participant.student_name} (${data.participant.pc_number ? data.participant.pc_number + '. gép' : 'Diák'})`;

    // Ponthatárok és elért pontok inicializálása
    if (data.session && data.session.grade_thresholds_json) {
      try {
        sessionThresholds = typeof data.session.grade_thresholds_json === 'string'
          ? JSON.parse(data.session.grade_thresholds_json)
          : data.session.grade_thresholds_json;
      } catch {
        sessionThresholds = { 2: 30, 3: 55, 4: 75, 5: 90 };
      }
    }

    earnedPoints = 0;
    if (data.answers && Array.isArray(data.answers)) {
      data.answers.forEach(a => {
        answeredQuestionIds.add(a.question_id);
        earnedPoints += Number(a.points_earned) || 0;
      });
    }
    updateLiveMetrics();

    // Időzítő inicializálása
    if (data.participant.deadline_at) {
      setupTimer(data.participant.deadline_at);
    }

    // Megkeressük az első megválaszolatlan kérdést
    let nextIndex = 0;
    for (let i = 0; i < currentQuestions.length; i++) {
      if (!answeredQuestionIds.has(currentQuestions[i].id)) {
        nextIndex = i;
        break;
      }
    }

    renderQuestion(nextIndex);
  }

  /**
   * Kérdés megjelenítése a képernyőn (Calm Learner stílusban)
   */
  function renderQuestion(index) {
    if (index >= currentQuestions.length) {
      finishQuiz();
      return;
    }

    currentQuestionIndex = index;
    const q = currentQuestions[index];
    questionStartTime = Date.now();

    // 1. Kérdésszám és sorszámok
    questionProgress.textContent = `${index + 1} / ${currentQuestions.length}. kérdés`;
    if (quizQnumText) quizQnumText.textContent = String(index + 1);

    const typeBadgeMap = {
      'ABCD': 'Feleletválasztó',
      'TF': 'Igaz / Hamis',
      'SHORT': 'Rövid válasz'
    };
    if (questionTypeBadge) questionTypeBadge.textContent = typeBadgeMap[q.question_type] || 'Kérdés';

    const hintMap = {
      'ABCD': 'Válaszd ki az egyetlen helyes megoldást!',
      'TF': 'Döntsd el, hogy az állítás igaz vagy hamis!',
      'SHORT': 'Írd be a helyes választ a szövegmezőbe!'
    };
    if (questionHintText) {
      const customHint = q.instructions && q.instructions.trim();
      if (customHint) {
        questionHintText.innerHTML = formatCode(customHint).replace(/\n/g, '<br>');
      } else {
        questionHintText.textContent = hintMap[q.question_type] || 'Válaszolj a kérdésre!';
      }
    }

    // 2. Haladási sáv és 3 részes szöveges állapot (a már befejezett válaszok szerint)
    const answeredCount = answeredQuestionIds.size;
    const progressPct = Math.round((answeredCount / currentQuestions.length) * 100);
    if (quizProgressBarFill) quizProgressBarFill.style.width = `${progressPct}%`;

    const remainingCount = currentQuestions.length - answeredCount;
    if (progressTextDone) progressTextDone.textContent = answeredCount === 0 ? 'Kezdés' : `${answeredCount}. befejezve`;
    if (progressTextCurrent) progressTextCurrent.textContent = (index + 1 === currentQuestions.length) ? `${index + 1}. Utolsó kérdés!` : `${index + 1}. folyamatban`;
    if (progressTextRemaining) progressTextRemaining.textContent = remainingCount === 0 ? 'Már nincs több hátra' : `${remainingCount} kérdés van hátra`;

    // 3. Kérdésszöveg és opcionális ábra
    questionText.innerHTML = formatCode(q.question_text);

    if (q.image_path) {
      questionImage.src = q.image_path;
      questionImageBox.style.display = 'flex';
      if (quizCardsRow) quizCardsRow.classList.add('has-image');
      if (studentEntryInner) studentEntryInner.classList.add('has-image');
      if (quizMainCard) quizMainCard.classList.add('has-image');
    } else {
      questionImage.src = '';
      questionImageBox.style.display = 'none';
      if (quizCardsRow) quizCardsRow.classList.remove('has-image');
      if (studentEntryInner) studentEntryInner.classList.remove('has-image');
      if (quizMainCard) quizMainCard.classList.remove('has-image');
    }

    // 4. Reset korábbi állapotokból
    feedbackCard.style.display = 'none';
    btnSubmitAnswer.disabled = true;
    btnSubmitAnswer.style.display = 'inline-flex';
    actionButtonsBox.style.display = 'flex';

    optionsContainer.innerHTML = '';
    shortAnswerContainer.style.display = 'none';
    shortAnswerInput.value = '';
    shortAnswerInput.disabled = false;
    shortAnswerInput.classList.remove('input-correct', 'input-wrong');

    // 5. Kérdéstípus szerinti megjelenítés
    if (q.question_type === 'ABCD') {
      optionsContainer.className = 'quiz-options-group';
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      const opts = (Array.isArray(q.options) && q.options.length > 0) ? q.options : ['A', 'B', 'C', 'D'];
      opts.forEach((optText, optIdx) => {
        const tile = document.createElement('div');
        tile.className = 'quiz-option-tile';
        tile.dataset.value = optText;

        const letter = letters[optIdx] || String(optIdx + 1);
        tile.innerHTML = `
          <div class="quiz-option-left">
            <span class="quiz-option-badge">${letter}</span>
            <span class="quiz-option-text">${formatCode(optText)}</span>
          </div>
          <div class="quiz-option-radio">
            <span class="material-symbols-outlined quiz-option-check">check</span>
          </div>
        `;

        tile.addEventListener('click', () => {
          document.querySelectorAll('.quiz-option-tile').forEach(b => b.classList.remove('selected'));
          tile.classList.add('selected');
          btnSubmitAnswer.disabled = false;
        });

        optionsContainer.appendChild(tile);
      });

    } else if (q.question_type === 'TF') {
      optionsContainer.className = 'quiz-tf-grid';
      const tfData = [
        { value: 'Igaz', title: 'IGAZ' },
        { value: 'Hamis', title: 'HAMIS' }
      ];

      tfData.forEach(item => {
        const tile = document.createElement('div');
        tile.className = 'quiz-tf-tile';
        tile.dataset.value = item.value;
        tile.innerHTML = `
          <span class="quiz-tf-name">${item.title}</span>
        `;

        tile.addEventListener('click', () => {
          document.querySelectorAll('.quiz-tf-tile').forEach(b => b.classList.remove('selected'));
          tile.classList.add('selected');
          btnSubmitAnswer.disabled = false;
        });

        optionsContainer.appendChild(tile);
      });

    } else if (q.question_type === 'SHORT') {
      optionsContainer.className = 'quiz-options-group';
      shortAnswerContainer.style.display = 'block';
      shortAnswerInput.disabled = false;
      setTimeout(() => shortAnswerInput.focus(), 50);

      shortAnswerInput.oninput = () => {
        btnSubmitAnswer.disabled = shortAnswerInput.value.trim().length === 0;
      };
      shortAnswerInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !btnSubmitAnswer.disabled) {
          submitAnswer();
        }
      };
    }
  }

  // Válasz beküldése
  btnSubmitAnswer.addEventListener('click', submitAnswer);

  async function submitAnswer() {
    const q = currentQuestions[currentQuestionIndex];
    let submittedValue = '';

    if (q.question_type === 'ABCD') {
      const selected = document.querySelector('.quiz-option-tile.selected');
      if (!selected) return;
      submittedValue = selected.dataset.value;
    } else if (q.question_type === 'TF') {
      const selected = document.querySelector('.quiz-tf-tile.selected');
      if (!selected) return;
      submittedValue = selected.dataset.value;
    } else if (q.question_type === 'SHORT') {
      submittedValue = shortAnswerInput.value.trim();
      if (!submittedValue) return;
    }

    btnSubmitAnswer.disabled = true;

    const timeSpent = Math.round((Date.now() - questionStartTime) / 1000);

    try {
      const res = await fetch('/api/student/submit-answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken
        },
        body: JSON.stringify({
          session_token: sessionToken,
          question_id: q.id,
          submitted_answer: submittedValue,
          time_spent_sec: timeSpent
        })
      });

      const result = await res.json();
      if (!res.ok) {
        showCalmAlert(result.error || 'Hiba a válasz mentésekor!', 'Hiba a mentéskor', 'error');
        btnSubmitAnswer.disabled = false;
        return;
      }

      answeredQuestionIds.add(q.id);
      studentSubmittedAnswers.set(q.id, {
        question_id: q.id,
        submitted_answer: submittedValue,
        is_correct: result.is_correct,
        points_earned: Number(result.points_earned) || 0,
        eval_status: result.eval_status || (result.is_correct === 1 ? 'CORRECT' : 'WRONG'),
        correct_answer: result.correctAnswer,
        explanation: result.explanation
      });
      if (result.is_correct === 1) {
        earnedPoints += Number(result.points_earned) || 1;
      }
      updateLiveMetrics();

      // Válaszgombok zárolása
      document.querySelectorAll('.quiz-option-tile, .quiz-tf-tile').forEach(b => {
        b.style.pointerEvents = 'none';
      });
      shortAnswerInput.disabled = true;
      actionButtonsBox.style.display = 'none';

      // Ha a tanár letiltotta az azonnali visszajelzést (hide_immediate_feedback)
      if (result.hideFeedback) {
        const isLast = (currentQuestionIndex + 1 >= currentQuestions.length) || result.isFinished;
        if (isLast) {
          finishQuiz();
        } else {
          renderQuestion(currentQuestionIndex + 1);
        }
        return;
      }

      // Azonnali Socrative kiértékelés megjelenítése
      showFeedback(result);

    } catch (err) {
      console.error('Hiba a válasz beküldésekor:', err);
      showCalmAlert('Hálózati hiba a válasz beküldésekor! Kérlek, próbáld újra.', 'Hálózati hiba', 'error');
      btnSubmitAnswer.disabled = false;
    }
  }

  /**
   * Azonnali Socrative Visszajelzés (Csempeszínezés + Semleges alsó sáv)
   */
  function showFeedback(result) {
    feedbackCard.style.display = 'flex';

    const q = currentQuestions[currentQuestionIndex];
    const isCorrect = (result.is_correct === 1);

    // 1. Csempék megjelölése (ABCD és TF)
    if (q && q.question_type === 'ABCD') {
      let accepted = [];
      try {
        const parsed = JSON.parse(result.correctAnswer);
        if (Array.isArray(parsed)) {
          accepted = parsed.map(s => String(s).trim().toLowerCase());
        } else {
          accepted = [String(result.correctAnswer).trim().toLowerCase()];
        }
      } catch {
        accepted = [String(result.correctAnswer).trim().toLowerCase()];
      }

      document.querySelectorAll('.quiz-option-tile').forEach(tile => {
        const val = (tile.dataset.value || '').trim().toLowerCase();
        const isThisCorrect = accepted.includes(val);
        const isSelected = tile.classList.contains('selected');

        if (isThisCorrect) {
          tile.classList.add('tile-correct');
          const checkIcon = tile.querySelector('.quiz-option-check');
          if (checkIcon) checkIcon.textContent = 'check';
        } else if (isSelected && !isCorrect) {
          tile.classList.add('tile-wrong');
          const checkIcon = tile.querySelector('.quiz-option-check');
          if (checkIcon) checkIcon.textContent = 'close';
        }
      });

    } else if (q && q.question_type === 'TF') {
      const normCorrect = String(result.correctAnswer || '').trim().toLowerCase();
      const isTrueCorrect = ['igaz', 'true', 'i', 't', '1'].includes(normCorrect);
      const isFalseCorrect = ['hamis', 'false', 'h', 'f', '0'].includes(normCorrect);

      document.querySelectorAll('.quiz-tf-tile').forEach(tile => {
        const val = (tile.dataset.value || '').trim().toLowerCase();
        let isThisCorrect = false;
        if (val === 'igaz' && isTrueCorrect) isThisCorrect = true;
        if (val === 'hamis' && isFalseCorrect) isThisCorrect = true;

        const isSelected = tile.classList.contains('selected');

        if (isThisCorrect) {
          tile.classList.add('tile-correct');
        } else if (isSelected && !isCorrect) {
          tile.classList.add('tile-wrong');
        }
      });

    } else if (q && q.question_type === 'SHORT') {
      if (isCorrect) {
        shortAnswerInput.classList.add('input-correct');
      } else {
        shortAnswerInput.classList.add('input-wrong');
      }
    }

    // 2. Alsó visszajelző sáv (Semleges háttér, 2 soros szöveg)
    let displayCorrectAnswer = result.correctAnswer;
    if (q && q.question_type === 'TF') {
      const norm = String(result.correctAnswer || '').trim().toLowerCase();
      if (['igaz', 'true', 'i', 't', '1'].includes(norm)) displayCorrectAnswer = 'Igaz';
      else if (['hamis', 'false', 'h', 'f', '0'].includes(norm)) displayCorrectAnswer = 'Hamis';
    } else if (q && q.question_type === 'ABCD') {
      try {
        const parsed = JSON.parse(result.correctAnswer);
        if (Array.isArray(parsed)) displayCorrectAnswer = parsed.join(', ');
      } catch {
        // maradhat az eredeti result.correctAnswer
      }
    } else if (q && q.question_type === 'SHORT') {
      try {
        const parsed = JSON.parse(result.correctAnswer);
        if (Array.isArray(parsed)) displayCorrectAnswer = parsed.join(' vagy ');
      } catch {
        if (String(result.correctAnswer).includes('|')) {
          displayCorrectAnswer = result.correctAnswer.split('|').map(s => s.trim()).join(' vagy ');
        } else if (String(result.correctAnswer).includes(';')) {
          displayCorrectAnswer = result.correctAnswer.split(';').map(s => s.trim()).join(' vagy ');
        }
      }
    }

    if (isCorrect) {
      feedbackCard.className = 'quiz-feedback-strip quiz-feedback-strip-correct';
      if (feedbackIcon) feedbackIcon.textContent = 'task_alt';
      feedbackTitle.innerHTML = 'Helyes válasz!';
    } else {
      feedbackCard.className = 'quiz-feedback-strip quiz-feedback-strip-wrong';
      if (feedbackIcon) feedbackIcon.textContent = 'cancel';
      feedbackTitle.innerHTML = `Helyes megoldás: <strong>${formatCode(displayCorrectAnswer)}</strong>`;
    }

    // A magyarázat blokk elrejtve a letisztult visszajelzés és a duplikáció elkerülése érdekében
    feedbackBody.innerHTML = '';
    feedbackBody.style.display = 'none';

    const isLast = (currentQuestionIndex + 1 >= currentQuestions.length) || result.isFinished;

    // A kiértékelés pillanatában lép előre a folyamatjelző csík
    const answeredCount = answeredQuestionIds.size;
    const progressPct = Math.round((answeredCount / currentQuestions.length) * 100);
    if (quizProgressBarFill) quizProgressBarFill.style.width = `${progressPct}%`;

    const remainingCount = currentQuestions.length - answeredCount;
    if (progressTextDone) progressTextDone.textContent = `${answeredCount}. befejezve`;
    if (progressTextCurrent) progressTextCurrent.textContent = isLast ? 'Utolsó kérdés kiértékelve!' : `${currentQuestionIndex + 1}. kiértékelve`;
    if (progressTextRemaining) progressTextRemaining.textContent = remainingCount === 0 ? 'Már nincs több hátra' : `${remainingCount} kérdés van hátra`;

    btnNextQuestion.innerHTML = isLast
      ? '<span>Befejezés</span> <span class="material-symbols-outlined">flag</span>'
      : '<span>Következő</span> <span class="material-symbols-outlined">arrow_forward</span>';

    btnNextQuestion.onclick = () => {
      if (isLast) {
        finishQuiz();
      } else {
        renderQuestion(currentQuestionIndex + 1);
      }
    };
  }

  /**
   * Dolgozat lezárása
   */
  async function finishQuiz() {
    if (timerInterval) clearInterval(timerInterval);

    try {
      await fetch('/api/student/finish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken
        },
        body: JSON.stringify({ session_token: sessionToken })
      });
    } catch {
      // ignore
    }

    let summaryData = null;
    try {
      const res = await fetch('/api/student/session-data', {
        headers: { 'x-session-token': sessionToken }
      });
      if (res.ok) {
        const data = await res.json();
        summaryData = {
          totalPoints: data.results ? data.results.total_points : 0,
          maxPoints: (data.results && data.results.max_points) || (currentQuiz ? currentQuiz.total_points : 0),
          percentage: data.results ? data.results.percentage : 0,
          grade: data.results ? data.results.grade : null,
          gradeText: data.results ? data.results.grade_text : '',
          showFeedback: data.participant.show_feedback_on_end === 1,
          participant: data.participant,
          session: data.session,
          quiz: data.quiz,
          answers: data.answers || []
        };
      }
    } catch {
      // ignore
    }

    showSummary(summaryData);
  }

  /**
   * Kiemelt lebegő helyes válasz portál bezárása (Floating UI)
   */
  function closePortalPopover() {
    if (!summaryPortalPopover) return;
    summaryPortalPopover.style.display = 'none';
    summaryPortalPopover.classList.remove('active');
    activePortalButton = null;
  }

  /**
   * Kiemelt lebegő helyes válasz portál megnyitása pixelpontos gomb-pozicionálással
   */
  function openPortalPopover(button, answerText, explanationHtml) {
    if (!summaryPortalPopover || !button) return;
    if (activePortalButton === button && summaryPortalPopover.style.display === 'flex') {
      closePortalPopover();
      return;
    }

    if (summaryPortalBody) {
      summaryPortalBody.textContent = answerText;
    }
    if (summaryPortalExp) {
      if (explanationHtml) {
        summaryPortalExp.innerHTML = explanationHtml;
        summaryPortalExp.style.display = 'block';
      } else {
        summaryPortalExp.style.display = 'none';
      }
    }

    // Először láthatatlanul jelenítjük meg a dobozméret megállapításához
    summaryPortalPopover.style.visibility = 'hidden';
    summaryPortalPopover.style.display = 'flex';

    const btnRect = button.getBoundingClientRect();
    const popWidth = summaryPortalPopover.offsetWidth;
    const popHeight = summaryPortalPopover.offsetHeight;

    // Vízszintes pozíció: a gombhoz igazítva, képernyőhatárok tiszteletben tartásával
    let left = btnRect.left - 12;
    const maxLeft = window.innerWidth - popWidth - 16;
    if (left > maxLeft) left = maxLeft;
    if (left < 16) left = 16;

    // Függőleges pozíció: szigorúan a gomb sora felett 8 képponttal (a 'Válaszod:' sor garantáltan szabad)
    let top = btnRect.top - popHeight - 8;
    if (top < 10) {
      top = Math.max(10, btnRect.top - popHeight - 8);
    }

    summaryPortalPopover.style.top = `${top}px`;
    summaryPortalPopover.style.left = `${left}px`;

    // Nyíl pozicionálása pontosan a gomb vízszintes közepére
    const arrow = summaryPortalPopover.querySelector('.calm-summary-portal-arrow');
    if (arrow) {
      const arrowLeft = Math.max(12, Math.min(popWidth - 20, btnRect.left + (btnRect.width / 2) - left - 6));
      arrow.style.left = `${arrowLeft}px`;
    }

    summaryPortalPopover.style.visibility = 'visible';
    summaryPortalPopover.classList.add('active');
    activePortalButton = button;
  }

  /**
   * Dolgozat végi értékelő felület megjelenítése (Sík, kártyamentes Calm Learner stílus)
   */
  function showSummary(data) {
    loginContainer.style.display = 'none';
    if (studentTopBar) studentTopBar.style.display = 'none';
    if (quizTopBar) quizTopBar.style.display = 'none';
    if (lobbyContainer) lobbyContainer.style.display = 'none';
    if (quizContainer) quizContainer.style.display = 'none';

    // Sík, szellős konténer beállítása
    if (studentEntryWrapper) {
      studentEntryWrapper.classList.remove('quiz-active');
      studentEntryWrapper.classList.add('summary-active');
    }
    if (studentEntryInner) {
      studentEntryInner.classList.remove('quiz-active', 'has-image');
      studentEntryInner.classList.add('summary-active');
    }
    if (summaryContainer) {
      summaryContainer.style.display = 'grid';
    }

    if (!data) return;

    // 1. Megszerzett KRÉTA érdemjegy kiszámítása az adatok alapján
    const grade = data.grade || (data.percentage !== undefined ? calculateKRÉTAGrade(percentage, sessionThresholds) : 5);

    // Szöveges értékelések, jelvények és megszólítások érdemjegyenként (3-3 pedagógiai változat)
    const studentName = (data.participant && data.participant.student_name) || (selectedStudent && selectedStudent.student_name) || 'Diák';
    const GRADE_FEEDBACKS = {
      5: {
        badge: 'Jeles teljesítmény',
        greeting: `Remek munka, ${studentName}!`,
        quotes: [
          'A kérdésekre hibátlanul válaszoltál! Példamutató felkészültség!',
          'Fantasztikus tudásról tettél tanúbizonyságot, csak így tovább!',
          'Kimagasló eredmény! Látszik a figyelmes, alapos órai munka.'
        ]
      },
      4: {
        badge: 'Jó teljesítmény',
        greeting: `Szép munka, ${studentName}!`,
        quotes: [
          'Nagyon szép, magabiztos tudás, alig néhány apró hiba csúszott be!',
          'Szép eredmény! A tananyag nagy részét kiválóan megértetted.',
          'Dicséretes munka! Egy pici plusz odafigyeléssel a jeles is elérhető.'
        ]
      },
      3: {
        badge: 'Közepes teljesítmény',
        greeting: `Köszönjük a munkádat, ${studentName}!`,
        quotes: [
          'A tananyag alapjait magabiztosan tudod, de van még hova fejlődni!',
          'Közepes szintű tudás: a főbb fogalmak megvannak, egy kis gyakorlással még jobb lesz!',
          'Szilárd kiindulási alap, érdemes még egy keveset gyakorolni az órákon!'
        ]
      },
      2: {
        badge: 'Elégséges eredmény',
        greeting: `Dolgozat leadva, ${studentName}!`,
        quotes: [
          'A követelmények minimumát teljesítetted, de szükséged lesz még gyakorlásra!',
          'Sikerült átlépned a határt, de érdemes alaposan átismételni az órai anyagot!',
          'Az alapok még bizonytalanok, kérj bátran segítséget a tanárodtól a felkészüléshez!'
        ]
      },
      1: {
        badge: 'Javításra szorul',
        greeting: `Dolgozat rögzítve, ${studentName}!`,
        quotes: [
          'Ez most sajnos nem sikerült, de ne csüggedj: alapos ismétléssel javítani fogsz!',
          'A mai téma még nehéznek bizonyult. Kérdezz a tanártól, és a következő alkalommal sokkal jobb lesz!',
          'Ne veszítsd el a kedved! Nézd át a hibás válaszokat, és gyakorolj a javításra!'
        ]
      }
    };

    const gradeFeedback = GRADE_FEEDBACKS[grade] || GRADE_FEEDBACKS[3];

    // Felső megnyugtató fejléc kitöltése (az érdemjegyhez igazodó őszinte megszólítással, a tanuló neve soha nem törik szét)
    if (summaryGreeting) {
      const wrappedName = `<span class="student-name-nowrap">${escapeHtml(studentName)}</span>`;
      const greetingHtml = escapeHtml(gradeFeedback.greeting).replace(escapeHtml(studentName), wrappedName);
      summaryGreeting.innerHTML = greetingHtml;
    }

    // 2. Pontszám és SVG kördiagram
    const totalPoints = data.totalPoints !== undefined ? Number(data.totalPoints) : earnedPoints;
    const maxPoints = data.maxPoints || (currentQuiz ? currentQuiz.total_points : 0) || 1;
    const percentage = Math.min(100, Math.max(0, data.percentage !== undefined ? data.percentage : Math.round((totalPoints / maxPoints) * 100)));

    if (summaryPercentVal) {
      summaryPercentVal.textContent = `${percentage}%`;
    }
    if (finalScore) {
      finalScore.textContent = `${totalPoints} / ${maxPoints} pont`;
    }

    // SVG körív kirajzolása (2 * PI * 42 = 263.89)
    if (summaryCircleBar) {
      const circumference = 264;
      const offset = circumference - (percentage / 100) * circumference;
      summaryCircleBar.style.strokeDashoffset = offset;
    }

    // 3. Megszerzett KRÉTA érdemjegy tiszta megjelenítése (duplikáció nélkül: pl. 3 (közepes))
    const cleanGradeLabel = getKRÉTAGradeText(grade);

    if (summaryGradeNum) {
      summaryGradeNum.textContent = String(grade);
    }
    if (finalGrade) {
      finalGrade.textContent = `(${cleanGradeLabel})`;
    }

    // Véletlenszerű dicsérő mondat kiválasztása a 3 variáció közül
    const randomQuote = gradeFeedback.quotes[Math.floor(Math.random() * gradeFeedback.quotes.length)];

    if (summaryGradeQuote) {
      summaryGradeQuote.textContent = randomQuote;
    }
    if (summaryPerformanceText) {
      summaryPerformanceText.textContent = gradeFeedback.badge;
    }

    // 4. Kitöltési idő és tempójelzés
    if (summaryTimeSpent) {
      let spentSec = 0;
      if (quizStartTime) {
        spentSec = Math.max(5, Math.round((Date.now() - quizStartTime) / 1000));
      } else if (data.participant && data.participant.joined_at) {
        const startMs = new Date(data.participant.joined_at).getTime();
        const endMs = data.participant.finished_at ? new Date(data.participant.finished_at).getTime() : Date.now();
        spentSec = Math.max(5, Math.round((endMs - startMs) / 1000));
      }
      const min = Math.floor(spentSec / 60);
      const sec = spentSec % 60;
      summaryTimeSpent.textContent = `${min}p ${sec}mp`;
    }

    // 5. Kérdések tételes áttekintése
    if (summaryQuestionsList) {
      summaryQuestionsList.innerHTML = '';
      const questions = (data.quiz && data.quiz.questions) || currentQuestions || [];
      let correctCount = 0;

      // Válaszok összeállítása
      const answersMap = new Map();
      if (Array.isArray(data.answers)) {
        data.answers.forEach(a => answersMap.set(a.question_id, a));
      }
      studentSubmittedAnswers.forEach((val, key) => {
        if (!answersMap.has(key)) answersMap.set(key, val);
      });

      questions.forEach((q, idx) => {
        const userAns = answersMap.get(q.id);
        const isCorrect = userAns ? (userAns.is_correct === 1 || userAns.isCorrect === true) : false;
        const pointsEarned = userAns ? (Number(userAns.points_earned !== undefined ? userAns.points_earned : userAns.pointsEarned) || 0) : 0;
        const maxQPoints = q.points || 1;
        if (isCorrect) correctCount++;

        const isFullyCorrect = isCorrect && (pointsEarned >= maxQPoints);
        const rawCorrect = (userAns && (userAns.correct_answer || userAns.correctAnswer)) || q.correct_answer;
        const rawExplanation = (userAns && (userAns.explanation !== undefined ? userAns.explanation : userAns.explanation)) || q.explanation || '';

        const item = document.createElement('div');
        item.className = 'calm-summary-q-item';

        let badgeClass = 'wrong';
        let badgeIcon = 'cancel';
        let badgeText = '0 pont';
        if (pointsEarned >= maxQPoints) {
          badgeClass = 'correct';
          badgeIcon = 'check_circle';
          badgeText = `Helyes (+${pointsEarned} pont)`;
        } else if (pointsEarned > 0) {
          badgeClass = 'partial';
          badgeIcon = 'check_circle';
          badgeText = `Részpont (+${pointsEarned} pont)`;
        }

        let submittedText = userAns ? (userAns.submitted_answer || userAns.submittedAnswer || '–') : 'Nem válaszolt';
        if (q.question_type === 'TF') {
          if (submittedText === 'true' || submittedText === '1') submittedText = 'Igaz';
          if (submittedText === 'false' || submittedText === '0') submittedText = 'Hamis';
        }

        let formattedCorrectAnswer = rawCorrect;
        if (rawCorrect) {
          if (q.question_type === 'TF') {
            const norm = String(rawCorrect || '').trim().toLowerCase();
            if (['igaz', 'true', 'i', 't', '1'].includes(norm)) formattedCorrectAnswer = 'Igaz';
            else if (['hamis', 'false', 'h', 'f', '0'].includes(norm)) formattedCorrectAnswer = 'Hamis';
          } else if (q.question_type === 'ABCD') {
            try {
              const parsed = JSON.parse(rawCorrect);
              if (Array.isArray(parsed)) formattedCorrectAnswer = parsed.join(', ');
            } catch {
              // nyersen maradhat
            }
          } else if (q.question_type === 'SHORT') {
            try {
              const parsed = JSON.parse(rawCorrect);
              if (Array.isArray(parsed)) formattedCorrectAnswer = parsed.join(' vagy ');
            } catch {
              if (String(rawCorrect).includes('|')) {
                formattedCorrectAnswer = rawCorrect.split('|').map(s => s.trim()).join(' vagy ');
              } else if (String(rawCorrect).includes(';')) {
                formattedCorrectAnswer = rawCorrect.split(';').map(s => s.trim()).join(' vagy ');
              }
            }
          }
        }

        const showHelp = (!isFullyCorrect && Boolean(rawCorrect));

        item.innerHTML = `
          <div class="calm-summary-q-left">
            <span class="calm-summary-q-num">${idx + 1}</span>
            <div class="calm-summary-q-info">
              <span class="calm-summary-q-title">${formatCode(q.question_text)}${showHelp ? `
                <span class="calm-summary-tooltip-wrap">
                  <button type="button" class="calm-summary-help-btn" title="Helyes válasz megtekintése" aria-label="Helyes válasz megtekintése">
                    <span class="material-symbols-outlined">help</span>
                  </button>
                </span>
              ` : ''}</span>
              <span class="calm-summary-q-ans">Válaszod: <strong>${escapeHtml(submittedText)}</strong></span>
            </div>
          </div>
          <div class="calm-summary-q-badge ${badgeClass}">
            <span class="material-symbols-outlined">${badgeIcon}</span>
            <span>${badgeText}</span>
          </div>
        `;

        if (showHelp) {
          const helpBtn = item.querySelector('.calm-summary-help-btn');
          if (helpBtn) {
            helpBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              openPortalPopover(
                helpBtn,
                formattedCorrectAnswer,
                rawExplanation ? formatCode(rawExplanation) : ''
              );
            });
          }
        }

        summaryQuestionsList.appendChild(item);
      });

      if (summaryQuestionsCount) {
        summaryQuestionsCount.textContent = `${correctCount} / ${questions.length} helyes válasz`;
      }
    }

    // 6. Új belépés gomb kezelése
    if (btnRestartStudent) {
      btnRestartStudent.onclick = () => {
        sessionStorage.removeItem('ropdolgozat_token');
        window.location.reload();
      };
    }
  }

  /**
   * Szerveroldali határidő időzítője
   */
  function setupTimer(deadlineIso) {
    timerBadge.style.display = 'flex';
    const deadlineMs = new Date(deadlineIso).getTime();

    function update() {
      const now = Date.now();
      const remainingSec = Math.max(0, Math.floor((deadlineMs - now) / 1000));
      timerText.textContent = formatTime(remainingSec);

      if (remainingSec <= 60) {
        timerBadge.classList.add('timer-urgent');
      }

      if (remainingSec <= 0) {
        clearInterval(timerInterval);
        finishQuiz();
        showCalmAlert('Az időkorlát lejárt! A dolgozat automatikusan lezárásra kerül.', 'Időkorlát lejárt', 'warning');
      }
    }

    update();
    timerInterval = setInterval(update, 1000);
  }

  /**
   * Fókuszvesztés figyelése (visibilitychange)
   */
  function setupFocusListener() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && sessionToken && quizContainer.style.display === 'block') {
        fetch('/api/student/focus-lost', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-token': sessionToken
          },
          body: JSON.stringify({ session_token: sessionToken })
        }).catch(() => { });

        showToast('⚠️ Figyelem! A dolgozat közben az ablak elhagyását a rendszer rögzíti!', 'danger');
      }
    });
  }

  // Lebegő portál popover automatikus bezárása külső kattintásra
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#summary-portal-popover') && !e.target.closest('.calm-summary-help-btn')) {
      closePortalPopover();
    }
  });

  // Lista görgetésekor és átméretezéskor automatikus bezárás (Floating UI épség)
  window.addEventListener('resize', closePortalPopover);
  if (summaryQuestionsList) {
    summaryQuestionsList.addEventListener('scroll', closePortalPopover);
  }

  // Futtatás betöltéskor
  document.addEventListener('DOMContentLoaded', init);

})();

