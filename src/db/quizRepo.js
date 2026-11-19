const fs = require('fs');
const path = require('path');
const config = require('../../config');
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
 * Tartalmazza a kérdések számát, a mappát és a pontszámot
 */
function getQuizzes(subjectId = null, gradeLevel = null, folderId = undefined) {
  let query = `
    SELECT 
      q.id,
      q.subject_id,
      q.folder_id,
      f.name AS folder_name,
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
    LEFT JOIN quiz_folders f ON f.id = q.folder_id
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

  if (folderId !== undefined) {
    if (folderId === null || folderId === 'root') {
      query += ' AND q.folder_id IS NULL';
    } else {
      query += ' AND q.folder_id = ?';
      params.push(Number(folderId));
    }
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
      q.folder_id,
      f.name AS folder_name,
      s.name AS subject_name,
      q.title,
      q.subject_grade,
      q.default_time_limit_min,
      q.locked_at,
      q.created_at,
      q.updated_at
    FROM quizzes q
    JOIN subjects s ON s.id = q.subject_id
    LEFT JOIN quiz_folders f ON f.id = q.folder_id
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
      instructions,
      image_path,
      options_json,
      correct_answer,
      explanation,
      points
    FROM questions
    WHERE quiz_id = ? AND question_order < 100000
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
        instructions: q.instructions || '',
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
 * ============================================================================
 * KÉPKEZELŐ ÉS KVÍZ ALMAPPA SEGÉDFÜGGVÉNYEK
 * ============================================================================
 */

/**
 * Temp vagy korábbi mappában lévő képek áthelyezése a kvíz végleges almappájába
 */
function finalizeQuizTempImages(quizId) {
  try {
    const qRows = db.prepare('SELECT id, image_path FROM questions WHERE quiz_id = ? AND image_path IS NOT NULL').all(quizId);
    if (!qRows || qRows.length === 0) return;

    const targetDir = path.join(config.uploadsDir, 'quizzes', `quiz-${quizId}`);
    fs.mkdirSync(targetDir, { recursive: true });

    const updateStmt = db.prepare('UPDATE questions SET image_path = ? WHERE id = ?');
    for (const row of qRows) {
      if (!row.image_path) continue;
      const expectedPrefix = `/uploads/quizzes/quiz-${quizId}/`;
      if (row.image_path.startsWith(expectedPrefix)) continue;

      const filename = path.basename(row.image_path);
      const tempPath = path.join(config.uploadsDir, 'quizzes', 'temp', filename);
      const rootPath = path.join(config.uploadsDir, filename);
      const newFilePath = path.join(targetDir, filename);

      let found = false;
      if (fs.existsSync(tempPath)) {
        fs.renameSync(tempPath, newFilePath);
        found = true;
      } else if (fs.existsSync(rootPath)) {
        fs.renameSync(rootPath, newFilePath);
        found = true;
      }

      if (found || fs.existsSync(newFilePath)) {
        const newRelativePath = `/uploads/quizzes/quiz-${quizId}/${filename}`;
        updateStmt.run(newRelativePath, row.id);
      }
    }

    // Árva (lecserélt vagy törölt) képek automatikus kitakarítása
    cleanQuizOrphanImages(quizId);
  } catch (err) {
    console.error(`Hiba a kvíz (#${quizId}) ideiglenes képeinek véglegesítésekor:`, err);
  }
}

/**
 * A kvíz almappájában lévő árva (már nem használt / lecserélt / törölt) képek automatikus kitakarítása
 */
function cleanQuizOrphanImages(quizId) {
  try {
    const targetDir = path.join(config.uploadsDir, 'quizzes', `quiz-${quizId}`);
    if (!fs.existsSync(targetDir)) return;

    // Lekérdezzük a kvízhez jelenleg tartozó összes érvényes képfájl nevét
    const activeQuestions = db.prepare('SELECT image_path FROM questions WHERE quiz_id = ? AND image_path IS NOT NULL').all(quizId);
    const activeFilenames = new Set(
      activeQuestions
        .map(q => q.image_path ? path.basename(q.image_path) : null)
        .filter(Boolean)
    );

    // Végigmegyünk a mappában lévő összes fizikai fájlon
    const files = fs.readdirSync(targetDir);
    for (const file of files) {
      if (!activeFilenames.has(file)) {
        // Árva fájl: egyetlen kérdés sem hivatkozik rá, biztonságosan letöröljük
        try {
          fs.unlinkSync(path.join(targetDir, file));
        } catch (unlinkErr) {
          console.error(`Nem sikerült törölni az árva képet (${file}):`, unlinkErr);
        }
      }
    }
  } catch (err) {
    console.error(`Hiba a kvíz (#${quizId}) árva képeinek takarításakor:`, err);
  }
}

