-- ============================================================================
-- Ropdolgozat program - SQLITE ADATBÁZIS SÉMA (DATABASE_SCHEMA.sql)
-- Motor: SQLite 3 (better-sqlite3)
-- Kötelező inicializálási pragma-k minden kapcsolat nyitásakor:
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. TÁBLA: subjects (Választható tantárgyak – alapértelmezetten 'Digitális kultúra')
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,                  -- Tantárgy neve (pl. "Digitális kultúra", "Technika")
    is_default INTEGER DEFAULT 0                -- 1 = alapértelmezett, inaktív kiválasztott tantárgy
);

INSERT OR IGNORE INTO subjects (id, name, is_default) VALUES 
    (1, 'Digitális kultúra', 1),
    (2, 'Technika', 0),
    (3, 'Fejlesztő foglalkozás', 0);

-- ----------------------------------------------------------------------------
-- 2. TÁBLA: students (Előre feltöltött osztálynévsorok a gyors belépéshez)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_name TEXT NOT NULL,                   -- Osztály neve (pl. "5.a", "7.b")
    student_name TEXT NOT NULL,                 -- Diák teljes neve (pl. "Kiss Bence")
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_name, student_name)
);

CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_name);

-- ----------------------------------------------------------------------------
-- 3. TÁBLA: quizzes (Tesztek / Feladatsorok fejléce)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL DEFAULT 1,      -- Hivatkozás a subjects táblára
    title TEXT NOT NULL,                        -- A teszt címe (pl. "6. osztály - Hálózatok alapjai")
    subject_grade TEXT DEFAULT '',              -- Évfolyam / kategória (pl. "6. évfolyam")
    default_time_limit_min INTEGER DEFAULT 0,   -- Alapértelmezett időkorlát percben (0 = nincs korlát)
    locked_at DATETIME DEFAULT NULL,            -- Zárolás UTC időpontja (első indításkor automatikusan kitöltődik)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 4. TÁBLA: questions (Kérdések a tesztekhez)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    question_order INTEGER NOT NULL DEFAULT 1 CHECK(question_order > 0), -- Kérdés sorszáma a teszten belül
    question_type TEXT NOT NULL CHECK(question_type IN ('ABCD', 'TF', 'SHORT')),
    question_text TEXT NOT NULL,                -- Kérdés szövege (támogatja a `kód` jelölést)
    image_path TEXT DEFAULT NULL,               -- Opcionális kép relatív elérési útja (pl. "/uploads/kep1.png")
    options_json TEXT DEFAULT '[]',             -- JSON tömb ABCD esetén (pl. '["A válasz","B válasz","C válasz","D válasz"]')
    correct_answer TEXT NOT NULL,               -- Helyes válasz (JSON tömb vagy szöveg)
    explanation TEXT DEFAULT '',                -- Magyarázat a helyes válaszhoz
    points REAL NOT NULL DEFAULT 1.0 CHECK(points >= 0), -- Maximális pontszám
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE RESTRICT,
    UNIQUE(quiz_id, question_order)             -- Egy teszten belül nem lehet két azonos sorszámú kérdés
);

CREATE INDEX IF NOT EXISTS idx_questions_quiz_id ON questions(quiz_id);

