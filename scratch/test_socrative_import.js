const fs = require('fs');
const path = require('path');
const assert = require('assert');
// Izolált teszt adatbázis és feltöltési mappa használata az éles ropdolgozat.db védelmében
process.env.DB_PATH = path.join(__dirname, '..', 'data', 'ropdolgozat_test.db');
process.env.UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads_test');

const { parseSocrativePdf } = require('../src/services/socrativePdfParser');
const quizRepo = require('../src/db/quizRepo');
const config = require('../config');

console.log('=== SOCRATIVE PDF IMPORT RENDSZERTESZT ===\n');

// 1. Tanári megoldókulcsos PDF tesztelése
const keyPdfPath = path.join(__dirname, '..', 'Source', 'Quiz_01 - A digitális világ körülöttünk-1.pdf');
if (fs.existsSync(keyPdfPath)) {
  const buf = fs.readFileSync(keyPdfPath);
  const result = parseSocrativePdf(buf);

  console.log('1. Megoldókulcsos PDF elemzése:');
  console.log(`   Cím: ${result.quizTitle}`);
  console.log(`   Kérdések száma: ${result.questions.length}`);

  assert.strictEqual(result.questions.length, 10, 'A kérdések száma 10 kell legyen');
  assert.strictEqual(result.questions[0].question_type, 'TF');
  assert.strictEqual(result.questions[0].correct_answer, 'A');
  assert.strictEqual(result.questions[3].question_type, 'TF');
  assert.strictEqual(result.questions[3].correct_answer, 'B');
  assert.strictEqual(result.questions[4].correct_answer, 'C');

  const withImages = result.questions.filter(q => q.imageBuffer);
  console.log(`   Beágyazott képekkel rendelkező kérdések száma: ${withImages.length}`);
  assert.strictEqual(withImages.length, 8, '8 kérdéshez kell kép tartozzon');
  console.log('   ✓ Megoldókulcsos PDF sikeresen ellenőrizve!\n');
}

// 2. Diák változat (megoldókulcs nélküli) tesztelése
const studentPdfPath = path.join(__dirname, '..', 'Source', 'Quiz_01 - A digitális világ körülöttünk.pdf');
if (fs.existsSync(studentPdfPath)) {
  const buf = fs.readFileSync(studentPdfPath);
  const result = parseSocrativePdf(buf);

  console.log('2. Megoldókulcs nélküli diák PDF elemzése:');
  console.log(`   Cím: ${result.quizTitle}`);
  console.log(`   Kérdések száma: ${result.questions.length}`);
  assert.strictEqual(result.questions.length, 10, 'A kérdések száma 10 kell legyen');
  const withImages = result.questions.filter(q => q.imageBuffer);
  console.log(`   Beágyazott képek száma: ${withImages.length}`);
  assert.strictEqual(withImages.length, 8, '8 kép kell');
  console.log('   ✓ Megoldókulcs nélküli PDF sikeresen ellenőrizve!\n');
}

// 3. Kvíz létrehozása és képek áthelyezésének ellenőrzése
if (fs.existsSync(keyPdfPath)) {
  console.log('3. Kvíz létrehozás és fájlkezelés tesztelése:');
  const buf = fs.readFileSync(keyPdfPath);
  const parsed = parseSocrativePdf(buf);

  const tempDir = path.join(config.uploadsDir, 'quizzes', 'temp');
  fs.mkdirSync(tempDir, { recursive: true });

  const timestamp = Date.now();
  parsed.questions.forEach((q, idx) => {
    if (q.imageBuffer) {
      const filename = `test_imp_${timestamp}_${idx + 1}.png`;
      fs.writeFileSync(path.join(tempDir, filename), q.imageBuffer);
      q.image_path = `/uploads/quizzes/temp/${filename}`;
    } else {
      q.image_path = null;
    }
    delete q.imageBuffer;
  });

  const quiz = quizRepo.createQuiz({
    subject_id: 1,
    folder_id: null,
    title: 'Automata Import Teszt',
    subject_grade: '6',
    questions: parsed.questions
  });

  assert(quiz.id > 0, 'Kvíz ID érvényes');
  const qWithImg = quiz.questions.filter(q => q.image_path);
  assert.strictEqual(qWithImg.length, 8, '8 kérdésnek van végleges képe');

  for (const q of qWithImg) {
    assert(q.image_path.startsWith(`/uploads/quizzes/quiz-${quiz.id}/`), 'Végleges kvíz mappába került');
    const fullPath = path.join(config.uploadsDir, '..', q.image_path);
    assert(fs.existsSync(fullPath), `Fájl létezik a lemezen: ${fullPath}`);
  }

  console.log(`   ✓ Kvíz #${quiz.id} sikeresen létrejött, 8 kép véglegesítve és ellenőrizve!`);

  // Takarítás
  quizRepo.deleteQuiz(quiz.id);
  console.log(`   ✓ Kvíz #${quiz.id} és képei sikeresen kitakarítva!\n`);
} else {
  console.log('3. Kvíz létrehozás tesztelése beágyazott képpel (Mock):');
  const { createPng } = require('../src/services/socrativePdfParser');
  const mockPng = createPng(2, 2, Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]));
  assert(mockPng.length > 0, 'createPng érvényes PNG-t generál');

  const tempDir = path.join(config.uploadsDir, 'quizzes', 'temp');
  fs.mkdirSync(tempDir, { recursive: true });
  const filename = `mock_imp_${Date.now()}.png`;
  fs.writeFileSync(path.join(tempDir, filename), mockPng);

  const quiz = quizRepo.createQuiz({
    subject_id: 1,
    folder_id: null,
    title: 'Mock Import Teszt',
    subject_grade: '6',
    questions: [
      {
        question_order: 1,
        question_type: 'ABCD',
        question_text: 'Mock kérdés',
        options: ['A', 'B'],
        correct_answer: 'A',
        image_path: `/uploads/quizzes/temp/${filename}`
      }
    ]
  });

  assert(quiz.id > 0, 'Kvíz ID érvényes');
  assert(quiz.questions[0].image_path.startsWith(`/uploads/quizzes/quiz-${quiz.id}/`));
  const fullPath = path.join(config.uploadsDir, quiz.questions[0].image_path.replace(/^\/uploads/, ''));
  assert(fs.existsSync(fullPath), 'Fájl létezik a kvíz mappában');

  quizRepo.deleteQuiz(quiz.id);
  assert(!fs.existsSync(fullPath), 'Kvíz törlésekor a képmappa kitakarítva');
  console.log('   ✓ Mock teszt és képtakarítás sikeresen ellenőrizve!\n');
}

// Teszt feltöltési mappa kitakarítása
try {
  if (fs.existsSync(config.uploadsDir)) fs.rmSync(config.uploadsDir, { recursive: true, force: true });
} catch (e) {}

console.log('🎉 MINDEN IMPORT TESZT SIKERESEN LEFUTOTT! 🎉');
