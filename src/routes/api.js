const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const config = require('../../config');
const { 
  requireAdminAuth, 
  isValidToken, 
  loginAdmin, 
  logoutAdmin,
  checkLoginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin
} = require('../middleware/auth');
const rosterRepo = require('../db/rosterRepo');
const quizRepo = require('../db/quizRepo');
const sessionRepo = require('../db/sessionRepo');
const grader = require('../services/grader');
const db = require('../db/init');
const exporter = require('../services/exporter');
const backup = require('../services/backup');
const presenceService = require('../services/presenceService');
const settingsRepo = require('../db/settingsRepo');
const socrativePdfParser = require('../services/socrativePdfParser');
const diagnosticsService = require('../services/diagnostics');

const router = express.Router();
const ExcelJS = require('exceljs');

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // max 15 MB
});

const uploadBackup = multer({
  dest: path.join(os.tmpdir(), 'okoskodo_backups'),
  limits: { fileSize: 500 * 1024 * 1024 } // max 500 MB
});

// Multer feltöltési konfiguráció (kérdés-képekhez kvízenkénti almappákban)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const rawQuizId = req.query.quizId || req.body?.quizId || req.params?.id;
    const quizId = rawQuizId ? parseInt(rawQuizId, 10) : null;
    let targetDir = path.join(config.uploadsDir, 'quizzes');
    if (quizId && Number.isInteger(quizId) && quizId > 0) {
      targetDir = path.join(targetDir, `quiz-${quizId}`);
    } else {
      targetDir = path.join(targetDir, 'temp');
    }
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `kep-${uniqueSuffix}${ext}`);
  }
});

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
const ALLOWED_IMAGE_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']);

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_IMAGE_EXTENSIONS.has(ext) && ALLOWED_IMAGE_MIMETYPES.has(mime)) {
      return cb(null, true);
    }
    cb(new Error('Csak érvényes képfájlok (JPG, PNG, GIF, WEBP, SVG) tölthetők fel!'));
  }
});

// Globális no-store cache fejléc minden dinamikus API végponthoz (Report 14 / 10. pont)
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

/* ==========================================================================
   1. HITELESÍTÉS (AUTH)
   ========================================================================== */

router.post('/auth/login', (req, res) => {
  const clientIp = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const rateLimitStatus = checkLoginRateLimit(clientIp);
  if (!rateLimitStatus.allowed) {
    return res.status(429).json({ success: false, message: rateLimitStatus.message });
  }

  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ success: false, message: 'A PIN-kód megadása kötelező!' });
  }

  const success = loginAdmin(res, pin);
  if (success) {
    recordSuccessfulLogin(clientIp);
    return res.json({ success: true, message: 'Sikeres bejelentkezés!' });
  }

  const attempt = recordFailedLogin(clientIp);
  const remaining = 5 - attempt.count;
  const msg = remaining > 0 
    ? `Helytelen tanári PIN-kód! Még ${remaining} próbálkozási lehetőség maradt.` 
    : 'Helytelen tanári PIN-kód! Túl sok sikertelen kísérlet miatt a bejelentkezés 1 percre zárolva.';

  return res.status(401).json({ success: false, message: msg });
});

router.post('/auth/logout', (req, res) => {
  logoutAdmin(res);
  res.json({ success: true, message: 'Sikeres kijelentkezés!' });
});

router.get('/auth/check', (req, res) => {
  const token = req.cookies ? req.cookies[config.cookieName] : null;
  res.json({ isAuthenticated: isValidToken(token) });
});

/* ==========================================================================
   2. TANTÁRGYAK ÉS OSZTÁLYNÉVSOROK
   ========================================================================== */

