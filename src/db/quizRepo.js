const db = require('./init');

/**
 * quizRepo.js - Tesztek és kérdések adatbázis műveletei
 */

/**
 * Tantárgyak listázása
 */
function getSubjects() {
  const stmt = db.prepare('SELECT id, name, is_default FROM subjects ORDER BY id ASC');
  return stmt.all();
}

/**
 * Tesztek listázása opcionális szűréssel
 * Tartalmazza a kérdések számát és a zároltsági állapotot
 */
function getQuizzes(subjectId = null, gradeLevel = null) {
  let query = `
    SELECT 
      q.id,
      q.subject_id,
      s.name AS subject_name,
      q.title,
      q.subject_grade,
      q.default_time_limit_min,
      q.locked_at,
      q.created_at,
      q.updated_at,
      COUNT(qst.id) AS question_count,
      COALESCE(SUM(qst.points), 0.0) AS total_points
    FROM quizzes q
    JOIN subjects s ON s.id = q.subject_id
    LEFT JOIN questions qst ON qst.quiz_id = q.id
    WHERE 1=1
  `;
  const params = [];

  if (subjectId) {
    query += ' AND q.subject_id = ?';
    params.push(subjectId);
  }

  if (gradeLevel) {
    query += ' AND q.subject_grade = ?';
    params.push(gradeLevel);
  }

  query += ' GROUP BY q.id ORDER BY q.updated_at DESC, q.id DESC';

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

/**
 * Egyetlen teszt részletes adatainak lekérése a kérdéseivel együtt
 * @param {number} quizId - Teszt azonosítója
 * @param {boolean} isStudentView - Ha igaz, a correct_answer és explanation mezők SZIGORÚAN törlésre kerülnek!
 */
function getQuizById(quizId, isStudentView = false) {
  const quizStmt = db.prepare(`
    SELECT 
      q.id,
      q.subject_id,
      s.name AS subject_name,
      q.title,
      q.subject_grade,
      q.default_time_limit_min,
      q.locked_at,
      q.created_at,
      q.updated_at
    FROM quizzes q
    JOIN subjects s ON s.id = q.subject_id
    WHERE q.id = ?
  `);

  const quiz = quizStmt.get(quizId);
  if (!quiz) return null;

  const questionsStmt = db.prepare(`
    SELECT 
      id,
      quiz_id,
      question_order,
      question_type,
      question_text,
      image_path,
      options_json,
      correct_answer,
      explanation,
      points
    FROM questions
    WHERE quiz_id = ?
    ORDER BY question_order ASC
  `);

  const rawQuestions = questionsStmt.all(quizId);

  const questions = rawQuestions.map(q => {
    let parsedOptions = [];
    try {
      parsedOptions = JSON.parse(q.options_json || '[]');
    } catch {
      parsedOptions = [];
    }

    // ABCD típusú kérdésnél biztosítjuk, hogy mindig legyenek opciók (fallback)
    if (q.question_type === 'ABCD' && (!Array.isArray(parsedOptions) || parsedOptions.length === 0)) {
      parsedOptions = ['A', 'B', 'C', 'D'];
    }

    // Puskázásgátló védelem (AI_RULES 1.2): Diák felé semmi körülmények között nem mehet le a megoldás!
    if (isStudentView) {
      return {
        id: q.id,
        quiz_id: q.quiz_id,
        question_order: q.question_order,
        question_type: q.question_type,
        question_text: q.question_text,
        image_path: q.image_path,
        options: parsedOptions,
        points: q.points
      };
    }

    return {
      ...q,
      options: parsedOptions
    };
  });

  return {
    ...quiz,
    questions,
    total_points: questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0)
  };
}

/**
 * Teszt zároltságának ellenőrzése
 */
function isQuizLocked(quizId) {
  const stmt = db.prepare('SELECT locked_at FROM quizzes WHERE id = ?');
  const row = stmt.get(quizId);
  return !!(row && row.locked_at !== null);
}

/**
 * Új teszt és kérdéseinek mentése tranzakcióban
 */
