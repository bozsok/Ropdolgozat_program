const db = require('./init');

/**
 * rosterRepo.js - Osztálynévsorok és tanulók adatbázis műveletei
 */

/**
 * Elérhető osztályok listázása névsorrendben
 */
function getClasses() {
  const stmt = db.prepare(`
    SELECT DISTINCT class_name 
    FROM students 
    ORDER BY class_name COLLATE NOCASE ASC
  `);
  return stmt.all().map(r => r.class_name);
}

/**
 * Egy adott osztály tanulóinak lekérése névsorrendben
 */
function getStudentsByClass(className) {
  const stmt = db.prepare(`
    SELECT id, class_name, student_name, created_at
    FROM students
    WHERE class_name = ?
    ORDER BY student_name COLLATE NOCASE ASC
  `);
  return stmt.all(className);
}

/**
 * Egyetlen diák lekérése azonosító alapján
 */
function getStudentById(studentId) {
  const stmt = db.prepare(`
    SELECT id, class_name, student_name, created_at
    FROM students
    WHERE id = ?
  `);
  return stmt.get(studentId);
}

/**
 * Új tanuló rögzítése egy osztályhoz
 */
function addStudent(className, studentName) {
  const trimmedClass = String(className).trim();
  const trimmedName = String(studentName).trim();
  if (!trimmedClass || !trimmedName) {
    throw new Error('Az osztály és a tanuló neve nem lehet üres!');
  }

  const stmt = db.prepare(`
    INSERT INTO students (class_name, student_name)
    VALUES (?, ?)
  `);
  const result = stmt.run(trimmedClass, trimmedName);
  return { id: result.lastInsertRowid, class_name: trimmedClass, student_name: trimmedName };
}

/**
 * Tanuló törlése névsorból
 */
function removeStudent(studentId) {
  const stmt = db.prepare('DELETE FROM students WHERE id = ?');
  const result = stmt.run(studentId);
  return result.changes > 0;
}

/**
 * Teljes osztálynévsor mentése / felülírása tranzakcióban
 * (A korábbi dolgozatokhoz kapcsolódó tanulókat megvédi az ON DELETE RESTRICT)
 */
function saveClassRoster(className, studentNames) {
  const trimmedClass = String(className).trim();
  if (!trimmedClass) throw new Error('Az osztálynév kötelező!');

  const validNames = Array.from(
    new Set(studentNames.map(n => String(n).trim()).filter(Boolean))
  );

  const tx = db.transaction(() => {
    // Beszúrjuk az új neveket (INSERT OR IGNORE)
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO students (class_name, student_name)
      VALUES (?, ?)
    `);

    for (const name of validNames) {
      insertStmt.run(trimmedClass, name);
    }

    // Töröljük azokat, akik nincsenek az új listában, és nincs hozzájuk kapcsolódó dolgozat
    const existing = db.prepare('SELECT id, student_name FROM students WHERE class_name = ?').all(trimmedClass);
    const deleteStmt = db.prepare('DELETE FROM students WHERE id = ?');

    for (const row of existing) {
      if (!validNames.includes(row.student_name)) {
        try {
          deleteStmt.run(row.id);
        } catch {
          // Ha már szerepel dolgozatban (RESTRICT), nem töröljük ki a történeti hitelesség miatt
        }
      }
    }
  });

  tx();
  return getStudentsByClass(trimmedClass);
}

/**
 * Egy osztály összes tanulójának törlése
 */
function deleteClass(className) {
  const stmt = db.prepare('DELETE FROM students WHERE class_name = ?');
  const result = stmt.run(className);
  return result.changes;
}

module.exports = {
  getClasses,
  getStudentsByClass,
  getStudentById,
  addStudent,
  removeStudent,
  saveClassRoster,
  deleteClass
};

