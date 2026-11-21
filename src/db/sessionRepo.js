const crypto = require('crypto');
const db = require('./init');
const grader = require('../services/grader');
const settingsRepo = require('./settingsRepo');
const quizRepo = require('./quizRepo');

/**
 * Dátum string normalizálása és értelmezése explicit UTC-ként
 * Megelőzi az SQLite CURRENT_TIMESTAMP (YYYY-MM-DD HH:mm:ss) helyi időzónás félreértelmezését a Node.js-ben (Report 16 / 3. fejezet)
 */
function parseUtcDate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr !== 'string') return new Date(dateStr);
  let s = dateStr.trim();
  if (!s.includes('T')) {
    s = s.replace(' ', 'T');
  }
  if (!s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s)) {
    s += 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date(dateStr) : d;
}

/**
 * sessionRepo.js - Órai dolgozatok (sessions), résztvevők és válaszok adatbázis műveletei
 */

/**
 * Aktív dolgozatok listázása a felső státuszfülekhez (Live Badges)
 */
function getActiveSessions() {
  const stmt = db.prepare(`
    SELECT 
      s.id,
      s.subject_id,
      sub.name AS subject_name,
      s.grade_level,
      s.class_name,
      s.quiz_id,
      q.title AS quiz_title,
      s.mode,
      s.time_limit_min,
      s.started_at,
      COUNT(p.id) AS participant_count
    FROM sessions s
    JOIN subjects sub ON sub.id = s.subject_id
    JOIN quizzes q ON q.id = s.quiz_id
    LEFT JOIN participants p ON p.session_id = s.id
    WHERE s.status = 'ACTIVE'
    GROUP BY s.id
    ORDER BY s.started_at DESC
  `);
  return stmt.all();
}

/**
 * Összes dolgozat (aktív és lezárt archívum) listázása az Eredmények (Reports) fülhöz
 */
function getAllSessions() {
  const stmt = db.prepare(`
    SELECT 
      s.id,
      s.subject_id,
      sub.name AS subject_name,
      s.grade_level,
      COALESCE(
        NULLIF(s.class_name, ''),
        (SELECT GROUP_CONCAT(DISTINCT st.class_name) FROM participants p2 JOIN students st ON st.id = p2.student_id WHERE p2.session_id = s.id),
        ''
      ) AS class_name,
      s.quiz_id,
      q.title AS quiz_title,
      s.mode,
      s.status,
      s.time_limit_min,
      s.grade_thresholds_json,
      s.max_points,
      s.started_at,
      s.ended_at,
      COUNT(DISTINCT p.id) AS participant_count,
      COUNT(DISTINCT a.id) AS total_answers_count,
      ROUND(AVG(p_points.user_total), 1) AS avg_points
    FROM sessions s
    JOIN subjects sub ON sub.id = s.subject_id
    JOIN quizzes q ON q.id = s.quiz_id
    LEFT JOIN participants p ON p.session_id = s.id
    LEFT JOIN answers a ON a.session_id = s.id
    LEFT JOIN (
      SELECT participant_id, SUM(points_earned) AS user_total
      FROM answers
      GROUP BY participant_id
    ) p_points ON p_points.participant_id = p.id
    GROUP BY s.id
    ORDER BY s.started_at DESC
  `);
  const sessions = stmt.all();

  if (sessions.length === 0) return sessions;

  // Kvízek maximális összpontszáma
  const quizPointsStmt = db.prepare(`
    SELECT quiz_id, COALESCE(SUM(points), 0.0) AS max_points
    FROM questions
    GROUP BY quiz_id
  `);
  const quizPointsMap = new Map();
  quizPointsStmt.all().forEach(row => {
    quizPointsMap.set(row.quiz_id, Number(row.max_points) || 0.0);
  });

  // Résztvevők összpontszáma dolgozatonként
  const participantsPointsStmt = db.prepare(`
    SELECT 
      p.session_id,
      p.id AS participant_id,
      COALESCE(SUM(a.points_earned), 0.0) AS user_total,
      COUNT(a.id) AS answers_count
    FROM participants p
    LEFT JOIN answers a ON a.participant_id = p.id
    GROUP BY p.id
  `);
  const sessionParticipantsMap = new Map();
  participantsPointsStmt.all().forEach(row => {
    if (!sessionParticipantsMap.has(row.session_id)) {
      sessionParticipantsMap.set(row.session_id, []);
    }
    sessionParticipantsMap.get(row.session_id).push(row);
  });

  return sessions.map(s => {
    let thresholds = { 2: 30, 3: 55, 4: 75, 5: 90 };
    try {
      if (s.grade_thresholds_json) thresholds = JSON.parse(s.grade_thresholds_json);
    } catch {
      thresholds = { 2: 30, 3: 55, 4: 75, 5: 90 };
    }

    const maxPoints = (s.max_points !== null && s.max_points !== undefined && Number(s.max_points) > 0)
      ? Number(s.max_points)
      : (quizPointsMap.get(s.quiz_id) || 0.0);
    const parts = sessionParticipantsMap.get(s.id) || [];

    let sumGrades = 0;
    let sumPercentages = 0;
    let validCount = 0;

    parts.forEach(p => {
      if (p.answers_count > 0) {
        const pct = maxPoints > 0 ? Math.round((p.user_total / maxPoints) * 100) : 0;
        const gr = grader.calculateGrade(pct, thresholds);
        sumGrades += gr;
        sumPercentages += pct;
        validCount++;
      }
    });

    let avg_grade = null;
    let avg_percentage = null;

    if (validCount > 0) {
      avg_grade = Number((sumGrades / validCount).toFixed(1));
      avg_percentage = Math.round(sumPercentages / validCount);
    }

    return {
      ...s,
      avg_grade,
      avg_percentage
    };
  });
}

/**
 * Egy adott tantárgy-évfolyam csatorna aktív dolgozatának lekérése
 */