function createQuiz({ subject_id = 1, title, subject_grade = '', default_time_limit_min = 0, questions = [] }) {
  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) throw new Error('A teszt címe kötelező!');

  let newQuizId = null;

  const tx = db.transaction(() => {
    const insertQuiz = db.prepare(`
      INSERT INTO quizzes (subject_id, title, subject_grade, default_time_limit_min)
      VALUES (?, ?, ?, ?)
    `);
    const quizResult = insertQuiz.run(
      Number(subject_id) || 1,
      trimmedTitle,
      String(subject_grade || '').trim(),
      Number(default_time_limit_min) || 0
    );

    newQuizId = quizResult.lastInsertRowid;

    if (Array.isArray(questions) && questions.length > 0) {
      const insertQuestion = db.prepare(`
        INSERT INTO questions (
          quiz_id, question_order, question_type, question_text, 
          image_path, options_json, correct_answer, explanation, points
        ) VALUES (
          ?, ?, ?, ?, 
          ?, ?, ?, ?, ?
        )
      `);

      questions.forEach((q, idx) => {
        const order = Number(q.question_order) || (idx + 1);
        const optionsJson = Array.isArray(q.options) ? JSON.stringify(q.options) : (q.options_json || '[]');
        insertQuestion.run(
          newQuizId,
          order,
          q.question_type || 'ABCD',
          q.question_text || '',
          q.image_path || null,
          optionsJson,
          String(q.correct_answer || '').trim(),
          String(q.explanation || '').trim(),
          Number(q.points) || 1.0
        );
      });
    }
  });

  tx();
  return getQuizById(newQuizId, false);
}

/**
 * Meglévő teszt szerkesztése (Kizárólag nem zárolt tesztnél!)
 */
function updateQuiz(quizId, { subject_id, title, subject_grade, default_time_limit_min, questions }) {
  if (isQuizLocked(quizId)) {
    throw new Error('Zárolt teszt közvetlenül nem módosítható! Használja a duplikálást/másolást.');
  }

  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) throw new Error('A teszt címe kötelező!');

  const tx = db.transaction(() => {
    const updateQuizStmt = db.prepare(`
      UPDATE quizzes 
      SET subject_id = ?, title = ?, subject_grade = ?, default_time_limit_min = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateQuizStmt.run(
      Number(subject_id) || 1,
      trimmedTitle,
      String(subject_grade || '').trim(),
      Number(default_time_limit_min) || 0,
      quizId
    );

    // Kérdések frissítése: a nem zárolt kérdések újraépítése
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(quizId);

    if (Array.isArray(questions) && questions.length > 0) {
      const insertQuestion = db.prepare(`
        INSERT INTO questions (
          quiz_id, question_order, question_type, question_text, 
          image_path, options_json, correct_answer, explanation, points
        ) VALUES (
          ?, ?, ?, ?, 
          ?, ?, ?, ?, ?
        )
      `);

      questions.forEach((q, idx) => {
        const order = Number(q.question_order) || (idx + 1);
        const optionsJson = Array.isArray(q.options) ? JSON.stringify(q.options) : (q.options_json || '[]');
        insertQuestion.run(
          quizId,
          order,
          q.question_type || 'ABCD',
          q.question_text || '',
          q.image_path || null,
          optionsJson,
          String(q.correct_answer || '').trim(),
          String(q.explanation || '').trim(),
          Number(q.points) || 1.0
        );
      });
    }
  });

  tx();
  return getQuizById(quizId, false);
}

/**
 * Zárolt vagy meglévő teszt duplikálása (Másolat készítése új, szerkeszthető tesztként)
 */
function duplicateQuiz(quizId, customTitle = null) {
  const original = getQuizById(quizId, false);
  if (!original) throw new Error('A másolandó teszt nem található!');

  const newTitle = customTitle || `${original.title} (másolat)`;

  return createQuiz({
    subject_id: original.subject_id,
    title: newTitle,
    subject_grade: original.subject_grade,
    default_time_limit_min: original.default_time_limit_min,
    questions: original.questions.map(q => ({
      question_order: q.question_order,
      question_type: q.question_type,
      question_text: q.question_text,
      image_path: q.image_path,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      points: q.points
    }))
  });
}

/**
 * Teszt törlése
 */
function deleteQuiz(quizId) {
  if (isQuizLocked(quizId)) {
    throw new Error('Zárolt teszt nem törölhető az adatbázisból!');
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(quizId);
    db.prepare('DELETE FROM quizzes WHERE id = ?').run(quizId);
  });

  tx();
  return true;
}

module.exports = {
  getSubjects,
  getQuizzes,
  getQuizById,
  isQuizLocked,
  createQuiz,
  updateQuiz,
  duplicateQuiz,
  deleteQuiz
};