/**
 * Kvízhez tartozó képek átmásolása duplikáláskor az új kvíz almappájába
 */
function copyQuizImages(originalQuizId, newQuizId) {
  try {
    const origDir = path.join(config.uploadsDir, 'quizzes', `quiz-${originalQuizId}`);
    if (!fs.existsSync(origDir)) return;

    const newDir = path.join(config.uploadsDir, 'quizzes', `quiz-${newQuizId}`);
    fs.mkdirSync(newDir, { recursive: true });

    const entries = fs.readdirSync(origDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        fs.copyFileSync(path.join(origDir, entry.name), path.join(newDir, entry.name));
      }
    }

    db.prepare(`
      UPDATE questions 
      SET image_path = REPLACE(image_path, '/uploads/quizzes/quiz-' || ?, '/uploads/quizzes/quiz-' || ?)
      WHERE quiz_id = ?
    `).run(String(originalQuizId), String(newQuizId), newQuizId);
  } catch (err) {
    console.error(`Hiba a kvíz (#${originalQuizId} -> #${newQuizId}) képeinek másolásakor:`, err);
  }
}

/**
 * Kvízhez tartozó képek almappájának törlése
 */
function removeQuizImages(quizId) {
  try {
    const dir = path.join(config.uploadsDir, 'quizzes', `quiz-${quizId}`);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`Hiba a kvíz (#${quizId}) képeinek törlésekor:`, err);
  }
}

/**
 * Új teszt és kérdéseinek mentése tranzakcióban
 */