function getActiveSessionByChannel(subjectId, gradeLevel) {
  const stmt = db.prepare(`
    SELECT 
      s.id,
      s.subject_id,
      sub.name AS subject_name,
      s.grade_level,
      s.class_name,
      s.quiz_id,
      q.title AS quiz_title,
      s.mode,
      s.status,
      s.time_limit_min,
      s.shuffle_questions,
      s.shuffle_options,
      s.show_feedback_on_end,
      s.current_question_index,
      s.grade_thresholds_json,
      s.started_at
    FROM sessions s
    JOIN subjects sub ON sub.id = s.subject_id
    JOIN quizzes q ON q.id = s.quiz_id
    WHERE s.subject_id = ? AND s.grade_level = ? AND s.status = 'ACTIVE'
  `);
  return stmt.get(subjectId, String(gradeLevel));
}

/**
 * Dolgozat lekérése azonosító alapján
 */
function getSessionById(sessionId) {
  const stmt = db.prepare(`
    SELECT 
      s.*,
      COALESCE(
        NULLIF(s.class_name, ''),
        (SELECT GROUP_CONCAT(DISTINCT st.class_name) FROM participants p2 JOIN students st ON st.id = p2.student_id WHERE p2.session_id = s.id),
        ''
      ) AS class_name,
      sub.name AS subject_name,
      q.title AS quiz_title,
      q.default_time_limit_min
    FROM sessions s
    JOIN subjects sub ON sub.id = s.subject_id
    JOIN quizzes q ON q.id = s.quiz_id
    WHERE s.id = ?
  `);
  return stmt.get(sessionId);
}

/**
 * Új dolgozat indítása egy tantárgy-évfolyam csatornán
 */
function startSession({
  subject_id = 1,
  grade_level,
  quiz_id,
  class_name = '',
  mode = 'STUDENT_PACED',
  time_limit_min = 0,
  shuffle_questions = null,
  shuffle_options = 0,
  show_feedback_on_end = null,
  grade_thresholds = null
}) {
  const trimmedGrade = String(grade_level || '').trim();
  if (!trimmedGrade) throw new Error('Az évfolyam megadása kötelező!');
  if (!quiz_id) throw new Error('A teszt kiválasztása kötelező!');

  // Ellenőrizzük, hogy a kiválasztott teszt létezik-e és nincs-e törölve (Report 17 / 1.3 fejezet)
  const quizCheck = db.prepare('SELECT id, is_deleted FROM quizzes WHERE id = ?').get(quiz_id);
  if (!quizCheck || quizCheck.is_deleted === 1) {
    throw new Error('A kiválasztott teszt nem található vagy korábban törlésre került!');
  }

  if (mode === 'TEACHER_PACED') {
    throw new Error('A Tanári léptetés mód fejlesztés alatt áll. Kérjük, válaszd a Diák-tempó vagy Űrhajós verseny módot!');
  }

  // Ellenőrizzük, hogy fut-e már aktív dolgozat ezen a csatornán
  const existingActive = getActiveSessionByChannel(subject_id, trimmedGrade);
  if (existingActive) {
    throw new Error(`Ezen a csatornán (${existingActive.subject_name} ${trimmedGrade}. évfolyam) már fut egy aktív dolgozat! Előbb azt kell lezárni.`);
  }

  const activeSettings = settingsRepo.getSettings ? settingsRepo.getSettings() : null;
  const activeThresholds = grade_thresholds || (activeSettings ? activeSettings.grade_thresholds : null);
  const thresholdsJson = activeThresholds ? JSON.stringify(activeThresholds) : '{"2":30,"3":55,"4":75,"5":90}';

  let effectiveShuffleQuestions = shuffle_questions;
  if (effectiveShuffleQuestions === null || effectiveShuffleQuestions === undefined) {
    effectiveShuffleQuestions = activeSettings?.classroom_settings?.shuffle_questions ? 1 : 0;
  }

  let effectiveShowFeedback = show_feedback_on_end;
  if (effectiveShowFeedback === null || effectiveShowFeedback === undefined) {
    effectiveShowFeedback = activeSettings?.classroom_settings?.hide_immediate_feedback ? 0 : 1;
  }

  let sessionId = null;
  const tx = db.transaction(() => {
    // Kvíz teljes állapotának rögzítése indításkor (Snapshot a Report 15 / 2. fejezet alapján)
    const currentQuiz = quizRepo.getQuizById(Number(quiz_id), false);
    if (!currentQuiz) throw new Error('A megadott teszt nem található!');
    if (!currentQuiz.questions || currentQuiz.questions.length === 0) {
      throw new Error('Üres teszt nem indítható el dolgozatként!');
    }
    // Ellenőrizzük, hogy minden feladathoz tartozik-e érvényes megoldókulcs (Report 15 / 3. fejezet)
    for (const q of currentQuiz.questions) {
      if (!q.correct_answer || String(q.correct_answer).trim() === '') {
        throw new Error(`A(z) ${q.question_order || ''}. kérdésnél hiányzik a megoldókulcs! Kérjük, add meg a helyes választ a Tesztszerkesztőben az indítás előtt.`);
      }
    }
    const initialMaxPoints = Number(currentQuiz.total_points) || 0.0;
    const quizSnapshotJson = JSON.stringify(currentQuiz);

    const insertStmt = db.prepare(`
      INSERT INTO sessions (
        subject_id, grade_level, quiz_id, class_name, mode, status,
        time_limit_min, shuffle_questions, shuffle_options, show_feedback_on_end,
        grade_thresholds_json, max_points, quiz_snapshot_json, started_at, ended_at
      ) VALUES (
        ?, ?, ?, ?, ?, 'ACTIVE',
        ?, ?, ?, ?,
        ?, ?, ?, CURRENT_TIMESTAMP, NULL
      )
    `);

    const result = insertStmt.run(
      Number(subject_id) || 1,
      trimmedGrade,
      Number(quiz_id),
      String(class_name || '').trim(),
      mode,
      Number(time_limit_min) || 0,
      effectiveShuffleQuestions ? 1 : 0,
      shuffle_options ? 1 : 0,
      effectiveShowFeedback ? 1 : 0,
      thresholdsJson,
      initialMaxPoints,
      quizSnapshotJson
    );

    sessionId = result.lastInsertRowid;
    // Megjegyzés: Az INSERT ON sessions automatikusan kiváltja a trg_auto_lock_quiz_on_session triggert,
    // így a kvíz azonnal zárolttá válik az adatbázisban!
  });

  tx();
  return getSessionById(sessionId);
}

