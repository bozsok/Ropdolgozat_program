/**
 * scratch/test_open_navigation.js - Open Navigation (Szabad navigáció) elfogadási tesztcsomag (ON-01..ON-09)
 * Specifikáció: Source/open_navigation_terv_01.md és Source/open_nagivation_valasz_01.md
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const Database = require('better-sqlite3');

console.log('================================================================');
console.log('   OPEN NAVIGATION (SZABAD NAVIGÁCIÓ) ELFOGADÁSI TESZTCSOMAG    ');
console.log('================================================================\n');

// 1. Izolált tesztkörnyezet (modulok betöltése előtt!)
const testRunId = `on_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const isolatedDir = path.join(os.tmpdir(), testRunId);
fs.mkdirSync(isolatedDir, { recursive: true });

const isolatedDbPath = path.join(isolatedDir, 'data', 'ropdolgozat_on.db');
const isolatedUploadsDir = path.join(isolatedDir, 'data', 'uploads_on');
const isolatedDiagnosticsDir = path.join(isolatedDir, 'data', 'diagnostics_on');
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
const sessionRepo = require('../src/db/sessionRepo');
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
      res.on('data', (chunk) => { raw += chunk; });
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
  return setCookie.map((c) => c.split(';')[0]).join('; ');
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
    grade_level: '5',
    time_limit_min: 15,
    questions
  });
  return quizRepo.getQuizById(created.id, false, true);
}

function ensureStudents(className, names) {
  const created = [];
  for (const name of names) {
    rosterRepo.addStudent(className, name);
  }
  const all = rosterRepo.getStudentsByClass(className);
  for (const name of names) {
    const found = all.find((s) => s.student_name === name);
    assert.ok(found, `Hiányzó diák: ${name}`);
    created.push(found);
  }
  return created;
}

async function runTests() {
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.listen(0, '127.0.0.1', resolve);
  });
  basePort = server.address().port;
  console.log(`✓ Tesztszerver elindult a ${basePort} porton\n`);

  const adminCookie = await loginAdmin();
  const adminHeaders = { Cookie: adminCookie };
  const subjectId = getDefaultSubjectId();

  const quiz = createTestQuiz(subjectId, 'Open Navigation Tesztdolgozat', [
    {
      question_type: 'ABCD',
      question_text: 'Mennyi 2 + 2?',
      options: ['3', '4', '5', '6'],
      correct_answer: '4',
      explanation: 'Kettő meg kettő egyenlő néggyel.',
      points: 2
    },
    {
      question_type: 'TF',
      question_text: 'A Föld gömbölyű.',
      correct_answer: 'Igaz',
      explanation: 'A Föld geoid alakú, megközelítőleg gömb.',
      points: 1
    },
    {
      question_type: 'SHORT',
      question_text: 'Mi Magyarország fővárosa?',
      correct_answer: 'Budapest',
      explanation: 'Budapest Magyarország fővárosa.',
      points: 2
    }
  ]);

  const students = ensureStudents('5.a', [
    'Teszt Anna',
    'Teszt Béla',
    'Teszt Csaba',
    'Teszt Dóra',
    'Teszt Elemér'
  ]);

  // =========================================================================
  // ON-01: OPEN_NAVIGATION indítás + submit-answer elutasítása
  // =========================================================================
  console.log('--- ON-01: OPEN_NAVIGATION indítása és submit-answer tiltása ---');
  const startRes = await apiRequest('POST', '/api/admin/sessions/start', {
    quiz_id: quiz.id,
    subject_id: subjectId,
    grade_level: '5',
    mode: 'OPEN_NAVIGATION',
    shuffle_questions: true,
    shuffle_options: true,
    show_feedback_on_end: true,
    time_limit_min: 15
  }, adminHeaders);
  assert.strictEqual(startRes.status, 200, `Session indítás sikertelen: ${JSON.stringify(startRes.data)}`);
  const startedSession1 = startRes.data.session || startRes.data;
  const sessionId = startedSession1.id;
  assert.strictEqual(startedSession1.mode, 'OPEN_NAVIGATION');

  const joinAnna = await apiRequest('POST', '/api/student/join', {
    session_id: sessionId,
    student_id: students[0].id,
    student_name: students[0].student_name,
    pc_number: 1
  });
  assert.strictEqual(joinAnna.status, 200, `Anna belépése sikertelen: ${JSON.stringify(joinAnna.data)}`);
  const annaToken = joinAnna.data.token;
  const annaParticipantId = joinAnna.data.participant.id;
  assert.ok(joinAnna.data.results === undefined || joinAnna.data.results === null, 'Aktív OPEN_NAVIGATION join nem adhat results-ot');

  const submitReject = await apiRequest('POST', '/api/student/submit-answer', {
    session_token: annaToken,
    question_id: quiz.questions[0].id,
    submitted_answer: '4',
    time_spent_sec: 5
  }, { 'x-session-token': annaToken });
  assert.strictEqual(submitReject.status, 400, 'submit-answer-nek 400-at kell adnia OPEN_NAVIGATION-ben');
  assert.strictEqual(submitReject.data.code, 'INVALID_SESSION_MODE');
  console.log('✓ ON-01 sikeres');

  // =========================================================================
  // ON-02: Piszkozat mentés, módosítás, 409 konfliktus, verziózott ürítés, maszkolás és determinisztikus sorrend
  // =========================================================================
  console.log('--- ON-02: Verziózott piszkozatmentés, konfliktuskezelés és ürítés ---');
  const q1 = quiz.questions[0];
  const q2 = quiz.questions[1];
  const q3 = quiz.questions[2];

  // Bemeneti szerződés ellenőrzése (2.4 & 3.3 pont)
  const badVerMissing = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken, question_id: q1.id, draft_answer: '4'
  }, { 'x-session-token': annaToken });
  assert.strictEqual(badVerMissing.status, 400);
  assert.strictEqual(badVerMissing.data.code, 'INVALID_BASE_VERSION');

  const badVerNeg = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken, question_id: q1.id, draft_answer: '4', base_version: -1
  }, { 'x-session-token': annaToken });
  assert.strictEqual(badVerNeg.status, 400);
  assert.strictEqual(badVerNeg.data.code, 'INVALID_BASE_VERSION');

  const badAbcdOpt = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken, question_id: q1.id, draft_answer: 'NEM_LETEZO_OPCIO', base_version: 0
  }, { 'x-session-token': annaToken });
  assert.strictEqual(badAbcdOpt.status, 400);
  assert.strictEqual(badAbcdOpt.data.code, 'INVALID_DRAFT_OPTION');

  const badTfOpt = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken, question_id: q2.id, draft_answer: 'Talán', base_version: 0
  }, { 'x-session-token': annaToken });
  assert.strictEqual(badTfOpt.status, 400);
  assert.strictEqual(badTfOpt.data.code, 'INVALID_DRAFT_OPTION');

  const tooLongShort = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken, question_id: q3.id, draft_answer: 'a'.repeat(501), base_version: 0
  }, { 'x-session-token': annaToken });
  assert.strictEqual(tooLongShort.status, 400);
  assert.strictEqual(tooLongShort.data.code, 'DRAFT_ANSWER_TOO_LONG');

  // 1. mentés (v0 -> v1)
  const d1 = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken,
    question_id: q1.id,
    draft_answer: '3',
    base_version: 0
  }, { 'x-session-token': annaToken });
  assert.strictEqual(d1.status, 200);
  assert.strictEqual(d1.data.version, 1);
  assert.strictEqual(d1.data.draft_answer, '3');

  // 2. módosítás (v1 -> v2)
  const d2 = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken,
    question_id: q1.id,
    draft_answer: '4',
    base_version: 1
  }, { 'x-session-token': annaToken });
  assert.strictEqual(d2.status, 200);
  assert.strictEqual(d2.data.version, 2);
  assert.strictEqual(d2.data.draft_answer, '4');

  // 3. elavult verzió (v1) -> 409 DRAFT_VERSION_CONFLICT
  const dConflict = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken,
    question_id: q1.id,
    draft_answer: '5',
    base_version: 1
  }, { 'x-session-token': annaToken });
  assert.strictEqual(dConflict.status, 409);
  assert.strictEqual(dConflict.data.code, 'DRAFT_VERSION_CONFLICT');
  assert.strictEqual(dConflict.data.currentVersion, 2);
  assert.strictEqual(dConflict.data.currentAnswer, '4');

  // 4. verziózott logikai ürítés (v2 -> v3, draft_answer = '')
  const dClear = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken,
    question_id: q1.id,
    draft_answer: '',
    base_version: 2
  }, { 'x-session-token': annaToken });
  assert.strictEqual(dClear.status, 200);
  assert.strictEqual(dClear.data.version, 3);
  assert.strictEqual(dClear.data.draft_answer, '');

  // 5. elavult verzió ürítés után (v2) -> továbbra is 409!
  const dConflictAfterClear = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken,
    question_id: q1.id,
    draft_answer: '3',
    base_version: 2
  }, { 'x-session-token': annaToken });
  assert.strictEqual(dConflictAfterClear.status, 409);
  assert.strictEqual(dConflictAfterClear.data.currentVersion, 3);
  assert.strictEqual(dConflictAfterClear.data.currentAnswer, '');

  // 6. új válasz mentése (v3 -> v4) + q2 és q3 kitöltése
  const dFinalQ1 = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken,
    question_id: q1.id,
    draft_answer: '4',
    base_version: 3
  }, { 'x-session-token': annaToken });
  assert.strictEqual(dFinalQ1.status, 200);
  assert.strictEqual(dFinalQ1.data.version, 4);

  const dQ2 = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken,
    question_id: q2.id,
    draft_answer: 'Igaz',
    base_version: 0
  }, { 'x-session-token': annaToken });
  assert.strictEqual(dQ2.status, 200);

  const dQ3 = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken,
    question_id: q3.id,
    draft_answer: 'Debrecen',
    base_version: 0
  }, { 'x-session-token': annaToken });
  assert.strictEqual(dQ3.status, 200);

  // session-data ellenőrzése aktív állapotban + determinisztikus sorrend
  const sd1 = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': annaToken });
  const sd2 = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': annaToken });
  assert.strictEqual(sd1.status, 200);
  assert.strictEqual(sd1.data.results, null, 'Aktív OPEN_NAVIGATION-nél results === null');
  assert.deepStrictEqual(sd1.data.answers, [], 'Aktív OPEN_NAVIGATION-nél answers === []');
  assert.strictEqual(sd1.data.drafts.length, 3);
  for (const q of sd1.data.quiz.questions) {
    assert.strictEqual(q.correct_answer, undefined, 'Aktív kérdésben nem szerepelhet correct_answer');
    assert.strictEqual(q.explanation, undefined, 'Aktív kérdésben nem szerepelhet explanation');
  }
  assert.deepStrictEqual(
    sd1.data.quiz.questions.map((q) => ({ id: q.id, options: q.options })),
    sd2.data.quiz.questions.map((q) => ({ id: q.id, options: q.options })),
    'A kérdés- és opciósorrendnek determinisztikusan azonosnak kell lennie újratöltéskor'
  );
  console.log('✓ ON-02 sikeres');

  // =========================================================================
  // ON-03: Élő tanári mátrix beadás előtt (drafts) és beadás után (answers)
  // =========================================================================
  console.log('--- ON-03: Élő tanári mátrix piszkozat vs. végleges válaszok ---');
  const matrixBefore = await apiRequest('GET', `/api/admin/sessions/${sessionId}/matrix`, null, adminHeaders);
  assert.strictEqual(matrixBefore.status, 200);
  const annaDraftsInMatrix = (matrixBefore.data.drafts || []).filter((d) => d.participant_id === annaParticipantId);
  const annaAnswersBefore = (matrixBefore.data.answers || []).filter((a) => a.participant_id === annaParticipantId);
  assert.strictEqual(annaDraftsInMatrix.length, 3, 'Beadás előtt 3 piszkozatnak kell látszania a mátrixban');
  assert.strictEqual(annaAnswersBefore.length, 0, 'Beadás előtt 0 végleges válasz lehet');
  console.log('✓ ON-03 (beadás előtti rész) sikeres');

  // =========================================================================
  // ON-04: Kézi beadás, idempotencia, utólagos save-draft tiltása + rollback-próba
  // =========================================================================
  console.log('--- ON-04: Kézi beadás, idempotencia és félbeszakadt véglegesítés rollback ---');
  const finish1 = await apiRequest('POST', '/api/student/finish', { session_token: annaToken }, { 'x-session-token': annaToken });
  assert.strictEqual(finish1.status, 200);
  assert.strictEqual(finish1.data.success, true);
  assert.ok(finish1.data.receipt && finish1.data.receipt.is_finished === 1, 'finish válasznak egységes receipt-et kell adnia');

  // Beadott állapotban is elutasítja a régi submit-answer útvonalat (2.1 pont)
  const submitRejectFinished = await apiRequest('POST', '/api/student/submit-answer', {
    session_token: annaToken, question_id: q1.id, submitted_answer: '4', time_spent_sec: 1
  }, { 'x-session-token': annaToken });
  assert.strictEqual(submitRejectFinished.status, 400);
  assert.strictEqual(submitRejectFinished.data.code, 'INVALID_SESSION_MODE');

  // Idempotens dupla beadás (megőrzi az eredeti finished_at időt!)
  const origFinishedAt = db.prepare('SELECT finished_at FROM participants WHERE id = ?').get(annaParticipantId).finished_at;
  const finish2 = await apiRequest('POST', '/api/student/finish', { session_token: annaToken }, { 'x-session-token': annaToken });
  assert.strictEqual(finish2.status, 200);
  const afterSecondFinishedAt = db.prepare('SELECT finished_at FROM participants WHERE id = ?').get(annaParticipantId).finished_at;
  assert.strictEqual(afterSecondFinishedAt, origFinishedAt, 'Ismételt beadásnak meg kell őriznie az eredeti finished_at időt');

  const annaAnswersAfterFinish = db.prepare('SELECT * FROM answers WHERE participant_id = ?').all(annaParticipantId);
  assert.strictEqual(annaAnswersAfterFinish.length, 3, 'Pontosan 3 végleges válasznak kell lennie dupla beadás után is');

  // Beadás utáni save-draft tiltása
  const draftAfterFinish = await apiRequest('POST', '/api/student/save-draft', {
    session_token: annaToken,
    question_id: q1.id,
    draft_answer: '5',
    base_version: 4
  }, { 'x-session-token': annaToken });
  assert.strictEqual(draftAfterFinish.status, 400);
  assert.strictEqual(draftAfterFinish.data.code, 'PARTICIPANT_ALREADY_FINISHED');

  // Mátrix beadás után (ON-03 második fele)
  const matrixAfter = await apiRequest('GET', `/api/admin/sessions/${sessionId}/matrix`, null, adminHeaders);
  assert.strictEqual((matrixAfter.data.drafts || []).filter((d) => d.participant_id === annaParticipantId).length, 0);
  assert.strictEqual((matrixAfter.data.answers || []).filter((a) => a.participant_id === annaParticipantId).length, 3);

  // Rollback-próba Béla diákján: 2 piszkozatnál a MÁSODIK beszúrás hibázik (részben megkezdett véglegesítés rollback!)
  const joinBela = await apiRequest('POST', '/api/student/join', {
    session_id: sessionId,
    student_id: students[1].id,
    student_name: students[1].student_name,
    pc_number: 2
  });
  assert.strictEqual(joinBela.status, 200);
  const belaToken = joinBela.data.token;
  const belaId = joinBela.data.participant.id;

  await apiRequest('POST', '/api/student/save-draft', {
    session_token: belaToken, question_id: q1.id, draft_answer: '4', base_version: 0
  }, { 'x-session-token': belaToken });
  await apiRequest('POST', '/api/student/save-draft', {
    session_token: belaToken, question_id: q2.id, draft_answer: 'Igaz', base_version: 0
  }, { 'x-session-token': belaToken });

  db.exec(`
    CREATE TRIGGER trg_test_fail_bela_insert
    BEFORE INSERT ON answers
    WHEN NEW.participant_id = ${belaId} AND NEW.question_id = ${q2.id}
    BEGIN
      SELECT RAISE(ABORT, 'SIMULATED_FINALIZE_FAILURE');
    END;
  `);

  let rollbackCaught = false;
  try {
    sessionRepo.finalizeOpenNavigationParticipant(belaId);
  } catch (err) {
    rollbackCaught = err.message.includes('SIMULATED_FINALIZE_FAILURE');
  }
  assert.strictEqual(rollbackCaught, true, 'A 2. beszúrásnál szimulált DB hibának kivételt kell dobnia és rollbackelnie kell');

  const belaAfterFail = db.prepare('SELECT is_finished FROM participants WHERE id = ?').get(belaId);
  const belaDraftsAfterFail = db.prepare('SELECT * FROM answer_drafts WHERE participant_id = ?').all(belaId);
  const belaAnswersAfterFail = db.prepare('SELECT * FROM answers WHERE participant_id = ?').all(belaId);
  assert.strictEqual(belaAfterFail.is_finished, 0, 'Sikertelen véglegesítés után is_finished maradjon 0');
  assert.strictEqual(belaDraftsAfterFail.length, 2, 'Sikertelen véglegesítés után mindkét piszkozatnak meg kell maradnia');
  assert.strictEqual(belaAnswersAfterFail.length, 0, 'Sikertelen véglegesítés után nem maradhat részleges (1 db) válasz');

  db.exec('DROP TRIGGER trg_test_fail_bela_insert;');
  sessionRepo.finalizeOpenNavigationParticipant(belaId);
  const belaAfterRetry = db.prepare('SELECT is_finished FROM participants WHERE id = ?').get(belaId);
  const belaAnswersAfterRetry = db.prepare('SELECT * FROM answers WHERE participant_id = ?').all(belaId);
  assert.strictEqual(belaAfterRetry.is_finished, 1, 'Újrapróbálás után véglegesednie kell');
  assert.strictEqual(belaAnswersAfterRetry.length, 2, 'Újrapróbálás után mindkét answers sornak létre kell jönnie');
  console.log('✓ ON-04 sikeres');

  // =========================================================================
  // ON-05: Beadás utáni tanári overrideAnswer aktív sessionnél, majd tiltása lezárás után
  // ON-06: Tanári finishSession be nem adott piszkozatokkal -> automatikus véglegesítés
  // =========================================================================
  console.log('--- ON-05 & ON-06: Tanári felülbírálás + session lezáráskori automatikus véglegesítés ---');
  // Csaba belép és csak piszkozatot ment (nem adja be)
  const joinCsaba = await apiRequest('POST', '/api/student/join', {
    session_id: sessionId,
    student_id: students[2].id,
    student_name: students[2].student_name,
    pc_number: 3
  });
  assert.strictEqual(joinCsaba.status, 200);
  const csabaToken = joinCsaba.data.token;
  const csabaId = joinCsaba.data.participant.id;

  await apiRequest('POST', '/api/student/save-draft', {
    session_token: csabaToken, question_id: q1.id, draft_answer: '4', base_version: 0
  }, { 'x-session-token': csabaToken });
  await apiRequest('POST', '/api/student/save-draft', {
    session_token: csabaToken, question_id: q3.id, draft_answer: 'Budapest', base_version: 0
  }, { 'x-session-token': csabaToken });

  // Anna hibás q3 válaszának tanári felülbírálása (ACTIVE sessionnél sikeres!)
  const annaWrongAnswer = annaAnswersAfterFinish.find((a) => Number(a.question_id) === Number(q3.id));
  assert.ok(annaWrongAnswer, 'Anna q3 válaszának léteznie kell');
  const overrideOk = await apiRequest('POST', `/api/admin/answers/${annaWrongAnswer.id}/override`, {
    eval_status: 'PARTIAL',
    custom_points: 1
  }, adminHeaders);
  assert.strictEqual(overrideOk.status, 200, `Aktív sessionnél a felülbírálásnak 200-at kell adnia: ${JSON.stringify(overrideOk.data)}`);

  // Tanári lezárás (ON-06)
  const finishSessRes = await apiRequest('POST', `/api/admin/sessions/${sessionId}/finish`, {}, adminHeaders);
  assert.strictEqual(finishSessRes.status, 200);

  // Csaba piszkozatai automatikusan véglegesedtek!
  const csabaRow = db.prepare('SELECT is_finished FROM participants WHERE id = ?').get(csabaId);
  const csabaAnswers = db.prepare('SELECT * FROM answers WHERE participant_id = ?').all(csabaId);
  const csabaDrafts = db.prepare('SELECT * FROM answer_drafts WHERE participant_id = ?').all(csabaId);
  assert.strictEqual(csabaRow.is_finished, 1, 'finishSession után Csaba is_finished = 1 kell legyen');
  assert.strictEqual(csabaAnswers.length, 2, 'Csaba 2 piszkozatának végleges válaszként be kell kerülnie');
  assert.strictEqual(csabaDrafts.length, 0, 'Csaba piszkozatainak törlődniük kell véglegesítés után');

  // Lezárás utáni overrideAnswer elutasítása (ON-05)
  const overrideAfterClose = await apiRequest('POST', `/api/admin/answers/${annaWrongAnswer.id}/override`, {
    eval_status: 'CORRECT'
  }, adminHeaders);
  assert.ok(overrideAfterClose.status === 400 || overrideAfterClose.status === 403, 'Lezárt sessionnél a felülbírálást el kell utasítani');
  console.log('✓ ON-05 és ON-06 sikeres');

  // =========================================================================
  // ON-07: Lejárt deadline_at -> save-draft COMMIT-olja a véglegesítést + 400 DEADLINE_EXCEEDED
  // ON-08: Kikapcsolt visszajelzés (show_feedback_on_end = 0) szigorú API-szűrése
  // =========================================================================
  console.log('--- ON-07 & ON-08: Lejárt határidő + kikapcsolt visszajelzés szigorú maszkolása ---');
  const startRes2 = await apiRequest('POST', '/api/admin/sessions/start', {
    quiz_id: quiz.id,
    subject_id: subjectId,
    grade_level: '5',
    mode: 'OPEN_NAVIGATION',
    shuffle_questions: false,
    shuffle_options: false,
    show_feedback_on_end: false,
    time_limit_min: 15
  }, adminHeaders);
  assert.strictEqual(startRes2.status, 200);
  const startedSession2 = startRes2.data.session || startRes2.data;
  const session2Id = startedSession2.id;

  // Dóra (ON-07: lejárat teszt)
  const joinDora = await apiRequest('POST', '/api/student/join', {
    session_id: session2Id,
    student_id: students[3].id,
    student_name: students[3].student_name,
    pc_number: 4
  });
  assert.strictEqual(joinDora.status, 200);
  const doraToken = joinDora.data.token;
  const doraId = joinDora.data.participant.id;

  await apiRequest('POST', '/api/student/save-draft', {
    session_token: doraToken, question_id: q1.id, draft_answer: '4', base_version: 0
  }, { 'x-session-token': doraToken });

  // Határidő visszatekerése a múltba
  db.prepare(`UPDATE participants SET deadline_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`).run(doraId);

  // 2.1 pont: lejárt OPEN_NAVIGATION résztvevőnél a régi submit-answer NE állíthassa is_finished = 1-re véglegesítés nélkül!
  const submitRejectExpired = await apiRequest('POST', '/api/student/submit-answer', {
    session_token: doraToken, question_id: q2.id, submitted_answer: 'Igaz', time_spent_sec: 1
  }, { 'x-session-token': doraToken });
  assert.strictEqual(submitRejectExpired.status, 400);
  assert.strictEqual(submitRejectExpired.data.code, 'INVALID_SESSION_MODE');
  const doraBeforeSaveDraft = db.prepare('SELECT is_finished FROM participants WHERE id = ?').get(doraId);
  assert.strictEqual(doraBeforeSaveDraft.is_finished, 0, 'A régi submit-answer nem módosíthatta Dóra is_finished állapotát');

  const expiredDraft = await apiRequest('POST', '/api/student/save-draft', {
    session_token: doraToken, question_id: q2.id, draft_answer: 'Igaz', base_version: 0
  }, { 'x-session-token': doraToken });
  assert.strictEqual(expiredDraft.status, 400);
  assert.strictEqual(expiredDraft.data.code, 'DEADLINE_EXCEEDED');
  assert.strictEqual(expiredDraft.data.autoFinalized, true);

  // Ellenőrzés: a tranzakció COMMIT-olt, Dóra korábbi q1 piszkozata megmaradt az answers-ben!
  const doraRow = db.prepare('SELECT is_finished FROM participants WHERE id = ?').get(doraId);
  const doraAnswers = db.prepare('SELECT * FROM answers WHERE participant_id = ?').all(doraId);
  const doraDrafts = db.prepare('SELECT * FROM answer_drafts WHERE participant_id = ?').all(doraId);
  assert.strictEqual(doraRow.is_finished, 1, 'Lejárat után Dóra is_finished = 1 kell legyen (COMMIT!)');
  assert.strictEqual(doraAnswers.length, 1, 'Dóra korábbi piszkozata nem veszhetett el rollback miatt!');
  assert.strictEqual(doraAnswers[0].submitted_answer, '4');
  assert.strictEqual(doraDrafts.length, 0);

  // ON-08: Dóra beadás UTÁNI session-data válasza show_feedback_on_end = 0 mellett
  const doraSummary = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': doraToken });
  assert.strictEqual(doraSummary.status, 200);
  assert.strictEqual(doraSummary.data.participant.is_finished, 1);
  assert.strictEqual(doraSummary.data.results, null, 'show_feedback_on_end = 0 esetén beadás után is results === null');
  assert.deepStrictEqual(doraSummary.data.answers, [], 'show_feedback_on_end = 0 esetén beadás után is answers === []');
  for (const q of doraSummary.data.quiz.questions) {
    assert.strictEqual(q.correct_answer, undefined, 'show_feedback_on_end = 0 esetén nincs correct_answer');
    assert.strictEqual(q.explanation, undefined, 'show_feedback_on_end = 0 esetén nincs explanation');
  }

  // ON-08: Dóra beadás UTÁNI join recovery és kivetítői adatnézet (3.1 pont)
  const doraRejoin = await apiRequest('POST', '/api/student/join', {
    session_id: session2Id,
    student_id: students[3].id,
    student_name: students[3].student_name,
    pc_number: 4,
    session_token: doraToken
  });
  assert.strictEqual(doraRejoin.status, 200);
  assert.deepStrictEqual(doraRejoin.data.answers, [], 'show_feedback_on_end = 0 esetén join recovery sem adhat vissza válaszszöveget');

  const projData = sessionRepo.getProjectorData(session2Id);
  assert.ok(projData, 'Kivetítői adatnézetnek léteznie kell');
  assert.deepStrictEqual(projData.answers, [], 'OPEN_NAVIGATION kivetítő nem adhat ki kérdésenkénti helyességet');
  assert.strictEqual(projData.totalMaxPoints, null, 'OPEN_NAVIGATION kivetítő nem adhat ki pontösszesítőt');
  for (const pp of projData.participants) {
    assert.strictEqual(pp.total_points, undefined, 'OPEN_NAVIGATION kivetítő nem adhat ki diákpontszámot');
  }

  // Elemér aktív belépés + session-data show_feedback_on_end = 0 mellett
  const joinElemer = await apiRequest('POST', '/api/student/join', {
    session_id: session2Id,
    student_id: students[4].id,
    student_name: students[4].student_name,
    pc_number: 5
  });
  assert.strictEqual(joinElemer.status, 200);
  assert.ok(joinElemer.data.results === undefined || joinElemer.data.results === null);
  assert.deepStrictEqual(joinElemer.data.answers || [], []);

  await apiRequest('POST', `/api/admin/sessions/${session2Id}/finish`, {}, adminHeaders);
  console.log('✓ ON-07 és ON-08 sikeres');

  // =========================================================================
  // ON-09: Valódi v1.33.0 -> v1.37.0 sémamigrációs próba élő adatokkal és triggerekkel
  // =========================================================================
  console.log('--- ON-09: Valódi v1.33.0 adatbázis migrációja v1.37.0-ra ---');
  const legacyDbPath = path.join(isolatedDir, 'legacy_v13300.db');
  const legacyDb = new Database(legacyDbPath);
  legacyDb.pragma('foreign_keys = ON');
  legacyDb.exec(`
    PRAGMA application_id = 1330335571;
    PRAGMA user_version = 13300;

    CREATE TABLE subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_default BOOLEAN NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_name TEXT NOT NULL,
      student_name TEXT NOT NULL,
      UNIQUE(class_name, student_name)
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      subject_grade TEXT NOT NULL DEFAULT '5',
      time_limit_min INTEGER DEFAULT 15,
      total_points REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT
    );
    CREATE TABLE questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      question_type TEXT NOT NULL CHECK(question_type IN ('ABCD', 'TF', 'SHORT')),
      question_text TEXT NOT NULL,
      instructions TEXT,
      image_path TEXT,
      options_json TEXT,
      correct_answer TEXT NOT NULL,
      explanation TEXT,
      points REAL DEFAULT 1.0,
      order_index INTEGER DEFAULT 0,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      grade_level TEXT NOT NULL,
      class_name TEXT DEFAULT '',
      mode TEXT NOT NULL CHECK(mode IN ('STUDENT_PACED', 'SPACE_RACE', 'TEACHER_PACED')),
      status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'FINISHED')) DEFAULT 'ACTIVE',
      is_race_started INTEGER NOT NULL DEFAULT 0,
      shuffle_questions BOOLEAN DEFAULT 0,
      shuffle_options BOOLEAN DEFAULT 0,
      show_feedback_on_end BOOLEAN DEFAULT 1,
      time_limit_min INTEGER DEFAULT 15,
      grade_thresholds_json TEXT NOT NULL,
      max_points REAL DEFAULT NULL,
      quiz_snapshot_json TEXT,
      current_question_index INTEGER NOT NULL DEFAULT 0,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME DEFAULT NULL,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE RESTRICT,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT
    );
    CREATE TABLE participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      student_id INTEGER,
      student_name TEXT NOT NULL,
      pc_number INTEGER,
      team_color TEXT,
      session_token TEXT UNIQUE NOT NULL,
      deadline_at DATETIME,
      focus_lost_count INTEGER DEFAULT 0,
      is_finished BOOLEAN DEFAULT 0,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE TABLE answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      participant_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      submitted_answer TEXT NOT NULL,
      is_correct BOOLEAN NOT NULL,
      points_earned REAL NOT NULL,
      is_overridden BOOLEAN DEFAULT 0,
      time_spent_sec INTEGER DEFAULT 0,
      answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
      UNIQUE(participant_id, question_id)
    );
    CREATE TRIGGER trg_validate_answer_question
    BEFORE INSERT ON answers
    BEGIN
      SELECT CASE
        WHEN (SELECT status FROM sessions WHERE id = NEW.session_id) != 'ACTIVE'
        THEN RAISE(ABORT, 'A munkamenet már lezárult')
      END;
    END;

    INSERT INTO subjects (id, name, is_default) VALUES (1, 'Digitális kultúra', 1);
    INSERT INTO quizzes (id, subject_id, title, subject_grade, total_points) VALUES (1, 1, 'Régi dolgozat', '5', 1);
    INSERT INTO questions (id, quiz_id, question_type, question_text, correct_answer, points) VALUES (1, 1, 'TF', 'Régi kérdés', 'Igaz', 1);
    INSERT INTO sessions (id, quiz_id, subject_id, grade_level, mode, status, grade_thresholds_json)
      VALUES (1, 1, 1, '5', 'STUDENT_PACED', 'ACTIVE', '{"2":30,"3":55,"4":75,"5":90}');
    INSERT INTO sessions (id, quiz_id, subject_id, grade_level, mode, status, grade_thresholds_json, ended_at)
      VALUES (9, 1, 1, '6', 'STUDENT_PACED', 'FINISHED', '{"2":30,"3":55,"4":75,"5":90}', CURRENT_TIMESTAMP);
    DELETE FROM sessions WHERE id = 9;
    INSERT INTO participants (id, session_id, student_name, session_token) VALUES (1, 1, 'Régi Diák', 'legacy-tok-1');
    INSERT INTO answers (id, session_id, participant_id, question_id, submitted_answer, is_correct, points_earned)
      VALUES (1, 1, 1, 1, 'Igaz', 1, 1);
  `);

  // Migráció futtatása a valódi migrateDatabase() függvénnyel
  db.migrateDatabase(legacyDb);

  assert.strictEqual(legacyDb.pragma('user_version', { simple: true }), 13700, 'user_version-nek 13700-ra kell frissülnie');
  assert.strictEqual(legacyDb.pragma('foreign_keys', { simple: true }), 1, 'foreign_keys-nek vissza kell kapcsolódnia');
  const fkErrors = legacyDb.pragma('foreign_key_check');
  assert.strictEqual(fkErrors.length, 0, `Foreign key hibák migráció után: ${JSON.stringify(fkErrors)}`);

  const legacySess = legacyDb.prepare('SELECT * FROM sessions WHERE id = 1').get();
  const legacyPart = legacyDb.prepare('SELECT * FROM participants WHERE id = 1').get();
  const legacyAns = legacyDb.prepare('SELECT * FROM answers WHERE id = 1').get();
  assert.ok(legacySess && legacyPart && legacyAns, 'A régi adatoknak hiánytalanul meg kell maradniuk');

  const draftTbl = legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='answer_drafts'").get();
  assert.ok(draftTbl, 'Az answer_drafts táblának létre kell jönnie');

  const triggerRow = legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_validate_answer_question'").get();
  assert.ok(triggerRow, 'A trg_validate_answer_question triggernek vissza kell épülnie');

  // Új OPEN_NAVIGATION session beszúrható és a törölt ID=9 miatt >= 10-es azonosítót kap (sqlite_sequence megőrzése!)
  const insOpenNav = legacyDb.prepare(`
    INSERT INTO sessions (quiz_id, subject_id, grade_level, mode, status, grade_thresholds_json)
    VALUES (1, 1, '6', 'OPEN_NAVIGATION', 'ACTIVE', '{"2":30,"3":55,"4":75,"5":90}')
  `).run();
  assert.ok(insOpenNav.lastInsertRowid >= 10, `A törölt ID=9 nem osztható ki újra (kapott ID: ${insOpenNav.lastInsertRowid})`);

  legacyDb.close();

  // ON-09b: Kényszerített migrációs hiba rollback-próbája (régi védőtriggerek és user_version érintetlenek!)
  const legacyFailPath = path.join(isolatedDir, 'legacy_fail_v13300.db');
  const legacyFailDb = new Database(legacyFailPath);
  legacyFailDb.pragma('foreign_keys = OFF');
  legacyFailDb.exec(`
    PRAGMA application_id = 1330335571;
    PRAGMA user_version = 13300;
    CREATE TABLE subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, is_default BOOLEAN NOT NULL DEFAULT 0);
    CREATE TABLE students (id INTEGER PRIMARY KEY AUTOINCREMENT, class_name TEXT NOT NULL, student_name TEXT NOT NULL);
    CREATE TABLE quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, title TEXT NOT NULL, subject_grade TEXT NOT NULL DEFAULT '5');
    CREATE TABLE questions (id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL, question_type TEXT NOT NULL, question_text TEXT NOT NULL, correct_answer TEXT NOT NULL, points REAL DEFAULT 1.0);
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL, subject_id INTEGER NOT NULL, grade_level TEXT NOT NULL,
      class_name TEXT DEFAULT '', mode TEXT NOT NULL CHECK(mode IN ('STUDENT_PACED', 'SPACE_RACE', 'TEACHER_PACED')),
      status TEXT NOT NULL DEFAULT 'ACTIVE', grade_thresholds_json TEXT NOT NULL, started_at DATETIME DEFAULT CURRENT_TIMESTAMP, ended_at DATETIME DEFAULT NULL
    );
    CREATE TABLE participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, student_id INTEGER, student_name TEXT NOT NULL,
      session_token TEXT UNIQUE NOT NULL, FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE TABLE answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, question_id INTEGER NOT NULL,
      submitted_answer TEXT NOT NULL, is_correct BOOLEAN NOT NULL, points_earned REAL NOT NULL
    );
    CREATE TRIGGER trg_prevent_finished_participant_update BEFORE UPDATE ON participants BEGIN SELECT 1; END;
    CREATE TRIGGER trg_prevent_finished_session_update BEFORE UPDATE ON sessions BEGIN SELECT 1; END;
    CREATE TRIGGER trg_validate_answer_question BEFORE INSERT ON answers BEGIN SELECT 1; END;
    CREATE TRIGGER trg_validate_answer_points_limit BEFORE INSERT ON answers BEGIN SELECT 1; END;
    CREATE TRIGGER trg_validate_answer_points_limit_update BEFORE UPDATE ON answers BEGIN SELECT 1; END;

    INSERT INTO subjects (id, name, is_default) VALUES (1, 'Digitális kultúra', 1);
    INSERT INTO quizzes (id, subject_id, title, subject_grade) VALUES (1, 1, 'Teszt', '5');
    INSERT INTO sessions (id, quiz_id, subject_id, grade_level, mode, status, grade_thresholds_json)
      VALUES (1, 1, 1, '5', 'STUDENT_PACED', 'ACTIVE', '{"2":30,"3":55,"4":75,"5":90}');
    -- Szándékosan hibás FK a foreign_key_check kényszerített hibájához
    INSERT INTO participants (id, session_id, student_name, session_token) VALUES (1, 999, 'Árva Diák', 'orphan-tok');
  `);
  legacyFailDb.pragma('foreign_keys = ON');

  let migFailed = false;
  try {
    db.migrateDatabase(legacyFailDb);
  } catch {
    migFailed = true;
  }
  assert.strictEqual(migFailed, true, 'Hibás FK esetén a migrációnak kivételt kell dobnia');
  assert.strictEqual(legacyFailDb.pragma('user_version', { simple: true }), 13300, 'Rollback után a user_version maradjon 13300');
  assert.strictEqual(legacyFailDb.pragma('foreign_keys', { simple: true }), 1, 'Rollback után a foreign_keys vissza kell kapcsolódjon');
  const remainingTrgs = legacyFailDb.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map(r => r.name);
  for (const expectedTrg of [
    'trg_prevent_finished_participant_update',
    'trg_prevent_finished_session_update',
    'trg_validate_answer_question',
    'trg_validate_answer_points_limit',
    'trg_validate_answer_points_limit_update'
  ]) {
    assert.ok(remainingTrgs.includes(expectedTrg), `Rollback után a(z) ${expectedTrg} triggernek meg kell maradnia!`);
  }
  legacyFailDb.close();
  console.log('✓ ON-09 (migráció + sqlite_sequence + kényszerített rollback) sikeres');

  // =========================================================================
  // ON-10: Veszteségmentes 530 karakteres / szóközös ABCD opció + SHORT 499/500/501 UTF-16 próba
  // ON-11: Explicit UTC ISO 8601 nyugtaidőbélyeg (téli és nyári időszámítás)
  // =========================================================================
  console.log('--- ON-10 & ON-11: Veszteségmentes ABCD opciók, SHORT határok és UTC nyugtaidőbélyeg ---');
  const longOption = 'Hosszú feleletválasztós opció – ' + 'Árvíztűrő tükörfúrógép '.repeat(22) + 'VÉGE';
  assert.ok(longOption.length > 520, `A tesztopciónak > 520 karakternek kell lennie (${longOption.length})`);
  const paddedOption = '  Szélső szóközös ékezetes opció  ';

  const quizEdge = createTestQuiz(subjectId, 'Open Navigation Peremesetek', [
    {
      question_type: 'ABCD',
      question_text: 'Melyik a hosszú opció?',
      options: ['Rövid', longOption, paddedOption, 'Negyedik'],
      correct_answer: longOption,
      points: 2
    },
    {
      question_type: 'ABCD',
      question_text: 'Melyik a szóközös opció?',
      options: ['A', paddedOption, 'C', 'D'],
      correct_answer: paddedOption,
      points: 1
    },
    {
      question_type: 'SHORT',
      question_text: 'Rövid szöveg hosszkorlát próba',
      correct_answer: 'OK',
      points: 1
    }
  ]);

  const startEdge = await apiRequest('POST', '/api/admin/sessions/start', {
    quiz_id: quizEdge.id,
    subject_id: subjectId,
    grade_level: '6',
    mode: 'OPEN_NAVIGATION',
    shuffle_questions: false,
    shuffle_options: true,
    show_feedback_on_end: true,
    time_limit_min: 15
  }, adminHeaders);
  assert.strictEqual(startEdge.status, 200);
  const edgeSessionId = (startEdge.data.session || startEdge.data).id;

  const edgeStudent = ensureStudents('6.b', ['Peremeset Péter'])[0];
  const joinEdge = await apiRequest('POST', '/api/student/join', {
    session_id: edgeSessionId,
    student_id: edgeStudent.id,
    student_name: edgeStudent.student_name,
    pc_number: 6
  });
  assert.strictEqual(joinEdge.status, 200);
  const edgeToken = joinEdge.data.token;
  const edgePartId = joinEdge.data.participant.id;

  const eq1 = quizEdge.questions[0];
  const eq2 = quizEdge.questions[1];
  const eq3 = quizEdge.questions[2];

  // 530+ karakteres ABCD opció veszteségmentes mentése
  const saveLong = await apiRequest('POST', '/api/student/save-draft', {
    session_token: edgeToken, question_id: eq1.id, draft_answer: longOption, base_version: 0
  }, { 'x-session-token': edgeToken });
  assert.strictEqual(saveLong.status, 200, `530+ karakteres ABCD mentésének sikerülnie kell: ${JSON.stringify(saveLong.data)}`);
  assert.strictEqual(saveLong.data.draft_answer, longOption);

  // Szélső szóközös ABCD opció veszteségmentes mentése
  const savePadded = await apiRequest('POST', '/api/student/save-draft', {
    session_token: edgeToken, question_id: eq2.id, draft_answer: paddedOption, base_version: 0
  }, { 'x-session-token': edgeToken });
  assert.strictEqual(savePadded.status, 200, `Szélső szóközös ABCD mentésének sikerülnie kell: ${JSON.stringify(savePadded.data)}`);
  assert.strictEqual(savePadded.data.draft_answer, paddedOption);

  // SHORT 499, 500 (több kódegységes emoji 🚀 = 2 UTF-16 kódegység!) és 501 próba
  const s499 = 'x'.repeat(499);
  const r499 = await apiRequest('POST', '/api/student/save-draft', {
    session_token: edgeToken, question_id: eq3.id, draft_answer: s499, base_version: 0
  }, { 'x-session-token': edgeToken });
  assert.strictEqual(r499.status, 200);
  assert.strictEqual(r499.data.version, 1);

  const s500 = 'x'.repeat(498) + '🚀'; // 498 + 2 = 500 UTF-16 kódegység
  assert.strictEqual(s500.length, 500);
  const r500 = await apiRequest('POST', '/api/student/save-draft', {
    session_token: edgeToken, question_id: eq3.id, draft_answer: s500, base_version: 1
  }, { 'x-session-token': edgeToken });
  assert.strictEqual(r500.status, 200);
  assert.strictEqual(r500.data.version, 2);

  const s501 = 'x'.repeat(499) + '🚀'; // 499 + 2 = 501 UTF-16 kódegység -> 400!
  assert.strictEqual(s501.length, 501);
  const r501 = await apiRequest('POST', '/api/student/save-draft', {
    session_token: edgeToken, question_id: eq3.id, draft_answer: s501, base_version: 2
  }, { 'x-session-token': edgeToken });
  assert.strictEqual(r501.status, 400);
  assert.strictEqual(r501.data.code, 'DRAFT_ANSWER_TOO_LONG');

  // A 400-as elutasítás nem növelte a verziót (maradt 2), és az ürítés működik
  const rClearEdge = await apiRequest('POST', '/api/student/save-draft', {
    session_token: edgeToken, question_id: eq3.id, draft_answer: '', base_version: 2
  }, { 'x-session-token': edgeToken });
  assert.strictEqual(rClearEdge.status, 200);
  assert.strictEqual(rClearEdge.data.version, 3);
  assert.strictEqual(rClearEdge.data.isEmpty, true);

  // Véglegesítés és explicit UTC ISO 8601 nyugtaidőbélyeg ellenőrzése (ON-11)
  const finEdge = await apiRequest('POST', '/api/student/finish', { session_token: edgeToken }, { 'x-session-token': edgeToken });
  assert.strictEqual(finEdge.status, 200);
  const isoUtcRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  assert.ok(isoUtcRegex.test(finEdge.data.receipt.finished_at), `receipt.finished_at nem UTC ISO: ${finEdge.data.receipt.finished_at}`);

  const sdEdge = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': edgeToken });
  assert.strictEqual(sdEdge.status, 200);
  assert.strictEqual(sdEdge.data.participant.finished_at, finEdge.data.receipt.finished_at, 'session-data és receipt finished_at egyezzen');
  assert.strictEqual(sdEdge.data.results.total_points, 3, 'A 530+ karakteres (2p) és a szóközös (1p) ABCD helyes pontot kapjon');

  // Végleges answers.submitted_answer pontos (szélső szóközöket és teljes hosszt megőrző) ellenőrzése (5. fejezet)
  const edgeFinalAnswers = db.prepare('SELECT question_id, submitted_answer FROM answers WHERE participant_id = ?').all(edgePartId);
  assert.strictEqual(edgeFinalAnswers.length, 2, 'Az ürített SHORT kérdés nem hozhat létre végleges sort');
  const finalLongRow = edgeFinalAnswers.find(a => Number(a.question_id) === Number(eq1.id));
  const finalPaddedRow = edgeFinalAnswers.find(a => Number(a.question_id) === Number(eq2.id));
  assert.strictEqual(finalLongRow.submitted_answer, longOption, 'A végleges hosszú ABCD szövegnek pontosan egyeznie kell');
  assert.strictEqual(finalPaddedRow.submitted_answer, paddedOption, 'A végleges szélső szóközös ABCD szöveg nem veszítheti el a szélső szóközöket');

  // Téli és nyári SQLite UTC időbélyeg ellenőrzése Europe/Budapest időzónában
  db.prepare(`UPDATE participants SET finished_at = '2026-01-15 10:00:00' WHERE id = ?`).run(edgePartId);
  const sdWinter = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': edgeToken });
  assert.strictEqual(sdWinter.data.participant.finished_at, '2026-01-15T10:00:00.000Z');
  const winterBp = new Date(sdWinter.data.participant.finished_at).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  assert.strictEqual(winterBp, '11:00:00', `Téli Budapest idő 11:00:00 kell legyen (kapott: ${winterBp})`);

  db.prepare(`UPDATE participants SET finished_at = '2026-07-15 10:00:00' WHERE id = ?`).run(edgePartId);
  const sdSummer = await apiRequest('GET', '/api/student/session-data', null, { 'x-session-token': edgeToken });
  assert.strictEqual(sdSummer.data.participant.finished_at, '2026-07-15T10:00:00.000Z');
  const summerBp = new Date(sdSummer.data.participant.finished_at).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  assert.strictEqual(summerBp, '12:00:00', `Nyári Budapest idő 12:00:00 kell legyen (kapott: ${summerBp})`);

  await apiRequest('POST', `/api/admin/sessions/${edgeSessionId}/finish`, {}, adminHeaders);
  console.log('✓ ON-10 és ON-11 sikeres');

  console.log('\n================================================================');
  console.log('🎉 MINDEN OPEN NAVIGATION TESZT (ON-01..ON-11) SIKERES! 🎉');
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
    console.error('\n❌ HIBA az Open Navigation tesztfutás során:', err);
    server.close();
    try { db.close(); } catch {}
    try { fs.rmSync(isolatedDir, { recursive: true, force: true }); } catch {}
    process.exit(1);
  });
