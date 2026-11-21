const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const config = require('../../config');
const packageJson = require('../../package.json');

/**
 * DiagnosticsService - Helyi aszinkron diagnosztikai és eseménynaplózó alrendszer
 * Specifikáció: Source/Beepitesi_terv_01.md, Source/Pontositasi_terv_01.md,
 *               Source/Beepitesi_terv_01_vegrehajtasi_terv_01.md (v1.2), Source/dh_01.md
 */

const SERVER_ALLOWED_EVENTS = new Set([
  'server.started',
  'server.stopping',
  'answer.received',
  'answer.persisted',
  'answer.rejected',
  'answer.failed',
  'http.finished',
  'http.closed_early'
]);

const CLIENT_EVENT_SPECS = {
  'answer.acknowledged': {
    required: ['eventId', 'requestId', 'operationId'],
    allowedKeys: new Set(['event', 'eventId', 'requestId', 'operationId', 'clientAt', 'outcome', 'httpStatus', 'durationMs']),
    allowedOutcomes: new Set(['ok']),
    allowedReasonCodes: null,
    httpStatusRange: [200, 299]
  },
  'answer.response_error': {
    required: ['eventId', 'requestId', 'operationId'],
    allowedKeys: new Set(['event', 'eventId', 'requestId', 'operationId', 'clientAt', 'outcome', 'reasonCode', 'httpStatus', 'durationMs']),
    allowedOutcomes: new Set(['error']),
    allowedReasonCodes: new Set(['HTTP_ERROR', 'INVALID_JSON', 'INVALID_RESPONSE_SCHEMA']),
    httpStatusRange: [100, 599]
  },
  'answer.no_ack': {
    required: ['eventId', 'requestId', 'operationId'],
    allowedKeys: new Set(['event', 'eventId', 'requestId', 'operationId', 'clientAt', 'outcome', 'reasonCode', 'durationMs']),
    allowedOutcomes: new Set(['no_ack']),
    allowedReasonCodes: new Set(['NETWORK_ERROR', 'TIMEOUT']),
    httpStatusRange: null
  },
  'socket.disconnected': {
    required: ['eventId'],
    allowedKeys: new Set(['event', 'eventId', 'clientAt', 'reasonCode']),
    allowedOutcomes: null,
    allowedReasonCodes: new Set([
      'IO_SERVER_DISCONNECT',
      'IO_CLIENT_DISCONNECT',
      'PING_TIMEOUT',
      'TRANSPORT_CLOSE',
      'TRANSPORT_ERROR',
      'PARSE_ERROR',
      'UNKNOWN_DISCONNECT_REASON'
    ]),
    httpStatusRange: null
  },
  'socket.reconnected': {
    required: ['eventId'],
    allowedKeys: new Set(['event', 'eventId', 'clientAt']),
    allowedOutcomes: null,
    allowedReasonCodes: null,
    httpStatusRange: null
  },
  'socket.connect_error': {
    required: ['eventId'],
    allowedKeys: new Set(['event', 'eventId', 'clientAt', 'reasonCode']),
    allowedOutcomes: null,
    allowedReasonCodes: new Set(['CONNECT_ERROR', 'TRANSPORT_ERROR', 'TIMEOUT', 'UNKNOWN_CONNECT_ERROR']),
    httpStatusRange: null
  }
};

const ALLOWED_SERVER_OUTCOMES = new Set(['saved', 'duplicate', 'ok', 'error', 'no_ack']);
const ALLOWED_ROUTES = new Set([
  'student.submit_answer',
  'student.join',
  'student.session_data',
  'admin.start_session',
  'admin.start_race',
  'admin.finish_session',
  'admin.export_results'
]);

const HEX_32_REGEX = /^[a-f0-9]{32}$/i;
const UTC_ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const LOG_FILE_REGEX = /^diagnostics-\d{4}-\d{2}-\d{2}(\.\d+)?\.log$/;

function isValidUtcIsoTimestamp(value) {
  if (typeof value !== 'string' || value.length > 30 || !UTC_ISO_REGEX.test(value)) {
    return false;
  }
  const ms = Date.parse(value);
  return !Number.isNaN(ms);
}

/**
 * 1. RingBufferQueue - Korlátozott kapacitású, non-blocking memóriasor (függő/in-flight követéssel)
 */
class RingBufferQueue {
  constructor(maxSize = 2048, maxBytes = 2097152) {
    this.maxSize = maxSize;
    this.maxBytes = maxBytes;
    this.queue = [];
    this.currentBytes = 0;
    this.inFlightCount = 0;
    this.inFlightBytes = 0;
    this.droppedEventsCount = 0;
    this.rejectedBatchEventsCount = 0;
  }

  canAccept(entriesCount, bytesCount) {
    return (
      this.queue.length + this.inFlightCount + entriesCount <= this.maxSize &&
      this.currentBytes + this.inFlightBytes + bytesCount <= this.maxBytes
    );
  }

  enqueueBatch(entriesWithBytes) {
    let totalBytes = 0;
    for (const item of entriesWithBytes) {
      totalBytes += item.bytes;
    }

    if (!this.canAccept(entriesWithBytes.length, totalBytes)) {
      this.rejectedBatchEventsCount += entriesWithBytes.length;
      return false;
    }

    for (const item of entriesWithBytes) {
      this.queue.push(item);
      this.currentBytes += item.bytes;
    }
    return true;
  }

  enqueueSingle(entry, bytes) {
    if (!this.canAccept(1, bytes)) {
      this.droppedEventsCount += 1;
      return false;
    }
    this.queue.push({ entry, bytes });
    this.currentBytes += bytes;
    return true;
  }

  peek() {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  shiftToInFlight() {
    if (this.queue.length === 0) return null;
    const item = this.queue.shift();
    this.currentBytes = Math.max(0, this.currentBytes - item.bytes);
    this.inFlightCount += 1;
    this.inFlightBytes += item.bytes;
    return item;
  }

  completeInFlight(item) {
    if (!item) return;
    this.inFlightCount = Math.max(0, this.inFlightCount - 1);
    this.inFlightBytes = Math.max(0, this.inFlightBytes - item.bytes);
  }

  returnInFlightToFront(item) {
    if (!item) return;
    this.inFlightCount = Math.max(0, this.inFlightCount - 1);
    this.inFlightBytes = Math.max(0, this.inFlightBytes - item.bytes);
    this.queue.unshift(item);
    this.currentBytes += item.bytes;
  }

  size() {
    return this.queue.length;
  }

  totalPendingCount() {
    return this.queue.length + this.inFlightCount;
  }

  bytes() {
    return this.currentBytes;
  }

  totalPendingBytes() {
    return this.currentBytes + this.inFlightBytes;
  }
}

/**
 * 2. DeduplicationCache - Kliens események deduplikációja FIFO gyűrűben
 */
class DeduplicationCache {
  constructor(maxEntries = 1024, ttlMs = 600000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.map = new Map();
  }