/**
 * Dolgozat befejezése (Lezárás - Finish)
 */
function finishSession(sessionId) {
  const tx = db.transaction(() => {
    // 1. Még aktív tanulók automatikus lezárása (amíg a session még ACTIVE státuszú)
    db.prepare(`
      UPDATE participants
      SET is_finished = 1, finished_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND is_finished = 0
    `).run(sessionId);

    // 2. Session státusz végleges lezárása (FINISHED), max_points beégetése és osztálynév beégetése történeti archívumként
    const quizPointsRow = db.prepare('SELECT COALESCE(SUM(points), 0.0) as mp FROM questions WHERE quiz_id = (SELECT quiz_id FROM sessions WHERE id = ?)').get(sessionId);
    const lockedMaxPoints = quizPointsRow ? Number(quizPointsRow.mp) || 0.0 : 0.0;

    const updateSessionStmt = db.prepare(`
      UPDATE sessions 
      SET status = 'FINISHED', 
          ended_at = CURRENT_TIMESTAMP,
          max_points = CASE WHEN max_points IS NOT NULL AND max_points > 0 THEN max_points ELSE ? END,
          class_name = CASE 
            WHEN class_name IS NOT NULL AND class_name != '' THEN class_name
            ELSE COALESCE(
              (SELECT GROUP_CONCAT(DISTINCT st.class_name) FROM participants p2 JOIN students st ON st.id = p2.student_id WHERE p2.session_id = ?),
              ''
            )
          END
      WHERE id = ? AND status = 'ACTIVE'
    `);
    const sessionRes = updateSessionStmt.run(lockedMaxPoints, sessionId, sessionId);
    if (sessionRes.changes === 0) {
      throw new Error('A dolgozat nem található vagy már le van zárva!');
    }
  });

  tx();
  return getSessionById(sessionId);
}

/**
 * Tanuló belépése a dolgozatba (Session Recovery és új belépés kezelése)
 */
