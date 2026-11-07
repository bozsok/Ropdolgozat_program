/**
 * grader.js - Válaszok automatikus kiértékelése és KRÉTA érdemjegy számítás
 */

/**
 * Szöveges válasz tisztítása összehasonlításhoz:
 * Kisbetűsítés, felesleges szóközök és írásjelek egységesítése
 */
function normalizeText(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Válasz automatikus gépi kiértékelése
 * @param {string} questionType - 'ABCD' | 'TF' | 'SHORT'
 * @param {string} submittedAnswer - A diák által beküldött válasz
 * @param {string} correctAnswer - Az adatbázisban tárolt helyes válasz (szöveg vagy JSON)
 * @param {number} maxPoints - A kérdésre adható maximális pontszám (alapértelmezett: 1.0)
 * @returns {{ eval_status: 'CORRECT'|'PARTIAL'|'WRONG', points_earned: number, is_correct: number }}
 */
function evaluateAnswer(questionType, submittedAnswer, correctAnswer, maxPoints = 1.0) {
  const points = Number(maxPoints) || 1.0;
  const rawSubmitted = (submittedAnswer !== null && submittedAnswer !== undefined) ? String(submittedAnswer).trim() : '';
  const rawCorrect = (correctAnswer !== null && correctAnswer !== undefined) ? String(correctAnswer).trim() : '';

  if (!rawSubmitted) {
    return {
      eval_status: 'WRONG',
      points_earned: 0.0,
      is_correct: 0
    };
  }

  // 1. Feleletválasztós (ABCD) kiértékelése
  if (questionType === 'ABCD') {
    // Támogatjuk, ha a correctAnswer JSON tömb vagy sima szöveg
    let acceptedAnswers = [];
    try {
      const parsed = JSON.parse(rawCorrect);
      if (Array.isArray(parsed)) {
        acceptedAnswers = parsed.map(a => String(a).trim());
      } else {
        acceptedAnswers = [rawCorrect];
      }
    } catch {
      acceptedAnswers = [rawCorrect];
    }

    const isMatch = acceptedAnswers.some(ans => ans.toLowerCase() === rawSubmitted.toLowerCase());

    return {
      eval_status: isMatch ? 'CORRECT' : 'WRONG',
      points_earned: isMatch ? points : 0.0,
      is_correct: isMatch ? 1 : 0
    };
  }

  // 2. Igaz / Hamis (TF) kiértékelése
  if (questionType === 'TF') {
    const normSub = normalizeText(rawSubmitted);
    const normCor = normalizeText(rawCorrect);

    // Különféle megadási formák egységesítése
    const isTrue = val => ['igaz', 'true', 'i', 't', '1'].includes(val);
    const isFalse = val => ['hamis', 'false', 'h', 'f', '0'].includes(val);

    let isMatch = false;
    if (isTrue(normCor) && isTrue(normSub)) isMatch = true;
    else if (isFalse(normCor) && isFalse(normSub)) isMatch = true;
    else isMatch = (normSub === normCor);

    return {
      eval_status: isMatch ? 'CORRECT' : 'WRONG',
      points_earned: isMatch ? points : 0.0,
      is_correct: isMatch ? 1 : 0
    };
  }

  // 3. Rövid szöveges válasz (SHORT) kiértékelése
  if (questionType === 'SHORT') {
    const normSub = normalizeText(rawSubmitted);

    // Lehetséges alternatívák feldolgozása (JSON tömb, vagy '|' illetve ';' elválasztott szöveg)
    let acceptedList = [];
    try {
      const parsed = JSON.parse(rawCorrect);
      if (Array.isArray(parsed)) {
        acceptedList = parsed.map(normalizeText);
      } else {
        acceptedList = [normalizeText(rawCorrect)];
      }
    } catch {
      if (rawCorrect.includes('|')) {
        acceptedList = rawCorrect.split('|').map(normalizeText);
      } else if (rawCorrect.includes(';')) {
        acceptedList = rawCorrect.split(';').map(normalizeText);
      } else {
        acceptedList = [normalizeText(rawCorrect)];
      }
    }

    const isMatch = acceptedList.some(acc => acc === normSub);

    return {
      eval_status: isMatch ? 'CORRECT' : 'WRONG',
      points_earned: isMatch ? points : 0.0,
      is_correct: isMatch ? 1 : 0
    };
  }

  // Ismeretlen kérdéstípus esetén alapértelmezett pontos szövegegyezés
  const isExact = normalizeText(rawSubmitted) === normalizeText(rawCorrect);
  return {
    eval_status: isExact ? 'CORRECT' : 'WRONG',
    points_earned: isExact ? points : 0.0,
    is_correct: isExact ? 1 : 0
  };
}

/**
 * Százalékos eredményből KRÉTA érdemjegy számítása
 * @param {number} percentage - Elért százalék (0 - 100)
 * @param {Object} thresholds - Ponthatárok pl. { 2: 30, 3: 55, 4: 75, 5: 90 }
 * @returns {number} 1 | 2 | 3 | 4 | 5
 */
function calculateGrade(percentage, thresholds = { 2: 30, 3: 55, 4: 75, 5: 90 }) {
  const pct = Math.round(Number(percentage) || 0);

  const t5 = Number(thresholds[5] ?? thresholds['5'] ?? 90);
  const t4 = Number(thresholds[4] ?? thresholds['4'] ?? 75);
  const t3 = Number(thresholds[3] ?? thresholds['3'] ?? 55);
  const t2 = Number(thresholds[2] ?? thresholds['2'] ?? 30);

  if (pct >= t5) return 5;
  if (pct >= t4) return 4;
  if (pct >= t3) return 3;
  if (pct >= t2) return 2;
  return 1;
}

/**
 * Szöveges érdemjegy megnevezés (MTA helyesírás szerint)
 */
function getGradeText(grade) {
  switch (Number(grade)) {
    case 5: return 'Jeles (5)';
    case 4: return 'Jó (4)';
    case 3: return 'Közepes (3)';
    case 2: return 'Elégséges (2)';
    case 1: return 'Elégtelen (1)';
    default: return '–';
  }
}

module.exports = {
  normalizeText,
  evaluateAnswer,
  calculateGrade,
  getGradeText
};

