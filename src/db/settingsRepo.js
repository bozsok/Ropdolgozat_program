const db = require('./init');
const config = require('../../config');

// Rendszerbeállítások tábla meglétének biztosítása
db.exec(`
  CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

/**
 * Alapértelmezett értékelési határok és tantermi beállítások
 */
const DEFAULT_GRADE_THRESHOLDS = {
  5: 90,
  4: 75,
  3: 55,
  2: 30
};

const DEFAULT_CLASSROOM_SETTINGS = {
  anonym_mode_default: true,
  shuffle_questions: true,
  shuffle_options: true,
  hide_immediate_feedback: false
};

/**
 * Az összes rendszerbeállítás lekérése
 */
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM system_settings').all();
  const settingsMap = new Map();
  for (const r of rows) {
    try {
      settingsMap.set(r.key, JSON.parse(r.value));
    } catch {
      settingsMap.set(r.key, r.value);
    }
  }

  const gradeThresholds = settingsMap.has('grade_thresholds')
    ? settingsMap.get('grade_thresholds')
    : { ...DEFAULT_GRADE_THRESHOLDS };

  const rawClassroom = settingsMap.has('classroom_settings') ? settingsMap.get('classroom_settings') : {};
  const anonymMode = rawClassroom.anonym_mode_default !== undefined
    ? Boolean(rawClassroom.anonym_mode_default)
    : (rawClassroom.projector_mode_default !== undefined ? Boolean(rawClassroom.projector_mode_default) : DEFAULT_CLASSROOM_SETTINGS.anonym_mode_default);

  const classroomSettings = {
    anonym_mode_default: anonymMode,
    shuffle_questions: rawClassroom.shuffle_questions !== undefined ? Boolean(rawClassroom.shuffle_questions) : DEFAULT_CLASSROOM_SETTINGS.shuffle_questions,
    shuffle_options: rawClassroom.shuffle_options !== undefined ? Boolean(rawClassroom.shuffle_options) : DEFAULT_CLASSROOM_SETTINGS.shuffle_options,
    hide_immediate_feedback: rawClassroom.hide_immediate_feedback !== undefined ? Boolean(rawClassroom.hide_immediate_feedback) : DEFAULT_CLASSROOM_SETTINGS.hide_immediate_feedback
  };

  return {
    grade_thresholds: gradeThresholds,
    classroom_settings: classroomSettings
  };
}

/**
 * Rendszerbeállítások mentése validációval
 */
function saveSettings({ grade_thresholds, classroom_settings }) {
  // Ponthatárok validációja
  if (grade_thresholds) {
    const t2 = Number(grade_thresholds[2] ?? grade_thresholds['2']);
    const t3 = Number(grade_thresholds[3] ?? grade_thresholds['3']);
    const t4 = Number(grade_thresholds[4] ?? grade_thresholds['4']);
    const t5 = Number(grade_thresholds[5] ?? grade_thresholds['5']);

    if (!Number.isFinite(t2) || !Number.isFinite(t3) || !Number.isFinite(t4) || !Number.isFinite(t5)) {
      throw new Error('A ponthatároknak érvényes számoknak kell lenniük!');
    }
    if (t2 <= 0 || t2 >= t3 || t3 >= t4 || t4 >= t5 || t5 > 100) {
      throw new Error('A ponthatároknak szigorúan növekvő sorrendben kell állniuk (0 < 2-es < 3-as < 4-es < 5-ös <= 100)!');
    }
  }

  const tx = db.transaction(() => {
    const upsertStmt = db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `);

    if (grade_thresholds) {
      const sanitizedThresholds = {
        2: Number(grade_thresholds[2] ?? grade_thresholds['2']),
        3: Number(grade_thresholds[3] ?? grade_thresholds['3']),
        4: Number(grade_thresholds[4] ?? grade_thresholds['4']),
        5: Number(grade_thresholds[5] ?? grade_thresholds['5'])
      };
      upsertStmt.run('grade_thresholds', JSON.stringify(sanitizedThresholds));
    }

    if (classroom_settings && typeof classroom_settings === 'object') {
      const anonymVal = classroom_settings.anonym_mode_default !== undefined
        ? Boolean(classroom_settings.anonym_mode_default)
        : Boolean(classroom_settings.projector_mode_default);
      const sanitizedClassroom = {
        anonym_mode_default: anonymVal,
        shuffle_questions: Boolean(classroom_settings.shuffle_questions),
        shuffle_options: Boolean(classroom_settings.shuffle_options),
        hide_immediate_feedback: Boolean(classroom_settings.hide_immediate_feedback)
      };
      upsertStmt.run('classroom_settings', JSON.stringify(sanitizedClassroom));
    }
  });

  tx();
  return getSettings();
}

/**
 * Beállítások gyári alapértékekre állítása
 */
function resetSettings() {
  db.prepare("DELETE FROM system_settings WHERE key IN ('grade_thresholds', 'classroom_settings')").run();
  return getSettings();
}

/**
 * Aktuális alapértelmezett ponthatárok lekérdezése dolgozat indításához
 */
function getActiveDefaultThresholds() {
  const row = db.prepare("SELECT value FROM system_settings WHERE key = 'grade_thresholds'").get();
  if (row) {
    try {
      return JSON.parse(row.value);
    } catch {
      // hiba esetén fallback
    }
  }
  return config.defaultGradeThresholds || DEFAULT_GRADE_THRESHOLDS;
}

module.exports = {
  getSettings,
  saveSettings,
  resetSettings,
  getActiveDefaultThresholds,
  DEFAULT_GRADE_THRESHOLDS,
  DEFAULT_CLASSROOM_SETTINGS
};