function joinSession({ session_id, student_id, student_name, pc_number = null, team_color = null, session_token = null }) {
  const session = getSessionById(session_id);
  if (!session) throw new Error('A megadott dolgozat nem létezik!');
  if (session.status !== 'ACTIVE') throw new Error('Ez a dolgozat már lezárult, nem lehet csatlakozni!');

  // Ellenőrizzük, szerepel-e már a tanuló ebben a dolgozatban (Recovery)
  const existingParticipant = db.prepare(`
    SELECT * FROM participants
    WHERE session_id = ? AND (student_id = ? OR student_name = ?)
  `).get(session_id, student_id, student_name);

  if (existingParticipant) {
    // 1. Eset: A tanár engedélyezte a gépváltást (Report 12 & Report 13 - korábbi válaszok megtartásával és opcionális célgép-követeléssel!)
    const isPendingSeatChange = existingParticipant.session_token && existingParticipant.session_token.startsWith('PENDING_SEAT_CHANGE:');
    if (isPendingSeatChange) {
      // Report 13 / 1.2 & Report 15 / 2. fejezet: Célgép és 15 perces engedély-lejárat ellenőrzése
      const tokenParts = existingParticipant.session_token.split(':');
      if (tokenParts.length >= 4) {
        const requiredPc = parseInt(tokenParts[1], 10);
        if (!isNaN(requiredPc) && requiredPc > 0 && pc_number !== requiredPc) {
          throw new Error(`A tanár a(z) ${requiredPc}. munkaállomásra engedélyezte a gépváltást! Ez a gép a(z) ${pc_number || 'ismeretlen'}.`);
        }
        const createdAtMs = parseInt(tokenParts[2], 10);
        if (!isNaN(createdAtMs) && (Date.now() - createdAtMs) > 15 * 60 * 1000) {
          throw new Error('A gépváltási engedély lejárt (15 perces időkeret). Kérj új engedélyt a tanártól!');
        }
      } else if (tokenParts.length >= 3) {
        const requiredPc = parseInt(tokenParts[1], 10);
        if (!isNaN(requiredPc) && requiredPc > 0 && pc_number !== requiredPc) {
          throw new Error(`A tanár a(z) ${requiredPc}. munkaállomásra engedélyezte a gépváltást! Ez a gép a(z) ${pc_number || 'ismeretlen'}.`);
        }
      }

      // Új titkos token generálása az új munkaállomásnak (a régi gép régi tokenje érvénytelen lesz)
      const newSessionToken = crypto.randomBytes(16).toString('hex');

      db.prepare(`
        UPDATE participants
        SET 
          session_token = ?,
          pc_number = COALESCE(?, pc_number),
          team_color = COALESCE(?, team_color)
        WHERE id = ?
      `).run(newSessionToken, pc_number, team_color, existingParticipant.id);

      // Korábbi válaszok betöltése az új gépre
      const answers = db.prepare(`
        SELECT question_id, submitted_answer, eval_status, is_correct, points_earned
        FROM answers
        WHERE participant_id = ?
      `).all(existingParticipant.id);

      return {
        isRecovery: true,
        seatChanged: true,
        participant: {
          ...existingParticipant,
          session_token: newSessionToken,
          pc_number: pc_number !== null ? pc_number : existingParticipant.pc_number,
          team_color: team_color !== null ? team_color : existingParticipant.team_color
        },
        answers
      };
    }

    // 2. Eset: OWASP & Report 11 Tokenbiztonság: Másik böngésző nem veheti át a munkamenetet érvényes token nélkül!
    if (!session_token || session_token !== existingParticipant.session_token) {
      throw new Error(`Ez a tanuló már csatlakozott a dolgozathoz! A munkamenet átvétele érvényes hitelesítő token nélkül nem engedélyezett. Ha gépcsere történt, a tanárnak engedélyeznie kell a gépváltást a vezérlőpulton.`);
    }

    // 3. Eset: Azonos böngésző / érvényes token birtokában normál folytatás
    if (pc_number !== null || team_color !== null) {
      db.prepare(`
        UPDATE participants
        SET 
          pc_number = COALESCE(?, pc_number),
          team_color = COALESCE(?, team_color)
        WHERE id = ?
      `).run(pc_number, team_color, existingParticipant.id);
    }

    // Korábban leadott válaszok betöltése
    const answers = db.prepare(`
      SELECT question_id, submitted_answer, eval_status, is_correct, points_earned
      FROM answers
      WHERE participant_id = ?
    `).all(existingParticipant.id);

    return {
      isRecovery: true,
      seatChanged: false,
      participant: {
        ...existingParticipant,
        pc_number: pc_number !== null ? pc_number : existingParticipant.pc_number,
        team_color: team_color !== null ? team_color : existingParticipant.team_color
      },
      answers
    };
  }

  // ÚJ RÉSZTVEVŐ REGISZTRÁCIÓJA
  const sessionToken = crypto.randomBytes(16).toString('hex');

  // Kérdések sorrendjének generálása a rögzített dolgozatkori pillanatképből (Report 16 / 2. fejezet)
  let questionIds = [];
  if (session.quiz_snapshot_json) {
    try {
      const snap = JSON.parse(session.quiz_snapshot_json);
      if (Array.isArray(snap.questions) && snap.questions.length > 0) {
        questionIds = snap.questions.map(q => q.id);
      }
    } catch (err) {
      console.warn('Hiba a snapshot kérdések betöltésekor joinSession-ben:', err);
    }
  }

  if (questionIds.length === 0) {
    const questions = db.prepare(`
      SELECT id FROM questions 
      WHERE quiz_id = ? AND question_order < 100000
      ORDER BY question_order ASC
    `).all(session.quiz_id);
    questionIds = questions.map(q => q.id);
  }

  if (session.shuffle_questions === 1) {
    // Fisher-Yates keverés
    for (let i = questionIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questionIds[i], questionIds[j]] = [questionIds[j], questionIds[i]];
    }
  }

  // Szerveroldali határidő kiszámítása (ha van időkorlát)
  let deadlineAt = null;
  if (session.time_limit_min > 0) {
    if (session.mode === 'SPACE_RACE') {
      if (session.current_question_index === 0 || session.current_question_index === null) {
        // Space Race módban a rajt előtt nincs ketyegő határidő a váróban!
        deadlineAt = null;
      } else {
        // Ha a verseny már elrajtolt és a diák késve csatlakozik, a már futó közös határidőhöz igazodunk
        const existingDeadline = db.prepare(`
          SELECT deadline_at FROM participants 
          WHERE session_id = ? AND deadline_at IS NOT NULL 
          LIMIT 1
        `).get(session.id);
        if (existingDeadline && existingDeadline.deadline_at) {
          deadlineAt = existingDeadline.deadline_at;
        } else {
          // Ha rajtkor üres volt a terem, a session rajtjának explicit UTC idejétől számolunk (Report 16 / 3. fejezet)
          const raceStartMs = session.started_at ? parseUtcDate(session.started_at).getTime() : Date.now();
          const targetDeadlineMs = raceStartMs + (session.time_limit_min * 60 * 1000);
          deadlineAt = new Date(targetDeadlineMs).toISOString();
        }
      }
    } else {
      const deadlineMs = Date.now() + (session.time_limit_min * 60 * 1000);
      deadlineAt = new Date(deadlineMs).toISOString();
    }
  }

  let newParticipantId = null;
  const tx = db.transaction(() => {
    const insertStmt = db.prepare(`
      INSERT INTO participants (
        session_id, student_id, pc_number, student_name, session_token,
        question_order_json, team_color, focus_lost_count, is_finished,
        joined_at, deadline_at, finished_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, 0, 0,
        CURRENT_TIMESTAMP, ?, NULL
      )
    `);

    const result = insertStmt.run(
      session_id,
      student_id,
      pc_number,
      student_name,
      sessionToken,
      JSON.stringify(questionIds),
      team_color,
      deadlineAt
    );

    newParticipantId = result.lastInsertRowid;
  });

  tx();

  const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(newParticipantId);
  return {
    isRecovery: false,
    participant,
    answers: []
  };
}

/**
 * Résztvevő lekérése munkamenet token alapján
 */
function getParticipantByToken(sessionToken) {
  const stmt = db.prepare(`
    SELECT 
      p.*,
      s.subject_id,
      sub.name AS subject_name,
      s.grade_level,
      s.class_name AS session_class_name,
      s.quiz_id,
      q.title AS quiz_title,
      s.mode,
      s.status AS session_status,
      s.current_question_index,
      s.time_limit_min,
      s.shuffle_options,
      s.show_feedback_on_end,
      s.grade_thresholds_json,
      s.max_points,
      s.quiz_snapshot_json
    FROM participants p
    JOIN sessions s ON s.id = p.session_id
    JOIN subjects sub ON sub.id = s.subject_id
    JOIN quizzes q ON q.id = s.quiz_id
    WHERE p.session_token = ?
  `);
  return stmt.get(sessionToken);
}

/**
 * Fókuszvesztés esemény rögzítése
 */
