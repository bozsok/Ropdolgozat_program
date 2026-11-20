const sessionRepo = require('../db/sessionRepo');
const presenceService = require('../services/presenceService');
const auth = require('../middleware/auth');
const config = require('../../config');

/**
 * liveHandler.js - Socket.io eseménykezelő valós idejű órai kommunikációhoz és jelenléthez
 */

function getAdminTokenFromSocket(socket) {
  const cookieHeader = socket.request && socket.request.headers ? socket.request.headers.cookie : '';
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|; )' + config.cookieName + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function initLiveHandler(io) {
  io.on('connection', (socket) => {
    // Feliratkozás egy adott órai dolgozat szobájára (elkülönített tanári, kivetítői és diák szoba - Report 15 / 1. fejezet)
    socket.on('join:session', ({ sessionId, role = 'student', token }) => {
      if (!sessionId) return;
      if (role === 'teacher') {
        const adminToken = getAdminTokenFromSocket(socket);
        if (!auth.isValidToken(adminToken)) {
          socket.emit('error', { message: 'A tanári szobához érvényes tanári bejelentkezés szükséges!' });
          return;
        }
        socket.join(`session_${sessionId}_teacher`);
        try {
          const matrixData = sessionRepo.getLiveMatrixData(sessionId);
          if (matrixData) {
            socket.emit('matrix:updated', matrixData);
          }
        } catch (err) {
          console.error('Hiba a mátrix adatok küldésekor:', err.message);
        }
      } else if (role === 'projector') {
        // Másodlagos kivetítő: csak anonimizált, kulcsmentes adatokat kap!
        socket.join(`session_${sessionId}_projector`);
        try {
          const projectorData = sessionRepo.getProjectorData(sessionId);
          if (projectorData) {
            socket.emit('matrix:updated', projectorData);
          }
        } catch (err) {
          console.error('Hiba a kivetítő adatok küldésekor:', err.message);
        }
      } else {
        // Diák szobához csatlakozás: token szigorú ellenőrzése az adott dolgozathoz (Report 16 & Report 17 / 3. fejezet)
        if (token) {
          try {
            const participant = sessionRepo.getParticipantByToken(token);
            if (participant && String(participant.session_id) === String(sessionId)) {
              socket.join(`session_${sessionId}_student`);
              socket.join(`participant_${participant.id}`);
              return;
            }
          } catch {}
        }
        socket.emit('error', { message: 'A diák szobához érvényes diák munkamenet-token szükséges!' });
      }
    });

    // Kilépés a dolgozat szobájából
    socket.on('leave:session', ({ sessionId }) => {
      if (!sessionId) return;
      socket.leave(`session_${sessionId}_teacher`);
      socket.leave(`session_${sessionId}_projector`);
      socket.leave(`session_${sessionId}_student`);
    });

    // Tanári Teacher Paced léptetés (együtt haladás a feladatokon, védett szerveroldali ellenőrzéssel)
    socket.on('teacher:next_question', ({ sessionId, questionIndex }) => {
      if (!sessionId || questionIndex === undefined) return;
      const adminToken = getAdminTokenFromSocket(socket);
      if (!auth.isValidToken(adminToken)) {
        socket.emit('error', { message: 'A léptetéshez tanári jogosultság szükséges!' });
        return;
      }
      sessionRepo.updateCurrentQuestionIndex(sessionId, questionIndex);
      io.to(`session_${sessionId}_student`).emit('session:question_changed', { questionIndex });
      io.to(`session_${sessionId}_teacher`).emit('session:question_changed', { questionIndex });
      io.to(`session_${sessionId}_projector`).emit('session:question_changed', { questionIndex });
    });

    // Tanári diák kizárás / feloldás esemény (védett tanári munkamenet vizsgálattal)
    socket.on('teacher:kick_participant', ({ sessionId, participantId }) => {
      if (!sessionId || !participantId) return;
      const adminToken = getAdminTokenFromSocket(socket);
      if (!auth.isValidToken(adminToken)) {
        socket.emit('error', { message: 'A diák feloldásához tanári jogosultság szükséges!' });
        return;
      }
      try {
        const participant = sessionRepo.getParticipantById ? sessionRepo.getParticipantById(participantId) : null;
        sessionRepo.unlockParticipant(participantId);
        if (participant && participant.student_id) {
          const affectedClasses = presenceService.releaseStudent(participant.student_id);
          affectedClasses.forEach(className => {
            io.emit('students:occupied_updated', {
              className,
              occupiedStudentIds: presenceService.getOccupiedStudentIds(className)
            });
          });
        }
        io.to(`session_${sessionId}_student`).emit('participant:kicked', { participantId });
        io.to(`session_${sessionId}_teacher`).emit('participant:kicked', { participantId });
        const matrixData = sessionRepo.getLiveMatrixData(sessionId);
        io.to(`session_${sessionId}_teacher`).emit('matrix:updated', matrixData);
        const projectorData = sessionRepo.getProjectorData(sessionId);
        io.to(`session_${sessionId}_projector`).emit('matrix:updated', projectorData);
        io.emit('badges:updated', sessionRepo.getActiveSessions());
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // =========================================================================
    // VALÓS IDEJŰ NÉVFOGLALÁS ÉS JELENLÉT (AKÁR TESZT NÉLKÜL IS)
    // =========================================================================

    // Diák név kiválasztása a legördülőből (lefoglalás)
    socket.on('student:claim_name', (data, callback) => {
      const result = presenceService.claimSeat(socket.id, data);
      if (result) {
        if (result.success) {
          io.emit('students:occupied_updated', {
            className: result.className,
            occupiedStudentIds: result.occupiedStudentIds
          });
        }
        if (typeof callback === 'function') {
          callback(result);
        }
      }
    });

    // Diák név feloldása (visszalépés, másik név választása)
    socket.on('student:release_name', (callback) => {
      const result = presenceService.releaseSeat(socket.id);
      if (result) {
        io.emit('students:occupied_updated', result);
        if (typeof callback === 'function') {
          callback({ success: true });
        }
      } else {
        if (typeof callback === 'function') {
          callback({ success: true });
        }
      }
    });

    // Aktuálisan foglalt diákok lekérdezése egy osztályhoz
    socket.on('student:get_occupied', ({ className }) => {
      if (!className) return;
      socket.emit('students:occupied_updated', {
        className,
        occupiedStudentIds: presenceService.getOccupiedStudentIds(className)
      });
    });

    // Kapcsolat bontása (ablak bezárása, gép leállítása -> foglalás azonnali feloldása)
    socket.on('disconnect', () => {
      const result = presenceService.releaseSeat(socket.id);
      if (result) {
        io.emit('students:occupied_updated', result);
      }
    });
  });
}

module.exports = initLiveHandler;