-- ----------------------------------------------------------------------------
-- 5. TÁBLA: sessions (Megírt dolgozatok / Órai futtatási alkalmak)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL DEFAULT 1,      -- Tantárgy hivatkozás (subjects tábla)
    grade_level TEXT NOT NULL DEFAULT '',       -- Évfolyam (pl. "6" vagy "3")
    quiz_id INTEGER NOT NULL,
    class_name TEXT DEFAULT '',                 -- Opcionális osztálynév (pl. "6.a", vagy üres, ha teljes évfolyam)
    mode TEXT NOT NULL CHECK(mode IN ('STUDENT_PACED', 'TEACHER_PACED', 'SPACE_RACE')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'FINISHED')),
    time_limit_min INTEGER DEFAULT 0 CHECK(time_limit_min >= 0), -- Időkorlát percben (0 = nincs korlát)
    shuffle_questions INTEGER DEFAULT 0 CHECK(shuffle_questions IN (0, 1)), -- 1 = kérdések keverése
    shuffle_options INTEGER DEFAULT 0 CHECK(shuffle_options IN (0, 1)),     -- 1 = ABCD válaszok keverése
    show_feedback_on_end INTEGER DEFAULT 1 CHECK(show_feedback_on_end IN (0, 1)), -- 1 = értékelőlap a végén
    current_question_index INTEGER DEFAULT 0 CHECK(current_question_index >= 0), -- Teacher Paced kérdés index
    grade_thresholds_json TEXT NOT NULL DEFAULT '{"2":30,"3":55,"4":75,"5":90}', -- Ponthatárok százalékban
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME DEFAULT NULL,
    CHECK((status = 'ACTIVE' AND ended_at IS NULL) OR (status = 'FINISHED' AND ended_at IS NOT NULL)), -- Státusz és lezárási idő összhangja
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_lookup ON sessions(status, subject_id, grade_level);
-- Szigorú garancia: egy tantárgy-évfolyam csatornán egyszerre kizárólag 1 aktív dolgozat futhat!
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_session_channel ON sessions(subject_id, grade_level) WHERE status = 'ACTIVE';

-- ----------------------------------------------------------------------------
-- 6. TÁBLA: participants (Egy adott órai dolgozathoz csatlakozott diákok)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,                -- Belső stabil azonosító a students táblából
    pc_number INTEGER DEFAULT NULL CHECK(pc_number IS NULL OR (pc_number >= 1 AND pc_number <= 42)), -- Kliensgép száma (1-42)
    student_name TEXT NOT NULL,                 -- A diák neve (történeti pillanatfelvétel a dolgozat idején)
    session_token TEXT NOT NULL,                -- Kriptográfiailag biztonságos token a helyreállításhoz
    question_order_json TEXT DEFAULT '[]',      -- A diáknak generált (esetleg kevert) kérdés ID sorrend
    team_color TEXT DEFAULT NULL,               -- Space Race módban a csapat színe (pl. "Kék", "Piros")
    focus_lost_count INTEGER DEFAULT 0 CHECK(focus_lost_count >= 0), -- Fókuszvesztések száma
    is_finished INTEGER DEFAULT 0 CHECK(is_finished IN (0, 1)),      -- 1 = befejezte és beküldte a dolgozatot
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deadline_at DATETIME DEFAULT NULL,          -- Szerveroldali számított határidő (joined_at + time_limit_min)
    finished_at DATETIME DEFAULT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
    UNIQUE(session_id, student_id),             -- Egy dolgozatban egy diák csak egyszer szerepelhet
    UNIQUE(session_id, student_name),
    UNIQUE(id, session_id)                      -- Összetett idegen kulcs támogatása az answers táblához
);

CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_token ON participants(session_token);

-- ----------------------------------------------------------------------------
-- 7. TÁBLA: answers (A diákok által beküldött egyedi válaszok)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    participant_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    submitted_answer TEXT NOT NULL,             -- A diák által adott válasz (JSON vagy szöveg)
    eval_status TEXT NOT NULL DEFAULT 'WRONG' CHECK(eval_status IN ('CORRECT', 'PARTIAL', 'WRONG')), -- Értékelési státusz
    is_correct INTEGER NOT NULL DEFAULT 0 CHECK(is_correct IN (0, 1)), -- 1 = helyes/részpont, 0 = hibás
    points_earned REAL NOT NULL DEFAULT 0.0 CHECK(points_earned >= 0.0), -- Kapott pontszám (nem lehet negatív)
    original_points_earned REAL NOT NULL CHECK(original_points_earned >= 0.0), -- Eredeti gépi pontszám (kötelező beszúráskor, utólag nem módosítható)
    is_manually_overridden INTEGER DEFAULT 0 CHECK(is_manually_overridden IN (0, 1)), -- 1 = tanári felülbírálás
    overridden_at DATETIME DEFAULT NULL,        -- Tanári felülbírálás legutóbbi időpontja
    time_spent_sec INTEGER DEFAULT 0 CHECK(time_spent_sec >= 0),         -- Megválaszolásra fordított idő másodpercben
    answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK((eval_status = 'WRONG' AND points_earned = 0.0 AND is_correct = 0) OR (eval_status = 'CORRECT' AND is_correct = 1 AND points_earned >= 0.0) OR (eval_status = 'PARTIAL' AND is_correct = 1 AND points_earned > 0.0)),
    FOREIGN KEY (participant_id, session_id) REFERENCES participants(id, session_id) ON DELETE CASCADE, -- Garantálja, hogy a válasz a résztvevő saját sessionjéhez tartozik!
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT, -- Tilos törölni kérdést, ha már válasz van rá!
    UNIQUE(participant_id, question_id)         -- Idempotens védelem: egy diák egy kérdésre csak egy végleges választ adhat
);

