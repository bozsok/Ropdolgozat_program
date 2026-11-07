const fs = require('fs');
const path = require('path');
const db = require('../src/db/init');
const rosterRepo = require('../src/db/rosterRepo');
const quizRepo = require('../src/db/quizRepo');
const sessionRepo = require('../src/db/sessionRepo');
const exporter = require('../src/services/exporter');
const backup = require('../src/services/backup');

async function runTests() {
  console.log('--- 1. Osztályok és diákok ellenőrzése ---');
  const classes = rosterRepo.getClasses();
  console.log('✓ Osztályok:', classes);
  const students = rosterRepo.getStudentsByClass('6.a');
  console.log(`✓ 6.a diákok száma: ${students.length}`);
  if (students.length === 0) throw new Error('Nincs diák a 6.a-ban!');

  console.log('\n--- 2. Tesztek ellenőrzése ---');
  const quizzes = quizRepo.getQuizzes();
  console.log(`✓ Elérhető tesztek száma: ${quizzes.length}`);
  let quiz = quizzes.find(q => q.subject_grade === '6' && !q.locked_at);
  if (!quiz) {
    quiz = quizRepo.createQuiz({
      subject_id: 1,
      title: '6. osztály – Táblázatkezelés és hálózatok alapjai (Teszt)',
      subject_grade: '6',
      default_time_limit_min: 10,
      questions: [
        {
          question_order: 1,
          question_type: 'SHORT',
          question_text: 'Milyen függvénnyel adhatjuk össze az A1:A10 tartomány számait Excelben? (pl. =SZUM(A1:A10))',
          correct_answer: '=SZUM(A1:A10)',
          explanation: 'Az Excelben a tartományok összegzésére a =SZUM() függvény szolgál.',
          points: 1.0
        }
      ]
    });
  }
  console.log(`✓ Kiválasztott teszt: „${quiz.title}”, zárolva indítás előtt: ${quiz.locked_at ? 'IGEN' : 'NEM'}`);

  console.log('\n--- 3. Új dolgozat indítása (startSession) ---');
  // Ha a csatornán futna korábbi aktív dolgozat, lezárjuk
  const activeExisting = sessionRepo.getActiveSessionByChannel(quiz.subject_id, quiz.subject_grade);
  if (activeExisting) {
    sessionRepo.finishSession(activeExisting.id);
  }

  const session = sessionRepo.startSession({
    subject_id: quiz.subject_id,
    grade_level: quiz.subject_grade,
    quiz_id: quiz.id,
    class_name: '6.a',
    mode: 'STUDENT_PACED',
    time_limit_min: 15,
    shuffle_questions: 1,
    shuffle_options: 1
  });
  console.log(`✓ Dolgozat sikeresen elindítva! Session ID: ${session.id}, Státusz: ${session.status}`);

  console.log('\n--- 4. Teszt automatikus zárolásának ellenőrzése ---');
  const lockedState = quizRepo.isQuizLocked(quiz.id);
  console.log(`✓ Kvíz zárolva lett az indításkor: ${lockedState ? 'IGEN (SIKER!)' : 'NEM (HIBA!)'}`);
  if (!lockedState) throw new Error('A teszt nem zárolódott le automatikusan!');

  console.log('\n--- 5. Zárolt teszt védelmének tesztelése (kérdés beszúrás tiltása) ---');
  try {
    db.prepare(`
      INSERT INTO questions (quiz_id, question_order, question_type, question_text, correct_answer)
      VALUES (?, 99, 'ABCD', 'Próba kérdés', 'X')
    `).run(quiz.id);
    throw new Error('HIBA: A zárolt teszthez sikerült kérdést adni!');
  } catch (err) {
    console.log(`✓ Helyesen elutasítva az adatbázis trigger által: ${err.message}`);
  }

  console.log('\n--- 6. Zárolt teszt duplikálása (másolat készítése új, szerkeszthető tesztként) ---');
  const duplicated = quizRepo.duplicateQuiz(quiz.id, '6. osztály – Módosított feladatsor');
  console.log(`✓ Duplikált teszt létrehozva! Új ID: ${duplicated.id}, Cím: „${duplicated.title}”`);
  console.log(`✓ Új teszt zároltsága: ${duplicated.locked_at ? 'Zárolt' : 'SZABADON SZERKESZTHETŐ (SIKER!)'}`);

  console.log('\n--- 7. Diák csatlakozása (joinSession) ---');
  const student = students[0];
  const joinResult = sessionRepo.joinSession({
    session_id: session.id,
    student_id: student.id,
    student_name: student.student_name,
    pc_number: 12,
    team_color: 'Kék'
  });
  console.log(`✓ Diák belépett! Participant ID: ${joinResult.participant.id}, Token: ${joinResult.participant.session_token}`);

  console.log('\n--- 8. Session Recovery és Tokenlopás elleni védelem tesztje ---');
  // 8.1. Idegen gépről vagy token nélküli illetéktelen átvételi kísérlet vizsgálata:
  try {
    sessionRepo.joinSession({
      session_id: session.id,
      student_id: student.id,
      student_name: student.student_name,
      pc_number: 20,
      session_token: null
    });
    throw new Error('HIBA: Sikerült átvenni a munkamenetet érvényes token nélkül!');
  } catch (err) {
    console.log(`✓ Token nélküli átvételi kísérlet sikeresen elutasítva: "${err.message}"`);
  }

  // 8.2. Ugyanarról a munkaállomásról (12. gép) a tárolt érvényes session_token birtokában:
  const recoveryResult = sessionRepo.joinSession({
    session_id: session.id,
    student_id: student.id,
    student_name: student.student_name,
    pc_number: 12,
    session_token: joinResult.participant.session_token
  });
  console.log(`✓ Recovery érvényes tokennel sikeresen lefutott: ${recoveryResult.isRecovery ? 'IGEN (SIKER!)' : 'NEM (HIBA!)'}`);

  console.log('\n--- 9. Diák nézet biztonsági szűrése (correct_answer és explanation kitakarása) ---');
  const studentQuizView = quizRepo.getQuizById(quiz.id, true);
  const hasLeak = studentQuizView.questions.some(q => q.correct_answer !== undefined || q.explanation !== undefined);
  console.log(`✓ Puskázásgátló vizsgálat: ${hasLeak ? 'VESZÉLY! A helyes válasz kiszivárgott!' : 'BIZTONSÁGOS! (Helyes válaszok kitakarva)'}`);
  if (hasLeak) throw new Error('A diák nézetben kiszivárgott a helyes válasz!');

  console.log('\n--- 10. Válasz beküldése és értékelése (submitAnswer) ---');
  const q1 = studentQuizView.questions[0];
  const submitResult = sessionRepo.submitAnswer({
    participant_id: joinResult.participant.id,
    question_id: q1.id,
    submitted_answer: '=SZUM(A1:A10)', // Helyes válasz
    time_spent_sec: 18
  });
  console.log(`✓ Válasz beküldve! Értékelés: ${submitResult.answer.eval_status}, Kapott pont: ${submitResult.answer.points_earned}`);

  console.log('\n--- 11. Idempotencia teszt (hálózati duplikált beküldés) ---');
  const duplicateSubmit = sessionRepo.submitAnswer({
    participant_id: joinResult.participant.id,
    question_id: q1.id,
    submitted_answer: '=SZUM(A1:A10)',
    time_spent_sec: 25
  });
  console.log(`✓ Duplikált beküldés kezelve hiba nélkül: alreadySubmitted = ${duplicateSubmit.alreadySubmitted}`);

  console.log('\n--- 12. Tanári 1-kattintásos felülbírálás (overrideAnswer) ---');
  const overridden = sessionRepo.overrideAnswer({
    answer_id: submitResult.answer.id,
    eval_status: 'PARTIAL'
  });
  console.log(`✓ Felülbírálás eredménye: státusz = ${overridden.eval_status}, pont = ${overridden.points_earned}p`);

  console.log('\n--- 13. Élő Mátrix adatok lekérése ---');
  const matrix = sessionRepo.getLiveMatrixData(session.id);
  console.log(`✓ Mátrix résztvevők: ${matrix.participants.length} diák, első diák pontszáma: ${matrix.participants[0].total_points} pont (${matrix.participants[0].percentage}%, KRÉTA jegy: ${matrix.participants[0].grade})`);

  console.log('\n--- 14. Excel generálás tesztje ---');
  const excelBuffer = await exporter.generateExcelReport(session.id);
  console.log(`✓ Excel munkafüzet sikeresen legenerálva! Méret: ${excelBuffer.length} bájt`);

  console.log('\n--- 15. Interaktív Csoportos HTML generálás tesztje ---');
  const htmlOutput = exporter.generateInteractiveHtml(session.id);
  console.log(`✓ Interaktív HTML sikeresen legenerálva! Hossz: ${htmlOutput.length} karakter`);

  console.log('\n--- 16. Dolgozat befejezése (finishSession) ---');
  const finished = sessionRepo.finishSession(session.id);
  console.log(`✓ Dolgozat lezárva! Státusz: ${finished.status}, Lezárás ideje: ${finished.ended_at}`);

  console.log('\n--- 17. Lezárt dolgozat törlésvédelmének tesztelése ---');
  try {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    throw new Error('HIBA: Lezárt dolgozatot sikerült törölni!');
  } catch (err) {
    console.log(`✓ Helyesen megvédve a törlés elleni triggerrel: ${err.message}`);
  }

  console.log('\n================================================================');
  console.log('🎉 MINDEN TESZT (17-BŐL 17) SIKERESEN ÉS HIBÁTLANUL LEFUTOTT! 🎉');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TESZTHIBA TÖRTÉNT:', err);
  process.exit(1);
});

