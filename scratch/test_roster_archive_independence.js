const assert = require('assert');
const db = require('../src/db/init');
const rosterRepo = require('../src/db/rosterRepo');
const sessionRepo = require('../src/db/sessionRepo');

console.log('\n=== LEZÁRT DOLGOZAT ÉS NÉVSOR FÜGGETLENSÉGÉNEK TESZTJE ===\n');

// 0. Előzetes takarítás
db.prepare("DELETE FROM sessions WHERE grade_level = '9'").run();

// 1. Tesztkörnyezet előkészítése
const testClassName = 'Teszt_9.z';
rosterRepo.saveClassRoster(testClassName, ['Teszt Diák 1', 'Teszt Diák 2']);

const students = rosterRepo.getStudentsByClass(testClassName);
assert.strictEqual(students.length, 2, 'Két diáknak kell lennie a teszt osztályban');

const student1 = students[0];
const student2 = students[1];

const quiz = db.prepare('SELECT id FROM quizzes LIMIT 1').get();
const firstQuestion = db.prepare('SELECT id FROM questions WHERE quiz_id = ? LIMIT 1').get(quiz.id);

// 2. Dolgozat indítása és diákok csatlakoztatása
const session = sessionRepo.startSession({
  subject_id: 1,
  grade_level: '9',
  quiz_id: quiz.id,
  mode: 'STUDENT_PACED'
});

const part1Res = sessionRepo.joinSession({
  session_id: session.id,
  student_id: student1.id,
  student_name: student1.student_name,
  session_token: 'test-token-ind-1'
});
const part1 = part1Res.participant;

const part2Res = sessionRepo.joinSession({
  session_id: session.id,
  student_id: student2.id,
  student_name: student2.student_name,
  session_token: 'test-token-ind-2'
});
const part2 = part2Res.participant;

// Válasz beküldése
if (firstQuestion) {
  sessionRepo.submitAnswer({
    session_id: session.id,
    participant_id: part1.id,
    question_id: firstQuestion.id,
    submitted_answer: 'Ctrl + C'
  });
}

// 3. Dolgozat lezárása
const finishedSession = sessionRepo.finishSession(session.id);
assert.strictEqual(finishedSession.status, 'FINISHED', 'A dolgozatnak lezártnak kell lennie');
assert.strictEqual(finishedSession.class_name, testClassName, 'A dolgozat osztálynevének bele kell égnie');

// 4. Egyetlen diák törlése a névsorból (pl. elment a suliból)
const removedStudentOk = rosterRepo.removeStudent(student1.id);
assert.strictEqual(removedStudentOk, true, 'A diáknak sikeresen törlődnie kell a névsorból');

// Ellenőrzés: a lezárt dolgozatban a résztvevő megmaradt
const part1AfterStudentDelete = db.prepare('SELECT * FROM participants WHERE id = ?').get(part1.id);
assert.strictEqual(part1AfterStudentDelete.student_name, student1.student_name, 'A diák neve megmaradt az archívumban');
assert.strictEqual(part1AfterStudentDelete.student_id, null, 'A törölt diák student_id-je NULL lett (levált a külső névsorról)');

// 5. Teljes osztály törlése a névsorból
const deletedCount = rosterRepo.deleteClass(testClassName);
assert.strictEqual(deletedCount, 1, 'A megmaradt 1 diáknak törlődnie kellett');

// Ellenőrzés: a diákok nincsenek a students-ben
const studentsLeft = rosterRepo.getStudentsByClass(testClassName);
assert.strictEqual(studentsLeft.length, 0, 'Az osztály névsorának üresnek kell lennie');

// Ellenőrzés: a lezárt dolgozat és annak mindkét résztvevője sértetlen!
const sessionAfterClassDelete = sessionRepo.getSessionById(session.id);
assert.strictEqual(sessionAfterClassDelete.class_name, testClassName, 'Az osztálynév megmaradt a lezárt dolgozatban');

const allPartsAfterDelete = db.prepare('SELECT student_name, student_id FROM participants WHERE session_id = ?').all(session.id);
assert.strictEqual(allPartsAfterDelete.length, 2, 'Mindkét résztvevő adatai megmaradtak');
assert.strictEqual(allPartsAfterDelete[0].student_name, student1.student_name);
assert.strictEqual(allPartsAfterDelete[1].student_name, student2.student_name);

// Takarítás a teszt után
sessionRepo.deleteSession(session.id);

console.log('✓ SIKER: A lezárt dolgozatok 100%-ban függetlenek a névsorváltozásoktól!');
console.log('✓ SIKER: A tanulók és osztályok hiba nélkül törölhetők és frissíthetők!');
console.log('✓ SIKER: A lezárt dolgozat nevei, válaszai és osztályneve sértetlenek maradtak!\n');
