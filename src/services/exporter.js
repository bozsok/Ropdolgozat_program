const ExcelJS = require('exceljs');
const archiver = require('archiver');
const sessionRepo = require('../db/sessionRepo');
const grader = require('./grader');

/**
 * exporter.js - Eredmények exportálása (KRÉTA Excel, Interaktív HTML, Egyéni ZIP)
 */

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
    views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }]
  });

  // 1. Sor: Cím és fejléc információk
  worksheet.mergeCells('A1', `${String.fromCharCode(65 + questions.length + 4)}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${session.quiz_title} – Eredménytábla (${session.subject_name}, ${session.grade_level}. évfolyam)`;
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 30;

  // 2. Sor: Oszlopfejlécek
  const headers = ['Tanuló neve', 'Gép'];
  questions.forEach((q, idx) => {
    headers.push(`K${idx + 1} (${q.points}p)`);
  });
  headers.push('Összpont', 'Százalék', 'KRÉTA jegy', 'Fókuszvesztés');

  const headerRow = worksheet.addRow(headers);
  headerRow.height = 24;
  headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  for (let col = 1; col <= headers.length; col++) {
    const cell = headerRow.getCell(col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'medium' },
      right: { style: 'thin' }
    };
  }

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

    // Kérdés cellák színezése (Zöld, Sárga, Piros)
    questions.forEach((q, qIdx) => {
      const cell = row.getCell(3 + qIdx);
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      const ans = answerMap.get(`${p.id}:${q.id}`);

      if (ans) {
        if (ans.eval_status === 'CORRECT') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // Halványzöld
          cell.font = { color: { argb: 'FF14532D' }, bold: true };
        } else if (ans.eval_status === 'PARTIAL') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Halványsárga
          cell.font = { color: { argb: 'FF78350F' }, bold: true };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // Halványpiros
          cell.font = { color: { argb: 'FF7F1D1D' }, bold: true };
        }
      }
    });

    // Összesítő cellák formázása
    const baseOffset = 3 + questions.length;
    row.getCell(baseOffset).alignment = { vertical: 'middle', horizontal: 'center' }; // Összpont
    row.getCell(baseOffset + 1).alignment = { vertical: 'middle', horizontal: 'center' }; // %
    const gradeCell = row.getCell(baseOffset + 2); // Jegy
    gradeCell.alignment = { vertical: 'middle', horizontal: 'center' };
    gradeCell.font = { bold: true };
    row.getCell(baseOffset + 3).alignment = { vertical: 'middle', horizontal: 'center' }; // Fókusz
  });

  // Oszlopszélességek automatikus igazítása
  worksheet.columns.forEach((column, idx) => {
    if (idx === 0) column.width = 24; // Név
    else if (idx === 1) column.width = 12; // Gép
    else column.width = 14;
  });

  return workbook.xlsx.writeBuffer();
}

/**
 * 2. Interaktív Csoportos HTML fájl generálása
 */