function recordFocusLost(participantId) {
  const stmt = db.prepare(`
    UPDATE participants 
    SET focus_lost_count = focus_lost_count + 1 
    WHERE id = ?
  `);
  stmt.run(participantId);

  const updated = db.prepare('SELECT id, session_id, student_name, focus_lost_count FROM participants WHERE id = ?').get(participantId);
  return updated;
}

/**
 * Diák önálló dolgozat-befejezése (Beküldés)
 */
function finishParticipant(participantId) {
  const stmt = db.prepare(`
    UPDATE participants 
    SET is_finished = 1, finished_at = CURRENT_TIMESTAMP 
    WHERE id = ? AND is_finished = 0
  `);
  stmt.run(participantId);
  return db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId);
}

/**
 * Gépváltás engedélyezése adatvesztés nélkül (Report 12 / 2.2 & Report 13 / 1.2)
 * A korábbi válaszok és pontok megmaradnak, új token keletkezik a diák új munkaállomásához,
 * míg a régi munkaállomás régi tokenje azonnal érvénytelenné válik.
 * @param {number} participantId - Résztvevő azonosítója
 * @param {number|null} targetPcNumber - Opcionális célgép száma (1-42), amelyhez a váltás köthető
 */
function authorizeSeatChange(participantId, targetPcNumber = null) {
  const participant = db.prepare(`
    SELECT p.id, p.session_id, p.student_id, p.student_name, p.is_finished, s.status AS session_status 
    FROM participants p
    JOIN sessions s ON s.id = p.session_id
    WHERE p.id = ?
  `).get(participantId);

  if (!participant) throw new Error('A résztvevő nem található!');
  if (participant.session_status === 'FINISHED') {
    throw new Error('Lezárt dolgozatban nem engedélyezhető gépváltás!');
  }
  if (participant.is_finished === 1) {
    throw new Error('A tanuló már befejezte a dolgozatot, gépváltás nem engedélyezhető!');
  }

  const pcTag = (targetPcNumber && parseInt(targetPcNumber, 10) > 0) ? parseInt(targetPcNumber, 10) : 'ANY';
  // A meglévő token érvénytelenítése egy ideiglenes állapotjelző tokenre (egyszer használatos, 15 percig érvényes)
  const pendingToken = `PENDING_SEAT_CHANGE:${pcTag}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`;
  db.prepare(`
    UPDATE participants 
    SET session_token = ? 
    WHERE id = ?
  `).run(pendingToken, participantId);

  return {
    success: true,
    participantId: participant.id,
    studentId: participant.student_id,
    sessionId: participant.session_id,
    studentName: participant.student_name,
    targetPcNumber: pcTag !== 'ANY' ? pcTag : null
  };
}

/**
 * Téves névfoglalás feloldása és törlése (Report 12 / 2.2 - Reset)
 * Kizárólag akkor használandó, ha valaki véletlenül egy másik tanuló nevére kattintott a névsorban.
 * Törli a résztvevő rekordot és a tévesen leadott válaszokat az aktív dolgozatból.
 */
function resetParticipant(participantId) {
  const participant = db.prepare(`
    SELECT p.id, p.session_id, s.status 
    FROM participants p
    JOIN sessions s ON s.id = p.session_id
    WHERE p.id = ?
  `).get(participantId);

  if (!participant) throw new Error('A résztvevő nem található!');
  if (participant.status === 'FINISHED') {
    throw new Error('Lezárt dolgozatban a résztvevő nem törölhető és nem oldható fel!');
  }

  const tx = db.transaction(() => {
    // Válaszok törlése
    db.prepare('DELETE FROM answers WHERE participant_id = ?').run(participantId);
    // Résztvevő törlése
    db.prepare('DELETE FROM participants WHERE id = ?').run(participantId);
  });

  tx();
  return true;
}

/**
 * Visszamenőleges kompatibilitási alias a téves névfoglalás feloldásához
 */
function unlockParticipant(participantId) {
  return resetParticipant(participantId);
}

/**
 * Diákválasz beküldése és értékelése (Tranzakcióban, idempotens és határidő-védett módon)
 */
