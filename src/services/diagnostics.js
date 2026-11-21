const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const config = require('../../config');
const packageJson = require('../../package.json');

/**
 * DiagnosticsService - Helyi aszinkron diagnosztikai és eseménynaplózó alrendszer
 * Specifikáció: Source/Beepitesi_terv_01.md, Source/Pontositasi_terv_01.md,
 *               Source/Beepitesi_terv_01_vegrehajtasi_terv_01.md (v1.2)
 */

const ALLOWED_SOURCES = new Set(['server', 'student_browser']);
const ALLOWED_EVENTS = new Set([
  'server.started',
  'server.stopping',
  'answer.received',
  'answer.persisted',
  'answer.rejected',
  'answer.failed',
  'http.finished',
  'http.closed_early',
  'answer.acknowledged',
  'answer.response_error',
  'answer.no_ack',
  'socket.disconnected',
  'socket.reconnected',
  'socket.connect_error'
]);

const ALLOWED_OUTCOMES = new Set(['saved', 'duplicate', 'ok', 'error', 'no_ack']);

const HEX_32_REGEX = /^[a-f0-9]{32}$/i;
const LOG_FILE_REGEX = /^diagnostics-\d{4}-\d{2}-\d{2}(\.\d+)?\.log$/;

/**
 * 1. RingBufferQueue - Korlátozott kapacitású, non-blocking memóriasor
 */
class RingBufferQueue {
  constructor(maxSize = 2048, maxBytes = 2097152) {
    this.maxSize = maxSize;
    this.maxBytes = maxBytes;
    this.queue = [];
    this.currentBytes = 0;
    this.droppedEventsCount = 0;
  }

  canAccept(entriesCount, bytesCount) {
    return (
      this.queue.length + entriesCount <= this.maxSize &&
      this.currentBytes + bytesCount <= this.maxBytes
    );
  }

