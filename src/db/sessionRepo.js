const crypto = require('crypto');
const db = require('./init');
const grader = require('../services/grader');

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
      s.class_name,
      s.quiz_id,
      q.title AS quiz_title,
      s.mode,
      s.status,
      s.time_limit_min,
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
  return stmt.all();
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
  shuffle_questions = 0,
  shuffle_options = 0,
  show_feedback_on_end = 1,
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

  const thresholdsJson = grade_thresholds ? JSON.stringify(grade_thresholds) : '{"2":30,"3":55,"4":75,"5":90}';

  let sessionId = null;
  const tx = db.transaction(() => {
    const insertStmt = db.prepare(`
      INSERT INTO sessions (
        subject_id, grade_level, quiz_id, class_name, mode, status,
        time_limit_min, shuffle_questions, shuffle_options, show_feedback_on_end,
        grade_thresholds_json, started_at, ended_at
      ) VALUES (
        ?, ?, ?, ?, ?, 'ACTIVE',
        ?, ?, ?, ?,
        ?, CURRENT_TIMESTAMP, NULL
      )
    `);

    const result = insertStmt.run(
      Number(subject_id) || 1,
      trimmedGrade,
      Number(quiz_id),
      String(class_name || '').trim(),
      mode,
      Number(time_limit_min) || 0,
      shuffle_questions ? 1 : 0,
      shuffle_options ? 1 : 0,
      show_feedback_on_end ? 1 : 0,
      thresholdsJson
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

    // 2. Session státusz végleges lezárása (FINISHED)
    const updateSessionStmt = db.prepare(`
      UPDATE sessions 
      SET status = 'FINISHED', ended_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'ACTIVE'
    `);
    const sessionRes = updateSessionStmt.run(sessionId);
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
    WHERE quiz_id = ? 
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
    const deadlineMs = Date.now() + (session.time_limit_min * 60 * 1000);
    deadlineAt = new Date(deadlineMs).toISOString();
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
    SELECT p.id, p.session_id, p.student_name, p.is_finished, s.status AS session_status 
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
      result = {
        alreadySubmitted: true,
        answer: existingAnswer
      };
      return;
    }

    // 3. Dolgozat és határidő vizsgálat
    if (participant.session_status !== 'ACTIVE' || participant.is_finished === 1) {
      throw new Error('A dolgozat már befejeződött, új válasz nem küldhető be!');
    }

    if (participant.deadline_at) {
      const now = new Date();
      const deadline = new Date(participant.deadline_at);
      if (now > deadline) {
        // Idő lejárt: automatikusan befejezettre állítjuk a tanulót
        db.prepare('UPDATE participants SET is_finished = 1, finished_at = CURRENT_TIMESTAMP WHERE id = ?').run(participant_id);
        throw new Error('Az egyéni időkorlát lejárt, a dolgozat automatikusan lezárásra került!');
      }
    }

    // 4. Kérdés adatainak lekérése
    const question = db.prepare(`
      SELECT id, quiz_id, question_type, correct_answer, explanation, points
      FROM questions
      WHERE id = ? AND quiz_id = ?
    `).get(question_id, participant.quiz_id);

    if (!question) {
      throw new Error('A kérdés nem található a dolgozat tesztjében!');
    }

    // 5. Gépi kiértékelés (grader)
    const evaluation = grader.evaluateAnswer(
      question.question_type,
      submitted_answer,
      question.correct_answer,
      question.points
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
    const totalQuestions = db.prepare('SELECT COUNT(*) as cnt FROM questions WHERE quiz_id = ?').get(participant.quiz_id).cnt;
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
  const questions = db.prepare(`
    SELECT id, question_order, question_type, question_text, options_json, correct_answer, explanation, points
    FROM questions
    WHERE quiz_id = ?
    ORDER BY question_order ASC
  `).all(session.quiz_id);

  const totalMaxPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);

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

module.exports = {
  getActiveSessions,
  getAllSessions,
  getActiveSessionByChannel,
  getSessionById,
  startSession,
  finishSession,
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

