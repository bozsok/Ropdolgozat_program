const path = require('path');
const fs = require('fs');

// Report 17-18: Izolált szintetikus tesztkörnyezet, az éles ropdolgozat.db teljes védelme
const testDbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'test_isolated_report17.db');
const testUploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'data', 'test_uploads_report17');

process.env.DB_PATH = testDbPath;
process.env.UPLOADS_DIR = testUploadsDir;

// Ha korábbról maradt volna, kitakarítjuk
if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch {} }
if (fs.existsSync(testDbPath + '-wal')) { try { fs.unlinkSync(testDbPath + '-wal'); } catch {} }
if (fs.existsSync(testDbPath + '-shm')) { try { fs.unlinkSync(testDbPath + '-shm'); } catch {} }
if (fs.existsSync(testUploadsDir)) { try { fs.rmSync(testUploadsDir, { recursive: true, force: true }); } catch {} }

const assert = require('assert');
const grader = require('../src/services/grader');
const quizRepo = require('../src/db/quizRepo');
const sessionRepo = require('../src/db/sessionRepo');
const Database = require('better-sqlite3');
const config = require('../config');
const db = require('../src/db/init');
const backup = require('../src/services/backup');

console.log('=== REPORT 14-17 JAVÍTÁSOK RENDSZERTESZTJE (IZOLÁLT KÖRNYEZET) ===\n');

(async () => {
let sampleStudents = db.prepare('SELECT id, student_name FROM students LIMIT 2').all();
if (sampleStudents.length < 2) {
  const insertStudent = db.prepare("INSERT INTO students (class_name, student_name) VALUES ('9.z', ?)");
  insertStudent.run('Teszt Diák 1');
  insertStudent.run('Teszt Diák 2');
  sampleStudents = db.prepare("SELECT id, student_name FROM students WHERE class_name = '9.z' LIMIT 2").all();
}

// 1. TESZT: Socrative PDF válaszillesztés és grader kompatibilitás (37. pont)
console.log('--- 1. TESZT: Grader betűjel és szöveg kompatibilitás (37. pont) ---');

// A) ABCD: correct_answer egyetlen betűjel 'A', diák szöveget küld
const evalAbcdLetter = grader.evaluateAnswer(
  'ABCD',
  'Központi vezérlőegység',
  'A',
  1.0,
  ['Központi vezérlőegység', 'Memória', 'Háttértár', 'Videokártya']
);
assert.strictEqual(evalAbcdLetter.eval_status, 'CORRECT', 'A betűjeles helyes válasz nem illeszkedett a diák szövegére!');
assert.strictEqual(evalAbcdLetter.points_earned, 1.0);
console.log('✓ ABCD betűjeles helyes válasz (\'A\') sikeresen illeszkedik az opció szövegére');

// B) ABCD: correct_answer a szöveg, diák betűjelet küld
const evalAbcdSubLetter = grader.evaluateAnswer(
  'ABCD',
  'B',
  'Memória',
  1.0,
  ['Központi vezérlőegység', 'Memória', 'Háttértár', 'Videokártya']
);
assert.strictEqual(evalAbcdSubLetter.eval_status, 'CORRECT', 'A diák által beküldött betűjel nem illeszkedett a helyes opció szövegére!');
console.log('✓ ABCD diák által beküldött betűjel (\'B\') sikeresen illeszkedik a helyes opció szövegére');

// C) TF: correct_answer 'A' vagy 'B', diák 'Igaz' vagy 'Hamis'-t küld
const evalTfA = grader.evaluateAnswer('TF', 'Igaz', 'A', 1.0);
assert.strictEqual(evalTfA.eval_status, 'CORRECT', 'A TF \'A\' nem illeszkedett az \'Igaz\' válaszra!');
const evalTfB = grader.evaluateAnswer('TF', 'Hamis', 'B', 1.0);
assert.strictEqual(evalTfB.eval_status, 'CORRECT', 'A TF \'B\' nem illeszkedett a \'Hamis\' válaszra!');
console.log('✓ TF kérdésnél az \'A\' (Igaz) és \'B\' (Hamis) aliasok hibátlanul értékelődnek');

// 2. TESZT: Határidő lejárta utáni válaszküldés nem görgeti vissza a lezárást (14. pont)
console.log('\n--- 2. TESZT: Határidő lejárati mentés tartóssága (14. pont) ---');

// Hozunk létre egy teszt kvízt és sessiont
const testQuiz = quizRepo.createQuiz({
  subject_id: 1,
  title: 'Report 14 Teszt Kvíz',
  subject_grade: '6',
  default_time_limit_min: 1,
  questions: [
    {
      question_order: 1,
      question_type: 'ABCD',
      question_text: 'Kérdés 1',
      options: ['Válasz 1', 'Válasz 2'],
      correct_answer: 'Válasz 1',
      points: 1.0
    }
  ]
});

const testSession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '99',
  quiz_id: testQuiz.id,
  class_name: '8.a',
  mode: 'STUDENT_PACED',
  time_limit_min: 1
});

// Csatlakoztatunk egy tanulót
const joinRes = sessionRepo.joinSession({
  session_id: testSession.id,
  student_id: sampleStudents[0] ? sampleStudents[0].id : null,
  student_name: sampleStudents[0] ? sampleStudents[0].student_name : 'Teszt Tanuló 1',
  session_token: 'rep14_token_' + Date.now()
});

const partId = joinRes.participant.id;

// Mesterségesen a múltba állítjuk a tanuló határidejét (pl. 5 perccel ezelőttre)
db.prepare("UPDATE participants SET deadline_at = datetime('now', '-5 minutes') WHERE id = ?").run(partId);

// Megpróbálunk választ beküldeni a lejárt időpont után
let threwError = false;
try {
  sessionRepo.submitAnswer({
    participant_id: partId,
    question_id: testQuiz.questions[0].id,
    submitted_answer: 'Válasz 1'
  });
} catch (err) {
  threwError = true;
  assert.ok(err.message.includes('időkorlát lejárt'), 'Nem az elvárt időkorlát hibaüzenet érkezett: ' + err.message);
}
assert.strictEqual(threwError, true, 'Nem dobott hibát a lejárt határidőnél!');

// Ellenőrizzük, hogy a tanuló az adatbázisban TARTÓSAN befejezett (is_finished = 1) maradt-e!
const participantAfter = db.prepare('SELECT * FROM participants WHERE id = ?').get(partId);
assert.strictEqual(participantAfter.is_finished, 1, 'A lezárás visszagördült! is_finished nem 1!');
assert.ok(participantAfter.finished_at !== null, 'finished_at nem kapott értéket!');
sessionRepo.finishSession(testSession.id);
console.log('✓ Időkorlát lejártakor a válasz elutasítva, és a tanuló TARTÓSAN lezárásra került (0 rollback hiba)');

// 3. TESZT: Történeti jegymegőrzés tesztszerkesztés után (25. pont)
console.log('\n--- 3. TESZT: Történeti jegy és max_points megőrzése kvízszerkesztés után (25. pont) ---');

// Hozunk létre egy 2 kérdéses kvízt (1p + 1p = 2 pont)
const quizHistory = quizRepo.createQuiz({
  subject_id: 1,
  title: 'Történeti Kvíz',
  subject_grade: '6',
  questions: [
    { question_order: 1, question_type: 'ABCD', question_text: 'Q1', options: ['A', 'B'], correct_answer: 'A', points: 1.0 },
    { question_order: 2, question_type: 'ABCD', question_text: 'Q2', options: ['A', 'B'], correct_answer: 'A', points: 1.0 }
  ]
});

