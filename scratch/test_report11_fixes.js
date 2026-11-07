const fs = require('fs');
const path = require('path');
const db = require('../src/db/init');
const sessionRepo = require('../src/db/sessionRepo');

console.log('================================================================');
console.log('   REPORT 11 CÉLZOTT ELLENŐRZŐ TESZTEK                          ');
console.log('================================================================\n');

// 1. Teszt kvíz beszúrása 2.0 pontos kérdéssel
const qRes = db.prepare(`
  INSERT INTO quizzes (subject_id, title, subject_grade, default_time_limit_min)
  VALUES (1, 'Report 11 Teszt Kvíz', '9', 15)
`).run();
const quizId = qRes.lastInsertRowid;

const qstRes = db.prepare(`
  INSERT INTO questions (quiz_id, question_order, question_type, question_text, correct_answer, points)
  VALUES (?, 1, 'ABCD', 'Kérdés 1', 'A', 2.0)
`).run(quizId);
const questionId = qstRes.lastInsertRowid; // max_points = 2.0

const qstRes2 = db.prepare(`
  INSERT INTO questions (quiz_id, question_order, question_type, question_text, correct_answer, points)
  VALUES (?, 2, 'ABCD', 'Kérdés 2', 'B', 1.0)
`).run(quizId);
const questionId2 = qstRes2.lastInsertRowid;

// Diák biztosítása
let student = db.prepare("SELECT * FROM students WHERE class_name = '9.a' AND student_name = 'Kovács Ágnes'").get();
if (!student) {
  const stuRes = db.prepare("INSERT INTO students (class_name, student_name) VALUES ('9.a', 'Kovács Ágnes')").run();
  student = { id: stuRes.lastInsertRowid };
}
const studentId = student.id;

// Ha a 9. évfolyamon van aktív dolgozat korábbi tesztből, lezárjuk
const active9 = sessionRepo.getActiveSessionByChannel(1, '9');
if (active9) {
  sessionRepo.finishSession(active9.id);
}

// Dolgozat indítása a sessionRepo-val
const session = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '9',
  quiz_id: quizId,
  class_name: '9.a',
  mode: 'STUDENT_PACED',
  time_limit_min: 15
});
const sessionId = session.id;

// Résztvevő beléptetése
const join1 = sessionRepo.joinSession({
  session_id: sessionId,
  student_id: studentId,
  student_name: 'Kovács Ágnes',
  pc_number: 12
});
const participantId = join1.participant.id;
const validToken = join1.participant.session_token;

