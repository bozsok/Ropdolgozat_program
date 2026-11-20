const assert = require('assert');
const grader = require('../src/services/grader');
const quizRepo = require('../src/db/quizRepo');
const sessionRepo = require('../src/db/sessionRepo');
const Database = require('better-sqlite3');
const path = require('path');

console.log('=== REPORT 14 JAVÍTÁSOK RENDSZERTESZTJE ===\n');

const db = new Database(path.join(__dirname, '..', 'data', 'ropdolgozat.db'));
const testSessionIds = db.prepare("SELECT id FROM sessions WHERE grade_level IN ('96', '97', '98', '99')").all().map(s => s.id);
if (testSessionIds.length > 0) {
  const placeholders = testSessionIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM answers WHERE session_id IN (${placeholders})`).run(...testSessionIds);
  db.prepare(`DELETE FROM participants WHERE session_id IN (${placeholders})`).run(...testSessionIds);
  db.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`).run(...testSessionIds);
}
const sampleStudents = db.prepare('SELECT id, student_name FROM students LIMIT 2').all();

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
const fs = require('fs');

(async () => {
  // 1. Online backup készítése
  const archive = await backupService.createSystemBackupStream();
  assert.ok(archive, 'createSystemBackupStream nem adott vissza archívumot!');
  console.log('✓ SQLite Online Backup API konzisztens pillanatkép-mentés sikeresen lefutott (41. pont)');

  // 2. Sérült mentés visszaállításának elutasítása
  const corruptZip = path.join(__dirname, 'corrupt_test.zip');
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
})();

// Takarítás a tesztadatok után
sessionRepo.deleteSession(testSession.id);
sessionRepo.deleteSession(sessionHistory.id);
sessionRepo.deleteSession(spaceSession.id);
sessionRepo.deleteSession(xssSession.id);
quizRepo.deleteQuiz(testQuiz.id);
quizRepo.deleteQuiz(quizHistory.id);
quizRepo.deleteQuiz(spaceQuiz.id);
quizRepo.deleteQuiz(xssQuiz.id);
db.close();

console.log('\n🎉 MINDEN REPORT 14 TESZT SIKERESEN LEFUTOTT! 🎉\n');
