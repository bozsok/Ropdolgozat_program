const path = require('path');

const config = {
  // Alapértelmezett port (Project context & Rule 7: 3000)
  port: parseInt(process.env.PORT || '3000', 10),

  // Tanári vezérlőpult jelszava
  adminPin: process.env.ADMIN_PIN || 'admin123',

  // Alapértelmezett KRÉTA ponthatárok százalékban (PRD & context)
  // 0-29%: 1, 30-54%: 2, 55-74%: 3, 75-89%: 4, 90-100%: 5
  defaultGradeThresholds: {
    2: 30,
    3: 55,
    4: 75,
    5: 90
  },

  // Fájlrendszer elérési utak
  dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'ropdolgozat.db'),
  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, 'data', 'uploads'),
  publicDir: process.env.PUBLIC_DIR || path.join(__dirname, 'public'),

  // Munkamenet és Cookie beállítások
  cookieSecret: process.env.COOKIE_SECRET || 'ropdolgozat-titkos-kulcs-2026',
  cookieName: 'ropdolgozat_admin_auth',

  // Diagnosztikai alrendszer beállításai (Report Beépítési terv 01 & Pontosítási terv 01)
  diagnosticsEnabled: process.env.DIAGNOSTICS_ENABLED === 'true' || false,
  diagnosticsDir: process.env.DIAGNOSTICS_DIR || path.join(__dirname, 'data', 'diagnostics'),
  diagnosticsMaxQueueSize: parseInt(process.env.DIAGNOSTICS_MAX_QUEUE_SIZE || '2048', 10),
  diagnosticsMaxQueueBytes: parseInt(process.env.DIAGNOSTICS_MAX_QUEUE_BYTES || '2097152', 10), // 2 MiB
  diagnosticsMaxFileSizeBytes: parseInt(process.env.DIAGNOSTICS_MAX_FILE_BYTES || '5242880', 10), // 5 MiB
  diagnosticsMaxTotalSizeBytes: parseInt(process.env.DIAGNOSTICS_MAX_TOTAL_BYTES || '26214400', 10), // 25 MiB
  diagnosticsRetentionDays: parseInt(process.env.DIAGNOSTICS_RETENTION_DAYS || '7', 10),
  diagnosticsRateLimitParticipantPerMin: parseInt(process.env.DIAGNOSTICS_RATE_LIMIT_PARTICIPANT || '6', 10),
  diagnosticsRateLimitGlobalPerMin: parseInt(process.env.DIAGNOSTICS_RATE_LIMIT_GLOBAL || '300', 10)
};

module.exports = config;

