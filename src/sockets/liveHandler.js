const sessionRepo = require('../db/sessionRepo');
const presenceService = require('../services/presenceService');

/**
 * liveHandler.js - Socket.io eseménykezelő valós idejű órai kommunikációhoz és jelenléthez
 */
function initLiveHandler(io) {
  io.on('connection', (socket) => {
    // Feliratkozás egy adott órai dolgozat szobájára
    socket.on('join:session', ({ sessionId, role = 'student' }) => {
      if (!sessionId) return;
      const room = `session_${sessionId}`;
      socket.join(room);

      // Ha a tanári felület csatlakozik, azonnal elküldjük a legfrissebb élő mátrixot
      if (role === 'teacher') {
        try {
          const matrixData = sessionRepo.getLiveMatrixData(sessionId);
          if (matrixData) {
            socket.emit('matrix:updated', matrixData);
          }
        } catch (err) {
          console.error('Hiba a mátrix adatok küldésekor:', err.message);
        }
      }
    });

    // Kilépés a dolgozat szobájából
    socket.on('leave:session', ({ sessionId }) => {
      if (!sessionId) return;
      socket.leave(`session_${sessionId}`);
    });

    // Tanári Teacher Paced léptetés (együtt haladás a feladatokon)
    socket.on('teacher:next_question', ({ sessionId, questionIndex }) => {
      if (!sessionId || questionIndex === undefined) return;
      io.to(`session_${sessionId}`).emit('session:question_changed', { questionIndex });
    });

    // Tanári diák kizárás / feloldás esemény
    socket.on('teacher:kick_participant', ({ sessionId, participantId }) => {
      if (!sessionId || !participantId) return;
      try {
        const participant = sessionRepo.getParticipantById(participantId);
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
        io.to(`session_${sessionId}`).emit('participant:kicked', { participantId });
        const matrixData = sessionRepo.getLiveMatrixData(sessionId);
        io.to(`session_${sessionId}`).emit('matrix:updated', matrixData);
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

