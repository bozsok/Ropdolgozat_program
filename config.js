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
  uploadsDir: path.join(__dirname, 'data', 'uploads'),
  publicDir: path.join(__dirname, 'public'),

  // Munkamenet és Cookie beállítások
  cookieSecret: process.env.COOKIE_SECRET || 'ropdolgozat-titkos-kulcs-2026',
  cookieName: 'ropdolgozat_admin_auth'
};

module.exports = config;

