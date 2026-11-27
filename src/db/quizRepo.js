const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
      COALESCE(q.sort_order, 0) AS sort_order,
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

  query += ' GROUP BY q.id ORDER BY CASE WHEN COALESCE(q.sort_order, 0) > 0 THEN 0 ELSE 1 END ASC, COALESCE(q.sort_order, 0) ASC, q.updated_at DESC, q.id DESC';

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
      COALESCE(q.sort_order, 0) AS sort_order,
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
        allow_multiple: grader.isMultipleChoiceCorrectAnswer(q.question_type, q.correct_answer, parsedOptions),
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
 * Kérdéshez és ABCD opciókhoz tartozó képhivatkozások összegyűjtése (típushelyesen)
 * Támogatja a DB sort (options_json string) és a snapshot objektumot (options tömb) is.
 * @returns {{ paths: string[], parseError: boolean }}
 */
function extractQuestionImagePaths(questionObj) {
  const paths = [];
  let parseError = false;
  if (!questionObj || typeof questionObj !== 'object') {
    return { paths, parseError };
  }

  if (typeof questionObj.image_path === 'string' && questionObj.image_path.trim()) {
    paths.push(questionObj.image_path.trim());
  }

  let opts = null;
  if (Array.isArray(questionObj.options)) {
    opts = questionObj.options;
  } else if (typeof questionObj.options_json === 'string' && questionObj.options_json.trim()) {
    try {
      const parsed = JSON.parse(questionObj.options_json);
      if (Array.isArray(parsed)) opts = parsed;
    } catch {
      parseError = true;
    }
  }

  if (Array.isArray(opts)) {
    for (const opt of opts) {
      if (opt && typeof opt === 'object' && typeof opt.image_path === 'string' && opt.image_path.trim()) {
        paths.push(opt.image_path.trim());
      }
    }
  }

  return { paths, parseError };
}

/**
 * Pontos képútvonal-csere a megoldókulcsban (egyértékű string és többválasztós JSON tömb esetén is)
 * Szöveges opciók részsztringjeit nem módosítja.
 */
function remapCorrectAnswerImagePaths(correctAnswer, pathMap) {
  if (!correctAnswer || !pathMap || pathMap.size === 0) return correctAnswer;
  const raw = String(correctAnswer).trim();
  if (!raw) return correctAnswer;

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        let changed = false;
        const mapped = parsed.map(item => {
          const s = String(item ?? '').trim();
          if (pathMap.has(s)) {
            changed = true;
            return pathMap.get(s);
          }
          return item;
        });
        return changed ? JSON.stringify(mapped) : correctAnswer;
      }
    } catch {
      // Nem JSON tömb -> sima szövegként kezeljük
    }
  }

  return pathMap.has(raw) ? pathMap.get(raw) : correctAnswer;
}

/**
 * Az adatbázis összes kérdésében és munkamenet-pillanatképében hivatkozott temp/ képfájlnevek összegyűjtése
 */
function collectAllReferencedTempFilenames() {
  const referenced = new Set();
  let hasParseError = false;

  const qRows = db.prepare('SELECT image_path, options_json FROM questions').all();
  for (const row of qRows) {
    const res = extractQuestionImagePaths(row);
    if (res.parseError) hasParseError = true;
    for (const p of res.paths) {
      if (p.startsWith('/uploads/quizzes/temp/')) {
        referenced.add(path.basename(p));
      }
    }
  }

  const sRows = db.prepare('SELECT quiz_snapshot_json FROM sessions WHERE quiz_snapshot_json IS NOT NULL').all();
  for (const sRow of sRows) {
    if (!sRow.quiz_snapshot_json) continue;
    try {
      const snapshot = JSON.parse(sRow.quiz_snapshot_json);
      const snapQuestions = Array.isArray(snapshot) ? snapshot : (snapshot.questions || []);
      if (Array.isArray(snapQuestions)) {
        for (const sq of snapQuestions) {
          const res = extractQuestionImagePaths(sq);
          if (res.parseError) hasParseError = true;
          for (const p of res.paths) {
            if (p.startsWith('/uploads/quizzes/temp/')) {
              referenced.add(path.basename(p));
            }
          }
        }
      }
    } catch {
      hasParseError = true;
    }
  }

  return { referenced, hasParseError };
}

/**
 * Fájl SHA-256 tartalmi ujjlenyomatának kiszámítása névütközés-ellenőrzéshez
 */
function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

/**
 * Helyi képfájl létezésének, típusának (rendes fájl) és olvashatóságának ellenőrzése
 */
function assertReadableLocalImageFile(fullPath, displayName) {
  let stat = null;
  try {
    stat = fs.statSync(fullPath);
  } catch {
    throw Object.assign(
      new Error(`A csatolt képfájl (${displayName}) nem található a szerveren! Kérlek csatold újra a képet.`),
      { status: 400, code: 'MISSING_IMAGE_FILE' }
    );
  }
  if (!stat.isFile()) {
    throw Object.assign(
      new Error(`A csatolt képútvonal (${displayName}) nem érvényes fájl a szerveren!`),
      { status: 400, code: 'MISSING_IMAGE_FILE' }
    );
  }
  try {
    fs.accessSync(fullPath, fs.constants.R_OK);
  } catch {
    throw Object.assign(
      new Error(`A csatolt képfájl (${displayName}) nem olvasható a szerveren!`),
      { status: 500, code: 'IMAGE_READ_ERROR' }
    );
  }
}

/**
 * Hivatkozott helyi (temp, permanens kvízmappa vagy feltöltési gyökér) képfájlok meglétének
 * és olvashatóságának előellenőrzése mentés ELŐTT (K1 & K2 védelem).
 */
/**
 * A1: ABCD kérdések egyértelműségének ellenőrzése (kétértelmű, több másik opció JSON-tömb kombinációjával
 * azonos szövegű opciók elutasítása mentéskor ÉS dolgozatindításkor is).
 */
