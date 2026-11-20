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

    // 3. Integritás- és sémakompatibilitás-ellenőrzés a kicsomagolt adatbázison (Report 14 / 43.)
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
    } finally {
      testDb.close();
    }

    // 4. Jelenlegi adatbázis WAL ürítése és biztonsági snapshot készítése (.bak)
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (e) {
      console.warn('Figyelmeztetés a WAL checkpoint során mentés előtt:', e.message);
    }
    const backupDbPath = config.dbPath + '.bak';
    let backupCreated = false;
    if (fs.existsSync(config.dbPath)) {
      fs.copyFileSync(config.dbPath, backupDbPath);
      backupCreated = true;
    }

    try {
      // 5. Adatbáziskapcsolat lezárása a fájlcsere idejére
      db.__close();

      // 6. Új adatbázisfájl élesítése és elavult WAL/SHM takarítása
      fs.copyFileSync(extractedDbPath, config.dbPath);
      const walPath = config.dbPath + '-wal';
      const shmPath = config.dbPath + '-shm';
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

      // 7. Feltöltött képek visszaállítása
      let extractedUploads = path.join(tempExtractDir, 'data', 'uploads');
      if (!fs.existsSync(extractedUploads)) {
        extractedUploads = path.join(tempExtractDir, 'uploads');
      }
      if (fs.existsSync(extractedUploads)) {
        fs.mkdirSync(config.uploadsDir, { recursive: true });
        copyRecursiveSync(extractedUploads, config.uploadsDir);
      }

      // 8. Adatbázis újranyitása a Proxy-n keresztül (Hot-Reload)
      db.__reopen();

      return { success: true };
    } catch (restoreErr) {
      // Automatikus visszagörgetés a biztonsági másolatra (.bak rollback - Report 14 / 42.)
      console.error('Hiba a restore végrehajtása közben, automatikus visszagörgetés a .bak másolatra:', restoreErr.message);
      if (backupCreated && fs.existsSync(backupDbPath)) {
        try {
          fs.copyFileSync(backupDbPath, config.dbPath);
          const walPath = config.dbPath + '-wal';
          const shmPath = config.dbPath + '-shm';
          if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
          if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
        } catch {}
      }
      try {
        db.__reopen();
      } catch {}
      throw new Error(`A rendszer-visszaállítás meghiúsult, az eredeti állapot sikeresen visszaállítva: ${restoreErr.message}`);
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

