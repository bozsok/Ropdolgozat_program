const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const archiver = require('archiver');
const config = require('../../config');
const sessionRepo = require('../db/sessionRepo');
const grader = require('./grader');

/**
 * exporter.js - Eredmények exportálása (KRÉTA Excel, Interaktív HTML, Egyéni ZIP)
 */

const LOGO_PATH = path.join(__dirname, '../../public/img/logo.png');
let cachedLogoDataUri = null;

function getLogoDataUri() {
  if (!cachedLogoDataUri) {
    try {
      if (fs.existsSync(LOGO_PATH)) {
        const buf = fs.readFileSync(LOGO_PATH);
        cachedLogoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
      } else {
        cachedLogoDataUri = '';
      }
    } catch {
      cachedLogoDataUri = '';
    }
  }
  return cachedLogoDataUri;
}

function getColLetter(colIdx) {
  let letter = '';
  while (colIdx > 0) {
    const mod = (colIdx - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    colIdx = Math.floor((colIdx - mod) / 26);
  }
  return letter;
}

/**
 * XSS elleni szöveg- és attribútumfertőtlenítés
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * XSS-biztos JSON szerializálás HTML <script> blokkba ágyazáshoz
 */
function escapeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Szövegformázó (a public/js/utils.js formatCode függvényének szerveroldali párja)
 */
function formatRichTextHtml(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  const codeBlocks = [];
  html = html.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<code class="inline-code">${code}</code>`);
    return `\u0000CODE${idx}\u0000`;
  });

  html = html.replace(/\*\*([^\s*](?:(?:(?!\*\*)[^\n])*?[^\s*])?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^\s_](?:(?:(?!__)[^\n])*?[^\s_])?)__/g, '<u>$1</u>');
  html = html.replace(/\*([^\s*](?:[^*\n]*?[^\s*])?)\*/g, '<em>$1</em>');
  html = html.replace(/\^([^\^\n]+?)\^/g, '<sup>$1</sup>');
  html = html.replace(/~([^~\n]+?)~/g, '<sub>$1</sub>');
  html = html.replace(/\r?\n/g, '<br>');
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => codeBlocks[Number(idx)] || '');

  return html;
}

/**
 * Formázójelek eltávolítása egyszerű szöveges (Excel megjegyzés) megjelenítéshez
 */
function stripFormatting(text) {
  if (!text) return '';
  return String(text)
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^\s*](?:(?:(?!\*\*)[^\n])*?[^\s*])?)\*\*/g, '$1')
    .replace(/__([^\s_](?:(?:(?!__)[^\n])*?[^\s_])?)__/g, '$1')
    .replace(/\*([^\s*](?:[^*\n]*?[^\s*])?)\*/g, '$1')
    .replace(/\^([^\^\n]+?)\^/g, '$1')
    .replace(/~([^~\n]+?)~/g, '$1')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Helyi /uploads/... relatív URL biztonságos feloldása abszolút fájlrendszeri útvonalra
 */
function resolveLocalUploadPath(relUrl) {
  if (!relUrl || typeof relUrl !== 'string') return null;
  const trimmed = relUrl.trim();
  if (!trimmed.startsWith('/uploads/')) return null;
  const relPart = trimmed.slice('/uploads/'.length).replace(/^\/+/, '');
  if (!relPart || relPart.includes('..')) return null;
  const baseDir = path.resolve(config.uploadsDir);
  const fullPath = path.resolve(baseDir, relPart);
  if (!fullPath.startsWith(baseDir + path.sep)) return null;
  return fullPath;
}

function getMimeTypeForImage(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

/**
 * Helyi /uploads/... kép beolvasása beágyazható base64 Data URI-ként (memóriában gyorsítótárazva)
 */
function imageUrlToDataUri(relUrl, imageCache) {
  const key = String(relUrl || '').trim();
  if (!key) return '';
  if (imageCache && imageCache.has(key)) {
    return imageCache.get(key);
  }
  let dataUri = '';
  try {
    const fullPath = resolveLocalUploadPath(key);
    if (fullPath && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const buf = fs.readFileSync(fullPath);
      const mime = getMimeTypeForImage(fullPath);
      dataUri = `data:${mime};base64,${buf.toString('base64')}`;
    }
  } catch {
    dataUri = '';
  }
  if (imageCache) imageCache.set(key, dataUri);
  return dataUri;
}

function isUploadImageUrl(val) {
  return /^\/uploads\/.+\.(?:png|jpe?g|webp|gif|svg)$/i.test(String(val || '').trim());
}

function normalizeOptionItem(opt) {
  if (opt && typeof opt === 'object') {
    const text = opt.text !== undefined && opt.text !== null ? String(opt.text).trim() : '';
    const image_path = opt.image_path !== undefined && opt.image_path !== null ? String(opt.image_path).trim() : '';
    return { text, image_path, value: text || image_path };
  }
  const text = opt !== undefined && opt !== null ? String(opt).trim() : '';
  return { text, image_path: '', value: text };
}

/**
 * Egy válasz vagy megoldókulcs elemeinek feloldása opciószövegre és/vagy képútvonalra
 */
function resolveAnswerItems(rawAnswer, question, isCorrectField = false) {
  if (rawAnswer === null || rawAnswer === undefined) return [];
  const rawStr = String(rawAnswer).trim();
  if (!rawStr) return [];

  const qType = question ? question.question_type : '';
  const options = (question && Array.isArray(question.options)) ? question.options : [];
  const normalizedOpts = options.map((opt, idx) => ({
    ...normalizeOptionItem(opt),
    letter: String.fromCharCode(65 + idx)
  }));

  let rawValues = [];
  if (qType === 'ABCD') {
    const isMulti = isCorrectField && grader.isMultipleChoiceCorrectAnswer(qType, rawStr, options);
    rawValues = isMulti
      ? grader.parseAnswerList(rawStr)
      : grader.parseAnswerList(rawStr, options);
  } else if (isCorrectField && rawStr.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawStr);
      if (Array.isArray(parsed)) {
        rawValues = parsed.map(v => String(v ?? '').trim()).filter(Boolean);
      } else {
        rawValues = [rawStr];
      }
    } catch {
      rawValues = [rawStr];
    }
  } else {
    rawValues = [rawStr];
  }

  return rawValues.map(val => {
    if (normalizedOpts.length > 0) {
      const resolved = grader.resolveAbcdCanonical(val, options);
      let matched = normalizedOpts.find(item => item.value && item.value === resolved);
      if (!matched) {
        const ciMatches = normalizedOpts.filter(item => item.value && item.value.toLowerCase() === val.toLowerCase());
        if (ciMatches.length === 1) matched = ciMatches[0];
      }
      if (matched) {
        return { text: matched.text, image_path: matched.image_path, letter: matched.letter };
      }
    }
    if (isUploadImageUrl(val)) {
      return { text: '', image_path: val, letter: '' };
    }
    return { text: val, image_path: '', letter: '' };
  });
}

/**
 * Válasz renderelése offline-kompatibilis HTML-ként (beágyazott base64 képekkel, útvonalak nélkül)
 */
function renderAnswerHtml(rawAnswer, question, imageCache, { isCorrectField = false, imgResolver = null } = {}) {
  const items = resolveAnswerItems(rawAnswer, question, isCorrectField);
  if (items.length === 0) return '–';

  const renderSingle = (item) => {
    if (item.image_path) {
      const src = imgResolver ? imgResolver(item.image_path) : imageUrlToDataUri(item.image_path, imageCache);
      const imgHtml = src
        ? `<img src="${src}" alt="Válasz képe" class="export-answer-thumb">`
        : `<span class="export-img-missing">[Kép nem elérhető]</span>`;
      return item.text
        ? `<span class="export-answer-with-img">${imgHtml}<span>${formatRichTextHtml(item.text)}</span></span>`
        : `<span class="export-answer-with-img">${imgHtml}</span>`;
    }
    return formatRichTextHtml(item.text);
  };

  if (items.length === 1) {
    return renderSingle(items[0]);
  }

  // SHORT típusnál több elfogadott helyes válasz: "vagy" elválasztással
  if (isCorrectField && question && question.question_type !== 'ABCD') {
    return items.map(renderSingle).join(' <span class="export-or-sep">vagy</span> ');
  }

  return `<span class="export-answer-multi">${items.map(it => `<span class="export-answer-multi-item">${renderSingle(it)}</span>`).join('')}</span>`;
}

/**
 * Válasz olvasható, nyers útvonalmentes szöveges leírása (Excel cellamegjegyzéshez)
 */
function formatAnswerPlainText(rawAnswer, question, { isCorrectField = false } = {}) {
  const items = resolveAnswerItems(rawAnswer, question, isCorrectField);
  if (items.length === 0) return 'Nincs válasz';

  const parts = items.map(item => {
    const cleanText = stripFormatting(item.text);
    if (item.image_path) {
      const fileLabel = path.basename(item.image_path);
      if (cleanText) {
        return `${cleanText} [kép]`;
      }
      return item.letter
        ? `${item.letter}. képes válasz (${fileLabel})`
        : `Képes válasz (${fileLabel})`;
    }
    return cleanText || '–';
  });

  if (isCorrectField && question && question.question_type !== 'ABCD') {
    return parts.join(' vagy ');
  }
  return parts.join(', ');
}

function buildExcelCellNote(question, idx, ans) {
  const qText = stripFormatting(question.question_text) || '(Képes kérdés)';
  const imgSuffix = question.image_path ? ' [Kép csatolva]' : '';
  const correctPlain = formatAnswerPlainText(question.correct_answer, question, { isCorrectField: true });

  const texts = [
    { font: { name: 'Calibri', size: 10, bold: true }, text: `${idx + 1}. kérdés (${question.points} pont):\n` },
    { font: { name: 'Calibri', size: 10 }, text: `${qText}${imgSuffix}\n\n` },
    { font: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF15803D' } }, text: 'Helyes válasz: ' },
    { font: { name: 'Calibri', size: 10 }, text: correctPlain }
  ];

  // Ha diákcelláról van szó és a válasz eltér (hibás, részpontos vagy nincs megadva)
  if (ans !== undefined) {
    const isCorrect = ans && ans.eval_status === 'CORRECT';
    if (!isCorrect) {
      const submittedPlain = ans ? formatAnswerPlainText(ans.submitted_answer, question, { isCorrectField: false }) : 'Nincs válasz';
      texts.push(
        { font: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB91C1C' } }, text: '\nAdott válasz: ' },
        { font: { name: 'Calibri', size: 10 }, text: submittedPlain }
      );
    }
  }

  return { texts };
}

/**
 * 1. Csoportos KRÉTA-kompatibilis formázott Excel munkafüzet generálása
 */
async function generateExcelReport(sessionId) {
  const data = sessionRepo.getLiveMatrixData(sessionId);
  if (!data) throw new Error('A dolgozat nem található!');

  const { session, questions, participants, answers, totalMaxPoints } = data;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Röpdolgozat program';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Eredmények', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }]
  });

  const headers = ['Tanuló neve', 'Gép'];
  questions.forEach((q, idx) => {
    headers.push(idx + 1);
  });
  headers.push('Összpont', 'Százalék', 'KRÉTA jegy', 'Fókuszvesztés');

  const lastCol = getColLetter(headers.length);
  const todayFormatted = new Date().toLocaleDateString('hu-HU');

  // Fejléc sorok magassága (1–3. sor)
  worksheet.getRow(1).height = 24;
  worksheet.getRow(2).height = 18;
  worksheet.getRow(3).height = 18;

  // Logó beágyazása az A1:B3 területre
  if (fs.existsSync(LOGO_PATH)) {
    const logoImageId = workbook.addImage({
      filename: LOGO_PATH,
      extension: 'png'
    });
    worksheet.addImage(logoImageId, {
      tl: { col: 0.15, row: 0.15 },
      ext: { width: 135, height: 40 }
    });
  }

  // C1: Teszt címe
  worksheet.mergeCells(`C1:${lastCol}1`);
  const titleCell = worksheet.getCell('C1');
  titleCell.value = session.quiz_title;
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1E40AF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // C2: Tantárgy és évfolyam
  worksheet.mergeCells(`C2:${lastCol}2`);
  const metaCell = worksheet.getCell('C2');
  metaCell.value = `Tantárgy: ${session.subject_name} | Évfolyam: ${session.grade_level}. évfolyam`;
  metaCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // C3: Dátum, résztvevők, pontszám
  worksheet.mergeCells(`C3:${lastCol}3`);
  const dateCell = worksheet.getCell('C3');
  dateCell.value = `Dátum: ${todayFormatted} | Résztvevők száma: ${participants.length} fő | Maximális pontszám: ${totalMaxPoints} pont`;
  dateCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };
  dateCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // 4. Sor: Oszlopfejlécek (kérdéseknél kizárólag a sorszám + hover cellamegjegyzés)
  const headerRow = worksheet.addRow(headers);
  headerRow.height = 26;
  headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  for (let col = 1; col <= headers.length; col++) {
    const cell = headerRow.getCell(col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF1E40AF' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  }

  questions.forEach((q, qIdx) => {
    const qHeaderCell = headerRow.getCell(3 + qIdx);
    qHeaderCell.note = buildExcelCellNote(q, qIdx, undefined);
  });

  // Válaszok leképezése
  const answerMap = new Map();
  answers.forEach(a => {
    answerMap.set(`${a.participant_id}:${a.question_id}`, a);
  });

  // Diákok sorai
  participants.forEach(p => {
    const rowValues = [p.student_name, p.pc_number ? `${p.pc_number}. gép` : '–'];

    questions.forEach(q => {
      const ans = answerMap.get(`${p.id}:${q.id}`);
      if (!ans) {
        rowValues.push('–');
      } else {
        rowValues.push(`${ans.points_earned}p`);
      }
    });

    rowValues.push(p.total_points, `${p.percentage}%`, p.grade, p.focus_lost_count);

    const row = worksheet.addRow(rowValues);
    row.height = 20;

    // Név és Gép formázása
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };

    // Kérdés cellák színezése + hover cellamegjegyzés (kérdés, helyes válasz, eltérő adott válasz)
    questions.forEach((q, qIdx) => {
      const cell = row.getCell(3 + qIdx);
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      const ans = answerMap.get(`${p.id}:${q.id}`) || null;

      cell.note = buildExcelCellNote(q, qIdx, ans);

      if (ans) {
        if (ans.eval_status === 'CORRECT') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
          cell.font = { color: { argb: 'FF14532D' }, bold: true };
        } else if (ans.eval_status === 'PARTIAL') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          cell.font = { color: { argb: 'FF78350F' }, bold: true };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { color: { argb: 'FF7F1D1D' }, bold: true };
        }
      }
    });

    // Összesítő cellák formázása
    const baseOffset = 3 + questions.length;
    row.getCell(baseOffset).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(baseOffset + 1).alignment = { vertical: 'middle', horizontal: 'center' };
    const gradeCell = row.getCell(baseOffset + 2);
    gradeCell.alignment = { vertical: 'middle', horizontal: 'center' };
    gradeCell.font = { bold: true };
    row.getCell(baseOffset + 3).alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Oszlopszélességek igazítása (kompakt kérdésoszlopok a sorszámoknak)
  const qEndIdx = 2 + questions.length;
  worksheet.columns.forEach((column, idx) => {
    if (idx === 0) column.width = 24;
    else if (idx === 1) column.width = 10;
    else if (idx < qEndIdx) column.width = 8;
    else if (idx === qEndIdx) column.width = 11;
    else if (idx === qEndIdx + 1) column.width = 10;
    else if (idx === qEndIdx + 2) column.width = 12;
    else column.width = 14;
  });

  return workbook.xlsx.writeBuffer();
}

/**
 * 2. Interaktív Csoportos HTML fájl generálása (sorszámozott fejléc + képes hover részletező + kártyán belüli görgetés)
 */
function generateInteractiveHtml(sessionId) {
  const data = sessionRepo.getLiveMatrixData(sessionId);
  if (!data) throw new Error('A dolgozat nem található!');

  const { session, questions, participants, answers, totalMaxPoints } = data;
  const logoDataUri = getLogoDataUri();
  const todayFormatted = new Date().toLocaleDateString('hu-HU');
  const imageCache = new Map();

  // Deduplikált képtár a HTML-en belül, hogy sok diák esetén ne ismétlődjön a base64 tartalom
  const imagePool = [];
  const imagePoolIndex = new Map();
  const registerImgToken = (relUrl) => {
    const uri = imageUrlToDataUri(relUrl, imageCache);
    if (!uri) return '';
    if (!imagePoolIndex.has(uri)) {
      imagePoolIndex.set(uri, imagePool.length);
      imagePool.push(uri);
    }
    return `__IMG_${imagePoolIndex.get(uri)}__`;
  };

  const answerMap = new Map();
  answers.forEach(a => {
    answerMap.set(`${a.participant_id}:${a.question_id}`, a);
  });

  const questionsMeta = questions.map((q, idx) => ({
    num: idx + 1,
    points: q.points,
    textHtml: formatRichTextHtml(q.question_text),
    imageToken: q.image_path ? registerImgToken(q.image_path) : '',
    correctHtml: renderAnswerHtml(q.correct_answer, q, imageCache, {
      isCorrectField: true,
      imgResolver: registerImgToken
    })
  }));

  const cellDiffMap = {};
  participants.forEach((p, pIdx) => {
    questions.forEach((q, qIdx) => {
      const a = answerMap.get(`${p.id}:${q.id}`);
      const isCorrect = a && a.eval_status === 'CORRECT';
      if (!isCorrect) {
        cellDiffMap[`${pIdx}:${qIdx}`] = a
          ? renderAnswerHtml(a.submitted_answer, q, imageCache, {
              isCorrectField: false,
              imgResolver: registerImgToken
            })
          : '<span class="export-empty-ans">Nincs válasz</span>';
      }
    });
  });

  const payloadJson = escapeJsonForScript({
    images: imagePool,
    questions: questionsMeta,
    diffs: cellDiffMap
  });

  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(session.quiz_title)} – Eredmények</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
    .container { max-width: 1400px; width: 100%; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); padding: 24px; overflow: hidden; }
    .report-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .header-logo { height: 42px; width: auto; object-fit: contain; }
    .header-title { font-size: 1.45rem; margin: 0 0 4px 0; color: #1e40af; font-weight: 800; }
    .header-meta { font-size: 0.9rem; color: #64748b; }
    .header-right { text-align: right; }
    .header-group-label { font-size: 1.15rem; font-weight: 700; color: #1e293b; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 12px; }
    .toolbar-hint { font-size: 0.85rem; color: #64748b; }
    .btn { padding: 8px 16px; font-weight: 600; border-radius: 6px; border: 1px solid #cbd5e1; background: #f1f5f9; cursor: pointer; }
    .btn:hover { background: #e2e8f0; }
    .table-wrapper { width: 100%; overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.92rem; }
    th, td { border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 8px 10px; text-align: center; white-space: nowrap; }
    th:last-child, td:last-child { border-right: none; }
    tbody tr:last-child td { border-bottom: none; }
    th { background: #f1f5f9; font-weight: 700; color: #1e293b; }
    th.col-name, td.col-name { text-align: left; position: sticky; left: 0; z-index: 2; background: #ffffff; border-right: 2px solid #cbd5e1; min-width: 170px; }
    th.col-name { background: #f1f5f9; z-index: 3; }
    th.q-col { min-width: 40px; padding: 8px 6px; cursor: help; }
    th.q-col:hover { background: #dbeafe; color: #1e40af; }
    td.ans-cell { min-width: 40px; padding: 8px 6px; cursor: help; }
    td.ans-cell:hover { outline: 2px solid #2563eb; outline-offset: -2px; }
    .correct { background: #dcfce7; color: #14532d; font-weight: 700; }
    .partial { background: #fef3c7; color: #78350f; font-weight: 700; }
    .wrong { background: #fee2e2; color: #7f1d1d; font-weight: 700; }
    .unanswered { background: #f8fafc; color: #64748b; }
    .inline-code { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 1px 4px; font-family: Consolas, monospace; font-size: 0.9em; }

    /* Lebegő hover részletező kártya */
    .hover-card { position: fixed; z-index: 9999; display: none; max-width: 420px; min-width: 240px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; box-shadow: 0 14px 32px rgba(15, 23, 42, 0.22); padding: 12px 14px; pointer-events: none; text-align: left; font-size: 0.88rem; line-height: 1.45; }
    .hover-card.visible { display: block; }
    .hover-q-head { font-weight: 800; color: #1e40af; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .hover-q-text { color: #0f172a; margin-bottom: 8px; word-break: break-word; }
    .hover-q-img { display: block; max-width: 100%; max-height: 140px; border-radius: 6px; border: 1px solid #e2e8f0; margin: 6px 0 8px 0; object-fit: contain; background: #f8fafc; }
    .hover-row { margin-top: 6px; padding: 6px 8px; border-radius: 6px; word-break: break-word; }
    .hover-row-correct { background: #f0fdf4; border: 1px solid #bbf7d0; color: #14532d; }
    .hover-row-submitted { background: #fef2f2; border: 1px solid #fecaca; color: #7f1d1d; }
    .hover-label { font-weight: 700; display: block; margin-bottom: 3px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.02em; }
    .export-answer-with-img { display: inline-flex; align-items: center; gap: 6px; vertical-align: middle; flex-wrap: wrap; }
    .export-answer-thumb { max-height: 64px; max-width: 110px; border-radius: 4px; border: 1px solid #cbd5e1; background: #ffffff; object-fit: contain; vertical-align: middle; }
    .export-answer-multi { display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .export-answer-multi-item { display: inline-flex; align-items: center; background: rgba(255,255,255,0.75); border: 1px solid rgba(148,163,184,0.45); border-radius: 5px; padding: 2px 6px; }
    .export-img-missing, .export-empty-ans { font-style: italic; color: #64748b; }
    .export-or-sep { font-style: italic; color: #64748b; margin: 0 2px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="report-header">
      <div class="header-left">
        ${logoDataUri ? `<img src="${logoDataUri}" alt="Okoskodó" class="header-logo">` : ''}
        <div>
          <h1 class="header-title">${escapeHtml(session.quiz_title)}</h1>
          <div class="header-meta">Tantárgy: <strong>${escapeHtml(session.subject_name)}</strong> | Évfolyam: <strong>${escapeHtml(session.grade_level)}. évfolyam</strong></div>
        </div>
      </div>
      <div class="header-right">
        <div class="header-group-label">Csoportos eredménytábla</div>
        <div class="header-meta">Résztvevők: <strong>${participants.length} tanuló</strong> | Dátum: <strong>${escapeHtml(todayFormatted)}</strong></div>
      </div>
    </div>

    <div class="toolbar">
      <input type="text" id="filter-input" placeholder="🔍 Keresés név szerint..." style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; width: 250px;">
      <span class="toolbar-hint">💡 Vidd az egeret egy sorszám vagy pontszám fölé a kérdés és a válaszok megtekintéséhez.</span>
      <button id="btn-anon" class="btn">🕶️ Anonim mód (Nevek elrejtése)</button>
    </div>

    <div class="table-wrapper">
      <table id="results-table">
        <thead>
          <tr>
            <th class="col-name">Tanuló neve</th>
            ${questions.map((q, idx) => `<th class="q-col" tabindex="0" data-qidx="${idx}">${idx + 1}</th>`).join('')}
            <th>Összpont</th>
            <th>%</th>
            <th>Jegy</th>
          </tr>
        </thead>
        <tbody>
          ${participants.map((p, pIdx) => `
            <tr data-name="${escapeHtml(p.student_name)}">
              <td class="col-name student-cell">${escapeHtml(p.student_name)}</td>
              ${questions.map((q, qIdx) => {
                const a = answerMap.get(`${p.id}:${q.id}`);
                if (!a) {
                  return `<td class="ans-cell unanswered" tabindex="0" data-pidx="${pIdx}" data-qidx="${qIdx}">–</td>`;
                }
                const cls = a.eval_status === 'CORRECT' ? 'correct' : (a.eval_status === 'PARTIAL' ? 'partial' : 'wrong');
                return `<td class="ans-cell ${cls}" tabindex="0" data-pidx="${pIdx}" data-qidx="${qIdx}">${escapeHtml(a.points_earned)}p</td>`;
              }).join('')}
              <td><strong>${escapeHtml(p.total_points)}</strong> / ${escapeHtml(totalMaxPoints)}</td>
              <td><strong>${escapeHtml(p.percentage)}%</strong></td>
              <td><strong>${escapeHtml(p.grade)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <div id="export-hover-card" class="hover-card" role="tooltip" aria-hidden="true"></div>
  <script id="export-meta-data" type="application/json">${payloadJson}</script>

  <script>
    let isAnon = false;
    const btnAnon = document.getElementById('btn-anon');
    const filterInput = document.getElementById('filter-input');
    const rows = document.querySelectorAll('#results-table tbody tr');
    const hoverCard = document.getElementById('export-hover-card');
    const metaData = JSON.parse(document.getElementById('export-meta-data').textContent || '{}');
    const imagePool = Array.isArray(metaData.images) ? metaData.images : [];
    const questionsMeta = Array.isArray(metaData.questions) ? metaData.questions : [];
    const diffsMeta = metaData.diffs || {};

    function resolveTokens(html) {
      if (!html) return '';
      return String(html).replace(/__IMG_(\\d+)__/g, (_, i) => imagePool[Number(i)] || '');
    }

    function positionHoverCard(anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const pad = 12;
      const cardRect = hoverCard.getBoundingClientRect();
      let left = rect.left + (rect.width / 2) - (cardRect.width / 2);
      if (left < pad) left = pad;
      if (left + cardRect.width > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - cardRect.width - pad);
      }
      let top = rect.bottom + 8;
      if (top + cardRect.height > window.innerHeight - pad) {
        top = Math.max(pad, rect.top - cardRect.height - 8);
      }
      hoverCard.style.left = left + 'px';
      hoverCard.style.top = top + 'px';
    }

    function showHoverForCell(el) {
      const qIdx = Number(el.dataset.qidx);
      const q = questionsMeta[qIdx];
      if (!q) return;

      const qImgSrc = q.imageToken ? resolveTokens(q.imageToken) : '';
      let html = '<div class="hover-q-head">' + q.num + '. kérdés (' + q.points + ' pont)</div>';
      if (q.textHtml) {
        html += '<div class="hover-q-text">' + q.textHtml + '</div>';
      }
      if (qImgSrc) {
        html += '<img src="' + qImgSrc + '" alt="Kérdés képe" class="hover-q-img">';
      }
      html += '<div class="hover-row hover-row-correct"><span class="hover-label">Helyes válasz</span>' + resolveTokens(q.correctHtml) + '</div>';

      if (el.dataset.pidx !== undefined) {
        const diffKey = el.dataset.pidx + ':' + qIdx;
        if (Object.prototype.hasOwnProperty.call(diffsMeta, diffKey)) {
          html += '<div class="hover-row hover-row-submitted"><span class="hover-label">Adott válasz</span>' + resolveTokens(diffsMeta[diffKey]) + '</div>';
        }
      }

      hoverCard.innerHTML = html;
      hoverCard.classList.add('visible');
      hoverCard.setAttribute('aria-hidden', 'false');
      positionHoverCard(el);
    }

    function hideHoverCard() {
      hoverCard.classList.remove('visible');
      hoverCard.setAttribute('aria-hidden', 'true');
    }

    document.querySelectorAll('#results-table th.q-col, #results-table td.ans-cell').forEach(el => {
      el.addEventListener('mouseenter', () => showHoverForCell(el));
      el.addEventListener('mouseleave', hideHoverCard);
      el.addEventListener('focus', () => showHoverForCell(el));
      el.addEventListener('blur', hideHoverCard);
    });

    btnAnon.addEventListener('click', () => {
      isAnon = !isAnon;
      btnAnon.textContent = isAnon ? '👁️ Nevek megjelenítése' : '🕶️ Anonim mód (Nevek elrejtése)';
      rows.forEach((r, idx) => {
        const cell = r.querySelector('.student-cell');
        cell.textContent = isAnon ? (idx + 1) + '. Tanuló' : r.dataset.name;
      });
    });

    filterInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      rows.forEach(r => {
        const name = (r.dataset.name || '').toLowerCase();
        r.style.display = name.includes(q) ? '' : 'none';
      });
    });
  </script>