function validateAbcdQuestionsIntegrity(questions = []) {
  if (!Array.isArray(questions) || questions.length === 0) return;
  questions.forEach((q, idx) => {
    if ((q.question_type || 'ABCD') !== 'ABCD') return;
    const rawOpts = Array.isArray(q.options)
      ? q.options
      : (() => { try { return JSON.parse(q.options_json || '[]'); } catch { return []; } })();
    if (!Array.isArray(rawOpts) || rawOpts.length === 0) return;

    const qOrder = q.question_order || (idx + 1);
    const optVals = rawOpts.map(o => grader.getOptionValue(o)).filter(Boolean);
    const optSet = new Set();

    // 1. A1: Azonos beküldési értékű (duplikált) ABCD opciók tiltása (pl. két külön kép azonos felirattal)
    for (const val of optVals) {
      if (optSet.has(val)) {
        throw Object.assign(
          new Error(`Duplikált válaszlehetőség a(z) ${qOrder}. kérdésnél („${val}”): minden opció beküldési értékének egyedinek kell lennie!`),
          { status: 400, code: 'DUPLICATE_ABCD_OPTION', questionId: q.id || null, questionOrder: qOrder }
        );
      }
      optSet.add(val);
    }

    // 2. A1: Kétértelmű, más opciók JSON-tömb kombinációjával megegyező literal opció tiltása
    if (optVals.length >= 3) {
      for (const val of optVals) {
        if (val.startsWith('[')) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed) && parsed.length >= 2) {
              const items = parsed.map(x => String(x ?? '').trim()).filter(Boolean);
              if (items.length >= 2 && items.every(it => it !== val && optSet.has(it))) {
                throw Object.assign(
                  new Error(`Kétértelmű válaszlehetőség a(z) ${qOrder}. kérdésnél („${val}”): egy opció szövege nem egyezhet meg ugyanannak a kérdésnek több másik opciója JSON-tömb alakú kombinációjával!`),
                  { status: 400, code: 'AMBIGUOUS_ABCD_OPTIONS', questionId: q.id || null, questionOrder: qOrder }
                );
              }
            }
          } catch (e) {
            if (e && e.code === 'AMBIGUOUS_ABCD_OPTIONS') throw e;
          }
        }
      }
    }

    // 3. A1: Nem üres megoldókulcs minden elemének ténylegesen feloldhatónak (exact:) kell lennie az opciólistán
    const rawCorrect = q.correct_answer !== undefined && q.correct_answer !== null ? String(q.correct_answer).trim() : '';
    if (rawCorrect) {
      const keyItems = grader.parseAnswerList(rawCorrect, rawOpts);
      if (keyItems.length === 0) {
        throw Object.assign(
          new Error(`Érvénytelen (üresre feloldódó) megoldókulcs a(z) ${qOrder}. kérdésnél („${rawCorrect}”): legalább egy létező opciót meg kell jelölni!`),
          { status: 400, code: 'INVALID_CORRECT_ANSWER', questionId: q.id || null, questionOrder: qOrder }
        );
      }
      for (const keyItem of keyItems) {
        const canon = grader.resolveAbcdCanonical(keyItem, rawOpts);
        if (!canon || !canon.startsWith('exact:')) {
          throw Object.assign(
            new Error(`Érvénytelen vagy nem feloldható megoldókulcs a(z) ${qOrder}. kérdésnél („${keyItem}”): a helyes válasz nem feleltethető meg egyetlen opciólehetőségnek sem!`),
            { status: 400, code: 'INVALID_CORRECT_ANSWER', questionId: q.id || null, questionOrder: qOrder }
          );
        }
      }
    }
  });
}

function validateQuestionsLocalImagesExist(questions = []) {
  if (!Array.isArray(questions) || questions.length === 0) return;
  validateAbcdQuestionsIntegrity(questions);
  const tempDir = path.join(config.uploadsDir, 'quizzes', 'temp');

  for (const q of questions) {
    const { paths } = extractQuestionImagePaths(q);
    for (const relPath of paths) {
      if (relPath.startsWith('/uploads/quizzes/temp/')) {
        const fname = path.basename(relPath);
        assertReadableLocalImageFile(path.join(tempDir, fname), fname);
      } else if (/^\/uploads\/quizzes\/quiz-\d+\/[^/]+$/.test(relPath)) {
        const parts = relPath.split('/').filter(Boolean); // ['uploads', 'quizzes', 'quiz-123', 'kep.jpg']
        const quizFolder = parts[2];
        const fname = parts[3];
        assertReadableLocalImageFile(path.join(config.uploadsDir, 'quizzes', quizFolder, fname), fname);
      } else if (/^\/uploads\/[^/]+$/.test(relPath)) {
        const fname = path.basename(relPath);
        assertReadableLocalImageFile(path.join(config.uploadsDir, fname), fname);
      }
    }
  }
}

/**
 * Temp/gyökér képek előkészítése és átmásolása a kvíz végleges mappájába MÉG a DB tranzakció ELŐTT (K1 védelem).
 * Így I/O hiba esetén az adatbázis-tranzakció el sem indul, semmilyen félkész módosítás nem maradhat.
 */