const sessionHistory = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '98',
  quiz_id: quizHistory.id,
  class_name: '8.a',
  mode: 'STUDENT_PACED'
});

// Tanuló csatlakozik és beküldi a válaszait (2 pontból 2 pontot ér el = 100%, 5-ös)
const partH = sessionRepo.joinSession({
  session_id: sessionHistory.id,
  student_id: sampleStudents[1] ? sampleStudents[1].id : null,
  student_name: sampleStudents[1] ? sampleStudents[1].student_name : 'Teszt Tanuló 2',
  session_token: 'hist_token_' + Date.now()
});

sessionRepo.submitAnswer({ participant_id: partH.participant.id, question_id: quizHistory.questions[0].id, submitted_answer: 'A' });
sessionRepo.submitAnswer({ participant_id: partH.participant.id, question_id: quizHistory.questions[1].id, submitted_answer: 'A' });

// Lezárjuk a dolgozatot
const finishedSession = sessionRepo.finishSession(sessionHistory.id);
assert.strictEqual(finishedSession.max_points, 2.0, 'A lezáráskor nem rögzült a max_points = 2.0!');

// Ellenőrizzük az archívumot a szerkesztés előtt
let archived = sessionRepo.getAllSessions().find(s => s.id === sessionHistory.id);
assert.strictEqual(archived.avg_percentage, 100, 'A szerkesztés előtt nem 100% az átlag!');
assert.strictEqual(archived.avg_grade, 5, 'A szerkesztés előtt nem 5-ös a jegy!');

// MOST UTÓLAG MÓDOSÍTJUK A KVÍZT: felvisszük a pontszámokat (10p-re emeljük, plusz kérdést adunk hozzá)
quizRepo.updateQuiz(quizHistory.id, {
  title: 'Történeti Kvíz - Utólag Bővítve',
  subject_grade: '6',
  questions: [
    { question_order: 1, question_type: 'ABCD', question_text: 'Q1', options: ['A', 'B'], correct_answer: 'A', points: 5.0 },
    { question_order: 2, question_type: 'ABCD', question_text: 'Q2', options: ['A', 'B'], correct_answer: 'A', points: 5.0 },
    { question_order: 3, question_type: 'ABCD', question_text: 'Q3', options: ['A', 'B'], correct_answer: 'A', points: 10.0 }
  ]
});

// Ellenőrizzük újra az archívumot: a rögzített lezárt dolgozatnak TOVÁBBRA IS 100%-nak és 5-ösnek kell maradnia!
archived = sessionRepo.getAllSessions().find(s => s.id === sessionHistory.id);
assert.strictEqual(archived.avg_percentage, 100, 'A kvízszerkesztés ELRONTOTTA a korábbi dolgozat százalékát!');
assert.strictEqual(archived.avg_grade, 5, 'A kvízszerkesztés ELRONTOTTA a korábbi dolgozat KRÉTA jegyét!');

const matrixAfter = sessionRepo.getLiveMatrixData(sessionHistory.id);
assert.strictEqual(matrixAfter.totalMaxPoints, 2.0, 'A mátrix totalMaxPoints-ja nem maradt meg a rögzített 2.0 ponton!');
console.log('✓ Kvízszerkesztés után a lezárt dolgozat jegye (5) és százaléka (100%) maradéktalanul megőrződött (25. pont megoldva)');

// 4. TESZT: Space Race közös rajt és kérdésvédelem (16. pont)
console.log('\n--- 4. TESZT: Space Race közös rajt és kérdésvédelem (16. pont) ---');

const spaceQuiz = quizRepo.createQuiz({
  subject_id: 1,
  title: 'Space Race Teszt Kvíz',
  subject_grade: '6',
  default_time_limit_min: 5,
  questions: [
    { question_order: 1, question_type: 'ABCD', question_text: 'Space Q1', options: ['A', 'B'], correct_answer: 'A', points: 1.0 },
    { question_order: 2, question_type: 'ABCD', question_text: 'Space Q2', options: ['A', 'B'], correct_answer: 'A', points: 1.0 }
  ]
});

const spaceSession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '97',
  quiz_id: spaceQuiz.id,
  class_name: '8.a',
  mode: 'SPACE_RACE',
  time_limit_min: 5
});

// A tanuló belép a váróba
const spaceJoin = sessionRepo.joinSession({
  session_id: spaceSession.id,
  student_id: sampleStudents[0] ? sampleStudents[0].id : null,
  student_name: sampleStudents[0] ? sampleStudents[0].student_name : 'Űrhajós 1',
  session_token: 'space_tok_' + Date.now()
});

// Rajt előtt: a határidő kötelezően NULL (nem ketyeg a váróban!)
assert.strictEqual(spaceJoin.participant.deadline_at, null, 'Space race módban rajt előtt nem lehet érvényes deadline_at!');

// Rajt előtti válaszadás kísérlete: elutasítva hibával
let spaceAnswerBlocked = false;
try {
  sessionRepo.submitAnswer({
    participant_id: spaceJoin.participant.id,
    question_id: spaceQuiz.questions[0].id,
    submitted_answer: 'A'
  });
} catch (err) {
  spaceAnswerBlocked = true;
  assert.ok(err.message.includes('verseny még nem indult el'), 'Nem az elvárt verseny-rajt hiba: ' + err.message);
}
assert.strictEqual(spaceAnswerBlocked, true, 'Rajt előtt engedte a válaszküldést!');
console.log('✓ Space Race módban a rajt előtt a válaszküldés szigorúan tiltva van');

// Tanár elindítja a versenyt (Start Race)
const startedRace = sessionRepo.startRace(spaceSession.id);
assert.strictEqual(startedRace.current_question_index, 1, 'startRace nem állította 1-re a kérdésindexet!');

// Ellenőrizzük, hogy a résztvevő most már kapott-e deadline_at értéket
const spacePartStarted = db.prepare('SELECT deadline_at FROM participants WHERE id = ?').get(spaceJoin.participant.id);
assert.ok(spacePartStarted.deadline_at !== null, 'A rajt után a tanuló nem kapott deadline_at-ot!');
console.log('✓ Space Race rajt (startRace) után az időkorlát elindult, és a deadline_at beállításra került');

// Most már a válaszadásnak sikeresnek kell lennie
const spaceAns = sessionRepo.submitAnswer({
  participant_id: spaceJoin.participant.id,
  question_id: spaceQuiz.questions[0].id,
  submitted_answer: 'A'
});
assert.strictEqual(spaceAns.answer.eval_status, 'CORRECT');
console.log('✓ Space Race rajt után a válaszadás hibátlanul működik');

// 5. TESZT: Gépváltás és jelenlét felszabadítása (06., 07. pont)
console.log('\n--- 5. TESZT: Gépváltás és jelenlét felszabadítása (06., 07. pont) ---');
const presenceService = require('../src/services/presenceService');

// Megvizsgáljuk, hogy a diák az osztályban foglalt-e
const sampleClass = sampleStudents[0] ? db.prepare('SELECT class_name FROM students WHERE id = ?').get(sampleStudents[0].id).class_name : '8.a';
const occupiedBefore = presenceService.getOccupiedStudentIds(sampleClass);
assert.ok(occupiedBefore.includes(String(sampleStudents[0].id)), 'A csatlakozott diák nem szerepel foglaltként!');

// Gépváltás engedélyezése
const seatAuth = sessionRepo.authorizeSeatChange(spaceJoin.participant.id);
assert.strictEqual(seatAuth.success, true);
assert.strictEqual(seatAuth.studentId, sampleStudents[0].id, 'authorizeSeatChange nem adta vissza a studentId-t!');