function createQuiz({ subject_id = 1, folder_id = null, title, subject_grade = '', default_time_limit_min = 0, questions = [] }) {
  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) throw new Error('A teszt címe kötelező!');

  let newQuizId = null;

  const tx = db.transaction(() => {
    const insertQuiz = db.prepare(`
      INSERT INTO quizzes (subject_id, folder_id, title, subject_grade, default_time_limit_min)
      VALUES (?, ?, ?, ?, ?)
    `);
    const quizResult = insertQuiz.run(
      Number(subject_id) || 1,
      folder_id ? Number(folder_id) : null,
      trimmedTitle,
      String(subject_grade || '').trim(),
      Number(default_time_limit_min) || 0
    );

    newQuizId = quizResult.lastInsertRowid;

    if (Array.isArray(questions) && questions.length > 0) {
      const insertQuestion = db.prepare(`
        INSERT INTO questions (
          quiz_id, question_order, question_type, question_text, instructions,
          image_path, options_json, correct_answer, explanation, points
        ) VALUES (
          ?, ?, ?, ?, ?,
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
          String(q.instructions || '').trim(),
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
  finalizeQuizTempImages(newQuizId);
  return getQuizById(newQuizId, false);
}

/**
 * Meglévő teszt szerkesztése (Szabadon szerkeszthető tanári sablon)
 */
function updateQuiz(quizId, { subject_id, folder_id = null, title, subject_grade, default_time_limit_min, questions }) {
  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) throw new Error('A teszt címe kötelező!');

  const tx = db.transaction(() => {
    const updateQuizStmt = db.prepare(`
      UPDATE quizzes 
      SET subject_id = ?, folder_id = ?, title = ?, subject_grade = ?, default_time_limit_min = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateQuizStmt.run(
      Number(subject_id) || 1,
      folder_id ? Number(folder_id) : null,
      trimmedTitle,
      String(subject_grade || '').trim(),
      Number(default_time_limit_min) || 0,
      quizId
    );

    // Kérdések relációbiztos in-place frissítése (Smart Sync / Upsert)
    // Meglévő kérdések lekérése az esetleges diákválaszok védelmére
    const existingDbQuestions = db.prepare('SELECT id, question_order FROM questions WHERE quiz_id = ?').all(quizId);
    const existingMap = new Map();
    for (const eq of existingDbQuestions) {
      existingMap.set(eq.id, eq);
    }

    // UNIQUE(quiz_id, question_order) ütközések megelőzése: ideiglenes eltolás magas tartományba (CHECK > 0 érvényes)
    db.prepare('UPDATE questions SET question_order = 100000 + id WHERE quiz_id = ?').run(quizId);

    const updateQuestionStmt = db.prepare(`
      UPDATE questions SET
        question_order = ?,
        question_type = ?,
        question_text = ?,
        instructions = ?,
        image_path = ?,
        options_json = ?,
        correct_answer = ?,
        explanation = ?,
        points = ?
      WHERE id = ? AND quiz_id = ?
    `);

    const insertQuestionStmt = db.prepare(`
      INSERT INTO questions (
        quiz_id, question_order, question_type, question_text, instructions,
        image_path, options_json, correct_answer, explanation, points
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `);

    if (Array.isArray(questions) && questions.length > 0) {
      questions.forEach((q, idx) => {
        const order = idx + 1;
        const optionsJson = Array.isArray(q.options) ? JSON.stringify(q.options) : (q.options_json || '[]');
        const qType = q.question_type || 'ABCD';
        const qText = q.question_text || '';
        const qInstr = String(q.instructions || '').trim();
        const qImage = q.image_path || null;
        const qCorrect = String(q.correct_answer || '').trim();
        const qExpl = String(q.explanation || '').trim();
        const qPoints = Number(q.points) || 1.0;

        let targetId = null;
        if (q.id && existingMap.has(Number(q.id))) {
          targetId = Number(q.id);
        } else if (!q.id && existingDbQuestions[idx] && existingMap.has(existingDbQuestions[idx].id)) {
          // Ha nem küldött explicit id-t a kliens, index szerint párosítjuk a meglévővel
          targetId = existingDbQuestions[idx].id;
        }

        if (targetId) {
          updateQuestionStmt.run(
            order,
            qType,
            qText,
            qInstr,
            qImage,
            optionsJson,
            qCorrect,
            qExpl,
            qPoints,
            targetId,
            quizId
          );
          existingMap.delete(targetId);
        } else {
          insertQuestionStmt.run(
            quizId,
            order,
            qType,
            qText,
            qInstr,
            qImage,
            optionsJson,
            qCorrect,
            qExpl,
            qPoints
          );
        }
      });
    }

    // A szerkesztőben eltávolított korábbi kérdések kezelése
    const checkAnswersStmt = db.prepare('SELECT 1 FROM answers WHERE question_id = ? LIMIT 1');
    const deleteQuestionStmt = db.prepare('DELETE FROM questions WHERE id = ?');
    const archiveQuestionStmt = db.prepare('UPDATE questions SET question_order = 100000 + id WHERE id = ?');

    for (const [remId] of existingMap) {
      const hasAnswers = checkAnswersStmt.get(remId);
      if (!hasAnswers) {
        deleteQuestionStmt.run(remId);
      } else {
        // Ha van rá válasz korábbi lezárt dolgozatból, megőrizzük a rekordot, de kint tartjuk a sorrendből
        archiveQuestionStmt.run(remId);
      }
    }
  });

  tx();
  finalizeQuizTempImages(quizId);
  return getQuizById(quizId, false);
}

/**
 * Zárolt vagy meglévő teszt duplikálása (Másolat készítése új, szerkeszthető tesztként)
 */
function duplicateQuiz(quizId, customTitle = null) {
  const original = getQuizById(quizId, false);
  if (!original) throw new Error('A másolandó teszt nem található!');

  const newTitle = customTitle || `${original.title} (másolat)`;

  const newQuiz = createQuiz({
    subject_id: original.subject_id,
    folder_id: original.folder_id,
    title: newTitle,
    subject_grade: original.subject_grade,
    default_time_limit_min: original.default_time_limit_min,
    questions: original.questions.map(q => ({
      question_order: q.question_order,
      question_type: q.question_type,
      question_text: q.question_text,
      instructions: q.instructions || '',
      image_path: q.image_path,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      points: q.points
    }))
  });

  copyQuizImages(original.id, newQuiz.id);
  return getQuizById(newQuiz.id, false);
}

/**
 * Teszt törlése (kérdésekkel és esetleges kapcsolódó munkamenetekkel együtt)
 */
function deleteQuiz(quizId) {
  const tx = db.transaction(() => {
    const sessions = db.prepare('SELECT id FROM sessions WHERE quiz_id = ?').all(quizId);
    for (const s of sessions) {
      db.prepare('DELETE FROM answers WHERE session_id = ?').run(s.id);
      db.prepare('DELETE FROM participants WHERE session_id = ?').run(s.id);
    }
    db.prepare('DELETE FROM sessions WHERE quiz_id = ?').run(quizId);
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(quizId);
    db.prepare('DELETE FROM quizzes WHERE id = ?').run(quizId);
  });

  tx();
  removeQuizImages(quizId);
  return true;
}

/**
 * ============================================================================
 * MAPPAKEZELŐ ADATBÁZIS MŰVELETEK (quiz_folders)
 * ============================================================================
 */

/**
 * Mappák listázása egy adott szülőmappában (vagy a gyökérben)
 * @param {number|null} parentId - NULL = legfelső gyökérszint
 */
function getFolders(parentId = null) {
  const query = `
    SELECT 
      f.id,
      f.parent_id,
      f.name,
      f.created_at,
      (SELECT COUNT(*) FROM quiz_folders sub WHERE sub.parent_id = f.id) AS subfolder_count,
      (SELECT COUNT(*) FROM quizzes q WHERE q.folder_id = f.id) AS quiz_count
    FROM quiz_folders f
    WHERE ${parentId === null ? 'f.parent_id IS NULL' : 'f.parent_id = ?'}
    ORDER BY f.name COLLATE NOCASE ASC
  `;
  const stmt = db.prepare(query);
  return parentId === null ? stmt.all() : stmt.all(Number(parentId));
}

/**
 * Az összes mappa lekérése lapos listaként (legördülő menükhöz és útvonalépítéshez)
 */
function getAllFolders() {
  const stmt = db.prepare(`
    SELECT id, parent_id, name, created_at
    FROM quiz_folders
    ORDER BY name COLLATE NOCASE ASC
  `);
  return stmt.all();
}

/**
 * Egy mappa navigációs morzsamenü útvonala a gyökértől a megadott mappáig
 * @param {number|null} folderId 
 * @returns {Array<{id: number, name: string}>}
 */
function getFolderBreadcrumbs(folderId) {
  if (!folderId) return [];
  const crumbs = [];
  let currentId = Number(folderId);
  const stmt = db.prepare('SELECT id, parent_id, name FROM quiz_folders WHERE id = ?');
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = stmt.get(currentId);
    if (!folder) break;
    crumbs.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parent_id;
  }
  return crumbs;
}

