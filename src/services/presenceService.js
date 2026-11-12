const db = require('../db/init');

/**
 * presenceService.js - Valós idejű tantermi jelenlét- és ülésfoglalás-kezelő
 * 
 * Feladata: A diákok által a legördülő névsorból kiválasztott tanulók valós idejű
 * nyilvántartása a memóriában és az aktív dolgozatban csatlakozott diákokkal való
 * szinkronizálása, hogy a foglalt nevek a többi gépen azonnal inaktívvá váljanak.
 */

// Memóriabeli aktív foglalások: socketId -> { socketId, className, studentId, studentName, pcNumber }
const socketSeats = new Map();

/**
 * Adatbázisban lévő aktív dolgozat-résztvevők lekérdezése egy adott osztályhoz
 * @param {string} className - Az osztály neve (pl. "6.a")
 * @returns {string[]} A csatlakozott tanulók azonosítóinak listája
 */
function getDbOccupiedStudentIds(className) {
  try {
    const stmt = db.prepare(`
      SELECT DISTINCT p.student_id
      FROM participants p
      JOIN sessions s ON p.session_id = s.id
      JOIN students stu ON p.student_id = stu.id
      WHERE s.status = 'ACTIVE' AND stu.class_name = ?
    `);
    const rows = stmt.all(className);
    return rows.map(r => String(r.student_id));
  } catch (err) {
    console.error('Hiba az aktív résztvevők lekérésekor:', err.message);
    return [];
  }
}

/**
 * Egy adott osztály összes foglalt tanulójának lekérdezése (adatbázis + élő memóriabeli foglalások)
 * @param {string} className - Az osztály neve (pl. "6.a")
 * @returns {string[]} A foglalt tanulói azonosítók tömbje
 */
function getOccupiedStudentIds(className) {
  if (!className) return [];

  const occupiedSet = new Set(getDbOccupiedStudentIds(className));

  for (const seat of socketSeats.values()) {
    if (seat.className === className && seat.studentId) {
      occupiedSet.add(String(seat.studentId));
    }
  }

  return Array.from(occupiedSet);
}

/**
 * Tanuló nevének lefoglalása egy kliensgép (socket) által
 * @param {string} socketId - A Socket.io kliens azonosítója
 * @param {Object} seatInfo - { className, studentId, studentName, pcNumber }
 * @returns {Object} { className, occupiedStudentIds }
 */
function claimSeat(socketId, seatInfo) {
  if (!socketId || !seatInfo || !seatInfo.className || !seatInfo.studentId) {
    return null;
  }

  const { className, studentId, studentName, pcNumber } = seatInfo;
  const strStudentId = String(studentId);

  // 1. Ellenőrizzük, hogy aktív-e az adatbázisban (már belépett dolgozatba)
  const dbOccupied = getDbOccupiedStudentIds(className);
  if (dbOccupied.includes(strStudentId)) {
    return {
      success: false,
      message: 'Ez a tanuló már csatlakozott a dolgozathoz!',
      className,
      occupiedStudentIds: getOccupiedStudentIds(className)
    };
  }

  // 2. Ellenőrizzük, hogy egy másik gép (socket) már lefoglalta-e a memóriában
  for (const [existingSocketId, seat] of socketSeats.entries()) {
    if (existingSocketId !== socketId && seat.className === className && String(seat.studentId) === strStudentId) {
      return {
        success: false,
        message: 'Ezt a tanulót már kiválasztották egy másik gépen!',
        className,
        occupiedStudentIds: getOccupiedStudentIds(className)
      };
    }
  }

  // 3. Lefoglalás rögzítése a sockethez
  socketSeats.set(socketId, {
    socketId,
    className,
    studentId: strStudentId,
    studentName: studentName || '',
    pcNumber: pcNumber || null,
    claimedAt: Date.now()
  });

  return {
    success: true,
    className,
    occupiedStudentIds: getOccupiedStudentIds(className)
  };
}

/**
 * Kliensgép (socket) névfoglalásának feloldása (pl. vissza gomb, kilépés, kapcsolatbontás)
 * @param {string} socketId - A Socket.io kliens azonosítója
 * @returns {Object|null} { className, occupiedStudentIds } vagy null, ha nem volt foglalása
 */
function releaseSeat(socketId) {
  if (!socketId || !socketSeats.has(socketId)) {
    return null;
  }

  const seat = socketSeats.get(socketId);
  socketSeats.delete(socketId);

  return {
    className: seat.className,
    occupiedStudentIds: getOccupiedStudentIds(seat.className)
  };
}

/**
 * Adott tanuló foglalásának feloldása minden socketnél (pl. tanári kirúgás / gépváltás esetén)
 * @param {number|string} studentId - A tanuló azonosítója
 * @returns {string[]} Az érintett osztályok nevei
 */
function releaseStudent(studentId) {
  const strId = String(studentId);
  const affectedClasses = new Set();

  for (const [sId, seat] of socketSeats.entries()) {
    if (String(seat.studentId) === strId) {
      affectedClasses.add(seat.className);
      socketSeats.delete(sId);
    }
  }

  return Array.from(affectedClasses);
}

module.exports = {
  claimSeat,
  releaseSeat,
  releaseStudent,
  getOccupiedStudentIds
};