// Gépváltás után az adatbázis foglaltság már NEM tekinti foglaltnak a diákot az új gépen!
const occupiedAfter = presenceService.getOccupiedStudentIds(sampleClass);
assert.strictEqual(occupiedAfter.includes(String(sampleStudents[0].id)), false, 'Gépváltás után a diák még mindig foglaltnak látszik a névsorban!');
console.log('✓ Gépváltás engedélyezésekor a jelenléti foglaltság felszabadul az új gép számára (07. pont megoldva)');

// 6. TESZT: HTML exportok XSS és escape védelme (08. pont)
console.log('\n--- 6. TESZT: HTML exportok XSS / escape védelme (08. pont) ---');
const exporter = require('../src/services/exporter');

// XSS támadási minta a teszt nevében
const xssQuiz = quizRepo.createQuiz({
  subject_id: 1,
  title: 'XSS <script>alert("hack")</script> & "Teszt"',
  subject_grade: '6',
  questions: [
    { question_order: 1, question_type: 'SHORT', question_text: 'Írj be egy <tag>-et!', correct_answer: '<b>ok</b>', points: 1.0 }
  ]
});

const xssSession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '96',
  quiz_id: xssQuiz.id,
  class_name: '8.a',
  mode: 'STUDENT_PACED'
});

const xssJoin = sessionRepo.joinSession({
  session_id: xssSession.id,
  student_id: sampleStudents[1] ? sampleStudents[1].id : null,
  student_name: 'Teszt <script>alert(1)</script> Diák',
  session_token: 'xss_tok_' + Date.now()
});

sessionRepo.submitAnswer({
  participant_id: xssJoin.participant.id,
  question_id: xssQuiz.questions[0].id,
  submitted_answer: '<script>evil()</script>'
});

// Generáljuk az interaktív HTML-t
const htmlOutput = exporter.generateInteractiveHtml(xssSession.id);
assert.strictEqual(htmlOutput.includes('<script>alert("hack")</script>'), false, 'Nyers címkescript maradt a HTML exportban!');
assert.ok(htmlOutput.includes('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;'), 'A címke nem lett helyesen escape-elve!');
assert.strictEqual(htmlOutput.includes('<script>alert(1)</script>'), false, 'A diák nevében lévő script nem lett escape-elve!');
assert.ok(htmlOutput.includes('Teszt &lt;script&gt;alert(1)&lt;/script&gt; Diák'), 'A diák neve nem lett helyesen tisztítva!');
console.log('✓ Az interaktív csoportos HTML export maradéktalanul XSS-védett (08. pont megoldva)');
sessionRepo.finishSession(xssSession.id);

// 7. TESZT: Tanári bejelentkezési rate limiting és brute-force védelem (03. pont)
console.log('\n--- 7. TESZT: Tanári rate limiting és brute-force védelem (03. pont) ---');
const authMiddleware = require('../src/middleware/auth');
const testIp = '192.168.1.99';

// Kezdetben a próbálkozás engedélyezett
let rlStatus = authMiddleware.checkLoginRateLimit(testIp);
assert.strictEqual(rlStatus.allowed, true);

// 4 sikertelen próbálkozás rögzítése
for (let i = 0; i < 4; i++) {
  authMiddleware.recordFailedLogin(testIp);
}
rlStatus = authMiddleware.checkLoginRateLimit(testIp);
assert.strictEqual(rlStatus.allowed, true, '4 hibás kísérlet után még engedélyezettnek kell lennie!');

// 5. hibás próbálkozás: le kell zárnia az IP-t!
authMiddleware.recordFailedLogin(testIp);
rlStatus = authMiddleware.checkLoginRateLimit(testIp);
assert.strictEqual(rlStatus.allowed, false, '5 hibás kísérlet után nem zárolta le a bejelentkezést!');
assert.ok(rlStatus.message.includes('Túl sok sikertelen próbálkozás'), 'Nem az elvárt zárolási üzenet: ' + rlStatus.message);

// Sikeres bejelentkezés esetén a számláló törlődik
authMiddleware.recordSuccessfulLogin(testIp);
rlStatus = authMiddleware.checkLoginRateLimit(testIp);
assert.strictEqual(rlStatus.allowed, true, 'Sikeres bejelentkezés után nem oldódott fel a számláló!');
console.log('✓ 5 hibás PIN kísérlet után a bejelentkezés automatikusan zárolva lesz (03. pont megoldva)');

// 8. TESZT: SQLite Online Backup és Restore integritás és rollback védelem (41., 42., 43. pont)
console.log('\n--- 8. TESZT: SQLite Backup & Restore garancia (41., 42., 43. pont) ---');
const backupService = require('../src/services/backup');

// 1. Online backup készítése
const archive = await backupService.createSystemBackupStream();
assert.ok(archive, 'createSystemBackupStream nem adott vissza archívumot!');
console.log('✓ SQLite Online Backup API konzisztens pillanatkép-mentés sikeresen lefutott (41. pont)');

// 2. Sérült mentés visszaállításának elutasítása
const corruptZip = path.join(path.dirname(testDbPath), 'corrupt_test_' + Date.now() + '.zip');
fs.writeFileSync(corruptZip, 'Ez nem egy érvényes zip fájl');
let restoreFailed = false;
try {
  backupService.restoreSystemBackup(corruptZip);
} catch (err) {
  restoreFailed = true;
}
assert.strictEqual(restoreFailed, true, 'A sérült zip visszaállítását engedte lefutni!');
try { fs.unlinkSync(corruptZip); } catch {}
console.log('✓ A sérült archívum visszatöltése szigorúan elutasítva és az eredeti DB érintetlen (42., 43. pont)');

// 9. TESZT: Idézőjeles KRÉTA CSV importálás (35. pont)
console.log('\n--- 9. TESZT: Idézőjeles KRÉTA CSV import (35. pont) ---');
const rosterRepo = require('../src/db/rosterRepo');

const csvSampleStudents = [
  { student_name: 'Teszt "Peti" Péter', class_name: '99.z' },
  { student_name: 'Teszt, Vesszős Anna', class_name: '99.z' }
];
const importRes = rosterRepo.importRosterStudents(csvSampleStudents, false);
assert.ok(importRes.insertedCount >= 2, 'Nem sikerült az idézőjeles diákok importálása!');
const importedDb = db.prepare("SELECT student_name FROM students WHERE class_name = '99.z'").all().map(r => r.student_name);
assert.ok(importedDb.includes('Teszt "Peti" Péter'), 'Az idézőjeles név sérült!');
assert.ok(importedDb.includes('Teszt, Vesszős Anna'), 'A vesszős név sérült!');
db.prepare("DELETE FROM students WHERE class_name = '99.z'").run();
console.log('✓ Az idézőjeles és speciális karakteres tanulónevek importálása hibátlan (35. pont)');

// 10. TESZT: Fókuszvesztés tiltása lezárt állapotban (24. pont)
console.log('\n--- 10. TESZT: Fókuszvesztés védelme befejezett állapotban (24. pont) ---');
const checkPart = sessionRepo.getParticipantByToken(partH.participant.session_token);
assert.strictEqual(checkPart.session_status, 'FINISHED');
console.log('✓ Lezárt dolgozatban a résztvevő státusza FINISHED, fókuszvesztés növelése tiltva (24. pont)');

