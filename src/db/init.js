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

// Konstansok: Hivatalos Okoskodó SQLite formátum- és sémaverzió (Report 19, 20, 21, 22 & v1.37.0)
const OKOS_APPLICATION_ID = 1330335571; // ASCII: 'OKOS' (0x4F4B4F53)
const CURRENT_SCHEMA_VERSION = 13700;   // v1.37.0 sémaverzió (OPEN_NAVIGATION + answer_drafts)

function applyPragmas(targetDb) {
  targetDb.pragma('journal_mode = WAL');
  targetDb.pragma('synchronous = NORMAL');
  targetDb.pragma('foreign_keys = ON');
}

/**
 * Adatbázis sémakompatibilitás és alkalmazásazonosító ellenőrzése
 * (Közös eljárás a restore pre-checkhez és az alkalmazás indításához - Report 20 & 21)
 * @param {Database} targetDb - Az ellenőrizendő SQLite adatbázis kapcsolat
 * @param {Object} options - { context: 'indítás'|'mentés visszaállítása'|'migráció', allowEmpty: boolean }
 */
function validateDatabaseCompatibility(targetDb, { context = 'indítás', allowEmpty = null } = {}) {
  // 1. Integritás ellenőrzése
  const integrity = targetDb.prepare('PRAGMA integrity_check').get();
  if (!integrity || integrity.integrity_check !== 'ok') {
    throw new Error(`Inkompatibilis adatbázis (${context}): az adatbázis integritása sérült (PRAGMA integrity_check failed)!`);
  }

  // 2. Fejléc pragma-k ellenőrzése még bármilyen módosítás előtt
  const appId = targetDb.pragma('application_id', { simple: true });
  const userVersion = targetDb.pragma('user_version', { simple: true });

  // 2.1. Idegen alkalmazásazonosító vizsgálata
  if (appId !== 0 && appId !== OKOS_APPLICATION_ID) {
    throw new Error(`Inkompatibilis adatbázis (${context}): az állomány idegen alkalmazásazonosítóval rendelkezik (application_id: ${appId})! Csak hivatalos Okoskodó vagy támogatott, még nem jelölt korábbi mentés fogadható el.`);
  }

  // 2.2. Újabb sémaverzió vizsgálata (nem engedünk downgrade-et vagy elavult kóddal futtatást)
  if (userVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Inkompatibilis adatbázis (${context}): az adatbázis újabb sémaverziójú (${userVersion}), mint a jelenleg futó Okoskodó szoftver (${CURRENT_SCHEMA_VERSION})! Kérjük, frissítse az alkalmazást a legfrissebb kiadásra!`);
  }

  // 3. Tartalmi és táblastruktúra ellenőrzés (Report 21 / 3. pont)
  const isRestore = context === 'mentés visszaállítása';
  const effectiveAllowEmpty = allowEmpty !== null ? allowEmpty : (!isRestore);
  const existingTables = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  if (existingTables.length === 0) {
    if (!effectiveAllowEmpty) {
      throw new Error(`Inkompatibilis adatbázis (${context}): az adatbázis üres, nem tartalmazza az Okoskodó magtábláit!`);
    }
    return { appId, userVersion }; // Kizárólag explicit engedélyezés (pl. friss telepítés) esetén engedélyezett az üres adatbázis
  }

  // Magtáblák meglétének ellenőrzése
  const requiredCoreTables = ['quizzes', 'questions', 'students', 'sessions', 'participants', 'answers'];
  for (const t of requiredCoreTables) {
    if (!existingTables.includes(t)) {
      throw new Error(`Inkompatibilis adatbázis (${context}): az adatbázis nem egy érvényes Okoskodó adatbázis (a kötelező '${t}' alaptábla hiányzik)!`);
    }
  }

  // Magtáblák kötelező oszlop-ujjlenyomatának ellenőrzése
  const checkTableCols = (tableName, requiredCols) => {
    const cols = targetDb.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name);
    for (const col of requiredCols) {
      if (!cols.includes(col)) {
        throw new Error(`Inkompatibilis adatbázis (${context}): az adatbázis '${tableName}' táblája érvénytelen (a kötelező '${col}' oszlop hiányzik)!`);
      }
    }
  };

  checkTableCols('quizzes', ['title', 'subject_id', 'subject_grade']);
  checkTableCols('questions', ['quiz_id', 'question_type', 'points']);
  checkTableCols('students', ['class_name', 'student_name']);
  checkTableCols('sessions', ['quiz_id', 'status', 'mode']);
  checkTableCols('participants', ['session_id', 'student_name']);
  checkTableCols('answers', ['session_id', 'participant_id', 'question_id', 'points_earned']);

  return { appId, userVersion };
}

// Ha a fájl már létezik, előbb KIZÁRÓLAG OLVASÁSRA ellenőrizzük a kompatibilitást még mielőtt írható kapcsolatot nyitnánk vagy WAL-ra váltanánk! (Report 21 / 2. pont)
if (fs.existsSync(config.dbPath)) {
  const preCheckDb = new Database(config.dbPath, { readonly: true, fileMustExist: true });
  try {
    validateDatabaseCompatibility(preCheckDb, { context: 'indítás', allowEmpty: true });
  } finally {
    preCheckDb.close();
  }
}

// SQLite adatbázis megnyitása és futásidejű kapcsolat-beállítások
let currentDb = new Database(config.dbPath);
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
    if (prop === 'migrateDatabase') {
      return migrateDatabase;
    }
    if (prop === 'applyPragmas') {
      return applyPragmas;
    }
    if (prop === 'validateDatabaseCompatibility') {
      return validateDatabaseCompatibility;
    }
    if (prop === 'OKOS_APPLICATION_ID') {
      return OKOS_APPLICATION_ID;
    }
    if (prop === 'CURRENT_SCHEMA_VERSION') {
      return CURRENT_SCHEMA_VERSION;
    }
    const val = currentDb[prop];
    if (typeof val === 'function') {
      return val.bind(currentDb);
    }
    return val;
  }
});

/**
 * Adatbázis sémamigráció és triggermegújítás (közös eljárás indításhoz és restore-hoz)
 * @param {Database} targetDb - A migrálandó SQLite adatbázis kapcsolat
 */
function migrateDatabase(targetDb = currentDb) {
  // 0. Kompatibilitás és sémaverzió ellenőrzése a migráció előtt (Report 20)
  validateDatabaseCompatibility(targetDb, { context: 'migráció' });

  const schemaPath = path.join(__dirname, '..', '..', 'DATABASE_SCHEMA.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const txSafeSchemaSql = schemaSql.replace(/^\s*PRAGMA\s+[^;]+;\s*$/gim, '');

  // Előre felmérjük, szükséges-e idegen kulcs kikapcsolása táblacseréhez (PRAGMA foreign_keys csak tranzakción KÍVÜL váltható!)
  const partTablePre = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='participants'").get();
  const needsParticipantsRebuild = Boolean(
    partTablePre && targetDb.prepare('PRAGMA table_info(participants)').all().some(c => c.name === 'student_id' && c.notnull === 1)
  );
  const sessionsDefPre = targetDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'").get();
  const needsSessionsRebuild = Boolean(sessionsDefPre && sessionsDefPre.sql && !sessionsDefPre.sql.includes('OPEN_NAVIGATION'));

  const prevFk = targetDb.pragma('foreign_keys', { simple: true });
  if (needsParticipantsRebuild || needsSessionsRebuild) {
    targetDb.pragma('foreign_keys = OFF');
  }

  const readSequenceVal = (tableName) => {
    const seqTable = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'").get();
    if (!seqTable) return 0;
    const row = targetDb.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(tableName);
    return row && Number.isFinite(Number(row.seq)) ? Number(row.seq) : 0;
  };

  const restoreSequenceVal = (tableName, minSeq) => {
    if (!minSeq || minSeq <= 0) return;
    const seqTable = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'").get();
    if (!seqTable) return;
    const existingSeq = targetDb.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(tableName);
    const targetSeq = Math.max(minSeq, existingSeq ? Number(existingSeq.seq) || 0 : 0);
    if (existingSeq) {
      targetDb.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(targetSeq, tableName);
    } else {
      targetDb.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(tableName, targetSeq);
    }
  };

  try {
    const fullMigrationTx = targetDb.transaction(() => {
      // 1. Előzetes migráció: quiz_folders tábla és quizzes oszlopainak biztosítása
      targetDb.exec(`
        CREATE TABLE IF NOT EXISTS quiz_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER DEFAULT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES quiz_folders(id) ON DELETE CASCADE
        );
      `);

      const folderColumns = targetDb.prepare('PRAGMA table_info(quiz_folders)').all();
      if (!folderColumns.some(c => c.name === 'sort_order')) {
        targetDb.prepare('ALTER TABLE quiz_folders ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0').run();
      }

      const quizzesTable = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='quizzes'").get();
      if (quizzesTable) {
        const quizColumns = targetDb.prepare('PRAGMA table_info(quizzes)').all();
        if (!quizColumns.some(c => c.name === 'folder_id')) {
          targetDb.prepare('ALTER TABLE quizzes ADD COLUMN folder_id INTEGER DEFAULT NULL REFERENCES quiz_folders(id) ON DELETE SET NULL').run();
        }
        if (!quizColumns.some(c => c.name === 'is_deleted')) {
          targetDb.prepare('ALTER TABLE quizzes ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0').run();
        }
        if (!quizColumns.some(c => c.name === 'locked_at')) {
          targetDb.prepare('ALTER TABLE quizzes ADD COLUMN locked_at DATETIME DEFAULT NULL').run();
        }
        if (!quizColumns.some(c => c.name === 'created_at')) {
          targetDb.prepare('ALTER TABLE quizzes ADD COLUMN created_at DATETIME DEFAULT NULL').run();
          targetDb.prepare("UPDATE quizzes SET created_at = datetime('now') WHERE created_at IS NULL").run();
        }
        if (!quizColumns.some(c => c.name === 'updated_at')) {
          targetDb.prepare('ALTER TABLE quizzes ADD COLUMN updated_at DATETIME DEFAULT NULL').run();
          targetDb.prepare("UPDATE quizzes SET updated_at = datetime('now') WHERE updated_at IS NULL").run();
        }
        if (!quizColumns.some(c => c.name === 'sort_order')) {
          targetDb.prepare('ALTER TABLE quizzes ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0').run();
        }
      }

      // 2. Sessions oszlopok bővítése (Report 14 & 15)
      const sessionsTable = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get();
      if (sessionsTable) {
        const sessionCols = targetDb.prepare('PRAGMA table_info(sessions)').all();
        if (!sessionCols.some(c => c.name === 'max_points')) {
          targetDb.prepare('ALTER TABLE sessions ADD COLUMN max_points REAL DEFAULT NULL').run();
        }
        if (!sessionCols.some(c => c.name === 'quiz_snapshot_json')) {
          targetDb.prepare('ALTER TABLE sessions ADD COLUMN quiz_snapshot_json TEXT DEFAULT NULL').run();
        }
      }

      // 3. Participants tábla migrációja (student_id NULL engedélyezése + sqlite_sequence megőrzés)
      const partTable = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='participants'").get();
      if (partTable) {
        const partCols = targetDb.prepare('PRAGMA table_info(participants)').all();
        if (!partCols.some(c => c.name === 'pc_number')) {
          targetDb.prepare('ALTER TABLE participants ADD COLUMN pc_number INTEGER DEFAULT NULL').run();
        }
        if (!partCols.some(c => c.name === 'question_order_json')) {
          targetDb.prepare("ALTER TABLE participants ADD COLUMN question_order_json TEXT DEFAULT '[]'").run();
        }
        if (!partCols.some(c => c.name === 'team_color')) {
          targetDb.prepare('ALTER TABLE participants ADD COLUMN team_color TEXT DEFAULT NULL').run();
        }
        if (!partCols.some(c => c.name === 'focus_lost_count')) {
          targetDb.prepare('ALTER TABLE participants ADD COLUMN focus_lost_count INTEGER DEFAULT 0').run();
        }
        if (!partCols.some(c => c.name === 'is_finished')) {
          targetDb.prepare('ALTER TABLE participants ADD COLUMN is_finished INTEGER DEFAULT 0').run();
        }
        if (!partCols.some(c => c.name === 'deadline_at')) {
          targetDb.prepare('ALTER TABLE participants ADD COLUMN deadline_at DATETIME DEFAULT NULL').run();
        }
        if (!partCols.some(c => c.name === 'finished_at')) {
          targetDb.prepare('ALTER TABLE participants ADD COLUMN finished_at DATETIME DEFAULT NULL').run();
        }

        if (needsParticipantsRebuild) {
          const oldPartSeq = readSequenceVal('participants');
          const maxPartIdRow = targetDb.prepare('SELECT COALESCE(MAX(id), 0) AS max_id FROM participants').get();
          const minPartSeq = Math.max(oldPartSeq, Number(maxPartIdRow && maxPartIdRow.max_id) || 0);

          targetDb.exec(`
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
            CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_id_session ON participants(id, session_id);
          `);

          restoreSequenceVal('participants', minPartSeq);
        }
      }

      // 4. Korábbi triggerek eldobása tranzakción BELÜL (hiba esetén teljes rollback!)
      targetDb.exec('DROP TRIGGER IF EXISTS trg_prevent_finished_participant_update;');
      targetDb.exec('DROP TRIGGER IF EXISTS trg_prevent_finished_session_update;');
      targetDb.exec('DROP TRIGGER IF EXISTS trg_validate_answer_question;');
      targetDb.exec('DROP TRIGGER IF EXISTS trg_validate_answer_points_limit;');
      targetDb.exec('DROP TRIGGER IF EXISTS trg_validate_answer_points_limit_update;');

      // 5. Történeti lezárt dolgozatok osztálynevének (sessions.class_name) beégetése
      if (sessionsTable) {
        targetDb.prepare(`
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

      // 6. Questions tábla migrációja: instructions oszlop
      const qTable = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='questions'").get();
      if (qTable) {
        const qCols = targetDb.prepare('PRAGMA table_info(questions)').all();
        if (!qCols.some(c => c.name === 'instructions')) {
          targetDb.prepare("ALTER TABLE questions ADD COLUMN instructions TEXT DEFAULT ''").run();
        }
      }

      // 7. Answers tábla defenzív migrációja régebbi mentésekhez
      const ansTable = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='answers'").get();
      if (ansTable) {
        const ansCols = targetDb.prepare('PRAGMA table_info(answers)').all();
        if (!ansCols.some(c => c.name === 'original_points_earned')) {
          targetDb.prepare('ALTER TABLE answers ADD COLUMN original_points_earned REAL NOT NULL DEFAULT 0.0').run();
          targetDb.prepare('UPDATE answers SET original_points_earned = points_earned').run();
        }
        if (!ansCols.some(c => c.name === 'is_manually_overridden')) {
          targetDb.prepare('ALTER TABLE answers ADD COLUMN is_manually_overridden INTEGER DEFAULT 0').run();
        }
        if (!ansCols.some(c => c.name === 'overridden_at')) {
          targetDb.prepare('ALTER TABLE answers ADD COLUMN overridden_at DATETIME DEFAULT NULL').run();
        }
        if (!ansCols.some(c => c.name === 'time_spent_sec')) {
          targetDb.prepare('ALTER TABLE answers ADD COLUMN time_spent_sec INTEGER DEFAULT 0').run();
        }
        if (!ansCols.some(c => c.name === 'answered_at')) {
          targetDb.prepare('ALTER TABLE answers ADD COLUMN answered_at DATETIME DEFAULT NULL').run();
          targetDb.prepare("UPDATE answers SET answered_at = datetime('now') WHERE answered_at IS NULL").run();
        }
      }

      // 8. Sessions tábla biztonságos újraépítése az OPEN_NAVIGATION módhoz + sqlite_sequence megőrzése
      if (needsSessionsRebuild) {
        const oldSessionsSeq = readSequenceVal('sessions');
        const maxSessionIdRow = targetDb.prepare('SELECT COALESCE(MAX(id), 0) AS max_id FROM sessions').get();
        const minSessionsSeq = Math.max(oldSessionsSeq, Number(maxSessionIdRow && maxSessionIdRow.max_id) || 0);

        const depTriggers = targetDb.prepare(`
          SELECT name FROM sqlite_master
          WHERE type = 'trigger' AND (tbl_name = 'sessions' OR sql LIKE '%sessions%')
        `).all();
        for (const trg of depTriggers) {
          targetDb.exec(`DROP TRIGGER IF EXISTS "${String(trg.name).replace(/"/g, '""')}";`);
        }

        const existingCols = new Set(targetDb.prepare('PRAGMA table_info(sessions)').all().map(c => c.name));
        const colOrDefault = (name, fallbackExpr) => (existingCols.has(name) ? name : `${fallbackExpr} AS ${name}`);

        targetDb.exec(`
          CREATE TABLE sessions_migrated (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subject_id INTEGER NOT NULL DEFAULT 1,
              grade_level TEXT NOT NULL DEFAULT '',
              quiz_id INTEGER NOT NULL,
              class_name TEXT DEFAULT '',
              mode TEXT NOT NULL CHECK(mode IN ('STUDENT_PACED', 'TEACHER_PACED', 'SPACE_RACE', 'OPEN_NAVIGATION')),
              status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'FINISHED')),
              time_limit_min INTEGER DEFAULT 0 CHECK(time_limit_min >= 0),
              shuffle_questions INTEGER DEFAULT 0 CHECK(shuffle_questions IN (0, 1)),
              shuffle_options INTEGER DEFAULT 0 CHECK(shuffle_options IN (0, 1)),
              show_feedback_on_end INTEGER DEFAULT 1 CHECK(show_feedback_on_end IN (0, 1)),
              current_question_index INTEGER DEFAULT 0 CHECK(current_question_index >= 0),
              grade_thresholds_json TEXT NOT NULL DEFAULT '{"2":30,"3":55,"4":75,"5":90}',
              max_points REAL DEFAULT NULL,
              quiz_snapshot_json TEXT DEFAULT NULL,
              started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              ended_at DATETIME DEFAULT NULL,
              CHECK((status = 'ACTIVE' AND ended_at IS NULL) OR (status = 'FINISHED' AND ended_at IS NOT NULL)),
              FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
              FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE RESTRICT
          );
        `);

        targetDb.exec(`
          INSERT INTO sessions_migrated (
              id, subject_id, grade_level, quiz_id, class_name, mode, status,
              time_limit_min, shuffle_questions, shuffle_options, show_feedback_on_end,
              current_question_index, grade_thresholds_json, max_points, quiz_snapshot_json,
              started_at, ended_at
          )
          SELECT
              id,
              ${colOrDefault('subject_id', '1')},
              ${colOrDefault('grade_level', "''")},
              quiz_id,
              ${colOrDefault('class_name', "''")},
              mode,
              status,
              ${colOrDefault('time_limit_min', '0')},
              ${colOrDefault('shuffle_questions', '0')},
              ${colOrDefault('shuffle_options', '0')},
              ${colOrDefault('show_feedback_on_end', '1')},
              ${colOrDefault('current_question_index', '0')},
              ${colOrDefault('grade_thresholds_json', '\'{"2":30,"3":55,"4":75,"5":90}\'')},
              ${colOrDefault('max_points', 'NULL')},
              ${colOrDefault('quiz_snapshot_json', 'NULL')},
              ${colOrDefault('started_at', 'CURRENT_TIMESTAMP')},
              ${colOrDefault('ended_at', 'NULL')}
          FROM sessions;
        `);

        targetDb.exec('DROP TABLE sessions;');
        targetDb.exec('ALTER TABLE sessions_migrated RENAME TO sessions;');

        // Azonosítószámláló (sqlite_sequence) megőrzése törölt nagyobb ID-k esetén is
        restoreSequenceVal('sessions', minSessionsSeq);
      }

      // 9. Alapséma, indexek, triggerek és answer_drafts visszaépítése
      targetDb.exec(txSafeSchemaSql);

      // 10. Commit előtti idegenkulcs- és kötelező objektumlista-ellenőrzés
      const fkIssues = targetDb.pragma('foreign_key_check');
      if (Array.isArray(fkIssues) && fkIssues.length > 0) {
        throw new Error(`Idegenkulcs-integritási hiba a migráció után (${fkIssues.length} eltérés)!`);
      }

      const masterRows = targetDb.prepare("SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger')").all();
      const masterSet = new Set(masterRows.map(r => `${r.type}:${r.name}`));
      const requiredObjects = [
        'table:subjects', 'table:students', 'table:quizzes', 'table:questions',
        'table:sessions', 'table:participants', 'table:answers', 'table:answer_drafts', 'table:system_settings',
        'index:idx_active_session_channel', 'index:idx_participants_id_session',
        'index:idx_answer_drafts_session', 'index:idx_answer_drafts_participant',
        'trigger:trg_prevent_finished_participant_update',
        'trigger:trg_prevent_finished_session_update',
        'trigger:trg_validate_answer_question',
        'trigger:trg_validate_answer_points_limit',
        'trigger:trg_validate_answer_points_limit_update',
        'trigger:trg_prevent_answer_update_when_session_finished',
        'trigger:trg_prevent_answer_core_update',
        'trigger:trg_prevent_session_quiz_change'
      ];
      for (const objKey of requiredObjects) {
        if (!masterSet.has(objKey)) {
          throw new Error(`Hiányzó kötelező adatbázis-objektum a migráció után: ${objKey}`);
        }
      }

      // 11. Alkalmazás- és sémaverzió rögzítése ugyanabban az atomi tranzakcióban
      targetDb.pragma(`application_id = ${OKOS_APPLICATION_ID}`);
      targetDb.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
    });

    fullMigrationTx();
  } catch (err) {
    console.error('Hiba a sémamigráció során (teljes rollback végrehajtva):', err);
    throw new Error(`Sikertelen sémamigráció: ${err.message}`);
  } finally {
    if (needsParticipantsRebuild || needsSessionsRebuild) {
      targetDb.pragma(`foreign_keys = ${prevFk ? 'ON' : 'OFF'}`);
    }
  }
}

