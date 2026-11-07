const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../../config');

// Adatkönyvtárak biztosítása
if (!fs.existsSync(path.dirname(config.dbPath))) {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
}
if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

// SQLite adatbázis megnyitása
const db = new Database(config.dbPath);

// Kötelező pragma beállítások (AI_RULES & TECH_STACK)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

/**
 * Adatbázis inicializálása a sémával és beépített mintaadatokkal
 */
function initializeDatabase() {
  const schemaPath = path.join(__dirname, '..', '..', 'DATABASE_SCHEMA.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Séma futtatása (táblák, indexek, triggerek)
  db.exec(schemaSql);

  // Mintaadatok feltöltése tranzakcióban (ha még üres az adatbázis)
  const seedTransaction = db.transaction(() => {
    // 1. Minta Digitális kultúra teszt ellenőrzése és beszúrása
    const quizCount = db.prepare('SELECT COUNT(*) as count FROM quizzes').get().count;
    if (quizCount === 0) {
      const insertQuiz = db.prepare(`
        INSERT INTO quizzes (subject_id, title, subject_grade, default_time_limit_min)
        VALUES (@subject_id, @title, @subject_grade, @default_time_limit_min)
      `);

      const quizResult = insertQuiz.run({
        subject_id: 1, // Digitális kultúra
        title: '6. osztály – Táblázatkezelés és hálózatok alapjai',
        subject_grade: '6',
        default_time_limit_min: 10
      });

      const quizId = quizResult.lastInsertRowid;

      const insertQuestion = db.prepare(`
        INSERT INTO questions (quiz_id, question_order, question_type, question_text, image_path, options_json, correct_answer, explanation, points)
        VALUES (@quiz_id, @question_order, @question_type, @question_text, @image_path, @options_json, @correct_answer, @explanation, @points)
      `);

      // 1. kérdés: ABCD
      insertQuestion.run({
        quiz_id: quizId,
        question_order: 1,
        question_type: 'ABCD',
        question_text: 'Melyik képlet számítja ki helyesen az `A1:A10` cellatartomány elemeinek összegét táblázatkezelőben?',
        image_path: null,
        options_json: JSON.stringify([
          '=SZUM(A1:A10)',
          '=ÖSSZEG(A1:A10)',
          '=SUMMA(A1..A10)',
          '=SZÁMOL(A1-A10)'
        ]),
        correct_answer: '=SZUM(A1:A10)',
        explanation: 'A magyar nyelvű táblázatkezelő programokban az összeadásra a `=SZUM()` függvény szolgál, kettősponttal megadva az összegzendő tartományt.',
        points: 1.0
      });

      // 2. kérdés: TF (Igaz / Hamis)
      insertQuestion.run({
        quiz_id: quizId,
        question_order: 2,
        question_type: 'TF',
        question_text: 'Az IP-cím a számítógépes hálózathoz csatlakozó eszközök egyedi azonosítására szolgál.',
        image_path: null,
        options_json: JSON.stringify(['Igaz', 'Hamis']),
        correct_answer: 'Igaz',
        explanation: 'Az IP-cím (Internet Protocol cím) a hálózatban lévő számítógépek és eszközök egyedi logikai azonosítója.',
        points: 1.0
      });

      // 3. kérdés: SHORT (Rövid szöveges válasz)
      insertQuestion.run({
        quiz_id: quizId,
        question_order: 3,
        question_type: 'SHORT',
        question_text: 'Milyen protokollt használ a böngésző a biztonságos, titkosított weboldalak betöltésére? Írd be a rövidítését!',
        image_path: null,
        options_json: '[]',
        correct_answer: 'HTTPS',
        explanation: 'A HTTPS (HyperText Transfer Protocol Secure) a titkosított adatkapcsolatot biztosító szabványos hálózati protokoll.',
        points: 1.0
      });

      // 4. kérdés: ABCD
      insertQuestion.run({
        quiz_id: quizId,
        question_order: 4,
        question_type: 'ABCD',
        question_text: 'Melyik billentyűkombinációval másolhatjuk a kijelölt szöveget vagy fájlt a vágólapra?',
        image_path: null,
        options_json: JSON.stringify([
          'Ctrl + C',
          'Ctrl + V',
          'Ctrl + X',
          'Ctrl + Z'
        ]),
        correct_answer: 'Ctrl + C',
        explanation: 'A `Ctrl + C` a másolás (Copy), a `Ctrl + V` a beillesztés, a `Ctrl + X` a kivágás, a `Ctrl + Z` a visszavonás parancsa.',
        points: 1.0
      });
    }

    // 2. Minta osztálynévsor (6.a osztály) ellenőrzése és beszúrása
    const studentCount = db.prepare("SELECT COUNT(*) as count FROM students WHERE class_name = '6.a'").get().count;
    if (studentCount === 0) {
      const insertStudent = db.prepare(`
        INSERT OR IGNORE INTO students (class_name, student_name)
        VALUES (@class_name, @student_name)
      `);

      const sampleRoster = [
        'Balogh Ádám',
        'Budai Dániel',
        'Fekete Emma',
        'Horváth Bence',
        'Kiss Hanna',
        'Kovács Péter',
        'Lakatos Zoé',
        'Molnár Márk',
        'Nagy Lili',
        'Németh Dóra',
        'Papp Tamás',
        'Szabó Anna',
        'Tóth Balázs',
        'Varga Zsófia',
        'Vitéz Máté'
      ];

      for (const name of sampleRoster) {
        insertStudent.run({
          class_name: '6.a',
          student_name: name
        });
      }
    }
  });

  seedTransaction();
}

// Inicializálás végrehajtása
initializeDatabase();

// Közvetlen parancssori futtatás esetén diagnosztikai visszajelzés
if (require.main === module) {
  const quizzes = db.prepare('SELECT id, title, locked_at FROM quizzes').all();
  const students = db.prepare('SELECT class_name, COUNT(*) as count FROM students GROUP BY class_name').all();
  console.log('✓ SQLite adatbázis sikeresen inicializálva WAL módban.');
  console.log('Tesztek az adatbázisban:', quizzes);
  console.log('Osztálynévsorok:', students);
}

module.exports = db;

