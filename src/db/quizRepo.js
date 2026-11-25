const fs = require('fs');
const path = require('path');
const config = require('../../config');
const db = require('./init');
const grader = require('../services/grader');

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
    WHERE COALESCE(q.is_deleted, 0) = 0
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
 * @param {boolean} includeDeleted - Ha igaz, a logikailag törölt tesztet is visszaadja (lezárt dolgozatok történeti megjelenítéséhez)
 */
function getQuizById(quizId, isStudentView = false, includeDeleted = false) {
  const whereDeleted = includeDeleted ? '' : 'AND COALESCE(q.is_deleted, 0) = 0';
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
    WHERE q.id = ? ${whereDeleted}
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
        allow_multiple: grader.isMultipleChoiceCorrectAnswer(q.question_type, q.correct_answer),
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

    // Megőrizzük a korábbi dolgozatok (sessions) pillanatképeiben szereplő képeket is (Report 15 / 2. fejezet)
    try {
      const sessionRows = db.prepare('SELECT quiz_snapshot_json FROM sessions WHERE quiz_id = ? AND quiz_snapshot_json IS NOT NULL').all(quizId);
      for (const sRow of sessionRows) {
        if (!sRow.quiz_snapshot_json) continue;
        try {
          const snapshot = JSON.parse(sRow.quiz_snapshot_json);
          const snapQuestions = Array.isArray(snapshot) ? snapshot : (snapshot.questions || []);
          if (Array.isArray(snapQuestions)) {
            for (const sq of snapQuestions) {
              if (sq && sq.image_path) {
                activeFilenames.add(path.basename(sq.image_path));
              }
            }
          }
        } catch {}
      }
    } catch {}

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
 * 24 óránál régebbi, elvetett ideiglenes képfeltöltések automatikus takarítása (Report 14 / 39. pont)
 */
function cleanExpiredTempImages(maxAgeHours = 24) {
  try {
    const tempDir = path.join(config.uploadsDir, 'quizzes', 'temp');
    if (!fs.existsSync(tempDir)) return;

    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      const fullPath = path.join(tempDir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && (now - stat.mtimeMs >= maxAgeMs)) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // Egyedi fájlhiba figyelmen kívül hagyása
      }
    }
  } catch (err) {
    console.error('Hiba az elavult ideiglenes képek takarításakor:', err);
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
      INSERT INTO quizzes (
        subject_id, folder_id, title, subject_grade, default_time_limit_min,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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

    // A szerkesztőben eltávolított korábbi kérdések kezelése (Report 17 / 1.2 fejezet)
    const checkAnswersStmt = db.prepare('SELECT 1 FROM answers WHERE question_id = ? LIMIT 1');
    const checkSessionStmt = db.prepare('SELECT 1 FROM sessions WHERE quiz_id = ? LIMIT 1');
    const hasAnySessions = !!checkSessionStmt.get(quizId);
    const deleteQuestionStmt = db.prepare('DELETE FROM questions WHERE id = ?');
    const archiveQuestionStmt = db.prepare('UPDATE questions SET question_order = 100000 + id WHERE id = ?');

    for (const [remId] of existingMap) {
      const hasAnswers = checkAnswersStmt.get(remId);
      if (!hasAnswers && !hasAnySessions) {
        // Csak akkor törölhető fizikailag a kérdés, ha még soha semmilyen dolgozat nem indult ebből a kvízből!
        deleteQuestionStmt.run(remId);
      } else {
        // Ha van rá válasz, vagy már indult belőle dolgozat (így a pillanatképek vagy futó alkalmak hivatkozhatnak rá),
        // archiváljuk (question_order >= 100000): a szerkesztőből eltűnik, de az SQL idegen kulcsok épek maradnak!
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
 * Több forráskvízhez tartozó képek átmásolása az új kvíz almappájába (névütközés-mentesen)
 */
function copyMergedQuizImages(sourceQuizIds, newQuizId) {
  try {
    const newDir = path.join(config.uploadsDir, 'quizzes', `quiz-${newQuizId}`);
    fs.mkdirSync(newDir, { recursive: true });

    for (const srcId of sourceQuizIds) {
      const origDir = path.join(config.uploadsDir, 'quizzes', `quiz-${srcId}`);
      if (fs.existsSync(origDir)) {
        const entries = fs.readdirSync(origDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const destName = `src_${srcId}_${entry.name}`;
            fs.copyFileSync(path.join(origDir, entry.name), path.join(newDir, destName));

            // Frissítjük az új kvíz kérdéseiben a hivatkozást
            db.prepare(`
              UPDATE questions 
              SET image_path = REPLACE(image_path, '/uploads/quizzes/quiz-' || ? || '/' || ?, '/uploads/quizzes/quiz-' || ? || '/' || ?)
              WHERE quiz_id = ?
            `).run(String(srcId), entry.name, String(newQuizId), destName, newQuizId);
          }
        }
      }
    }
  } catch (err) {
    console.error(`Hiba a kvízek (${sourceQuizIds.join(', ')} -> #${newQuizId}) képeinek másolásakor:`, err);
  }
}

/**
 * Két meglévő teszt kérdéseinek egyesítése egyetlen új tesztté (Merge)
 * @param {number} quizId1 - Első teszt (alap)
 * @param {number} quizId2 - Második teszt (hozzáfűzendő)
 * @param {object} options - Új teszt metaadatai (title, subject_id, subject_grade, folder_id, default_time_limit_min)
 */
function mergeQuizzes(quizId1, quizId2, options = {}) {
  const q1 = getQuizById(Number(quizId1), false);
  const q2 = getQuizById(Number(quizId2), false);

  if (!q1) throw new Error('Az első kiválasztott teszt nem található!');
  if (!q2) throw new Error('A második kiválasztott teszt nem található!');
  if (Number(quizId1) === Number(quizId2)) {
    throw new Error('Egy tesztet nem lehet önmagával egyesíteni!');
  }

  const title = String(options.title || `${q1.title} + ${q2.title}`).trim();
  if (!title) throw new Error('Az egyesített teszt címe kötelező!');

  const subject_id = options.subject_id !== undefined ? Number(options.subject_id) : q1.subject_id;
  const folder_id = options.folder_id !== undefined ? (options.folder_id ? Number(options.folder_id) : null) : q1.folder_id;
  const subject_grade = options.subject_grade !== undefined ? String(options.subject_grade).trim() : (q1.subject_grade || q2.subject_grade || '');
  const default_time_limit_min = options.default_time_limit_min !== undefined
    ? Number(options.default_time_limit_min)
    : Math.max(Number(q1.default_time_limit_min) || 0, Number(q2.default_time_limit_min) || 0);

  const combinedQuestions = [];
  let currentOrder = 1;

  for (const q of (q1.questions || [])) {
    combinedQuestions.push({
      question_order: currentOrder++,
      question_type: q.question_type,
      question_text: q.question_text,
      instructions: q.instructions || '',
      image_path: q.image_path,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      points: q.points
    });
  }

  for (const q of (q2.questions || [])) {
    combinedQuestions.push({
      question_order: currentOrder++,
      question_type: q.question_type,
      question_text: q.question_text,
      instructions: q.instructions || '',
      image_path: q.image_path,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      points: q.points
    });
  }

  const newQuiz = createQuiz({
    subject_id,
    folder_id,
    title,
    subject_grade,
    default_time_limit_min,
    questions: combinedQuestions
  });

  copyMergedQuizImages([q1.id, q2.id], newQuiz.id);
  return getQuizById(newQuiz.id, false);
}

/**
 * Teszt törlése (kérdésekkel, a lezárt dolgozatok előzményeinek megőrzésével - Report 16 / 2. fejezet)
 */
function deleteQuiz(quizId) {
  const activeCount = db.prepare("SELECT COUNT(*) AS cnt FROM sessions WHERE quiz_id = ? AND status = 'ACTIVE'").get(quizId).cnt;
  if (activeCount > 0) {
    throw new Error('A teszt nem törölhető, mert jelenleg aktív dolgozat fut belőle! Előbb zárd le a dolgozatot.');
  }

  const finishedCount = db.prepare("SELECT COUNT(*) AS cnt FROM sessions WHERE quiz_id = ? AND status = 'FINISHED'").get(quizId).cnt;

  if (finishedCount > 0) {
    // Ha van lezárt dolgozat az archívumban, a korábbi eredmények védelmében soft-delete-tel jelöljük töröltnek a sablont!
    // A kérdéseket nem töröljük, hogy az answers tábla idegen kulcsai (FK RESTRICT) sérülésmentesen megmaradjanak
    const tx = db.transaction(() => {
      db.prepare('UPDATE quizzes SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(quizId);
    });
    tx();
    cleanQuizOrphanImages(quizId);
    return true;
  }

  // Ha nincs egyetlen korábbi dolgozat sem, a teszt véglegesen törölhető
  const tx = db.transaction(() => {
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

/**
 * Egyetlen kérdés célzott mentése (frissítése vagy beszúrása) egy meglévő feladatsorban
 * A teszt többi, esetleg még félkész/importált kérdését érintetlenül hagyja.
 */
function saveSingleQuestion(quizId, questionData = {}) {
  const qzId = Number(quizId);
  const quiz = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(qzId);
  if (!quiz) throw new Error('A megadott feladatsor nem található!');

  const existingQuestionId = questionData.id ? Number(questionData.id) : null;
  const qType = questionData.question_type || 'ABCD';
  const qText = String(questionData.question_text || '').trim();
  if (!qText) throw new Error('A kérdés szövegének megadása kötelező!');

  const instructions = String(questionData.instructions || '').trim();
  const imagePath = questionData.image_path ? String(questionData.image_path).trim() : null;
  const optionsJson = Array.isArray(questionData.options)
    ? JSON.stringify(questionData.options)
    : (questionData.options_json || '[]');
  const correctAnswer = String(questionData.correct_answer || '').trim();
  const explanation = String(questionData.explanation || '').trim();
  const points = Number(questionData.points) || 1.0;

  let savedId = existingQuestionId;

  const tx = db.transaction(() => {
    if (existingQuestionId) {
      const existing = db.prepare('SELECT id FROM questions WHERE id = ? AND quiz_id = ?').get(existingQuestionId, qzId);
      if (existing) {
        db.prepare(`
          UPDATE questions
          SET question_type = ?, question_text = ?, instructions = ?,
              image_path = ?, options_json = ?, correct_answer = ?,
              explanation = ?, points = ?
          WHERE id = ? AND quiz_id = ?
        `).run(qType, qText, instructions, imagePath, optionsJson, correctAnswer, explanation, points, existingQuestionId, qzId);
      } else {
        savedId = null;
      }
    }

    if (!savedId) {
      const maxRow = db.prepare('SELECT COALESCE(MAX(question_order), 0) AS max_ord FROM questions WHERE quiz_id = ? AND question_order < 100000').get(qzId);
      const nextOrder = (maxRow ? Number(maxRow.max_ord) : 0) + 1;
      const ins = db.prepare(`
        INSERT INTO questions (
          quiz_id, question_order, question_type, question_text, instructions,
          image_path, options_json, correct_answer, explanation, points
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(qzId, nextOrder, qType, qText, instructions, imagePath, optionsJson, correctAnswer, explanation, points);
      savedId = ins.lastInsertRowid;
    }

    db.prepare('UPDATE quizzes SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(qzId);
  });

  tx();
  finalizeQuizTempImages(qzId);

  const savedRow = db.prepare(`
    SELECT id, quiz_id, question_order, question_type, question_text, instructions,
           image_path, options_json, correct_answer, explanation, points
    FROM questions
    WHERE id = ?
  `).get(savedId);

  return savedRow ? {
    ...savedRow,
    options: (() => { try { return JSON.parse(savedRow.options_json || '[]'); } catch { return []; } })()
  } : null;
}

module.exports = {
  getSubjects,
  getQuizzes,
  getQuizById,
  isQuizLocked,
  createQuiz,
  updateQuiz,
  saveSingleQuestion,
  duplicateQuiz,
  mergeQuizzes,
  deleteQuiz,
  moveQuiz,
  getFolders,
  getAllFolders,
  getFolderBreadcrumbs,
  createFolder,
  renameFolder,
  deleteFolder,
  cleanExpiredTempImages,
  cleanQuizOrphanImages
};

