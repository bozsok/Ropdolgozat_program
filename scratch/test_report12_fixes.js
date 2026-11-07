const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');
const db = require('../src/db/init');
const sessionRepo = require('../src/db/sessionRepo');

console.log('================================================================');
console.log('   REPORT 12 CÉLZOTT ELLENŐRZŐ TESZTEK                          ');
console.log('================================================================\n');

// 1. Teszt kvíz létrehozása 2.0 és 1.0 pontos kérdésekkel
const qRes = db.prepare(`
  INSERT INTO quizzes (subject_id, title, subject_grade, default_time_limit_min)
  VALUES (1, 'Report 12 Teszt Kvíz', '7', 15)
`).run();
const quizId = qRes.lastInsertRowid;

const qstRes1 = db.prepare(`
  INSERT INTO questions (quiz_id, question_order, question_type, question_text, correct_answer, points)
  VALUES (?, 1, 'ABCD', 'Kérdés 1 (2 pont)', 'A', 2.0)
`).run(quizId);
const questionId1 = qstRes1.lastInsertRowid; // max_points = 2.0

const qstRes2 = db.prepare(`
  INSERT INTO questions (quiz_id, question_order, question_type, question_text, correct_answer, points)
  VALUES (?, 2, 'ABCD', 'Kérdés 2 (1 pont)', 'B', 1.0)
`).run(quizId);
const questionId2 = qstRes2.lastInsertRowid; // max_points = 1.0

// Diák biztosítása
let student = db.prepare("SELECT * FROM students WHERE class_name = '7.a' AND student_name = 'Nagy Dániel'").get();
if (!student) {
  const stuRes = db.prepare("INSERT INTO students (class_name, student_name) VALUES ('7.a', 'Nagy Dániel')").run();
  student = { id: stuRes.lastInsertRowid };
}
const studentId = student.id;

// Ha a 7. évfolyamon van aktív dolgozat, lezárjuk
const active7 = sessionRepo.getActiveSessionByChannel(1, '7');
if (active7) {
  sessionRepo.finishSession(active7.id);
}

// Dolgozat indítása
const session = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '7',
  quiz_id: quizId,
  class_name: '7.a',
  mode: 'STUDENT_PACED',
  time_limit_min: 15
});
const sessionId = session.id;

// Diák beléptetése a 12-es gépről
const join1 = sessionRepo.joinSession({
  session_id: sessionId,
  student_id: studentId,
  student_name: 'Nagy Dániel',
  pc_number: 12
});
const participantId = join1.participant.id;
const oldToken = join1.participant.session_token;

console.log('--- 1. TESZT: Pontplafon túllépésénél hibajelzés automatikus levágás helyett (Report 12 / 2.1) ---');
// Diák leadja az 1. választ (2.0 pontos kérdés)
const ans1 = sessionRepo.submitAnswer({
  participant_id: participantId,
  question_id: questionId1,
  submitted_answer: 'A',
  time_spent_sec: 10
});
console.log(`✓ Válasz beküldve: pont = ${ans1.answer.points_earned}p (max: 2.0p)`);

