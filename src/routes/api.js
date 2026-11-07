const express = require('express');
const path = require('path');
const multer = require('multer');
const config = require('../../config');
const { requireAdminAuth, isValidToken, loginAdmin, logoutAdmin } = require('../middleware/auth');
const rosterRepo = require('../db/rosterRepo');
const quizRepo = require('../db/quizRepo');
const sessionRepo = require('../db/sessionRepo');
const grader = require('../services/grader');
const db = require('../db/init');
const exporter = require('../services/exporter');
const backup = require('../services/backup');

const router = express.Router();

// Multer feltöltési konfiguráció (kérdés-képekhez)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `kep-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Csak képfájlok (JPG, PNG, GIF, WEBP, SVG) tölthetők fel!'));
  }
});

/* ==========================================================================
   1. HITELESÍTÉS (AUTH)
   ========================================================================== */

router.post('/auth/login', (req, res) => {
  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ success: false, message: 'A PIN-kód megadása kötelező!' });
  }

  const success = loginAdmin(res, pin);
  if (success) {
    return res.json({ success: true, message: 'Sikeres bejelentkezés!' });
  }
  return res.status(401).json({ success: false, message: 'Helytelen tanári PIN-kód!' });
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
    res.json(students);
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

/* ==========================================================================
   3. TESZTEK (QUIZZES) KEZELÉSE (ADMIN)
   ========================================================================== */

