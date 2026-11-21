const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');
const archiver = require('archiver');
const db = require('../db/init');
const config = require('../../config');

/**
 * backup.js - Teljes offline rendszermentés (.db + feltöltött képek -> .zip)
 * Használja az SQLite Online Backup API-t a garantáltan konzisztens pillanatképhez (Report 14 / 41.)
 */
async function createSystemBackupStream() {
  const tempSnapshotPath = path.join(path.dirname(config.dbPath), `backup_snapshot_${Date.now()}.db`);

  // 1. Konzisztens pillanatkép készítése (SQLite Online Backup API vagy WAL checkpoint)
  try {
    if (typeof db.backup === 'function') {
      await db.backup(tempSnapshotPath);
    } else {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {}
      fs.copyFileSync(config.dbPath, tempSnapshotPath);
    }
  } catch (err) {
    console.warn('Figyelmeztetés az SQLite Online Backup során, fallback checkpoint:', err.message);
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {}
    fs.copyFileSync(config.dbPath, tempSnapshotPath);
  }

  const archive = archiver('zip', { zlib: { level: 9 } });

  // 2. ropdolgozat.db hozzáadása a konzisztens snapshotból
  if (fs.existsSync(tempSnapshotPath)) {
    archive.file(tempSnapshotPath, { name: 'data/ropdolgozat.db' });
  } else if (fs.existsSync(config.dbPath)) {
    archive.file(config.dbPath, { name: 'data/ropdolgozat.db' });
  }

  // 3. Kizárólag a kvízek véglegesített képeinek (quizzes mappa) hozzáadása
  const quizzesDir = path.join(config.uploadsDir, 'quizzes');
  if (fs.existsSync(quizzesDir)) {
    archive.directory(quizzesDir, 'data/uploads/quizzes');
  }

  // Takarítás a stream befejeződésekor vagy hibájakor
  const cleanupSnapshot = () => {
    try {
      if (fs.existsSync(tempSnapshotPath)) fs.unlinkSync(tempSnapshotPath);
    } catch {}
  };

  archive.on('end', cleanupSnapshot);
  archive.on('close', cleanupSnapshot);
  archive.on('error', cleanupSnapshot);

  return archive;
}

/**
 * Mappastruktúra rekurzív másolása platformfüggetlenül
 */
function copyRecursiveSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursiveSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Biztonsági mentés visszaállítása (.zip vagy .okoskodobackup)
 */