CREATE INDEX IF NOT EXISTS idx_answers_session_participant ON answers(session_id, participant_id);

-- ============================================================================
-- 8. INTEGRITÁSI TRIGGEREK (Adatbázisszintű garanciák)
-- ============================================================================

-- 8.8. Elindított munkamenetnél a quiz_id utólagos módosítása tiltott
CREATE TRIGGER IF NOT EXISTS trg_prevent_session_quiz_change
BEFORE UPDATE OF quiz_id ON sessions
BEGIN
    SELECT RAISE(ABORT, 'A munkamenet tesztje utólag nem módosítható!');
END;

-- 8.9. Kérdés-dolgozat összetartozás ellenőrzése válasz beszúrásakor
CREATE TRIGGER IF NOT EXISTS trg_validate_answer_question
BEFORE INSERT ON answers
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM questions q 
            JOIN sessions s ON s.quiz_id = q.quiz_id 
            WHERE s.id = NEW.session_id AND q.id = NEW.question_id
        )
        THEN RAISE(ABORT, 'Integritási hiba: A kérdés nem a munkamenet tesztjéhez tartozik!')
    END;
END;

-- 8.10. Leadott diákválasz alapadatainak és időadatainak felülírása tiltott (csak pontozási státusz módosítható)
CREATE TRIGGER IF NOT EXISTS trg_prevent_answer_core_update
BEFORE UPDATE OF session_id, participant_id, question_id, submitted_answer, answered_at, time_spent_sec ON answers
BEGIN
    SELECT RAISE(ABORT, 'A leadott diákválasz alapadatai és időadatai nem módosíthatók!');
END;

-- 8.13. Az eredeti gépi pontszám rögzítés után nem módosítható
CREATE TRIGGER IF NOT EXISTS trg_prevent_original_points_change
BEFORE UPDATE OF original_points_earned ON answers
WHEN OLD.original_points_earned IS NOT NULL 
 AND NEW.original_points_earned IS NOT OLD.original_points_earned
BEGIN
    SELECT RAISE(ABORT, 'Az eredeti gépi pontszám utólag nem módosítható!');
END;

-- 8.15. Lezárt dolgozat újranyitása (FINISHED -> ACTIVE) szigorúan tiltott!
CREATE TRIGGER IF NOT EXISTS trg_prevent_session_reopen
BEFORE UPDATE OF status ON sessions
WHEN OLD.status = 'FINISHED' AND NEW.status IS NOT OLD.status
BEGIN
    SELECT RAISE(ABORT, 'Lezárt dolgozat nem nyitható újra!');
END;

-- 8.16. Lezárt dolgozat befejezési időpontjának (ended_at) módosítása tiltott
CREATE TRIGGER IF NOT EXISTS trg_prevent_session_ended_at_change
BEFORE UPDATE OF ended_at ON sessions
WHEN OLD.status = 'FINISHED' AND NEW.ended_at IS NOT OLD.ended_at
BEGIN
    SELECT RAISE(ABORT, 'Lezárt dolgozat befejezési ideje nem módosítható!');
END;