console.log('--- 1. TESZT: PARTIAL státusz esetén nulla pont elutasítása a CHECK által ---');
try {
  db.prepare(`
    INSERT INTO answers (session_id, participant_id, question_id, submitted_answer, eval_status, is_correct, points_earned, original_points_earned)
    VALUES (?, ?, ?, 'X', 'PARTIAL', 1, 0.0, 0.0)
  `).run(sessionId, participantId, questionId);
  console.error('❌ HIBA: Sikerült PARTIAL státuszt nulla ponttal beszúrni!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Az adatbázis CHECK feltétele elutasította a nulla pontos PARTIAL értékelést: "${err.message}"`);
}

console.log('\n--- 2. TESZT: Kérdés maximális pontszámát (2.0p) meghaladó pontszám (5.0p) beszúrásának tiltása ---');
try {
  db.prepare(`
    INSERT INTO answers (session_id, participant_id, question_id, submitted_answer, eval_status, is_correct, points_earned, original_points_earned)
    VALUES (?, ?, ?, 'A', 'CORRECT', 1, 5.0, 5.0)
  `).run(sessionId, participantId, questionId);
  console.error('❌ HIBA: Sikerült a maximális pontszámot meghaladó értéket beszúrni!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: A trg_validate_answer_points_limit trigger megvédte a pontmaximumot: "${err.message}"`);
}

// Szabályos válasz beküldése a submitAnswer-rel (2.0 pont)
const sub = sessionRepo.submitAnswer({
  participant_id: participantId,
  question_id: questionId,
  submitted_answer: 'A',
  time_spent_sec: 12
});
console.log(`✓ Szabályos válasz rögzítve: pont = ${sub.answer.points_earned}p`);

console.log('\n--- 3. TESZT: Maximális pontszám túllépésének tiltása felülbíráláskor (UPDATE) ---');
try {
  db.prepare(`
    UPDATE answers SET points_earned = 10.0 WHERE id = ?
  `).run(sub.answer.id);
  console.error('❌ HIBA: Sikerült átírni a pontszámot a maximum fölé!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: A trg_validate_answer_points_limit_update trigger tiltotta a túlpontozást: "${err.message}"`);
}

console.log('\n--- 4. TESZT: OWASP Tokenbiztonság (Másik böngésző nem veheti át a munkamenetet token nélkül) ---');
// 4.1. Kísérlet: Egy másik böngészőből egyszerűen a névre kattintanak token nélkül:
try {
  sessionRepo.joinSession({
    session_id: sessionId,
    student_id: studentId,
    student_name: 'Kovács Ágnes',
    pc_number: 12,
    session_token: null // Nincs token!
  });
  console.error('❌ HIBA: Token nélkül sikerült átvenni a munkamenetet!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Token nélküli átvételi kísérlet elutasítva: "${err.message}"`);
}

// 4.2. Ugyanez a böngésző a saját érvényes tokenjével:
const validRecovery = sessionRepo.joinSession({
  session_id: sessionId,
  student_id: studentId,
  student_name: 'Kovács Ágnes',
  pc_number: 12,
  session_token: validToken // Érvényes token
});
console.log(`✓ SIKER: Érvényes tokennel a munkamenet sikeresen folytatható: isRecovery = ${validRecovery.isRecovery}`);

console.log('\n--- 5. TESZT: Párhuzamossági garancia – Két egyidejű tanári lezárás kezelése ---');
// Első lezárás
const finish1 = sessionRepo.finishSession(sessionId);
console.log(`✓ Első tanári lezárás sikeres! Státusz: ${finish1.status}, ended_at: ${finish1.ended_at}`);

// Második egyidejű lezárási kísérlet
try {
  sessionRepo.finishSession(sessionId);
  console.error('❌ HIBA: A már lezárt dolgozatot újra le lehetett zárni!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: A második párhuzamos lezárást a rendszer biztonságosan elutasította: "${err.message}"`);
}

// Ellenőrizzük az integritást
const sessionCheck = sessionRepo.getSessionById(sessionId);
if (sessionCheck.status !== 'FINISHED' || sessionCheck.ended_at !== finish1.ended_at) {
  console.error('❌ HIBA: A session lezárási adatai inkonzisztenssé váltak!');
  process.exit(1);
}
console.log('✓ SIKER: A dolgozat pontosan egyszer zárult le, az adatok megőrizték integritásukat.');

console.log('\n--- 6. TESZT: Párhuzamossági garancia – Válaszbeküldés a lezárás után ---');
// 6.1. Alkalmazásszintű kísérlet (submitAnswer) új kérdésre lezárás után
try {
  sessionRepo.submitAnswer({
    participant_id: participantId,
    question_id: questionId2,
    submitted_answer: 'B'
  });
  console.error('❌ HIBA: Sikerült választ beküldeni a lezárt dolgozathoz az alkalmazáson keresztül!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Az alkalmazás elutasította a lezárás utáni választ: "${err.message}"`);
}

// 6.2. Közvetlen SQL kísérlet az adatbázis megkerülésével új kérdésre lezárás után
try {
  db.prepare(`
    INSERT INTO answers (session_id, participant_id, question_id, submitted_answer, eval_status, is_correct, points_earned, original_points_earned)
    VALUES (?, ?, ?, 'B', 'CORRECT', 1, 1.0, 1.0)
  `).run(sessionId, participantId, questionId2);
  console.error('❌ HIBA: Közvetlen SQL-lel sikerült választ beszúrni lezárt dolgozatba!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Az adatbázis trigger (trg_prevent_answer_insert_when_finished) tiltotta a közvetlen SQL beszúrást is: "${err.message}"`);
}

console.log('\n================================================================');
console.log('🎉 REPORT 11 MINDEN CÉLZOTT ELLENŐRZÉSE SIKERESEN LEFUTOTT!    🎉');
console.log('================================================================\n');