</body>
</html>`;
}

/**
 * 3. Egyéni Értékelőlapok (.zip) generálása (beágyazott base64 képekkel)
 */
function createIndividualZipStream(sessionId) {
  const data = sessionRepo.getLiveMatrixData(sessionId);
  if (!data) throw new Error('A dolgozat nem található!');

  const { session, questions, participants, answers, totalMaxPoints } = data;
  const logoDataUri = getLogoDataUri();
  const todayFormatted = new Date().toLocaleDateString('hu-HU');
  const archive = archiver('zip', { zlib: { level: 9 } });
  const imageCache = new Map();

  const answerMap = new Map();
  answers.forEach(a => {
    answerMap.set(`${a.participant_id}:${a.question_id}`, a);
  });

  // Kérdések előkészítése egyszer (főkép + helyes válasz HTML)
  const preparedQuestions = questions.map((q, idx) => {
    const qImgDataUri = q.image_path ? imageUrlToDataUri(q.image_path, imageCache) : '';
    const correctHtml = renderAnswerHtml(q.correct_answer, q, imageCache, { isCorrectField: true });
    return { q, idx, qImgDataUri, correctHtml };
  });

  const usedFileNames = new Set();

  participants.forEach(p => {
    const studentHtml = `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <title>Értékelőlap – ${escapeHtml(p.student_name)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; margin: 0; }
    .card { max-width: 760px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: nowrap; }
    .header-left { display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1 1 auto; }
    .header-logo { height: 42px; width: auto; object-fit: contain; flex-shrink: 0; }
    .header-title { margin: 0 0 4px 0; font-size: 1.35rem; color: #1e40af; font-weight: 800; line-height: 1.25; }
    .header-meta { font-size: 0.9rem; color: #64748b; }
    .header-right { text-align: right; flex: 0 0 auto; white-space: nowrap; }
    .student-name { font-size: 1.25rem; font-weight: 800; color: #1e293b; }
    .score-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px; }
    .q-item { border-bottom: 1px solid #e2e8f0; padding: 22px 0 16px 0; }
    .q-item:first-of-type { padding-top: 8px; }
    .q-item:last-child { border-bottom: none; }
    .q-image { display: block; max-width: 100%; max-height: 220px; margin: 8px 0; border-radius: 6px; border: 1px solid #e2e8f0; object-fit: contain; background: #f8fafc; }
    .answer-line { margin-top: 6px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    .status-line { margin-top: 6px; font-weight: 700; }
    .correct { color: #15803d; }
    .partial { color: #b45309; }
    .wrong { color: #b91c1c; }
    .inline-code { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 1px 4px; font-family: Consolas, monospace; font-size: 0.9em; }
    .export-answer-with-img { display: inline-flex; align-items: center; gap: 8px; vertical-align: middle; flex-wrap: wrap; }
    .export-answer-thumb { max-height: 84px; max-width: 150px; border-radius: 6px; border: 1px solid #cbd5e1; background: #ffffff; object-fit: contain; vertical-align: middle; }
    .export-answer-multi { display: inline-flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .export-answer-multi-item { display: inline-flex; align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 8px; }
    .export-img-missing { font-style: italic; color: #64748b; }
    .export-or-sep { font-style: italic; color: #64748b; margin: 0 2px; }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      body { background: #ffffff; padding: 0; margin: 0; font-size: 10.5pt; line-height: 1.4; }
      .card { max-width: none; border-radius: 0; box-shadow: none; padding: 14mm 15mm; margin: 0; }
      .header { flex-wrap: nowrap; gap: 12px; padding-bottom: 10px; margin-bottom: 16px; }
      .header-logo { height: 36px; }
      .header-title { font-size: 13.5pt; }
      .student-name { font-size: 12.5pt; }
      .header-meta { font-size: 9pt; }
      .score-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 12px 16px; margin-bottom: 18px; }
      .q-item { padding: 16px 0 12px 0; break-inside: avoid; page-break-inside: avoid; }
      .q-image { max-height: 55mm; break-inside: avoid; }
      .export-answer-thumb { max-height: 20mm; max-width: 38mm; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="header-left">
        ${logoDataUri ? `<img src="${logoDataUri}" alt="Okoskodó" class="header-logo">` : ''}
        <div>
          <h2 class="header-title">${escapeHtml(session.quiz_title)}</h2>
          <div class="header-meta">Tantárgy: <strong>${escapeHtml(session.subject_name)}</strong> | Évfolyam: <strong>${escapeHtml(session.grade_level)}. évfolyam</strong></div>
        </div>
      </div>
      <div class="header-right">
        <div class="student-name">${escapeHtml(p.student_name)}</div>
        <div class="header-meta">${p.pc_number ? escapeHtml(p.pc_number) + '. gép' : 'Diák'} | Dátum: <strong>${escapeHtml(todayFormatted)}</strong></div>
      </div>
    </div>
    <div class="score-box">
      <div style="font-size: 2rem; font-weight: 800; color: #1d4ed8;">${escapeHtml(p.total_points)} / ${escapeHtml(totalMaxPoints)} pont (${escapeHtml(p.percentage)}%)</div>
      <div style="font-size: 1.2rem; font-weight: 700; margin-top: 6px;">Érdemjegy: ${escapeHtml(p.gradeText)}</div>
    </div>
    <h3>Kérdések és válaszok:</h3>
    ${preparedQuestions.map(({ q, idx, qImgDataUri, correctHtml }) => {
      const a = answerMap.get(`${p.id}:${q.id}`);
      const isCor = a && a.eval_status === 'CORRECT';
      const isPartial = a && a.eval_status === 'PARTIAL';
      const statusCls = isCor ? 'correct' : (isPartial ? 'partial' : 'wrong');
      const statusLabel = isCor ? '✓ Helyes' : (isPartial ? '◐ Részpontszám' : '✗ Hibás');
      const submittedHtml = a ? renderAnswerHtml(a.submitted_answer, q, imageCache, { isCorrectField: false }) : '–';
      return `
        <div class="q-item">
          <div><strong>${idx + 1}. ${formatRichTextHtml(q.question_text)}</strong> (${escapeHtml(q.points)}p)</div>
          ${qImgDataUri ? `<img src="${qImgDataUri}" alt="Kérdés képe" class="q-image">` : ''}
          <div class="answer-line"><span>Adott válasz:</span> <strong>${submittedHtml}</strong></div>
          <div class="status-line ${statusCls}">${statusLabel} (${a ? escapeHtml(a.points_earned) : 0}p)</div>
          ${!isCor ? `<div class="answer-line" style="font-size: 0.92rem; color: #475569;"><span>Helyes válasz:</span> <strong>${correctHtml}</strong></div>` : ''}
        </div>
      `;
    }).join('')}
  </div>
</body>
</html>`;

    // Fájlnév tisztítása az ékezetes karakterek kezelésével és névütközés elleni védelemmel
    const cleanBaseName = p.student_name.replace(/[/\\?%*:|"<>]/g, '').trim() || 'tanulo';
    let fileName = `${cleanBaseName}_ertekeles.html`;
    if (usedFileNames.has(fileName)) {
      fileName = `${cleanBaseName}_${p.id}_ertekeles.html`;
    }
    usedFileNames.add(fileName);
    archive.append(studentHtml, { name: fileName });
  });

  return archive;
}

module.exports = {
  generateExcelReport,
  generateInteractiveHtml,
  createIndividualZipStream
};