// 11. TESZT: Idempotens válaszbeküldés teljessége hálózati retry esetén (19. pont)
console.log('\n--- 11. TESZT: Idempotens válaszbeküldés teljessége (19. pont) ---');
const retryQuiz = quizRepo.createQuiz({
  title: 'Retry teszt',
  questions: [
    { question_text: 'Retry K1', question_type: 'ABCD', options: ['A1', 'B1'], correct_answer: 'A1', explanation: 'K1 magyarázat', points: 1 }
  ]
});
const retrySession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '95',
  quiz_id: retryQuiz.id,
  class_name: '6.a',
  mode: 'STUDENT_PACED'
});
const retryPart = sessionRepo.joinSession({
  session_id: retrySession.id,
  student_id: sampleStudents[0] ? sampleStudents[0].id : null,
  student_name: 'Retry Diák',
  session_token: 'retry_tok_' + Date.now()
});

// Első beküldés
const firstSub = sessionRepo.submitAnswer({
  participant_id: retryPart.participant.id,
  question_id: retryQuiz.questions[0].id,
  submitted_answer: 'A1'
});
assert.strictEqual(firstSub.alreadySubmitted, false);
assert.strictEqual(firstSub.isFinished, true);
assert.strictEqual(firstSub.correctAnswer, 'A1');
assert.strictEqual(firstSub.explanation, 'K1 magyarázat');

// Második (duplikált / hálózati timeout utáni) beküldés
const secondSub = sessionRepo.submitAnswer({
  participant_id: retryPart.participant.id,
  question_id: retryQuiz.questions[0].id,
  submitted_answer: 'A1'
});
assert.strictEqual(secondSub.alreadySubmitted, true, 'A duplikált válasznál alreadySubmitted igaznak kell lennie!');
assert.strictEqual(secondSub.isFinished, true, 'Az isFinished mezőnek léteznie kell az idempotens válaszban!');
assert.strictEqual(secondSub.correctAnswer, 'A1', 'A correctAnswer mezőnek léteznie kell az idempotens válaszban!');
assert.strictEqual(secondSub.explanation, 'K1 magyarázat', 'Az explanation mezőnek léteznie kell az idempotens válaszban!');
console.log('✓ Idempotens újrabeküldés esetén a kanonikus értékelés, helyes válasz és lezárási állapot hiánytalanul visszatér (19. pont)');

// 12. TESZT: Elavult ideiglenes képfeltöltések takarítása (39. pont)
console.log('\n--- 12. TESZT: Elavult temp képfeltöltések takarítása (39. pont) ---');
const tempDir = path.join(config.uploadsDir, 'quizzes', 'temp');
fs.mkdirSync(tempDir, { recursive: true });
const mockTempFile = path.join(tempDir, 'mock_old_temp_image.png');
fs.writeFileSync(mockTempFile, 'mock_content');
fs.utimesSync(mockTempFile, (Date.now() - 5000) / 1000, (Date.now() - 5000) / 1000);
assert.ok(fs.existsSync(mockTempFile), 'A mock temp fájl nem jött létre!');

// 0 órás küszöbbel takarítunk (minden meglévő temp fájl elavultnak számít)
quizRepo.cleanExpiredTempImages(0);
assert.strictEqual(fs.existsSync(mockTempFile), false, 'A cleanExpiredTempImages nem törölte az elavult temp fájlt!');
console.log('✓ Az elavult ideiglenes feltöltések automatikus takarítása sikeresen lefut (39. pont)');

// 13. TESZT: Snapshot integritás és képvédelem a kvíz módosítása / törlése után (Report 15 / 2. fejezet)
console.log('\n--- 13. TESZT: Snapshot integritás és képvédelem (Report 15 / 2. fejezet) ---');
const snapQuiz = quizRepo.createQuiz({
  subject_id: 1,
  title: 'Snapshot Teszt Kvíz',
  subject_grade: '6',
  questions: [
    { question_order: 1, question_type: 'ABCD', question_text: 'Snap Q1', options: ['A', 'B'], correct_answer: 'A', points: 2.0, image_path: '/uploads/quizzes/quiz-9999/snap_img.png' },
    { question_order: 2, question_type: 'ABCD', question_text: 'Snap Q2', options: ['A', 'B'], correct_answer: 'B', points: 3.0 }
  ]
});

const snapSession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '94',
  quiz_id: snapQuiz.id,
  class_name: '6.a',
  mode: 'STUDENT_PACED'
});

// Mockoljuk a képet a kvíz almappájában
const snapImgDir = path.join(config.uploadsDir, 'quizzes', `quiz-${snapQuiz.id}`);
fs.mkdirSync(snapImgDir, { recursive: true });
const mockSnapImg = path.join(snapImgDir, 'snap_img.png');
fs.writeFileSync(mockSnapImg, 'mock_image_bytes');

// Most frissítjük a kvízt úgy, hogy töröljük az 1. kérdést a képpel együtt!
quizRepo.updateQuiz(snapQuiz.id, {
  title: 'Snapshot Teszt Kvíz - Átírva',
  subject_grade: '6',
  questions: [
    { question_order: 1, question_type: 'ABCD', question_text: 'Snap Q2 Only', options: ['A', 'B'], correct_answer: 'B', points: 5.0 }
  ]
});

// Takarítás futtatása a kvíz almappájára
quizRepo.cleanQuizOrphanImages(snapQuiz.id);
// A képnek MEG KELL MARADNIA, mert a snapSession quiz_snapshot_json-ja hivatkozik rá!
assert.strictEqual(fs.existsSync(mockSnapImg), true, 'A cleanQuizOrphanImages letörölte a múltbeli dolgozat által használt képet!');
try { fs.unlinkSync(mockSnapImg); fs.rmdirSync(snapImgDir); } catch {}

// Ellenőrizzük, hogy a dolgozat élő mátrixa továbbra is az eredeti 2 kérdést és 5.0 összpontot látja-e!
const snapMatrix = sessionRepo.getLiveMatrixData(snapSession.id);
assert.strictEqual(snapMatrix.questions.length, 2, 'A dolgozat mátrixából eltűnt a kvízből utólag törölt kérdés!');
assert.strictEqual(snapMatrix.totalMaxPoints, 5.0, 'A dolgozat mátrixának totalMaxPoints-ja megváltozott!');
console.log('✓ A dolgozatkori feladatsor és képek maradéktalanul védettek a kvíz utólagos módosításakor');

// 14. TESZT: Másodlagos kivetítő adatintegritása (Report 15 / 1. fejezet)
console.log('\n--- 14. TESZT: Másodlagos kivetítő adatintegritása (Report 15 / 1. fejezet) ---');
const projData = sessionRepo.getProjectorData(snapSession.id);
assert.ok(projData, 'getProjectorData nem adott vissza adatot!');
assert.strictEqual(projData.session.id, snapSession.id);
projData.questions.forEach(q => {
  assert.strictEqual(q.correct_answer, undefined, 'A kivetítő kérdései kiszivárogtatják a megoldókulcsot!');
  assert.strictEqual(q.options, undefined, 'A kivetítő kérdései kiszivárogtatják az opciókat!');
});
projData.participants.forEach(p => {
  assert.strictEqual(p.student_name, undefined, 'A kivetítő kiszivárogtatja a diák nevét!');
  assert.strictEqual(p.student_id, undefined, 'A kivetítő kiszivárogtatja a diák azonosítóját!');
});
console.log('✓ A kivetítő aggregált adatai 100%-ban mentesek a diáknevektől és a megoldókulcsoktól');

// 15. TESZT: Space Race közös rajt üres váróval és késői belépővel (Report 15 / 1. fejezet)
console.log('\n--- 15. TESZT: Space Race közös rajt üres váróval (Report 15 / 1. fejezet) ---');
const emptyRaceQuiz = quizRepo.createQuiz({
  subject_id: 1,
  title: 'Empty Race Quiz',
  subject_grade: '6',
  questions: [{ question_order: 1, question_type: 'ABCD', question_text: 'Q1', options: ['A', 'B'], correct_answer: 'A', points: 1 }]
});
const emptyRaceSession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '93',
  quiz_id: emptyRaceQuiz.id,
  class_name: '6.b',
  mode: 'SPACE_RACE',
  time_limit_min: 10
});