function prepareQuestionsImagesForQuiz(quizId, questions = []) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { preparedQuestions: questions, stagedRemaps: new Map(), createdFiles: [] };
  }

  const targetDir = path.join(config.uploadsDir, 'quizzes', `quiz-${quizId}`);
  const expectedPrefix = `/uploads/quizzes/quiz-${quizId}/`;
  const tempDir = path.join(config.uploadsDir, 'quizzes', 'temp');

  const stagedRemaps = new Map();
  const createdFiles = [];

  const ensureTargetFile = (relPath) => {
    if (!relPath || typeof relPath !== 'string') return null;
    const trimmed = relPath.trim();
    if (!trimmed || trimmed.startsWith(expectedPrefix)) return null;

    let sourceFullPath = null;
    if (trimmed.startsWith('/uploads/quizzes/temp/')) {
      sourceFullPath = path.join(tempDir, path.basename(trimmed));
    } else if (/^\/uploads\/[^/]+$/.test(trimmed)) {
      sourceFullPath = path.join(config.uploadsDir, path.basename(trimmed));
    } else {
      return null;
    }

    if (stagedRemaps.has(trimmed)) {
      return stagedRemaps.get(trimmed).newRelativePath;
    }

    assertReadableLocalImageFile(sourceFullPath, path.basename(trimmed));

    fs.mkdirSync(targetDir, { recursive: true });
    const origName = path.basename(trimmed);
    let destName = origName;
    let newFilePath = path.join(targetDir, destName);

    if (fs.existsSync(newFilePath)) {
      const srcHash = computeFileSha256(sourceFullPath);
      const dstHash = computeFileSha256(newFilePath);
      if (srcHash !== dstHash) {
        const ext = path.extname(origName);
        const base = path.basename(origName, ext);
        destName = `${base}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}${ext}`;
        newFilePath = path.join(targetDir, destName);
        fs.copyFileSync(sourceFullPath, newFilePath);
        createdFiles.push(newFilePath);
      }
    } else {
      fs.copyFileSync(sourceFullPath, newFilePath);
      createdFiles.push(newFilePath);
    }

    const newRelativePath = `${expectedPrefix}${destName}`;
    stagedRemaps.set(trimmed, { newRelativePath, sourceFullPath, sourceRelPath: trimmed });
    return newRelativePath;
  };

  try {
    const preparedQuestions = questions.map((q) => {
      const cloned = { ...q };
      const rowPathMap = new Map();

      if (cloned.image_path) {
        const mappedMain = ensureTargetFile(cloned.image_path);
        if (mappedMain && mappedMain !== cloned.image_path) {
          rowPathMap.set(String(cloned.image_path).trim(), mappedMain);
          cloned.image_path = mappedMain;
        }
      }

      let parsedOpts = null;
      const hadArrayOptions = Array.isArray(cloned.options);
      if (hadArrayOptions) {
        parsedOpts = cloned.options;
      } else if (typeof cloned.options_json === 'string' && cloned.options_json.trim()) {
        try {
          parsedOpts = JSON.parse(cloned.options_json);
        } catch (parseErr) {
          console.error('Figyelmeztetés: hibás options_json az előkészítésnél:', parseErr.message);
        }
      }

      if (Array.isArray(parsedOpts)) {
        let optsChanged = false;
        const mappedOpts = parsedOpts.map(opt => {
          if (opt && typeof opt === 'object' && typeof opt.image_path === 'string' && opt.image_path.trim()) {
            const oldOptImg = opt.image_path.trim();
            const mappedOpt = ensureTargetFile(oldOptImg);
            if (mappedOpt && mappedOpt !== oldOptImg) {
              rowPathMap.set(oldOptImg, mappedOpt);
              optsChanged = true;
              return { ...opt, image_path: mappedOpt };
            }
          }
          return opt;
        });
        if (optsChanged) {
          if (hadArrayOptions) {
            cloned.options = mappedOpts;
          } else {
            cloned.options_json = JSON.stringify(mappedOpts);
          }
        }
      }

      if (rowPathMap.size > 0 && cloned.correct_answer) {
        const remappedCorrect = remapCorrectAnswerImagePaths(cloned.correct_answer, rowPathMap);
        if (remappedCorrect !== cloned.correct_answer) {
          cloned.correct_answer = remappedCorrect;
        }
      }

      return cloned;
    });

    return { preparedQuestions, stagedRemaps, createdFiles };
  } catch (err) {
    // Ha az előkészítés félbeszakadt, a most létrehozott új fájlokat best-effort kitakarítjuk
    for (const f of createdFiles) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
    throw err;
  }
}

/**
 * Sikeres adatbázis-tranzakció utáni best-effort forrás- és árvatakarítás
 */
function cleanupPreparedSources(quizId, stagedRemaps) {
  try {
    if (stagedRemaps && stagedRemaps.size > 0) {
      const { referencedPaths, hasParseError } = collectAllReferencedImagePaths();
      if (!hasParseError) {
        for (const info of stagedRemaps.values()) {
          if (info.sourceFullPath && fs.existsSync(info.sourceFullPath)) {
            if (!referencedPaths.has(info.sourceRelPath)) {
              try {
                fs.unlinkSync(info.sourceFullPath);
              } catch {}
            }
          }
        }
      }
    }
    cleanQuizOrphanImages(quizId);
  } catch (cleanupErr) {
    console.error(`Figyelmeztetés: utólagos képtakarítási hiba a #${quizId} kvíznél:`, cleanupErr.message);
  }
}

/**
 * Az adatbázis összes kérdésében és munkamenet-pillanatképében hivatkozott helyi képútvonalak globális gyűjtése
 */
function collectAllReferencedImagePaths() {
  const referencedPaths = new Set();
  let hasParseError = false;

  const qRows = db.prepare('SELECT image_path, options_json FROM questions').all();
  for (const row of qRows) {
    const res = extractQuestionImagePaths(row);
    if (res.parseError) hasParseError = true;
    for (const p of res.paths) referencedPaths.add(p);
  }

  const sRows = db.prepare('SELECT quiz_snapshot_json FROM sessions WHERE quiz_snapshot_json IS NOT NULL').all();
  for (const sRow of sRows) {
    if (!sRow.quiz_snapshot_json) continue;
    try {
      const snapshot = JSON.parse(sRow.quiz_snapshot_json);
      const snapQuestions = Array.isArray(snapshot) ? snapshot : (snapshot.questions || []);
      if (Array.isArray(snapQuestions)) {
        for (const sq of snapQuestions) {
          const res = extractQuestionImagePaths(sq);
          if (res.parseError) hasParseError = true;
          for (const p of res.paths) referencedPaths.add(p);
        }
      }
    } catch {
      hasParseError = true;
    }
  }

  return { referencedPaths, hasParseError };
}

/**
 * Temp vagy gyökér uploads mappában lévő képek (kérdés fő képe + ABCD opcióképek + képes megoldókulcs)
 * biztonságos átmásolása és véglegesítése a kvíz saját almappájába.
 * Tartalom-alapú (SHA-256) ütközésvédelemmel: eltérő tartalmú azonos fájlnév új egyedi nevet kap!
 */