router.get('/admin/quizzes', requireAdminAuth, (req, res) => {
  try {
    const { subjectId, gradeLevel } = req.query;
    const quizzes = quizRepo.getQuizzes(subjectId || null, gradeLevel || null);
    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

router.delete('/admin/quizzes/:id', requireAdminAuth, (req, res) => {
  try {
    quizRepo.deleteQuiz(req.params.id);
    res.json({ success: true, message: 'Teszt sikeresen törölve!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/upload-image', requireAdminAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nem érkezett képfájl!' });
  }
  const relativePath = `/uploads/${req.file.filename}`;
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
    // Socket.io értesítés küldése
    const io = req.app.get('io');
    if (io) {
      io.emit('session:started', session);
      io.emit('badges:updated', sessionRepo.getActiveSessions());
    }
    res.json({ success: true, session });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Dolgozat befejezése / lezárása (Admin)
router.post('/admin/sessions/:id/finish', requireAdminAuth, (req, res) => {
  try {
    const finished = sessionRepo.finishSession(req.params.id);
    const io = req.app.get('io');
    if (io) {
      io.to(`session_${req.params.id}`).emit('session:finished', { sessionId: req.params.id });
      io.emit('badges:updated', sessionRepo.getActiveSessions());
    }
    res.json({ success: true, session: finished });
  } catch (err) {
    res.status(400).json({ error: err.message });
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

    // Frissült mátrix adatok kiküldése Socket.io-n
    const io = req.app.get('io');
    if (io) {
      const matrixData = sessionRepo.getLiveMatrixData(updatedAnswer.session_id);
      io.to(`session_${updatedAnswer.session_id}`).emit('matrix:updated', matrixData);
    }

    res.json({ success: true, answer: updatedAnswer });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Gépváltás engedélyezése adatvesztés nélkül (Report 12 / 2.2 & Report 13 / 1.2)
router.post('/admin/participants/:id/authorize-seat-change', requireAdminAuth, (req, res) => {
  try {
    const participantId = req.params.id;
    const { target_pc_number } = req.body || {};
    const result = sessionRepo.authorizeSeatChange(participantId, target_pc_number);

    const io = req.app.get('io');
    if (io) {
      io.emit('participant:seat-change-authorized', { participantId, targetPcNumber: result.targetPcNumber });
    }

    const targetMsg = result.targetPcNumber ? ` a(z) ${result.targetPcNumber}. gépre` : '';
    res.json({ success: true, message: `Gépváltás engedélyezve ${result.studentName} számára${targetMsg}! Az új gépről bejelentkezhet.`, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Téves névfoglalás törlése (Report 12 / 2.2 - Reset: törli a téves rekordot és válaszokat)
router.post('/admin/participants/:id/reset', requireAdminAuth, (req, res) => {
  try {
    const participantId = req.params.id;
    sessionRepo.resetParticipant(participantId);

    const io = req.app.get('io');
    if (io) {
      io.emit('participant:reset', { participantId });
      io.emit('participant:unlocked', { participantId });
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
    sessionRepo.resetParticipant(participantId);

    const io = req.app.get('io');
    if (io) {
      io.emit('participant:unlocked', { participantId });
      io.emit('participant:reset', { participantId });
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

    // Értesítés a tanári mátrixnak új csatlakozóról
    const io = req.app.get('io');
    if (io) {
      const matrixData = sessionRepo.getLiveMatrixData(session_id);
      io.to(`session_${session_id}`).emit('matrix:updated', matrixData);
      io.emit('badges:updated', sessionRepo.getActiveSessions());
    }

    res.json({
      success: true,
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
    const token = req.query.token || req.headers['x-session-token'];
    if (!token) {
      return res.status(401).json({ error: 'Munkamenet token hiányzik!' });
    }

    const participant = sessionRepo.getParticipantByToken(token);
    if (!participant) {
      return res.status(404).json({ error: 'Érvénytelen vagy lejárt munkamenet!' });
    }

    // Diák nézet: isStudentView = true (NINCS correct_answer és explanation!)
    const quiz = quizRepo.getQuizById(participant.quiz_id, true);

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
    const totalMax = quiz.total_points || 0;
    const percentage = totalMax > 0 ? Math.round((totalPoints / totalMax) * 100) : 0;
    const thresholds = JSON.parse(participant.grade_thresholds_json || '{"2":30,"3":55,"4":75,"5":90}');
    const grade = grader.calculateGrade(percentage, thresholds);
    const gradeText = grader.getGradeText(grade);

    res.json({
      participant: {
        id: participant.id,
        session_id: participant.session_id,
        student_name: participant.student_name,
        pc_number: participant.pc_number,
        team_color: participant.team_color,
        is_finished: participant.is_finished,
        deadline_at: participant.deadline_at,
        time_limit_min: participant.time_limit_min,
        session_status: participant.session_status,
        show_feedback_on_end: participant.show_feedback_on_end
      },
      quiz: {
        id: quiz.id,
        title: quiz.title,
        questions: orderedQuestions,
        total_points: quiz.total_points
      },
      results: {
        total_points: totalPoints,
        max_points: totalMax,
        percentage,
        grade,
        grade_text: gradeText
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Válasz beküldése
router.post('/student/submit-answer', (req, res) => {
  try {
    const token = req.body.session_token || req.headers['x-session-token'];
    const { question_id, submitted_answer, time_spent_sec } = req.body;

    if (!token) return res.status(401).json({ error: 'Munkamenet token hiányzik!' });
    if (!question_id) return res.status(400).json({ error: 'A kérdés azonosítója hiányzik!' });

    const participant = sessionRepo.getParticipantByToken(token);
    if (!participant) return res.status(404).json({ error: 'Érvénytelen munkamenet!' });

    const submission = sessionRepo.submitAnswer({
      participant_id: participant.id,
      question_id: Number(question_id),
      submitted_answer,
      time_spent_sec
    });

    // Értesítés a tanári mátrixnak valós időben
    const io = req.app.get('io');
    if (io) {
      const matrixData = sessionRepo.getLiveMatrixData(participant.session_id);
      io.to(`session_${participant.session_id}`).emit('matrix:updated', matrixData);
    }

    res.json({
      success: true,
      alreadySubmitted: submission.alreadySubmitted,
      eval_status: submission.answer.eval_status,
      is_correct: submission.answer.is_correct,
      points_earned: submission.answer.points_earned,
      isFinished: submission.isFinished,
      correctAnswer: submission.correctAnswer,
      explanation: submission.explanation
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fókuszvesztés rögzítése
router.post('/student/focus-lost', (req, res) => {
  try {
    const token = req.body.session_token || req.headers['x-session-token'];
    if (!token) return res.status(401).json({ error: 'Token hiányzik!' });

    const participant = sessionRepo.getParticipantByToken(token);
    if (!participant) return res.status(404).json({ error: 'Érvénytelen munkamenet!' });

    const updated = sessionRepo.recordFocusLost(participant.id);

    // Értesítés a tanári felületnek
    const io = req.app.get('io');
    if (io) {
      io.to(`session_${participant.session_id}`).emit('participant:focus_lost', {
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
      const matrixData = sessionRepo.getLiveMatrixData(participant.session_id);
      io.to(`session_${participant.session_id}`).emit('matrix:updated', matrixData);
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

router.get('/admin/backup', requireAdminAuth, (req, res) => {
  try {
    const archive = backup.createSystemBackupStream();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="ropdolgozat_backup_${timestamp}.zip"`);
    archive.pipe(res);
    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