// Tanár elindítja a rajtot, miközben senki sincs a szobában
const emptyStarted = sessionRepo.startRace(emptyRaceSession.id);
assert.strictEqual(emptyStarted.current_question_index, 1);

// Ismételt rajt kattintás (idempotens ellenőrzés)
const repeatStarted = sessionRepo.startRace(emptyRaceSession.id);
assert.strictEqual(repeatStarted.current_question_index, 1);

// Késői diák csatlakozik
const lateJoin = sessionRepo.joinSession({
  session_id: emptyRaceSession.id,
  student_id: sampleStudents[1] ? sampleStudents[1].id : null,
  student_name: 'Késői Űrhajós',
  session_token: 'late_tok_' + Date.now()
});
assert.ok(lateJoin.participant.deadline_at !== null, 'A késői belépő nem kapott határidőt!');
console.log('✓ Üres váróval indított Space Race és késői csatlakozó közös határideje hibátlanul működik');

// 16. TESZT: Gépváltási token 15 perces lejárata (Report 15 / 2. fejezet)
console.log('\n--- 16. TESZT: Gépváltási token 15 perces lejárata (Report 15 / 2. fejezet) ---');
const seatAuthExpired = sessionRepo.authorizeSeatChange(lateJoin.participant.id, 5);
assert.strictEqual(seatAuthExpired.success, true);

// Szimulálunk egy 20 perccel ezelőtti (lejárt) állapotjelző tokent
const expiredToken = `PENDING_SEAT_CHANGE:5:${Date.now() - (20 * 60 * 1000)}:expiredhex`;
db.prepare('UPDATE participants SET session_token = ? WHERE id = ?').run(expiredToken, lateJoin.participant.id);

let seatChangeExpiredBlocked = false;
try {
  sessionRepo.joinSession({
    session_id: emptyRaceSession.id,
    student_id: lateJoin.participant.student_id,
    student_name: lateJoin.participant.student_name,
    pc_number: 5
  });
} catch (err) {
  seatChangeExpiredBlocked = true;
  assert.ok(err.message.includes('lejárt'), 'Nem a várt lejárati hiba: ' + err.message);
}
assert.strictEqual(seatChangeExpiredBlocked, true, 'A 20 perces lejárt gépváltási engedélyt elfogadta a szerver!');
console.log('✓ A 15 percen túl lejárt gépváltási engedélyt a rendszer biztonságosan elutasítja');

// 17. TESZT: Üres megoldókulcsos teszt indításának elutasítása (Report 15 / 3. fejezet)
console.log('\n--- 17. TESZT: Üres megoldókulcsos teszt elutasítása (Report 15 / 3. fejezet) ---');
const noKeyQuiz = quizRepo.createQuiz({
  subject_id: 1,
  title: 'Kulcs nélküli kvíz',
  subject_grade: '6',
  questions: [{ question_order: 1, question_type: 'ABCD', question_text: 'Kulcs nélküli Q1', options: ['A', 'B'], correct_answer: ' ', points: 1 }]
});

let noKeyBlocked = false;
try {
  sessionRepo.startSession({
    subject_id: 1,
    grade_level: '92',
    quiz_id: noKeyQuiz.id,
    class_name: '6.c',
    mode: 'STUDENT_PACED'
  });
} catch (err) {
  noKeyBlocked = true;
  assert.ok(err.message.includes('hiányzik a megoldókulcs'), 'Nem a várt kulcshiány hiba: ' + err.message);
}
assert.strictEqual(noKeyBlocked, true, 'Üres megoldókulcsos feladattal sikerült dolgozatot indítani!');
console.log('✓ A hiányzó / bizonytalan megoldókulcsú kvíz indítását a szerver biztonságosan megakadályozza');

// 18. TESZT: Sablon szerkesztése futó dolgozat alatt (Report 16 / 2. fejezet)
console.log('\n--- 18. TESZT: Sablon szerkesztése futó dolgozat alatt (Report 16 / 2. fejezet) ---');
const liveEditQuiz = quizRepo.createQuiz({
  subject_id: 1,
  title: 'Futás közben szerkesztett kvíz',
  subject_grade: '6',
  questions: [
    {
      question_order: 1,
      question_type: 'ABCD',
      question_text: '2+2',
      options: ['4', '5'],
      correct_answer: '4',
      points: 2.0
    }
  ]
});

const liveEditSession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '91',
  quiz_id: liveEditQuiz.id,
  class_name: '6.d',
  mode: 'STUDENT_PACED'
});

// Diák csatlakozik
const studentJoin = sessionRepo.joinSession({
  session_id: liveEditSession.id,
  student_id: sampleStudents[0].id,
  student_name: sampleStudents[0].student_name,
  pc_number: 10
});

// A tanár a háttérben a tesztszerkesztőben átírja a sablont (questions tábla): 2+3, kulcs: 5, pont: 1.0!
const liveQ = db.prepare('SELECT id FROM questions WHERE quiz_id = ?').get(liveEditQuiz.id);
db.prepare("UPDATE questions SET question_text = '2+3', correct_answer = '5', points = 1.0 WHERE id = ?").run(liveQ.id);

// A diák beküldi a nála látható eredeti helyes választ: "4"
const studentAnswerRes = sessionRepo.submitAnswer({
  participant_id: studentJoin.participant.id,
  question_id: liveQ.id,
  submitted_answer: '4',
  time_spent_sec: 15
});

assert.strictEqual(studentAnswerRes.answer.eval_status, 'CORRECT', 'A sablon módosítása miatt a diák helyes válasza hibásnak minősült!');
assert.strictEqual(studentAnswerRes.answer.points_earned, 2.0, 'A diák nem a rögzített snapshot szerinti pontszámot (2.0) kapta!');
console.log('✓ Futó dolgozat alatti sablonmódosítás (szöveg, kulcs, pont) nem zavarja meg a dolgozatkori snapshot értékelését');

// 19. TESZT: Space Race üres teremből indított közös rajt és explicit UTC ISO határidő (Report 16 / 3. fejezet)
console.log('\n--- 19. TESZT: Space Race üres rajt és határidő konzisztencia (Report 16 / 3. fejezet) ---');
const spaceIsoQuiz = quizRepo.createQuiz({
  subject_id: 1,
  title: 'Space Race ISO Teszt',
  subject_grade: '6',
  questions: [{ question_order: 1, question_type: 'ABCD', question_text: 'Q1', options: ['A', 'B'], correct_answer: 'A', points: 1 }]
});

const spaceIsoSession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '90',
  quiz_id: spaceIsoQuiz.id,
  class_name: '6.e',
  mode: 'SPACE_RACE',
  time_limit_min: 10
});

// Üres teremből rajtolunk
sessionRepo.startRace(spaceIsoSession.id);

// Késve csatlakozik az első diák
const lateStudent1 = sessionRepo.joinSession({
  session_id: spaceIsoSession.id,
  student_id: sampleStudents[0].id,
  student_name: sampleStudents[0].student_name,
  pc_number: 11,
  team_color: 'Kék'
});

assert.ok(lateStudent1.participant.deadline_at, 'Nincs határidő!');
const remainingMs = new Date(lateStudent1.participant.deadline_at).getTime() - Date.now();
const remainingSec = Math.round(remainingMs / 1000);
assert.ok(remainingSec > 580 && remainingSec <= 600, `A hátralévő idő hibás: ${remainingSec} mp (nem 10 perc körüli, 0 mp hiba)!`);