  has(eventId) {
    if (!eventId) return false;
    const ts = this.map.get(eventId);
    if (!ts) return false;
    if (Date.now() - ts > this.ttlMs) {
      this.map.delete(eventId);
      return false;
    }
    return true;
  }

  add(eventId) {
    if (!eventId) return;
    if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey) this.map.delete(oldestKey);
    }
    this.map.set(eventId, Date.now());
  }

  cleanExpired() {
    const now = Date.now();
    for (const [key, ts] of this.map.entries()) {
      if (now - ts > this.ttlMs) {
        this.map.delete(key);
      }
    }
  }
}

/**
 * 3. SlidingWindowRateLimiter - Memóriabeli sebességkorlátozó
 */
class SlidingWindowRateLimiter {
  constructor(participantLimit = 6, globalLimit = 300, windowMs = 60000) {
    this.participantLimit = participantLimit;
    this.globalLimit = globalLimit;
    this.windowMs = windowMs;
    this.participantCounts = new Map();
    this.globalTimestamps = [];
  }

  checkAndIncrement(participantKey) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    while (this.globalTimestamps.length > 0 && this.globalTimestamps[0] < windowStart) {
      this.globalTimestamps.shift();
    }
    if (this.globalTimestamps.length >= this.globalLimit) {
      return false;
    }

    if (participantKey) {
      let pTimes = this.participantCounts.get(participantKey) || [];
      pTimes = pTimes.filter(t => t >= windowStart);
      if (pTimes.length >= this.participantLimit) {
        this.participantCounts.set(participantKey, pTimes);
        return false;
      }
      pTimes.push(now);
      this.participantCounts.set(participantKey, pTimes);
    }

    this.globalTimestamps.push(now);

    if (this.participantCounts.size > 500) {
      for (const [k, v] of this.participantCounts.entries()) {
        const fresh = v.filter(t => t >= windowStart);
        if (fresh.length === 0) this.participantCounts.delete(k);
        else this.participantCounts.set(k, fresh);
      }
    }

    return true;
  }
}

/**
 * Útvonal fizikai feloldása (symlink és Windows junction feloldással, nem létező célnál legközelebbi szülővel)
 */
function resolvePhysicalPath(targetPath) {
  const normalized = path.normalize(path.resolve(targetPath));
  if (fs.existsSync(normalized)) {
    return fs.realpathSync(normalized);
  }
  let curr = normalized;
  const missingParts = [];
  while (!fs.existsSync(curr)) {
    const parent = path.dirname(curr);
    if (parent === curr) break;
    missingParts.unshift(path.basename(curr));
    curr = parent;
  }
  if (fs.existsSync(curr)) {
    const resolvedParent = fs.realpathSync(curr);
    return path.join(resolvedParent, ...missingParts);
  }
  return normalized;
}

/**
 * Szegmensalapú útvonal-tartalmazás ellenőrzése (Windows kis/nagybetű érzéketlenséggel)
 */
function normalizeForCompare(p) {
  const norm = path.normalize(p);
  return process.platform === 'win32' ? norm.toLowerCase() : norm;
}

function isEqualOrSubPath(childPath, parentPath) {
  const normChild = normalizeForCompare(childPath);
  const normParent = normalizeForCompare(parentPath);
  if (normChild === normParent) return true;
  const rel = path.relative(normParent, normChild);
  if (!rel) return true;
  if (path.isAbsolute(rel)) return false;
  const firstSegment = rel.split(path.sep)[0];
  return firstSegment !== '..';
}

function pathsOverlap(pathA, pathB) {
  return isEqualOrSubPath(pathA, pathB) || isEqualOrSubPath(pathB, pathA);
}

/**
 * 4. DiagnosticsFileWriter - Egyetlen sorosított, drain-vezérelt aszinkron Stream Író és Útvonal-validátor
 */
