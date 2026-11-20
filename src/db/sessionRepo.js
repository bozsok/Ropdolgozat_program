const crypto = require('crypto');
const db = require('./init');
const grader = require('../services/grader');
const settingsRepo = require('./settingsRepo');

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
    const quizPointsRow = db.prepare('SELECT COALESCE(SUM(points), 0.0) as mp FROM questions WHERE quiz_id = ?').get(Number(quiz_id));
    const initialMaxPoints = quizPointsRow ? Number(quizPointsRow.mp) || 0.0 : 0.0;

    const insertStmt = db.prepare(`
      INSERT INTO sessions (
        subject_id, grade_level, quiz_id, class_name, mode, status,
        time_limit_min, shuffle_questions, shuffle_options, show_feedback_on_end,
        grade_thresholds_json, max_points, started_at, ended_at
      ) VALUES (
        ?, ?, ?, ?, ?, 'ACTIVE',
        ?, ?, ?, ?,
        ?, ?, CURRENT_TIMESTAMP, NULL
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
      initialMaxPoints
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
      // Report 13 / 1.2: Célgép ellenőrzése, ha a tanár konkrét munkaállomáshoz kötötte
      const tokenParts = existingParticipant.session_token.split(':');
      if (tokenParts.length >= 3) {
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

  // Kérdések sorrendjének generálása (Shuffle kezelése)
  const questions = db.prepare(`
    SELECT id FROM questions 
    WHERE quiz_id = ? AND question_order < 100000
    ORDER BY question_order ASC
  `).all(session.quiz_id);

  let questionIds = questions.map(q => q.id);
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
          deadlineAt = new Date(Date.now() + (session.time_limit_min * 60 * 1000)).toISOString();
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
      s.grade_thresholds_json
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
  // A meglévő token érvénytelenítése egy ideiglenes állapotjelző tokenre (egyszer használatos)
  const pendingToken = `PENDING_SEAT_CHANGE:${pcTag}:${crypto.randomBytes(8).toString('hex')}`;
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
    SELECT p.id, p.is_finished, p.deadline_at, s.status AS session_status, s.mode AS session_mode, s.current_question_index
    FROM participants p
    JOIN sessions s ON s.id = p.session_id
    WHERE p.id = ?
  `).get(participant_id);

  if (!preCheck) throw new Error('A résztvevő nem található!');

  // Idempotens védelem: ha erre a kérdésre már mentve van válasz, azt hiba nélkül visszaadjuk (befejezett dolgozatnál is!)
  const existingAnswer = db.prepare(`
    SELECT * FROM answers
    WHERE participant_id = ? AND question_id = ?
  `).get(participant_id, question_id);

  if (existingAnswer) {
    const qInfo = db.prepare('SELECT correct_answer, explanation FROM questions WHERE id = ?').get(question_id);
    return {
      alreadySubmitted: true,
      answer: existingAnswer,
      isFinished: preCheck.is_finished === 1,
      correctAnswer: qInfo ? qInfo.correct_answer : null,
      explanation: qInfo ? qInfo.explanation : null
    };
  }

  if (preCheck.session_status !== 'ACTIVE' || preCheck.is_finished === 1) {
    throw new Error('A dolgozat már befejeződött, új válasz nem küldhető be!');
  }

  // Űrhajós verseny közös rajt előtti válaszvédelem (Report 14 / 16. pont)
  if (preCheck.session_mode === 'SPACE_RACE' && (preCheck.current_question_index === 0 || preCheck.current_question_index === null)) {
    throw new Error('A verseny még nem indult el, válasz még nem küldhető be!');
  }

  if (preCheck.deadline_at) {
    const now = new Date();
    const deadline = new Date(preCheck.deadline_at);
    if (now >= deadline) {
      // Idő lejárt: tartósan befejezettre állítjuk a tanulót az adatbázisban
      db.prepare('UPDATE participants SET is_finished = 1, finished_at = CURRENT_TIMESTAMP WHERE id = ?').run(participant_id);
      throw new Error('Az egyéni időkorlát lejárt, a dolgozat automatikusan lezárásra került!');
    }
  }

  // BEGIN IMMEDIATE tranzakció konkurens beküldések kezelésére
  const tx = db.transaction(() => {
    // 1. Résztvevő és Session ellenőrzése
    const participant = db.prepare(`
      SELECT 
        p.id, p.session_id, p.is_finished, p.deadline_at,
        s.status AS session_status, s.quiz_id
      FROM participants p
      JOIN sessions s ON s.id = p.session_id
      WHERE p.id = ?
    `).get(participant_id);

    if (!participant) throw new Error('A résztvevő nem található!');

    // 2. Idempotens védelem: ha már mentve van ez a válasz, hiba nélkül visszaadjuk a meglévőt!
    const existingAnswer = db.prepare(`
      SELECT * FROM answers
      WHERE participant_id = ? AND question_id = ?
    `).get(participant_id, question_id);

    if (existingAnswer) {
      const qInfo = db.prepare('SELECT correct_answer, explanation FROM questions WHERE id = ?').get(question_id);
      result = {
        alreadySubmitted: true,
        answer: existingAnswer,
        isFinished: participant.is_finished === 1,
        correctAnswer: qInfo ? qInfo.correct_answer : null,
        explanation: qInfo ? qInfo.explanation : null
      };
      return;
    }

    // 3. Dolgozat és határidő vizsgálat
    if (participant.session_status !== 'ACTIVE' || participant.is_finished === 1) {
      throw new Error('A dolgozat már befejeződött, új válasz nem küldhető be!');
    }

    // 4. Kérdés adatainak lekérése
    const question = db.prepare(`
      SELECT id, quiz_id, question_type, options_json, correct_answer, explanation, points
      FROM questions
      WHERE id = ? AND quiz_id = ?
    `).get(question_id, participant.quiz_id);

    if (!question) {
      throw new Error('A kérdés nem található a dolgozat tesztjében!');
    }

    let parsedOptions = [];
    try {
      parsedOptions = JSON.parse(question.options_json || '[]');
    } catch {
      parsedOptions = [];
    }

    // 5. Gépi kiértékelés (grader)
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

    // 7. Ellenőrizzük, hogy válaszolt-e az összes kérdésre
    const totalQuestions = db.prepare('SELECT COUNT(*) as cnt FROM questions WHERE quiz_id = ? AND question_order < 100000').get(participant.quiz_id).cnt;
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
    SELECT a.*, q.points AS max_points, s.status AS session_status
    FROM answers a
    JOIN questions q ON q.id = a.question_id
    JOIN sessions s ON s.id = a.session_id
    WHERE a.id = ?
  `).get(answer_id);

  if (!answer) throw new Error('A válasz nem található!');

  if (answer.session_status === 'FINISHED') {
    throw new Error('Lezárt dolgozatban a válaszok és pontszámok utólag nem módosíthatók!');
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
    if (numPoints > Number(answer.max_points)) {
      throw new Error(`A megadott pontszám (${numPoints} pont) meghaladja a kérdés maximális pontértékét (${answer.max_points} pont)!`);
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
      newPoints = Number(answer.max_points) || 1.0;
      isCorrect = 1;
    } else if (eval_status === 'PARTIAL') {
      newPoints = (Number(answer.max_points) || 1.0) / 2.0;
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

  // Teszt kérdései
  const rawQuestions = db.prepare(`
    SELECT id, question_order, question_type, question_text, options_json, correct_answer, explanation, points, image_path
    FROM questions
    WHERE quiz_id = ?
    ORDER BY question_order ASC
  `).all(session.quiz_id);

  const questions = rawQuestions.map(q => {
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

  const now = new Date();
  const tx = db.transaction(() => {
    db.prepare('UPDATE sessions SET current_question_index = 1 WHERE id = ?').run(sessionId);

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
  return { ...session, current_question_index: 1 };
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
  getLiveMatrixData
};