  enqueueBatch(entriesWithBytes) {
    let totalBytes = 0;
    for (const item of entriesWithBytes) {
      totalBytes += item.bytes;
    }

    if (!this.canAccept(entriesWithBytes.length, totalBytes)) {
      this.droppedEventsCount += entriesWithBytes.length;
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

  dequeueChunk(limit = 100) {
    if (this.queue.length === 0) return [];
    const count = Math.min(limit, this.queue.length);
    const chunk = this.queue.splice(0, count);
    for (const item of chunk) {
      this.currentBytes = Math.max(0, this.currentBytes - item.bytes);
    }
    return chunk;
  }

  size() {
    return this.queue.length;
  }

  bytes() {
    return this.currentBytes;
  }
}

/**
 * 2. DeduplicationCache - Kliens események deduplikációja FIFO gyűrűben
 */
class DeduplicationCache {
  constructor(maxEntries = 1024, ttlMs = 600000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.map = new Map(); // eventId -> timestamp
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
    this.participantCounts = new Map(); // tokenHash -> [timestamps]
    this.globalTimestamps = [];
  }

  checkAndIncrement(participantKey) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Globális korlát takarítása és ellenőrzése
    while (this.globalTimestamps.length > 0 && this.globalTimestamps[0] < windowStart) {
      this.globalTimestamps.shift();
    }
    if (this.globalTimestamps.length >= this.globalLimit) {
      return false;
    }

    // Résztvevő korlát takarítása és ellenőrzése
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

    // Periodikus tisztítás túl sok kulcs esetén
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
 * 4. DiagnosticsFileWriter - Aszinkron Stream Író, Rotáció és Útvonal-ellenőrzés
 */
class DiagnosticsFileWriter {
  constructor(options = {}) {
    this.dir = options.dir || config.diagnosticsDir;
    this.maxFileSizeBytes = options.maxFileSizeBytes || config.diagnosticsMaxFileSizeBytes || 5242880;
    this.maxTotalSizeBytes = options.maxTotalSizeBytes || config.diagnosticsMaxTotalSizeBytes || 26214400;
    this.retentionDays = options.retentionDays || config.diagnosticsRetentionDays || 7;

    this.isConfigurationValid = false;
    this.isDegraded = false;
    this.lastWarnTime = 0;
    this.activeStream = null;
    this.activeFilePath = null;
    this.activeFileDateStr = null;
    this.activeFileBytes = 0;
    this.isWriting = false;
    this.isDraining = false;
    this.rotationCheckTimer = null;
  }

  /**
   * 6. fejezet szerinti fizikai útvonal-ellenőrzés
   */
  validateDirectory(targetDir = this.dir, customConfig = config) {
    try {
      const normalizedTarget = path.normalize(path.resolve(targetDir));

      // Létező könyvtár feloldása fs.realpathSync-kel, vagy a legközelebbi létező szülő feloldása
      let resolvedTarget;
      if (fs.existsSync(normalizedTarget)) {
        resolvedTarget = fs.realpathSync(normalizedTarget);
      } else {
        let curr = normalizedTarget;
        const missingParts = [];
        while (!fs.existsSync(curr)) {
          const parent = path.dirname(curr);
          if (parent === curr) break;
          missingParts.unshift(path.basename(curr));
          curr = parent;
        }
        if (fs.existsSync(curr)) {
          const resolvedParent = fs.realpathSync(curr);
          resolvedTarget = path.join(resolvedParent, ...missingParts);
        } else {
          resolvedTarget = normalizedTarget;
        }
      }

      const isSubOrEqual = (child, parent) => {
        const rel = path.relative(parent.toLowerCase(), child.toLowerCase());
        return !rel.startsWith('..') && !path.isAbsolute(rel);
      };

      const isSamePath = (p1, p2) => p1.toLowerCase() === p2.toLowerCase();

      // Tilalmak ellenőrzése
      const publicResolved = fs.existsSync(customConfig.publicDir)
        ? fs.realpathSync(customConfig.publicDir)
        : path.resolve(customConfig.publicDir);

      const uploadsResolved = fs.existsSync(customConfig.uploadsDir)
        ? fs.realpathSync(customConfig.uploadsDir)
        : path.resolve(customConfig.uploadsDir);

      const dbDir = path.dirname(path.resolve(customConfig.dbPath));
      const dbDirResolved = fs.existsSync(dbDir)
        ? fs.realpathSync(dbDir)
        : dbDir;

      // 1. Webgyökér tiltás (egyezés vagy alkönyvtár vagy szülő)
      if (isSamePath(resolvedTarget, publicResolved) || isSubOrEqual(resolvedTarget, publicResolved) || isSubOrEqual(publicResolved, resolvedTarget)) {
        return { valid: false, reason: 'A diagnosztikai könyvtár nem egyezhet meg és nem fedheti át a statikus webgyökeret (publicDir)!' };
      }

      // 2. Képtár tiltás (egyezés vagy alkönyvtár vagy szülő)
      if (isSamePath(resolvedTarget, uploadsResolved) || isSubOrEqual(resolvedTarget, uploadsResolved) || isSubOrEqual(uploadsResolved, resolvedTarget)) {
        return { valid: false, reason: 'A diagnosztikai könyvtár nem egyezhet meg és nem fedheti át a feltöltési könyvtárat (uploadsDir)!' };
      }

      // 3. Adatbázis szülőkönyvtár tilalma (maga az adatbázis szülője vagy annak őse nem lehet a cél, de annak alkönyvtára igen!)
      if (isSamePath(resolvedTarget, dbDirResolved) || isSubOrEqual(dbDirResolved, resolvedTarget)) {
        return { valid: false, reason: 'A diagnosztikai könyvtár nem lehet maga az adatbázis szülőkönyvtára vagy annak őse!' };
      }

      // 4. _restore_snapshots és temp_restore tiltások
      const targetBase = path.basename(resolvedTarget).toLowerCase();
      if (targetBase.startsWith('temp_restore_') || targetBase === '_restore_snapshots') {
        return { valid: false, reason: 'A diagnosztikai könyvtár nem mutathat visszaállítási munkakönyvtárra!' };
      }

      this.dir = resolvedTarget;
      this.isConfigurationValid = true;
      return { valid: true, resolvedPath: resolvedTarget };
    } catch (err) {
      this.isConfigurationValid = false;
      return { valid: false, reason: err.message };
    }
  }

  ensureDirectory() {
    if (!this.isConfigurationValid) {
      const check = this.validateDirectory();
      if (!check.valid) {
        this.logWarnOnce('Diagnosztikai konfigurációs hiba: ' + check.reason);
        return false;
      }
    }

    try {
      if (!fs.existsSync(this.dir)) {
        fs.mkdirSync(this.dir, { recursive: true });
        // Létrehozás után újra feloldjuk és ellenőrizzük
        const checkAfter = this.validateDirectory();
        if (!checkAfter.valid) {
          this.logWarnOnce('Diagnosztikai konfigurációs hiba létrehozás után: ' + checkAfter.reason);
          return false;
        }
      }
      return true;
    } catch (err) {
      this.isDegraded = true;
      this.logWarnOnce('Nem sikerült létrehozni a diagnosztikai könyvtárat: ' + err.message);
      return false;
    }
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

  getActiveFilePath() {
    const today = this.getTodayUtcDateStr();
    if (this.activeFilePath && this.activeFileDateStr === today && this.activeFileBytes < this.maxFileSizeBytes) {
      return this.activeFilePath;
    }

    if (!this.ensureDirectory()) return null;

    // Alapértelmezett napi fájlnév
    const baseName = `diagnostics-${today}.log`;
    let targetPath = path.join(this.dir, baseName);

    // Ha a mai alapkötet már létezik és elérte a méretkorlátot, sorszámozottat keresünk
    if (fs.existsSync(targetPath)) {
      const stats = fs.statSync(targetPath);
      if (stats.size >= this.maxFileSizeBytes) {
        let index = 1;
        while (true) {
          const indexedName = `diagnostics-${today}.${index}.log`;
          const indexedPath = path.join(this.dir, indexedName);
          if (!fs.existsSync(indexedPath)) {
            targetPath = indexedPath;
            break;
          }
          const istats = fs.statSync(indexedPath);
          if (istats.size < this.maxFileSizeBytes) {
            targetPath = indexedPath;
            break;
          }
          index++;
        }
      }
    }

    this.activeFilePath = targetPath;
    this.activeFileDateStr = today;
    try {
      this.activeFileBytes = fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0;
    } catch {
      this.activeFileBytes = 0;
    }

    return targetPath;
  }

  getStream() {
    const filePath = this.getActiveFilePath();
    if (!filePath) return null;

    if (this.activeStream && this.activeStream.path === filePath) {
      return this.activeStream;
    }

    if (this.activeStream) {
      try {
        this.activeStream.end();
      } catch {}
      this.activeStream = null;
    }

    try {
      const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
      stream.on('error', (err) => {
        this.isDegraded = true;
        this.logWarnOnce('Hiba a diagnosztikai naplófájl írásakor: ' + err.message);
      });
      this.activeStream = stream;
      return stream;
    } catch (err) {
      this.isDegraded = true;
      this.logWarnOnce('Nem sikerült megnyitni a diagnosztikai naplófájlt: ' + err.message);
      return null;
    }
  }

  writeLines(linesWithBytes) {
    if (linesWithBytes.length === 0) return true;
    const stream = this.getStream();
    if (!stream) {
      this.isDegraded = true;
      return false;
    }

    let ok = true;
    for (const item of linesWithBytes) {
      const chunk = item.line + '\n';
      const canWrite = stream.write(chunk);
      this.activeFileBytes += item.bytes + 1;
      if (!canWrite) ok = false;
    }

    // Ha elérte a méretkorlátot, a következő írás új fájlt nyit
    if (this.activeFileBytes >= this.maxFileSizeBytes) {
      try {
        stream.end();
      } catch {}
      this.activeStream = null;
      this.pruneOldLogs();
    }

    return ok;
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

      // 1. 7 napnál régebbi fájlok törlése
      const remainingFiles = [];
      for (const file of logFiles) {
        if (now - file.mtimeMs > retentionMs && file.fullPath !== this.activeFilePath) {
          try {
            fs.unlinkSync(file.fullPath);
          } catch {}
        } else {
          remainingFiles.push(file);
        }
      }

      // 2. Összméret korlát ellenőrzése (maxTotalSizeBytes, alapértelmezett: 25 MiB)
      let totalSize = remainingFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > this.maxTotalSizeBytes) {
        // Rendezzük a legrégebbi elöl
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

  async closeActiveStream() {
    if (!this.activeStream) return;
    const stream = this.activeStream;
    this.activeStream = null;

    return new Promise((resolve) => {
      try {
        stream.end(() => resolve());
      } catch {
        resolve();
      }
    });
  }
}

/**
 * 5. DiagnosticsService - Központi vezérlő osztály
 */
class DiagnosticsService {
  constructor(options = {}) {
    this.enabled = options.enabled !== undefined ? options.enabled : config.diagnosticsEnabled;
    this.appVersion = packageJson.version || '1.33.0';
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
    this.isFlushing = false;
    this.drainWaiter = null;
    this.workerTimer = null;
    this.pruneTimer = null;

    if (this.enabled) {
      this.init();
    }
  }

  init() {
    const dirCheck = this.writer.validateDirectory();
    if (!dirCheck.valid) {
      console.warn(`[DiagnosticsService] Inicializálási figyelmeztetés: ${dirCheck.reason}`);
    } else {
      this.writer.ensureDirectory();
      this.writer.pruneOldLogs();
    }

    // Háttérfolyamat a memóriasor leürítésére
    this.workerTimer = setInterval(() => {
      this.processQueue();
    }, 200);

    // Periodikus takarítás és deduplikációs tisztítás (5 percenként)
    this.pruneTimer = setInterval(() => {
      this.writer.pruneOldLogs();
      this.dedupCache.cleanExpired();
    }, 300000);
  }

  /**
   * Sémaellenőrzés és OWASP adatminimalizálás (Whitelisting)
   */
  sanitizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const source = raw.source === 'student_browser' ? 'student_browser' : 'server';
    if (!ALLOWED_SOURCES.has(source)) return null;

    const event = String(raw.event || '').trim();
    if (!ALLOWED_EVENTS.has(event)) return null;

    const sanitized = {
      schemaVersion: 1,
      appVersion: this.appVersion,
      receivedAt: new Date().toISOString(),
      runId: this.runId,
      source,
      event
    };

    if (source === 'student_browser' && typeof raw.clientAt === 'string') {
      sanitized.clientAt = raw.clientAt.slice(0, 35);
    }

    if (typeof raw.route === 'string') {
      sanitized.route = raw.route.slice(0, 50);
    }

    if (typeof raw.requestId === 'string' && HEX_32_REGEX.test(raw.requestId)) {
      sanitized.requestId = raw.requestId.toLowerCase();
    }

    if (typeof raw.operationId === 'string' && HEX_32_REGEX.test(raw.operationId)) {
      sanitized.operationId = raw.operationId.toLowerCase();
    }

    if (typeof raw.eventId === 'string' && HEX_32_REGEX.test(raw.eventId)) {
      sanitized.eventId = raw.eventId.toLowerCase();
    }

    if (typeof raw.outcome === 'string' && ALLOWED_OUTCOMES.has(raw.outcome)) {
      sanitized.outcome = raw.outcome;
    }

    if (typeof raw.reasonCode === 'string') {
      sanitized.reasonCode = raw.reasonCode.replace(/[^A-Z0-9_]/g, '').slice(0, 40);
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
   * Szerveroldali esemény sorba állítása
   */
  logEvent(entry) {
    if (!this.enabled) return false;
    const sanitized = this.sanitizeEntry(entry);
    if (!sanitized) return false;

    const json = JSON.stringify(sanitized);
    const bytes = Buffer.byteLength(json, 'utf8');

    const accepted = this.queue.enqueueSingle(json, bytes);
    return accepted;
  }

  /**
   * Kliensoldali eseménycsomag atomi fogadása (Pontosítási terv 1. és 2. pont)
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

    // Sebességkorlátozás ellenőrzése
    let participantHash = null;
    if (sessionToken) {
      participantHash = crypto.createHash('sha256').update(String(sessionToken)).digest('hex').slice(0, 16);
    }
    if (!this.rateLimiter.checkAndIncrement(participantHash)) {
      return { status: 429, code: 'RATE_LIMIT_EXCEEDED' };
    }

    // 1. Sémaellenőrzés és tisztítás
    const validatedEntries = [];
    for (const raw of events) {
      const sanitized = this.sanitizeEntry({ ...raw, source: 'student_browser' });
      if (!sanitized || !sanitized.eventId) {
        return { status: 400, code: 'INVALID_EVENT_SCHEMA' };
      }
      validatedEntries.push(sanitized);
    }

    // 2. Ismert eventId-k és csomagon belüli ismétlések kiszűrése
    const seenInBatch = new Set();
    const newItemsWithBytes = [];

    for (const entry of validatedEntries) {
      if (this.dedupCache.has(entry.eventId) || seenInBatch.has(entry.eventId)) {
        continue; // Már ismert vagy ismételt a csomagban
      }
      seenInBatch.add(entry.eventId);
      const json = JSON.stringify(entry);
      const bytes = Buffer.byteLength(json, 'utf8');
      newItemsWithBytes.push({ entry: json, bytes, eventId: entry.eventId });
    }

    // Ha az összes esemény már ismert volt, azonnal 204
    if (newItemsWithBytes.length === 0) {
      return { status: 204 };
    }

    // 3. Atomi döntés a teljes új sorozatról
    let totalBytes = 0;
    for (const item of newItemsWithBytes) {
      totalBytes += item.bytes;
    }

    if (!this.queue.canAccept(newItemsWithBytes.length, totalBytes)) {
      // Egyetlen sort és egyetlen eventId-t sem veszünk át!
      this.queue.droppedEventsCount += newItemsWithBytes.length;
      return { status: 503, code: 'BUFFER_FULL_RETRY_LATER' };
    }

    // Befér: egyszerre bekerül mind a memóriasorba és a deduplikációs gyorsítótárba
    this.queue.enqueueBatch(newItemsWithBytes.map(i => ({ entry: i.entry, bytes: i.bytes })));
    for (const item of newItemsWithBytes) {
      this.dedupCache.add(item.eventId);
    }

    return { status: 204 };
  }

  processQueue() {
    if (this.isFlushing || this.queue.size() === 0) return;
    const chunk = this.queue.dequeueChunk(50);
    if (chunk.length === 0) return;

    const lines = chunk.map(c => ({ line: c.entry, bytes: c.bytes }));
    const ok = this.writer.writeLines(lines);
    this.totalWritten += lines.length;

    if (!ok && this.writer.activeStream) {
      // Backpressure: megvárjuk a draint
      this.writer.activeStream.once('drain', () => {
        // Folytatódhat a következő körben
      });
    }
  }

  /**
   * Állapotlekérdezés tanári felülethez
   */
  getStatus() {
    let diskSizeBytes = 0;
    let exportAvailable = false;

    if (this.writer.isConfigurationValid && fs.existsSync(this.writer.dir)) {
      try {
        const files = fs.readdirSync(this.writer.dir);
        for (const f of files) {
          if (LOG_FILE_REGEX.test(f)) {
            const stats = fs.statSync(path.join(this.writer.dir, f));
            diskSizeBytes += stats.size;
            exportAvailable = true;
          }
        }
      } catch {}
    }

    return {
      enabled: this.enabled,
      isDegraded: this.writer.isDegraded || !this.writer.isConfigurationValid,
      configurationError: !this.writer.isConfigurationValid,
      runId: this.runId,
      startedAt: this.startedAt,
      droppedEventsCount: this.queue.droppedEventsCount,
      totalWritten: this.totalWritten,
      diskSizeBytes,
      exportAvailable
    };
  }

  /**
   * Biztonságos exportfolyam létrehozása az utolsó 24 óra logfájljaiból
   */
  createExportStream(hours = 24) {
    if (!this.writer.isConfigurationValid || !fs.existsSync(this.writer.dir)) {
      const emptyStream = new Readable({ read() { this.push(null); } });
      return emptyStream;
    }

    const cutoff = Date.now() - (hours * 3600000);
    const validFiles = [];

    try {
      const entries = fs.readdirSync(this.writer.dir);
      for (const f of entries) {
        if (!LOG_FILE_REGEX.test(f)) continue;
        const full = path.join(this.writer.dir, f);
        try {
          const stats = fs.statSync(full);
          if (stats.mtimeMs >= cutoff || stats.size > 0) {
            validFiles.push({ full, mtimeMs: stats.mtimeMs });
          }
        } catch {}
      }
    } catch {}

    validFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

    let fileIndex = 0;
    let currentReadStream = null;
    let remainder = '';

    const stream = new Readable({
      read() {
        if (currentReadStream) return;

        if (fileIndex >= validFiles.length) {
          if (remainder.trim()) {
            this.push(remainder.trim() + '\n');
            remainder = '';
          }
          this.push(null);
          return;
        }

        const fileInfo = validFiles[fileIndex++];
        currentReadStream = fs.createReadStream(fileInfo.full, { encoding: 'utf8' });

        currentReadStream.on('data', (chunk) => {
          const text = remainder + chunk;
          const lines = text.split('\n');
          remainder = lines.pop(); // utolsó csonka sor megőrzése
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              this.push(trimmed + '\n');
            }
          }
        });

        currentReadStream.on('end', () => {
          currentReadStream = null;
          this._read();
        });

        currentReadStream.on('error', (err) => {
          console.warn('[Diagnostics Export] Hiba a fájl olvasásakor:', err.message);
          currentReadStream = null;
          this._read();
        });
      }
    });

    return stream;
  }

  /**
   * Szabályos leállás és sorürítés határidővel (v1.2: flushAndClose)
   */
  async flushAndClose(timeoutMs = 2000) {
    // 1. Időzítők leállítása
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }

    if (!this.enabled) return true;

    return new Promise((resolve) => {
      let isSettled = false;
      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          resolve(false); // Határidő túllépése
        }
      }, timeoutMs);

      // Kiszolgáljuk a még memóriában lévő sorokat
      try {
        while (this.queue.size() > 0) {
          const chunk = this.queue.dequeueChunk(100);
          if (chunk.length === 0) break;
          const lines = chunk.map(c => ({ line: c.entry, bytes: c.bytes }));
          this.writer.writeLines(lines);
          this.totalWritten += lines.length;
        }
      } catch (err) {
        clearTimeout(timer);
        isSettled = true;
        resolve(false);
        return;
      }

      this.writer.closeActiveStream().then(() => {
        if (!isSettled) {
          clearTimeout(timer);
          isSettled = true;
          resolve(true);
        }
      }).catch(() => {
        if (!isSettled) {
          clearTimeout(timer);
          isSettled = true;
          resolve(false);
        }
      });
    });
  }
}

// Alapértelmezett singleton példány a rendszer futásához
const defaultDiagnosticsService = new DiagnosticsService();

module.exports = defaultDiagnosticsService;
module.exports.DiagnosticsService = DiagnosticsService;
module.exports.RingBufferQueue = RingBufferQueue;
module.exports.DeduplicationCache = DeduplicationCache;
module.exports.SlidingWindowRateLimiter = SlidingWindowRateLimiter;
module.exports.DiagnosticsFileWriter = DiagnosticsFileWriter;