function restoreSystemBackup(zipFilePath) {
  if (!fs.existsSync(zipFilePath)) {
    throw new Error('A megadott mentésfájl nem található!');
  }

  const tempExtractDir = path.join(path.dirname(config.dbPath), `temp_restore_${Date.now()}`);
  fs.mkdirSync(tempExtractDir, { recursive: true });

  try {
    // 1. Kicsomagolás (beépített bsdtar vagy powershell fallback)
    try {
      execSync(`tar -xf "${zipFilePath}" -C "${tempExtractDir}"`, { stdio: 'pipe' });
    } catch {
      execSync(`powershell -Command "Expand-Archive -Path '${zipFilePath}' -DestinationPath '${tempExtractDir}' -Force"`, { stdio: 'pipe' });
    }

    // 2. ropdolgozat.db felderítése a kicsomagolt állományban
    let extractedDbPath = path.join(tempExtractDir, 'data', 'ropdolgozat.db');
    if (!fs.existsSync(extractedDbPath)) {
      extractedDbPath = path.join(tempExtractDir, 'ropdolgozat.db');
    }
    if (!fs.existsSync(extractedDbPath)) {
      throw new Error('Érvénytelen mentésfájl: a csomag nem tartalmazza a ropdolgozat.db adatbázist!');
    }

    // 3. Előzetes alkalmazás- és formátumkompatibilitás-ellenőrzés a migráció ELŐTT (Report 19, 20 & 21)
    const preCheckDb = new Database(extractedDbPath, { readonly: true });
    try {
      db.validateDatabaseCompatibility(preCheckDb, { context: 'mentés visszaállítása', allowEmpty: false });
    } finally {
      preCheckDb.close();
    }

    // 4. Automatikus sémamigráció és triggermegújítás a korábbi mentésekhez az ideiglenes könyvtárban (Report 15, 17 & Report 18 / 1. pont)
    const migrateDb = new Database(extractedDbPath);
    try {
      db.applyPragmas(migrateDb);
      db.migrateDatabase(migrateDb);
      migrateDb.pragma('wal_checkpoint(TRUNCATE)');
    } finally {
      migrateDb.close();
    }

    // 5. Integritás- és sémakompatibilitás-ellenőrzés a kicsomagolt adatbázison (Report 14, 17, 18, 20 & Report 21 / 1. pont)
    const testDb = new Database(extractedDbPath, { readonly: true });
    try {
      const integrity = testDb.prepare('PRAGMA integrity_check').get();
      if (!integrity || integrity.integrity_check !== 'ok') {
        throw new Error('A mentésben lévő adatbázis integritása sérült (PRAGMA integrity_check failed)!');
      }
      const fkCheck = testDb.prepare('PRAGMA foreign_key_check').all();
      if (fkCheck.length > 0) {
        throw new Error('A mentésben lévő adatbázis idegen kulcsai sérültek (PRAGMA foreign_key_check failed)!');
      }
      const requiredTables = ['quizzes', 'questions', 'students', 'sessions', 'participants', 'answers'];
      const existingTables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
      for (const t of requiredTables) {
        if (!existingTables.includes(t)) {
          throw new Error(`Inkompatibilis mentés: a kötelező '${t}' tábla hiányzik az adatbázisból!`);
        }
      }
      // Valódi tanári és diák lekérdezések futtatása a migrált sémán (Report 21 / 1. pont)
      testDb.prepare(`
        SELECT 
          q.id, q.subject_id, q.folder_id, f.name AS folder_name, s.name AS subject_name,
          q.title, q.subject_grade, q.default_time_limit_min, q.locked_at, q.created_at, q.updated_at,
          COUNT(qst.id) AS question_count, COALESCE(SUM(qst.points), 0.0) AS total_points
        FROM quizzes q
        JOIN subjects s ON s.id = q.subject_id
        LEFT JOIN quiz_folders f ON f.id = q.folder_id
        LEFT JOIN questions qst ON qst.quiz_id = q.id
        WHERE COALESCE(q.is_deleted, 0) = 0
        GROUP BY q.id
        LIMIT 1
      `).all();

      testDb.prepare(`
        SELECT a.id, a.session_id, a.participant_id, a.question_id, a.submitted_answer,
               a.eval_status, a.is_correct, a.points_earned, a.original_points_earned,
               a.is_manually_overridden, a.overridden_at, a.time_spent_sec, a.answered_at
        FROM answers a
        LIMIT 1
      `).all();

      testDb.prepare(`
        SELECT p.id, p.session_id, p.student_id, p.pc_number, p.student_name, p.session_token,
               p.question_order_json, p.team_color, p.focus_lost_count, p.is_finished,
               p.joined_at, p.deadline_at, p.finished_at
        FROM participants p
        LIMIT 1
      `).all();

      const existingTriggers = testDb.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map(t => t.name);
      const requiredTriggers = ['trg_validate_answer_points_limit', 'trg_validate_answer_points_limit_update', 'trg_validate_answer_question'];
      for (const trg of requiredTriggers) {
        if (!existingTriggers.includes(trg)) {
          throw new Error(`Inkompatibilis mentés: a kötelező '${trg}' trigger hiányzik az adatbázisból!`);
        }
      }

      // Verzió ellenőrzése a sikeres migráció után (Report 20)
      const postAppId = testDb.pragma('application_id', { simple: true });
      const postUserVer = testDb.pragma('user_version', { simple: true });
      if (postAppId !== db.OKOS_APPLICATION_ID || postUserVer !== db.CURRENT_SCHEMA_VERSION) {
        throw new Error(`Inkompatibilis mentés: a migráció utáni alkalmazásazonosító vagy sémaverzió érvénytelen (appId: ${postAppId}, userVersion: ${postUserVer})!`);
      }
    } finally {
      testDb.close();
    }

    // 5. Jelenlegi adatbázis és uploads képek biztonsági snapshotjának elkészítése műveletenként egyedi könyvtárba (Report 18 / 2. pont)
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (e) {
      console.warn('Figyelmeztetés a WAL checkpoint során mentés előtt:', e.message);
    }

    const restoreOpId = `restore_op_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const backupSnapshotDir = path.join(path.dirname(config.dbPath), '_restore_snapshots', restoreOpId);
    fs.mkdirSync(backupSnapshotDir, { recursive: true });

    const backupDbPath = path.join(backupSnapshotDir, 'ropdolgozat_backup.db');
    let backupDbCreated = false;
    if (fs.existsSync(config.dbPath)) {
      fs.copyFileSync(config.dbPath, backupDbPath);
      backupDbCreated = true;
    }

    const backupUploadsDir = path.join(backupSnapshotDir, 'uploads');
    let backupUploadsCreated = false;
    if (fs.existsSync(config.uploadsDir)) {
      fs.mkdirSync(backupUploadsDir, { recursive: true });
      copyRecursiveSync(config.uploadsDir, backupUploadsDir);
      backupUploadsCreated = true;
    }

    let restoreSuccess = false;
    try {
      // 6. Adatbáziskapcsolat lezárása a fájlcsere idejére
      db.__close();

      // 7. Új adatbázisfájl élesítése és elavult WAL/SHM takarítása
      fs.copyFileSync(extractedDbPath, config.dbPath);
      const walPath = config.dbPath + '-wal';
      const shmPath = config.dbPath + '-shm';
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

      // 8. Feltöltött képek visszaállítása
      let extractedUploads = path.join(tempExtractDir, 'data', 'uploads');
      if (!fs.existsSync(extractedUploads)) {
        extractedUploads = path.join(tempExtractDir, 'uploads');
      }
      if (fs.existsSync(extractedUploads)) {
        fs.mkdirSync(config.uploadsDir, { recursive: true });
        copyRecursiveSync(extractedUploads, config.uploadsDir);
      }

      // 9. Adatbázis újranyitása a Proxy-n keresztül (Hot-Reload)
      db.__reopen();

      restoreSuccess = true;
      return { success: true };
    } catch (restoreErr) {
      // Automatikus atomi visszagörgetés mindkét komponensre (Adatbázis + Képek - Report 16-18)
      console.error('Hiba a restore végrehajtása közben, atomi visszagörgetés az eredeti állapotra:', restoreErr.message);
      let dbRollbackOk = false;
      let uploadsRollbackOk = false;
      let dbReopenOk = false;

      // 1. Adatbázis visszagörgetése
      if (backupDbCreated && fs.existsSync(backupDbPath)) {
        try {
          fs.copyFileSync(backupDbPath, config.dbPath);
          const walPath = config.dbPath + '-wal';
          const shmPath = config.dbPath + '-shm';
          if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
          if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
          dbRollbackOk = true;
        } catch (dbErr) {
          console.error('Kritikus hiba az adatbázis visszagörgetésekor:', dbErr);
        }
      } else {
        dbRollbackOk = true;
      }

      // 2. Képek visszagörgetése
      if (backupUploadsCreated && fs.existsSync(backupUploadsDir)) {
        try {
          if (fs.existsSync(config.uploadsDir)) {
            fs.rmSync(config.uploadsDir, { recursive: true, force: true });
          }
          fs.mkdirSync(config.uploadsDir, { recursive: true });
          copyRecursiveSync(backupUploadsDir, config.uploadsDir);
          uploadsRollbackOk = true;
        } catch (uErr) {
          console.error('Kritikus hiba a képek visszagörgetésekor:', uErr);
        }
      } else {
        uploadsRollbackOk = true;
      }

      // 3. Adatbázis újranyitása
      try {
        db.__reopen();
        dbReopenOk = true;
      } catch (openErr) {
        console.error('Hiba az adatbázis újranyitásakor rollback után:', openErr);
      }

      const isFullyRecovered = dbRollbackOk && uploadsRollbackOk && dbReopenOk;

      if (isFullyRecovered) {
        // Csak akkor takarítjuk a mentést, ha a visszagörgetés 100%-ban sikeres volt!
        try { fs.rmSync(backupSnapshotDir, { recursive: true, force: true }); } catch {}
        throw new Error(`A rendszer-visszaállítás meghiúsult, az eredeti állapot (adatbázis és feltöltött képek) sikeresen visszaállítva: ${restoreErr.message}`);
      } else {
        // Ha a visszagörgetés is hibát szenvedett, a biztonsági mentési könyvtárat SZIGORÚAN MEGŐRIZZÜK a lemezen!
        try {
          fs.writeFileSync(path.join(backupSnapshotDir, 'recovery_meta.json'), JSON.stringify({
            restoreOpId,
            failedAt: new Date().toISOString(),
            error: restoreErr.message,
            dbPreserved: backupDbCreated,
            uploadsPreserved: backupUploadsCreated
          }, null, 2));
        } catch {}

        const preservedInfo = [];
        if (backupDbCreated && fs.existsSync(backupDbPath)) preservedInfo.push(`Adatbázis: ${backupDbPath}`);
        if (backupUploadsCreated && fs.existsSync(backupUploadsDir)) preservedInfo.push(`Képek: ${backupUploadsDir}`);
        
        throw new Error(`Kritikus hiba: A rendszer-visszaállítás és a visszagörgetés is meghiúsult! A biztonsági másolatok megőrizve a lemezen (${preservedInfo.join(', ')}). Hiba: ${restoreErr.message}`);
      }
    } finally {
      if (restoreSuccess) {
        // Sikeres művelet esetén kizárólag a saját mentési könyvtárat takarítjuk el (Report 18 / 2. pont)
        try {
          fs.rmSync(backupSnapshotDir, { recursive: true, force: true });
        } catch {}
      }
    }
  } finally {
    try {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    } catch {}
  }
}

module.exports = {
  createSystemBackupStream,
  restoreSystemBackup
};

