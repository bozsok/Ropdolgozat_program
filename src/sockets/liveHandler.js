const sessionRepo = require('../db/sessionRepo');

/**
 * liveHandler.js - Socket.io eseménykezelő valós idejű órai kommunikációhoz
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
        sessionRepo.unlockParticipant(participantId);
        io.to(`session_${sessionId}`).emit('participant:kicked', { participantId });
        const matrixData = sessionRepo.getLiveMatrixData(sessionId);
        io.to(`session_${sessionId}`).emit('matrix:updated', matrixData);
        io.emit('badges:updated', sessionRepo.getActiveSessions());
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('disconnect', () => {
      // Kapcsolat bontása
    });
  });
}

module.exports = initLiveHandler;