class DiagnosticsFileWriter {
  constructor(options = {}) {
    this.rawDir = options.dir || config.diagnosticsDir;
    this.dir = this.rawDir;
    this.customConfig = options.config || config;
    this.maxFileSizeBytes = options.maxFileSizeBytes || config.diagnosticsMaxFileSizeBytes || 5242880;
    this.maxTotalSizeBytes = options.maxTotalSizeBytes || config.diagnosticsMaxTotalSizeBytes || 26214400;
    this.retentionDays = options.retentionDays || config.diagnosticsRetentionDays || 7;
    this.recoveryIntervalMs = options.recoveryIntervalMs !== undefined ? options.recoveryIntervalMs : 15000;
    this.streamFactory = options.streamFactory || ((filePath) => fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' }));

    this.isConfigurationValid = false;
    this.configurationErrorReason = null;
    this.isDegraded = false;
    this.lastErrorCode = null;
    this.nextRecoveryAttemptAt = 0;
    this.lastWarnTime = 0;

    this.activeStream = null;
    this.activeFilePath = null;
    this.activeFileDateStr = null;
    this.activeFileBytes = 0;
    this.forceNewFileOnNextOpen = false;
    this.streamFailed = false;
  }

  /**
   * 4. tétel (DH 01) szerinti teljes fizikai útvonal-ellenőrzés
   */
  validateDirectory(targetDir = this.rawDir, customConfig = this.customConfig) {
    try {
      const resolvedTarget = resolvePhysicalPath(targetDir);

      // Ha a cél már létezik, kötelezően könyvtárnak kell lennie (nem lehet rendes fájl!)
      if (fs.existsSync(resolvedTarget)) {
        const st = fs.statSync(resolvedTarget);
        if (!st.isDirectory()) {
          this.isConfigurationValid = false;
          this.configurationErrorReason = 'A diagnosztikai cél már létezik, de nem könyvtár!';
          return { valid: false, reason: this.configurationErrorReason };
        }
      }

      const publicResolved = resolvePhysicalPath(customConfig.publicDir);
      const uploadsResolved = resolvePhysicalPath(customConfig.uploadsDir);
      const dbDirResolved = resolvePhysicalPath(path.dirname(path.resolve(customConfig.dbPath)));
      const restoreSnapshotsLogical = path.join(dbDirResolved, '_restore_snapshots');
      const restoreSnapshotsResolved = resolvePhysicalPath(restoreSnapshotsLogical);

      // 1. Webgyökér (publicDir): mindkét irányú átfedés tiltott
      if (pathsOverlap(resolvedTarget, publicResolved)) {
        this.isConfigurationValid = false;
        this.configurationErrorReason = 'A diagnosztikai könyvtár nem egyezhet meg és nem fedheti át a statikus webgyökeret (publicDir)!';
        return { valid: false, reason: this.configurationErrorReason };
      }

      // 2. Képtár (uploadsDir): mindkét irányú átfedés tiltott
      if (pathsOverlap(resolvedTarget, uploadsResolved)) {
        this.isConfigurationValid = false;
        this.configurationErrorReason = 'A diagnosztikai könyvtár nem egyezhet meg és nem fedheti át a feltöltési könyvtárat (uploadsDir)!';
        return { valid: false, reason: this.configurationErrorReason };
      }

      // 3. Adatbázis melletti _restore_snapshots fa (logikai ÉS fizikai célja, pl. Windows junction esetén is!)
      if (pathsOverlap(resolvedTarget, restoreSnapshotsLogical) || pathsOverlap(resolvedTarget, restoreSnapshotsResolved)) {
        this.isConfigurationValid = false;
        this.configurationErrorReason = 'A diagnosztikai könyvtár nem fedheti át az adatbázis melletti _restore_snapshots könyvtárat!';
        return { valid: false, reason: this.configurationErrorReason };
      }

      // 4. Adatbázis szülőkönyvtára vagy annak őse tiltott (de a data/diagnostics önálló alkönyvtár engedélyezett)
      if (isEqualOrSubPath(dbDirResolved, resolvedTarget)) {
        this.isConfigurationValid = false;
        this.configurationErrorReason = 'A diagnosztikai könyvtár nem lehet maga az adatbázis szülőkönyvtára vagy annak őse!';
        return { valid: false, reason: this.configurationErrorReason };
      }

      // 5. Adatbázis melletti temp_restore_* munkakönyvtárak (logikai és fizikai célja, pl. junction) és leszármazottaik tiltása
      if (isEqualOrSubPath(resolvedTarget, dbDirResolved)) {
        const relFromDb = path.relative(normalizeForCompare(dbDirResolved), normalizeForCompare(resolvedTarget));
        const segments = relFromDb.split(path.sep).filter(Boolean);
        if (segments.length > 0 && segments[0].startsWith('temp_restore_')) {
          this.isConfigurationValid = false;
          this.configurationErrorReason = 'A diagnosztikai könyvtár nem mutathat temp_restore_* visszaállítási könyvtárra vagy annak alkönyvtárára!';
          return { valid: false, reason: this.configurationErrorReason };
        }
      }
      if (fs.existsSync(dbDirResolved)) {
        try {
          const dbEntries = fs.readdirSync(dbDirResolved);
          for (const entryName of dbEntries) {
            if (entryName.toLowerCase().startsWith('temp_restore_')) {
              const tempRestorePhysical = resolvePhysicalPath(path.join(dbDirResolved, entryName));
              if (pathsOverlap(resolvedTarget, tempRestorePhysical)) {
                this.isConfigurationValid = false;
                this.configurationErrorReason = 'A diagnosztikai könyvtár nem fedheti át egy átirányított temp_restore_* könyvtár célját!';
                return { valid: false, reason: this.configurationErrorReason };
              }
            }
          }
        } catch {}
      }

      // További biztonsági ellenőrzés: ha bárhol az útvonalban _restore_snapshots vagy temp_restore_ szegmens szerepel
      const allSegments = normalizeForCompare(resolvedTarget).split(path.sep).filter(Boolean);
      for (const seg of allSegments) {
        if (seg === '_restore_snapshots' || seg.startsWith('temp_restore_')) {
          this.isConfigurationValid = false;
          this.configurationErrorReason = 'A diagnosztikai könyvtár útvonala tiltott visszaállítási mappát tartalmaz!';
          return { valid: false, reason: this.configurationErrorReason };
        }
      }

      this.dir = resolvedTarget;
      this.isConfigurationValid = true;
      this.configurationErrorReason = null;
      return { valid: true, resolvedPath: resolvedTarget };
    } catch (err) {
      this.isConfigurationValid = false;
      this.configurationErrorReason = err.message;
      return { valid: false, reason: err.message };
    }
  }

  ensureDirectory() {
    const check = this.validateDirectory();
    if (!check.valid) {
      this.isDegraded = true;
      this.lastErrorCode = 'CONFIG_ERROR';
      this.logWarnOnce('Diagnosztikai konfigurációs hiba: ' + check.reason);
      return false;
    }

    try {
      if (!fs.existsSync(this.dir)) {
        fs.mkdirSync(this.dir, { recursive: true });
        const checkAfter = this.validateDirectory();
        if (!checkAfter.valid) {
          this.isDegraded = true;
          this.lastErrorCode = 'CONFIG_ERROR';
          this.logWarnOnce('Diagnosztikai konfigurációs hiba létrehozás után: ' + checkAfter.reason);
          return false;
        }
      }
      return true;
    } catch (err) {
      this.markDegraded(err.code || 'MKDIR_ERROR', 'Nem sikerült létrehozni a diagnosztikai könyvtárat: ' + err.message);
      return false;
    }
  }

  markDegraded(code, msg) {
    this.isDegraded = true;
    this.lastErrorCode = code || 'WRITE_ERROR';
    this.nextRecoveryAttemptAt = Date.now() + this.recoveryIntervalMs;
    if (msg) this.logWarnOnce(msg);
  }

  canAttemptWrite() {
    if (!this.isConfigurationValid) return false;
    if (!this.isDegraded) return true;
    return Date.now() >= this.nextRecoveryAttemptAt;
  }

  isUnusable() {
    if (!this.isConfigurationValid) return true;
    return this.isDegraded;
  }

  logWarnOnce(msg) {
    const now = Date.now();
    if (now - this.lastWarnTime > 60000) {
      this.lastWarnTime = now;
      console.warn(`[Diagnostics] ${msg}`);
    }
  }

  getTodayUtcDateStr() {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  pickTargetFilePath(nextLineBytes = 0) {
    if (!this.ensureDirectory()) return null;

    const today = this.getTodayUtcDateStr();
    const needNewBecauseForce = this.forceNewFileOnNextOpen;

    if (
      !needNewBecauseForce &&
      this.activeFilePath &&
      this.activeFileDateStr === today &&
      (this.activeFileBytes === 0 || this.activeFileBytes + nextLineBytes <= this.maxFileSizeBytes)
    ) {
      return this.activeFilePath;
    }

    const baseName = `diagnostics-${today}.log`;
    let targetPath = path.join(this.dir, baseName);

    const needsIndexed = () => {
      if (!fs.existsSync(targetPath)) return false;
      if (needNewBecauseForce) return true;
      try {
        const stats = fs.statSync(targetPath);
        return stats.size > 0 && stats.size + nextLineBytes > this.maxFileSizeBytes;
      } catch {
        return true;
      }
    };

    if (needsIndexed()) {
      let index = 1;
      while (true) {
        const indexedName = `diagnostics-${today}.${index}.log`;
        const indexedPath = path.join(this.dir, indexedName);
        if (!fs.existsSync(indexedPath)) {
          targetPath = indexedPath;
          break;
        }
        if (!needNewBecauseForce) {
          try {
            const istats = fs.statSync(indexedPath);
            if (istats.size === 0 || istats.size + nextLineBytes <= this.maxFileSizeBytes) {
              targetPath = indexedPath;
              break;
            }
          } catch {}
        }
        index++;
      }
    }

    return targetPath;
  }

  async openStreamForLine(nextLineBytes) {
    const targetPath = this.pickTargetFilePath(nextLineBytes);
    if (!targetPath) return null;

    if (this.activeStream && !this.streamFailed && this.activeFilePath === targetPath && !this.forceNewFileOnNextOpen) {
      return this.activeStream;
    }

    // Ha van korábbi nyitott stream, előbb megvárjuk a szabályos lezárását (forgatás)
    if (this.activeStream) {
      await this.closeActiveStream();
      this.pruneOldLogs();
    }

    try {
      const stream = this.streamFactory(targetPath);
      this.streamFailed = false;
      this.forceNewFileOnNextOpen = false;
      this.activeFilePath = targetPath;
      this.activeFileDateStr = this.getTodayUtcDateStr();
      try {
        this.activeFileBytes = fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0;
      } catch {
        this.activeFileBytes = 0;
      }

      stream.on('error', (err) => {
        this.streamFailed = true;
        this.forceNewFileOnNextOpen = true;
        this.markDegraded(err.code || 'WRITE_ERROR', 'Hiba a diagnosztikai naplófájl írásakor: ' + err.message);
        if (this.activeStream === stream) {
          this.activeStream = null;
        }
        try { stream.destroy(); } catch {}
      });

      this.activeStream = stream;
      return stream;
    } catch (err) {
      this.forceNewFileOnNextOpen = true;
      this.markDegraded(err.code || 'OPEN_ERROR', 'Nem sikerült megnyitni a diagnosztikai naplófájlt: ' + err.message);
      return null;
    }
  }

  /**
   * Egyetlen teljes JSONL sor aszinkron, visszaigazolt kiírása (backpressure + hibakezelés)
   * Visszatérés: { ok: boolean, uncertain: boolean }
   */
  async writeSingleLine(line, lineBytesWithLf) {
    const stream = await this.openStreamForLine(lineBytesWithLf);
    if (!stream) {
      return { ok: false, uncertain: false };
    }

    const chunk = line + '\n';

    return new Promise((resolve) => {
      let settled = false;
      let writeCallbackCalled = false;
      let writeCallbackErr = null;
      let needsDrain = false;
      let drained = false;

      const cleanup = () => {
        stream.removeListener('drain', onDrain);
        stream.removeListener('error', onError);
        stream.removeListener('close', onClose);
      };

      const finish = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const maybeResolveSuccess = () => {
        if (writeCallbackCalled && (!needsDrain || drained)) {
          if (writeCallbackErr || this.streamFailed) {
            this.forceNewFileOnNextOpen = true;
            this.markDegraded(
              (writeCallbackErr && writeCallbackErr.code) || 'WRITE_ERROR',
              'Diagnosztikai sor írása sikertelen: ' + (writeCallbackErr ? writeCallbackErr.message : 'stream hiba')
            );
            finish({ ok: false, uncertain: true });
          } else {
            this.activeFileBytes += lineBytesWithLf;
            this.isDegraded = false;
            this.lastErrorCode = null;
            finish({ ok: true, uncertain: false });
          }
        }
      };

      const onDrain = () => {
        drained = true;
        maybeResolveSuccess();
      };

      const onError = (err) => {
        writeCallbackErr = err;
        this.streamFailed = true;
        this.forceNewFileOnNextOpen = true;
        this.markDegraded(err.code || 'WRITE_ERROR', 'Stream hiba írás közben: ' + err.message);
        finish({ ok: false, uncertain: true });
      };

      const onClose = () => {
        if (!settled && (!writeCallbackCalled || (needsDrain && !drained))) {
          this.streamFailed = true;
          this.forceNewFileOnNextOpen = true;
          this.markDegraded('STREAM_CLOSED', 'A diagnosztikai fájlfolyam váratlanul lezárult írás közben.');
          finish({ ok: false, uncertain: true });
        }
      };

      stream.once('error', onError);
      stream.once('close', onClose);

      try {
        const canContinue = stream.write(chunk, 'utf8', (err) => {
          writeCallbackCalled = true;
          if (err) writeCallbackErr = err;
          maybeResolveSuccess();
        });
        if (!canContinue) {
          needsDrain = true;
          stream.once('drain', onDrain);
        }
      } catch (err) {
        this.streamFailed = true;
        this.forceNewFileOnNextOpen = true;
        this.markDegraded(err.code || 'WRITE_THROW', 'Kivétel a diagnosztikai sor írásakor: ' + err.message);
        finish({ ok: false, uncertain: true });
      }
    });
  }

  pruneOldLogs() {
    if (!this.isConfigurationValid || !fs.existsSync(this.dir)) return;

    try {
      const entries = fs.readdirSync(this.dir, { withFileTypes: true });
      const logFiles = [];
      const now = Date.now();
      const retentionMs = this.retentionDays * 86400000;

      for (const ent of entries) {
        if (!ent.isFile()) continue;
        if (!LOG_FILE_REGEX.test(ent.name)) continue;

        const fullPath = path.join(this.dir, ent.name);
        try {
          const stats = fs.statSync(fullPath);
          logFiles.push({
            name: ent.name,
            fullPath,
            size: stats.size,
            mtimeMs: stats.mtimeMs
          });
        } catch {}
      }

      const remainingFiles = [];
      for (const file of logFiles) {
        if (now - file.mtimeMs > retentionMs && file.fullPath !== this.activeFilePath) {
          try { fs.unlinkSync(file.fullPath); } catch {}
        } else {
          remainingFiles.push(file);
        }
      }

      let totalSize = remainingFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > this.maxTotalSizeBytes) {
        remainingFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);
        for (const file of remainingFiles) {
          if (file.fullPath === this.activeFilePath) continue;
          try {
            fs.unlinkSync(file.fullPath);
            totalSize -= file.size;
            if (totalSize <= this.maxTotalSizeBytes) break;
          } catch {}
        }
      }
    } catch (err) {
      this.logWarnOnce('Hiba a régi naplófájlok takarításakor: ' + err.message);
    }
  }

