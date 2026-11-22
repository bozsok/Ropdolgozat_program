/**
 * scratch/test_teacher_paced.js - Teacher Paced (Tanári léptetés) mód átfogó elfogadási tesztcsomagja
 * Specifikáció: Source/teacher_paced_terv_01.md és Source/teacher_paced_megallapitas_01.md (7. fejezet)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

console.log('================================================================');
console.log('   TEACHER PACED (TANÁRI LÉPTETÉS) ELFOGADÁSI TESZTCSOMAG       ');
console.log('================================================================\n');

// 1. Izolált tesztkörnyezet (modulok betöltése előtt!)
const testRunId = `tp_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const isolatedDir = path.join(os.tmpdir(), testRunId);
fs.mkdirSync(isolatedDir, { recursive: true });

const isolatedDbPath = path.join(isolatedDir, 'data', 'ropdolgozat_tp.db');
const isolatedUploadsDir = path.join(isolatedDir, 'data', 'uploads_tp');
const isolatedDiagnosticsDir = path.join(isolatedDir, 'data', 'diagnostics_tp');
fs.mkdirSync(path.dirname(isolatedDbPath), { recursive: true });
fs.mkdirSync(isolatedUploadsDir, { recursive: true });
fs.mkdirSync(isolatedDiagnosticsDir, { recursive: true });

process.env.DB_PATH = isolatedDbPath;
process.env.UPLOADS_DIR = isolatedUploadsDir;
process.env.DIAGNOSTICS_DIR = isolatedDiagnosticsDir;
process.env.DIAGNOSTICS_ENABLED = 'false';
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';

const db = require('../src/db/init');
const quizRepo = require('../src/db/quizRepo');
const rosterRepo = require('../src/db/rosterRepo');
const { server } = require('../server');

let basePort = 0;

function apiRequest(method, urlPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload !== null) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: basePort,
      path: urlPath,
      method,
      headers: reqHeaders
    }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          data = raw;
        }
        resolve({ status: res.statusCode, headers: res.headers, data });
      });
    });

    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

async function loginAdmin() {
  const res = await apiRequest('POST', '/api/auth/login', { pin: 'admin123' });
  assert.strictEqual(res.status, 200, 'Admin bejelentkezésnek 200-at kell adnia');
  const setCookie = res.headers['set-cookie'];
  assert.ok(Array.isArray(setCookie) && setCookie.length > 0, 'Admin sütinek meg kell jelennie');
  return setCookie.map(c => c.split(';')[0]).join('; ');
}

function getDefaultSubjectId() {
  const row = db.prepare('SELECT id FROM subjects ORDER BY is_default DESC, id ASC LIMIT 1').get();
  assert.ok(row, 'Kell lennie legalább egy tantárgynak');
  return row.id;
}

function createTestQuiz(subjectId, title, questions) {
  const created = quizRepo.createQuiz({
    title,
    subject_id: subjectId,
    grade_level: '3',
    time_limit_min: 15,
    questions
  });
  return quizRepo.getQuizById(created.id, false, true);
}

function createTestStudent(name, className = '3.a') {
  const s = rosterRepo.addStudent(className, name);
  return { id: s.id, name: s.student_name || name, class_name: s.class_name || className };
}

async function runTests() {
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.listen(0, '127.0.0.1', resolve);
  });
  basePort = server.address().port;
  console.log(`✓ Teszt szerver elindult: http://127.0.0.1:${basePort}`);

  const adminCookie = await loginAdmin();
  const subjectId = getDefaultSubjectId();

  const studentA = createTestStudent('Teszt Anna', '3.a');
  const studentB = createTestStudent('Teszt Béla', '3.a');
  const studentC = createTestStudent('Teszt Csaba', '3.a');

  const quiz3 = createTestQuiz(subjectId, 'TP 3 kérdéses teszt', [
    {
      question_type: 'ABCD',
      question_text: '1. kérdés: Mennyi 2 + 2?',
      options: ['3', '4', '5', '6'],
      correct_answer: '4',
      explanation: 'Kettő meg kettő az négy.',
      points: 1
    },
    {
      question_type: 'TF',
      question_text: '2. kérdés: A Föld gömbölyű.',
      options: ['Igaz', 'Hamis'],
      correct_answer: 'Igaz',
      explanation: 'A Föld közelítőleg gömb alakú.',
      points: 1
    },
    {
      question_type: 'SHORT',
      question_text: '3. kérdés: Mi Magyarország fővárosa?',
      options: [],
      correct_answer: 'Budapest',
      explanation: 'Magyarország fővárosa Budapest.',
      points: 1
    }
  ]);

  // =========================================================================
  // TP-01: Indítás + szerveroldali kényszerítés (shuffle_questions=0, time_limit=0)
  // =========================================================================
  console.log('\n[TP-01] Teacher Paced indítás és szerveroldali kényszerítés...');
  const startRes = await apiRequest('POST', '/api/admin/sessions/start', {
    subject_id: subjectId,
    grade_level: '3',
    quiz_id: quiz3.id,
    mode: 'TEACHER_PACED',
    time_limit_min: 20,
    shuffle_questions: 1,
    shuffle_options: 1,
    show_feedback_on_end: 1
  }, { Cookie: adminCookie });

  assert.strictEqual(startRes.status, 200, `Indítás sikertelen: ${JSON.stringify(startRes.data)}`);
  const tpSession = startRes.data.session;
  assert.strictEqual(tpSession.mode, 'TEACHER_PACED');
  assert.strictEqual(tpSession.shuffle_questions, 0, 'Teacher Paced módban shuffle_questions kötelezően 0');
  assert.strictEqual(tpSession.time_limit_min, 0, 'Teacher Paced módban time_limit_min kötelezően 0');
  assert.strictEqual(tpSession.current_question_index, 0, 'Induláskor az 1. kérdés (index 0) nyitott');
  assert.strictEqual(tpSession.show_feedback_on_end, 1);
  console.log('✓ TP-01 sikeres.');

  // =========================================================================
  // TP-02: Jogosultság, határellenőrzés, érvényes léptetés, 409 ütközés
  // =========================================================================
  console.log('\n[TP-02] Léptetés jogosultság, határellenőrzés és optimista 409 ütközés...');
  const unauthStep = await apiRequest('POST', `/api/admin/sessions/${tpSession.id}/question-index`, {
    questionIndex: 1
  });
  assert.ok(unauthStep.status === 401 || unauthStep.status === 403, 'Auth nélkül el kell utasítani a léptetést');

  const negStep = await apiRequest('POST', `/api/admin/sessions/${tpSession.id}/question-index`, {
    questionIndex: -1
  }, { Cookie: adminCookie });
  assert.strictEqual(negStep.status, 400, 'Negatív indexnél 400 kell');

  const overStep = await apiRequest('POST', `/api/admin/sessions/${tpSession.id}/question-index`, {
    questionIndex: 99
  }, { Cookie: adminCookie });
  assert.strictEqual(overStep.status, 400, 'Határon túli indexnél 400 kell');

  const nanStep = await apiRequest('POST', `/api/admin/sessions/${tpSession.id}/question-index`, {
    questionIndex: 'nem_szam'
  }, { Cookie: adminCookie });
  assert.strictEqual(nanStep.status, 400, 'Nem egész indexnél 400 kell');

  // Érvényes léptetés 0 -> 1, majd vissza 0-ra
  const stepTo1 = await apiRequest('POST', `/api/admin/sessions/${tpSession.id}/question-index`, {
    questionIndex: 1,
    fromIndex: 0
  }, { Cookie: adminCookie });
  assert.strictEqual(stepTo1.status, 200);
  assert.strictEqual(stepTo1.data.currentIndex, 1);
  assert.strictEqual(stepTo1.data.changed, true);

  // Optimista ütközés: a másik gép még 0-ról akarna lépni 1-re
  const conflictStep = await apiRequest('POST', `/api/admin/sessions/${tpSession.id}/question-index`, {
    questionIndex: 1,
    fromIndex: 0
  }, { Cookie: adminCookie });
  assert.strictEqual(conflictStep.status, 409, 'Elavult fromIndex esetén 409 Conflict kell');
  assert.strictEqual(conflictStep.data.conflict, true);
  assert.strictEqual(conflictStep.data.currentIndex, 1);

  // Visszalépés 0-ra a következő teszthez
  const stepBack0 = await apiRequest('POST', `/api/admin/sessions/${tpSession.id}/question-index`, {
    questionIndex: 0,
    fromIndex: 1
  }, { Cookie: adminCookie });
  assert.strictEqual(stepBack0.status, 200);
  assert.strictEqual(stepBack0.data.currentIndex, 0);
  console.log('✓ TP-02 sikeres.');

  // =========================================================================
  // TP-03 & TP-06: Belépés, csak aktív kérdés kiadása, QUESTION_NOT_ACTIVE, determinisztikus keverés, idempotencia
  // =========================================================================
  console.log('\n[TP-03 & TP-06] Diák belépés, QUESTION_NOT_ACTIVE, determinisztikus opciókeverés, idempotencia...');
  const joinA = await apiRequest('POST', '/api/student/join', {
    session_id: tpSession.id,
    student_id: studentA.id,
    student_name: studentA.name,
    pc_number: 1
  });
  assert.strictEqual(joinA.status, 200);
  const tokenA = joinA.data.token;

  const joinB = await apiRequest('POST', '/api/student/join', {
    session_id: tpSession.id,
    student_id: studentB.id,
    student_name: studentB.name,
    pc_number: 2
  });
  assert.strictEqual(joinB.status, 200);
  const tokenB = joinB.data.token;

  const dataA1 = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': tokenA });
  assert.strictEqual(dataA1.status, 200);
  assert.strictEqual(dataA1.data.quiz.questions.length, 1, 'Aktív Teacher Paced-ben csak az 1 aktuális kérdés mehet ki');
  assert.strictEqual(dataA1.data.currentQuestion.id, quiz3.questions[0].id);
  assert.strictEqual(dataA1.data.currentQuestionIndex, 0);
  assert.strictEqual(dataA1.data.totalQuestions, 3);
  assert.strictEqual(dataA1.data.currentQuestion.correct_answer, undefined, 'Megválaszolatlan kérdésnél nem szivároghat megoldás');

  // Determinisztikus opciókeverés ellenőrzése (többszöri lekérésre azonos sorrend!)
  const firstOrderA = JSON.stringify(dataA1.data.currentQuestion.options);
  const dataA1Repeat = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': tokenA });
  assert.strictEqual(JSON.stringify(dataA1Repeat.data.currentQuestion.options), firstOrderA, 'Az opciók sorrendjének determinisztikusnak kell lennie');

  // Nem aktív (2.) kérdésre beküldés -> 400 + QUESTION_NOT_ACTIVE
  const badQSubmit = await apiRequest('POST', '/api/student/submit-answer', {
    session_token: tokenA,
    question_id: quiz3.questions[1].id,
    submitted_answer: 'Igaz',
    time_spent_sec: 3
  });
  assert.strictEqual(badQSubmit.status, 400);
  assert.strictEqual(badQSubmit.data.code, 'QUESTION_NOT_ACTIVE');

  // Diák A válaszol az 1. kérdésre
  const ansA1 = await apiRequest('POST', '/api/student/submit-answer', {
    session_token: tokenA,
    question_id: quiz3.questions[0].id,
    submitted_answer: '4',
    time_spent_sec: 5
  });
  assert.strictEqual(ansA1.status, 200);
  assert.strictEqual(ansA1.data.submittedAnswer, '4', 'A mentett saját válasznak vissza kell érkeznie');
  assert.strictEqual(ansA1.data.is_correct, 1);
  assert.strictEqual(ansA1.data.explanation, 'Kettő meg kettő az négy.');
  assert.strictEqual(ansA1.data.isFinished, false);

  // Tanár léptet a 2. kérdésre (index 1)
  await apiRequest('POST', `/api/admin/sessions/${tpSession.id}/question-index`, {
    questionIndex: 1,
    fromIndex: 0
  }, { Cookie: adminCookie });

  // Idempotens újraküldés az 1. kérdésre akkor is idempotens marad, ha a tanár közben továbblépett!
  const dupA1AfterStep = await apiRequest('POST', '/api/student/submit-answer', {
    session_token: tokenA,
    question_id: quiz3.questions[0].id,
    submitted_answer: '3',
    time_spent_sec: 6
  });
  assert.strictEqual(dupA1AfterStep.status, 200, 'Korábban mentett válasz újraküldésének idempotensnek kell maradnia');
  assert.strictEqual(dupA1AfterStep.data.alreadySubmitted, true);
  assert.strictEqual(dupA1AfterStep.data.submittedAnswer, '4', 'Idempotens ismétléskor az eredetileg mentett válasznak kell visszajönnie');
  assert.strictEqual(dupA1AfterStep.data.is_correct, 1, 'Az eredeti helyes válasz nem íródhat felül');

  // Késői belépő (Diák C) a 2. kérdésnél csatlakozik -> rögtön a 2. kérdést látja!
  const joinC = await apiRequest('POST', '/api/student/join', {
    session_id: tpSession.id,
    student_id: studentC.id,
    student_name: studentC.name,
    pc_number: 3
  });
  assert.strictEqual(joinC.status, 200);
  const dataC = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': joinC.data.token });
  assert.strictEqual(dataC.data.currentQuestionIndex, 1);
  assert.strictEqual(dataC.data.currentQuestion.id, quiz3.questions[1].id);
  console.log('✓ TP-03 & TP-06 sikeres.');

  // =========================================================================
  // TP-04: Visszalépéses pótlás (Diák B pótolhat, Diák A zárolva marad)
  // =========================================================================
  console.log('\n[TP-04] Visszalépéses pótlás ellenőrzése...');
  await apiRequest('POST', `/api/admin/sessions/${tpSession.id}/question-index`, {
    questionIndex: 0,
    fromIndex: 1
  }, { Cookie: adminCookie });

  // Diák B még nem válaszolt az 1. kérdésre -> most pótolhat!
  const ansB1 = await apiRequest('POST', '/api/student/submit-answer', {
    session_token: tokenB,
    question_id: quiz3.questions[0].id,
    submitted_answer: '4',
    time_spent_sec: 4
  });
  assert.strictEqual(ansB1.status, 200);
  assert.strictEqual(ansB1.data.alreadySubmitted, false);
  assert.strictEqual(ansB1.data.is_correct, 1);

  // Diák A session-data visszalépés után is stabil opciósorrendet és zárolt választ kap
  const dataABack = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': tokenA });
  assert.strictEqual(JSON.stringify(dataABack.data.currentQuestion.options), firstOrderA, 'Visszalépés után is azonos opciósorrend');
  assert.ok(dataABack.data.currentAnswer && dataABack.data.currentAnswer.submitted_answer === '4');
  console.log('✓ TP-04 sikeres.');

  // Lezárjuk az első teszt munkamenetet
  const finish1 = await apiRequest('POST', `/api/admin/sessions/${tpSession.id}/finish`, {}, { Cookie: adminCookie });
  assert.strictEqual(finish1.status, 200);

  // =========================================================================
  // TP-05: Egykérdéses dolgozat + diák /student/finish tiltása + tanári lezárás
  // =========================================================================
  console.log('\n[TP-05] Egykérdéses dolgozat és diák önlezárásának tiltása...');
  const quiz1 = createTestQuiz(subjectId, 'TP 1 kérdéses teszt', [
    {
      question_type: 'TF',
      question_text: 'Egyetlen kérdés: 1 + 1 = 2?',
      options: ['Igaz', 'Hamis'],
      correct_answer: 'Igaz',
      explanation: 'Igen, 1 + 1 = 2.',
      points: 1
    }
  ]);

  const startSingle = await apiRequest('POST', '/api/admin/sessions/start', {
    subject_id: subjectId,
    grade_level: '3',
    quiz_id: quiz1.id,
    mode: 'TEACHER_PACED',
    show_feedback_on_end: 1
  }, { Cookie: adminCookie });
  assert.strictEqual(startSingle.status, 200);
  const singleSessionId = startSingle.data.session.id;

  const joinSingle = await apiRequest('POST', '/api/student/join', {
    session_id: singleSessionId,
    student_id: studentA.id,
    student_name: studentA.name,
    pc_number: 1
  });
  const tokenSingle = joinSingle.data.token;

  const ansSingle = await apiRequest('POST', '/api/student/submit-answer', {
    session_token: tokenSingle,
    question_id: quiz1.questions[0].id,
    submitted_answer: 'Igaz',
    time_spent_sec: 2
  });
  assert.strictEqual(ansSingle.status, 200);
  assert.strictEqual(ansSingle.data.isFinished, false, 'Egykérdéses Teacher Paced-ben sem zárhatja le magát a diák válaszadáskor');

  const forbiddenFinish = await apiRequest('POST', '/api/student/finish', {
    session_token: tokenSingle
  });
  assert.strictEqual(forbiddenFinish.status, 400);
  assert.strictEqual(forbiddenFinish.data.code, 'TEACHER_PACED_FINISH_FORBIDDEN');

  const finishSingle = await apiRequest('POST', `/api/admin/sessions/${singleSessionId}/finish`, {}, { Cookie: adminCookie });
  assert.strictEqual(finishSingle.status, 200);

  const afterSingleFinish = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': tokenSingle });
  assert.strictEqual(afterSingleFinish.data.participant.session_status, 'FINISHED');
  assert.ok(afterSingleFinish.data.results && afterSingleFinish.data.results.percentage === 100);
  console.log('✓ TP-05 sikeres.');

  // =========================================================================
  // TP-07: Kikapcsolt visszajelzés (show_feedback_on_end = 0) – szivárgásmentesség + lezárás utáni értékelőlap
  // =========================================================================
  console.log('\n[TP-07] Kikapcsolt visszajelzés nyers API-szűrése (submit, session-data, join) és lezárás utáni értékelőlap...');
  const startHidden = await apiRequest('POST', '/api/admin/sessions/start', {
    subject_id: subjectId,
    grade_level: '3',
    quiz_id: quiz3.id,
    mode: 'TEACHER_PACED',
    show_feedback_on_end: 0
  }, { Cookie: adminCookie });
  assert.strictEqual(startHidden.status, 200);
  const hiddenSessionId = startHidden.data.session.id;

  const joinHidden = await apiRequest('POST', '/api/student/join', {
    session_id: hiddenSessionId,
    student_id: studentA.id,
    student_name: studentA.name,
    pc_number: 1
  });
  const tokenHidden = joinHidden.data.token;

  const submitHidden = await apiRequest('POST', '/api/student/submit-answer', {
    session_token: tokenHidden,
    question_id: quiz3.questions[0].id,
    submitted_answer: '4',
    time_spent_sec: 4
  });
  assert.strictEqual(submitHidden.status, 200);
  assert.strictEqual(submitHidden.data.submittedAnswer, '4', 'Kikapcsolt visszajelzésnél is visszaérkezik a saját mentett válasz');
  assert.strictEqual(submitHidden.data.hideFeedback, true);
  assert.strictEqual(submitHidden.data.results, null, 'Kikapcsolt visszajelzésnél submit-answer results === null');
  assert.strictEqual(submitHidden.data.is_correct, null);
  assert.strictEqual(submitHidden.data.points_earned, null);
  assert.strictEqual(submitHidden.data.eval_status, null);
  assert.strictEqual(submitHidden.data.correctAnswer, null);
  assert.strictEqual(submitHidden.data.explanation, null);

  // session-data ellenőrzése aktív állapotban
  const hiddenData = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': tokenHidden });
  assert.strictEqual(hiddenData.status, 200);
  assert.strictEqual(hiddenData.data.results, null, 'Kikapcsolt visszajelzésnél aktív állapotban results === null kötelező');
  assert.strictEqual(hiddenData.data.currentAnswer.submitted_answer, '4');
  assert.strictEqual(hiddenData.data.currentAnswer.is_correct, undefined, 'is_correct nem szivároghat');
  assert.strictEqual(hiddenData.data.currentAnswer.points_earned, undefined, 'points_earned nem szivároghat');
  assert.strictEqual(hiddenData.data.currentAnswer.eval_status, undefined, 'eval_status nem szivároghat');
  assert.strictEqual(hiddenData.data.currentAnswer.correct_answer, undefined, 'correct_answer nem szivároghat');
  assert.strictEqual(hiddenData.data.currentQuestion.correct_answer, undefined, 'currentQuestion.correct_answer nem szivároghat');

  // join recovery ellenőrzése aktív állapotban
  const recoveryJoin = await apiRequest('POST', '/api/student/join', {
    session_id: hiddenSessionId,
    student_id: studentA.id,
    student_name: studentA.name,
    pc_number: 1,
    session_token: tokenHidden
  });
  assert.strictEqual(recoveryJoin.status, 200);
  assert.strictEqual(recoveryJoin.data.isRecovery, true);
  assert.strictEqual(recoveryJoin.data.answers.length, 1);
  assert.strictEqual(recoveryJoin.data.answers[0].submitted_answer, '4');
  assert.strictEqual(recoveryJoin.data.answers[0].is_correct, undefined, 'join recovery answers nem szivárogtathat is_correct mezőt');
  assert.strictEqual(recoveryJoin.data.answers[0].points_earned, undefined, 'join recovery answers nem szivárogtathat points_earned mezőt');
  assert.strictEqual(recoveryJoin.data.answers[0].eval_status, undefined, 'join recovery answers nem szivárogtathat eval_status mezőt');

  // Tanári lezárás után mindkét állásban megjelenhet a személyes értékelőlap és a megoldások
  const finishHidden = await apiRequest('POST', `/api/admin/sessions/${hiddenSessionId}/finish`, {}, { Cookie: adminCookie });
  assert.strictEqual(finishHidden.status, 200);

  const afterHiddenFinish = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': tokenHidden });
  assert.strictEqual(afterHiddenFinish.status, 200);
  assert.ok(afterHiddenFinish.data.results && typeof afterHiddenFinish.data.results.percentage === 'number', 'Lezárás után a results objektumnak meg kell jelennie');
  assert.strictEqual(afterHiddenFinish.data.quiz.questions.length, 3, 'Lezárás után minden kérdés látszik az értékelőlapon');
  assert.strictEqual(afterHiddenFinish.data.quiz.questions[0].correct_answer, '4', 'Lezárás után a megoldások is láthatók');
  assert.strictEqual(afterHiddenFinish.data.quiz.questions[0].explanation, 'Kettő meg kettő az négy.');
  console.log('✓ TP-07 sikeres.');

  // =========================================================================
  // TP-08: Kétlépcsős lezárás – Kérdések befejezése (összegzés + javítás nyitva) -> majd végleges lezárás
  // =========================================================================
  console.log('\n[TP-08] Kétlépcsős lezárás: complete-questions (részpontadás nyitva) -> végleges finish...');
  const startTwoStep = await apiRequest('POST', '/api/admin/sessions/start', {
    subject_id: subjectId,
    grade_level: '3',
    quiz_id: quiz1.id,
    mode: 'TEACHER_PACED',
    show_feedback_on_end: 0
  }, { Cookie: adminCookie });
  assert.strictEqual(startTwoStep.status, 200);
  const twoStepSessionId = startTwoStep.data.session.id;

  const joinTwoStep = await apiRequest('POST', '/api/student/join', {
    session_id: twoStepSessionId,
    student_id: studentA.id,
    student_name: studentA.name,
    pc_number: 1
  });
  const tokenTwoStep = joinTwoStep.data.token;

  // Hibás válasz beküldése (0 pont)
  const wrongSubmit = await apiRequest('POST', '/api/student/submit-answer', {
    session_token: tokenTwoStep,
    question_id: quiz1.questions[0].id,
    submitted_answer: 'Hamis',
    time_spent_sec: 3
  });
  assert.strictEqual(wrongSubmit.status, 200);

  // 1. lépés: Léptetősáv "Befejezés" (complete-questions) -> diák látja az összegzést, de a session még ACTIVE!
  const completeRes = await apiRequest('POST', `/api/admin/sessions/${twoStepSessionId}/complete-questions`, {}, { Cookie: adminCookie });
  assert.strictEqual(completeRes.status, 200);
  assert.strictEqual(completeRes.data.reviewPhase, true);

  const reviewDataBefore = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': tokenTwoStep });
  assert.strictEqual(reviewDataBefore.status, 200);
  assert.strictEqual(reviewDataBefore.data.participant.session_status, 'ACTIVE');
  assert.strictEqual(reviewDataBefore.data.participant.is_finished, 1);
  assert.strictEqual(reviewDataBefore.data.session.review_phase, true);
  assert.strictEqual(reviewDataBefore.data.results.percentage, 0);
  assert.strictEqual(reviewDataBefore.data.quiz.questions[0].correct_answer, 'Igaz', 'Összegzés fázisban a megoldás látható');

  // További léptetés már tiltott a kérdések lezárása után
  const stepAfterComplete = await apiRequest('POST', `/api/admin/sessions/${twoStepSessionId}/question-index`, {
    questionIndex: 0
  }, { Cookie: adminCookie });
  assert.strictEqual(stepAfterComplete.status, 400);
  assert.strictEqual(stepAfterComplete.data.code, 'QUESTIONS_ALREADY_COMPLETED');

  // Tanári kézi részpontadás (0,5 pont) SIKERES, mert a session még ACTIVE!
  const ansRow = db.prepare('SELECT id FROM answers WHERE session_id = ? LIMIT 1').get(twoStepSessionId);
  assert.ok(ansRow);
  const overrideOk = await apiRequest('POST', `/api/admin/answers/${ansRow.id}/override`, {
    eval_status: 'PARTIAL',
    custom_points: 0.5
  }, { Cookie: adminCookie });
  assert.strictEqual(overrideOk.status, 200, 'Összegzés fázisban a részpontadásnak sikerülnie kell');

  const reviewDataAfter = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': tokenTwoStep });
  assert.strictEqual(reviewDataAfter.data.results.total_points, 0.5);
  assert.strictEqual(reviewDataAfter.data.results.percentage, 50);

  // 2. lépés: Végleges "Dolgozat befejezése" -> ezután már nem módosítható semmi!
  const finalFinish = await apiRequest('POST', `/api/admin/sessions/${twoStepSessionId}/finish`, {}, { Cookie: adminCookie });
  assert.strictEqual(finalFinish.status, 200);

  const overrideAfterFinal = await apiRequest('POST', `/api/admin/answers/${ansRow.id}/override`, {
    eval_status: 'CORRECT'
  }, { Cookie: adminCookie });
  assert.strictEqual(overrideAfterFinal.status, 400, 'Végleges lezárás után már nem lehet felülbírálni');
  console.log('✓ TP-08 sikeres.');

  console.log('\n================================================================');
  console.log('🎉 MINDEN TEACHER PACED ELFOGADÁSI TESZT (TP-01 – TP-08) ZÖLD! 🎉');
  console.log('================================================================\n');
}

runTests()
  .then(() => {
    server.close();
    try { db.close(); } catch {}
    try { fs.rmSync(isolatedDir, { recursive: true, force: true }); } catch {}
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ TEACHER PACED TESZT HIBA:', err);
    try { server.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(isolatedDir, { recursive: true, force: true }); } catch {}
    process.exit(1);
  });
