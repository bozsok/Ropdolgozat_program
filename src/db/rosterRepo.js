const db = require('./init');

/**
 * rosterRepo.js - Osztálynévsorok és tanulók adatbázis műveletei
 */

/**
 * Elérhető osztályok listázása névsorrendben
 */
function getClasses(includeLowerGrades = false) {
  const stmt = db.prepare(`
    SELECT DISTINCT class_name 
    FROM students 
    ORDER BY class_name COLLATE NOCASE ASC
  `);
  let all = stmt.all().map(r => r.class_name);
  all.sort((a, b) => a.localeCompare(b, 'hu', { numeric: true }));

  if (includeLowerGrades) return all;

  // 1–2. évfolyam elrejtése (a Digitális kultúra tantárgy a 3. évfolyamon kezdődik)
  return all.filter(className => {
    const match = String(className).match(/^(\d+)/);
    if (match) {
      const grade = parseInt(match[1], 10);
      return grade >= 3;
    }
    return true;
  });
}

/**
 * Egy adott osztály tanulóinak lekérése névsorrendben (MTA magyar ábécérend)
 */
function getStudentsByClass(className) {
  const stmt = db.prepare(`
    SELECT id, class_name, student_name, created_at
    FROM students
    WHERE class_name = ?
    ORDER BY student_name COLLATE NOCASE ASC
  `);
  const rows = stmt.all(className);
  return rows.sort((a, b) => a.student_name.localeCompare(b.student_name, 'hu'));
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

    // Töröljük azokat, akik nincsenek az új listában (a korábbi dolgozatok adatai sértetlenek maradnak)
    const existing = db.prepare('SELECT id, student_name FROM students WHERE class_name = ?').all(trimmedClass);
    const deleteStmt = db.prepare('DELETE FROM students WHERE id = ?');

    for (const row of existing) {
      if (!validNames.includes(row.student_name)) {
        deleteStmt.run(row.id);
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

/**
 * Az összes tanuló és osztály lekérése (exportáláshoz)
 */
function getAllStudentsWithClass() {
  const stmt = db.prepare(`
    SELECT id, class_name, student_name, created_at
    FROM students
    ORDER BY class_name COLLATE NOCASE ASC, student_name COLLATE NOCASE ASC
  `);
  return stmt.all();
}

/**
 * Tömeges tanuló importálás (KRÉTA Excel / CSV alapján)
 * Szigorúan az importált fájlban szereplő osztályok hivatalos névsorát szinkronizálja
 * @param {Array<{ class_name: string, student_name: string }>} studentsList
 */
function importRosterStudents(studentsList, replaceExisting = true) {
  if (!Array.isArray(studentsList) || studentsList.length === 0) {
    throw new Error('Az importálandó lista üres vagy érvénytelen!');
  }

  // Osztályonként csoportosítjuk az importálandó tanulókat
  const classMap = new Map();
  for (const item of studentsList) {
    const cls = String(item.class_name || '').trim();
    const name = String(item.student_name || '').trim();
    if (cls && name) {
      if (!classMap.has(cls)) {
        classMap.set(cls, new Set());
      }
      classMap.get(cls).add(name);
    }
  }

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO students (class_name, student_name)
    VALUES (?, ?)
  `);
  const deleteStmt = db.prepare('DELETE FROM students WHERE id = ?');

  let insertedCount = 0;

  const tx = db.transaction(() => {
    for (const [cls, namesSet] of classMap.entries()) {
      // 1. Beszúrjuk az új tanulókat
      for (const name of namesSet) {
        const res = insertStmt.run(cls, name);
        if (res.changes > 0) {
          insertedCount++;
        }
      }

      // 2. Töröljük azokat, akik nincsenek a most importált hivatalos listában
      // (a korábbi dolgozatok adatai az ON DELETE SET NULL miatt 100%-ban megmaradnak)
      if (replaceExisting) {
        const existing = db.prepare('SELECT id, student_name FROM students WHERE class_name = ?').all(cls);
        for (const row of existing) {
          if (!namesSet.has(row.student_name)) {
            deleteStmt.run(row.id);
          }
        }
      }
    }
  });

  tx();

  return {
    insertedCount,
    classesCount: classMap.size,
    classes: Array.from(classMap.keys())
  };
}

module.exports = {
  getClasses,
  getStudentsByClass,
  getStudentById,
  addStudent,
  removeStudent,
  saveClassRoster,
  deleteClass,
  getAllStudentsWithClass,
  importRosterStudents
};