function generateInteractiveHtml(sessionId) {
  const data = sessionRepo.getLiveMatrixData(sessionId);
  if (!data) throw new Error('A dolgozat nem található!');

  const { session, questions, participants, answers, totalMaxPoints } = data;

  const answerMap = new Map();
  answers.forEach(a => {
    answerMap.set(`${a.participant_id}:${a.question_id}`, a);
  });

  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <title>${session.quiz_title} – Eredmények</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 1200px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); padding: 24px; }
    h1 { font-size: 1.5rem; margin-top: 0; color: #1e40af; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
    .btn { padding: 8px 16px; font-weight: 600; border-radius: 6px; border: 1px solid #cbd5e1; background: #f1f5f9; cursor: pointer; }
    .btn:hover { background: #e2e8f0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
    th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: center; }
    th { background: #f1f5f9; font-weight: 700; }
    th.col-name { text-align: left; }
    .correct { background: #dcfce7; color: #14532d; font-weight: 700; }
    .partial { background: #fef3c7; color: #78350f; font-weight: 700; }
    .wrong { background: #fee2e2; color: #7f1d1d; font-weight: 700; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${session.quiz_title}</h1>
    <p style="color: #64748b; margin-top: -8px;">Tantárgy: ${session.subject_name} | Évfolyam: ${session.grade_level}. évfolyam</p>
    
    <div class="toolbar">
      <input type="text" id="filter-input" placeholder="🔍 Keresés név szerint..." style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; width: 250px;">
      <button id="btn-anon" class="btn">🕶️ Anonim mód (Nevek elrejtése)</button>
    </div>

    <table id="results-table">
      <thead>
        <tr>
          <th class="col-name">Tanuló neve</th>
          ${questions.map((q, idx) => `<th>K${idx + 1} (${q.points}p)</th>`).join('')}
          <th>Összpont</th>
          <th>%</th>
          <th>Jegy</th>
        </tr>
      </thead>
      <tbody>
        ${participants.map((p, pIdx) => `
          <tr data-name="${p.student_name}">
            <td class="col-name student-cell">${p.student_name}</td>
            ${questions.map(q => {
              const a = answerMap.get(`${p.id}:${q.id}`);
              if (!a) return `<td>–</td>`;
              const cls = a.eval_status === 'CORRECT' ? 'correct' : (a.eval_status === 'PARTIAL' ? 'partial' : 'wrong');
              return `<td class="${cls}">${a.points_earned}p</td>`;
            }).join('')}
            <td><strong>${p.total_points}</strong> / ${totalMaxPoints}</td>
            <td><strong>${p.percentage}%</strong></td>
            <td><strong>${p.grade}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <script>
    let isAnon = false;
    const btnAnon = document.getElementById('btn-anon');
    const filterInput = document.getElementById('filter-input');
    const rows = document.querySelectorAll('#results-table tbody tr');

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
        const name = r.dataset.name.toLowerCase();
        r.style.display = name.includes(q) ? '' : 'none';
      });
    });
  </script>
</body>
</html>`;
}

/**
 * 3. Egyéni Értékelőlapok (.zip) generálása
 */
function createIndividualZipStream(sessionId) {
  const data = sessionRepo.getLiveMatrixData(sessionId);
  if (!data) throw new Error('A dolgozat nem található!');

  const { session, questions, participants, answers, totalMaxPoints } = data;
  const archive = archiver('zip', { zlib: { level: 9 } });

  const answerMap = new Map();
  answers.forEach(a => {
    answerMap.set(`${a.participant_id}:${a.question_id}`, a);
  });

  participants.forEach(p => {
    const studentHtml = `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <title>Értékelőlap – ${p.student_name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; }
    .card { max-width: 700px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
    .score-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px; }
    .q-item { border-bottom: 1px solid #f1f5f9; padding: 12px 0; }
    .correct { color: #15803d; font-weight: bold; }
    .wrong { color: #b91c1c; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>${session.quiz_title}</h2>
      <p style="color: #64748b;">Tanuló: <strong>${p.student_name}</strong> | Osztály: ${session.grade_level}. évf.</p>
    </div>
    <div class="score-box">
      <div style="font-size: 2rem; font-weight: 800; color: #1d4ed8;">${p.total_points} / ${totalMaxPoints} pont (${p.percentage}%)</div>
      <div style="font-size: 1.2rem; font-weight: 700; margin-top: 6px;">Érdemjegy: ${p.gradeText}</div>
    </div>
    <h3>Kérdések és válaszok:</h3>
    ${questions.map((q, idx) => {
      const a = answerMap.get(`${p.id}:${q.id}`);
      const isCor = a && a.is_correct === 1;
      return `
        <div class="q-item">
          <div><strong>${idx + 1}. ${q.question_text}</strong> (${q.points}p)</div>
          <div style="margin-top: 4px;">Adott válasz: <strong>${a ? a.submitted_answer : '–'}</strong></div>
          <div class="${isCor ? 'correct' : 'wrong'}">${isCor ? '✓ Helyes' : '✗ Hibás'} (Kapott pont: ${a ? a.points_earned : 0}p)</div>
          ${!isCor ? `<div style="font-size: 0.9rem; color: #475569;">Helyes válasz: ${q.correct_answer}</div>` : ''}
        </div>
      `;
    }).join('')}
  </div>
</body>
</html>`;

    // Fájlnév tisztítása az ékezetes karakterek kezelésével
    const cleanName = p.student_name.replace(/[/\\?%*:|"<>]/g, '');
    archive.append(studentHtml, { name: `${cleanName}_ertekeles.html` });
  });

  return archive;
}

module.exports = {
  generateExcelReport,
  generateInteractiveHtml,
  createIndividualZipStream
};