  async closeActiveStream(timeoutMs = 1500) {
    const stream = this.activeStream;
    this.activeStream = null;
    if (!stream) return !this.streamFailed;

    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stream.removeListener('finish', onFinish);
        stream.removeListener('error', onError);
        stream.removeListener('close', onClose);
        resolve(ok);
      };

      const onFinish = () => done(!this.streamFailed);
      const onError = (err) => {
        this.streamFailed = true;
        this.markDegraded(err.code || 'CLOSE_ERROR', 'Hiba a naplófolyam lezárásakor: ' + err.message);
        done(false);
      };
      const onClose = () => done(!this.streamFailed && stream.writableFinished);

      const timer = setTimeout(() => {
        try { stream.destroy(); } catch {}
        done(false);
      }, timeoutMs);

      stream.once('finish', onFinish);
      stream.once('error', onError);
      stream.once('close', onClose);

      try {
        if (stream.destroyed || stream.writableEnded) {
          done(!this.streamFailed && stream.writableFinished);
        } else {
          stream.end();
        }
      } catch {
        try { stream.destroy(); } catch {}
        done(false);
      }
    });
  }

  destroyActiveStream() {
    const stream = this.activeStream;
    this.activeStream = null;
    if (stream) {
      try { stream.destroy(); } catch {}
    }
  }
}