// 1.1. Tanár véletlenül 3.0 pontot ad a 2.0 pontos kérdésre:
try {
  sessionRepo.overrideAnswer({
    answer_id: ans1.answer.id,
    eval_status: 'CORRECT',
    custom_points: 3.0 // Túl magas pontszám!
  });
  console.error('❌ HIBA: A rendszer nem dobott hibát a túl magas pontszámra, hanem lecsökkentette vagy elfogadta!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Egyértelmű hibaüzenet érkezett automatikus csendes pontlevágás helyett: "${err.message}"`);
}

// 1.2. Tanár negatív pontszámot ad:
try {
  sessionRepo.overrideAnswer({
    answer_id: ans1.answer.id,
    eval_status: 'WRONG',
    custom_points: -1.0
  });
  console.error('❌ HIBA: Negatív pontszámot fogadott el a felülbírálás!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Negatív pontszám elutasítva: "${err.message}"`);
}

// 1.3. Tanár PARTIAL státuszt ad 0 ponttal:
try {
  sessionRepo.overrideAnswer({
    answer_id: ans1.answer.id,
    eval_status: 'PARTIAL',
    custom_points: 0.0
  });
  console.error('❌ HIBA: PARTIAL státuszt nulla ponttal engedélyezett!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Nulla pontos PARTIAL értékelés elutasítva: "${err.message}"`);
}

// 1.4. Tanár nem véges számot ad meg (Infinity / NaN) (Report 13 / 1.1):
try {
  sessionRepo.overrideAnswer({
    answer_id: ans1.answer.id,
    eval_status: 'CORRECT',
    custom_points: Infinity
  });
  console.error('❌ HIBA: Infinity értéket fogadott el a pontozás!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Infinity érték elutasítva a Number.isFinite() által: "${err.message}"`);
}

// 1.5. Szabályos felülbírálás 1.5 pontra:
const validOverride = sessionRepo.overrideAnswer({
  answer_id: ans1.answer.id,
  eval_status: 'PARTIAL',
  custom_points: 1.5
});
console.log(`✓ SIKER: Szabályos felülbírálás sikeresen érvényesült: pont = ${validOverride.points_earned}p, státusz = ${validOverride.eval_status}`);


console.log('\n--- 2. TESZT: Gépváltás adatvesztés nélkül és Célgépes védelem (Report 12 / 2.2 & Report 13 / 1.2) ---');
// 2.1. Tanári engedély nélkül egy idegen gépről (15. gép) a tanuló nevével próbálnak belépni:
try {
  sessionRepo.joinSession({
    session_id: sessionId,
    student_id: studentId,
    student_name: 'Nagy Dániel',
    pc_number: 15,
    session_token: null
  });
  console.error('❌ HIBA: Tanári engedély nélkül sikerült átvenni a nevet az új gépről!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: Tanári engedély nélküli átvétel megtiltva: "${err.message}"`);
}

// 2.2. A tanár kifejezetten a 15-ös gépre engedélyezi a gépváltást (Report 13 / 1.2):
const authResult = sessionRepo.authorizeSeatChange(participantId, 15);
console.log(`✓ SIKER: Tanári gépváltás engedélyezve a 15-ös munkaállomásra: diák = ${authResult.studentName}, célgép = ${authResult.targetPcNumber}`);

// 2.3. Egy másik, nem jogosult gép (16. gép) próbálja átvenni a nevet az engedély után:
try {
  sessionRepo.joinSession({
    session_id: sessionId,
    student_id: studentId,
    student_name: 'Nagy Dániel',
    pc_number: 16,
    session_token: null
  });
  console.error('❌ HIBA: Sikerült átvenni a nevet egy nem engedélyezett gépről (16. gép)!');
  process.exit(1);
} catch (err) {
  console.log(`✓ SIKER: A célgépes védelem megakadályozta az illetéktelen gép (16-os) belépését: "${err.message}"`);
}

// 2.4. A diák a kijelölt célgépről (15. gép) jelentkezik be:
const seatChangeJoin = sessionRepo.joinSession({
  session_id: sessionId,
  student_id: studentId,
  student_name: 'Nagy Dániel',
  pc_number: 15,
  session_token: null // Az új gépen még nincs token
});
console.log(`✓ SIKER: Bejelentkezés a kijelölt 15-ös gépről sikeres! seatChanged = ${seatChangeJoin.seatChanged}`);
console.log(`✓ Új token kiadva: ${seatChangeJoin.participant.session_token.slice(0, 8)}... (Régi token: ${oldToken.slice(0, 8)}...)`);
console.log(`✓ Korábbi válaszok száma a gépváltás után: ${seatChangeJoin.answers.length} db (VÁLASZOK MEGMARADTAK, 0 ADATVESZTÉS!)`);
console.log(`✓ Korábbi válasz pontszáma: ${seatChangeJoin.answers[0].points_earned}p`);

if (seatChangeJoin.answers.length !== 1 || seatChangeJoin.participant.session_token === oldToken) {
  console.error('❌ HIBA: A korábbi válaszok elvesztek vagy a token nem újult meg!');
  process.exit(1);
}

// 2.4. A régi gép a régi tokenjével próbál válaszolni a 2. kérdésre:
try {
  const pOld = sessionRepo.getParticipantByToken(oldToken);
  if (pOld) {
    console.error('❌ HIBA: A régi token még mindig aktív résztvevőre mutat!');
    process.exit(1);
  }
  console.log('✓ SIKER: A régi gépen tárolt régi token azonnal érvénytelenné vált!');
} catch (err) {
  console.log(`✓ SIKER: Régi token elutasítva: ${err.message}`);
}

// 2.5. A diák az új gépen megválaszolja a 2. kérdést az új tokennel:
const ans2 = sessionRepo.submitAnswer({
  participant_id: seatChangeJoin.participant.id,
  question_id: questionId2,
  submitted_answer: 'B',
  time_spent_sec: 14
});
console.log(`✓ SIKER: 2. válasz sikeresen rögzítve az új gépről: pont = ${ans2.answer.points_earned}p, befejezve = ${ans2.isFinished}`);


console.log('\n--- 3. TESZT: Téves névfoglalás törlése (resetParticipant) (Report 12 / 2.2) ---');
// Új diák beléptetése egy téves kattintás szimulálásához
let student2 = db.prepare("SELECT * FROM students WHERE class_name = '7.a' AND student_name = 'Téves Tanuló'").get();
if (!student2) {
  const s2 = db.prepare("INSERT INTO students (class_name, student_name) VALUES ('7.a', 'Téves Tanuló')").run();
  student2 = { id: s2.lastInsertRowid };
}

const joinWrong = sessionRepo.joinSession({
  session_id: sessionId,
  student_id: student2.id,
  student_name: 'Téves Tanuló',
  pc_number: 18
});
// Tévesen lead egy választ
sessionRepo.submitAnswer({
  participant_id: joinWrong.participant.id,
  question_id: questionId1,
  submitted_answer: 'X'
});

console.log('✓ Tévesen belépett résztvevő és válasz rögzítve.');
// A tanár törli a téves névfoglalást (resetParticipant)
sessionRepo.resetParticipant(joinWrong.participant.id);

// Ellenőrizzük, hogy törlődött-e a résztvevő és a válaszai
const partCheck = db.prepare('SELECT COUNT(*) as cnt FROM participants WHERE id = ?').get(joinWrong.participant.id).cnt;
const ansCheck = db.prepare('SELECT COUNT(*) as cnt FROM answers WHERE participant_id = ?').get(joinWrong.participant.id).cnt;

if (partCheck === 0 && ansCheck === 0) {
  console.log('✓ SIKER: A téves névfoglalás és a válaszok maradéktalanul törlődtek az aktív dolgozatból!');
} else {
  console.error('❌ HIBA: A téves rekord nem törlődött teljesen!');
  process.exit(1);
}


console.log('\n--- 4. TESZT: Két valóban független adatbázis-kapcsolat konkurrens lezárása (Report 12 / 2.3) ---');
// Új kapcsolat nyitása a meglévő mellé ugyanarra az adatbázisfájlra
const conn2 = new Database(config.dbPath);
conn2.pragma('journal_mode = WAL');

// 4.1. Első lezárás a főkapcsolaton (sessionRepo)
const finish1 = sessionRepo.finishSession(sessionId);
console.log(`✓ Első kapcsolat lezárása sikeres: status = ${finish1.status}, ended_at = ${finish1.ended_at}`);

// 4.2. Második lezárási kísérlet a független conn2 kapcsolaton ugyanarra a session-re:
const conn2UpdateStmt = conn2.prepare(`
  UPDATE sessions 
  SET status = 'FINISHED', ended_at = CURRENT_TIMESTAMP
  WHERE id = ? AND status = 'ACTIVE'
`);
const conn2Res = conn2UpdateStmt.run(sessionId);
console.log(`✓ Második független kapcsolat UPDATE módosításainak száma: ${conn2Res.changes} (Elvárt: 0)`);

if (conn2Res.changes !== 0) {
  console.error('❌ HIBA: A második kapcsolatnak sikerült újra módosítania a lezárt dolgozatot!');
  process.exit(1);
}

// 4.3. Konzisztencia és ended_at változatlanság ellenőrzése mindkét kapcsolaton keresztül:
const checkConn1 = db.prepare('SELECT status, ended_at FROM sessions WHERE id = ?').get(sessionId);
const checkConn2 = conn2.prepare('SELECT status, ended_at FROM sessions WHERE id = ?').get(sessionId);

if (checkConn1.ended_at === finish1.ended_at && checkConn2.ended_at === finish1.ended_at) {
  console.log(`✓ SIKER: Az ended_at időbélyeg változatlan maradt (${checkConn1.ended_at}), a második kapcsolat nem írt felül semmit!`);
} else {
  console.error('❌ HIBA: Az ended_at megváltozott a konkurens kísérlet miatt!');
  process.exit(1);
}

conn2.close();

console.log('\n================================================================');
console.log('🎉 REPORT 12 MINDEN CÉLZOTT ELLENŐRZÉSE SIKERESEN LEFUTOTT!    🎉');
console.log('================================================================\n');

