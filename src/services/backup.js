const fs = require('fs');
const path = require('path');
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

  // 3. uploads mappa hozzáadása (ha vannak feltöltött képek)
  if (fs.existsSync(config.uploadsDir)) {
    archive.directory(config.uploadsDir, 'data/uploads');
  }

  return archive;
}

module.exports = {
  createSystemBackupStream
};