/**
 * 5. DiagnosticsService - Központi vezérlő osztály (egyetlen sorosított pumpával)
 */
class DiagnosticsService {
  constructor(options = {}) {
    this.enabled = options.enabled !== undefined ? options.enabled : config.diagnosticsEnabled;
    this.appVersion = packageJson.version || '1.34.5';
    this.runId = options.runId || crypto.randomBytes(16).toString('hex');
    this.startedAt = new Date().toISOString();

    this.queue = new RingBufferQueue(
      options.maxQueueSize || config.diagnosticsMaxQueueSize,
      options.maxQueueBytes || config.diagnosticsMaxQueueBytes
    );

    this.dedupCache = new DeduplicationCache(1024, 600000);
    this.rateLimiter = new SlidingWindowRateLimiter(
      options.rateLimitParticipant || config.diagnosticsRateLimitParticipantPerMin,
      options.rateLimitGlobal || config.diagnosticsRateLimitGlobalPerMin
    );

    this.writer = new DiagnosticsFileWriter(options);
    this.totalWritten = 0;
    this.uncertainEventsCount = 0;
    this.isClosing = false;
    this.pumpPromise = null;
    this.workerTimer = null;
    this.pruneTimer = null;

    // Könyvtár előellenőrzése kikapcsolt állapotban is (meglévő naplók biztonságos exportjához)
    this.writer.validateDirectory();

    if (this.enabled) {
      this.init();
    }
  }

  init() {
    const dirCheck = this.writer.validateDirectory();
    if (!dirCheck.valid) {
      this.writer.isDegraded = true;
      this.writer.lastErrorCode = 'CONFIG_ERROR';
      console.warn(`[DiagnosticsService] Inicializálási figyelmeztetés: ${dirCheck.reason}`);
    } else {
      this.writer.ensureDirectory();
      this.writer.pruneOldLogs();
    }

    this.workerTimer = setInterval(() => {
      this.triggerPump();
    }, 100);
    if (typeof this.workerTimer.unref === 'function') this.workerTimer.unref();

    this.pruneTimer = setInterval(() => {
      this.writer.pruneOldLogs();
      this.dedupCache.cleanExpired();
    }, 300000);
    if (typeof this.pruneTimer.unref === 'function') this.pruneTimer.unref();
  }

  /**
   * Szerveroldali események szűrése és felépítése (Whitelisting)
   */
  sanitizeServerEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const event = String(raw.event || '').trim();
    if (!SERVER_ALLOWED_EVENTS.has(event)) return null;

    const sanitized = {
      schemaVersion: 1,
      appVersion: this.appVersion,
      receivedAt: new Date().toISOString(),
      runId: this.runId,
      source: 'server',
      event
    };

    if (typeof raw.route === 'string' && ALLOWED_ROUTES.has(raw.route)) {
      sanitized.route = raw.route;
    }

    if (typeof raw.requestId === 'string' && HEX_32_REGEX.test(raw.requestId)) {
      sanitized.requestId = raw.requestId.toLowerCase();
    }

    if (typeof raw.operationId === 'string' && HEX_32_REGEX.test(raw.operationId)) {
      sanitized.operationId = raw.operationId.toLowerCase();
    }

    if (typeof raw.outcome === 'string' && ALLOWED_SERVER_OUTCOMES.has(raw.outcome)) {
      sanitized.outcome = raw.outcome;
    }

    if (typeof raw.reasonCode === 'string') {
      const cleaned = raw.reasonCode.replace(/[^A-Z0-9_]/g, '').slice(0, 40);
      if (cleaned) sanitized.reasonCode = cleaned;
    }

    if (typeof raw.httpStatus === 'number' && Number.isInteger(raw.httpStatus) && raw.httpStatus >= 100 && raw.httpStatus <= 599) {
      sanitized.httpStatus = raw.httpStatus;
    }