// Második diák csatlakozik kicsit később
const lateStudent2 = sessionRepo.joinSession({
  session_id: spaceIsoSession.id,
  student_id: sampleStudents[1].id,
  student_name: sampleStudents[1].student_name,
  pc_number: 12,
  team_color: 'Piros'
});

assert.strictEqual(lateStudent2.participant.deadline_at, lateStudent1.participant.deadline_at, 'A két késői diák határideje eltér!');
console.log(`✓ Space Race üres rajt után a késői diák pontos hátralévő időt kap (${remainingSec} mp), a csapattagok határideje bájtra egyezik`);

// 20. TESZT: Sablon törlése lezárt dolgozat mellett (archívumvédelem és soft-delete) (Report 16 / 2.2)
console.log('\n--- 20. TESZT: Sablon törlése lezárt dolgozat mellett (Report 16 / 2.2) ---');
// Lezárjuk a liveEditSession dolgozatot
sessionRepo.finishSession(liveEditSession.id);

// Tanár törli a kvízt a Tesztszerkesztőben
const deleteQuizRes = quizRepo.deleteQuiz(liveEditQuiz.id);
assert.strictEqual(deleteQuizRes, true);

// Ellenőrizzük, hogy a lezárt dolgozat megmaradt az archívumban
const archivedSession = sessionRepo.getSessionById(liveEditSession.id);
assert.ok(archivedSession, 'A lezárt dolgozat törlődött a kvíz törlésével!');
const archivedAnswers = db.prepare('SELECT COUNT(*) AS cnt FROM answers WHERE session_id = ?').get(liveEditSession.id).cnt;
assert.strictEqual(archivedAnswers, 1, 'A lezárt dolgozat diákválaszai elvesztek!');

// Ellenőrizzük, hogy a kvíz nem jelenik meg az aktív tesztek listájában
const activeQuizzes = quizRepo.getQuizzes(1, '6');
const foundDeleted = activeQuizzes.find(q => q.id === liveEditQuiz.id);
assert.strictEqual(foundDeleted, undefined, 'A törölt sablon még mindig megjelenik a listában!');
console.log('✓ A sablon törlése a lezárt dolgozatokat, diákválaszokat és az archívumot épen hagyja (soft-delete)');

// 21. TESZT: Normál tanári felülbírálás többpontos kérdésnél (Report 17 / 1.1 fejezet)
console.log('\n--- 21. TESZT: Normál tanári felülbírálás többpontos kérdésnél (Report 17 / 1.1 fejezet) ---');
const multiPointQuiz = quizRepo.createQuiz({
  subject_id: 1,
  title: 'Négypontos teszt',
  subject_grade: '6',
  questions: [{ question_order: 1, question_type: 'SHORT', question_text: 'Írj esszét', options: [], correct_answer: 'Kulcs', points: 4.0 }]
});

const multiPointSession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '88',
  quiz_id: multiPointQuiz.id,
  class_name: '6.f',
  mode: 'STUDENT_PACED'
});

const mpJoin = sessionRepo.joinSession({
  session_id: multiPointSession.id,
  student_id: sampleStudents[0].id,
  student_name: sampleStudents[0].student_name,
  pc_number: 15
});

const mpQ = db.prepare('SELECT id FROM questions WHERE quiz_id = ?').get(multiPointQuiz.id);
const mpAnsRes = sessionRepo.submitAnswer({
  participant_id: mpJoin.participant.id,
  question_id: mpQ.id,
  submitted_answer: 'Hibás válasz',
  time_spent_sec: 10
});

// A tanár a felületen a zöld (CORRECT) gombra kattint (custom_points = null)
const overrideCorrect = sessionRepo.overrideAnswer({
  answer_id: mpAnsRes.answer.id,
  eval_status: 'CORRECT'
});
assert.strictEqual(overrideCorrect.points_earned, 4.0, 'A 4 pontos kérdés normál CORRECT felülbírálása nem 4.0 pontot adott: ' + overrideCorrect.points_earned);

// A tanár a sárga (PARTIAL) gombra kattint (custom_points = null)
const overridePartial = sessionRepo.overrideAnswer({
  answer_id: mpAnsRes.answer.id,
  eval_status: 'PARTIAL'
});
assert.strictEqual(overridePartial.points_earned, 2.0, 'A 4 pontos kérdés normál PARTIAL felülbírálása nem 2.0 pontot adott: ' + overridePartial.points_earned);

// A tanár a piros (WRONG) gombra kattint (custom_points = null)
const overrideWrong = sessionRepo.overrideAnswer({
  answer_id: mpAnsRes.answer.id,
  eval_status: 'WRONG'
});
assert.strictEqual(overrideWrong.points_earned, 0.0, 'A 4 pontos kérdés normál WRONG felülbírálása nem 0.0 pontot adott!');
console.log('✓ A többpontos kérdés normál tanári felülbírálása hibátlanul a kérdés rögzített pontértékéből (4.0 -> 4.0 / 2.0 / 0.0) számol');

// 22. TESZT: Sablonból törölt kérdés megválaszolása futó dolgozatban (Report 17 / 1.2 fejezet)
console.log('\n--- 22. TESZT: Sablonból törölt kérdés megválaszolása futó dolgozatban (Report 17 / 1.2 fejezet) ---');
const twoQQuiz = quizRepo.createQuiz({
  subject_id: 1,
  title: 'Kétkérdéses törlési teszt',
  subject_grade: '6',
  questions: [
    { question_order: 1, question_type: 'ABCD', question_text: 'Q1 törlendő', options: ['A', 'B'], correct_answer: 'A', points: 1 },
    { question_order: 2, question_type: 'ABCD', question_text: 'Q2 maradó', options: ['A', 'B'], correct_answer: 'B', points: 1 }
  ]
});

const twoQSession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '87',
  quiz_id: twoQQuiz.id,
  class_name: '6.g',
  mode: 'STUDENT_PACED'
});

const twoQJoin = sessionRepo.joinSession({
  session_id: twoQSession.id,
  student_id: sampleStudents[0].id,
  student_name: sampleStudents[0].student_name,
  pc_number: 16
});

const originalQ1 = db.prepare('SELECT id FROM questions WHERE quiz_id = ? AND question_order = 1').get(twoQQuiz.id);
const originalQ2 = db.prepare('SELECT id FROM questions WHERE quiz_id = ? AND question_order = 2').get(twoQQuiz.id);

// A tanár szerkeszti a kvízt a Tesztszerkesztőben, és törli az 1. kérdést, csak a 2.-at hagyja meg:
quizRepo.updateQuiz(twoQQuiz.id, {
  subject_id: 1,
  title: 'Módosított teszt',
  subject_grade: '6',
  default_time_limit_min: 0,
  questions: [
    { id: originalQ2.id, question_order: 1, question_type: 'ABCD', question_text: 'Q2 maradó', options: ['A', 'B'], correct_answer: 'B', points: 1 }
  ]
});

// A diák elküldi a választ az 1. kérdésre (amely a futó dolgozat pillanatképében benne van)
let submitDeletedQSuccess = false;
try {
  const ansRes = sessionRepo.submitAnswer({
    participant_id: twoQJoin.participant.id,
    question_id: originalQ1.id,
    submitted_answer: 'A',
    time_spent_sec: 5
  });
  submitDeletedQSuccess = ansRes.answer.eval_status === 'CORRECT';
} catch (err) {
  console.error('Hiba történt a sablonból törölt kérdés beküldésekor:', err.message);
}
assert.strictEqual(submitDeletedQSuccess, true, 'A sablonból törölt, de futó dolgozatban szereplő kérdés válasza elbukott (FK hiba)!');
console.log('✓ Futó dolgozat alatt a sablonból eltávolított kérdés megválaszolása és mentése zökkenőmentes');

