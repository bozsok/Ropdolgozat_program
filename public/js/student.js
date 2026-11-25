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

  // Diagnosztikai alrendszer kliensoldali állapota (v1.2 + DH 01)
  let diagnosticsEnabled = false;
  let diagnosticsScope = null; // helyi hatókör: `${sessionId}_${participantId}` (tokenmentes)
  let diagnosticsMemoryBuffer = [];
  let diagnosticsStorageFailed = false;
  let currentOperationId = null;
  let currentOperationQuestionId = null;
  let isSyncingDiagnostics = false;
  let syncVersion = 0;
  let syncRetryCount = 0;
  let nextAllowedSyncAt = 0;
  let syncTimer = null;
  let syncAbortController = null;
  let diagnosticsBatchLimit = 20;
  let diagnosticsAuthPaused = false;
  let hasConnectedOnce = false;
  let lastConnectErrorLoggedAt = 0;

  const DIAG_STORAGE_KEY = 'ropdolgozat_diagnostics_buffer';
  const DIAG_MAX_ITEMS = 50;
  const DIAG_MAX_BYTES = 32768; // 32 KiB
  const DIAG_MAX_BATCH_BYTES = 8192; // 8 KiB
  const DIAG_TTL_MS = 7200000; // 2 óra
  const CONNECT_ERROR_THROTTLE_MS = 30000; // 30 mp ritkítás hibasorozatnál

  const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  function utf8ByteLength(str) {
    if (utf8Encoder) return utf8Encoder.encode(str).length;
    try {
      return unescape(encodeURIComponent(str)).length;
    } catch {
      return str.length;
    }
  }

  function generateHexId() {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        const arr = new Uint8Array(16);
        window.crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch {}
    return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[x]/g, () => (Math.random() * 16 | 0).toString(16));
  }

  function mapSocketDisconnectReason(reason) {
    const map = {
      'io server disconnect': 'IO_SERVER_DISCONNECT',
      'io client disconnect': 'IO_CLIENT_DISCONNECT',
      'ping timeout': 'PING_TIMEOUT',
      'transport close': 'TRANSPORT_CLOSE',
      'transport error': 'TRANSPORT_ERROR',
      'parse error': 'PARSE_ERROR'
    };
    if (typeof reason === 'string' && map[reason]) {
      return map[reason];
    }
    return 'UNKNOWN_DISCONNECT_REASON';
  }

  function filterFreshDiagnosticItems(items, now) {
    return items.filter(e => {
      if (!e || typeof e !== 'object') return false;
      const ts = typeof e._ts === 'number' ? e._ts : (e.clientAt ? Date.parse(e.clientAt) : NaN);
      return Number.isFinite(ts) && (now - ts) < DIAG_TTL_MS && (now - ts) >= -60000;
    });
  }

  function getDiagnosticsBuffer() {
    const now = Date.now();
    if (diagnosticsStorageFailed) {
      diagnosticsMemoryBuffer = filterFreshDiagnosticItems(diagnosticsMemoryBuffer, now);
      return diagnosticsMemoryBuffer.slice();
    }
    try {
      const raw = sessionStorage.getItem(DIAG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.scope === diagnosticsScope && Array.isArray(parsed.events)) {
          const fresh = filterFreshDiagnosticItems(parsed.events, now);
          diagnosticsMemoryBuffer = fresh;
          return fresh.slice();
        }
        // Eltérő munkamenet-hatókör: a régi tárhelyadat nem használható fel
        return [];
      }
      return [];
    } catch {
      diagnosticsStorageFailed = true;
      diagnosticsMemoryBuffer = filterFreshDiagnosticItems(diagnosticsMemoryBuffer, now);
      return diagnosticsMemoryBuffer.slice();
    }
  }

  function saveDiagnosticsBuffer(items) {
    const now = Date.now();
    let valid = filterFreshDiagnosticItems(items, now);
    if (valid.length > DIAG_MAX_ITEMS) {
      valid = valid.slice(valid.length - DIAG_MAX_ITEMS);
    }

    const payload = { scope: diagnosticsScope, events: valid };
    let json = JSON.stringify(payload);
    while (utf8ByteLength(json) > DIAG_MAX_BYTES && valid.length > 0) {
      valid.shift();
      payload.events = valid;
      json = JSON.stringify(payload);
    }

    diagnosticsMemoryBuffer = valid.slice();
    if (diagnosticsStorageFailed) return;

    try {
      sessionStorage.setItem(DIAG_STORAGE_KEY, json);
    } catch {
      diagnosticsStorageFailed = true;
    }
  }

  function clearDiagnosticsBuffer() {
    syncVersion++;
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    if (syncAbortController) {
      try { syncAbortController.abort(); } catch {}
      syncAbortController = null;
    }
    isSyncingDiagnostics = false;
    syncRetryCount = 0;
    nextAllowedSyncAt = 0;
    diagnosticsBatchLimit = 20;
    diagnosticsAuthPaused = false;
    diagnosticsMemoryBuffer = [];
    try {
      sessionStorage.removeItem(DIAG_STORAGE_KEY);
    } catch {}
  }

  function applyDiagnosticsScope(newScope, enabledFlag) {
    const prevEnabled = diagnosticsEnabled;
    const prevScope = diagnosticsScope;
    diagnosticsEnabled = !!enabledFlag;
    diagnosticsAuthPaused = false;

    if (!diagnosticsEnabled) {
      diagnosticsScope = newScope || null;
      clearDiagnosticsBuffer();
      return;
    }

    // Ellenőrizzük a tárolt scope-ot is oldalfrissítés utáni helyreállításhoz
    let storedScope = null;
    if (!diagnosticsStorageFailed) {
      try {
        const raw = sessionStorage.getItem(DIAG_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.scope === 'string') storedScope = parsed.scope;
        }
      } catch {}
    }

    const scopeChanged = (prevScope && prevScope !== newScope) || (storedScope && storedScope !== newScope);
    diagnosticsScope = newScope || null;

    if (scopeChanged || (!prevEnabled && !storedScope)) {
      if (scopeChanged) {
        clearDiagnosticsBuffer();
      }
    } else if (storedScope && storedScope === newScope) {
      // Azonos munkamenet helyreállítva: lejárt sorok takarítása és ürítés indítása
      const existing = getDiagnosticsBuffer();
      saveDiagnosticsBuffer(existing);
      if (existing.length > 0) {
        setTimeout(() => flushDiagnosticsQueue(), 200);
      }
    }
  }

  function pushDiagnosticEvent(eventData) {
    if (!diagnosticsEnabled) return;
    try {
      const entry = {
        eventId: generateHexId(),
        event: eventData.event,
        clientAt: new Date().toISOString(),
        _ts: Date.now()
      };
      if (eventData.requestId) entry.requestId = eventData.requestId;
      if (eventData.operationId) entry.operationId = eventData.operationId;
      if (eventData.outcome) entry.outcome = eventData.outcome;
      if (eventData.reasonCode) entry.reasonCode = eventData.reasonCode;
      if (typeof eventData.httpStatus === 'number') entry.httpStatus = eventData.httpStatus;
      if (typeof eventData.durationMs === 'number') entry.durationMs = eventData.durationMs;

      const items = getDiagnosticsBuffer();
      items.push(entry);
      saveDiagnosticsBuffer(items);
    } catch {}
  }

  function buildDiagnosticsBatch(items, maxItems, maxBytes) {
    const selected = [];
    const oversizedIds = [];

    for (let i = 0; i < items.length && selected.length < maxItems; i++) {
      const clean = { ...items[i] };
      delete clean._ts;

      const candidate = selected.concat([clean]);
      const payloadSize = utf8ByteLength(JSON.stringify({ events: candidate }));

      if (payloadSize <= maxBytes) {
        selected.push(clean);
      } else if (selected.length === 0) {
        // Önmagában is túllépi a 8 KiB keretet: eldobjuk, hogy ne blokkolja a sor többi elemét
        if (items[i] && items[i].eventId) oversizedIds.push(items[i].eventId);
      } else {
        break;
      }
    }

    return { batch: selected, oversizedIds };
  }

  function scheduleDiagnosticsRetry(expectedVersion, customDelayMs) {
    if (expectedVersion !== syncVersion) return;
    if (syncTimer) clearTimeout(syncTimer);
    let delay;
    if (typeof customDelayMs === 'number') {
      delay = customDelayMs;
    } else {
      syncRetryCount = Math.min(syncRetryCount + 1, 5);
      delay = Math.min(16000, Math.pow(2, syncRetryCount - 1) * 1000) + Math.floor(Math.random() * 500);
    }
    nextAllowedSyncAt = Date.now() + delay;
    syncTimer = setTimeout(() => {
      if (expectedVersion !== syncVersion) return;
      syncTimer = null;
      flushDiagnosticsQueue();
    }, delay);
  }

  async function flushDiagnosticsQueue() {
    if (!diagnosticsEnabled || isSyncingDiagnostics || !sessionToken || diagnosticsAuthPaused) return;
    if (Date.now() < nextAllowedSyncAt) return;

    const currentSyncVer = syncVersion;
    const items = getDiagnosticsBuffer();
    if (items.length === 0) return;

    const { batch, oversizedIds } = buildDiagnosticsBatch(items, diagnosticsBatchLimit, DIAG_MAX_BATCH_BYTES);
    if (oversizedIds.length > 0) {
      const oversizedSet = new Set(oversizedIds);
      const filtered = items.filter(e => !oversizedSet.has(e.eventId));
      saveDiagnosticsBuffer(filtered);
    }
    if (batch.length === 0) {
      if (getDiagnosticsBuffer().length > 0) {
        setTimeout(() => {
          if (currentSyncVer === syncVersion) flushDiagnosticsQueue();
        }, 50);
      }
      return;
    }

    isSyncingDiagnostics = true;
    const batchEventIds = new Set(batch.map(b => b.eventId));
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    syncAbortController = controller;

    try {
      const fetchOpts = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken
        },
        body: JSON.stringify({ events: batch })
      };
      if (controller) fetchOpts.signal = controller.signal;

      const res = await fetch('/api/student/diagnostics/events', fetchOpts);

      if (currentSyncVer !== syncVersion) return;

      if (res.status === 204) {
        syncRetryCount = 0;
        nextAllowedSyncAt = 0;
        diagnosticsBatchLimit = 20;
        const currentItems = getDiagnosticsBuffer();
        const remaining = currentItems.filter(e => !batchEventIds.has(e.eventId));
        saveDiagnosticsBuffer(remaining);

        if (remaining.length > 0) {
          scheduleDiagnosticsRetry(currentSyncVer, 200);
        }
      } else if (res.status === 403) {
        let bodyCode = null;
        try {
          const errBody = await res.json();
          if (currentSyncVer !== syncVersion) return;
          bodyCode = errBody && errBody.code;
        } catch {}
        if (bodyCode === 'DIAGNOSTICS_DISABLED') {
          diagnosticsEnabled = false;
          clearDiagnosticsBuffer();
        }
      } else if (res.status === 401) {
        diagnosticsAuthPaused = true;
      } else if (res.status === 400) {
        const currentItems = getDiagnosticsBuffer();
        const remaining = currentItems.filter(e => !batchEventIds.has(e.eventId));
        saveDiagnosticsBuffer(remaining);
      } else if (res.status === 413) {
        if (batch.length > 1) {
          diagnosticsBatchLimit = Math.max(1, Math.floor(batch.length / 2));
          scheduleDiagnosticsRetry(currentSyncVer, 100);
        } else {
          // Egyetlen elem is túl nagy -> eltávolítjuk, hogy a többi sor folytatódhasson
          const currentItems = getDiagnosticsBuffer();
          const remaining = currentItems.filter(e => !batchEventIds.has(e.eventId));
          saveDiagnosticsBuffer(remaining);
          diagnosticsBatchLimit = 20;
          if (remaining.length > 0) {
            scheduleDiagnosticsRetry(currentSyncVer, 100);
          }
        }
      } else if (res.status === 429 || res.status === 503) {
        scheduleDiagnosticsRetry(currentSyncVer);
      }
    } catch {
      if (currentSyncVer === syncVersion) {
        scheduleDiagnosticsRetry(currentSyncVer);
      }
    } finally {
      if (currentSyncVer === syncVersion) {
        isSyncingDiagnostics = false;
        if (syncAbortController === controller) {
          syncAbortController = null;
        }
      }
    }
  }

  function isValidSubmitAnswerResponse(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
    if (result.success !== true) return false;
    if (typeof result.alreadySubmitted !== 'boolean') return false;
    if (typeof result.isFinished !== 'boolean') return false;
    if (typeof result.hideFeedback !== 'boolean') return false;
    if (result.submittedAnswer !== undefined && result.submittedAnswer !== null && typeof result.submittedAnswer !== 'string') return false;
    if (!result.hideFeedback) {
      if (result.eval_status !== null && typeof result.eval_status !== 'string') return false;
      if (result.is_correct !== null && typeof result.is_correct !== 'number') return false;
      if (result.points_earned !== null && typeof result.points_earned !== 'number') return false;
    }
    return true;
  }

  setInterval(() => {
    if (diagnosticsEnabled && sessionToken && !diagnosticsAuthPaused) {
      flushDiagnosticsQueue();
    }
  }, 30000);

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
  const shortAnswerEvalIcon = document.getElementById('short-answer-eval-icon');
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
  const teacherPacedWaitPill = document.getElementById('teacher-paced-wait-pill');
  const teacherPacedWaitPillText = document.getElementById('teacher-paced-wait-pill-text');
  const teacherPacedWaitBanner = document.getElementById('teacher-paced-wait-banner');
  const teacherPacedWaitText = document.getElementById('teacher-paced-wait-text');

  // Open Navigation (Szabad navigáció) DOM elemei
  const quizMetricsWrap = document.querySelector('.quiz-metrics-wrap');
  const openNavMapWrap = document.getElementById('open-nav-map-wrap');
  const openNavMapGrid = document.getElementById('open-nav-map-grid');
  const openNavFooterBar = document.getElementById('open-nav-footer-bar');
  const btnOpenNavPrev = document.getElementById('btn-open-nav-prev');
  const btnOpenNavClear = document.getElementById('btn-open-nav-clear');
  const openNavSaveStatus = document.getElementById('open-nav-save-status');
  const btnOpenNavNext = document.getElementById('btn-open-nav-next');
  const btnOpenNavSubmit = document.getElementById('btn-open-nav-submit');
  const openNavModalSummary = document.getElementById('open-nav-modal-summary');
  const openNavUnansweredBox = document.getElementById('open-nav-unanswered-box');
  const openNavUnansweredList = document.getElementById('open-nav-unanswered-list');
  const btnCancelOpenNavSubmit = document.getElementById('btn-cancel-open-nav-submit');
  const btnConfirmOpenNavSubmit = document.getElementById('btn-confirm-open-nav-submit');
  const btnCloseOpenNavModal = document.getElementById('btn-close-open-nav-modal');

  // Teacher Paced (Tanári léptetés), Open Navigation és aktív résztvevő állapotváltozók
  let currentParticipant = null;
  let questionViewSeq = 0;
  let isTeacherPacedMode = false;
  let teacherPacedShowFeedback = true;
  let teacherPacedQuestionIndex = 0;
  let teacherPacedTotalQuestions = 0;
  let teacherPacedCurrentAnswer = null;
  let teacherPacedSyncSeq = 0;
  let lastServerResults = null;

  let isOpenNavigationMode = false;
  const openNavDrafts = new Map();
  const openNavQueues = new Map();
  const openNavShortTimers = new Map();
  let openNavIsSubmitting = false;
  let openNavIsFinalized = false;
  let openNavClosurePending = false;
  let openNavPendingScoreRefresh = false;
  let openNavSessionEpoch = 0;
  let quizInterfaceLoadSeq = 0;
  let openNavStatusCheckPromise = null;
  let openNavTimerRetryId = null;
  let openNavRetryAttempt = 0;
  let modalAlertOwnerTag = null;
  let loginListsLoadPromise = null;

  const openNavConflictBanner = document.getElementById('open-nav-conflict-banner');
  const openNavConflictServerVal = document.getElementById('open-nav-conflict-server-val');
  const openNavConflictLocalVal = document.getElementById('open-nav-conflict-local-val');
  const btnOpenNavKeepServer = document.getElementById('btn-open-nav-keep-server');
  const btnOpenNavSaveLocal = document.getElementById('btn-open-nav-save-local');

  const summaryReceiptView = document.getElementById('summary-receipt-view');
  const summaryReceiptTitle = document.getElementById('summary-receipt-title');
  const summaryReceiptSubtitle = document.getElementById('summary-receipt-subtitle');
  const summaryReceiptTime = document.getElementById('summary-receipt-time');
  const btnReloadSummaryFromReceipt = document.getElementById('btn-reload-summary-from-receipt');
  const btnRestartReceipt = document.getElementById('btn-restart-receipt');
  const summaryColLeft = document.querySelector('.calm-summary-col-left');
  const summaryColRight = document.querySelector('.calm-summary-col-right');

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
    const isAfterLogout = getUrlParam('logout') === '1';
    let isTeacherWorkstation = false;
    if (gepParam) {
      const gepLower = gepParam.trim().toLowerCase();
      if (gepLower === 'tanar' || gepLower === 'tanari') {
        isTeacherWorkstation = true;
        sessionStorage.setItem('ropdolgozat_workstation', 'tanar');
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
    } else if (sessionStorage.getItem('ropdolgozat_workstation') === 'tanar') {
      isTeacherWorkstation = true;
      if (pcNumberText) pcNumberText.textContent = 'Tanári munkaállomás';
      if (entryPcNumberText) entryPcNumberText.textContent = 'Tanári munkaállomás';
      if (entryPcBadge) entryPcBadge.style.display = 'inline-flex';
    }

    // 2. Felületi eseménykezelők azonnali regisztrálása (Modalok, Kilépés gomb, stb.)
    setupCommonUIListeners();

    // 3. Tanári munkaállomás kényelmi automatizmus (?gep=tanar):
    // Ha a tanári gépről nyitották meg a felületet és nincs folyamatban lévő diák token (kijelentkezés után nem nyitja meg újra automatikusan)
    if (isTeacherWorkstation && !isAfterLogout && !sessionStorage.getItem('ropdolgozat_token')) {
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
    loginListsInitialized = true;
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
        const isOpenNavSession = isOpenNavigationMode
          || (activeSession && activeSession.mode === 'OPEN_NAVIGATION')
          || (currentParticipant && currentParticipant.session_mode === 'OPEN_NAVIGATION');
        if (isOpenNavSession) {
          isOpenNavigationMode = true;
          openNavClosurePending = true;
          quizInterfaceLoadSeq++;
          syncOpenNavServerState({ requireFinal: true });
        } else {
          finishQuiz();
        }
      }
    });

    socket.on('participant:kicked', (data) => {
      // Szigorú, egyértelmű címzés: hiányos esemény nem léptethet ki, aktív résztvevőnél participantId (és ha van, sessionId) egyezése kötelező!
      if (!data || typeof data !== 'object') return;
      const hasParticipantId = data.participantId !== undefined && data.participantId !== null;
      const hasSessionId = data.sessionId !== undefined && data.sessionId !== null;

      if (currentParticipant) {
        if (!hasParticipantId) return;
        if (String(data.participantId) !== String(currentParticipant.id)) return;
        if (hasSessionId && activeSession && String(data.sessionId) !== String(activeSession.id)) return;
        handleInvalidStudentSession('A tanár feloldotta a munkamenetedet vagy engedélyezte a gépváltást. Most újra beléphetsz.');
        return;
      }

      // Belépés előtti névválasztásnál (nincs aktív munkamenet) csak a névlista foglaltságát frissítjük, ha az érintett osztály nyitva van
      if (selectedClass && loginStep2 && loginStep2.style.display !== 'none' && socket && socket.connected) {
        socket.emit('student:get_occupied', { className: selectedClass });
      }
    });

    // Űrhajós verseny rajtot jelző esemény (Space Race indítása - Report 14 / 16. pont)
    socket.on('race:started', async (data) => {
      if (activeSession && (!data || !data.sessionId || String(data.sessionId) === String(activeSession.id))) {
        const ctx = captureOpenNavContext();
        if (!isOpenNavContextValid(ctx)) return;
        showToast('🚀 A verseny elindult! Sok sikert!', 'success');
        // Kérdések és elindított időzítő azonnali lekérése a szerverről (kontextushoz kötve)
        await startQuizInterface(null, ctx);
      }
    });

    // Tanári léptetés (Teacher Paced): kérdésváltás szinkronizálása
    socket.on('session:question_changed', async (data) => {
      if (activeSession && sessionToken && (!data || !data.sessionId || String(data.sessionId) === String(activeSession.id))) {
        await syncTeacherPacedState();
      }
    });

    // Tanári kézi pontjavítás / részpontadás: összegző képernyő élő frissítése
    socket.on('participant:score_updated', async (data) => {
      if (!activeSession || !sessionToken || !currentParticipant || !data) return;
      if (String(data.sessionId) !== String(activeSession.id)) return;
      if (String(data.participantId) !== String(currentParticipant.id)) return;
      if (summaryContainer && summaryContainer.style.display !== 'none') {
        if (isOpenNavigationMode) {
          await syncOpenNavServerState({ forceSummaryRefresh: true });
        } else {
          await syncTeacherPacedState();
        }
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

    // Diagnosztikai socket események követése
    socket.on('disconnect', (reason) => {
      pushDiagnosticEvent({
        event: 'socket.disconnected',
        reasonCode: mapSocketDisconnectReason(reason)
      });
    });

    socket.on('connect_error', () => {
      const now = Date.now();
      if (now - lastConnectErrorLoggedAt >= CONNECT_ERROR_THROTTLE_MS) {
        lastConnectErrorLoggedAt = now;
        pushDiagnosticEvent({
          event: 'socket.connect_error',
          reasonCode: 'CONNECT_ERROR'
        });
      }
    });

    // Újracsatlakozáskor a foglaltsági állapot és az aktív szobatagság megújítása (Report 14 / 20.)
    socket.on('connect', () => {
      lastConnectErrorLoggedAt = 0;
      if (hasConnectedOnce) {
        pushDiagnosticEvent({
          event: 'socket.reconnected'
        });
        setTimeout(flushDiagnosticsQueue, 200);
      } else {
        hasConnectedOnce = true;
      }

      if (selectedClass && loginStep2 && loginStep2.style.display !== 'none') {
        socket.emit('student:get_occupied', { className: selectedClass });
      }
      if (activeSession && sessionToken) {
        socket.emit('join:session', { sessionId: activeSession.id, role: 'student', token: sessionToken });
        if (isTeacherPacedMode) {
          syncTeacherPacedState();
        } else if (isOpenNavigationMode) {
          syncOpenNavServerState();
        }
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
  function showCalmAlert(message, title = 'Figyelmeztetés', type = 'warning', onClose = null, ownerTag = null) {
    if (!modalAlert) {
      alert(message);
      if (typeof onClose === 'function') onClose();
      return;
    }

    modalAlertCloseCallback = onClose;
    modalAlertOwnerTag = ownerTag;
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
    modalAlertOwnerTag = null;
    if (typeof modalAlertCloseCallback === 'function') {
      const cb = modalAlertCloseCallback;
      modalAlertCloseCallback = null;
      cb();
    }
  }

  /**
   * Egy adott művelethez (pl. Open Navigation beadás) tartozó elavult figyelmeztetés csendes bezárása
   * (a korábbi visszahívás futtatása NÉLKÜL!)
   */
  function dismissCalmAlertByOwner(ownerTag) {
    if (!ownerTag || modalAlertOwnerTag !== ownerTag) return;
    modalAlertCloseCallback = null;
    modalAlertOwnerTag = null;
    closeModal('modal-alert');
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
        if (isOpenNavigationMode) {
          openOpenNavConfirmModal();
        } else {
          openModal('modal-confirm-exit');
        }
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

    // Open Navigation (Szabad navigáció) vezérlőgombok és megerősítő modal
    if (btnOpenNavPrev) {
      btnOpenNavPrev.addEventListener('click', () => {
        if (!isOpenNavigationMode || openNavIsSubmitting) return;
        navigateOpenNavTo(currentQuestionIndex - 1);
      });
    }
    if (btnOpenNavNext) {
      btnOpenNavNext.addEventListener('click', () => {
        if (!isOpenNavigationMode || openNavIsSubmitting) return;
        navigateOpenNavTo(currentQuestionIndex + 1);
      });
    }
    if (btnOpenNavClear) {
      btnOpenNavClear.addEventListener('click', () => {
        if (!isOpenNavigationMode || openNavIsSubmitting) return;
        const q = currentQuestions[currentQuestionIndex];
        if (!q || (q.question_type !== 'ABCD' && q.question_type !== 'TF')) return;
        document.querySelectorAll('.quiz-option-tile, .quiz-tf-tile').forEach((tile) => {
          tile.classList.remove('selected');
          tile.setAttribute('aria-checked', 'false');
        });
        queueOpenNavDraftSave(q.id, '');
      });
    }
    if (btnOpenNavSubmit) {
      btnOpenNavSubmit.addEventListener('click', () => {
        if (!isOpenNavigationMode || openNavIsSubmitting) return;
        openOpenNavConfirmModal();
      });
    }
    if (btnCancelOpenNavSubmit) {
      btnCancelOpenNavSubmit.addEventListener('click', () => {
        if (openNavIsSubmitting) return;
        closeModal('modal-confirm-open-nav-submit');
        if (isOpenNavigationMode && !openNavIsFinalized && btnOpenNavSubmit && typeof btnOpenNavSubmit.focus === 'function') {
          btnOpenNavSubmit.focus();
        }
      });
    }
    if (btnCloseOpenNavModal) {
      btnCloseOpenNavModal.addEventListener('click', () => {
        if (openNavIsSubmitting) return;
        closeModal('modal-confirm-open-nav-submit');
        if (isOpenNavigationMode && !openNavIsFinalized && btnOpenNavSubmit && typeof btnOpenNavSubmit.focus === 'function') {
          btnOpenNavSubmit.focus();
        }
      });
    }
    if (btnConfirmOpenNavSubmit) {
      btnConfirmOpenNavSubmit.addEventListener('click', () => {
        submitOpenNavQuiz();
      });
    }
    if (btnOpenNavKeepServer) {
      btnOpenNavKeepServer.addEventListener('click', () => {
        resolveOpenNavConflictKeepServer();
      });
    }
    if (btnOpenNavSaveLocal) {
      btnOpenNavSaveLocal.addEventListener('click', () => {
        resolveOpenNavConflictSaveLocal();
      });
    }
  }

  /**
   * Élő mérőszámok (Eredmény % és Érdemjegy) frissítése a felső kártyán
   */
  function updateLiveMetrics() {
    if (isOpenNavigationMode) {
      if (quizMetricScoreVal) quizMetricScoreVal.textContent = '–';
      if (quizMetricGradeVal) quizMetricGradeVal.textContent = '–';
      if (quizMetricScoreChip) {
        quizMetricScoreChip.classList.remove('grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5');
      }
      return;
    }

    if (isTeacherPacedMode && !teacherPacedShowFeedback) {
      if (quizMetricScoreVal) quizMetricScoreVal.textContent = '–';
      if (quizMetricGradeVal) quizMetricGradeVal.textContent = '–';
      if (quizMetricScoreChip) {
        quizMetricScoreChip.classList.remove('grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5');
      }
      return;
    }

    if (isTeacherPacedMode && lastServerResults) {
      const answeredCountTp = answeredQuestionIds.size + (teacherPacedCurrentAnswer ? 1 : 0);
      if (answeredCountTp === 0 && (!lastServerResults.total_points || lastServerResults.total_points === 0)) {
        if (quizMetricScoreVal) quizMetricScoreVal.textContent = '–';
        if (quizMetricGradeVal) quizMetricGradeVal.textContent = '–';
        if (quizMetricScoreChip) {
          quizMetricScoreChip.classList.remove('grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5');
        }
        return;
      }
      const pctTp = Math.min(100, Math.round(Number(lastServerResults.percentage) || 0));
      const gradeTp = lastServerResults.grade || calculateKRÉTAGrade(pctTp, sessionThresholds);
      if (quizMetricScoreVal) quizMetricScoreVal.textContent = `${pctTp}%`;
      if (quizMetricGradeVal) quizMetricGradeVal.textContent = `${gradeTp}`;
      if (quizMetricScoreChip) {
        quizMetricScoreChip.classList.remove('grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5');
        quizMetricScoreChip.classList.add(`grade-${gradeTp}`);
      }
      return;
    }

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
      currentParticipant = data.participant || null;
      openNavSessionEpoch++;
      openNavIsFinalized = false;
      openNavClosurePending = false;
      openNavPendingScoreRefresh = false;
      isOpenNavigationMode = Boolean(
        (activeSession && activeSession.mode === 'OPEN_NAVIGATION')
        || (currentParticipant && currentParticipant.session_mode === 'OPEN_NAVIGATION')
      );
      sessionStorage.setItem('ropdolgozat_token', sessionToken);

      // Diagnosztikai állapot és hatókör beállítása
      const joinScope = data.participant ? `${data.participant.session_id}_${data.participant.id}` : null;
      applyDiagnosticsScope(joinScope, data.diagnosticsEnabled);

      // Socket szobához csatlakozás hitelesítő tokennel
      if (socket) {
        socket.emit('join:session', { sessionId: activeSession.id, role: 'student', token: sessionToken });
      }

      // Megválaszolt kérdések eltárolása (ha volt)
      if (Array.isArray(data.answers)) {
        data.answers.forEach(ans => answeredQuestionIds.add(ans.question_id));
      }

      // Kvíz felület elindítása (a most rögzített munkamenet-kontextussal)
      await startQuizInterface(null, captureOpenNavContext());

    } catch (err) {
      console.error('Hiba a belépés során:', err);
      showCalmAlert('Hálózati hiba a belépéskor! Kérlek, próbáld újra.', 'Hálózati hiba', 'error');
    }
  }

  let loginListsInitialized = false;

  /**
   * Teljes kérés- és választest-időkorlátos JSON fetch wrapper
   * Az abort időzítője a fejlécek ÉS a teljes választest beolvasásának végéig fut!
   */
  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    let timedOut = false;
    const timerId = controller
      ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
      : null;

    try {
      const res = await fetch(url, controller ? { ...options, signal: controller.signal } : options);
      const rawText = await res.text();
      let data = null;
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          return { ok: false, status: res.status, data: null, errorKind: 'invalid_body' };
        }
      }
      return { ok: res.ok, status: res.status, data, errorKind: null };
    } catch {
      return { ok: false, status: 0, data: null, errorKind: timedOut ? 'timeout' : 'network' };
    } finally {
      if (timerId !== null) clearTimeout(timerId);
    }
  }

  function isConfirmedTokenInvalidResponse(resObj) {
    if (!resObj || (resObj.status !== 401 && resObj.status !== 404)) return false;
    // Kizárólag valódi API JSON hiba esetén tekintjük igazolt tokenérvénytelenségnek (pl. proxy/HTML 404 nem!)
    return Boolean(resObj.data && typeof resObj.data === 'object' && (resObj.data.error || resObj.data.code));
  }

  /**
   * Egységes, atomi visszatérés a belépési felületre igazolt érvénytelen munkamenetnél vagy feloldáskor.
   * Először érvényteleníti a régi kontextust, majd teljesen törli az előző diák összes kliensoldali adatát!
   */
  async function handleInvalidStudentSession(reasonMessage = null) {
    // 1. Először érvénytelenítjük a régi kontextust (minden késői async művelet kizárása)
    openNavSessionEpoch++;
    quizInterfaceLoadSeq++;
    questionViewSeq++;
    teacherPacedSyncSeq++;

    // 2. Előző diák összes kliensoldali adatának és időzítőjének teljes törlése
    sessionToken = null;
    currentParticipant = null;
    activeSession = null;
    currentQuiz = null;
    currentQuestions = [];
    currentQuestionIndex = 0;
    answeredQuestionIds.clear();
    studentSubmittedAnswers.clear();
    earnedPoints = 0;
    lastServerResults = null;
    quizStartTime = null;
    selectedStudent = null;

    isTeacherPacedMode = false;
    teacherPacedQuestionIndex = 0;
    teacherPacedTotalQuestions = 0;
    teacherPacedCurrentAnswer = null;

    isOpenNavigationMode = false;
    openNavIsFinalized = false;
    openNavIsSubmitting = false;
    openNavClosurePending = false;
    openNavPendingScoreRefresh = false;
    openNavStatusCheckPromise = null;
    openNavRetryAttempt = 0;
    syncOpenNavConfirmModalControls();

    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (openNavTimerRetryId) { clearTimeout(openNavTimerRetryId); openNavTimerRetryId = null; }
    for (const tId of openNavShortTimers.values()) clearTimeout(tId);
    openNavShortTimers.clear();
    openNavDrafts.clear();
    openNavQueues.clear();

    sessionStorage.removeItem('ropdolgozat_token');
    clearDiagnosticsBuffer();
    dismissCalmAlertByOwner('open_nav_submit');

    // 3. Felület visszaállítása tiszta belépési állapotba
    closeModal('modal-confirm-open-nav-submit');
    if (openNavConflictBanner) openNavConflictBanner.style.display = 'none';
    if (btnOpenNavSubmit) btnOpenNavSubmit.style.display = 'none';
    if (quizContainer) quizContainer.style.display = 'none';
    if (lobbyContainer) lobbyContainer.style.display = 'none';
    if (summaryContainer) summaryContainer.style.display = 'none';
    if (quizTopBar) quizTopBar.style.display = 'none';
    if (studentTopBar) studentTopBar.style.display = 'flex';
    if (loginContainer) loginContainer.style.display = 'block';
    if (studentEntryWrapper) studentEntryWrapper.classList.remove('quiz-active', 'summary-active');
    if (studentEntryInner) studentEntryInner.classList.remove('quiz-active', 'summary-active', 'has-image');
    if (selectStudent) selectStudent.value = '';
    if (btnJoinSession) btnJoinSession.disabled = true;

    // 4. Belépési listák egyszeri, párhuzamosság-védett betöltése
    if (!loginListsInitialized) {
      if (!loginListsLoadPromise) {
        loginListsLoadPromise = (async () => {
          try {
            await loadSubjects();
            await loadClasses();
            loginListsInitialized = true;
          } catch {
            loginListsInitialized = false;
          } finally {
            loginListsLoadPromise = null;
          }
        })();
      }
      await loginListsLoadPromise;
    }

    if (reasonMessage) {
      showCalmAlert(reasonMessage, 'Munkamenet lejárt', 'info');
    }
  }

  /**
   * Munkamenet helyreállítása (Session Recovery)
   * Kizárólag igazolt API 401/404 esetén törli a tokent és vezeti vissza a belépéshez; 5xx/hálózati/timeout hibánál megőrzi!
   */
  async function tryRestoreSession(token) {
    const restoreEpoch = openNavSessionEpoch;
    const resObj = await fetchJsonWithTimeout('/api/student/session-data', {
      headers: { 'x-session-token': token }
    }, 10000);

    // Ha közben munkamenet-érvénytelenítés vagy új belépés történt, a régi helyreállítás eldobandó!
    if (restoreEpoch !== openNavSessionEpoch || sessionStorage.getItem('ropdolgozat_token') !== token) {
      return false;
    }

    if (isConfirmedTokenInvalidResponse(resObj)) {
      await handleInvalidStudentSession();
      return false;
    }

    if (!resObj.ok || !resObj.data || !resObj.data.participant) {
      showCalmAlert(
        'A szerver átmenetileg nem elérhető, de a munkameneted megmaradt. Kattints az OK gombra az újrapróbáláshoz!',
        'Átmeneti kapcsolati hiba',
        'warning',
        () => { tryRestoreSession(token); }
      );
      return true;
    }

    const data = resObj.data;
    sessionToken = token;
    currentParticipant = data.participant || null;
    const restoredScope = data.participant ? `${data.participant.session_id}_${data.participant.id}` : null;
    applyDiagnosticsScope(restoredScope, data.diagnosticsEnabled);
    activeSession = {
      id: data.participant.session_id,
      title: data.quiz.title,
      status: data.participant.session_status,
      mode: data.participant.session_mode
    };

    if (socket) {
      socket.emit('join:session', { sessionId: activeSession.id, role: 'student', token: sessionToken });
    }

    if (data.participant.is_finished === 1 || data.participant.session_status === 'FINISHED' || (data.session && data.session.review_phase)) {
      const isTpFinished = data.participant.session_mode === 'TEACHER_PACED'
        && (data.participant.session_status === 'FINISHED' || Boolean(data.session && data.session.review_phase));
      openNavIsFinalized = data.participant.session_mode === 'OPEN_NAVIGATION' && data.participant.is_finished === 1;
      if (openNavIsFinalized) quizInterfaceLoadSeq++;
      showSummary({
        totalPoints: data.results ? data.results.total_points : null,
        maxPoints: (data.results && data.results.max_points) || (data.quiz && data.quiz.total_points),
        percentage: data.results ? data.results.percentage : null,
        grade: data.results ? data.results.grade : null,
        gradeText: data.results ? data.results.grade_text : '',
        showFeedback: isTpFinished ? true : Boolean(data.participant.show_feedback_on_end === 1 && data.results !== null),
        participant: data.participant,
        session: data.session,
        quiz: data.quiz,
        answers: data.answers || []
      });
      return true;
    }

    await startQuizInterface(data, captureOpenNavContext());
    return true;
  }

  /**
   * Teacher Paced (Tanári léptetés) és élő összegzés sorosított, verziózott állapot-szinkronizálás
   */
  async function syncTeacherPacedState() {
    const ctx = captureOpenNavContext();
    if (!isOpenNavContextValid(ctx)) return;
    const mySeq = ++teacherPacedSyncSeq;
    const resObj = await fetchJsonWithTimeout('/api/student/session-data', {
      headers: { 'x-session-token': ctx.token }
    }, 10000);

    if (!isOpenNavContextValid(ctx) || mySeq !== teacherPacedSyncSeq) return;

    if (isConfirmedTokenInvalidResponse(resObj)) {
      await handleInvalidStudentSession('A munkameneted érvénytelen lett vagy gépváltás történt. Kérlek, lépj be újra!');
      return;
    }
    if (!resObj.ok || !resObj.data) return;
    const data = resObj.data;
    if (ctx.sessionId && data.participant && String(data.participant.session_id) !== ctx.sessionId) return;
    if (ctx.participantId && data.participant && String(data.participant.id) !== ctx.participantId) return;

    if (data.participant) {
      currentParticipant = data.participant;
    }

    const isSummaryReady = data.participant && (
      data.participant.session_status === 'FINISHED'
      || data.participant.is_finished === 1
      || (data.session && data.session.review_phase)
    );
    if (isSummaryReady) {
      const isTpSummary = data.participant.session_mode === 'TEACHER_PACED'
        && (data.participant.session_status === 'FINISHED' || Boolean(data.session && data.session.review_phase));
      showSummary({
        totalPoints: data.results ? data.results.total_points : null,
        maxPoints: (data.results && data.results.max_points) || (data.quiz && data.quiz.total_points),
        percentage: data.results ? data.results.percentage : null,
        grade: data.results ? data.results.grade : null,
        gradeText: data.results ? data.results.grade_text : '',
        showFeedback: isTpSummary ? true : Boolean(data.participant.show_feedback_on_end === 1 && data.results !== null),
        participant: data.participant,
        session: data.session,
        quiz: data.quiz,
        answers: data.answers || []
      });
      return;
    }

    await startQuizInterface(data, ctx);
  }

  function showTeacherPacedWaitPill() {
    if (teacherPacedWaitBanner) teacherPacedWaitBanner.style.display = 'none';
    if (!teacherPacedWaitPill) return;
    const isLastTp = teacherPacedTotalQuestions > 0 && (teacherPacedQuestionIndex + 1 >= teacherPacedTotalQuestions);
    if (teacherPacedWaitPillText) {
      teacherPacedWaitPillText.textContent = isLastTp
        ? 'Várd meg a dolgozat lezárását!'
        : 'Várd meg a tanár léptetését!';
    }
    teacherPacedWaitPill.style.display = 'inline-flex';
  }

  function showTeacherPacedWaitBanner() {
    if (teacherPacedWaitPill) teacherPacedWaitPill.style.display = 'none';
    if (!teacherPacedWaitBanner) return;
    const isLastTp = teacherPacedTotalQuestions > 0 && (teacherPacedQuestionIndex + 1 >= teacherPacedTotalQuestions);
    if (teacherPacedWaitText) {
      teacherPacedWaitText.textContent = isLastTp
        ? 'Válasz beküldve. Várd meg, amíg a tanár lezárja a dolgozatot!'
        : 'Válasz beküldve. Várd meg, amíg a tanár a következő kérdésre lép!';
    }
    teacherPacedWaitBanner.style.display = 'flex';
  }

  // =========================================================================
  // OPEN NAVIGATION (SZABAD NAVIGÁCIÓ) – KÉRDÉSTÉRKÉP, PISZKOZATMENTÉS, BEADÁS
  // =========================================================================

  const OPEN_NAV_MAX_SHORT_LEN = 500;

  function getOpenNavEntry(questionId) {
    const qId = Number(questionId);
    if (!openNavDrafts.has(qId)) {
      openNavDrafts.set(qId, {
        localValue: '',
        serverValue: '',
        version: 0,
        localSeq: 0,
        ackedSeq: 0,
        inFlight: false,
        conflict: null,
        status: 'empty',
        hasUnsaved: false
      });
    }
    return openNavDrafts.get(qId);
  }

  function findOpenNavQuestion(questionId) {
    const qId = Number(questionId);
    return currentQuestions.find(q => Number(q.id) === qId) || null;
  }

  function normalizeDraftForQuestion(q, rawValue) {
    const str = String(rawValue ?? '');
    if (q && q.question_type === 'ABCD') {
      // Veszteségmentes: sem trim, sem 500 karakteres vágás!
      return str;
    }
    if (q && q.question_type === 'TF') {
      return str.trim();
    }
    // SHORT (szabad szöveg): trim, a 500-as korlátot validáljuk, nem némán vágjuk
    return str.trim();
  }

  function isOpenNavEntryPending(entry) {
    return Boolean(entry && !entry.conflict && (entry.inFlight || entry.localSeq > entry.ackedSeq || entry.hasUnsaved || entry.status === 'saving'));
  }

  function getOpenNavSavedCount() {
    let count = 0;
    for (const q of currentQuestions) {
      const entry = openNavDrafts.get(Number(q.id));
      if (entry && String(entry.serverValue ?? '') !== '') {
        count++;
      }
    }
    return count;
  }

  function renderOpenNavConflictBanner() {
    if (!openNavConflictBanner) return;
    if (!isOpenNavigationMode) {
      openNavConflictBanner.style.display = 'none';
      return;
    }
    const q = currentQuestions[currentQuestionIndex];
    const entry = q ? getOpenNavEntry(q.id) : null;
    if (!entry || !entry.conflict) {
      openNavConflictBanner.style.display = 'none';
      return;
    }
    const fmtVal = (v) => (String(v ?? '') === '' ? '(üres / nincs megjelölve)' : String(v));
    if (openNavConflictServerVal) openNavConflictServerVal.textContent = fmtVal(entry.conflict.serverValue);
    if (openNavConflictLocalVal) openNavConflictLocalVal.textContent = fmtVal(entry.localValue);
    openNavConflictBanner.style.display = 'block';
  }

  function resolveOpenNavConflictKeepServer() {
    const q = currentQuestions[currentQuestionIndex];
    if (!q || !isOpenNavigationMode || openNavIsSubmitting) return;
    const entry = getOpenNavEntry(q.id);
    if (!entry.conflict) return;
    entry.localValue = String(entry.conflict.serverValue ?? '');
    entry.serverValue = entry.localValue;
    entry.version = Number(entry.conflict.serverVersion) || entry.version;
    entry.conflict = null;
    entry.ackedSeq = entry.localSeq;
    entry.hasUnsaved = false;
    entry.status = entry.serverValue !== '' ? 'saved' : 'empty';
    renderQuestion(currentQuestionIndex);
    refreshOpenNavUi();
  }

  function resolveOpenNavConflictSaveLocal() {
    const q = currentQuestions[currentQuestionIndex];
    if (!q || !isOpenNavigationMode || openNavIsSubmitting) return;
    const entry = getOpenNavEntry(q.id);
    if (!entry.conflict) return;
    const chosenLocal = String(entry.localValue ?? '');
    entry.version = Number(entry.conflict.serverVersion) || entry.version;
    entry.conflict = null;
    queueOpenNavDraftSave(q.id, chosenLocal);
  }

  function updateOpenNavProgressBar() {
    if (!isOpenNavigationMode || !currentQuestions.length) return;
    const savedCount = getOpenNavSavedCount();
    const total = currentQuestions.length;
    const pct = Math.round((savedCount / total) * 100);
    if (quizProgressBarFill) quizProgressBarFill.style.width = `${pct}%`;
    if (progressTextDone) {
      progressTextDone.textContent = savedCount === 0 ? 'Szabad navigáció' : `${savedCount} válasz mentve`;
    }
    if (progressTextCurrent) {
      progressTextCurrent.textContent = `${currentQuestionIndex + 1}. kérdés megtekintve`;
    }
    const remaining = Math.max(0, total - savedCount);
    if (progressTextRemaining) {
      progressTextRemaining.textContent = remaining === 0 ? 'Minden kérdés megválaszolva' : `${remaining} megválaszolatlan`;
    }
  }

  function refreshOpenNavUi() {
    renderOpenNavMap();
    updateOpenNavProgressBar();
    updateOpenNavFooter();
    renderOpenNavConflictBanner();
    const confirmModal = document.getElementById('modal-confirm-open-nav-submit');
    if (confirmModal && confirmModal.classList.contains('active')) {
      refreshOpenNavConfirmModal();
    }
  }

  function renderOpenNavMap() {
    if (!isOpenNavigationMode || !openNavMapGrid) return;
    openNavMapGrid.innerHTML = '';

    currentQuestions.forEach((q, idx) => {
      const entry = getOpenNavEntry(q.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'open-nav-map-btn';
      btn.disabled = openNavIsSubmitting;

      if (idx === currentQuestionIndex) {
        btn.classList.add('is-current');
        btn.setAttribute('aria-current', 'step');
      }

      let stateIcon = '';
      let stateLabel = 'üres';
      if (entry.conflict || entry.status === 'conflict') {
        btn.classList.add('is-error');
        stateIcon = 'error';
        stateLabel = 'eltérő verzió – egyeztetés szükséges';
      } else if (entry.status === 'error') {
        btn.classList.add('is-error');
        stateIcon = 'error';
        stateLabel = 'mentési hiba';
      } else if (isOpenNavEntryPending(entry)) {
        btn.classList.add('is-saving');
        stateIcon = 'sync';
        stateLabel = 'mentés folyamatban';
      } else if (String(entry.serverValue ?? '') !== '') {
        btn.classList.add('is-saved');
        stateIcon = 'check';
        stateLabel = 'mentett válasz';
      }

      btn.title = `${idx + 1}. kérdés – ${stateLabel}`;
      btn.setAttribute('aria-label', `${idx + 1}. kérdés, ${stateLabel}`);
      btn.innerHTML = `
        <span>${idx + 1}</span>
        ${stateIcon ? `<span class="material-symbols-outlined open-nav-map-icon">${stateIcon}</span>` : ''}
      `;

      btn.addEventListener('click', () => {
        if (openNavIsSubmitting) return;
        navigateOpenNavTo(idx);
      });

      openNavMapGrid.appendChild(btn);
    });
  }

  function updateOpenNavFooter() {
    if (!isOpenNavigationMode) return;
    const q = currentQuestions[currentQuestionIndex];
    const entry = q ? getOpenNavEntry(q.id) : null;

    if (btnOpenNavPrev) {
      btnOpenNavPrev.disabled = openNavIsSubmitting || currentQuestionIndex <= 0;
    }
    if (btnOpenNavNext) {
      btnOpenNavNext.disabled = openNavIsSubmitting || currentQuestionIndex >= currentQuestions.length - 1;
    }
    if (btnOpenNavSubmit) {
      btnOpenNavSubmit.disabled = openNavIsSubmitting;
    }

    if (btnOpenNavClear) {
      const canClearType = q && (q.question_type === 'ABCD' || q.question_type === 'TF');
      const hasVal = entry && (String(entry.localValue ?? '') !== '' || String(entry.serverValue ?? '') !== '');
      if (!canClearType) {
        btnOpenNavClear.style.display = 'none';
        btnOpenNavClear.classList.remove('is-hidden-slot');
        btnOpenNavClear.disabled = true;
      } else {
        btnOpenNavClear.style.display = 'inline-flex';
        if (hasVal) {
          btnOpenNavClear.classList.remove('is-hidden-slot');
          btnOpenNavClear.disabled = openNavIsSubmitting;
          btnOpenNavClear.removeAttribute('aria-hidden');
          btnOpenNavClear.tabIndex = 0;
        } else {
          btnOpenNavClear.classList.add('is-hidden-slot');
          btnOpenNavClear.disabled = true;
          btnOpenNavClear.setAttribute('aria-hidden', 'true');
          btnOpenNavClear.tabIndex = -1;
        }
      }
    }

    if (openNavSaveStatus) {
      openNavSaveStatus.classList.remove('status-saving', 'status-saved', 'status-error');
      if (openNavClosurePending) {
        openNavSaveStatus.textContent = 'A lezárás ellenőrzése folyamatban…';
        openNavSaveStatus.classList.add('status-saving');
      } else if (openNavIsSubmitting) {
        openNavSaveStatus.textContent = 'Válaszok mentése és beadás…';
        openNavSaveStatus.classList.add('status-saving');
      } else if (entry && (entry.conflict || entry.status === 'conflict')) {
        openNavSaveStatus.textContent = 'Ütközés: válaszd ki fenn, melyik válasz maradjon!';
        openNavSaveStatus.classList.add('status-error');
      } else if (entry && entry.status === 'error') {
        openNavSaveStatus.textContent = 'Mentési hiba – ellenőrizd és próbáld újra';
        openNavSaveStatus.classList.add('status-error');
      } else if (isOpenNavEntryPending(entry)) {
        openNavSaveStatus.textContent = 'Mentés folyamatban…';
        openNavSaveStatus.classList.add('status-saving');
      } else if (entry && String(entry.serverValue ?? '') !== '') {
        openNavSaveStatus.textContent = 'Válasz mentve';
        openNavSaveStatus.classList.add('status-saved');
      } else {
        openNavSaveStatus.textContent = 'Még nincs kiválasztott válasz';
      }
    }
  }

  function captureOpenNavContext() {
    return {
      epoch: openNavSessionEpoch,
      token: sessionToken,
      sessionId: activeSession ? String(activeSession.id) : null,
      participantId: currentParticipant ? String(currentParticipant.id) : null
    };
  }

  function isOpenNavContextValid(ctx) {
    if (!ctx || !ctx.token) return false;
    if (ctx.epoch !== openNavSessionEpoch) return false;
    if (sessionToken !== ctx.token) return false;
    if (ctx.sessionId && (!activeSession || String(activeSession.id) !== ctx.sessionId)) return false;
    if (ctx.participantId && (!currentParticipant || String(currentParticipant.id) !== ctx.participantId)) return false;
    return true;
  }

  /**
   * Egyetlen közös helyi szerkesztés-rögzítő: már a beírás/kijelölés pillanatában növeli localSeq-et!
   */
  function recordOpenNavLocalEdit(questionId, rawValue) {
    if (!isOpenNavigationMode || !sessionToken || openNavIsFinalized) return null;
    const qId = Number(questionId);
    const q = findOpenNavQuestion(qId);
    const entry = getOpenNavEntry(qId);
    const normalized = normalizeDraftForQuestion(q, rawValue);

    entry.localSeq += 1;
    entry.localValue = normalized;
    entry.hasUnsaved = true;

    if (q && q.question_type === 'SHORT' && normalized.length > OPEN_NAV_MAX_SHORT_LEN) {
      entry.status = 'error';
    } else if (entry.conflict) {
      entry.status = 'conflict';
    } else {
      entry.status = 'saving';
    }
    refreshOpenNavUi();
    return entry;
  }

  function flushShortDraftForQuestion(questionId) {
    const qId = Number(questionId);
    if (openNavShortTimers.has(qId)) {
      clearTimeout(openNavShortTimers.get(qId));
      openNavShortTimers.delete(qId);
      // Mindig a kérdés már rögzített entry.localValue értékét küldjük, új sorszám generálása nélkül!
      dispatchOpenNavDraftSave(qId);
    }
  }

  function navigateOpenNavTo(targetIndex) {
    if (!isOpenNavigationMode || openNavIsSubmitting) return;
    if (targetIndex < 0 || targetIndex >= currentQuestions.length) return;
    const currentQ = currentQuestions[currentQuestionIndex];
    if (currentQ && currentQ.question_type === 'SHORT') {
      flushShortDraftForQuestion(currentQ.id);
    }
    renderQuestion(targetIndex);
  }

  function queueOpenNavDraftSave(questionId, targetValue) {
    const entry = recordOpenNavLocalEdit(questionId, targetValue);
    if (!entry) return Promise.resolve(false);
    return dispatchOpenNavDraftSave(questionId);
  }

  function dispatchOpenNavDraftSave(questionId) {
    if (!isOpenNavigationMode || !sessionToken || openNavIsFinalized) return Promise.resolve(false);
    const qId = Number(questionId);
    const q = findOpenNavQuestion(qId);
    const entry = getOpenNavEntry(qId);
    const ctx = captureOpenNavContext();

    if (q && q.question_type === 'SHORT' && String(entry.localValue ?? '').length > OPEN_NAV_MAX_SHORT_LEN) {
      entry.status = 'error';
      refreshOpenNavUi();
      return Promise.resolve(false);
    }

    if (entry.conflict) {
      entry.status = 'conflict';
      refreshOpenNavUi();
      return Promise.resolve(false);
    }

    const prevChain = openNavQueues.get(qId) || Promise.resolve();
    const nextChain = prevChain.catch(() => {}).then(async () => {
      if (!isOpenNavContextValid(ctx) || !isOpenNavigationMode || openNavIsFinalized) {
        return false;
      }

      while (isOpenNavContextValid(ctx) && isOpenNavigationMode && !openNavIsFinalized) {
        if (entry.conflict) {
          entry.status = 'conflict';
          refreshOpenNavUi();
          return false;
        }
        if (entry.localSeq <= entry.ackedSeq && !entry.hasUnsaved && entry.status !== 'error') {
          return true;
        }

        const sentSeq = entry.localSeq;
        const valueToSend = String(entry.localValue ?? '');
        if (q && q.question_type === 'SHORT' && valueToSend.length > OPEN_NAV_MAX_SHORT_LEN) {
          entry.status = 'error';
          refreshOpenNavUi();
          return false;
        }

        const baseVer = Number.isSafeInteger(entry.version) && entry.version >= 0 ? entry.version : 0;
        entry.inFlight = true;
        entry.status = 'saving';
        refreshOpenNavUi();

        const resObj = await fetchJsonWithTimeout('/api/student/save-draft', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-token': ctx.token
          },
          body: JSON.stringify({
            session_token: ctx.token,
            question_id: qId,
            draft_answer: valueToSend,
            base_version: baseVer
          })
        }, 10000);

        if (!isOpenNavContextValid(ctx) || openNavIsFinalized) return false;
        entry.inFlight = false;

        const result = (resObj.data && typeof resObj.data === 'object') ? resObj.data : {};

        if (isConfirmedTokenInvalidResponse(resObj)) {
          await handleInvalidStudentSession('A munkameneted érvénytelen lett vagy gépváltás történt. Kérlek, lépj be újra!');
          return false;
        }

        if (resObj.ok && result.success) {
          entry.version = Number.isSafeInteger(Number(result.version)) ? Number(result.version) : (baseVer + 1);
          entry.serverValue = String(result.draft_answer ?? '');
          if (entry.localSeq === sentSeq) {
            entry.ackedSeq = sentSeq;
            entry.hasUnsaved = false;
            entry.status = entry.serverValue !== '' ? 'saved' : 'empty';
            refreshOpenNavUi();
            return true;
          }
          // Sikeres nyugta érkezett, de azóta már újabb helyi szerkesztés (localSeq > sentSeq) történt!
          entry.hasUnsaved = true;
          entry.status = 'saving';
          refreshOpenNavUi();
          // Ha még fut a 400 ms-os debounce timer az újabb SHORT szöveghez, ne küldjük el idő előtt, hagyjuk meg a timert
          if (openNavShortTimers.has(qId)) {
            return true;
          }
          continue;
        }

        if (resObj.status === 409 && result.code === 'DRAFT_VERSION_CONFLICT') {
          const srvVer = Number.isSafeInteger(Number(result.currentVersion)) ? Number(result.currentVersion) : entry.version;
          const srvVal = String(result.currentAnswer ?? '');
          entry.version = srvVer;
          entry.serverValue = srvVal;

          if (srvVal === valueToSend) {
            if (entry.localSeq === sentSeq) {
              entry.ackedSeq = sentSeq;
              entry.hasUnsaved = false;
              entry.status = srvVal !== '' ? 'saved' : 'empty';
              refreshOpenNavUi();
              return true;
            }
            entry.hasUnsaved = true;
            entry.status = 'saving';
            refreshOpenNavUi();
            if (openNavShortTimers.has(qId)) return true;
            continue;
          }

          entry.conflict = { serverValue: srvVal, serverVersion: srvVer };
          entry.status = 'conflict';
          entry.hasUnsaved = true;
          refreshOpenNavUi();
          return false;
        }

        if (result.code === 'DEADLINE_EXCEEDED' || result.code === 'PARTICIPANT_ALREADY_FINISHED' || result.code === 'SESSION_INACTIVE') {
          openNavClosurePending = true;
          entry.status = 'closure_pending';
          refreshOpenNavUi();
          await syncOpenNavServerState({ requireFinal: true, expectedCtx: ctx });
          return false;
        }

        entry.status = 'error';
        entry.hasUnsaved = true;
        refreshOpenNavUi();
        return false;
      }
      return false;
    });

    openNavQueues.set(qId, nextChain);
    return nextChain;
  }

  async function flushAllOpenNavDrafts() {
    // 1. Függő SHORT időzítők azonnali elsütése (a már rögzített entry.localValue alapján, új sorszám nélkül!)
    for (const [qId, timerId] of Array.from(openNavShortTimers.entries())) {
      clearTimeout(timerId);
      openNavShortTimers.delete(qId);
      const entry = getOpenNavEntry(qId);
      if (entry.conflict) continue;
      dispatchOpenNavDraftSave(qId);
    }

    // 2. Feloldatlan ütközéseket NEM írjuk felül; a többi hibás/mentetlen kérdést elindítjuk
    let conflictCount = 0;
    for (const q of currentQuestions) {
      const entry = getOpenNavEntry(q.id);
      if (entry.conflict) {
        conflictCount++;
      } else if (entry.status === 'error' || entry.hasUnsaved || entry.localSeq > entry.ackedSeq) {
        dispatchOpenNavDraftSave(q.id);
      }
    }

    if (conflictCount > 0) {
      return { ok: false, failedCount: conflictCount, conflictCount };
    }

    const pendingPromises = Array.from(openNavQueues.values());
    if (pendingPromises.length > 0) {
      await Promise.allSettled(pendingPromises);
    }

    // 4. Ellenőrzés: elkülönítjük a függő lezárásellenőrzést, az ütközést és a javítható mentési hibát
    if (openNavClosurePending) {
      return { ok: false, failedCount: 0, conflictCount: 0, closurePending: true };
    }

    let failedCount = 0;
    conflictCount = 0;
    for (const q of currentQuestions) {
      const entry = getOpenNavEntry(q.id);
      if (entry.status === 'closure_pending') {
        openNavClosurePending = true;
        return { ok: false, failedCount: 0, conflictCount: 0, closurePending: true };
      }
      if (entry.conflict) {
        conflictCount++;
        failedCount++;
      } else if (entry.status === 'error' || entry.hasUnsaved || entry.localSeq > entry.ackedSeq) {
        failedCount++;
      }
    }
    return { ok: failedCount === 0, failedCount, conflictCount, closurePending: false };
  }

  function refreshOpenNavConfirmModal() {
    if (!isOpenNavigationMode) return;
    syncOpenNavConfirmModalControls();

    const activeEl = document.activeElement;
    const focusedId = activeEl && activeEl.id ? activeEl.id : null;
    const focusedUnansweredIdx = activeEl && activeEl.dataset && activeEl.dataset.unansweredIdx !== undefined
      ? activeEl.dataset.unansweredIdx
      : null;

    const total = currentQuestions.length;
    const savedCount = getOpenNavSavedCount();
    const unansweredIndices = [];
    let pendingCount = 0;
    let errorCount = 0;
    let conflictCount = 0;

    currentQuestions.forEach((q, idx) => {
      const entry = getOpenNavEntry(q.id);
      if (entry.conflict) {
        conflictCount++;
      } else if (entry.status === 'error') {
        errorCount++;
      } else if (isOpenNavEntryPending(entry)) {
        pendingCount++;
      }
      if (String(entry.serverValue ?? '') === '') {
        unansweredIndices.push(idx);
      }
    });

    if (openNavModalSummary) {
      let summaryMsg = `${savedCount} / ${total} kérdésre van visszaigazolt mentett válaszod.`;
      if (pendingCount > 0) {
        summaryMsg += ` (${pendingCount} mentés folyamatban van.)`;
      }
      if (conflictCount > 0) {
        summaryMsg += ` (${conflictCount} kérdésnél verzióütközés van – előbb döntsd el, melyik válasz maradjon!)`;
      } else if (errorCount > 0) {
        summaryMsg += ` (${errorCount} kérdés mentése hibás – ellenőrizd beadás előtt!)`;
      }
      openNavModalSummary.textContent = summaryMsg;
    }

    if (openNavUnansweredBox && openNavUnansweredList) {
      openNavUnansweredList.innerHTML = '';
      if (unansweredIndices.length > 0) {
        openNavUnansweredBox.style.display = 'block';
        unansweredIndices.forEach((idx) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'open-nav-unanswered-btn';
          btn.dataset.unansweredIdx = String(idx);
          btn.textContent = `${idx + 1}. kérdés`;
          btn.addEventListener('click', () => {
            closeModal('modal-confirm-open-nav-submit');
            navigateOpenNavTo(idx);
          });
          openNavUnansweredList.appendChild(btn);
        });
      } else {
        openNavUnansweredBox.style.display = 'none';
      }
    }

    if (focusedId) {
      const el = document.getElementById(focusedId);
      if (el && typeof el.focus === 'function') el.focus();
    } else if (focusedUnansweredIdx !== null && openNavUnansweredList) {
      const el = openNavUnansweredList.querySelector(`[data-unanswered-idx="${focusedUnansweredIdx}"]`);
      if (el && typeof el.focus === 'function') el.focus();
    }
  }

  /**
   * Egyetlen állapotforrás a beadási megerősítő modál gombjaihoz (2. fejezet)
   */
  function syncOpenNavConfirmModalControls() {
    const lockConfirm = Boolean(openNavIsSubmitting || openNavIsFinalized || openNavClosurePending);
    const lockCancel = Boolean(openNavIsSubmitting);
    if (btnConfirmOpenNavSubmit) btnConfirmOpenNavSubmit.disabled = lockConfirm;
    if (btnCancelOpenNavSubmit) btnCancelOpenNavSubmit.disabled = lockCancel;
    if (btnCloseOpenNavModal) btnCloseOpenNavModal.disabled = lockCancel;
  }

  function openOpenNavConfirmModal() {
    if (!isOpenNavigationMode || openNavIsSubmitting || openNavIsFinalized) return;
    if (openNavClosurePending) {
      syncOpenNavServerState({ requireFinal: true });
      return;
    }
    const currentQ = currentQuestions[currentQuestionIndex];
    if (currentQ && currentQ.question_type === 'SHORT') {
      flushShortDraftForQuestion(currentQ.id);
    }
    syncOpenNavConfirmModalControls();
    refreshOpenNavConfirmModal();
    openModal('modal-confirm-open-nav-submit');
    if (btnConfirmOpenNavSubmit && !btnConfirmOpenNavSubmit.disabled && typeof btnConfirmOpenNavSubmit.focus === 'function') {
      btnConfirmOpenNavSubmit.focus();
    } else if (btnCancelOpenNavSubmit && !btnCancelOpenNavSubmit.disabled && typeof btnCancelOpenNavSubmit.focus === 'function') {
      btnCancelOpenNavSubmit.focus();
    }
  }

  function buildOpenNavSummaryPayload(data) {
    return {
      totalPoints: data.results ? data.results.total_points : null,
      maxPoints: (data.results && data.results.max_points) || (currentQuiz ? currentQuiz.total_points : null),
      percentage: data.results ? data.results.percentage : null,
      grade: data.results ? data.results.grade : null,
      gradeText: data.results ? data.results.grade_text : '',
      showFeedback: Boolean(data.participant && data.participant.show_feedback_on_end === 1 && data.results !== null),
      participant: data.participant,
      session: data.session,
      quiz: data.quiz,
      answers: data.answers || []
    };
  }

  function scheduleOpenNavStatusRetry(ctx, { fromTimer = false, requireFinal = false } = {}) {
    if (openNavIsFinalized || !isOpenNavContextValid(ctx) || !isOpenNavigationMode) return;
    if (openNavTimerRetryId) clearTimeout(openNavTimerRetryId);
    const backoffSteps = [1500, 3000, 5000, 8000];
    const baseDelay = backoffSteps[Math.min(openNavRetryAttempt, backoffSteps.length - 1)];
    const jitter = Math.floor(Math.random() * 400);
    openNavRetryAttempt += 1;
    openNavTimerRetryId = setTimeout(() => {
      openNavTimerRetryId = null;
      if (!openNavIsFinalized && isOpenNavContextValid(ctx) && isOpenNavigationMode) {
        syncOpenNavServerState({ fromTimer, requireFinal });
      }
    }, baseDelay + jitter);
  }

  function showOpenNavReceiptFromFallback(ctx, fallbackReceipt) {
    if (!isOpenNavContextValid(ctx)) return;
    if (timerInterval) clearInterval(timerInterval);
    if (openNavTimerRetryId) { clearTimeout(openNavTimerRetryId); openNavTimerRetryId = null; }
    closeModal('modal-confirm-open-nav-submit');
    openNavIsSubmitting = false;
    openNavIsFinalized = true;
    openNavClosurePending = false;
    quizInterfaceLoadSeq++;
    syncOpenNavConfirmModalControls();
    showSummary({
      showFeedback: false,
      pendingEvaluationReload: fallbackReceipt.show_feedback_on_end === 1,
      participant: {
        ...(currentParticipant || {}),
        is_finished: 1,
        finished_at: fallbackReceipt.finished_at || null,
        show_feedback_on_end: fallbackReceipt.show_feedback_on_end
      }
    });
  }

  /**
   * Hiteles szerverállapot lekérése Open Navigation módban.
   * Egyszerre max 1 GET futhat, a Promise-azonosságot ellenőrzi, és minden await után munkamenetet validál!
   */
  async function syncOpenNavServerState({ fromTimer = false, requireFinal = false, forceSummaryRefresh = false, fallbackReceipt = null, expectedCtx = null } = {}) {
    const ctx = expectedCtx || captureOpenNavContext();
    if (!isOpenNavContextValid(ctx)) return { state: 'stale' };

    if (openNavIsFinalized && !fallbackReceipt && !forceSummaryRefresh) {
      const isReceiptVisible = summaryReceiptView && summaryReceiptView.style.display !== 'none';
      if (!isReceiptVisible) return { state: 'finished' };
    }

    // Ha pontfrissítés érkezik egy már futó státuszlekérés közben, összevont utólekérést jegyzünk be
    if (forceSummaryRefresh && openNavStatusCheckPromise) {
      openNavPendingScoreRefresh = true;
    }

    if (!openNavStatusCheckPromise) {
      const thisPromise = (async () => {
        try {
          const resObj = await fetchJsonWithTimeout('/api/student/session-data', {
            headers: { 'x-session-token': ctx.token }
          }, 10000);

          if (!isOpenNavContextValid(ctx)) return { state: 'stale' };

          if (isConfirmedTokenInvalidResponse(resObj)) {
            await handleInvalidStudentSession('A munkameneted érvénytelen lett vagy gépváltás történt. Kérlek, lépj be újra!');
            return { state: 'invalid_token', httpStatus: resObj.status };
          }
          if (!resObj.ok || !resObj.data) {
            return { state: resObj.errorKind ? 'network_error' : 'error', httpStatus: resObj.status };
          }

          const data = resObj.data;
          if (ctx.sessionId && data.participant && String(data.participant.session_id) !== ctx.sessionId) return { state: 'stale' };
          if (ctx.participantId && data.participant && String(data.participant.id) !== ctx.participantId) return { state: 'stale' };
          openNavRetryAttempt = 0;

          if (data && data.participant) {
            currentParticipant = data.participant;
          }

          if (data && data.participant && data.participant.is_finished === 1) {
            if (timerInterval) clearInterval(timerInterval);
            if (openNavTimerRetryId) { clearTimeout(openNavTimerRetryId); openNavTimerRetryId = null; }
            closeModal('modal-confirm-open-nav-submit');
            openNavIsSubmitting = false;
            openNavIsFinalized = true;
            openNavClosurePending = false;
            quizInterfaceLoadSeq++;
            syncOpenNavConfirmModalControls();
            showSummary(buildOpenNavSummaryPayload(data));
            return { state: 'finished' };
          }

          if (data && data.participant && data.participant.session_status === 'FINISHED' && data.participant.is_finished === 0) {
            openNavIsSubmitting = false;
            syncOpenNavConfirmModalControls();
            showCalmAlert(
              'A dolgozat lezárása a szerveren folyamatban van vagy eltérés történt. Kérlek, jelezd a tanárodnak és próbáld újra!',
              'Lezárási ellenőrzés szükséges',
              'warning',
              null,
              'open_nav_submit'
            );
            return { state: 'inconsistent_finished' };
          }

          openNavClosurePending = false;
          syncOpenNavConfirmModalControls();
          return { state: 'active' };
        } finally {
          if (openNavStatusCheckPromise === thisPromise) {
            openNavStatusCheckPromise = null;
          }
        }
      })();
      openNavStatusCheckPromise = thisPromise;
    }

    const outcome = await openNavStatusCheckPromise;
    if (outcome.state === 'invalid_token') return outcome;
    if (!isOpenNavContextValid(ctx)) return { state: 'stale' };

    // Ha közben újabb pontfrissítési esemény érkezett, futtatunk egy összevont frissítő lekérést
    if (openNavPendingScoreRefresh && isOpenNavContextValid(ctx)) {
      openNavPendingScoreRefresh = false;
      return syncOpenNavServerState({ forceSummaryRefresh: true, expectedCtx: ctx });
    }

    if (outcome.state === 'finished') {
      return outcome;
    }

    if (fallbackReceipt && fallbackReceipt.is_finished === 1 && (outcome.state === 'error' || outcome.state === 'network_error')) {
      showOpenNavReceiptFromFallback(ctx, fallbackReceipt);
      return { state: 'finished_receipt' };
    }

    if ((fromTimer || requireFinal) && !openNavIsFinalized && (outcome.state === 'active' || outcome.state === 'error' || outcome.state === 'network_error')) {
      scheduleOpenNavStatusRetry(ctx, { fromTimer, requireFinal });
    }

    return outcome;
  }

  async function submitOpenNavQuiz() {
    if (!isOpenNavigationMode || openNavIsSubmitting || openNavIsFinalized) return;
    const ctx = captureOpenNavContext();
    if (!isOpenNavContextValid(ctx)) return;

    openNavIsSubmitting = true;
    syncOpenNavConfirmModalControls();
    refreshOpenNavUi();

    const unlockAfterError = () => {
      if (!isOpenNavContextValid(ctx) || openNavIsFinalized) return;
      openNavIsSubmitting = false;
      syncOpenNavConfirmModalControls();
      closeModal('modal-confirm-open-nav-submit');
      refreshOpenNavUi();
    };

    // 1. Összes függő és hibás piszkozat mentésének bevárása (feloldatlan ütközést NEM ír felül!)
    const flushRes = await flushAllOpenNavDrafts();
    // Ha a flush közben lezárult a dolgozat (pl. tanári lezárás) vagy munkamenetváltás történt -> AZONNAL kilépünk hibaablak nélkül!
    if (!isOpenNavContextValid(ctx) || openNavIsFinalized) return;

    if (!flushRes.ok) {
      unlockAfterError();
      if (flushRes.closurePending || openNavClosurePending) {
        // A szerver lezárást jelzett, az állapotlekérés még folyamatban van -> NE nyissunk „Mentési hiba” ablakot!
        showCalmAlert(
          'A dolgozat lezárásának visszaigazolása folyamatban van. Kattints az OK gombra az azonnali újraellenőrzéshez, vagy várj néhány másodpercet!',
          'Lezárás ellenőrzése folyamatban',
          'info',
          () => { syncOpenNavServerState({ requireFinal: true, expectedCtx: ctx }); },
          'open_nav_submit'
        );
      } else if (flushRes.conflictCount > 0) {
        const firstConflictIdx = currentQuestions.findIndex(q => Boolean(getOpenNavEntry(q.id).conflict));
        if (firstConflictIdx >= 0) renderQuestion(firstConflictIdx);
        showCalmAlert(
          'Egy vagy több kérdésnél eltérő mentett válasz van a szerveren. Kérlek, előbb válaszd ki a piros figyelmeztető sávban, melyik válasz maradjon meg!',
          'Egyeztetés szükséges',
          'warning',
          null,
          'open_nav_submit'
        );
      } else {
        showCalmAlert(
          'Nem minden válasz mentése sikerült a hálózati vagy formai hiba miatt. Kérlek, ellenőrizd a piros ikonnal jelölt kérdéseket, majd próbáld újra a beadást!',
          'Mentési hiba',
          'error',
          null,
          'open_nav_submit'
        );
      }
      return;
    }

    // 2. Végleges beadás kérése a szerverhez (teljes választest-időkorláttal!)
    const resObj = await fetchJsonWithTimeout('/api/student/finish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': ctx.token
      },
      body: JSON.stringify({ session_token: ctx.token })
    }, 12000);

    // Munkamenet- és végállapot-ellenőrzés a teljes POST + JSON után!
    if (!isOpenNavContextValid(ctx) || openNavIsFinalized) return;

    if (isConfirmedTokenInvalidResponse(resObj)) {
      await handleInvalidStudentSession('A munkameneted érvénytelen lett vagy gépváltás történt. Kérlek, lépj be újra!');
      return;
    }

    const finishBody = (resObj.data && typeof resObj.data === 'object') ? resObj.data : {};

    if (resObj.ok && finishBody.success) {
      const receipt = finishBody.receipt || {
        is_finished: 1,
        finished_at: finishBody.participant ? finishBody.participant.finished_at : null,
        show_feedback_on_end: currentParticipant ? currentParticipant.show_feedback_on_end : 0
      };
      const syncOutcome = await syncOpenNavServerState({ fallbackReceipt: receipt, expectedCtx: ctx });
      if (!isOpenNavContextValid(ctx) || openNavIsFinalized) return;
      if (syncOutcome.state === 'finished' || syncOutcome.state === 'finished_receipt') return;
      showOpenNavReceiptFromFallback(ctx, receipt);
      return;
    }

    // Hiba vagy elveszett válasz esetén hiteles állapotlekérés a saját kontextussal
    const syncOutcome = await syncOpenNavServerState({ expectedCtx: ctx });
    if (!isOpenNavContextValid(ctx) || openNavIsFinalized) return;
    if (syncOutcome.state === 'finished') return;

    unlockAfterError();
    if (resObj.errorKind) {
      showCalmAlert(
        'A beadás visszaigazolása hálózati hiba miatt függőben maradt. A válaszaid megmaradtak – kérlek, kattints újra a „Dolgozat beadása” gombra!',
        'Visszaigazolás függőben',
        'warning',
        null,
        'open_nav_submit'
      );
    } else {
      showCalmAlert(
        (finishBody && finishBody.error) || 'A dolgozat beadása közben szerverhiba történt. Kérlek, próbáld újra!',
        'Beadási hiba',
        'error',
        null,
        'open_nav_submit'
      );
    }
  }

  /**
   * Kvíz felület elindítása és kérdések betöltése (szigorú munkamenet-kontextus és sorszámvédelemmel)
   */
  async function startQuizInterface(cachedData = null, expectedCtx = null) {
    const ctx = expectedCtx || captureOpenNavContext();
    const myLoadSeq = ++quizInterfaceLoadSeq;
    if (!isOpenNavContextValid(ctx)) return;

    let data = cachedData;
    if (!data) {
      const resObj = await fetchJsonWithTimeout('/api/student/session-data', {
        headers: { 'x-session-token': ctx.token }
      }, 10000);

      // Az állapot módosítása, token-törlés vagy hibaablak ELŐTT ellenőrizzük, hogy még ugyanaz a munkamenet aktív-e!
      if (!isOpenNavContextValid(ctx) || myLoadSeq !== quizInterfaceLoadSeq) return;

      if (isConfirmedTokenInvalidResponse(resObj)) {
        await handleInvalidStudentSession('A munkameneted érvénytelen lett. Kérlek, lépj be újra!');
        return;
      }
      if (!resObj.ok || !resObj.data || !resObj.data.quiz) {
        showCalmAlert('Nem sikerült betölteni a dolgozat kérdéseit a szerverről. Kérlek, próbáld újra!', 'Betöltési hiba', 'warning');
        return;
      }
      data = resObj.data;
    }

    // Végső kontextus- és válasz-azonosság ellenőrzés (akár friss lekérés, akár cachedData esetén)
    if (!isOpenNavContextValid(ctx) || myLoadSeq !== quizInterfaceLoadSeq) return;
    if (!data || !data.quiz) return;
    if (ctx.sessionId && data.participant && String(data.participant.session_id) !== ctx.sessionId) return;
    if (ctx.participantId && data.participant && String(data.participant.id) !== ctx.participantId) return;

    // Ha a betöltés alatt közben a szerver lezárta a résztvevőt vagy dolgozatot -> nyugtára / összegzőre váltunk
    if (data.participant && (data.participant.is_finished === 1 || data.participant.session_status === 'FINISHED')) {
      currentParticipant = data.participant;
      const isTpFinished = data.participant.session_mode === 'TEACHER_PACED'
        && (data.participant.session_status === 'FINISHED' || Boolean(data.session && data.session.review_phase));
      openNavIsFinalized = data.participant.session_mode === 'OPEN_NAVIGATION' && data.participant.is_finished === 1;
      if (openNavIsFinalized) {
        openNavClosurePending = false;
        quizInterfaceLoadSeq++;
        syncOpenNavConfirmModalControls();
      }
      showSummary({
        totalPoints: data.results ? data.results.total_points : null,
        maxPoints: (data.results && data.results.max_points) || (data.quiz && data.quiz.total_points),
        percentage: data.results ? data.results.percentage : null,
        grade: data.results ? data.results.grade : null,
        gradeText: data.results ? data.results.grade_text : '',
        showFeedback: isTpFinished ? true : Boolean(data.participant.show_feedback_on_end === 1 && data.results !== null),
        participant: data.participant,
        session: data.session,
        quiz: data.quiz,
        answers: data.answers || []
      });
      return;
    }

    // Igazolt végállapot vagy folyó lezárásellenőrzés mellett aktív válasz soha nem nyithatja vissza a kitöltést!
    if (openNavIsFinalized || openNavClosurePending) return;

    const prevParticipantId = currentParticipant ? String(currentParticipant.id) : null;
    const nextParticipantId = (data && data.participant) ? String(data.participant.id) : null;
    if (prevParticipantId !== nextParticipantId) {
      answeredQuestionIds.clear();
      studentSubmittedAnswers.clear();
      quizStartTime = null;
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      if (timerBadge) {
        timerBadge.style.display = 'none';
        timerBadge.classList.remove('timer-urgent');
      }
    }

    if (data && data.participant) {
      currentParticipant = data.participant;
    }
    currentQuiz = data.quiz;
    currentQuestions = data.quiz.questions;
    if (!quizStartTime) quizStartTime = Date.now();

    isTeacherPacedMode = (data.session && data.session.mode === 'TEACHER_PACED')
      || (data.participant && data.participant.session_mode === 'TEACHER_PACED')
      || (activeSession && activeSession.mode === 'TEACHER_PACED');
    isOpenNavigationMode = (data.session && data.session.mode === 'OPEN_NAVIGATION')
      || (data.participant && data.participant.session_mode === 'OPEN_NAVIGATION')
      || (activeSession && activeSession.mode === 'OPEN_NAVIGATION');
    teacherPacedShowFeedback = data.participant ? (data.participant.show_feedback_on_end !== 0) : true;
    lastServerResults = data.results || null;

    if (quizMetricsWrap) {
      quizMetricsWrap.style.display = isOpenNavigationMode ? 'none' : 'flex';
    }
    if (btnOpenNavSubmit) {
      btnOpenNavSubmit.style.display = isOpenNavigationMode ? 'inline-flex' : 'none';
    }
    if (openNavMapWrap) {
      openNavMapWrap.style.display = isOpenNavigationMode ? 'block' : 'none';
    }
    if (openNavFooterBar) {
      openNavFooterBar.style.display = isOpenNavigationMode ? 'flex' : 'none';
    }

    if (isOpenNavigationMode) {
      openNavSessionEpoch++;
      openNavIsFinalized = false;
      openNavClosurePending = false;
      openNavPendingScoreRefresh = false;
      openNavRetryAttempt = 0;
      if (openNavTimerRetryId) { clearTimeout(openNavTimerRetryId); openNavTimerRetryId = null; }
      openNavDrafts.clear();
      openNavQueues.clear();
      for (const timerId of openNavShortTimers.values()) clearTimeout(timerId);
      openNavShortTimers.clear();
      openNavIsSubmitting = false;
      syncOpenNavConfirmModalControls();
      if (Array.isArray(data.drafts)) {
        data.drafts.forEach((d) => {
          const val = String(d.draft_answer ?? '');
          openNavDrafts.set(Number(d.question_id), {
            localValue: val,
            serverValue: val,
            version: Number(d.version) || 1,
            localSeq: 0,
            ackedSeq: 0,
            inFlight: false,
            conflict: null,
            status: val !== '' ? 'saved' : 'empty',
            hasUnsaved: false
          });
        });
      }
    }

    if (isTeacherPacedMode) {
      teacherPacedQuestionIndex = Number(
        data.currentQuestionIndex !== undefined
          ? data.currentQuestionIndex
          : (data.session && data.session.current_question_index !== undefined ? data.session.current_question_index : 0)
      ) || 0;
      teacherPacedTotalQuestions = Number(
        data.totalQuestions !== undefined
          ? data.totalQuestions
          : (data.session && data.session.total_questions !== undefined ? data.session.total_questions : currentQuestions.length)
      ) || currentQuestions.length;
      teacherPacedCurrentAnswer = data.currentAnswer || null;
    } else {
      teacherPacedCurrentAnswer = null;
    }

    if (btnQuizExit) {
      btnQuizExit.style.display = isTeacherPacedMode ? 'none' : 'inline-flex';
    }

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
      quizHeaderUsername.textContent = data.participant.student_name;
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

    // Megkeressük az első megválaszolatlan kérdést (Teacher Paced módban mindig az aktuális 0. elem)
    if (isTeacherPacedMode) {
      renderQuestion(0);
      return;
    }

    if (isOpenNavigationMode) {
      let firstUnanswered = 0;
      for (let i = 0; i < currentQuestions.length; i++) {
        const entry = openNavDrafts.get(Number(currentQuestions[i].id));
        if (!entry || String(entry.serverValue || '').trim() === '') {
          firstUnanswered = i;
          break;
        }
      }
      renderQuestion(firstUnanswered);
      return;
    }

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
    questionViewSeq++;
    currentOperationId = null;
    currentOperationQuestionId = null;

    if (index >= currentQuestions.length) {
      if (isTeacherPacedMode) return;
      finishQuiz();
      return;
    }

    currentQuestionIndex = index;
    const q = currentQuestions[index];
    questionStartTime = Date.now();

    const displayIndex = isTeacherPacedMode ? teacherPacedQuestionIndex : index;
    const displayTotal = isTeacherPacedMode ? (teacherPacedTotalQuestions || currentQuestions.length) : currentQuestions.length;

    // 1. Kérdésszám és sorszámok
    questionProgress.textContent = `${displayIndex + 1} / ${displayTotal}. kérdés`;
    if (quizQnumText) quizQnumText.textContent = String(displayIndex + 1);

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

    // 2. Haladási sáv és 3 részes szöveges állapot
    if (isOpenNavigationMode) {
      updateOpenNavProgressBar();
    } else if (isTeacherPacedMode) {
      const tpPct = displayTotal > 0 ? Math.round(((displayIndex + 1) / displayTotal) * 100) : 0;
      if (quizProgressBarFill) quizProgressBarFill.style.width = `${tpPct}%`;
      if (progressTextDone) progressTextDone.textContent = 'Tanári léptetés';
      if (progressTextCurrent) progressTextCurrent.textContent = (displayIndex + 1 === displayTotal) ? `${displayIndex + 1}. Utolsó kérdés!` : `${displayIndex + 1}. kérdés aktív`;
      const tpRemaining = Math.max(0, displayTotal - (displayIndex + 1));
      if (progressTextRemaining) progressTextRemaining.textContent = tpRemaining === 0 ? 'Utolsó feladat' : `Még ${tpRemaining} kérdés következik`;
    } else {
      const answeredCount = answeredQuestionIds.size;
      const progressPct = Math.round((answeredCount / currentQuestions.length) * 100);
      if (quizProgressBarFill) quizProgressBarFill.style.width = `${progressPct}%`;

      const remainingCount = currentQuestions.length - answeredCount;
      if (progressTextDone) progressTextDone.textContent = answeredCount === 0 ? 'Kezdés' : `${answeredCount}. befejezve`;
      if (progressTextCurrent) progressTextCurrent.textContent = (index + 1 === currentQuestions.length) ? `${index + 1}. Utolsó kérdés!` : `${index + 1}. folyamatban`;
      if (progressTextRemaining) progressTextRemaining.textContent = remainingCount === 0 ? 'Már nincs több hátra' : `${remainingCount} kérdés van hátra`;
    }

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
    if (teacherPacedWaitPill) teacherPacedWaitPill.style.display = 'none';
    if (teacherPacedWaitBanner) teacherPacedWaitBanner.style.display = 'none';
    btnSubmitAnswer.disabled = true;
    btnSubmitAnswer.style.display = isOpenNavigationMode ? 'none' : 'inline-flex';
    actionButtonsBox.style.display = isOpenNavigationMode ? 'none' : 'flex';
    if (openNavFooterBar) {
      openNavFooterBar.style.display = isOpenNavigationMode ? 'flex' : 'none';
    }

    optionsContainer.innerHTML = '';
    optionsContainer.removeAttribute('role');
    shortAnswerContainer.style.display = 'none';
    shortAnswerInput.value = '';
    shortAnswerInput.disabled = false;
    shortAnswerInput.classList.remove('input-correct', 'input-wrong');
    if (shortAnswerEvalIcon) {
      shortAnswerEvalIcon.classList.remove('eval-correct', 'eval-wrong');
    }

    // Segédfüggvény rádió-csempék billentyűzetes és egér alapú kiválasztásához
    const bindRadioTile = (tile, selector) => {
      tile.setAttribute('tabindex', '0');
      tile.setAttribute('role', 'radio');
      tile.setAttribute('aria-checked', 'false');

      const selectTile = () => {
        if (tile.style.pointerEvents === 'none' || openNavIsSubmitting) return;
        document.querySelectorAll(selector).forEach(b => {
          b.classList.remove('selected');
          b.setAttribute('aria-checked', 'false');
        });
        tile.classList.add('selected');
        tile.setAttribute('aria-checked', 'true');
        if (isOpenNavigationMode) {
          queueOpenNavDraftSave(q.id, tile.dataset.value);
        } else {
          btnSubmitAnswer.disabled = false;
        }
      };

      tile.addEventListener('click', selectTile);
      tile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectTile();
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const allTiles = Array.from(document.querySelectorAll(selector));
          const currIdx = allTiles.indexOf(tile);
          if (currIdx === -1 || allTiles.length === 0) return;
          const step = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
          const nextTile = allTiles[(currIdx + step + allTiles.length) % allTiles.length];
          if (nextTile) {
            nextTile.focus();
            nextTile.click();
          }
        }
      });
    };

    // 5. Kérdéstípus szerinti megjelenítés
    if (q.question_type === 'ABCD') {
      optionsContainer.className = 'quiz-options-group';
      optionsContainer.setAttribute('role', 'radiogroup');
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

        bindRadioTile(tile, '.quiz-option-tile');
        optionsContainer.appendChild(tile);
      });

    } else if (q.question_type === 'TF') {
      optionsContainer.className = 'quiz-tf-grid';
      optionsContainer.setAttribute('role', 'radiogroup');
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
          <span class="quiz-tf-eval-badge" aria-hidden="true">
            <span class="material-symbols-outlined">check</span>
          </span>
        `;

        bindRadioTile(tile, '.quiz-tf-tile');
        optionsContainer.appendChild(tile);
      });

    } else if (q.question_type === 'SHORT') {
      optionsContainer.className = 'quiz-options-group';
      shortAnswerContainer.style.display = 'block';
      shortAnswerInput.disabled = openNavIsSubmitting;

      if (isOpenNavigationMode) {
        const qId = Number(q.id);
        shortAnswerInput.oninput = () => {
          if (openNavIsSubmitting || openNavIsFinalized) return;
          // Már a beírás pillanatában rögzítjük a helyi szerkesztést és növeljük localSeq-et!
          recordOpenNavLocalEdit(qId, shortAnswerInput.value);
          if (openNavShortTimers.has(qId)) {
            clearTimeout(openNavShortTimers.get(qId));
          }
          // A 400 ms-os késleltetés kizárólag a küldést ütemezi a kérdés saját entry.localValue-jából
          const tId = setTimeout(() => {
            openNavShortTimers.delete(qId);
            dispatchOpenNavDraftSave(qId);
          }, 400);
          openNavShortTimers.set(qId, tId);
        };
        shortAnswerInput.onblur = () => {
          if (openNavIsSubmitting || openNavIsFinalized) return;
          flushShortDraftForQuestion(qId);
        };
        shortAnswerInput.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            flushShortDraftForQuestion(qId);
          }
        };
      } else {
        shortAnswerInput.onblur = null;
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

    // 5b. Open Navigation: korábban elmentett vagy helyi piszkozat visszatöltése + térkép és ütközéssáv frissítése
    if (isOpenNavigationMode) {
      const entry = getOpenNavEntry(q.id);
      const restoredVal = String(entry.localValue ?? '');
      if (restoredVal !== '') {
        if (q.question_type === 'ABCD') {
          const tiles = Array.from(document.querySelectorAll('.quiz-option-tile'));
          let matchedTile = tiles.find(t => t.dataset.value === restoredVal) || null;
          if (!matchedTile) {
            const trimmedMatches = tiles.filter(t => String(t.dataset.value || '').trim() === restoredVal.trim());
            if (trimmedMatches.length === 1) matchedTile = trimmedMatches[0];
          }
          if (matchedTile) {
            matchedTile.classList.add('selected');
            matchedTile.setAttribute('aria-checked', 'true');
          }
        } else if (q.question_type === 'TF') {
          document.querySelectorAll('.quiz-tf-tile').forEach((tile) => {
            if (tile.dataset.value === restoredVal) {
              tile.classList.add('selected');
              tile.setAttribute('aria-checked', 'true');
            }
          });
        } else if (q.question_type === 'SHORT') {
          shortAnswerInput.value = restoredVal;
        }
      }
      renderOpenNavMap();
      updateOpenNavFooter();
      renderOpenNavConflictBanner();
    } else if (openNavConflictBanner) {
      openNavConflictBanner.style.display = 'none';
    }

    // 6. Teacher Paced: ha erre a kérdésre a diák már korábban válaszolt (oldalfrissítés / tanári visszalépés)
    if (isTeacherPacedMode && teacherPacedCurrentAnswer && Number(teacherPacedCurrentAnswer.question_id) === Number(q.id)) {
      const savedVal = String(teacherPacedCurrentAnswer.submitted_answer || '');
      if (q.question_type === 'ABCD') {
        document.querySelectorAll('.quiz-option-tile').forEach(tile => {
          if (tile.dataset.value === savedVal) {
            tile.classList.add('selected');
            tile.setAttribute('aria-checked', 'true');
          }
          tile.style.pointerEvents = 'none';
        });
      } else if (q.question_type === 'TF') {
        document.querySelectorAll('.quiz-tf-tile').forEach(tile => {
          if (tile.dataset.value === savedVal) {
            tile.classList.add('selected');
            tile.setAttribute('aria-checked', 'true');
          }
          tile.style.pointerEvents = 'none';
        });
      } else if (q.question_type === 'SHORT') {
        shortAnswerInput.value = savedVal;
        shortAnswerInput.disabled = true;
      }

      actionButtonsBox.style.display = 'none';
      if (teacherPacedShowFeedback && teacherPacedCurrentAnswer.is_correct !== undefined && teacherPacedCurrentAnswer.is_correct !== null) {
        showFeedback({
          is_correct: teacherPacedCurrentAnswer.is_correct,
          correctAnswer: teacherPacedCurrentAnswer.correct_answer !== undefined ? teacherPacedCurrentAnswer.correct_answer : q.correct_answer,
          explanation: teacherPacedCurrentAnswer.explanation !== undefined ? teacherPacedCurrentAnswer.explanation : q.explanation,
          isFinished: false
        });
      } else {
        showTeacherPacedWaitBanner();
      }
    }
  }

  // Válasz beküldése
  btnSubmitAnswer.addEventListener('click', submitAnswer);

  async function submitAnswer() {
    const q = currentQuestions[currentQuestionIndex];
    if (!q) return;
    const submittedSessionId = activeSession ? activeSession.id : null;
    const submittedParticipantId = currentParticipant ? currentParticipant.id : null;
    const submittedQuestionId = q.id;
    const submittedViewSeq = questionViewSeq;
    const isStillCurrentView = () => (
      submittedViewSeq === questionViewSeq
      && activeSession
      && String(activeSession.id) === String(submittedSessionId)
      && (!submittedParticipantId || (currentParticipant && String(currentParticipant.id) === String(submittedParticipantId)))
      && currentQuestions[currentQuestionIndex]
      && Number(currentQuestions[currentQuestionIndex].id) === Number(submittedQuestionId)
    );
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

    // Diagnosztikai azonosítók képzése védőburokban (hibája nem állíthatja meg a beküldést)
    let thisRequestId = null;
    let thisOperationId = null;
    try {
      if (!currentOperationId || currentOperationQuestionId !== q.id) {
        currentOperationId = generateHexId();
        currentOperationQuestionId = q.id;
      }
      thisRequestId = generateHexId();
      thisOperationId = currentOperationId;
    } catch {}

    const timeSpent = Math.round((Date.now() - questionStartTime) / 1000);
    const fetchStartTime = Date.now();
    const shortReqLabel = thisRequestId ? ` (Kérés: #${thisRequestId.slice(0, 8)})` : '';

    // 1. Hálózati kérés és válasz-validálás elkülönítve a felületi feldolgozástól
    let res;
    let result;
    try {
      const headers = {
        'Content-Type': 'application/json',
        'x-session-token': sessionToken
      };
      if (thisRequestId) headers['x-request-id'] = thisRequestId;
      if (thisOperationId) headers['x-operation-id'] = thisOperationId;

      res = await fetch('/api/student/submit-answer', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_token: sessionToken,
          question_id: q.id,
          submitted_answer: submittedValue,
          time_spent_sec: timeSpent
        })
      });
    } catch (err) {
      const durationMs = Date.now() - fetchStartTime;
      console.error('Hiba a válasz beküldésekor:', err);
      pushDiagnosticEvent({
        event: 'answer.no_ack',
        requestId: thisRequestId,
        operationId: thisOperationId,
        outcome: 'no_ack',
        reasonCode: 'NETWORK_ERROR',
        durationMs
      });
      if (!isStillCurrentView()) return;
      showCalmAlert(
        `Hálózati megszakadás a válasz beküldésekor!${shortReqLabel}\nA válasz mentésének eredménye bizonytalan a kapcsolat megszakadása miatt. Kérlek, próbáld újra!`,
        'Hálózati hiba',
        'error'
      );
      btnSubmitAnswer.disabled = false;
      return;
    }

    const durationMs = Date.now() - fetchStartTime;
    try {
      result = await res.json();
    } catch (jsonErr) {
      pushDiagnosticEvent({
        event: 'answer.response_error',
        requestId: thisRequestId,
        operationId: thisOperationId,
        outcome: 'error',
        reasonCode: 'INVALID_JSON',
        httpStatus: res.status,
        durationMs
      });
      if (!isStillCurrentView()) return;
      showCalmAlert(
        `A kiszolgáló válasza feldolgozhatatlan volt!${shortReqLabel}\nA válasz mentésének eredménye bizonytalan. Kérlek, próbáld újra!`,
        'Hiba a mentéskor',
        'error'
      );
      btnSubmitAnswer.disabled = false;
      return;
    }

    if (!res.ok) {
      pushDiagnosticEvent({
        event: 'answer.response_error',
        requestId: thisRequestId,
        operationId: thisOperationId,
        outcome: 'error',
        reasonCode: (result && result.code) ? result.code : 'HTTP_ERROR',
        httpStatus: res.status,
        durationMs
      });
      if (!isStillCurrentView()) return;
      if (result && result.code === 'QUESTION_NOT_ACTIVE') {
        showToast('A tanár közben másik kérdésre lépett.', 'warning');
        await syncTeacherPacedState();
        return;
      }
      const errMsg = (result && typeof result.error === 'string') ? result.error : 'Hiba a válasz mentésekor!';
      showCalmAlert(`${errMsg}${shortReqLabel}`, 'Hiba a mentéskor', 'error');
      btnSubmitAnswer.disabled = false;
      return;
    }

    if (!isValidSubmitAnswerResponse(result)) {
      pushDiagnosticEvent({
        event: 'answer.response_error',
        requestId: thisRequestId,
        operationId: thisOperationId,
        outcome: 'error',
        reasonCode: 'INVALID_RESPONSE_SCHEMA',
        httpStatus: res.status,
        durationMs
      });
      if (!isStillCurrentView()) return;
      showCalmAlert(
        `A kiszolgáló válasza nem felelt meg az elvárt formátumnak!${shortReqLabel}\nA válasz mentésének eredménye bizonytalan. Kérlek, próbáld újra!`,
        'Hiba a mentéskor',
        'error'
      );
      btnSubmitAnswer.disabled = false;
      return;
    }

    // 2. Sikeresen visszaigazolt válasz rögzítése (már elkülönítve a UI rendereléstől!)
    pushDiagnosticEvent({
      event: 'answer.acknowledged',
      requestId: thisRequestId,
      operationId: thisOperationId,
      httpStatus: res.status,
      outcome: 'ok',
      durationMs
    });
    setTimeout(() => flushDiagnosticsQueue(), 100);

    // A szerver által ténylegesen mentett válasz használata (idempotens ismétlésnél az eredeti mentett érték!)
    const hasServerSubmittedAnswer = typeof result.submittedAnswer === 'string';
    const persistedValue = hasServerSubmittedAnswer ? result.submittedAnswer : submittedValue;
    const isSameSession = activeSession && String(activeSession.id) === String(submittedSessionId);

    if (isSameSession) {
      answeredQuestionIds.add(q.id);
      const savedAnswerObj = {
        question_id: q.id,
        submitted_answer: persistedValue,
        is_correct: result.is_correct,
        points_earned: Number(result.points_earned) || 0,
        eval_status: result.eval_status || (result.is_correct === 1 ? 'CORRECT' : 'WRONG'),
        correct_answer: result.correctAnswer,
        explanation: result.explanation
      };
      studentSubmittedAnswers.set(q.id, savedAnswerObj);
      if (isTeacherPacedMode && result.results && !result.hideFeedback) {
        lastServerResults = result.results;
      }
      if (!result.alreadySubmitted && result.is_correct === 1) {
        earnedPoints += Number(result.points_earned) || 1;
      }
    }

    // 3. Késői HTTP-válasz hatókör-védelme: ha közben a tanár továbbléptetett vagy új nézet aktív, ne módosítsuk az új nézet DOM-ját és műveletazonosítóját
    if (!isStillCurrentView()) {
      return;
    }

    currentOperationId = null;
    currentOperationQuestionId = null;

    // Hiányos ismétlési visszaigazolásnál Teacher Paced módban visszaolvassuk a szerver állapotát
    if (isTeacherPacedMode && result.alreadySubmitted && !hasServerSubmittedAnswer) {
      await syncTeacherPacedState();
      return;
    }

    if (isTeacherPacedMode) {
      const savedEntry = studentSubmittedAnswers.get(q.id);
      teacherPacedCurrentAnswer = result.hideFeedback
        ? { question_id: q.id, submitted_answer: persistedValue }
        : savedEntry;
    }

    // Ha a szerver által mentett válasz eltér a helyben kijelölttől (idempotens ismétlés), szinkronizáljuk a kijelölést / szövegmezőt
    if (q.question_type === 'ABCD') {
      document.querySelectorAll('.quiz-option-tile').forEach(tile => {
        const isPersisted = tile.dataset.value === persistedValue;
        tile.classList.toggle('selected', isPersisted);
        tile.setAttribute('aria-checked', isPersisted ? 'true' : 'false');
        tile.style.pointerEvents = 'none';
      });
    } else if (q.question_type === 'TF') {
      document.querySelectorAll('.quiz-tf-tile').forEach(tile => {
        const isPersisted = tile.dataset.value === persistedValue;
        tile.classList.toggle('selected', isPersisted);
        tile.setAttribute('aria-checked', isPersisted ? 'true' : 'false');
        tile.style.pointerEvents = 'none';
      });
    } else if (q.question_type === 'SHORT') {
      shortAnswerInput.value = persistedValue;
      shortAnswerInput.disabled = true;
    }

    updateLiveMetrics();
    actionButtonsBox.style.display = 'none';

    if (isTeacherPacedMode) {
      if (result.hideFeedback) {
        showTeacherPacedWaitBanner();
      } else {
        showFeedback(result);
      }
      return;
    }

    if (result.hideFeedback) {
      const isLast = (currentQuestionIndex + 1 >= currentQuestions.length) || result.isFinished;
      if (isLast) {
        finishQuiz();
      } else {
        renderQuestion(currentQuestionIndex + 1);
      }
      return;
    }

    showFeedback(result);
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
          const tfIcon = tile.querySelector('.quiz-tf-eval-badge .material-symbols-outlined');
          if (tfIcon) tfIcon.textContent = 'check';
        } else if (isSelected && !isCorrect) {
          tile.classList.add('tile-wrong');
          const tfIcon = tile.querySelector('.quiz-tf-eval-badge .material-symbols-outlined');
          if (tfIcon) tfIcon.textContent = 'close';
        }
      });

    } else if (q && q.question_type === 'SHORT') {
      if (isCorrect) {
        shortAnswerInput.classList.add('input-correct');
        if (shortAnswerEvalIcon) {
          shortAnswerEvalIcon.classList.remove('eval-wrong');
          shortAnswerEvalIcon.classList.add('eval-correct');
          const sIcon = shortAnswerEvalIcon.querySelector('.material-symbols-outlined');
          if (sIcon) sIcon.textContent = 'check';
        }
      } else {
        shortAnswerInput.classList.add('input-wrong');
        if (shortAnswerEvalIcon) {
          shortAnswerEvalIcon.classList.remove('eval-correct');
          shortAnswerEvalIcon.classList.add('eval-wrong');
          const sIcon = shortAnswerEvalIcon.querySelector('.material-symbols-outlined');
          if (sIcon) sIcon.textContent = 'close';
        }
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

    // Teacher Paced módban (bekapcsolt visszajelzés mellett) a magyarázat megjeleníthető; más módokban elrejtve marad
    if (isTeacherPacedMode && result.explanation && String(result.explanation).trim()) {
      feedbackBody.innerHTML = formatCode(String(result.explanation).trim()).replace(/\n/g, '<br>');
      feedbackBody.style.display = 'block';
    } else {
      feedbackBody.innerHTML = '';
      feedbackBody.style.display = 'none';
    }

    if (isTeacherPacedMode) {
      btnNextQuestion.style.display = 'none';
      showTeacherPacedWaitPill();
      return;
    }

    if (teacherPacedWaitPill) teacherPacedWaitPill.style.display = 'none';
    btnNextQuestion.style.display = 'inline-flex';
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

    if (!isTeacherPacedMode) {
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
    }

    let summaryData = null;
    try {
      const res = await fetch('/api/student/session-data', {
        headers: { 'x-session-token': sessionToken }
      });
      if (res.ok) {
        const data = await res.json();
        const isTpFinished = data.participant && data.participant.session_mode === 'TEACHER_PACED' && data.participant.session_status === 'FINISHED';
        summaryData = {
          totalPoints: data.results ? data.results.total_points : 0,
          maxPoints: (data.results && data.results.max_points) || (currentQuiz ? currentQuiz.total_points : 0),
          percentage: data.results ? data.results.percentage : 0,
          grade: data.results ? data.results.grade : null,
          gradeText: data.results ? data.results.grade_text : '',
          showFeedback: isTpFinished ? true : (data.participant.show_feedback_on_end === 1),
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
    questionViewSeq++;
    openNavClosurePending = false;
    openNavIsSubmitting = false;
    syncOpenNavConfirmModalControls();
    // A beadási művelethez tartozó elavult figyelmeztetés csendes bezárása (régi callback futtatása nélkül!)
    dismissCalmAlertByOwner('open_nav_submit');
    closeModal('modal-confirm-open-nav-submit');
    if (data && data.participant) {
      currentParticipant = data.participant;
    }
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

    const studentName = (data.participant && data.participant.student_name) || (selectedStudent && selectedStudent.student_name) || 'Diák';

    // Külön beadási nyugta kikapcsolt visszajelzés esetén (pont, jegy, helyesség és megoldás nélkül!)
    if (data.showFeedback === false) {
      lastServerResults = null;
      earnedPoints = 0;
      studentSubmittedAnswers.clear();
      if (summaryQuestionsList) summaryQuestionsList.innerHTML = '';
      if (finalScore) finalScore.textContent = '';
      if (finalGrade) finalGrade.textContent = '';
      if (summaryGradeNum) summaryGradeNum.textContent = '';
      if (summaryPercentVal) summaryPercentVal.textContent = '';
      if (summaryColLeft) summaryColLeft.style.display = 'none';
      if (summaryColRight) summaryColRight.style.display = 'none';
      if (summaryReceiptView) {
        summaryReceiptView.style.display = 'block';
        if (summaryReceiptTitle) {
          summaryReceiptTitle.textContent = `Dolgozat sikeresen beadva, ${studentName}!`;
          summaryReceiptTitle.setAttribute('tabindex', '-1');
          try { summaryReceiptTitle.focus(); } catch {}
        }
        if (summaryReceiptSubtitle) {
          summaryReceiptSubtitle.textContent = data.pendingEvaluationReload
            ? 'A válaszaidat a rendszer véglegesen rögzítette. Az értékelőlap betöltése hálózati hiba miatt megszakadt – lent bármikor újratöltheted.'
            : 'A válaszaidat a rendszer véglegesen rögzítette. Az eredményt a tanárod ismerteti.';
        }
        if (summaryReceiptTime) {
          const finishedAtRaw = data.participant && data.participant.finished_at;
          if (finishedAtRaw) {
            const rawStr = String(finishedAtRaw).trim();
            const utcStr = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(rawStr)
              ? rawStr.replace(' ', 'T') + 'Z'
              : rawStr;
            const dt = new Date(utcStr);
            summaryReceiptTime.textContent = Number.isNaN(dt.getTime())
              ? 'Állapot: Véglegesen rögzítve'
              : `Beadás ideje: ${dt.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
          } else {
            summaryReceiptTime.textContent = 'Állapot: Véglegesen rögzítve';
          }
        }
        if (btnReloadSummaryFromReceipt) {
          btnReloadSummaryFromReceipt.style.display = data.pendingEvaluationReload ? 'inline-flex' : 'none';
          btnReloadSummaryFromReceipt.onclick = async () => {
            btnReloadSummaryFromReceipt.disabled = true;
            await syncOpenNavServerState();
            btnReloadSummaryFromReceipt.disabled = false;
          };
        }
      }
      if (btnRestartReceipt) {
        btnRestartReceipt.onclick = () => {
          currentParticipant = null;
          questionViewSeq++;
          openNavSessionEpoch++;
          sessionStorage.removeItem('ropdolgozat_token');
          window.location.reload();
        };
      }
      return;
    }

    // Normál értékelőlap mód: nyugta elrejtése, értékelő oszlopok megjelenítése
    if (summaryReceiptView) summaryReceiptView.style.display = 'none';
    if (summaryColLeft) summaryColLeft.style.display = '';
    if (summaryColRight) summaryColRight.style.display = '';

    // 1. Pontszám, százalék és KRÉTA érdemjegy kiszámítása biztonságos sorrendben
    const totalPoints = (data.totalPoints !== undefined && data.totalPoints !== null) ? Number(data.totalPoints) : earnedPoints;
    const maxPoints = (data.maxPoints !== undefined && data.maxPoints !== null && Number(data.maxPoints) > 0)
      ? Number(data.maxPoints)
      : ((currentQuiz && currentQuiz.total_points > 0) ? currentQuiz.total_points : 1);
    const percentage = Math.min(
      100,
      Math.max(
        0,
        (data.percentage !== undefined && data.percentage !== null)
          ? Math.round(Number(data.percentage))
          : Math.round((totalPoints / maxPoints) * 100)
      )
    );
    const grade = (data.grade !== undefined && data.grade !== null)
      ? Number(data.grade)
      : calculateKRÉTAGrade(percentage, sessionThresholds);

    // Szöveges értékelések, jelvények és megszólítások érdemjegyenként (3-3 pedagógiai változat)
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

    // 2. Pontszám és SVG kördiagram megjelenítése
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

    // 4. Kitöltési idő és tempójelzés (elsősorban a hiteles szerveroldali joined_at -> finished_at alapján)
    if (summaryTimeSpent) {
      let spentSec = 0;
      const hasServerJoined = Boolean(data.participant && data.participant.joined_at);
      if (hasServerJoined) {
        const startMs = new Date(data.participant.joined_at).getTime();
        const endMs = data.participant.finished_at ? new Date(data.participant.finished_at).getTime() : Date.now();
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
          spentSec = Math.max(1, Math.round((endMs - startMs) / 1000));
        }
      } else if (quizStartTime) {
        spentSec = Math.max(1, Math.round((Date.now() - quizStartTime) / 1000));
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

      // Válaszok összeállítása: ha a szerver teljes válaszlistát adott, kizárólag abból építünk (kihagyott kérdés nem örököl régi gyorsítótárat!)
      const answersMap = new Map();
      if (Array.isArray(data.answers)) {
        data.answers.forEach(a => answersMap.set(a.question_id, a));
      } else {
        studentSubmittedAnswers.forEach((val, key) => {
          answersMap.set(key, val);
        });
      }

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
              <span class="calm-summary-q-ans">Válaszod: <strong>${formatCode(submittedText)}</strong></span>
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
        currentParticipant = null;
        questionViewSeq++;
        sessionStorage.removeItem('ropdolgozat_token');
        window.location.reload();
      };
    }
  }

  /**
   * Szerveroldali határidő időzítője
   */
  function setupTimer(deadlineIso) {
    if (timerInterval) clearInterval(timerInterval);
    timerBadge.style.display = 'flex';
    const deadlineMs = new Date(deadlineIso).getTime();

    function update() {
      const now = Date.now();
      const remainingMs = deadlineMs - now;
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      timerText.textContent = formatTime(remainingSec);

      if (remainingSec <= 60) {
        timerBadge.classList.add('timer-urgent');
      }

      if (remainingMs <= 0) {
        clearInterval(timerInterval);
        if (isOpenNavigationMode) {
          syncOpenNavServerState({ fromTimer: true });
        } else {
          finishQuiz();
          showCalmAlert('Az időkorlát lejárt! A dolgozat automatikusan lezárásra kerül.', 'Időkorlát lejárt', 'warning');
        }
      }
    }

    update();
    timerInterval = setInterval(update, 1000);
  }

  /**
   * Fókuszvesztés figyelése (visibilitychange) és előtérbe kerüléskori állapot-szinkron
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
      } else if (!document.hidden && sessionToken && isOpenNavigationMode && quizContainer.style.display === 'block') {
        syncOpenNavServerState();
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

