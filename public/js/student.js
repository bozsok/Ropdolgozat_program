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
  const pcBadge = document.getElementById('pc-badge');
  const pcNumberText = document.getElementById('pc-number-text');
  const timerBadge = document.getElementById('timer-badge');
  const timerText = document.getElementById('timer-text');

  const loginContainer = document.getElementById('login-container');
  const stepSubject = document.getElementById('step-subject');
  const subjectList = document.getElementById('subject-list');
  const stepClass = document.getElementById('step-class');
  const classList = document.getElementById('class-list');
  const sessionInfoBox = document.getElementById('session-info-box');
  const sessionInfoContent = document.getElementById('session-info-content');
  const stepStudent = document.getElementById('step-student');
  const studentList = document.getElementById('student-list');
  const stepTeam = document.getElementById('step-team');
  const btnStartRace = document.getElementById('btn-start-race');

  const quizContainer = document.getElementById('quiz-container');
  const quizTitle = document.getElementById('quiz-title');
  const studentDisplayName = document.getElementById('student-display-name');
  const questionProgress = document.getElementById('question-progress');
  const questionText = document.getElementById('question-text');
  const questionImageBox = document.getElementById('question-image-box');
  const questionImage = document.getElementById('question-image');
  const optionsContainer = document.getElementById('options-container');
  const shortAnswerContainer = document.getElementById('short-answer-container');
  const shortAnswerInput = document.getElementById('short-answer-input');
  const actionButtonsBox = document.getElementById('action-buttons-box');
  const btnSubmitAnswer = document.getElementById('btn-submit-answer');
  const feedbackCard = document.getElementById('feedback-card');
  const feedbackTitle = document.getElementById('feedback-title');
  const feedbackBody = document.getElementById('feedback-body');
  const btnNextQuestion = document.getElementById('btn-next-question');

  const summaryContainer = document.getElementById('summary-container');
  const finalScore = document.getElementById('final-score');
  const finalGrade = document.getElementById('final-grade');
  const btnRestartStudent = document.getElementById('btn-restart-student');

  /**
   * Alkalmazás inicializálása
   */
  async function init() {
    // 1. Gépszám felismerése az URL-ből (?gep=X)
    const gepParam = getUrlParam('gep');
    if (gepParam) {
      pcNumber = parseInt(gepParam, 10);
      if (!isNaN(pcNumber) && pcNumber >= 1 && pcNumber <= 42) {
        pcBadge.style.display = 'block';
        pcNumberText.textContent = `${pcNumber}. gép`;
      }
    }

    // 2. Socket.io kapcsolat
    if (typeof io !== 'undefined') {
      socket = io();
      setupSocketListeners();
    }

    // 3. Fókuszvesztés figyelő regisztrálása
    setupFocusListener();

    // 4. Mentett munkamenet ellenőrzése (Session Recovery újranyitás esetén)
    const savedToken = sessionStorage.getItem('ropdolgozat_token');
    if (savedToken) {
      const restored = await tryRestoreSession(savedToken);
      if (restored) return;
    }

    // 5. Tantárgyak és osztályok betöltése
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
      sessionStorage.removeItem('ropdolgozat_token');
      alert('A tanár feloldotta a munkamenetedet. Az oldal újratöltődik.');
      window.location.reload();
    });
  }

  /**
   * Tantárgyak betöltése
   */
  async function loadSubjects() {
    try {
      const res = await fetch('/api/subjects');
      const subjects = await res.json();
      subjectList.innerHTML = '';

      subjects.forEach((subj) => {
        const card = document.createElement('div');
        card.className = `select-card ${subj.is_default ? 'selected' : ''}`;
        card.textContent = subj.name;
        card.dataset.id = subj.id;

        if (subj.is_default) {
          selectedSubjectId = subj.id;
        }

        card.addEventListener('click', () => {
          document.querySelectorAll('#subject-list .select-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedSubjectId = subj.id;
          if (selectedClass) {
            checkActiveSession();
          }
        });

        subjectList.appendChild(card);
      });

      stepClass.style.display = 'block';
    } catch (err) {
      console.error('Hiba a tantárgyak betöltésekor:', err);
    }
  }

  /**
   * Osztályok betöltése
   */
  async function loadClasses() {
    try {
      const res = await fetch('/api/classes');
      const classes = await res.json();
      classList.innerHTML = '';

      classes.forEach((cls) => {
        const card = document.createElement('div');
        card.className = 'select-card';
        card.textContent = cls;
        card.dataset.class = cls;

        card.addEventListener('click', () => {
          document.querySelectorAll('#class-list .select-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedClass = cls;
          checkActiveSession();
        });

        classList.appendChild(card);
      });
    } catch (err) {
      console.error('Hiba az osztályok betöltésekor:', err);
    }
  }

  /**
   * Aktív dolgozat ellenőrzése az adott tantárgyra és évfolyamra
   */
  async function checkActiveSession() {
    if (!selectedSubjectId || !selectedClass) return;

    // Évfolyam kinyerése az osztály nevéből (pl. "6.a" -> "6", "10.b" -> "10")
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
        sessionInfoBox.style.display = 'block';
        sessionInfoContent.innerHTML = `
          <div style="color: var(--warning); font-weight: 600; text-align: center; padding: 12px;">
            ⚠️ Jelenleg nincs aktív dolgozat ehhez az évfolyamhoz (${gradeLevel}. évfolyam).<br>
            Kérlek, várj türelemmel, amíg a tanár elindítja!
          </div>
        `;
        stepStudent.style.display = 'none';
        stepTeam.style.display = 'none';
        return;
      }

      // Van aktív dolgozat!
      sessionInfoBox.style.display = 'block';
      sessionInfoContent.innerHTML = `
        <div style="color: var(--success); font-weight: 600; text-align: center; padding: 10px;">
          🟢 Aktív dolgozat elérhető: <strong>${escapeHtml(activeSession.quiz_title)}</strong>
        </div>
      `;

      // Névsor betöltése az osztályhoz
      await loadStudentsForClass(selectedClass);

    } catch (err) {
      console.error('Hiba az aktív dolgozat ellenőrzésekor:', err);
    }
  }

  /**
   * Osztály névsorának betöltése
   */
  async function loadStudentsForClass(className) {
    try {
      const res = await fetch(`/api/classes/${encodeURIComponent(className)}/students`);
      const students = await res.json();
      studentList.innerHTML = '';

      if (students.length === 0) {
        studentList.innerHTML = '<p style="color: var(--text-muted);">Ebben az osztályban még nincs feltöltött névsor.</p>';
        stepStudent.style.display = 'block';
        return;
      }

      students.forEach((stu) => {
        const card = document.createElement('div');
        card.className = 'select-card';
        card.textContent = stu.student_name;

        card.addEventListener('click', () => {
          document.querySelectorAll('#student-list .select-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedStudent = stu;

          if (activeSession.mode === 'SPACE_RACE') {
            stepTeam.style.display = 'block';
            stepTeam.scrollIntoView({ behavior: 'smooth' });
          } else {
            joinQuiz();
          }
        });

        studentList.appendChild(card);
      });

      stepStudent.style.display = 'block';
      stepStudent.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
      console.error('Hiba a diákok betöltésekor:', err);
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

  btnStartRace.addEventListener('click', () => {
    joinQuiz();
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
        alert(data.error || 'Hiba történt a belépés során!');
        return;
      }

      sessionToken = data.token;
      sessionStorage.setItem('ropdolgozat_token', sessionToken);

      // Socket szobához csatlakozás
      if (socket) {
        socket.emit('join:session', { sessionId: activeSession.id, role: 'student' });
      }

      // Megválaszolt kérdések eltárolása (ha volt)
      if (Array.isArray(data.answers)) {
        data.answers.forEach(ans => answeredQuestionIds.add(ans.question_id));
      }

      // Kvíz felület elindítása
      await startQuizInterface();

    } catch (err) {
      console.error('Hiba a belépés során:', err);
      alert('Hálózati hiba a belépéskor!');
    }
  }

  /**
   * Munkamenet helyreállítása (Session Recovery)
   */
  async function tryRestoreSession(token) {
    try {
      const res = await fetch(`/api/student/session-data?token=${encodeURIComponent(token)}`);
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
        socket.emit('join:session', { sessionId: activeSession.id, role: 'student' });
      }

      if (data.participant.is_finished === 1) {
        showSummary({
          totalPoints: data.results ? data.results.total_points : 0,
          maxPoints: (data.results && data.results.max_points) || data.quiz.total_points,
          percentage: data.results ? data.results.percentage : 0,
          grade: data.results ? data.results.grade : null,
          gradeText: data.results ? data.results.grade_text : '',
          showFeedback: data.participant.show_feedback_on_end === 1
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
      const res = await fetch(`/api/student/session-data?token=${encodeURIComponent(sessionToken)}`);
      data = await res.json();
    }

    currentQuiz = data.quiz;
    currentQuestions = data.quiz.questions;

    // Felület váltás
    loginContainer.style.display = 'none';
    quizContainer.style.display = 'block';

    quizTitle.textContent = currentQuiz.title;
    studentDisplayName.textContent = `${data.participant.student_name} (${data.participant.pc_number ? data.participant.pc_number + '. gép' : 'Diák'})`;

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
   * Kérdés megjelenítése a képernyőn
   */
  function renderQuestion(index) {
    if (index >= currentQuestions.length) {
      finishQuiz();
      return;
    }

    currentQuestionIndex = index;
    const q = currentQuestions[index];
    questionStartTime = Date.now();

    questionProgress.textContent = `${index + 1} / ${currentQuestions.length}`;
    questionText.innerHTML = formatCode(q.question_text);

    // Kép megjelenítése
    if (q.image_path) {
      questionImage.src = q.image_path;
      questionImageBox.style.display = 'block';
    } else {
      questionImageBox.style.display = 'none';
    }

    // Reset korábbi állapotokból
    feedbackCard.className = 'feedback-box';
    feedbackCard.style.display = 'none';
    btnSubmitAnswer.disabled = true;
    btnSubmitAnswer.style.display = 'block';
    actionButtonsBox.style.display = 'block';

    optionsContainer.innerHTML = '';
    shortAnswerContainer.style.display = 'none';
    shortAnswerInput.value = '';
    shortAnswerInput.disabled = false;

    // Kérdéstípus szerinti megjelenítés
    if (q.question_type === 'ABCD') {
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      const opts = (Array.isArray(q.options) && q.options.length > 0) ? q.options : ['A', 'B', 'C', 'D'];
      opts.forEach((optText, optIdx) => {
        const btn = document.createElement('div');
        btn.className = 'option-btn';
        btn.dataset.value = optText;

        const letter = letters[optIdx] || String(optIdx + 1);
        btn.innerHTML = `<span class="option-letter">${letter}</span> <span>${formatCode(optText)}</span>`;

        btn.addEventListener('click', () => {
          document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          btnSubmitAnswer.disabled = false;
        });

        optionsContainer.appendChild(btn);
      });
    } else if (q.question_type === 'TF') {
      const tfOptions = ['Igaz', 'Hamis'];
      tfOptions.forEach(optText => {
        const btn = document.createElement('div');
        btn.className = 'option-btn';
        btn.dataset.value = optText;
        btn.innerHTML = `<span>${optText === 'Igaz' ? '✅' : '❌'}</span> <span><strong>${optText}</strong></span>`;

        btn.addEventListener('click', () => {
          document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          btnSubmitAnswer.disabled = false;
        });

        optionsContainer.appendChild(btn);
      });
    } else if (q.question_type === 'SHORT') {
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

    if (q.question_type === 'ABCD' || q.question_type === 'TF') {
      const selected = document.querySelector('.option-btn.selected');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          question_id: q.id,
          submitted_answer: submittedValue,
          time_spent_sec: timeSpent
        })
      });

      const result = await res.json();
      if (!res.ok) {
        alert(result.error || 'Hiba a válasz mentésekor!');
        btnSubmitAnswer.disabled = false;
        return;
      }

      answeredQuestionIds.add(q.id);

      // Válaszgombok inaktiválása
      document.querySelectorAll('.option-btn').forEach(b => {
        b.style.pointerEvents = 'none';
      });
      shortAnswerInput.disabled = true;
      btnSubmitAnswer.style.display = 'none';

      // Azonnali Socrative kiértékelés megjelenítése
      showFeedback(result);

    } catch (err) {
      console.error('Hiba a válasz beküldésekor:', err);
      alert('Hálózati hiba a beküldéskor!');
      btnSubmitAnswer.disabled = false;
    }
  }

  /**
   * Azonnali Socrative Visszajelzés Kártya
   */
  function showFeedback(result) {
    feedbackCard.style.display = 'block';

    if (result.is_correct === 1) {
      feedbackCard.className = 'feedback-box feedback-correct show';
      feedbackTitle.innerHTML = '🎉 Helyes válasz!';
      feedbackBody.innerHTML = `Kapott pont: <strong>${result.points_earned} pont</strong>`;
    } else {
      feedbackCard.className = 'feedback-box feedback-wrong show';
      feedbackTitle.innerHTML = '❌ Helytelen válasz!';
      feedbackBody.innerHTML = `
        <div>A helyes megoldás: <strong>${formatCode(result.correctAnswer)}</strong></div>
      `;
    }

    if (result.explanation) {
      feedbackBody.innerHTML += `
        <div style="margin-top: 8px; font-style: italic;">
          Magyarázat: ${formatCode(result.explanation)}
        </div>
      `;
    }

    const isLast = (currentQuestionIndex + 1 >= currentQuestions.length) || result.isFinished;
    btnNextQuestion.textContent = isLast ? 'Dolgozat befejezése 🏁' : 'Következő kérdés ➔';

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: sessionToken })
      });
    } catch {
      // ignore
    }

    let summaryData = null;
    try {
      const res = await fetch(`/api/student/session-data?token=${encodeURIComponent(sessionToken)}`);
      if (res.ok) {
        const data = await res.json();
        summaryData = {
          totalPoints: data.results ? data.results.total_points : 0,
          maxPoints: (data.results && data.results.max_points) || (currentQuiz ? currentQuiz.total_points : 0),
          percentage: data.results ? data.results.percentage : 0,
          grade: data.results ? data.results.grade : null,
          gradeText: data.results ? data.results.grade_text : '',
          showFeedback: data.participant.show_feedback_on_end === 1
        };
      }
    } catch {
      // ignore
    }

    showSummary(summaryData);
  }

  function showSummary(data) {
    loginContainer.style.display = 'none';
    quizContainer.style.display = 'none';
    summaryContainer.style.display = 'block';

    if (data) {
      if (data.totalPoints !== undefined && data.maxPoints !== undefined) {
        finalScore.textContent = `${data.totalPoints} / ${data.maxPoints} pont (${data.percentage || 0}%)`;
      }
      if (data.gradeText) {
        finalGrade.textContent = `Érdemjegy: ${data.gradeText}`;
      } else if (data.grade) {
        finalGrade.textContent = `Érdemjegy: ${data.grade}`;
      }
    }

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
        alert('Az időkorlát lejárt! A dolgozat automatikusan lezárásra kerül.');
        finishQuiz();
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_token: sessionToken })
        }).catch(() => {});

        showToast('⚠️ Figyelem! A dolgozat közben az ablak elhagyását a rendszer rögzíti!', 'danger');
      }
    });
  }

  // Futtatás betöltéskor
  document.addEventListener('DOMContentLoaded', init);

})();