function finalizeQuizTempImages(quizId) {
  const qRows = db.prepare('SELECT id, image_path, options_json, correct_answer FROM questions WHERE quiz_id = ?').all(quizId);
  if (!qRows || qRows.length === 0) return;

  const targetDir = path.join(config.uploadsDir, 'quizzes', `quiz-${quizId}`);
  const expectedPrefix = `/uploads/quizzes/quiz-${quizId}/`;
  const tempDir = path.join(config.uploadsDir, 'quizzes', 'temp');

  // 1. Előkészítés és tartós fájl létrehozása pontos prefix-alapú forrásfeloldással
  const stagedRemaps = new Map(); // oldRelativePath -> { newRelativePath, sourceFullPath, sourceRelPath }
  const ensureTargetFile = (relPath) => {
    if (!relPath || typeof relPath !== 'string') return null;
    const trimmed = relPath.trim();
    if (!trimmed || trimmed.startsWith(expectedPrefix)) return null;

    let sourceFullPath = null;
    if (trimmed.startsWith('/uploads/quizzes/temp/')) {
      sourceFullPath = path.join(tempDir, path.basename(trimmed));
    } else if (/^\/uploads\/[^/]+$/.test(trimmed)) {
      sourceFullPath = path.join(config.uploadsDir, path.basename(trimmed));
    } else {
      // Másik kvíz saját mappájára vagy külső URL-re mutató hivatkozást nem mozgatunk el
      return null;
    }

    if (stagedRemaps.has(trimmed)) {
      return stagedRemaps.get(trimmed).newRelativePath;
    }

    if (!fs.existsSync(sourceFullPath)) {
      throw Object.assign(
        new Error(`A csatolt képfájl (${path.basename(trimmed)}) nem található a szerveren!`),
        { status: 400, code: 'MISSING_IMAGE_FILE' }
      );
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const origName = path.basename(trimmed);
    let destName = origName;
    let newFilePath = path.join(targetDir, destName);

    if (fs.existsSync(newFilePath)) {
      const srcHash = computeFileSha256(sourceFullPath);
      const dstHash = computeFileSha256(newFilePath);
      if (srcHash !== dstHash) {
        // Azonos fájlnév, ELTÉRŐ tartalom -> új egyedi fájlnév, így a régi kép bájtait nem írjuk felül!
        const ext = path.extname(origName);
        const base = path.basename(origName, ext);
        destName = `${base}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}${ext}`;
        newFilePath = path.join(targetDir, destName);
        fs.copyFileSync(sourceFullPath, newFilePath);
      }
    } else {
      fs.copyFileSync(sourceFullPath, newFilePath);
    }

    const newRelativePath = `${expectedPrefix}${destName}`;
    stagedRemaps.set(trimmed, { newRelativePath, sourceFullPath, sourceRelPath: trimmed });
    return newRelativePath;
  };

    const pendingUpdates = [];
    for (const row of qRows) {
      let nextImagePath = row.image_path;
      let nextOptionsJson = row.options_json;
      let nextCorrectAnswer = row.correct_answer;
      let rowChanged = false;
      const rowPathMap = new Map();

      if (row.image_path) {
        const mappedMain = ensureTargetFile(row.image_path);
        if (mappedMain && mappedMain !== row.image_path) {
          rowPathMap.set(row.image_path.trim(), mappedMain);
          nextImagePath = mappedMain;
          rowChanged = true;
        }
      }

      if (row.options_json) {
        let parsedOpts = null;
        try {
          parsedOpts = JSON.parse(row.options_json);
        } catch (parseErr) {
          console.error(`Figyelmeztetés: hibás options_json a #${row.id} kérdésnél:`, parseErr.message);
        }
        if (Array.isArray(parsedOpts)) {
          let optsChanged = false;
          const mappedOpts = parsedOpts.map(opt => {
            if (opt && typeof opt === 'object' && typeof opt.image_path === 'string' && opt.image_path.trim()) {
              const oldOptImg = opt.image_path.trim();
              const mappedOpt = ensureTargetFile(oldOptImg);
              if (mappedOpt && mappedOpt !== oldOptImg) {
                rowPathMap.set(oldOptImg, mappedOpt);
                optsChanged = true;
                return { ...opt, image_path: mappedOpt };
              }
            }
            return opt;
          });
          if (optsChanged) {
            nextOptionsJson = JSON.stringify(mappedOpts);
            rowChanged = true;
          }
        }
      }

      if (rowPathMap.size > 0 && row.correct_answer) {
        const remappedCorrect = remapCorrectAnswerImagePaths(row.correct_answer, rowPathMap);
        if (remappedCorrect !== row.correct_answer) {
          nextCorrectAnswer = remappedCorrect;
          rowChanged = true;
        }
      }

      if (rowChanged) {
        pendingUpdates.push({
          id: row.id,
          image_path: nextImagePath,
          options_json: nextOptionsJson,
          correct_answer: nextCorrectAnswer
        });
      }
    }

    // 2. Adatbázisírás egyetlen tranzakcióban
    if (pendingUpdates.length > 0) {
      const updateStmt = db.prepare('UPDATE questions SET image_path = ?, options_json = ?, correct_answer = ? WHERE id = ?');
      const tx = db.transaction((items) => {
        for (const item of items) {
          updateStmt.run(item.image_path, item.options_json, item.correct_answer, item.id);
        }
      });
      tx(pendingUpdates);
    }

    // 3. Commit után a temp/gyökér forrásfájlok eltávolítása, ha már sehol máshol nincsenek hivatkozva
    if (stagedRemaps.size > 0) {
      const { referencedPaths, hasParseError } = collectAllReferencedImagePaths();
      if (!hasParseError) {
        for (const info of stagedRemaps.values()) {
          if (info.sourceFullPath && fs.existsSync(info.sourceFullPath)) {
            if (!referencedPaths.has(info.sourceRelPath)) {
              try {
                fs.unlinkSync(info.sourceFullPath);
              } catch {}
            }
          }
        }
      }
    }

    // 4. Árva (lecserélt vagy törölt) képek biztonságos kitakarítása
    cleanQuizOrphanImages(quizId);
}

/**
 * A kvíz almappájában lévő árva (már nem használt / lecserélt / törölt) képek automatikus kitakarítása.
 * Globális hivatkozás-ellenőrzéssel: az ÖSSZES kvíz kérdéseit és az ÖSSZES munkamenet-pillanatképet megőrzi!
 */
function cleanQuizOrphanImages(quizId) {
  try {
    const targetDir = path.join(config.uploadsDir, 'quizzes', `quiz-${quizId}`);
    if (!fs.existsSync(targetDir)) return;

    const quizPrefix = `/uploads/quizzes/quiz-${quizId}/`;
    const { referencedPaths, hasParseError } = collectAllReferencedImagePaths();

    // Ha bármelyik JSON szerkezet sérült/olvashatatlan volt, biztonsági okból nem törlünk!
    if (hasParseError) {
      console.warn(`Figyelmeztetés: a #${quizId} kvíz árvatakarítása kihagyva olvashatatlan JSON szerkezet miatt.`);
      return;
    }

    const activeFilenames = new Set();
    for (const p of referencedPaths) {
      if (p.startsWith(quizPrefix)) {
        activeFilenames.add(path.basename(p));
      }
    }

    // Kompatibilitás a régi/tesztelt pillanatképekkel: az adott quiz_id saját kérdéseinek és saját session snapshotjainak basename-jeit is megőrizzük
    const ownQuestions = db.prepare('SELECT image_path, options_json FROM questions WHERE quiz_id = ?').all(quizId);
    for (const q of ownQuestions) {
      for (const p of extractQuestionImagePaths(q).paths) {
        activeFilenames.add(path.basename(p));
      }
    }
    const ownSessions = db.prepare('SELECT quiz_snapshot_json FROM sessions WHERE quiz_id = ? AND quiz_snapshot_json IS NOT NULL').all(quizId);
    for (const sRow of ownSessions) {
      try {
        const snapshot = JSON.parse(sRow.quiz_snapshot_json);
        const snapQuestions = Array.isArray(snapshot) ? snapshot : (snapshot.questions || []);
        if (Array.isArray(snapQuestions)) {
          for (const sq of snapQuestions) {
            for (const p of extractQuestionImagePaths(sq).paths) {
              activeFilenames.add(path.basename(p));
            }
          }
        }
      } catch {}
    }

    // Végigmegyünk a mappában lévő összes fizikai fájlon
    const files = fs.readdirSync(targetDir);
    for (const file of files) {
      if (!activeFilenames.has(file)) {
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
 * Az adatbázisban vagy pillanatképekben még hivatkozott temp fájlokat SZIGORÚAN megőrzi!
 */
function cleanExpiredTempImages(maxAgeHours = 24) {
  try {
    const tempDir = path.join(config.uploadsDir, 'quizzes', 'temp');
    if (!fs.existsSync(tempDir)) return;

    const { referenced, hasParseError } = collectAllReferencedTempFilenames();
    if (hasParseError) {
      console.warn('Figyelmeztetés: az ideiglenes képek takarítása kihagyva olvashatatlan JSON szerkezet miatt.');
      return;
    }

    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      if (referenced.has(file)) continue; // Hivatkozott fájlt soha nem törlünk!
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
 * Kvíz kérdéseinek összes képhivatkozásának (fő kép + ABCD opcióképek + képes megoldókulcs) átírása
 */
function remapQuizQuestionImagePaths(targetQuizId, pathMap) {
  if (!pathMap || pathMap.size === 0) return;
  const rows = db.prepare('SELECT id, image_path, options_json, correct_answer FROM questions WHERE quiz_id = ?').all(targetQuizId);
  const updateStmt = db.prepare('UPDATE questions SET image_path = ?, options_json = ?, correct_answer = ? WHERE id = ?');

  const tx = db.transaction(() => {
    for (const row of rows) {
      let nextImagePath = row.image_path;
      let nextOptionsJson = row.options_json;
      let nextCorrectAnswer = row.correct_answer;
      let changed = false;

      if (typeof row.image_path === 'string' && pathMap.has(row.image_path.trim())) {
        nextImagePath = pathMap.get(row.image_path.trim());
        changed = true;
      }

      if (row.options_json) {
        try {
          const parsedOpts = JSON.parse(row.options_json);
          if (Array.isArray(parsedOpts)) {
            let optsChanged = false;
            const mappedOpts = parsedOpts.map(opt => {
              if (opt && typeof opt === 'object' && typeof opt.image_path === 'string' && pathMap.has(opt.image_path.trim())) {
                optsChanged = true;
                return { ...opt, image_path: pathMap.get(opt.image_path.trim()) };
              }
              return opt;
            });
            if (optsChanged) {
              nextOptionsJson = JSON.stringify(mappedOpts);
              changed = true;
            }
          }
        } catch {}
      }

      if (row.correct_answer) {
        const remappedCorrect = remapCorrectAnswerImagePaths(row.correct_answer, pathMap);
        if (remappedCorrect !== row.correct_answer) {
          nextCorrectAnswer = remappedCorrect;
          changed = true;
        }
      }

      if (changed) {
        updateStmt.run(nextImagePath, nextOptionsJson, nextCorrectAnswer, row.id);
      }
    }
  });

  tx();
}

/**
 * Kvízhez tartozó képek átmásolása duplikáláskor az új kvíz almappájába (fő kép + opcióképek + kulcs)
 */
function copyQuizImages(originalQuizId, newQuizId) {
  const origDir = path.join(config.uploadsDir, 'quizzes', `quiz-${originalQuizId}`);
  if (!fs.existsSync(origDir)) return;

  const newDir = path.join(config.uploadsDir, 'quizzes', `quiz-${newQuizId}`);
  fs.mkdirSync(newDir, { recursive: true });

  const pathMap = new Map();
  const entries = fs.readdirSync(origDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      fs.copyFileSync(path.join(origDir, entry.name), path.join(newDir, entry.name));
      pathMap.set(
        `/uploads/quizzes/quiz-${originalQuizId}/${entry.name}`,
        `/uploads/quizzes/quiz-${newQuizId}/${entry.name}`
      );
    }
  }

  remapQuizQuestionImagePaths(newQuizId, pathMap);
}

/**
 * Kvízhez tartozó képek biztonságos takarítása törléskor:
 * Más kvízek vagy lezárt munkamenet-pillanatképek által hivatkozott fájlokat SZIGORÚAN megőriz!
 */
function removeQuizImages(quizId) {
  try {
    const dir = path.join(config.uploadsDir, 'quizzes', `quiz-${quizId}`);
    if (!fs.existsSync(dir)) return;

    cleanQuizOrphanImages(quizId);
    const remaining = fs.readdirSync(dir);
    if (remaining.length === 0) {
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
  validateQuestionsLocalImagesExist(questions);

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
  try {
    finalizeQuizTempImages(newQuizId);
  } catch (imgErr) {
    // Ha a képek véglegesítése I/O hibára futott, visszagörgetjük a félkész új tesztet
    try {
      const cleanupTx = db.transaction(() => {
        db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(newQuizId);
        db.prepare('DELETE FROM quizzes WHERE id = ?').run(newQuizId);
      });
      cleanupTx();
      removeQuizImages(newQuizId);
    } catch (cleanupErr) {
      console.error(`Figyelmeztetés: félkész teszt (#${newQuizId}) kompenzáló takarítása sikertelen:`, cleanupErr.message);
    }
    throw imgErr;
  }
  return getQuizById(newQuizId, false);
}

/**
 * Meglévő teszt szerkesztése (Szabadon szerkeszthető tanári sablon)
 */
function updateQuiz(quizId, { subject_id, folder_id = null, title, subject_grade, default_time_limit_min, questions }) {
  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) throw new Error('A teszt címe kötelező!');
  validateQuestionsLocalImagesExist(questions);

  // K1: Képek előkészítése és átmásolása MÉG az adatbázis-tranzakció ELŐTT
  const { preparedQuestions, stagedRemaps, createdFiles } = prepareQuestionsImagesForQuiz(quizId, questions);

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

    if (Array.isArray(preparedQuestions) && preparedQuestions.length > 0) {
      preparedQuestions.forEach((q, idx) => {
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

  try {
    tx();
  } catch (dbErr) {
    for (const f of createdFiles) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
    throw dbErr;
  }
  cleanupPreparedSources(quizId, stagedRemaps);
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

  try {
    copyQuizImages(original.id, newQuiz.id);
  } catch (copyErr) {
    try {
      const cleanupTx = db.transaction(() => {
        db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(newQuiz.id);
        db.prepare('DELETE FROM quizzes WHERE id = ?').run(newQuiz.id);
      });
      cleanupTx();
      removeQuizImages(newQuiz.id);
    } catch {}
    throw copyErr;
  }
  return getQuizById(newQuiz.id, false);
}

/**
 * Több forráskvízhez tartozó képek átmásolása az új kvíz almappájába (névütközés-mentesen)
 */
function copyMergedQuizImages(sourceQuizIds, newQuizId) {
  const newDir = path.join(config.uploadsDir, 'quizzes', `quiz-${newQuizId}`);
  fs.mkdirSync(newDir, { recursive: true });

  const pathMap = new Map();
  for (const srcId of sourceQuizIds) {
    const origDir = path.join(config.uploadsDir, 'quizzes', `quiz-${srcId}`);
    if (fs.existsSync(origDir)) {
      const entries = fs.readdirSync(origDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const destName = `src_${srcId}_${entry.name}`;
          fs.copyFileSync(path.join(origDir, entry.name), path.join(newDir, destName));
          pathMap.set(
            `/uploads/quizzes/quiz-${srcId}/${entry.name}`,
            `/uploads/quizzes/quiz-${newQuizId}/${destName}`
          );
        }
      }
    }
  }

  remapQuizQuestionImagePaths(newQuizId, pathMap);
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

  try {
    copyMergedQuizImages([q1.id, q2.id], newQuiz.id);
  } catch (copyErr) {
    try {
      const cleanupTx = db.transaction(() => {
        db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(newQuiz.id);
        db.prepare('DELETE FROM quizzes WHERE id = ?').run(newQuiz.id);
      });
      cleanupTx();
      removeQuizImages(newQuiz.id);
    } catch {}
    throw copyErr;
  }
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
      COALESCE(f.sort_order, 0) AS sort_order,
      f.created_at,
      (SELECT COUNT(*) FROM quiz_folders sub WHERE sub.parent_id = f.id) AS subfolder_count,
      (SELECT COUNT(*) FROM quizzes q WHERE q.folder_id = f.id) AS quiz_count
    FROM quiz_folders f
    WHERE ${parentId === null ? 'f.parent_id IS NULL' : 'f.parent_id = ?'}
    ORDER BY CASE WHEN COALESCE(f.sort_order, 0) > 0 THEN 0 ELSE 1 END ASC, COALESCE(f.sort_order, 0) ASC, f.name COLLATE NOCASE ASC
  `;
  const stmt = db.prepare(query);
  return parentId === null ? stmt.all() : stmt.all(Number(parentId));
}

/**
 * Az összes mappa lekérése lapos listaként (legördülő menükhöz és útvonalépítéshez)
 */
function getAllFolders() {
  const stmt = db.prepare(`
    SELECT id, parent_id, name, COALESCE(sort_order, 0) AS sort_order, created_at
    FROM quiz_folders
    ORDER BY CASE WHEN COALESCE(sort_order, 0) > 0 THEN 0 ELSE 1 END ASC, COALESCE(sort_order, 0) ASC, name COLLATE NOCASE ASC
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
 * Mappa áthelyezése másik mappába (vagy a főmappába / gyökérbe)
 * A teljes belső almappa- és tesztstruktúra együtt mozog a mappával.
 * Szigorú ciklusvédelemmel tiltja a saját magába vagy saját almappájába történő áthelyezést.
 * @param {number} folderId
 * @param {number|null} targetParentId
 * @returns {object}
 */
function moveFolder(folderId, targetParentId) {
  const fId = Number(folderId);
  const folder = db.prepare('SELECT id, parent_id, name FROM quiz_folders WHERE id = ?').get(fId);
  if (!folder) {
    throw new Error('Az áthelyezendő mappa nem található!');
  }

  const targetId = (targetParentId === null || targetParentId === undefined || targetParentId === '' || targetParentId === 'root')
    ? null
    : Number(targetParentId);

  if (targetId !== null) {
    if (!Number.isInteger(targetId) || targetId <= 0) {
      throw new Error('Érvénytelen célmappa azonosító!');
    }
    if (targetId === fId) {
      throw new Error('Egy mappát nem lehet saját magába áthelyezni!');
    }

    const targetFolder = db.prepare('SELECT id, parent_id FROM quiz_folders WHERE id = ?').get(targetId);
    if (!targetFolder) {
      throw new Error('A megadott célmappa nem létezik!');
    }

    // Ciklusvédelem: a célmappa egyik őse sem lehet a mozgatott mappa
    const parentStmt = db.prepare('SELECT parent_id FROM quiz_folders WHERE id = ?');
    let currId = targetFolder.parent_id;
    const visited = new Set([targetId]);
    while (currId !== null && currId !== undefined) {
      if (Number(currId) === fId) {
        throw new Error('Egy mappát nem lehet saját almappájába áthelyezni!');
      }
      if (visited.has(Number(currId))) break;
      visited.add(Number(currId));
      const parentRow = parentStmt.get(currId);
      currId = parentRow ? parentRow.parent_id : null;
    }
  }

  db.prepare('UPDATE quiz_folders SET parent_id = ? WHERE id = ?').run(targetId, fId);
  return { id: fId, parent_id: targetId, name: folder.name };
}

/**
 * Mappák egyéni megjelenítési sorrendjének szigorú, tranzakciós mentése (Drag & Drop)
 * Ellenőrzi az azonosítók egyediségét, létezését, közös szülőmappáját és párhuzamos módosításokat (409 ORDER_CONFLICT).
 * @param {number[]} orderedFolderIds - A kívánt sorrendben lévő testvérmappa-azonosítók
 * @param {{ parentId?: number|null, expectedOrderIds?: number[] }} options
 * @returns {{ success: boolean, count: number, orderedIds: number[] }}
 */
function reorderFolders(orderedFolderIds = [], options = {}) {
  if (!Array.isArray(orderedFolderIds) || orderedFolderIds.length === 0) {
    throw Object.assign(new Error('A rendezendő mappák listája nem lehet üres!'), { status: 400, code: 'INVALID_ORDER_LIST' });
  }

  const cleanIds = [];
  const seen = new Set();
  for (const rawId of orderedFolderIds) {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw Object.assign(new Error('Érvénytelen mappaazonosító a sorrendlistában!'), { status: 400, code: 'INVALID_FOLDER_ID' });
    }
    if (seen.has(id)) {
      throw Object.assign(new Error('Duplikált mappaazonosító a sorrendlistában!'), { status: 400, code: 'DUPLICATE_FOLDER_ID' });
    }
    seen.add(id);
    cleanIds.push(id);
  }

  const hasExplicitParent = options && options.parentId !== undefined;
  const normalizedParentId = hasExplicitParent
    ? ((options.parentId === null || options.parentId === '' || options.parentId === 'root') ? null : Number(options.parentId))
    : undefined;

  let expectedIds = null;
  if (options && options.expectedOrderIds !== undefined) {
    if (!Array.isArray(options.expectedOrderIds)) {
      throw Object.assign(new Error('Az elvárt alap-sorrendlistának tömbnek kell lennie!'), { status: 400, code: 'INVALID_EXPECTED_ORDER' });
    }
    expectedIds = [];
    for (const rawExp of options.expectedOrderIds) {
      const n = Number(rawExp);
      if (!Number.isSafeInteger(n) || n <= 0) {
        throw Object.assign(new Error('Érvénytelen azonosító az elvárt alap-sorrendlistában!'), { status: 400, code: 'INVALID_EXPECTED_ORDER' });
      }
      expectedIds.push(n);
    }
  }

  const tx = db.transaction(() => {
    const placeholders = cleanIds.map(() => '?').join(',');
    const foundRows = db.prepare(`SELECT id, parent_id FROM quiz_folders WHERE id IN (${placeholders})`).all(...cleanIds);
    if (foundRows.length !== cleanIds.length) {
      throw Object.assign(new Error('A sorrendlistában szereplő egyik mappa már nem létezik!'), { status: 409, code: 'ORDER_CONFLICT' });
    }

    const scopeParentId = hasExplicitParent ? normalizedParentId : (foundRows[0].parent_id === null ? null : Number(foundRows[0].parent_id));
    for (const row of foundRows) {
      const rowParent = row.parent_id === null ? null : Number(row.parent_id);
      if (rowParent !== scopeParentId) {
        throw Object.assign(new Error('A sorrendlista eltérő mappaszinthez tartozó elemeket tartalmaz, vagy közben áthelyeztek egy mappát!'), { status: 409, code: 'ORDER_CONFLICT' });
      }
    }

    const currentSiblings = getFolders(scopeParentId).map(f => Number(f.id));
    if (currentSiblings.length !== cleanIds.length || !currentSiblings.every(id => seen.has(id))) {
      throw Object.assign(new Error('A mappák listája hiányos vagy időközben megváltozott (hozzáadás, törlés vagy áthelyezés történt). A nézet frissítése szükséges!'), { status: 409, code: 'ORDER_CONFLICT' });
    }
    if (expectedIds !== null) {
      if (expectedIds.length !== currentSiblings.length || expectedIds.some((id, idx) => id !== currentSiblings[idx])) {
        throw Object.assign(new Error('A mappák sorrendjét időközben egy másik munkaállomásról módosították!'), { status: 409, code: 'ORDER_CONFLICT' });
      }
    }

    const updateStmt = db.prepare('UPDATE quiz_folders SET sort_order = ? WHERE id = ?');
    let updatedCount = 0;
    cleanIds.forEach((id, idx) => {
      const info = updateStmt.run(idx + 1, id);
      updatedCount += info.changes;
    });

    return { success: true, count: updatedCount, orderedIds: cleanIds };
  });

  return tx();
}

/**
 * Tesztek egyéni megjelenítési sorrendjének szigorú, tranzakciós mentése (mappán belüli Drag & Drop)
 * Ellenőrzi az azonosítók egyediségét, létezését, nem törölt állapotát, közös mappáját és párhuzamos módosításokat (409 ORDER_CONFLICT).
 * @param {number[]} orderedQuizIds - A kívánt sorrendben lévő tesztazonosítók
 * @param {{ folderId?: number|null, expectedOrderIds?: number[] }} options
 * @returns {{ success: boolean, count: number, orderedIds: number[] }}
 */
function reorderQuizzes(orderedQuizIds = [], options = {}) {
  if (!Array.isArray(orderedQuizIds) || orderedQuizIds.length === 0) {
    throw Object.assign(new Error('A rendezendő tesztek listája nem lehet üres!'), { status: 400, code: 'INVALID_ORDER_LIST' });
  }

  const cleanIds = [];
  const seen = new Set();
  for (const rawId of orderedQuizIds) {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw Object.assign(new Error('Érvénytelen tesztazonosító a sorrendlistában!'), { status: 400, code: 'INVALID_QUIZ_ID' });
    }
    if (seen.has(id)) {
      throw Object.assign(new Error('Duplikált tesztazonosító a sorrendlistában!'), { status: 400, code: 'DUPLICATE_QUIZ_ID' });
    }
    seen.add(id);
    cleanIds.push(id);
  }

  const hasExplicitFolder = options && options.folderId !== undefined;
  const normalizedFolderId = hasExplicitFolder
    ? ((options.folderId === null || options.folderId === '' || options.folderId === 'root') ? null : Number(options.folderId))
    : undefined;

  let expectedIds = null;
  if (options && options.expectedOrderIds !== undefined) {
    if (!Array.isArray(options.expectedOrderIds)) {
      throw Object.assign(new Error('Az elvárt alap-sorrendlistának tömbnek kell lennie!'), { status: 400, code: 'INVALID_EXPECTED_ORDER' });
    }
    expectedIds = [];
    for (const rawExp of options.expectedOrderIds) {
      const n = Number(rawExp);
      if (!Number.isSafeInteger(n) || n <= 0) {
        throw Object.assign(new Error('Érvénytelen azonosító az elvárt alap-sorrendlistában!'), { status: 400, code: 'INVALID_EXPECTED_ORDER' });
      }
      expectedIds.push(n);
    }
  }

  const tx = db.transaction(() => {
    const placeholders = cleanIds.map(() => '?').join(',');
    const foundRows = db.prepare(`SELECT id, folder_id FROM quizzes WHERE COALESCE(is_deleted, 0) = 0 AND id IN (${placeholders})`).all(...cleanIds);
    if (foundRows.length !== cleanIds.length) {
      throw Object.assign(new Error('A sorrendlistában szereplő egyik teszt már nem létezik vagy törölve lett!'), { status: 409, code: 'ORDER_CONFLICT' });
    }

    const scopeFolderId = hasExplicitFolder ? normalizedFolderId : (foundRows[0].folder_id === null ? null : Number(foundRows[0].folder_id));
    for (const row of foundRows) {
      const rowFolder = row.folder_id === null ? null : Number(row.folder_id);
      if (rowFolder !== scopeFolderId) {
        throw Object.assign(new Error('A sorrendlista eltérő mappához tartozó teszteket tartalmaz, vagy közben áthelyeztek egy tesztet!'), { status: 409, code: 'ORDER_CONFLICT' });
      }
    }

    const currentSiblings = getQuizzes(null, null, scopeFolderId).map(q => Number(q.id));
    if (currentSiblings.length !== cleanIds.length || !currentSiblings.every(id => seen.has(id))) {
      throw Object.assign(new Error('A mappa tesztlistája hiányos vagy időközben megváltozott (új teszt, törlés vagy áthelyezés történt). A nézet frissítése szükséges!'), { status: 409, code: 'ORDER_CONFLICT' });
    }
    if (expectedIds !== null) {
      if (expectedIds.length !== currentSiblings.length || expectedIds.some((id, idx) => id !== currentSiblings[idx])) {
        throw Object.assign(new Error('A tesztek sorrendjét időközben egy másik munkaállomásról módosították!'), { status: 409, code: 'ORDER_CONFLICT' });
      }
    }

    const updateStmt = db.prepare('UPDATE quizzes SET sort_order = ? WHERE id = ? AND COALESCE(is_deleted, 0) = 0');
    let updatedCount = 0;
    cleanIds.forEach((id, idx) => {
      const info = updateStmt.run(idx + 1, id);
      updatedCount += info.changes;
    });

    return { success: true, count: updatedCount, orderedIds: cleanIds };
  });

  return tx();
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
  validateQuestionsLocalImagesExist([questionData]);

  // K1: Csak a célzott kérdés képeit készítjük elő, MÉG a DB tranzakció ELŐTT
  const { preparedQuestions, stagedRemaps, createdFiles } = prepareQuestionsImagesForQuiz(qzId, [questionData]);
  const preparedQ = preparedQuestions[0];

  const instructions = String(preparedQ.instructions || '').trim();
  const imagePath = preparedQ.image_path ? String(preparedQ.image_path).trim() : null;
  const optionsJson = Array.isArray(preparedQ.options)
    ? JSON.stringify(preparedQ.options)
    : (preparedQ.options_json || '[]');
  const correctAnswer = String(preparedQ.correct_answer || '').trim();
  const explanation = String(preparedQ.explanation || '').trim();
  const points = Number(preparedQ.points) || 1.0;

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

  try {
    tx();
  } catch (dbErr) {
    for (const f of createdFiles) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
    throw dbErr;
  }
  cleanupPreparedSources(qzId, stagedRemaps);

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
  reorderQuizzes,
  getFolders,
  getAllFolders,
  getFolderBreadcrumbs,
  createFolder,
  renameFolder,
  moveFolder,
  reorderFolders,
  deleteFolder,
  cleanExpiredTempImages,
  cleanQuizOrphanImages,
  validateAbcdQuestionsIntegrity
};