    if (typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs)) {
      sanitized.durationMs = Math.max(0, Math.round(raw.durationMs));
    }

    return sanitized;
  }

  /**
   * Kliensoldali események szigorú bemeneti szerződése (DH 01 / 3. fejezet)
   */
  sanitizeClientEntry(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    const event = typeof raw.event === 'string' ? raw.event.trim() : '';
    const spec = CLIENT_EVENT_SPECS[event];
    if (!spec) return null; // Szerveresemény vagy ismeretlen esemény szigorúan elutasítva

    // Ismeretlen vagy tiltott mezők azonnali elutasítása (400)
    for (const key of Object.keys(raw)) {
      if (!spec.allowedKeys.has(key)) {
        return null;
      }
    }

    // Kötelező mezők ellenőrzése
    for (const reqKey of spec.required) {
      if (typeof raw[reqKey] !== 'string' || !HEX_32_REGEX.test(raw[reqKey])) {
        return null;
      }
    }

    const sanitized = {
      schemaVersion: 1,
      appVersion: this.appVersion,
      receivedAt: new Date().toISOString(),
      runId: this.runId,
      source: 'student_browser',
      event,
      eventId: raw.eventId.toLowerCase()
    };

    if (raw.requestId !== undefined) {
      if (typeof raw.requestId !== 'string' || !HEX_32_REGEX.test(raw.requestId)) return null;
      sanitized.requestId = raw.requestId.toLowerCase();
    }

    if (raw.operationId !== undefined) {
      if (typeof raw.operationId !== 'string' || !HEX_32_REGEX.test(raw.operationId)) return null;
      sanitized.operationId = raw.operationId.toLowerCase();
    }

    if (raw.clientAt !== undefined) {
      if (!isValidUtcIsoTimestamp(raw.clientAt)) return null;
      sanitized.clientAt = raw.clientAt;
    }

    if (raw.outcome !== undefined) {
      if (!spec.allowedOutcomes || typeof raw.outcome !== 'string' || !spec.allowedOutcomes.has(raw.outcome)) {
        return null;
      }
      sanitized.outcome = raw.outcome;
    }

    if (raw.reasonCode !== undefined) {
      if (!spec.allowedReasonCodes || typeof raw.reasonCode !== 'string' || !spec.allowedReasonCodes.has(raw.reasonCode)) {
        return null;
      }
      sanitized.reasonCode = raw.reasonCode;
    }

    if (raw.httpStatus !== undefined) {
      if (
        !spec.httpStatusRange ||
        typeof raw.httpStatus !== 'number' ||
        !Number.isInteger(raw.httpStatus) ||
        raw.httpStatus < spec.httpStatusRange[0] ||
        raw.httpStatus > spec.httpStatusRange[1]
      ) {
        return null;
      }
      sanitized.httpStatus = raw.httpStatus;
    }

    if (raw.durationMs !== undefined) {
      if (typeof raw.durationMs !== 'number' || !Number.isFinite(raw.durationMs) || raw.durationMs < 0) {
        return null;
      }
      sanitized.durationMs = Math.round(raw.durationMs);
    }

    return sanitized;
  }

  /**
   * Szerveroldali esemény sorba állítása
   */
  logEvent(entry) {
    if (!this.enabled) return false;
    if (this.isClosing && (!entry || entry.event !== 'server.stopping')) {
      return false;
    }

    const sanitized = this.sanitizeServerEntry(entry);
    if (!sanitized) return false;

    const json = JSON.stringify(sanitized);
    const bytesWithLf = Buffer.byteLength(json, 'utf8') + 1;

    const accepted = this.queue.enqueueSingle(json, bytesWithLf);
    if (accepted) {
      this.triggerPump();
    }
    return accepted;
  }

  /**
   * Kliensoldali eseménycsomag atomi fogadása (DH 01 / 2. és 3. fejezet)
   */
  handleClientBatch(events, sessionToken) {
    if (!this.enabled) {
      return { status: 403, code: 'DIAGNOSTICS_DISABLED' };
    }

    if (!Array.isArray(events)) {
      return { status: 400, code: 'INVALID_BATCH_FORMAT' };
    }

    if (events.length === 0) {
      return { status: 204 };
    }

    if (events.length > 20) {
      return { status: 400, code: 'TOO_MANY_EVENTS' };
    }

    let participantHash = null;
    if (sessionToken) {
      participantHash = crypto.createHash('sha256').update(String(sessionToken)).digest('hex').slice(0, 16);
    }
    if (!this.rateLimiter.checkAndIncrement(participantHash)) {
      return { status: 429, code: 'RATE_LIMIT_EXCEEDED' };
    }

    // 1. Szigorú kliensoldali sémaellenőrzés
    const validatedEntries = [];
    for (const raw of events) {
      const sanitized = this.sanitizeClientEntry(raw);
      if (!sanitized) {
        return { status: 400, code: 'INVALID_EVENT_SCHEMA' };
      }
      validatedEntries.push(sanitized);
    }

    // 2. Ismert eventId-k és csomagon belüli ismétlések kiszűrése
    const seenInBatch = new Set();
    const newItemsWithBytes = [];

    for (const entry of validatedEntries) {
      if (this.dedupCache.has(entry.eventId) || seenInBatch.has(entry.eventId)) {
        continue;
      }
      seenInBatch.add(entry.eventId);
      const json = JSON.stringify(entry);
      const bytesWithLf = Buffer.byteLength(json, 'utf8') + 1;
      newItemsWithBytes.push({ entry: json, bytes: bytesWithLf, eventId: entry.eventId });
    }

    if (newItemsWithBytes.length === 0) {
      return { status: 204 };
    }

    // 3. Lezárás alatt álló vagy ismerten használhatatlan írónál 503 (nem veszünk át új sort!)
    if (this.isClosing || this.writer.isUnusable()) {
      this.queue.rejectedBatchEventsCount += newItemsWithBytes.length;
      return { status: 503, code: 'WRITER_UNAVAILABLE' };
    }

    // 4. Atomi döntés a teljes új sorozatról (függő tételekkel együtt!)
    let totalBytes = 0;
    for (const item of newItemsWithBytes) {
      totalBytes += item.bytes;
    }

    if (!this.queue.canAccept(newItemsWithBytes.length, totalBytes)) {
      this.queue.rejectedBatchEventsCount += newItemsWithBytes.length;
      return { status: 503, code: 'BUFFER_FULL_RETRY_LATER' };
    }

    this.queue.enqueueBatch(newItemsWithBytes.map(i => ({ entry: i.entry, bytes: i.bytes })));
    for (const item of newItemsWithBytes) {
      this.dedupCache.add(item.eventId);
    }

    this.triggerPump();
    return { status: 204 };
  }

  /**
   * Egyetlen sorosított háttérürítő (drain-vezérelt, párhuzamos futás kizárva)
   */
  triggerPump() {
    if (this.pumpPromise) return this.pumpPromise;
    if (this.queue.size() === 0) return null;
    if (!this.writer.canAttemptWrite()) return null;

    this.pumpPromise = this._runPumpLoop().finally(() => {
      this.pumpPromise = null;
    });
    return this.pumpPromise;
  }

  async _runPumpLoop() {
    while (this.queue.size() > 0) {
      if (!this.writer.canAttemptWrite()) {
        break;
      }

      const item = this.queue.shiftToInFlight();
      if (!item) break;

      const writeRes = await this.writer.writeSingleLine(item.entry, item.bytes);

      if (writeRes.ok) {
        this.queue.completeInFlight(item);
        this.totalWritten += 1;
      } else if (writeRes.uncertain) {
        // Írás közben történt hiba: bizonytalan kimenetel, külön számláljuk, nem írjuk újra ugyanabba a fájlba
        this.queue.completeInFlight(item);
        this.uncertainEventsCount += 1;
        break;
      } else {
        // Nyitás előtti hiba (el sem kezdődött): visszatesszük a sor elejére a későbbi helyreállításhoz
        this.queue.returnInFlightToFront(item);
        break;
      }
    }
  }

  _buildStatusObject(diskSizeBytes, exportAvailable) {
    let statusCode = 'OK';
    if (!this.enabled) {
      statusCode = 'DISABLED';
    } else if (!this.writer.isConfigurationValid) {
      statusCode = 'CONFIG_ERROR';
    } else if (this.writer.isDegraded) {
      statusCode = this.writer.lastErrorCode || 'WRITE_ERROR';
    } else if (this.queue.droppedEventsCount > 0 || this.uncertainEventsCount > 0) {
      statusCode = 'DEGRADED';
    }

    return {
      enabled: this.enabled,
      isDegraded: this.writer.isDegraded || !this.writer.isConfigurationValid || this.queue.droppedEventsCount > 0 || this.uncertainEventsCount > 0,
      configurationError: !this.writer.isConfigurationValid,
      statusCode,
      runId: this.runId,
      startedAt: this.startedAt,
      droppedEventsCount: this.queue.droppedEventsCount,
      rejectedBatchEventsCount: this.queue.rejectedBatchEventsCount,
      uncertainEventsCount: this.uncertainEventsCount,
      totalWritten: this.totalWritten,
      diskSizeBytes,
      exportAvailable
    };
  }

  /**
   * Állapotlekérdezés (szinkron - tesztekhez és belső használatra)
   */
  getStatus() {
    if (!this.writer.isConfigurationValid) {
      this.writer.validateDirectory();
    }

    let diskSizeBytes = 0;
    let exportAvailable = false;

    if (this.writer.isConfigurationValid && fs.existsSync(this.writer.dir)) {
      try {
        const files = fs.readdirSync(this.writer.dir);
        for (const f of files) {
          if (LOG_FILE_REGEX.test(f)) {
            const fullPath = path.join(this.writer.dir, f);
            const stats = fs.statSync(fullPath);
            if (stats.isFile()) {
              diskSizeBytes += stats.size;
              if (stats.size > 0) exportAvailable = true;
            }
          }
        }
      } catch {}
    }

    return this._buildStatusObject(diskSizeBytes, exportAvailable);
  }

  /**
   * Aszinkron, nem blokkoló állapotlekérdezés a tanári HTTP végponthoz
   */
  async getStatusAsync() {
    if (!this.writer.isConfigurationValid) {
      this.writer.validateDirectory();
    }

    let diskSizeBytes = 0;
    let exportAvailable = false;

    if (this.writer.isConfigurationValid) {
      try {
        const entries = await fs.promises.readdir(this.writer.dir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.isFile() && LOG_FILE_REGEX.test(ent.name)) {
            try {
              const stats = await fs.promises.stat(path.join(this.writer.dir, ent.name));
              if (stats.isFile()) {
                diskSizeBytes += stats.size;
                if (stats.size > 0) exportAvailable = true;
              }
            } catch {}
          }
        }
      } catch {}
    }

    return this._buildStatusObject(diskSizeBytes, exportAvailable);
  }

  /**
   * Export aszinkron, non-blocking és megszakítható (AbortSignal) előzetes méret- és rövidítés-ellenőrzése
   */
  async inspectExport(options = 24) {
    const opts = typeof options === 'number' ? { hours: options } : (options || {});
    const hours = opts.hours !== undefined ? opts.hours : 24;
    const exportNowMs = opts.nowMs !== undefined ? opts.nowMs : Date.now();
    const signal = opts.signal || null;
    const maxExportBytes = opts.maxExportBytes !== undefined
      ? opts.maxExportBytes
      : (parseInt(process.env.DIAGNOSTICS_MAX_EXPORT_BYTES || '', 10) || config.diagnosticsMaxExportBytes || 25 * 1024 * 1024);
    const cutoffMs = exportNowMs - (hours * 3600000);

    if (signal && signal.aborted) {
      return { valid: true, aborted: true, truncated: false, maxExportBytes, exportNowMs, validFiles: [] };
    }

    const dirCheck = this.writer.validateDirectory();
    if (!dirCheck.valid || !fs.existsSync(this.writer.dir)) {
      return { valid: dirCheck.valid, aborted: false, truncated: false, maxExportBytes, exportNowMs, validFiles: [] };
    }

    const validFiles = [];
    try {
      const entries = await fs.promises.readdir(this.writer.dir, { withFileTypes: true });
      for (const ent of entries) {
        if (signal && signal.aborted) {
          return { valid: true, aborted: true, truncated: false, maxExportBytes, exportNowMs, validFiles: [] };
        }
        if (!ent.isFile() || !LOG_FILE_REGEX.test(ent.name)) continue;
        const full = path.join(this.writer.dir, ent.name);
        try {
          const stats = await fs.promises.stat(full);
          if (stats.size > 0) {
            validFiles.push({ full, mtimeMs: stats.mtimeMs, endByte: stats.size - 1 });
          }
        } catch {}
      }
    } catch {}

    validFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

    // Aszinkron ellenőrzés streamenként: csak akkor olvas bele, ha az összméret meghaladja a maxExportBytes keretet
    let totalBytes = 0;
    let truncated = false;
    let aborted = false;
    const totalFileSizes = validFiles.reduce((sum, f) => sum + f.endByte + 1, 0);

    if (totalFileSizes > maxExportBytes) {
      outer: for (const fileInfo of validFiles) {
        if (signal && signal.aborted) {
          aborted = true;
          break outer;
        }
        let rs = null;
        const onAbort = () => {
          aborted = true;
          if (rs && !rs.destroyed) {
            try { rs.destroy(); } catch {}
          }
        };
        if (signal) {
          signal.addEventListener('abort', onAbort, { once: true });
        }
        try {
          rs = fs.createReadStream(fileInfo.full, {
            encoding: 'utf8',
            start: 0,
            end: fileInfo.endByte
          });
          let remainder = '';
          for await (const chunk of rs) {
            if (signal && signal.aborted) {
              aborted = true;
              rs.destroy();
              break outer;
            }
            const text = remainder + chunk;
            const lines = text.split('\n');
            remainder = lines.pop();
            for (const rawLine of lines) {
              const trimmed = rawLine.trim();
              if (!trimmed) continue;
              try {
                const parsed = JSON.parse(trimmed);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
                if (!isValidUtcIsoTimestamp(parsed.receivedAt)) continue;
                const recMs = Date.parse(parsed.receivedAt);
                if (recMs >= cutoffMs && recMs <= exportNowMs) {
                  const lineBytes = Buffer.byteLength(trimmed + '\n', 'utf8');
                  if (totalBytes + lineBytes > maxExportBytes) {
                    truncated = true;
                    rs.destroy();
                    break outer;
                  }
                  totalBytes += lineBytes;
                }
              } catch {}
            }
          }
        } catch {} finally {
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }
          if (rs && !rs.destroyed) {
            try { rs.destroy(); } catch {}
          }
        }
      }
    }

    return { valid: true, aborted, truncated, maxExportBytes, exportNowMs, validFiles };
  }

  /**
   * Biztonságos, rekord-időbélyeg alapú, méretkorlátos és megszakítható exportfolyam (DH 01 / 3. fejezet)
   */
  createExportStream(options = 24) {
    const opts = typeof options === 'number' ? { hours: options } : (options || {});
    const hours = opts.hours !== undefined ? opts.hours : 24;
    const exportNowMs = opts.nowMs !== undefined ? opts.nowMs : Date.now();
    const maxExportBytes = opts.maxExportBytes !== undefined
      ? opts.maxExportBytes
      : (parseInt(process.env.DIAGNOSTICS_MAX_EXPORT_BYTES || '', 10) || config.diagnosticsMaxExportBytes || 25 * 1024 * 1024);
    const cutoffMs = exportNowMs - (hours * 3600000);

    // Kikapcsolt gyűjtésnél is kötelező a könyvtárvalidáció!
    const dirCheck = this.writer.validateDirectory();
    if (!dirCheck.valid || !fs.existsSync(this.writer.dir)) {
      const emptyStream = new Readable({ read() { this.push(null); } });
      emptyStream.truncated = false;
      return emptyStream;
    }

    const validFiles = Array.isArray(opts._precomputedFiles) ? opts._precomputedFiles.slice() : [];
    if (validFiles.length === 0) {
      try {
        const entries = fs.readdirSync(this.writer.dir, { withFileTypes: true });
        for (const ent of entries) {
          if (!ent.isFile() || !LOG_FILE_REGEX.test(ent.name)) continue;
          const full = path.join(this.writer.dir, ent.name);
          try {
            const stats = fs.statSync(full);
            if (stats.size > 0) {
              // Az aktív vagy meglevő fájl olvasása az export indulásakor rögzített fájlvégig tart
              validFiles.push({ full, mtimeMs: stats.mtimeMs, endByte: stats.size - 1 });
            }
          } catch {}
        }
      } catch {}
      validFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);
    }

    let fileIndex = 0;
    let currentReadStream = null;
    let remainder = '';
    let bytesPushed = 0;
    let pendingLines = [];
    let isReadingFile = false;
    let destroyed = false;

    const stream = new Readable({
      read() {
        drainPendingLines();
      },
      destroy(err, cb) {
        destroyed = true;
        if (currentReadStream) {
          try { currentReadStream.destroy(); } catch {}
          currentReadStream = null;
        }
        pendingLines = [];
        cb(err);
      }
    });

    stream.truncated = false;

    const drainPendingLines = () => {
      if (destroyed) return;

      while (pendingLines.length > 0) {
        const lineWithLf = pendingLines.shift();
        const lineBytes = Buffer.byteLength(lineWithLf, 'utf8');
        if (bytesPushed + lineBytes > maxExportBytes) {
          stream.truncated = true;
          pendingLines = [];
          if (currentReadStream) {
            try { currentReadStream.destroy(); } catch {}
            currentReadStream = null;
          }
          stream.push(null);
          return;
        }
        bytesPushed += lineBytes;
        const ok = stream.push(lineWithLf);
        if (!ok) {
          if (currentReadStream) currentReadStream.pause();
          return;
        }
      }

      if (currentReadStream) {
        currentReadStream.resume();
        return;
      }

      if (!isReadingFile) {
        openNextFile();
      }
    };

    const openNextFile = () => {
      if (destroyed || stream.truncated) return;

      if (fileIndex >= validFiles.length) {
        stream.push(null);
        return;
      }

      const fileInfo = validFiles[fileIndex++];
      isReadingFile = true;
      remainder = ''; // Minden fájl üres sorpufferrel indul

      const rs = fs.createReadStream(fileInfo.full, {
        encoding: 'utf8',
        start: 0,
        end: fileInfo.endByte
      });
      currentReadStream = rs;

      rs.on('data', (chunk) => {
        if (destroyed || stream.truncated) return;
        const text = remainder + chunk;
        const lines = text.split('\n');
        // Az utolsó elem még nem kapott lezáró '\n'-t -> marad a remainder-ben (fájl végén eldobódik!)
        remainder = lines.pop();

        for (const rawLine of lines) {
          const trimmed = rawLine.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
            if (!isValidUtcIsoTimestamp(parsed.receivedAt)) continue;
            const recMs = Date.parse(parsed.receivedAt);
            if (recMs >= cutoffMs && recMs <= exportNowMs) {
              pendingLines.push(trimmed + '\n');
            }
          } catch {
            // Érvénytelen vagy csonka JSON sor kihagyása
          }
        }

        if (pendingLines.length > 0) {
          rs.pause();
          drainPendingLines();
        }
      });

      rs.on('end', () => {
        // Fájl végén a lezáratlan (csonka) remainder szigorúan eldobódik!
        remainder = '';
        currentReadStream = null;
        isReadingFile = false;
        drainPendingLines();
      });

      rs.on('error', (err) => {
        console.warn('[Diagnostics Export] Hiba a fájl olvasásakor:', err.message);
        remainder = '';
        currentReadStream = null;
        isReadingFile = false;
        drainPendingLines();
      });
    };

    return stream;
  }

  /**
   * Szabályos leállás és sorürítés határidővel (egyetlen írót használva, DH 01 / 2. fejezet)
   * Visszatérés: { ok: boolean, reason: string }
   */
  async flushAndClose(timeoutMs = 2000) {
    this.isClosing = true;

    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }

    if (!this.enabled) {
      return { ok: true, reason: 'disabled' };
    }

    let timer = null;
    const timeoutPromise = new Promise((resolve) => {
      timer = setTimeout(() => {
        this.writer.destroyActiveStream();
        resolve({ ok: false, reason: 'timeout' });
      }, timeoutMs);
    });

    const flushWork = async () => {
      // Ha még van elem a sorban, indítjuk/megvárjuk a közös pumpát
      if (this.queue.size() > 0 || this.pumpPromise) {
        const p = this.triggerPump() || this.pumpPromise;
        if (p) await p;
      }

      const streamClosedOk = await this.writer.closeActiveStream(Math.max(200, timeoutMs));

      if (!streamClosedOk || this.writer.isDegraded || !this.writer.isConfigurationValid) {
        return { ok: false, reason: 'write_error' };
      }
      if (this.queue.totalPendingCount() > 0 || this.uncertainEventsCount > 0) {
        return { ok: false, reason: 'unaccounted_events' };
      }
      return { ok: true, reason: 'ok' };
    };

    try {
      const result = await Promise.race([flushWork(), timeoutPromise]);
      clearTimeout(timer);
      return result;
    } catch {
      clearTimeout(timer);
      this.writer.destroyActiveStream();
      return { ok: false, reason: 'write_error' };
    }
  }
}

const defaultDiagnosticsService = new DiagnosticsService();

module.exports = defaultDiagnosticsService;
module.exports.DiagnosticsService = DiagnosticsService;
module.exports.RingBufferQueue = RingBufferQueue;
module.exports.DeduplicationCache = DeduplicationCache;
module.exports.SlidingWindowRateLimiter = SlidingWindowRateLimiter;
module.exports.DiagnosticsFileWriter = DiagnosticsFileWriter;
module.exports.resolvePhysicalPath = resolvePhysicalPath;
module.exports.isEqualOrSubPath = isEqualOrSubPath;
