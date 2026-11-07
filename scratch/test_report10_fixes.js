const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Tiszta in-memory adatbázis a séma és a triggerek vizsgálatához
const db = new Database(':memory:');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'DATABASE_SCHEMA.sql'), 'utf8');
db.exec(schemaSql);

console.log('================================================================');
console.log('   REPORT 10 CÉLZOTT ELLENŐRZŐ TESZTEK                          ');
console.log('================================================================\n');

// 1. Minta adatok beszúrása
const qRes = db.prepare(`
  INSERT INTO quizzes (subject_id, title, subject_grade, default_time_limit_min)
  VALUES (1, 'Report 10 Teszt', '6', 10)
`).run();
const quizId = qRes.lastInsertRowid;

const qstRes = db.prepare(`
  INSERT INTO questions (quiz_id, question_order, question_type, question_text, correct_answer, points)
  VALUES (?, 1, 'ABCD', 'Kérdés 1', 'A', 1.0)
`).run(quizId);
const questionId = qstRes.lastInsertRowid;

const stuRes = db.prepare(`
  INSERT INTO students (class_name, student_name)
  VALUES ('6.a', 'Teszt Elek')
`).run();
const studentId = stuRes.lastInsertRowid;

// Dolgozat indítása
const sRes = db.prepare(`
  INSERT INTO sessions (subject_id, grade_level, quiz_id, class_name, mode, status, time_limit_min)
  VALUES (1, '6', ?, '6.a', 'STUDENT_PACED', 'ACTIVE', 10)
`).run(quizId);
const sessionId = sRes.lastInsertRowid;

// Résztvevő beléptetése
const pRes = db.prepare(`
  INSERT INTO participants (session_id, student_id, student_name, pc_number, session_token)
  VALUES (?, ?, 'Teszt Elek', 10, 'token-report10')
`).run(sessionId, studentId);
const participantId = pRes.lastInsertRowid;

// Helyes válasz beszúrása az aktív dolgozathoz
db.prepare(`
  INSERT INTO answers (session_id, participant_id, question_id, submitted_answer, eval_status, is_correct, points_earned, original_points_earned, time_spent_sec)
  VALUES (?, ?, ?, 'A', 'CORRECT', 1, 1.0, 1.0, 15)
`).run(sessionId, participantId, questionId);

