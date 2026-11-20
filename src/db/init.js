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
let currentDb = new Database(config.dbPath);

function applyPragmas(targetDb) {
  targetDb.pragma('journal_mode = WAL');
  targetDb.pragma('synchronous = NORMAL');
  targetDb.pragma('foreign_keys = ON');
}

applyPragmas(currentDb);

// Proxy wrapper a futásidejű biztonsági mentés visszatöltéséhez (Hot-Reload)
const db = new Proxy({}, {
  get(target, prop) {
    if (prop === '__reopen') {
      return () => {
        try { currentDb.close(); } catch {}
        currentDb = new Database(config.dbPath);
        applyPragmas(currentDb);
        return currentDb;
      };
    }
    if (prop === '__close') {
      return () => {
        try { currentDb.close(); } catch {}
      };
    }
    const val = currentDb[prop];
    if (typeof val === 'function') {
      return val.bind(currentDb);
    }
    return val;
  }
});

/**
 * Adatbázis inicializálása a sémával és beépített mintaadatokkal
 */
function initializeDatabase() {
  const schemaPath = path.join(__dirname, '..', '..', 'DATABASE_SCHEMA.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // 1. Előzetes migráció: quiz_folders tábla és quizzes.folder_id meglétének biztosítása a séma futtatása előtt
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER DEFAULT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES quiz_folders(id) ON DELETE CASCADE
    );
  `);

  try {
    const tableList = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='quizzes'").get();
    if (tableList) {
      const quizColumns = db.prepare('PRAGMA table_info(quizzes)').all();
      const hasFolderId = quizColumns.some(c => c.name === 'folder_id');
      if (!hasFolderId) {
        db.prepare('ALTER TABLE quizzes ADD COLUMN folder_id INTEGER DEFAULT NULL REFERENCES quiz_folders(id) ON DELETE SET NULL').run();
      }
    }
  } catch (err) {
    console.error('Hiba a quizzes.folder_id migrációjakor:', err);
  }

  // 2. Migráció: sessions.max_points oszlop a történeti jegymegőrzéshez (Report 14 / 25. pont)
  try {
    const sessionsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get();
    if (sessionsTable) {
      const sessionCols = db.prepare('PRAGMA table_info(sessions)').all();
      const hasMaxPoints = sessionCols.some(c => c.name === 'max_points');
      if (!hasMaxPoints) {
        db.prepare('ALTER TABLE sessions ADD COLUMN max_points REAL DEFAULT NULL').run();
      }
    }
  } catch (err) {
    console.error('Hiba a sessions.max_points migrációjakor:', err);
  }

  // 3. Participants tábla migrációja: student_id NULL engedélyezése és ON DELETE SET NULL, hogy a lezárt archívum független legyen a névsortörléstől
  try {
    const partTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='participants'").get();
    if (partTable) {
      const partCols = db.prepare('PRAGMA table_info(participants)').all();
      const studentIdCol = partCols.find(c => c.name === 'student_id');
      if (studentIdCol && studentIdCol.notnull === 1) {
        db.pragma('foreign_keys = OFF');
        db.exec(`
          DROP TRIGGER IF EXISTS trg_prevent_finished_participant_update;

          CREATE TABLE participants_migrated (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id INTEGER NOT NULL,
              student_id INTEGER DEFAULT NULL,
              pc_number INTEGER DEFAULT NULL CHECK(pc_number IS NULL OR (pc_number >= 1 AND pc_number <= 42)),
              student_name TEXT NOT NULL,
              session_token TEXT NOT NULL,
              question_order_json TEXT DEFAULT '[]',
              team_color TEXT DEFAULT NULL,
              focus_lost_count INTEGER DEFAULT 0 CHECK(focus_lost_count >= 0),
              is_finished INTEGER DEFAULT 0 CHECK(is_finished IN (0, 1)),
              joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              deadline_at DATETIME DEFAULT NULL,
              finished_at DATETIME DEFAULT NULL,
              FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
              FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
              UNIQUE(session_id, student_name),
              UNIQUE(id, session_id)
          );

          INSERT INTO participants_migrated (
              id, session_id, student_id, pc_number, student_name, session_token,
              question_order_json, team_color, focus_lost_count, is_finished,
              joined_at, deadline_at, finished_at
          )
          SELECT 
              id, session_id, student_id, pc_number, student_name, session_token,
              question_order_json, team_color, focus_lost_count, is_finished,
              joined_at, deadline_at, finished_at
          FROM participants;

          DROP TABLE participants;
          ALTER TABLE participants_migrated RENAME TO participants;

          CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_token ON participants(session_token);
        `);
        db.pragma('foreign_keys = ON');
      }
    }
  } catch (err) {
    console.error('Hiba a participants tábla migrációjakor:', err);
  }

  // Korábbi triggerek eldobása a migrációhoz és frissítéshez
  try {
    db.exec('DROP TRIGGER IF EXISTS trg_prevent_finished_participant_update;');
    db.exec('DROP TRIGGER IF EXISTS trg_prevent_finished_session_update;');
  } catch {
    // Ha nem létezik, folytatás
  }

  // Történeti lezárt dolgozatok osztálynevének (sessions.class_name) beégetése és függetlenítése a névsortól
  try {
    const sessionTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get();
    if (sessionTable) {
      db.prepare(`
        UPDATE sessions 
        SET class_name = (
          SELECT GROUP_CONCAT(DISTINCT st.class_name) 
          FROM participants p2 
          JOIN students st ON st.id = p2.student_id 
          WHERE p2.session_id = sessions.id
        )
        WHERE (class_name IS NULL OR class_name = '') 
          AND EXISTS (
            SELECT 1 
            FROM participants p3 
            JOIN students st2 ON st2.id = p3.student_id 
            WHERE p3.session_id = sessions.id
          )
      `).run();
    }
  } catch (err) {
    console.error('Hiba a sessions.class_name migrációjakor:', err);
  }

  // 4. Questions tábla migrációja: instructions oszlop meglétének biztosítása
  try {
    const qTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='questions'").get();
    if (qTable) {
      const qCols = db.prepare('PRAGMA table_info(questions)').all();
      const hasInstructions = qCols.some(c => c.name === 'instructions');
      if (!hasInstructions) {
        db.prepare("ALTER TABLE questions ADD COLUMN instructions TEXT DEFAULT ''").run();
      }
    }
  } catch (err) {
    console.error('Hiba a questions.instructions migrációjakor:', err);
  }

  // 5. Séma futtatása (táblák, indexek, frissített triggerek)
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

