const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Tiszta in-memory adatbázis a séma és a triggerek precíz vizsgálatához
const db = new Database(':memory:');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'DATABASE_SCHEMA.sql'), 'utf8');
db.exec(schemaSql);

console.log('================================================================');
console.log('   REPORT 09 JAVÍTÁSOK PRECÍZ INTEGRÁCIÓS TESZTJE               ');
console.log('================================================================\n');

// 1. Minta teszt és kérdés beszúrása
const qRes = db.prepare(`
  INSERT INTO quizzes (subject_id, title, subject_grade, default_time_limit_min)
  VALUES (1, 'Teszt Feladatsor', '6', 15)
`).run();
const quizId = qRes.lastInsertRowid;

const qstRes = db.prepare(`
  INSERT INTO questions (quiz_id, question_order, question_type, question_text, correct_answer, points)
  VALUES (?, 1, 'ABCD', 'Kérdés szöveg', 'A', 1.0)
`).run(quizId);
const questionId = qstRes.lastInsertRowid;

// Minta diák beszúrása
const stuRes = db.prepare(`
  INSERT INTO students (class_name, student_name)
  VALUES ('6.a', 'Minta Tanuló')
`).run();
const studentId = stuRes.lastInsertRowid;

// Dolgozat indítása -> trigger zárolja a tesztet!
const sRes = db.prepare(`
  INSERT INTO sessions (subject_id, grade_level, quiz_id, class_name, mode, status, time_limit_min)
  VALUES (1, '6', ?, '6.a', 'STUDENT_PACED', 'ACTIVE', 15)
`).run(quizId);
const sessionId = sRes.lastInsertRowid;

console.log('--- 1. TESZT: Zárolt kvíz default_time_limit_min mezőjének módosítási kísérlete ---');
try {
  db.prepare('UPDATE quizzes SET default_time_limit_min = 99 WHERE id = ?').run(quizId);
  console.error('❌ HIBA: Sikerült módosítani a zárolt kvíz időkorlátját!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Az adatbázis helyesen megakadályozta az időkorlát átírását: "${err.message}"`);
}

// Résztvevő beléptetése
const pRes = db.prepare(`
  INSERT INTO participants (session_id, student_id, student_name, pc_number, session_token)
  VALUES (?, ?, 'Minta Tanuló', 5, 'token-123')
`).run(sessionId, studentId);
const participantId = pRes.lastInsertRowid;

// Válasz rögzítése
const aRes = db.prepare(`
  INSERT INTO answers (session_id, participant_id, question_id, submitted_answer, eval_status, is_correct, points_earned, original_points_earned, time_spent_sec)
  VALUES (?, ?, ?, 'A', 'CORRECT', 1, 1.0, 1.0, 20)
`).run(sessionId, participantId, questionId);
const answerId = aRes.lastInsertRowid;

console.log('\n--- 2. TESZT: Leadott diákválasz időadatainak (answered_at, time_spent_sec) módosítási kísérlete ---');
try {
  db.prepare('UPDATE answers SET time_spent_sec = 999 WHERE id = ?').run(answerId);
  console.error('❌ HIBA: Sikerült módosítani a válasz megválaszolási idejét!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Az adatbázis tiltotta az időadat felülírását: "${err.message}"`);
}

console.log('\n--- 3. TESZT: Dolgozat lezárása (FINISHED) ---');
db.prepare("UPDATE sessions SET status = 'FINISHED', ended_at = '2026-11-07T14:00:00.000Z' WHERE id = ?").run(sessionId);
console.log('✓ Dolgozat sikeresen lezárva.');

console.log('\n--- 4. TESZT: REPORT 09 TÁMADÁS: Lezárt dolgozat újranyitása (FINISHED -> ACTIVE) ---');
try {
  db.prepare("UPDATE sessions SET status = 'ACTIVE', ended_at = NULL WHERE id = ?").run(sessionId);
  console.error('❌ KRITIKUS HIBA: A lezárt dolgozat újranyitható volt!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: A kiskapu lezárva! Az újranyitást elutasította: "${err.message}"`);
}

console.log('\n--- 5. TESZT: Lezárt dolgozat befejezési idejének (ended_at) módosítási kísérlete ---');
try {
  db.prepare("UPDATE sessions SET ended_at = '2026-11-07T15:30:00.000Z' WHERE id = ?").run(sessionId);
  console.error('❌ HIBA: Sikerült átírni a lezárt dolgozat befejezési idejét!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Az ended_at módosítása helyesen tiltva: "${err.message}"`);
}

console.log('\n--- 6. TESZT: Lezárt dolgozat beállításainak (grade_thresholds_json, shuffle) módosítási kísérlete ---');
try {
  db.prepare("UPDATE sessions SET grade_thresholds_json = '{\"2\":10}' WHERE id = ?").run(sessionId);
  console.error('❌ HIBA: Sikerült módosítani a lezárt dolgozat ponthatárait!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: A lezárt dolgozat beállításainak módosítása tiltva: "${err.message}"`);
}

console.log('\n--- 7. TESZT: Lezárt dolgozat résztvevőinek adatainak módosítási kísérlete ---');
try {
  db.prepare("UPDATE participants SET student_name = 'Módosított Név' WHERE id = ?").run(participantId);
  console.error('❌ HIBA: Sikerült átírni a lezárt dolgozat résztvevőjének nevét!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: A lezárt dolgozat résztvevői adatainak módosítása tiltva: "${err.message}"`);
}

console.log('\n--- 8. TESZT: Résztvevő törlésének kísérlete lezárt dolgozatból ---');
try {
  db.prepare('DELETE FROM participants WHERE id = ?').run(participantId);
  console.error('❌ HIBA: Sikerült törölni a résztvevőt a lezárt dolgozatból!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: A törlésvédelmi trigger működik: "${err.message}"`);
}

console.log('\n================================================================');
console.log('🎉 REPORT 09 MINDEN HIBA ÉS VÉDELMI JAVÍTÁSA IGAZOLTAN SIKERES! 🎉');
console.log('================================================================\n');