/**
 * Új mappa létrehozása
 */
function createFolder({ name, parent_id = null }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('A mappa neve kötelező!');

  const validParentId = (parent_id !== null && parent_id !== undefined && parent_id !== '') ? Number(parent_id) : null;
  const stmt = db.prepare(`
    INSERT INTO quiz_folders (parent_id, name)
    VALUES (?, ?)
  `);
  const res = stmt.run(validParentId, trimmed);
  return { id: res.lastInsertRowid, parent_id: validParentId, name: trimmed };
}

/**
 * Mappa átnevezése
 */
function renameFolder(folderId, newName) {
  const trimmed = String(newName || '').trim();
  if (!trimmed) throw new Error('A mappa új neve kötelező!');

  const stmt = db.prepare('UPDATE quiz_folders SET name = ? WHERE id = ?');
  const res = stmt.run(trimmed, Number(folderId));
  if (res.changes === 0) throw new Error('A mappa nem található!');
  return { id: Number(folderId), name: trimmed };
}

/**
 * Mappa törlése (Tesztek felkerülnek a szülő mappába adatvesztés nélkül)
 */
function deleteFolder(folderId) {
  const fId = Number(folderId);
  const folder = db.prepare('SELECT id, parent_id FROM quiz_folders WHERE id = ?').get(fId);
  if (!folder) throw new Error('A mappa nem található!');

  const tx = db.transaction(() => {
    // 1. A mappában lévő tesztek a szülő mappába (vagy gyökérbe) kerülnek
    db.prepare('UPDATE quizzes SET folder_id = ? WHERE folder_id = ?').run(folder.parent_id, fId);
    // 2. A mappában lévő almappák a szülő mappába kerülnek
    db.prepare('UPDATE quiz_folders SET parent_id = ? WHERE parent_id = ?').run(folder.parent_id, fId);
    // 3. Mappa rekord törlése
    db.prepare('DELETE FROM quiz_folders WHERE id = ?').run(fId);
  });

  tx();
  return { success: true };
}

/**
 * Teszt áthelyezése másik mappába (vagy gyökérbe)
 * @param {number} quizId
 * @param {number|null} targetFolderId
 * @returns {object}
 */
function moveQuiz(quizId, targetFolderId) {
  const qId = Number(quizId);
  const fId = (targetFolderId === null || targetFolderId === undefined || targetFolderId === '' || targetFolderId === 'root') ? null : Number(targetFolderId);

  if (fId !== null) {
    const folderExists = db.prepare('SELECT id FROM quiz_folders WHERE id = ?').get(fId);
    if (!folderExists) {
      throw new Error('A megadott célmappa nem létezik!');
    }
  }

  const stmt = db.prepare('UPDATE quizzes SET folder_id = ? WHERE id = ?');
  stmt.run(fId, qId);
  return getQuizById(qId);
}

module.exports = {
  getSubjects,
  getQuizzes,
  getQuizById,
  isQuizLocked,
  createQuiz,
  updateQuiz,
  duplicateQuiz,
  deleteQuiz,
  moveQuiz,
  getFolders,
  getAllFolders,
  getFolderBreadcrumbs,
  createFolder,
  renameFolder,
  deleteFolder
};

