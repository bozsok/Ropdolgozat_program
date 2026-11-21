const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Izolált tesztkörnyezet támogatása (Report 18 / 4. pont)
process.env.DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'ropdolgozat_test.db');
process.env.UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'data', 'uploads_test');

const quizRepo = require('../src/db/quizRepo');

console.log('=== TESZTEK EGYESÍTÉSE (MERGE) RENDSZERTESZT ===\n');

try {
  // 1. Teszt A létrehozása
  const quizA = quizRepo.createQuiz({
    subject_id: 1,
    title: 'Teszt A - Hardver',
    subject_grade: '6',
    default_time_limit_min: 10,
    questions: [
      {
        question_order: 1,
        question_type: 'ABCD',
        question_text: 'Mi a processzor?',
        instructions: 'Válassz egyet',
        options: ['CPU', 'RAM', 'SSD', 'GPU'],
        correct_answer: 'CPU',
        explanation: 'A CPU a központi vezérlőegység.',
        points: 1
      },
      {
        question_order: 2,
        question_type: 'TF',
        question_text: 'A RAM háttértár?',
        instructions: 'Igaz vagy hamis',
        options: ['Igaz', 'Hamis'],
        correct_answer: 'Hamis',
        explanation: 'A RAM operatív memória, nem háttértár.',
        points: 2
      }
    ]
  });
  console.log(`✓ 1. Teszt A sikeresen létrehozva (ID: ${quizA.id}, Kérdések: ${quizA.questions.length})`);

  // 2. Teszt B létrehozása
  const quizB = quizRepo.createQuiz({
    subject_id: 1,
    title: 'Teszt B - Szoftver',
    subject_grade: '6',
    default_time_limit_min: 15,
    questions: [
      {
        question_order: 1,
        question_type: 'SHORT',
        question_text: 'Mi a Windows?',
        instructions: 'Írd be a választ',
        options: [],
        correct_answer: 'operációs rendszer',
        explanation: 'A Windows egy operációs rendszer.',
        points: 1
      },
      {
        question_order: 2,
        question_type: 'ABCD',
        question_text: 'Melyik böngésző?',
        instructions: 'Válaszd ki',
        options: ['Chrome', 'Word', 'Excel', 'Photoshop'],
        correct_answer: 'Chrome',
        explanation: 'A Chrome egy webböngésző.',
        points: 1.5
      }
    ]
  });
  console.log(`✓ 2. Teszt B sikeresen létrehozva (ID: ${quizB.id}, Kérdések: ${quizB.questions.length})`);

  // 3. Önmagával való egyesítés tesztje (kivétel elvárása)
  assert.throws(() => {
    quizRepo.mergeQuizzes(quizA.id, quizA.id, { title: 'Önmaga' });
  }, /Egy tesztet nem lehet önmagával egyesíteni/, 'Nem dobott hibát önmagával való egyesítéskor!');
  console.log('✓ 3. Önmagával való egyesítés sikeresen elutasítva!');

  // 4. Két teszt egyesítése (Merge)
  const mergedQuiz = quizRepo.mergeQuizzes(quizA.id, quizB.id, {
    title: 'Félévi összefoglaló teszt (Hardver + Szoftver)',
    default_time_limit_min: 25
  });

  console.log(`✓ 4. Egyesített teszt létrejött (ID: ${mergedQuiz.id}, Cím: „${mergedQuiz.title}”)`);
  assert.strictEqual(mergedQuiz.questions.length, 4, 'A kérdések száma nem egyezik meg (2 + 2 = 4)!');
  assert.strictEqual(mergedQuiz.total_points, 5.5, 'Az összpontszám nem egyezik (1 + 2 + 1 + 1.5 = 5.5)!');
  assert.strictEqual(mergedQuiz.default_time_limit_min, 25, 'Az időkorlát nem egyezik!');

  // 5. Kérdések folytonos sorszámozásának ellenőrzése
  const orders = mergedQuiz.questions.map(q => q.question_order);
  assert.deepStrictEqual(orders, [1, 2, 3, 4], 'A kérdések sorszámozása nem folytonos 1-től 4-ig!');
  console.log('✓ 5. Folytonos sorszámozás ellenőrizve: [1, 2, 3, 4]');

  // 6. Kérdések tartalmának ellenőrzése
  assert.strictEqual(mergedQuiz.questions[0].question_text, 'Mi a processzor?');
  assert.strictEqual(mergedQuiz.questions[1].question_text, 'A RAM háttértár?');
  assert.strictEqual(mergedQuiz.questions[2].question_text, 'Mi a Windows?');
  assert.strictEqual(mergedQuiz.questions[3].question_text, 'Melyik böngésző?');
  console.log('✓ 6. Kérdések szövegei és típusai maradéktalanul és pontos sorrendben átkerültek!');

  // 7. Nem-destruktív működés ellenőrzése (az eredeti tesztek épek)
  const reloadA = quizRepo.getQuizById(quizA.id, false);
  const reloadB = quizRepo.getQuizById(quizB.id, false);
  assert.strictEqual(reloadA.questions.length, 2, 'A Teszt A kérdésszáma megváltozott!');
  assert.strictEqual(reloadB.questions.length, 2, 'A Teszt B kérdésszáma megváltozott!');
  console.log('✓ 7. Nem-destruktív működés: Az eredeti tesztek érintetlenek maradtak!');

  // Takarítás a teszt után
  quizRepo.deleteQuiz(quizA.id);
  quizRepo.deleteQuiz(quizB.id);
  quizRepo.deleteQuiz(mergedQuiz.id);
  console.log('✓ 8. Tesztadatok kitakarítva.\n');

  console.log('🎉 MINDEN MERGE TESZT SIKERESEN LEFUTOTT! 🎉\n');
} catch (err) {
  console.error('❌ HIBA A MERGE TESZTBEN:', err);
  process.exit(1);
}