router.get('/subjects', (req, res) => {
  try {
    const subjects = quizRepo.getSubjects();
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/classes', (req, res) => {
  try {
    const classes = rosterRepo.getClasses();
    res.json(classes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/classes/:className/students', (req, res) => {
  try {
    const students = rosterRepo.getStudentsByClass(req.params.className);
    const occupiedIds = new Set(presenceService.getOccupiedStudentIds(req.params.className));
    const enriched = students.map(s => ({
      ...s,
      is_occupied: occupiedIds.has(String(s.id))
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/classes/:className/students', requireAdminAuth, (req, res) => {
  try {
    const { students } = req.body;
    if (!Array.isArray(students)) {
      return res.status(400).json({ error: 'A tanulók listája kötelező tömb formátumban!' });
    }
    const updated = rosterRepo.saveClassRoster(req.params.className, students);
    res.json({ success: true, students: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/classes/:className', requireAdminAuth, (req, res) => {
  try {
    const deletedCount = rosterRepo.deleteClass(req.params.className);
    res.json({ success: true, deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Hivatalos osztálynévsorok exportálása (.xlsx munkafüzet - KRÉTA kompatibilis)
 */
router.get('/admin/roster/export', requireAdminAuth, async (req, res) => {
  try {
    const students = rosterRepo.getAllStudentsWithClass();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Okoskodó Röpdolgozat Rendszer';
    wb.created = new Date();

    const ws = wb.addWorksheet('Tanulók listája');

    // Fejlécek (KRÉTA export kompatibilis: 1. oszlop: Neve, 7. oszlop: Osztály)
    ws.columns = [
      { header: 'Neve', key: 'name', width: 32 },
      { header: 'Oktatási azonosító', key: 'edu_id', width: 20 },
      { header: 'Anyja születési neve', key: 'mother_name', width: 26 },
      { header: 'Születési hely', key: 'birth_place', width: 22 },
      { header: 'Születési idő', key: 'birth_date', width: 16 },
      { header: 'Tankötelezett', key: 'compulsory', width: 16 },
      { header: 'Osztály', key: 'class_name', width: 14 }
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.height = 24;

    students.forEach(s => {
      ws.addRow({
        name: s.student_name,
        edu_id: '',
        mother_name: '',
        birth_place: '',
        birth_date: '',
        compulsory: '',
        class_name: s.class_name
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="tanulok_KRETA.xlsx"');

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Hivatalos osztálynévsorok importálása (.xlsx vagy .csv KRÉTA fájlból)
 */
router.post('/admin/roster/import', requireAdminAuth, uploadMemory.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Nincs feltöltött fájl!' });
    }

    const studentsToImport = [];
    const fileName = (req.file.originalname || '').toLowerCase();

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      if (!ws) {
        return res.status(400).json({ error: 'Az Excel fájl nem tartalmaz munkalapot!' });
      }

      // Szigorúan az A oszlop (1. oszlop = Tanuló neve) és G oszlop (7. oszlop = Osztály) a KRÉTA fájl alapján
      const nameColIndex = 1;
      const classColIndex = 7;

      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Fejléc kihagyása
        const studentName = String(row.getCell(nameColIndex).text || '').trim();
        const className = String(row.getCell(classColIndex).text || '').trim();
        if (studentName && className) {
          studentsToImport.push({
            student_name: studentName,
            class_name: className
          });
        }
      });
    } else {
      // CSV vagy szöveges formátum (Idézőjelek és határolók robusztus kezelésével - Report 14 / 35.)
      const content = req.file.buffer.toString('utf-8');
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      function parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        const delim = line.includes(';') ? ';' : (line.includes('\t') ? '\t' : ',');

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === delim && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      }

      let isFirst = true;
      for (const line of lines) {
        const parts = parseCsvLine(line);
        if (isFirst && (line.toLowerCase().includes('osztály') || line.toLowerCase().includes('név'))) {
          isFirst = false;
          continue;
        }
        isFirst = false;

        if (parts.length >= 7) {
          // Teljes KRÉTA CSV: A (0.) a tanuló neve, G (6.) az osztály
          const name = parts[0];
          const cls = parts[6];
          if (name && cls) {
            studentsToImport.push({ student_name: name, class_name: cls });
          }
        } else if (parts.length >= 2) {
          let name = parts[0];
          let cls = parts[1];
          if (/^\d+\.?[a-z]?$/i.test(parts[0])) {
            cls = parts[0];
            name = parts[1];
          }
          if (name && cls) {
            studentsToImport.push({ student_name: name, class_name: cls });
          }
        }
      }
    }

    if (studentsToImport.length === 0) {
      return res.status(400).json({ error: 'A fájl nem tartalmaz feldolgozható tanulói adatokat! Ellenőrizd, hogy az 1. oszlop a nevet, a 7. oszlop az osztályt tartalmazza-e!' });
    }

    const result = rosterRepo.importRosterStudents(studentsToImport);
    res.json({
      success: true,
      totalParsed: studentsToImport.length,
      insertedCount: result.insertedCount,
      classesCount: result.classesCount,
      classes: result.classes
    });
  } catch (err) {
    res.status(500).json({ error: 'Hiba a névsor importálása közben: ' + err.message });
  }
});

/* ==========================================================================
   3. TESZTEK (QUIZZES) KEZELÉSE (ADMIN)
   ========================================================================== */

router.get('/admin/quizzes', requireAdminAuth, (req, res) => {
  try {
    const { subjectId, gradeLevel, folderId } = req.query;
    const quizzes = quizRepo.getQuizzes(subjectId || null, gradeLevel || null, folderId);
    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mappák listázása (almappák és morzsamenü útvonal)
router.get('/admin/quiz-folders', requireAdminAuth, (req, res) => {
  try {
    if (req.query.all === 'true') {
      const allFolders = quizRepo.getAllFolders();
      return res.json(allFolders);
    }

    const rawParent = req.query.parentId;
    const parentId = (rawParent === undefined || rawParent === '' || rawParent === 'null' || rawParent === 'root') ? null : Number(rawParent);
    const folders = quizRepo.getFolders(parentId);
    const breadcrumbs = quizRepo.getFolderBreadcrumbs(parentId);

    res.json({
      success: true,
      currentFolderId: parentId,
      folders,
      breadcrumbs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Új mappa létrehozása
router.post('/admin/quiz-folders', requireAdminAuth, (req, res) => {
  try {
    const { name, parent_id } = req.body;
    const created = quizRepo.createFolder({ name, parent_id });
    res.json({ success: true, folder: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Mappa átnevezése
router.put('/admin/quiz-folders/:id', requireAdminAuth, (req, res) => {
  try {
    const updated = quizRepo.renameFolder(req.params.id, req.body.name);
    res.json({ success: true, folder: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Mappa törlése (benne lévő tesztek a szülő mappába kerülnek át)
router.delete('/admin/quiz-folders/:id', requireAdminAuth, (req, res) => {
  try {
    quizRepo.deleteFolder(req.params.id);
    res.json({ success: true, message: 'Mappa sikeresen törölve, a tesztek felkerültek a szülő mappába.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admin/quizzes/:id', requireAdminAuth, (req, res) => {
  try {
    const quiz = quizRepo.getQuizById(req.params.id, false);
    if (!quiz) return res.status(404).json({ error: 'A teszt nem található!' });
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/quizzes', requireAdminAuth, (req, res) => {
  try {
    const created = quizRepo.createQuiz(req.body);
    res.json({ success: true, quiz: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/admin/quizzes/:id', requireAdminAuth, (req, res) => {
  try {
    const updated = quizRepo.updateQuiz(req.params.id, req.body);
    res.json({ success: true, quiz: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/quizzes/:id/duplicate', requireAdminAuth, (req, res) => {
  try {
    const duplicated = quizRepo.duplicateQuiz(req.params.id, req.body.title || null);
    res.json({ success: true, quiz: duplicated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Tesztek egyesítése (Merge)
router.post('/admin/quizzes/merge', requireAdminAuth, (req, res) => {
  try {
    const { quiz_id_1, quiz_id_2, title, folder_id, subject_id, subject_grade, default_time_limit_min } = req.body;
    if (!quiz_id_1 || !quiz_id_2) {
      return res.status(400).json({ error: 'Mindkét teszt azonosítójának megadása kötelező!' });
    }
    const merged = quizRepo.mergeQuizzes(quiz_id_1, quiz_id_2, {
      title,
      folder_id,
      subject_id,
      subject_grade,
      default_time_limit_min
    });
    res.json({ success: true, quiz: merged });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/admin/quizzes/:id', requireAdminAuth, (req, res) => {
  try {
    quizRepo.deleteQuiz(req.params.id);
    res.json({ success: true, message: 'Teszt sikeresen törölve!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Teszt áthelyezése másik mappába
router.put('/admin/quizzes/:id/move', requireAdminAuth, (req, res) => {
  try {
    const { folderId } = req.body;
    const updated = quizRepo.moveQuiz(req.params.id, folderId);
    res.json({ success: true, quiz: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Socrative PDF teszt importálása (Kérdések, opciók, megoldókulcs és ábrák kinyerése)
router.post('/admin/quizzes/import-socrative-pdf', requireAdminAuth, uploadMemory.single('pdfFile'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Nem érkezett feltöltött PDF fájl!' });
    }

    const parsed = socrativePdfParser.parseSocrativePdf(req.file.buffer);
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return res.status(400).json({ error: 'A megadott PDF fájlból nem sikerült kérdéseket kinyerni! Kérjük ellenőrizd, hogy a fájl érvényes Socrative feladatsor-e.' });
    }

    // Cél könyvtár az ideiglenes képekhez
    const tempDir = path.join(config.uploadsDir, 'quizzes', 'temp');
    fs.mkdirSync(tempDir, { recursive: true });

    // Képek lementése a kérdésekhez
    const timestamp = Date.now();
    parsed.questions.forEach((q, idx) => {
      if (q.imageBuffer && Buffer.isBuffer(q.imageBuffer)) {
        const imgFileName = `imported_${timestamp}_${idx + 1}.png`;
        const tempFilePath = path.join(tempDir, imgFileName);
        fs.writeFileSync(tempFilePath, q.imageBuffer);
        q.image_path = `/uploads/quizzes/temp/${imgFileName}`;
      } else {
        q.image_path = null;
      }
      delete q.imageBuffer;
    });

    const subjectId = req.body.subjectId ? parseInt(req.body.subjectId, 10) : 1;
    const folderId = req.body.folderId ? parseInt(req.body.folderId, 10) : null;
    const gradeLevel = req.body.gradeLevel ? String(req.body.gradeLevel).trim() : '6';
    const defaultTimeLimitMin = req.body.defaultTimeLimitMin ? parseInt(req.body.defaultTimeLimitMin, 10) : 0;

    let quizTitle = parsed.quizTitle && parsed.quizTitle !== 'Socrative Teszt'
      ? parsed.quizTitle
      : path.parse(req.file.originalname).name.replace(/[-_]1$/, '').trim();

    if (!quizTitle) quizTitle = 'Socrative importált teszt';

    const newQuiz = quizRepo.createQuiz({
      subject_id: subjectId,
      folder_id: folderId,
      title: quizTitle,
      subject_grade: gradeLevel,
      default_time_limit_min: defaultTimeLimitMin,
      questions: parsed.questions
    });

    res.json({
      success: true,
      quiz: newQuiz,
      message: `Sikeres importálás: „${newQuiz.title}” (${newQuiz.questions.length} kérdés, ${newQuiz.questions.filter(q => q.image_path).length} ábra beolvasva)!`
    });
  } catch (err) {
    console.error('Hiba a Socrative PDF importálásakor:', err);
    res.status(500).json({ error: `Hiba a PDF feldolgozása során: ${err.message}` });
  }
});

router.post('/admin/upload-image', requireAdminAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nem érkezett képfájl!' });
  }
  const relativeFromUploads = path.relative(config.uploadsDir, req.file.path).replace(/\\/g, '/');
  const relativePath = `/uploads/${relativeFromUploads}`;
  res.json({ success: true, imagePath: relativePath });
});

/* ==========================================================================
   4. DOLGOZATOK (SESSIONS) ÉS ÉLŐ MÁTRIX
   ========================================================================== */

// Aktív dolgozatok lekérése a fejléc "Live Badges" számára
router.get('/sessions/active', (req, res) => {
  try {
    const activeSessions = sessionRepo.getActiveSessions();
    res.json(activeSessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Összes dolgozat lekérése (Eredmények / Reports archívumhoz)
router.get('/admin/sessions', requireAdminAuth, (req, res) => {
  try {
    const sessions = sessionRepo.getAllSessions();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Adott tantárgy és évfolyam aktív dolgozatának keresése (diák belépéshez)
router.get('/sessions/active-by-channel', (req, res) => {
  try {
    const { subjectId, gradeLevel } = req.query;
    if (!subjectId || !gradeLevel) {
      return res.status(400).json({ error: 'A subjectId és gradeLevel paraméter kötelező!' });
    }
    const session = sessionRepo.getActiveSessionByChannel(Number(subjectId), String(gradeLevel));
    res.json(session || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Új dolgozat indítása (Admin)
router.post('/admin/sessions/start', requireAdminAuth, (req, res) => {
  try {
    const session = sessionRepo.startSession(req.body);
    // Socket.io értesítés küldése KIZÁRÓLAG nyilvános metaadatokkal (Report 16 / 1.1 - megoldókulcs és pillanatkép-szivárgás ellen)
    const io = req.app.get('io');
    if (io) {
      const publicSession = {
        id: session.id,
        subject_id: session.subject_id,
        subject_name: session.subject_name,
        grade_level: session.grade_level,
        quiz_id: session.quiz_id,
        quiz_title: session.quiz_title,
        class_name: session.class_name,
        mode: session.mode,
        status: session.status,
        time_limit_min: session.time_limit_min,
        started_at: session.started_at
      };
      io.emit('session:started', publicSession);
      io.emit('badges:updated', sessionRepo.getActiveSessions());
    }
    res.json({ success: true, session });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Szobák és kivetítő szinkronizált frissítése (Report 15 / 1. fejezet)
function broadcastMatrixUpdate(io, sessionId) {
  if (!io || !sessionId) return;
  const matrixData = sessionRepo.getLiveMatrixData(sessionId);
  if (matrixData) {
    io.to(`session_${sessionId}_teacher`).emit('matrix:updated', matrixData);
  }
  const projectorData = sessionRepo.getProjectorData(sessionId);
  if (projectorData) {
    io.to(`session_${sessionId}_projector`).emit('matrix:updated', projectorData);
  }
}

// Dolgozat befejezése / lezárása (Admin)
router.post('/admin/sessions/:id/finish', requireAdminAuth, (req, res) => {
  try {
    const finished = sessionRepo.finishSession(req.params.id);
    const io = req.app.get('io');
    if (io) {
      const payload = { sessionId: req.params.id };
      io.to(`session_${req.params.id}_student`).emit('session:finished', payload);
      io.to(`session_${req.params.id}_teacher`).emit('session:finished', payload);
      io.to(`session_${req.params.id}_projector`).emit('session:finished', payload);
      io.to(`session_${req.params.id}`).emit('session:finished', payload);
      io.emit('badges:updated', sessionRepo.getActiveSessions());
    }
    res.json({ success: true, session: finished });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Dolgozat végleges törlése az archívumból (Admin)
router.delete('/admin/sessions/:id', requireAdminAuth, (req, res) => {
  try {
    sessionRepo.deleteSession(req.params.id);
    const io = req.app.get('io');
    if (io) {
      io.emit('badges:updated', sessionRepo.getActiveSessions());
    }
    res.json({ success: true, message: 'Dolgozat sikeresen törölve az archívumból!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Űrhajós verseny indítása (Közös Rajt - Space Race)
router.post('/admin/sessions/:id/start-race', requireAdminAuth, (req, res) => {
  try {
    const session = sessionRepo.startRace(req.params.id);
    const io = req.app.get('io');
    if (io) {
      io.to(`session_${req.params.id}_student`).emit('race:started', { sessionId: req.params.id });
      io.to(`session_${req.params.id}_teacher`).emit('race:started', { sessionId: req.params.id });
      io.to(`session_${req.params.id}_projector`).emit('race:started', { sessionId: req.params.id });
      broadcastMatrixUpdate(io, req.params.id);
    }
    res.json({ success: true, session });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Kivetítő anonimizált és kulcsmentes adatainak lekérése (Report 15 / 1. fejezet)
router.get('/sessions/:id/projector-matrix', (req, res) => {
  try {
    const projectorData = sessionRepo.getProjectorData(req.params.id);
    if (!projectorData) return res.status(404).json({ error: 'A dolgozat nem található!' });
    res.json(projectorData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Élő mátrix adatok lekérése a tanári 1. monitorhoz
router.get('/admin/sessions/:id/matrix', requireAdminAuth, (req, res) => {
  try {
    const matrixData = sessionRepo.getLiveMatrixData(req.params.id);
    if (!matrixData) return res.status(404).json({ error: 'A dolgozat nem található!' });
    res.json(matrixData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tanári 1-kattintásos válaszfelülbírálás
router.post('/admin/answers/:id/override', requireAdminAuth, (req, res) => {
  try {
    const { eval_status, custom_points } = req.body;
    const updatedAnswer = sessionRepo.overrideAnswer({
      answer_id: req.params.id,
      eval_status,
      custom_points
    });

    // Frissült mátrix adatok kiküldése Socket.io-n (tanári szobának teljes, kivetítőnek anonimizált)
    const io = req.app.get('io');
    if (io) {
      broadcastMatrixUpdate(io, updatedAnswer.session_id);
    }

    res.json({ success: true, answer: updatedAnswer });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Gépváltás engedélyezése adatvesztés nélkül (Report 12 / 2.2 & Report 13 / 1.2 & Report 14 / 06., 07.)
router.post('/admin/participants/:id/authorize-seat-change', requireAdminAuth, (req, res) => {
  try {
    const participantId = req.params.id;
    const { target_pc_number } = req.body || {};

    // Résztvevő és diák adatainak lekérdezése a jelenléti feloldáshoz
    const participant = db.prepare(`
      SELECT p.id, p.session_id, p.student_id, p.student_name, stu.class_name
      FROM participants p
      LEFT JOIN students stu ON p.student_id = stu.id
      WHERE p.id = ?
    `).get(participantId);

    const result = sessionRepo.authorizeSeatChange(participantId, target_pc_number);

    // Memóriabeli foglalás feloldása, hogy a célgépen azonnal kiválasztható legyen
    if (participant && participant.student_id) {
      presenceService.releaseStudent(participant.student_id);
    }

    const io = req.app.get('io');
    if (io) {
      // Célzott értesítés a régi gépnek a munkamenet lezárásához
      io.emit('participant:kicked', { 
        participantId: Number(participantId), 
        studentId: participant ? participant.student_id : null 
      });
      io.emit('participant:seat-change-authorized', { 
        participantId: Number(participantId), 
        studentId: participant ? participant.student_id : null,
        targetPcNumber: result.targetPcNumber 
      });

      // Frissített foglaltság kiküldése az érintett osztálynak
      if (participant && participant.class_name) {
        io.emit('students:occupied_updated', {
          className: participant.class_name,
          occupiedStudentIds: presenceService.getOccupiedStudentIds(participant.class_name)
        });
      }

      // Mátrix frissítése a tanári felületen és a kivetítőn
      broadcastMatrixUpdate(io, result.sessionId);
    }

    const targetMsg = result.targetPcNumber ? ` a(z) ${result.targetPcNumber}. gépre` : '';
    res.json({ success: true, message: `Gépváltás engedélyezve ${result.studentName} számára${targetMsg}! Az új gépről bejelentkezhet.`, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Téves névfoglalás törlése (Report 12 / 2.2 & Report 14 / 07. - Reset: törli a téves rekordot és válaszokat)
router.post('/admin/participants/:id/reset', requireAdminAuth, (req, res) => {
  try {
    const participantId = req.params.id;

    const participant = db.prepare(`
      SELECT p.id, p.session_id, p.student_id, stu.class_name
      FROM participants p
      LEFT JOIN students stu ON p.student_id = stu.id
      WHERE p.id = ?
    `).get(participantId);

    if (!participant) {
      return res.status(404).json({ error: 'A résztvevő nem található!' });
    }

    sessionRepo.resetParticipant(participantId);

    // Memóriabeli foglalás feloldása
    if (participant.student_id) {
      presenceService.releaseStudent(participant.student_id);
    }

    const io = req.app.get('io');
    if (io) {
      // Célzott kiléptetés a tévesen bejelentkezett kliensnek
      io.emit('participant:kicked', { 
        participantId: Number(participantId), 
        studentId: participant.student_id 
      });
      io.emit('participant:reset', { 
        participantId: Number(participantId), 
        studentId: participant.student_id 
      });
      io.emit('participant:unlocked', { 
        participantId: Number(participantId), 
        studentId: participant.student_id 
      });

      // Frissített foglaltság kiküldése az osztálynak
      if (participant.class_name) {
        io.emit('students:occupied_updated', {
          className: participant.class_name,
          occupiedStudentIds: presenceService.getOccupiedStudentIds(participant.class_name)
        });
      }

      // Mátrix frissítése a tanári felületen és a kivetítőn
      broadcastMatrixUpdate(io, participant.session_id);
    }

    res.json({ success: true, message: 'A diák téves rekordja és válaszai sikeresen törölve!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Visszamenőleges kompatibilitási alias a téves névfoglalás törléséhez
router.post('/admin/participants/:id/unlock', requireAdminAuth, (req, res) => {
  try {
    const participantId = req.params.id;

    const participant = db.prepare(`
      SELECT p.id, p.session_id, p.student_id, stu.class_name
      FROM participants p
      LEFT JOIN students stu ON p.student_id = stu.id
      WHERE p.id = ?
    `).get(participantId);

    if (!participant) {
      return res.status(404).json({ error: 'A résztvevő nem található!' });
    }

    sessionRepo.resetParticipant(participantId);

    if (participant.student_id) {
      presenceService.releaseStudent(participant.student_id);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('participant:kicked', { 
        participantId: Number(participantId), 
        studentId: participant.student_id 
      });
      io.emit('participant:unlocked', { 
        participantId: Number(participantId), 
        studentId: participant.student_id 
      });
      io.emit('participant:reset', { 
        participantId: Number(participantId), 
        studentId: participant.student_id 
      });

      if (participant.class_name) {
        io.emit('students:occupied_updated', {
          className: participant.class_name,
          occupiedStudentIds: presenceService.getOccupiedStudentIds(participant.class_name)
        });
      }

      broadcastMatrixUpdate(io, participant.session_id);
    }

    res.json({ success: true, message: 'A diák sikeresen feloldva!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ==========================================================================
   5. DIÁK MŰVELETEK (STUDENT ACTIONS)
   ========================================================================== */

// Belépés dolgozatba (vagy Session Recovery)
router.post('/student/join', (req, res) => {
  try {
    const { session_id, student_id, student_name, pc_number, team_color, session_token } = req.body;
    const clientToken = session_token || req.headers['x-session-token'] || null;
    if (!session_id || !student_id || !student_name) {
      return res.status(400).json({ error: 'A dolgozat, a tanuló azonosítója és neve kötelező!' });
    }

    const joinResult = sessionRepo.joinSession({
      session_id,
      student_id,
      student_name,
      pc_number: pc_number ? parseInt(pc_number, 10) : null,
      team_color: team_color || null,
      session_token: clientToken
    });

    // Értesítés a tanári mátrixnak új csatlakozóról és a diákoknak a foglalt névről
    const io = req.app.get('io');
    if (io) {
      const matrixData = sessionRepo.getLiveMatrixData(session_id);
      io.to(`session_${session_id}_teacher`).emit('matrix:updated', matrixData);
      io.emit('badges:updated', sessionRepo.getActiveSessions());

      // Diák osztályának kinyerése a valós idejű jelenlét frissítéséhez
      const student = rosterRepo.getStudentById(student_id);
      if (student && student.class_name) {
        io.emit('students:occupied_updated', {
          className: student.class_name,
          occupiedStudentIds: presenceService.getOccupiedStudentIds(student.class_name)
        });
      }
    }

    res.json({
      success: true,
      diagnosticsEnabled: config.diagnosticsEnabled,
      isRecovery: joinResult.isRecovery,
      token: joinResult.participant.session_token,
      participant: joinResult.participant,
      answers: joinResult.answers
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Diák felület adatainak lekérése (SZIGORÚAN correct_answer és explanation NÉLKÜL!)
router.get('/student/session-data', (req, res) => {
  try {
    const token = req.headers['x-session-token'] || req.query.token;
    if (!token) {
      return res.status(401).json({ error: 'Munkamenet token hiányzik!' });
    }

    const participant = sessionRepo.getParticipantByToken(token);
    if (!participant) {
      return res.status(404).json({ error: 'Érvénytelen vagy lejárt munkamenet!' });
    }

    // Kvíz adatok beolvasása: elsősorban a rögzített snapshotból (Report 15 / 2. fejezet), fallbackként az élő kvízből
    let quiz = null;
    let fullSnapshotQuestions = [];
    if (participant.quiz_snapshot_json) {
      try {
        const snap = JSON.parse(participant.quiz_snapshot_json);
        if (snap && Array.isArray(snap.questions) && snap.questions.length > 0) {
          fullSnapshotQuestions = snap.questions;
          // Diák nézet a snapshotból: helyes válasz és magyarázat kitakarása a dolgozatírás közben
          quiz = {
            id: snap.id || participant.quiz_id,
            title: snap.title || participant.quiz_title,
            total_points: snap.total_points || 0,
            questions: snap.questions.map(q => ({
              id: q.id,
              quiz_id: q.quiz_id,
              question_order: q.question_order,
              question_type: q.question_type,
              question_text: q.question_text,
              instructions: q.instructions || '',
              image_path: q.image_path || null,
              options: Array.isArray(q.options) ? q.options : [],
              points: Number(q.points) || 1.0
            }))
          };
        }
      } catch {
        quiz = null;
      }
    }

    if (!quiz) {
      // Történeti dolgozat esetén a sablon akkor is feloldható a diáknak, ha már törölve van a feladattárból (Report 18 / 3. pont)
      quiz = quizRepo.getQuizById(participant.quiz_id, true, true);
    }

    if (!quiz) {
      quiz = {
        id: participant.quiz_id,
        title: participant.quiz_title || 'Dolgozat',
        total_points: Number(participant.max_points) || 0,
        questions: []
      };
    }

    // Kérdések sorrendezése a résztvevő egyedi question_order_json-ja szerint
    let questionOrder = [];
    try {
      questionOrder = JSON.parse(participant.question_order_json || '[]');
    } catch {
      questionOrder = [];
    }

    let orderedQuestions = quiz.questions;
    if (questionOrder.length > 0) {
      const qMap = new Map(quiz.questions.map(q => [q.id, q]));
      orderedQuestions = questionOrder.map(id => qMap.get(id)).filter(Boolean);
    }

    // ABCD válaszok opcionális keverése (shuffle_options)
    if (participant.shuffle_options === 1) {
      orderedQuestions = orderedQuestions.map(q => {
        if (q.question_type === 'ABCD' && Array.isArray(q.options)) {
          const shuffled = [...q.options];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          return { ...q, options: shuffled };
        }
        return q;
      });
    }

    // Tanuló pontszámának és jegyének kalkulációja
    const pointsRow = db.prepare('SELECT COALESCE(SUM(points_earned), 0.0) AS total_points FROM answers WHERE participant_id = ?').get(participant.id);
    const totalPoints = pointsRow ? Number(pointsRow.total_points.toFixed(2)) : 0;
    const totalMax = (participant.max_points !== null && participant.max_points !== undefined && Number(participant.max_points) > 0)
      ? Number(participant.max_points)
      : (quiz.total_points || 0);
    const percentage = totalMax > 0 ? Math.round((totalPoints / totalMax) * 100) : 0;
    const thresholds = JSON.parse(participant.grade_thresholds_json || '{"2":30,"3":55,"4":75,"5":90}');
    const grade = grader.calculateGrade(percentage, thresholds);
    const gradeText = grader.getGradeText(grade);

    // Tanuló leadott válaszai az értékeléshez és áttekintéshez (dolgozat befejezése után a helyes válaszokkal együtt)
    const showSolutions = (participant.is_finished === 1 || participant.session_status === 'FINISHED') && participant.show_feedback_on_end !== 0;

    let answers = [];
    if (showSolutions) {
      const rawAnswers = db.prepare(`
        SELECT question_id, submitted_answer, is_correct, points_earned, eval_status
        FROM answers
        WHERE participant_id = ?
      `).all(participant.id);

      let correctMap = new Map();
      if (fullSnapshotQuestions.length > 0) {
        correctMap = new Map(fullSnapshotQuestions.map(q => [q.id, q]));
      } else {
        correctMap = new Map(
          db.prepare('SELECT id, correct_answer, explanation FROM questions WHERE quiz_id = ?').all(participant.quiz_id).map(r => [r.id, r])
        );
      }

      answers = rawAnswers.map(a => {
        const sol = correctMap.get(a.question_id);
        return {
          ...a,
          correct_answer: sol ? sol.correct_answer : null,
          explanation: sol ? sol.explanation : null
        };
      });

      orderedQuestions = orderedQuestions.map(q => {
        const sol = correctMap.get(q.id);
        return sol ? { ...q, correct_answer: sol.correct_answer, explanation: sol.explanation } : q;
      });
    } else {
      answers = db.prepare(`
        SELECT question_id, submitted_answer, is_correct, points_earned, eval_status
        FROM answers
        WHERE participant_id = ?
      `).all(participant.id);
    }

    const isRaceStarted = participant.mode === 'SPACE_RACE' ? (participant.current_question_index >= 1) : true;
    const exposedQuestions = isRaceStarted ? orderedQuestions : [];

    res.json({
      diagnosticsEnabled: config.diagnosticsEnabled,
      session: {
        id: participant.session_id,
        subject_name: participant.subject_name,
        grade_level: participant.grade_level,
        class_name: participant.session_class_name,
        quiz_title: participant.quiz_title,
        mode: participant.mode,
        grade_thresholds_json: participant.grade_thresholds_json
      },
      participant: {
        id: participant.id,
        session_id: participant.session_id,
        student_name: participant.student_name,
        pc_number: participant.pc_number,
        team_color: participant.team_color,
        is_finished: participant.is_finished,
        deadline_at: participant.deadline_at,
        time_limit_min: participant.time_limit_min,
        joined_at: participant.joined_at,
        finished_at: participant.finished_at,
        session_status: participant.session_status,
        session_mode: participant.mode,
        is_race_started: isRaceStarted,
        show_feedback_on_end: participant.show_feedback_on_end
      },
      quiz: {
        id: quiz.id,
        title: quiz.title,
        questions: exposedQuestions,
        total_points: quiz.total_points
      },
      results: {
        total_points: totalPoints,
        max_points: totalMax,
        percentage,
        grade,
        grade_text: gradeText
      },
      answers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Válasz beküldése
router.post('/student/submit-answer', (req, res) => {
  req.routeLogged = 'student.submit_answer';
  const opId = req.headers['x-operation-id'];

  diagnosticsService.logEvent({
    source: 'server',
    event: 'answer.received',
    requestId: req.requestId,
    operationId: opId,
    route: 'student.submit_answer'
  });

  try {
    const token = req.body.session_token || req.headers['x-session-token'];
    const { question_id, submitted_answer, time_spent_sec } = req.body;

    if (!token) {
      diagnosticsService.logEvent({
        source: 'server',
        event: 'answer.rejected',
        requestId: req.requestId,
        operationId: opId,
        reasonCode: 'TOKEN_MISSING',
        httpStatus: 401
      });
      return res.status(401).json({ error: 'Munkamenet token hiányzik!' });
    }
    if (!question_id) {
      diagnosticsService.logEvent({
        source: 'server',
        event: 'answer.rejected',
        requestId: req.requestId,
        operationId: opId,
        reasonCode: 'QUESTION_ID_MISSING',
        httpStatus: 400
      });
      return res.status(400).json({ error: 'A kérdés azonosítója hiányzik!' });
    }

    const participant = sessionRepo.getParticipantByToken(token);
    if (!participant) {
      diagnosticsService.logEvent({
        source: 'server',
        event: 'answer.rejected',
        requestId: req.requestId,
        operationId: opId,
        reasonCode: 'PARTICIPANT_UNKNOWN',
        httpStatus: 404
      });
      return res.status(404).json({ error: 'Érvénytelen munkamenet!' });
    }

    let submission;
    try {
      submission = sessionRepo.submitAnswer({
        participant_id: participant.id,
        question_id: Number(question_id),
        submitted_answer,
        time_spent_sec
      });
    } catch (persErr) {
      diagnosticsService.logEvent({
        source: 'server',
        event: 'answer.failed',
        requestId: req.requestId,
        operationId: opId,
        reasonCode: 'PERSISTENCE_CALL_FAILED',
        httpStatus: 400
      });
      throw persErr;
    }

    const durationMs = req.startTimeHr ? Number((process.hrtime.bigint() - req.startTimeHr) / 1000000n) : undefined;
    diagnosticsService.logEvent({
      source: 'server',
      event: 'answer.persisted',
      requestId: req.requestId,
      operationId: opId,
      outcome: submission.alreadySubmitted ? 'duplicate' : 'saved',
      durationMs
    });

    try {
      // Értesítés a tanári mátrixnak valós időben (csak tanári szobába)
      const io = req.app.get('io');
      if (io) {
        broadcastMatrixUpdate(io, participant.session_id);
      }

      const session = sessionRepo.getSessionById(participant.session_id);
      const hideFeedback = session ? (session.show_feedback_on_end === 0) : false;

      res.json({
        success: true,
        alreadySubmitted: submission.alreadySubmitted,
        eval_status: hideFeedback ? null : submission.answer.eval_status,
        is_correct: hideFeedback ? null : submission.answer.is_correct,
        points_earned: hideFeedback ? null : submission.answer.points_earned,
        isFinished: submission.isFinished,
        correctAnswer: hideFeedback ? null : submission.correctAnswer,
        explanation: hideFeedback ? null : submission.explanation,
        hideFeedback: hideFeedback
      });
    } catch (afterErr) {
      diagnosticsService.logEvent({
        source: 'server',
        event: 'answer.failed',
        requestId: req.requestId,
        operationId: opId,
        reasonCode: 'AFTER_PERSISTENCE_FAILED',
        httpStatus: 400
      });
      throw afterErr;
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fókuszvesztés rögzítése (Report 14 / 21., 24.)
router.post('/student/focus-lost', (req, res) => {
  try {
    const token = req.body.session_token || req.headers['x-session-token'];
    if (!token) return res.status(401).json({ error: 'Token hiányzik!' });

    const participant = sessionRepo.getParticipantByToken(token);
    if (!participant) return res.status(404).json({ error: 'Érvénytelen munkamenet!' });

    // Ha a dolgozat már lezárult vagy a diák önállóan befejezte, nem növeljük tovább a számlálót
    if (participant.session_status === 'FINISHED' || participant.is_finished === 1) {
      return res.json({ success: true, count: participant.focus_lost_count, ignored: true });
    }

    const updated = sessionRepo.recordFocusLost(participant.id);

    // Értesítés kizárólag az adott dolgozat tanári szobájának
    const io = req.app.get('io');
    if (io) {
      io.to(`session_${participant.session_id}_teacher`).emit('participant:focus_lost', {
        sessionId: participant.session_id,
        participantId: participant.id,
        studentName: participant.student_name,
        focusLostCount: updated.focus_lost_count
      });
    }

    res.json({ success: true, count: updated.focus_lost_count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dolgozat manuális befejezése (Beküldés a végén)
router.post('/student/finish', (req, res) => {
  try {
    const token = req.body.session_token || req.headers['x-session-token'];
    if (!token) return res.status(401).json({ error: 'Token hiányzik!' });

    const participant = sessionRepo.getParticipantByToken(token);
    if (!participant) return res.status(404).json({ error: 'Érvénytelen munkamenet!' });

    const finished = sessionRepo.finishParticipant(participant.id);

    const io = req.app.get('io');
    if (io) {
      broadcastMatrixUpdate(io, participant.session_id);
    }

    res.json({ success: true, participant: finished });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   6. EXPORTOK ÉS BIZTONSÁGI MENTÉS (ADMIN)
   ========================================================================== */

router.get('/admin/export/excel/:sessionId', requireAdminAuth, async (req, res) => {
  try {
    const buffer = await exporter.generateExcelReport(req.params.sessionId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="eredmenyek_${req.params.sessionId}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/export/html/:sessionId', requireAdminAuth, (req, res) => {
  try {
    const html = exporter.generateInteractiveHtml(req.params.sessionId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="eredmenyek_${req.params.sessionId}.html"`);
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/export/zip/:sessionId', requireAdminAuth, (req, res) => {
  try {
    const archive = exporter.createIndividualZipStream(req.params.sessionId);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="egyeni_ertekelesek_${req.params.sessionId}.zip"`);
    archive.pipe(res);
    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/backup', requireAdminAuth, async (req, res) => {
  try {
    const archive = await backup.createSystemBackupStream();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="ropdolgozat_backup_${timestamp}.zip"`);
    archive.pipe(res);
    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Diagnosztikai állapot lekérdezése (Admin)
router.get('/admin/diagnostics/status', requireAdminAuth, (req, res) => {
  try {
    const status = diagnosticsService.getStatus();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Diagnosztikai eseménynapló exportálása streamelve (Admin)
router.get('/admin/diagnostics/export', requireAdminAuth, (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const dirCheck = diagnosticsService.writer.validateDirectory();
    if (!dirCheck.valid) {
      return res.status(503).json({
        error: 'A diagnosztikai könyvtár konfigurációja érvénytelen, az export letiltva.',
        code: 'CONFIG_ERROR'
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="okoskodo_diagnostics_${timestamp}.jsonl"`);

    const exportStream = diagnosticsService.createExportStream({ hours: 24 });

    const onClientClose = () => {
      if (!exportStream.destroyed) {
        exportStream.destroy();
      }
    };
    res.once('close', onClientClose);
    exportStream.once('end', () => {
      res.removeListener('close', onClientClose);
    });
    exportStream.once('error', () => {
      res.removeListener('close', onClientClose);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Hiba a diagnosztikai export olvasása közben!' });
      } else if (!res.writableEnded) {
        res.end();
      }
    });

    exportStream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rendszerbeállítások lekérése (Admin)
router.get('/admin/settings', requireAdminAuth, (req, res) => {
  try {
    const settings = settingsRepo.getSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rendszerbeállítások mentése (Admin)
router.post('/admin/settings', requireAdminAuth, (req, res) => {
  try {
    const settings = settingsRepo.saveSettings(req.body);
    res.json({ success: true, settings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Rendszerbeállítások visszaállítása gyári alapértékekre (Admin)
router.post('/admin/settings/reset', requireAdminAuth, (req, res) => {
  try {
    const settings = settingsRepo.resetSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teljes rendszermentés visszaállítása (Admin)
router.post('/admin/restore', requireAdminAuth, uploadBackup.single('backupFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nincs kijelölt feltöltendő mentésfájl!' });
  }
  const uploadedPath = req.file.path;
  try {
    backup.restoreSystemBackup(uploadedPath);
    try {
      if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    } catch {}
    res.json({ success: true, message: 'A rendszermentés visszaállítása sikeresen befejeződött!' });
  } catch (err) {
    try {
      if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    } catch {}
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
