const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');
const archiver = require('archiver');
const db = require('../db/init');
const config = require('../../config');

/**
 * backup.js - Teljes offline rendszermentés (.db + feltöltött képek -> .zip)
 */
function createSystemBackupStream() {
  // 1. WAL fájl ürítése és szinkronizálása a fő adatbázisfájlba
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (err) {
    console.warn('Figyelmeztetés a WAL checkpoint során:', err.message);
  }

  const archive = archiver('zip', { zlib: { level: 9 } });

  // 2. ropdolgozat.db hozzáadása
  if (fs.existsSync(config.dbPath)) {
    archive.file(config.dbPath, { name: 'data/ropdolgozat.db' });
  }

  // 3. Kizárólag a kvízek véglegesített képeinek (quizzes mappa) hozzáadása
  const quizzesDir = path.join(config.uploadsDir, 'quizzes');
  if (fs.existsSync(quizzesDir)) {
    archive.directory(quizzesDir, 'data/uploads/quizzes');
  }

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

    // 3. Integritás-ellenőrzés a kicsomagolt adatbázison
    const testDb = new Database(extractedDbPath, { readonly: true });
    try {
      const integrity = testDb.prepare('PRAGMA integrity_check').get();
      if (!integrity || integrity.integrity_check !== 'ok') {
        throw new Error('A mentésben lévő adatbázis integritása sérült!');
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
    if (fs.existsSync(config.dbPath)) {
      fs.copyFileSync(config.dbPath, backupDbPath);
    }

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