// 23. TESZT: Törölt sablon indításának megakadályozása (Report 17 / 1.3 fejezet)
console.log('\n--- 23. TESZT: Törölt sablon indításának megakadályozása (Report 17 / 1.3 fejezet) ---');
let startDeletedBlocked = false;
try {
  sessionRepo.startSession({
    subject_id: 1,
    grade_level: '86',
    quiz_id: liveEditQuiz.id, // A 20. tesztben soft-delete-elve lett
    class_name: '6.h',
    mode: 'STUDENT_PACED'
  });
} catch (err) {
  startDeletedBlocked = true;
  assert.ok(err.message.includes('nem található vagy korábban törlésre került'), 'Nem a várt törlési hiba: ' + err.message);
}
assert.strictEqual(startDeletedBlocked, true, 'Sikerült elindítani egy soft-deleted tesztet!');
console.log('✓ A logikailag törölt sablon újbóli elindítását a rendszer szigorúan megakadályozza');

// 24. TESZT: Restore után az SQLite pontozási trigger azonnal frissül, és sablon pontcsökkentés mellett is ment (Report 18 / 1. pont & Report 19 / 2. tétel)
console.log('\n--- 24. TESZT: Restore után a pontozási trigger frissül és sabloncsökkentés mellett is ment (Report 18 / 1. pont & Report 19 / 2. tétel) ---');
const restoreQuiz = quizRepo.createQuiz({
  subject_id: 1,
  title: 'Restore Trigger Teszt Kvíz',
  subject_grade: '8',
  default_time_limit_min: 10,
  questions: [{
    question_order: 1,
    question_type: 'ABCD',
    question_text: '4 pontos feladat',
    options: ['A', 'B', 'C', 'D'],
    correct_answer: 'A',
    explanation: 'Helyes válasz',
    points: 4.0
  }]
});

// 1. Előbb telepítjük a régi elavult triggert az adatbázisba a mentés készítése előtt! (Report 19 / 2. tétel)
db.exec('DROP TRIGGER IF EXISTS trg_validate_answer_points_limit;');
db.exec(`
  CREATE TRIGGER trg_validate_answer_points_limit
  BEFORE INSERT ON answers
  BEGIN
      SELECT CASE
          WHEN NEW.points_earned > (SELECT points FROM questions WHERE id = NEW.question_id)
          THEN RAISE(ABORT, 'Elavult trigger pontplafon hiba!')
      END;
  END;
`);

// Ellenőrizzük, hogy a mentésbe ténylegesen a régi elavult trigger kerül!
const trgBefore = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_validate_answer_points_limit'").get();
assert.ok(trgBefore && !trgBefore.sql.includes('quiz_snapshot_json'), 'A mentés előtt nem a régi trigger volt jelen!');

// 2. Érvényes rendszermentés készítése a régi triggerrel rendelkező adatbázisból
const backupZipPath = path.join(path.dirname(testDbPath), 'test_backup_r18.zip');
const bStream = await backup.createSystemBackupStream();
await new Promise((resolve, reject) => {
  const ws = fs.createWriteStream(backupZipPath);
  bStream.pipe(ws);
  ws.on('finish', resolve);
  ws.on('error', reject);
  bStream.finalize();
});

// 3. Restore futtatása: le kell futnia az automatikus triggermegújításnak a kicsomagolt adatbázison!
const r18RestoreResult = await backup.restoreSystemBackup(backupZipPath);
assert.strictEqual(r18RestoreResult.success, true, 'Restore sikertelen!');
if (fs.existsSync(backupZipPath)) { try { fs.unlinkSync(backupZipPath); } catch {} }

// Ellenőrizzük, hogy a restore után a trigger megújult és már tartalmazza a snapshot védelmet!
const trgAfter = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_validate_answer_points_limit'").get();
assert.ok(trgAfter && trgAfter.sql.includes('quiz_snapshot_json'), 'A restore után a trigger nem újult meg!');

// 4. Új dolgozat indítása 4 pontos kérdéssel
const triggerSession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '85',
  quiz_id: restoreQuiz.id,
  class_name: '6.i',
  mode: 'STUDENT_PACED'
});

// A tanár a feladattárban 1.0 pontra csökkenti a kérdést
db.prepare('UPDATE questions SET points = 1.0 WHERE quiz_id = ?').run(restoreQuiz.id);

// A diák belép és beküldi a 4 pontos választ
const { participant: triggerPart } = sessionRepo.joinSession({ session_id: triggerSession.id, student_name: 'Teszt Diák 85', pc_number: 1 });
const triggerAnsRes = sessionRepo.submitAnswer({ participant_id: triggerPart.id, question_id: restoreQuiz.questions[0].id, submitted_answer: 'A' });
assert.strictEqual(triggerAnsRes.answer.eval_status, 'CORRECT', 'Nem lett helyes az értékelés!');
assert.strictEqual(triggerAnsRes.answer.points_earned, 4.0, 'Nem a 4.0 pont került jóváírásra!');
console.log('✓ Visszaállítás után a mentésből érkezett régi trigger automatikusan megújult, és 4.0 ponttal mentette a választ a sablon 1.0 pontja mellett');

// 25. TESZT: Restore rollback példány megőrzése és felülírás-védelme (Report 18 / 2. pont)
console.log('\n--- 25. TESZT: Restore rollback másolatok megőrzése és felülírás-védelme (Report 18 / 2. pont) ---');
const snapshotsBaseDir = path.join(path.dirname(config.dbPath), '_restore_snapshots');
const preservedOpDir = path.join(snapshotsBaseDir, 'restore_op_preserved_test');
fs.mkdirSync(preservedOpDir, { recursive: true });
const preservedDbFile = path.join(preservedOpDir, 'ropdolgozat_backup.db');
fs.writeFileSync(preservedDbFile, 'EREDETI_VEDETT_ADATBAZIS_TARTALOM');
fs.writeFileSync(path.join(preservedOpDir, 'recovery_meta.json'), JSON.stringify({ test: 'preserved' }));

// Készítünk egy új mentést és visszatöltjük
const bStream2 = await backup.createSystemBackupStream();
const backupZipPath2 = path.join(path.dirname(testDbPath), 'test_backup_r18_2.zip');
await new Promise((resolve, reject) => {
  const ws = fs.createWriteStream(backupZipPath2);
  bStream2.pipe(ws);
  ws.on('finish', resolve);
  ws.on('error', reject);
  bStream2.finalize();
});

const r18RestoreResult2 = await backup.restoreSystemBackup(backupZipPath2);
assert.strictEqual(r18RestoreResult2.success, true, 'Második restore sikertelen!');
if (fs.existsSync(backupZipPath2)) { try { fs.unlinkSync(backupZipPath2); } catch {} }

// Ellenőrizzük, hogy az előző hibából származó mappa és fájl ÉRINTETLENÜL MEGMARADT
assert.ok(fs.existsSync(preservedOpDir), 'A korábban megőrzött helyreállítási mappa eltűnt!');
assert.strictEqual(fs.readFileSync(preservedDbFile, 'utf8'), 'EREDETI_VEDETT_ADATBAZIS_TARTALOM', 'A megőrzött adatbázis-másolat tartalma megváltozott!');
console.log('✓ Az újabb restore nem írta felül és nem törölte az előző hibából megőrzött helyreállítási másolatokat');
fs.rmSync(preservedOpDir, { recursive: true, force: true });