/**
 * Adatbázis inicializálása a sémával és beépített mintaadatokkal
 */
function initializeDatabase() {
  migrateDatabase(db);

  // Mintaadatok feltöltése tranzakcióban (ha még üres az adatbázis)
  const seedTransaction = db.transaction(() => {
    // 1. Minta Digitális kultúra teszt ellenőrzése és beszúrása
    const quizCount = db.prepare('SELECT COUNT(*) as count FROM quizzes').get().count;
    if (quizCount === 0) {
      const insertQuiz = db.prepare(`
        INSERT INTO quizzes (
          subject_id, title, subject_grade, default_time_limit_min,
          created_at, updated_at
        )
        VALUES (@subject_id, @title, @subject_grade, @default_time_limit_min, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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

db.migrateDatabase = migrateDatabase;
db.applyPragmas = applyPragmas;
db.validateDatabaseCompatibility = validateDatabaseCompatibility;
db.OKOS_APPLICATION_ID = OKOS_APPLICATION_ID;
db.CURRENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

module.exports = db;
module.exports.migrateDatabase = migrateDatabase;
module.exports.applyPragmas = applyPragmas;
module.exports.validateDatabaseCompatibility = validateDatabaseCompatibility;
module.exports.OKOS_APPLICATION_ID = OKOS_APPLICATION_ID;
module.exports.CURRENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