function submitAnswer({
  participant_id,
  question_id,
  submitted_answer,
  time_spent_sec = 0
}) {
  let result = null;

  // 0. Határidő és alapállapot ellenőrzése a tranzakción kívül (hogy lejáratkor a befejezés tartósan megmaradjon!)
  const preCheck = db.prepare(`
    SELECT p.id, p.is_finished, p.deadline_at, s.status AS session_status, s.mode AS session_mode, s.current_question_index, s.quiz_snapshot_json, s.quiz_id
    FROM participants p
    JOIN sessions s ON s.id = p.session_id
    WHERE p.id = ?
  `).get(participant_id);

  const makeRejectError = (msg, code) => Object.assign(new Error(msg), { code });

  if (!preCheck) throw makeRejectError('A résztvevő nem található!', 'PARTICIPANT_UNKNOWN');

  // Idempotens védelem: ha erre a kérdésre már mentve van válasz, azt hiba nélkül visszaadjuk (befejezett dolgozatnál is!)
  const existingAnswer = db.prepare(`
    SELECT * FROM answers
    WHERE participant_id = ? AND question_id = ?
  `).get(participant_id, question_id);

  if (existingAnswer) {
    let qCorrect = null;
    let qExp = null;
    if (preCheck.quiz_snapshot_json) {
      try {
        const snap = JSON.parse(preCheck.quiz_snapshot_json);
        const found = (snap.questions || []).find(q => String(q.id) === String(question_id));
        if (found) {
          qCorrect = found.correct_answer;
          qExp = found.explanation;
        }
      } catch {}
    }
    if (qCorrect === null) {
      const qInfo = db.prepare('SELECT correct_answer, explanation FROM questions WHERE id = ?').get(question_id);
      qCorrect = qInfo ? qInfo.correct_answer : null;
      qExp = qInfo ? qInfo.explanation : null;
    }
    return {
      alreadySubmitted: true,
      answer: existingAnswer,
      isFinished: preCheck.is_finished === 1,
      correctAnswer: qCorrect,
      explanation: qExp
    };
  }

  if (preCheck.session_status !== 'ACTIVE' || preCheck.is_finished === 1) {
    throw makeRejectError('A dolgozat már befejeződött, új válasz nem küldhető be!', 'SESSION_INACTIVE');
  }

  // Űrhajós verseny közös rajt előtti válaszvédelem (Report 14 / 16. pont)
  if (preCheck.session_mode === 'SPACE_RACE' && (preCheck.current_question_index === 0 || preCheck.current_question_index === null)) {
    throw makeRejectError('A verseny még nem indult el, válasz még nem küldhető be!', 'RACE_NOT_STARTED');
  }

  if (preCheck.deadline_at) {
    const now = new Date();
    const deadline = new Date(preCheck.deadline_at);
    if (now >= deadline) {
      // Idő lejárt: tartósan befejezettre állítjuk a tanulót az adatbázisban
      db.prepare('UPDATE participants SET is_finished = 1, finished_at = CURRENT_TIMESTAMP WHERE id = ?').run(participant_id);
      throw makeRejectError('Az egyéni időkorlát lejárt, a dolgozat automatikusan lezárásra került!', 'DEADLINE_EXCEEDED');
    }
  }

  // BEGIN IMMEDIATE tranzakció konkurens beküldések kezelésére
  const tx = db.transaction(() => {
    // 1. Résztvevő és Session ellenőrzése
    const participant = db.prepare(`
      SELECT 
        p.id, p.session_id, p.is_finished, p.deadline_at,
        s.status AS session_status, s.quiz_id, s.quiz_snapshot_json
      FROM participants p
      JOIN sessions s ON s.id = p.session_id
      WHERE p.id = ?
    `).get(participant_id);

    if (!participant) throw makeRejectError('A résztvevő nem található!', 'PARTICIPANT_UNKNOWN');

    // 2. Idempotens védelem: ha már mentve van ez a válasz, hiba nélkül visszaadjuk a meglévőt!
    const existingAnswer = db.prepare(`
      SELECT * FROM answers
      WHERE participant_id = ? AND question_id = ?
    `).get(participant_id, question_id);

    if (existingAnswer) {
      let qCorrect = null;
      let qExp = null;
      if (participant.quiz_snapshot_json) {
        try {
          const snap = JSON.parse(participant.quiz_snapshot_json);
          const found = (snap.questions || []).find(q => String(q.id) === String(question_id));
          if (found) {
            qCorrect = found.correct_answer;
            qExp = found.explanation;
          }
        } catch {}
      }
      if (qCorrect === null) {
        const qInfo = db.prepare('SELECT correct_answer, explanation FROM questions WHERE id = ?').get(question_id);
        qCorrect = qInfo ? qInfo.correct_answer : null;
        qExp = qInfo ? qInfo.explanation : null;
      }
      result = {
        alreadySubmitted: true,
        answer: existingAnswer,
        isFinished: participant.is_finished === 1,
        correctAnswer: qCorrect,
        explanation: qExp
      };
      return;
    }

    // 3. Dolgozat és határidő vizsgálat
    if (participant.session_status !== 'ACTIVE' || participant.is_finished === 1) {
      throw makeRejectError('A dolgozat már befejeződött, új válasz nem küldhető be!', 'SESSION_INACTIVE');
    }

    // 4. Kérdés adatainak lekérése a rögzített pillanatképből (Report 16 / 2. fejezet)
    let question = null;
    let totalQuestionsCount = 0;
    if (participant.quiz_snapshot_json) {
      try {
        const snap = JSON.parse(participant.quiz_snapshot_json);
        const qList = snap.questions || [];
        totalQuestionsCount = qList.length;
        const found = qList.find(q => String(q.id) === String(question_id));
        if (found) {
          question = {
            id: found.id,
            quiz_id: participant.quiz_id,
            question_type: found.question_type,
            options_json: typeof found.options === 'string' ? found.options : JSON.stringify(found.options || []),
            correct_answer: found.correct_answer,
            explanation: found.explanation || '',
            points: Number(found.points !== undefined ? found.points : 1)
          };
        }
      } catch (err) {
        console.warn('Hiba a snapshot kérdés lekérésekor submitAnswer-ben:', err);
      }
    }

    if (!question && !participant.quiz_snapshot_json) {
      // Csak pillanatkép nélküli történeti sessionök esetén megengedett a fallback a sablonra (Report 17 / 1.2 fejezet)
      question = db.prepare(`
        SELECT id, quiz_id, question_type, options_json, correct_answer, explanation, points
        FROM questions
        WHERE id = ? AND quiz_id = ?
      `).get(question_id, participant.quiz_id);
    }

    if (!question) {
      throw makeRejectError('A kérdés nem található a dolgozatban!', 'QUESTION_NOT_FOUND');
    }

    let parsedOptions = [];
    try {
      parsedOptions = JSON.parse(question.options_json || '[]');
    } catch {
      parsedOptions = [];
    }

    // 5. Gépi kiértékelés (grader) a pillanatfelvétel alapján
    const evaluation = grader.evaluateAnswer(
      question.question_type,
      submitted_answer,
      question.correct_answer,
      question.points,
      parsedOptions
    );

    // 6. Válasz beszúrása az answers táblába
    const insertStmt = db.prepare(`
      INSERT INTO answers (
        session_id, participant_id, question_id, submitted_answer,
        eval_status, is_correct, points_earned, original_points_earned,
        is_manually_overridden, overridden_at, time_spent_sec, answered_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        0, NULL, ?, CURRENT_TIMESTAMP
      )
    `);

    const insertRes = insertStmt.run(
      participant.session_id,
      participant.id,
      question.id,
      String(submitted_answer || '').trim(),
      evaluation.eval_status,
      evaluation.is_correct,
      evaluation.points_earned,
      evaluation.points_earned, // original_points_earned azonos az első ponttal
      Math.max(0, parseInt(time_spent_sec, 10) || 0)
    );

    const savedAnswer = db.prepare('SELECT * FROM answers WHERE id = ?').get(insertRes.lastInsertRowid);

    // 7. Ellenőrizzük, hogy válaszolt-e az összes kérdésre a snapshot szerint
    let totalQuestions = totalQuestionsCount;
    if (totalQuestions <= 0) {
      totalQuestions = db.prepare('SELECT COUNT(*) as cnt FROM questions WHERE quiz_id = ? AND question_order < 100000').get(participant.quiz_id).cnt;
    }
    const answeredCount = db.prepare('SELECT COUNT(*) as cnt FROM answers WHERE participant_id = ?').get(participant.id).cnt;

    let isNowFinished = false;
    if (answeredCount >= totalQuestions) {
      db.prepare(`
        UPDATE participants 
        SET is_finished = 1, finished_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(participant.id);
      isNowFinished = true;
    }

    result = {
      alreadySubmitted: false,
      answer: savedAnswer,
      isFinished: isNowFinished,
      correctAnswer: question.correct_answer, // Azonnali Socrative visszajelzéshez a válasz beküldésekor
      explanation: question.explanation
    };
  });

  tx();
  return result;
}

/**
 * Tanári kézi felülbírálás (1-kattintásos zöld/sárga/piros állapotváltás)
 */
function overrideAnswer({
  answer_id,
  eval_status, // 'CORRECT' | 'PARTIAL' | 'WRONG'
  custom_points = null
}) {
  const allowedStatuses = ['CORRECT', 'PARTIAL', 'WRONG'];
  if (!allowedStatuses.includes(eval_status)) {
    throw new Error('Érvénytelen értékelési státusz!');
  }

  const answer = db.prepare(`
    SELECT a.*, q.points AS db_max_points, s.status AS session_status, s.quiz_snapshot_json
    FROM answers a
    LEFT JOIN questions q ON q.id = a.question_id
    JOIN sessions s ON s.id = a.session_id
    WHERE a.id = ?
  `).get(answer_id);

  if (!answer) throw new Error('A válasz nem található!');

  if (answer.session_status === 'FINISHED') {
    throw new Error('Lezárt dolgozatban a válaszok és pontszámok utólag nem módosíthatók!');
  }

  let maxPoints = answer.db_max_points !== null && answer.db_max_points !== undefined ? Number(answer.db_max_points) : 1;
  if (answer.quiz_snapshot_json) {
    try {
      const snap = JSON.parse(answer.quiz_snapshot_json);
      const found = (snap.questions || []).find(q => String(q.id) === String(answer.question_id));
      if (found && found.points !== undefined) {
        maxPoints = Number(found.points);
      }
    } catch {}
  }

  // Pontszám kiszámítása a státusz alapján (ha nincs egyedi pont megadva)
  let newPoints = 0.0;
  let isCorrect = 0;

  if (custom_points !== null && custom_points !== undefined) {
    const numPoints = Number(custom_points);
    if (!Number.isFinite(numPoints)) {
      throw new Error('A megadott pontszám érvénytelen (csak véges számérték adható meg)!');
    }
    if (numPoints < 0) {
      throw new Error('A megadott pontszám nem lehet negatív!');
    }
    if (numPoints > maxPoints) {
      throw new Error(`A megadott pontszám (${numPoints} pont) meghaladja a kérdés maximális pontértékét (${maxPoints} pont)!`);
    }
    if (eval_status === 'PARTIAL' && numPoints === 0) {
      throw new Error('Részpontszám (PARTIAL) esetén a pontszámnak nagyobbnak kell lennie 0-nál!');
    }
    if (eval_status === 'WRONG' && numPoints > 0) {
      throw new Error('Hibás (WRONG) értékelés esetén a pontszám kizárólag 0 lehet!');
    }
    newPoints = numPoints;
    isCorrect = newPoints > 0 ? 1 : 0;
  } else {
    if (eval_status === 'CORRECT') {
      newPoints = maxPoints;
      isCorrect = 1;
    } else if (eval_status === 'PARTIAL') {
      newPoints = maxPoints / 2.0;
      isCorrect = 1;
    } else {
      newPoints = 0.0;
      isCorrect = 0;
    }
  }

  db.prepare(`
    UPDATE answers
    SET 
      eval_status = ?,
      is_correct = ?,
      points_earned = ?,
      is_manually_overridden = 1,
      overridden_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(eval_status, isCorrect, newPoints, answer_id);

  return db.prepare('SELECT * FROM answers WHERE id = ?').get(answer_id);
}

/**
 * Teljes élő mátrix adatsor lekérése (Tanári 1. monitor számára)
 */
function getLiveMatrixData(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) return null;

  const thresholds = JSON.parse(session.grade_thresholds_json || '{"2":30,"3":55,"4":75,"5":90}');

  // Teszt kérdései: elsősorban a rögzített pillanatképből (Snapshotból), fallbackként a questions táblából
  let questions = [];
  if (session.quiz_snapshot_json) {
    try {
      const snapshot = JSON.parse(session.quiz_snapshot_json);
      if (Array.isArray(snapshot.questions) && snapshot.questions.length > 0) {
        questions = snapshot.questions.map(q => {
          let options = Array.isArray(q.options) ? q.options : [];
          if (!options.length && q.options_json) {
            try { options = JSON.parse(q.options_json); } catch { options = []; }
          }
          return {
            ...q,
            options
          };
        });
      }
    } catch {
      questions = [];
    }
  }

  if (questions.length === 0) {
    const rawQuestions = db.prepare(`
      SELECT id, question_order, question_type, question_text, instructions, options_json, correct_answer, explanation, points, image_path
      FROM questions
      WHERE quiz_id = ? AND question_order < 100000
      ORDER BY question_order ASC
    `).all(session.quiz_id);

    questions = rawQuestions.map(q => {
      let options = [];
      try {
        options = JSON.parse(q.options_json || '[]');
      } catch {
        options = [];
      }
      return {
        ...q,
        options
      };
    });
  }

  const totalMaxPoints = (session.max_points !== null && session.max_points !== undefined && Number(session.max_points) > 0)
    ? Number(session.max_points)
    : questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);

  // Résztvevők
  const participants = db.prepare(`
    SELECT 
      p.id,
      p.student_id,
      p.pc_number,
      p.student_name,
      p.team_color,
      p.focus_lost_count,
      p.is_finished,
      p.joined_at,
      p.deadline_at,
      p.finished_at,
      COALESCE(SUM(a.points_earned), 0.0) AS total_points,
      COUNT(a.id) AS answered_count
    FROM participants p
    LEFT JOIN answers a ON a.participant_id = p.id
    WHERE p.session_id = ?
    GROUP BY p.id
    ORDER BY p.student_name COLLATE NOCASE ASC
  `).all(sessionId);

  // Az összes válasz egy tömbben a gyors kliensoldali rendereléshez
  const answers = db.prepare(`
    SELECT 
      a.id,
      a.participant_id,
      a.question_id,
      a.submitted_answer,
      a.eval_status,
      a.is_correct,
      a.points_earned,
      a.is_manually_overridden,
      a.time_spent_sec
    FROM answers a
    WHERE a.session_id = ?
  `).all(sessionId);

  // Résztvevők kiegészítése százalékkal és KRÉTA jeggyel
  const enrichedParticipants = participants.map(p => {
    const percentage = totalMaxPoints > 0 ? Math.round((p.total_points / totalMaxPoints) * 100) : 0;
    const grade = grader.calculateGrade(percentage, thresholds);
    const gradeText = grader.getGradeText(grade);

    return {
      ...p,
      total_points: Number(p.total_points.toFixed(2)),
      percentage,
      grade,
      gradeText
    };
  });

  return {
    session,
    thresholds,
    totalMaxPoints,
    questions,
    participants: enrichedParticipants,
    answers
  };
}

/**
 * Űrhajós verseny indítása (Közös Rajt - Space Race)
 */
function startRace(sessionId) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) throw new Error('A dolgozat nem található!');
  if (session.status !== 'ACTIVE') throw new Error('Csak aktív dolgozat versenye indítható el!');
  if (session.mode !== 'SPACE_RACE') throw new Error('Csak űrverseny (Space Race) módban indítható közös rajt!');

  // Idempotens kezelés: az ismételt rajt nem indítja újra az időt (Report 15 / 1. fejezet)
  if (session.current_question_index && session.current_question_index >= 1) {
    return session;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const tx = db.transaction(() => {
    db.prepare('UPDATE sessions SET current_question_index = 1, started_at = ? WHERE id = ?').run(nowIso, sessionId);

    // Ha van időkorlát, az egyéni visszaszámlálót a közös rajt pillanatától indítjuk a már bent lévő diákoknak
    if (session.time_limit_min > 0) {
      const deadlineMs = now.getTime() + (session.time_limit_min * 60 * 1000);
      const deadlineAt = new Date(deadlineMs).toISOString();
      db.prepare(`
        UPDATE participants 
        SET deadline_at = ? 
        WHERE session_id = ? AND is_finished = 0
      `).run(deadlineAt, sessionId);
    }
  });

  tx();
  return { ...session, current_question_index: 1, started_at: nowIso };
}

/**
 * Másodlagos kivetítő monitorhoz aggregált, anonimizált adatok lekérése (Report 15 / 1. fejezet)
 * Kizárólag csapatállást és statisztikákat tartalmaz, semmilyen diáknevet vagy megoldókulcsot NEM!
 */
function getProjectorData(sessionId) {
  const data = getLiveMatrixData(sessionId);
  if (!data) return null;

  return {
    session: {
      id: data.session.id,
      quiz_title: data.session.quiz_title,
      subject_name: data.session.subject_name,
      grade_level: data.session.grade_level,
      mode: data.session.mode,
      current_question_index: data.session.current_question_index
    },
    participants: data.participants.map(p => ({
      team_color: p.team_color || 'Kék',
      total_points: p.total_points || 0
    })),
    questions: data.questions.map(q => ({
      id: q.id,
      question_text: q.question_text
    })),
    answers: data.answers.map(a => ({
      question_id: a.question_id,
      is_correct: a.is_correct
    })),
    totalMaxPoints: data.totalMaxPoints
  };
}

/**
 * Tanári léptetés kérdésindexének mentése
 */
function updateCurrentQuestionIndex(sessionId, questionIndex) {
  const idx = Math.max(0, parseInt(questionIndex, 10) || 0);
  db.prepare('UPDATE sessions SET current_question_index = ? WHERE id = ?').run(idx, sessionId);
  return idx;
}

/**
 * Dolgozat végleges törlése az archívumból (válaszokkal és résztvevőkkel együtt)
 */
function deleteSession(sessionId) {
  const session = db.prepare('SELECT id, status FROM sessions WHERE id = ?').get(sessionId);
  if (!session) throw new Error('A törlendő dolgozat nem található!');

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM answers WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM participants WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  });

  tx();
  return true;
}

module.exports = {
  getActiveSessions,
  getAllSessions,
  getActiveSessionByChannel,
  getSessionById,
  startSession,
  finishSession,
  deleteSession,
  startRace,
  joinSession,
  getParticipantByToken,
  recordFocusLost,
  finishParticipant,
  authorizeSeatChange,
  resetParticipant,
  unlockParticipant,
  submitAnswer,
  overrideAnswer,
  getLiveMatrixData,
  getProjectorData,
  updateCurrentQuestionIndex
};