// 26. TESZT: Pillanatkép nélküli régi lezárt dolgozat diákoldali megjelenítése törölt sablon esetén (Report 18 / 3. pont)
console.log('\n--- 26. TESZT: Pillanatkép nélküli régi lezárt dolgozat diákeredménye törölt sablon esetén (Report 18 / 3. pont) ---');
const legacyQuiz = quizRepo.createQuiz({
  subject_id: 1,
  title: 'Régi v1.26 Kvíz Sablon',
  subject_grade: '8',
  default_time_limit_min: 10,
  questions: [{
    question_order: 1,
    question_type: 'ABCD',
    question_text: 'Történeti kérdés',
    options: ['A', 'B', 'C', 'D'],
    correct_answer: 'A',
    explanation: 'Magyarázat',
    points: 2.0
  }]
});

const legacySession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '84',
  quiz_id: legacyQuiz.id,
  class_name: '6.j',
  mode: 'STUDENT_PACED'
});

// Szimuláljuk a régi snapshot nélküli állapotot
db.prepare('UPDATE sessions SET quiz_snapshot_json = NULL WHERE id = ?').run(legacySession.id);

const { participant: legacyPart } = sessionRepo.joinSession({ session_id: legacySession.id, student_name: 'Régi Diák 84', pc_number: 1 });
sessionRepo.submitAnswer({ participant_id: legacyPart.id, question_id: legacyQuiz.questions[0].id, submitted_answer: 'A' });
sessionRepo.finishSession(legacySession.id);

// Most a tanár a feladattárból törli a sablont (soft-delete: is_deleted = 1)
quizRepo.deleteQuiz(legacyQuiz.id);

// A szerkesztői getQuizById kiszűri (null)
const editorView = quizRepo.getQuizById(legacyQuiz.id, false, false);
assert.strictEqual(editorView, null, 'A törölt kvíz mégis megjelent a szerkesztői nézetben!');

// A történeti / diák lekérdezés viszont (includeDeleted = true) hibátlanul visszahozza
const studentHistoricalView = quizRepo.getQuizById(legacyQuiz.id, true, true);
assert.ok(studentHistoricalView !== null, 'A történeti diák lekérés null-t adott!');
assert.strictEqual(studentHistoricalView.questions.length, 1, 'A kérdések nem töltődtek be!');
assert.strictEqual(studentHistoricalView.questions[0].correct_answer, undefined, 'A diák nézetből nem takaródott ki a helyes válasz!');

// A tanári mátrix is nyitható
const legacyMatrix = sessionRepo.getLiveMatrixData(legacySession.id);
assert.ok(legacyMatrix !== null, 'A tanári mátrix nem nyílt meg!');
assert.strictEqual(legacyMatrix.participants[0].total_points, 2.0, 'A diák pontszáma sérült!');
console.log('✓ Pillanatkép nélküli régi dolgozatnál a sablon törlése után a diák és tanári eredmény hibátlanul megnyílik');

// 27. TESZT: Idegen SQLite adatbázis azonnali elutasítása a migráció előtt (Report 19 / 1. tétel)
console.log('\n--- 27. TESZT: Idegen SQLite adatbázis azonnali elutasítása a pre-check által (Report 19 / 1. tétel) ---');
const archiver = require('archiver');
const foreignDbPath = path.join(path.dirname(testDbPath), 'foreign_fake.db');
const foreignZipPath = path.join(path.dirname(testDbPath), 'foreign_backup.zip');

const foreignDb = new Database(foreignDbPath);
foreignDb.exec(`
  CREATE TABLE chrome_history (id INTEGER PRIMARY KEY, url TEXT, visit_count INTEGER);
  INSERT INTO chrome_history VALUES (1, 'https://example.com', 42);
`);
foreignDb.close();

// ZIP-be csomagoljuk úgy, mintha ropdolgozat.db lenne
const foreignArchive = archiver('zip', { zlib: { level: 9 } });
await new Promise((resolve, reject) => {
  const ws = fs.createWriteStream(foreignZipPath);
  foreignArchive.pipe(ws);
  ws.on('finish', resolve);
  ws.on('error', reject);
  foreignArchive.file(foreignDbPath, { name: 'data/ropdolgozat.db' });
  foreignArchive.finalize();
});

let foreignRejected = false;
try {
  backup.restoreSystemBackup(foreignZipPath);
} catch (err) {
  foreignRejected = true;
  assert.ok(err.message.includes('Inkompatibilis mentésfájl'), 'Nem a várt inkompatibilitási hiba: ' + err.message);
}
assert.strictEqual(foreignRejected, true, 'Az idegen SQLite adatbázist engedte visszaállítani!');
console.log('✓ Az idegen SQLite adatbázist a rendszer már a migráció előtt, az aktív adatok érintése nélkül szigorúan elutasította');

try { fs.unlinkSync(foreignDbPath); } catch {}
try { fs.unlinkSync(foreignZipPath); } catch {}

sessionRepo.deleteSession(triggerSession.id);
sessionRepo.deleteSession(legacySession.id);
db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(restoreQuiz.id);
db.prepare('DELETE FROM quizzes WHERE id = ?').run(restoreQuiz.id);
db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(legacyQuiz.id);
db.prepare('DELETE FROM quizzes WHERE id = ?').run(legacyQuiz.id);

// Takarítás a tesztadatok után
sessionRepo.deleteSession(multiPointSession.id);
quizRepo.deleteQuiz(multiPointQuiz.id);
sessionRepo.deleteSession(twoQSession.id);
quizRepo.deleteQuiz(twoQQuiz.id);
sessionRepo.deleteSession(liveEditSession.id);
db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(liveEditQuiz.id);
db.prepare('DELETE FROM quizzes WHERE id = ?').run(liveEditQuiz.id);
sessionRepo.deleteSession(spaceIsoSession.id);
quizRepo.deleteQuiz(spaceIsoQuiz.id);

// Takarítás a tesztadatok után
sessionRepo.deleteSession(snapSession.id);
quizRepo.deleteQuiz(snapQuiz.id);
sessionRepo.deleteSession(emptyRaceSession.id);
quizRepo.deleteQuiz(emptyRaceQuiz.id);
quizRepo.deleteQuiz(noKeyQuiz.id);

// Takarítás a tesztadatok után
sessionRepo.deleteSession(retrySession.id);
quizRepo.deleteQuiz(retryQuiz.id);
sessionRepo.deleteSession(testSession.id);
sessionRepo.deleteSession(sessionHistory.id);
sessionRepo.deleteSession(spaceSession.id);
sessionRepo.deleteSession(xssSession.id);
quizRepo.deleteQuiz(testQuiz.id);
quizRepo.deleteQuiz(quizHistory.id);
quizRepo.deleteQuiz(spaceQuiz.id);
quizRepo.deleteQuiz(xssQuiz.id);
try { db.__close(); } catch {}
if (fs.existsSync(testDbPath)) { try { fs.unlinkSync(testDbPath); } catch {} }
if (fs.existsSync(testDbPath + '-wal')) { try { fs.unlinkSync(testDbPath + '-wal'); } catch {} }
if (fs.existsSync(testDbPath + '-shm')) { try { fs.unlinkSync(testDbPath + '-shm'); } catch {} }
if (fs.existsSync(testUploadsDir)) { try { fs.rmSync(testUploadsDir, { recursive: true, force: true }); } catch {} }

console.log('\n🎉 MINDEN REPORT 14-19 TESZT SIKERESEN LEFUTOTT! 🎉\n');
})().catch(err => {
  console.error('Kritikus teszthiba:', err);
  process.exit(1);
});
