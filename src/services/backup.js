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

    // 3. Automatikus sémamigráció és triggermegújítás a korábbi mentésekhez az ideiglenes könyvtárban (Report 15, 17 & Report 18 / 1. pont)
    const migrateDb = new Database(extractedDbPath);
    try {
      db.applyPragmas(migrateDb);
      db.migrateDatabase(migrateDb);
      migrateDb.pragma('wal_checkpoint(TRUNCATE)');
    } finally {
      migrateDb.close();
    }

    // 4. Integritás- és sémakompatibilitás-ellenőrzés a kicsomagolt adatbázison (Report 14 / 43., Report 17 / 2.1 & Report 18 / 1. pont)
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
      // Tesztlekérdezések a v1.28+ sémakompatibilitás és a triggerek meglétének igazolására
      testDb.prepare("SELECT q.id FROM quizzes q WHERE COALESCE(q.is_deleted, 0) = 0 LIMIT 1").all();
      const existingTriggers = testDb.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map(t => t.name);
      const requiredTriggers = ['trg_validate_answer_points_limit', 'trg_validate_answer_points_limit_update', 'trg_validate_answer_question'];
      for (const trg of requiredTriggers) {
        if (!existingTriggers.includes(trg)) {
          throw new Error(`Inkompatibilis mentés: a kötelező '${trg}' trigger hiányzik az adatbázisból!`);
        }
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