-- 8.17. Lezárt dolgozat beállításainak módosítása tiltott
CREATE TRIGGER IF NOT EXISTS trg_prevent_finished_session_update
BEFORE UPDATE ON sessions
WHEN OLD.status = 'FINISHED'
 AND (
     NEW.grade_thresholds_json IS NOT OLD.grade_thresholds_json
  OR NEW.shuffle_questions IS NOT OLD.shuffle_questions
  OR NEW.shuffle_options IS NOT OLD.shuffle_options
  OR NEW.mode IS NOT OLD.mode
  OR NEW.time_limit_min IS NOT OLD.time_limit_min
  OR NEW.class_name IS NOT OLD.class_name
  OR NEW.subject_id IS NOT OLD.subject_id
  OR NEW.grade_level IS NOT OLD.grade_level
  OR NEW.started_at IS NOT OLD.started_at
 )
BEGIN
    SELECT RAISE(ABORT, 'Lezárt dolgozat beállításai utólag nem módosíthatók!');
END;

-- 8.18. Lezárt dolgozat résztvevőinek adatainak utólagos módosítása tiltott
CREATE TRIGGER IF NOT EXISTS trg_prevent_finished_participant_update
BEFORE UPDATE ON participants
WHEN (SELECT status FROM sessions WHERE id = OLD.session_id) = 'FINISHED'
 AND (
     NEW.student_name IS NOT OLD.student_name
  OR NEW.student_id IS NOT OLD.student_id
  OR NEW.pc_number IS NOT OLD.pc_number
  OR NEW.session_token IS NOT OLD.session_token
  OR NEW.question_order_json IS NOT OLD.question_order_json
  OR NEW.team_color IS NOT OLD.team_color
  OR NEW.joined_at IS NOT OLD.joined_at
  OR NEW.deadline_at IS NOT OLD.deadline_at
  OR NEW.is_finished IS NOT OLD.is_finished
  OR NEW.finished_at IS NOT OLD.finished_at
 )
BEGIN
    SELECT RAISE(ABORT, 'Lezárt dolgozat résztvevőjének adatai nem módosíthatók!');
END;

-- 8.19. Új válasz beszúrása lezárt dolgozathoz tiltott
CREATE TRIGGER IF NOT EXISTS trg_prevent_answer_insert_when_finished
BEFORE INSERT ON answers
WHEN (SELECT status FROM sessions WHERE id = NEW.session_id) = 'FINISHED'
BEGIN
    SELECT RAISE(ABORT, 'Lezárt dolgozathoz nem adható hozzá új válasz!');
END;

-- 8.20. Új résztvevő felvétele lezárt dolgozathoz tiltott
CREATE TRIGGER IF NOT EXISTS trg_prevent_participant_insert_when_finished
BEFORE INSERT ON participants
WHEN (SELECT status FROM sessions WHERE id = NEW.session_id) = 'FINISHED'
BEGIN
    SELECT RAISE(ABORT, 'Lezárt dolgozathoz nem vehető fel új résztvevő!');
END;

-- 8.21. A kapott pontszám nem haladhatja meg a kérdés maximális pontértékét (beszúráskor)
CREATE TRIGGER IF NOT EXISTS trg_validate_answer_points_limit
BEFORE INSERT ON answers
BEGIN
    SELECT CASE
        WHEN NEW.points_earned > (SELECT points FROM questions WHERE id = NEW.question_id)
        THEN RAISE(ABORT, 'A kapott pontszám nem haladhatja meg a kérdés maximális pontértékét!')
    END;
END;

-- 8.22. A felülbírált pontszám nem haladhatja meg a kérdés maximális pontértékét (módosításkor)
CREATE TRIGGER IF NOT EXISTS trg_validate_answer_points_limit_update
BEFORE UPDATE OF points_earned ON answers
BEGIN
    SELECT CASE
        WHEN NEW.points_earned > (SELECT points FROM questions WHERE id = NEW.question_id)
        THEN RAISE(ABORT, 'A felülbírált pontszám nem haladhatja meg a kérdés maximális pontértékét!')
    END;
END;

-- 8.23. Lezárt dolgozatban a válaszok és pontszámok utólagos módosítása tiltott
CREATE TRIGGER IF NOT EXISTS trg_prevent_answer_update_when_session_finished
BEFORE UPDATE ON answers
WHEN (SELECT status FROM sessions WHERE id = OLD.session_id) = 'FINISHED'
BEGIN
    SELECT RAISE(ABORT, 'Lezárt dolgozatban a válaszok és pontszámok utólag nem módosíthatók!');
END;