console.log('--- 1. TESZT: Értékelési konzisztencia CHECK megszorítás ---');
try {
  // Inkonzisztens beszúrási kísérlet létező kérdésre: WRONG, de 1.0 pontot és is_correct = 1-et adunk egy új diák nevében
  const stu2 = db.prepare("INSERT INTO students (class_name, student_name) VALUES ('6.a', 'Másik Diák')").run();
  const part2 = db.prepare("INSERT INTO participants (session_id, student_id, student_name, pc_number, session_token) VALUES (?, ?, 'Másik Diák', 11, 'token-2')").run(sessionId, stu2.lastInsertRowid);
  db.prepare(`
    INSERT INTO answers (session_id, participant_id, question_id, submitted_answer, eval_status, is_correct, points_earned, original_points_earned)
    VALUES (?, ?, ?, 'B', 'WRONG', 1, 1.0, 1.0)
  `).run(sessionId, part2.lastInsertRowid, questionId);
  console.error('❌ HIBA: Sikerült inkonzisztens értékelést (WRONG státusz + 1 pont) beszúrni!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Az adatbázis CHECK feltétele megakadályozta az inkonzisztens pontozást: "${err.message}"`);
}

console.log('\n--- 2. TESZT: Dolgozat lezárása (FINISHED) ---');
db.prepare("UPDATE participants SET is_finished = 1, finished_at = CURRENT_TIMESTAMP WHERE session_id = ?").run(sessionId);
db.prepare("UPDATE sessions SET status = 'FINISHED', ended_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
console.log('✓ Dolgozat sikeresen lezárva.');

console.log('\n--- 3. TESZT (Report 10 / 1. pont): Új válasz beszúrása lezárt (FINISHED) dolgozatba ---');
try {
  db.prepare(`
    INSERT INTO answers (session_id, participant_id, question_id, submitted_answer, eval_status, is_correct, points_earned, original_points_earned)
    VALUES (?, ?, ?, 'C', 'CORRECT', 1, 1.0, 1.0)
  `).run(sessionId, participantId, questionId);
  console.error('❌ HIBA: Sikerült új választ beszúrni egy lezárt dolgozathoz!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: A trg_prevent_answer_insert_when_finished elutasította az utólagos válaszbeszúrást: "${err.message}"`);
}

console.log('\n--- 4. TESZT (Report 10 / 2. pont): Új résztvevő hozzáadása lezárt (FINISHED) dolgozathoz ---');
try {
  db.prepare(`
    INSERT INTO participants (session_id, student_id, student_name, pc_number, session_token)
    VALUES (?, ?, 'Új Utólagos Tanuló', 22, 'token-utolag')
  `).run(sessionId, studentId);
  console.error('❌ HIBA: Sikerült új résztvevőt hozzáadni egy lezárt dolgozathoz!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: A trg_prevent_participant_insert_when_finished elutasította az utólagos résztvevőt: "${err.message}"`);
}

console.log('\n--- 5. TESZT (Report 10 / 3. pont): Tranzakciós Rollback atomicitás dolgozat lezárásakor ---');
// Nyitunk egy 2. dolgozatot az atomicitás teszteléséhez
const s2Res = db.prepare(`
  INSERT INTO sessions (subject_id, grade_level, quiz_id, class_name, mode, status, time_limit_min)
  VALUES (1, '7', ?, '7.a', 'STUDENT_PACED', 'ACTIVE', 10)
`).run(quizId);
const s2Id = s2Res.lastInsertRowid;

const p2Res = db.prepare(`
  INSERT INTO participants (session_id, student_id, student_name, pc_number, session_token, is_finished)
  VALUES (?, ?, 'Próba Diák', 3, 'token-s2', 0)
`).run(s2Id, studentId);
const p2Id = p2Res.lastInsertRowid;

// Szándékosan hibára futó tranzakció szimulálása:
// 1. lépés: résztvevő lezárása (is_finished = 1)
// 2. lépés: hiba dobása a session lezárása előtt
const failedTx = db.transaction(() => {
  db.prepare("UPDATE participants SET is_finished = 1 WHERE id = ?").run(p2Id);
  throw new Error('Szimulált hálózati/szerverhiba a lezárás közepén!');
});

try {
  failedTx();
} catch (err) {
  console.log(`✓ Tranzakció megszakadva: "${err.message}"`);
}

// Ellenőrizzük, hogy a résztvevő visszagörbült-e (maradt-e is_finished = 0)
const p2AfterRollback = db.prepare("SELECT is_finished FROM participants WHERE id = ?").get(p2Id);
const s2AfterRollback = db.prepare("SELECT status FROM sessions WHERE id = ?").get(s2Id);

console.log(`✓ Résztvevő állapota rollback után: is_finished = ${p2AfterRollback.is_finished} (Elvárt: 0)`);
console.log(`✓ Dolgozat állapota rollback után: status = ${s2AfterRollback.status} (Elvárt: ACTIVE)`);

if (p2AfterRollback.is_finished !== 0 || s2AfterRollback.status !== 'ACTIVE') {
  console.error('❌ HIBA: A tranzakció nem görbült vissza teljesen!');
  process.exit(1);
} else {
  console.log('✓ SIKER: Az atomicitás garantált, nem maradt részleges/inkonzisztens állapot!');
}

console.log('\n--- 6. TESZT (Report 10 / 4.D pont): Gépváltási és Tokenlopási védelem ---');
const mainDb = require('../src/db/init');
const sessionRepo = require('../src/db/sessionRepo');

// Ha korábbi futásból aktív maradt volna a 8. évfolyam, lezárjuk
const existing = sessionRepo.getActiveSessionByChannel(1, '8');
if (existing) {
  sessionRepo.finishSession(existing.id);
}

// Diák biztosítása a lemezes adatbázisban
let student1 = mainDb.prepare("SELECT * FROM students WHERE class_name = '8.a' LIMIT 1").get();
if (!student1) {
  const sIns = mainDb.prepare("INSERT INTO students (class_name, student_name) VALUES ('8.a', 'Teszt Béla')").run();
  student1 = { id: sIns.lastInsertRowid, student_name: 'Teszt Béla', class_name: '8.a' };
}

// Létrehozunk egy aktív dolgozatot a sessionRepo segítségével
const activeSession = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '8',
  quiz_id: 1,
  class_name: '8.a'
});

// 1. Tanuló belép a 12-es gépről
const j1 = sessionRepo.joinSession({
  session_id: activeSession.id,
  student_id: student1.id,
  student_name: student1.student_name,
  pc_number: 12
});
console.log(`✓ Tanuló belépett a 12. gépről (Token: ${j1.participant.session_token.slice(0, 8)}...)`);

// 2. Kísérlet: Egy másik gépről (15. gép) valaki rákattint ugyanerre a névre token nélkül
try {
  sessionRepo.joinSession({
    session_id: activeSession.id,
    student_id: student1.id,
    student_name: student1.student_name,
    pc_number: 15,
    session_token: null
  });
  console.error('❌ HIBA: Sikerült átvenni a diák munkamenetét egy idegen gépről!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Az idegen gépről történő átvételt a rendszer elutasította: "${err.message}"`);
}

// 3. Ugyanarról a gépről a tárolt érvényes session_token segítségével:
const jSame = sessionRepo.joinSession({
  session_id: activeSession.id,
  student_id: student1.id,
  student_name: student1.student_name,
  pc_number: 12,
  session_token: j1.participant.session_token
});
console.log(`✓ SIKER: Ugyanarról a munkaállomásról (12. gép) érvényes tokennel a munkamenet sikeresen folytatható: isRecovery = ${jSame.isRecovery}`);

// Dolgozat lezárása a teszt végén
sessionRepo.finishSession(activeSession.id);
console.log('✓ Teszt dolgozat tisztán lezárva.');

console.log('\n================================================================');
console.log('🎉 REPORT 10 MINDEN CÉLZOTT ELLENŐRZÉSE HIBÁTLANUL LEFUTOTT!   🎉');
console.log('================================================================\n');
