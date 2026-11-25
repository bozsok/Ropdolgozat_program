/**
 * grader.js - Válaszok automatikus kiértékelése és KRÉTA érdemjegy számítás
 */

/**
 * ABCD opció kanonikus szöveges/azonosító értékének kinyerése
 * (visszafelé kompatibilis: támogatja a sima string és a { text, image_path } objektum opciókat is)
 */
function getOptionValue(opt) {
  if (opt === null || opt === undefined) return '';
  if (typeof opt === 'object') {
    const txt = opt.text !== undefined && opt.text !== null ? String(opt.text).trim() : '';
    const img = opt.image_path !== undefined && opt.image_path !== null ? String(opt.image_path).trim() : '';
    return txt || img;
  }
  return String(opt).trim();
}

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
 * Válasz(ok) parszolása tömbbé (többválasztós JSON tömb vagy egyetlen string esetén is)
 */
function parseAnswerList(raw) {
  if (raw === null || raw === undefined) return [];
  const str = String(raw).trim();
  if (!str) return [];
  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map(item => String(item ?? '').trim()).filter(Boolean);
      }
    } catch {
      // Nem érvényes JSON tömb -> sima szöveges válaszként kezeljük
    }
  }
  return [str];
}

/**
 * Eldönti, hogy egy kérdéshez több helyes ABCD válasz tartozik-e
 */
function isMultipleChoiceCorrectAnswer(questionType, correctAnswer) {
  if (questionType !== 'ABCD') return false;
  return parseAnswerList(correctAnswer).length > 1;
}

/**
 * ABCD opció normalizálása összehasonlításhoz (betűjel A-F feloldással együtt, ha van options)
 */
function resolveAbcdCanonical(val, options = []) {
  const lower = String(val ?? '').trim().toLowerCase();
  if (!lower) return '';
  if (Array.isArray(options) && options.length > 0) {
    const letterMap = { 'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4, 'f': 5 };
    const idx = letterMap[lower];
    if (idx !== undefined && options[idx] !== undefined) {
      const optVal = getOptionValue(options[idx]).toLowerCase();
      if (optVal) return optVal;
    }
  }
  return lower;
}

/**
 * Válasz automatikus gépi kiértékelése
 * @param {string} questionType - 'ABCD' | 'TF' | 'SHORT'
 * @param {string} submittedAnswer - A diák által beküldött válasz
 * @param {string} correctAnswer - Az adatbázisban tárolt helyes válasz (szöveg vagy JSON)
 * @param {number} maxPoints - A kérdésre adható maximális pontszám (alapértelmezett: 1.0)
 * @returns {{ eval_status: 'CORRECT'|'PARTIAL'|'WRONG', points_earned: number, is_correct: number }}
 */
function evaluateAnswer(questionType, submittedAnswer, correctAnswer, maxPoints = 1.0, options = []) {
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
    const acceptedAnswers = parseAnswerList(rawCorrect);

    // Több helyes válasz (többválasztós ABCD): SZIGORÚ (minden vagy semmi) halmazegyezés
    if (acceptedAnswers.length > 1) {
      const submittedAnswers = parseAnswerList(rawSubmitted);
      const acceptedSet = new Set(acceptedAnswers.map(ans => resolveAbcdCanonical(ans, options)).filter(Boolean));
      const submittedSet = new Set(submittedAnswers.map(ans => resolveAbcdCanonical(ans, options)).filter(Boolean));

      const isMatch = acceptedSet.size > 0
        && submittedSet.size === acceptedSet.size
        && [...acceptedSet].every(ans => submittedSet.has(ans));

      return {
        eval_status: isMatch ? 'CORRECT' : 'WRONG',
        points_earned: isMatch ? points : 0.0,
        is_correct: isMatch ? 1 : 0
      };
    }

    // Egyetlen helyes válasz (hagyományos ABCD)
    let isMatch = acceptedAnswers.some(ans => ans.toLowerCase() === rawSubmitted.toLowerCase());

    // Kompatibilitási fallback: ha a correctAnswer betűjel (pl. 'A'-'F'), és van options tömb
    if (!isMatch && Array.isArray(options) && options.length > 0) {
      const letterMap = { 'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4, 'f': 5 };
      const subLower = rawSubmitted.toLowerCase();
      acceptedAnswers.forEach(ans => {
        const idx = letterMap[ans.toLowerCase()];
        const optVal = idx !== undefined && options[idx] !== undefined ? getOptionValue(options[idx]) : '';
        if (optVal && optVal.toLowerCase() === subLower) {
          isMatch = true;
        }
      });
      // Vagy fordítva: ha a diák betűjelet küldött be, de a correct_answer a szöveg/kép
      const subIdx = letterMap[subLower];
      const subOptVal = subIdx !== undefined && options[subIdx] !== undefined ? getOptionValue(options[subIdx]) : '';
      if (!isMatch && subOptVal) {
        const optLower = subOptVal.toLowerCase();
        if (acceptedAnswers.some(ans => ans.toLowerCase() === optLower)) {
          isMatch = true;
        }
      }
    }

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

    // Különféle megadási formák egységesítése ('a' = igaz, 'b' = hamis is támogatva)
    const isTrue = val => ['igaz', 'true', 'i', 't', '1', 'a'].includes(val);
    const isFalse = val => ['hamis', 'false', 'h', 'f', '0', 'b'].includes(val);

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
 * Szöveges érdemjegy megnevezés (MTA 12. kiadása szerinti kisbetűs magyar helyesírással)
 */
function getGradeText(grade) {
  switch (Number(grade)) {
    case 5: return '5 (jeles)';
    case 4: return '4 (jó)';
    case 3: return '3 (közepes)';
    case 2: return '2 (elégséges)';
    case 1: return '1 (elégtelen)';
    default: return '–';
  }
}

module.exports = {
  getOptionValue,
  parseAnswerList,
  isMultipleChoiceCorrectAnswer,
  normalizeText,
  evaluateAnswer,
  calculateGrade,
  getGradeText
};

