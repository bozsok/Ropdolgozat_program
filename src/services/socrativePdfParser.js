const zlib = require('zlib');

/**
 * socrativePdfParser.js
 * 
 * Socrative PDF tesztek (kérdések, opciók, helyes válaszok és beágyazott illusztrációk)
 * 100% offline, külső függőség nélküli kinyerése beépített Node.js modulokkal (zlib, Buffer).
 */

/**
 * 0-dependency RGB buffer -> PNG formátumú Buffer kódoló
 */
function createPng(width, height, rawRgbBuffer) {
  const scanlineLength = width * 3;
  const filteredBuffer = Buffer.alloc(height * (scanlineLength + 1));
  for (let y = 0; y < height; y++) {
    filteredBuffer[y * (scanlineLength + 1)] = 0; // Filter type: None
    rawRgbBuffer.copy(filteredBuffer, y * (scanlineLength + 1) + 1, y * scanlineLength, (y + 1) * scanlineLength);
  }
  const compressedData = zlib.deflateSync(filteredBuffer);

  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c;
  }
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const typeAndData = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([lenBuf, typeAndData, crcBuf]);
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressedData),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * Socrative PDF fájl bináris elemzése és tartalomkinyerése
 * @param {Buffer} pdfBuffer - A feltöltött PDF fájl tartalma
 * @returns {Object} { quizTitle, questions: Array }
 */
function parseSocrativePdf(pdfBuffer) {
  const str = pdfBuffer.toString('latin1');

  function getObjectBody(objNum) {
    const re = new RegExp(`\\b${objNum}\\s+0\\s+obj([\\s\\S]*?)endobj`);
    const m = re.exec(str);
    return m ? m[1] : null;
  }

  function parseCMap(objNum) {
    const body = getObjectBody(objNum);
    if (!body) return new Map();
    const streamMatch = body.match(/stream[\r\n]+/);
    if (!streamMatch) return new Map();
    const start = streamMatch.index + streamMatch[0].length;
    const end = body.indexOf('endstream', start);
    const raw = Buffer.from(body.slice(start, end), 'latin1');
    let txt;
    try {
      txt = zlib.inflateSync(raw).toString('utf-8');
    } catch {
      return new Map();
    }

    const map = new Map();
    const bfcBlocks = txt.match(/\d+\s+beginbfchar([\s\S]*?)endbfchar/g) || [];
    for (const block of bfcBlocks) {
      const re = /<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>/g;
      let m;
      while ((m = re.exec(block)) !== null) {
        const src = parseInt(m[1], 16);
        let s = '';
        for (let i = 0; i < m[2].length; i += 4) {
          s += String.fromCharCode(parseInt(m[2].slice(i, i + 4), 16));
        }
        map.set(src, s);
      }
    }
    const bfrBlocks = txt.match(/\d+\s+beginbfrange([\s\S]*?)endbfrange/g) || [];
    for (const block of bfrBlocks) {
      const re = /<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>/g;
      let m;
      while ((m = re.exec(block)) !== null) {
        const startSrc = parseInt(m[1], 16);
        const endSrc = parseInt(m[2], 16);
        let dst = parseInt(m[3], 16);
        for (let c = startSrc; c <= endSrc; c++) {
          map.set(c, String.fromCharCode(dst));
          dst++;
        }
      }
    }
    return map;
  }

  // 1. Képek kinyerése a PDF XObject objektumaiból
  const imageBuffersByObjId = new Map();
  const objRe = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let om;
  while ((om = objRe.exec(str)) !== null) {
    const objNum = parseInt(om[1], 10);
    const body = om[3];
    if (body.includes('/Subtype /Image') || body.includes('/Subtype/Image')) {
      const streamStartMatch = body.match(/stream[\r\n]+/);
      if (!streamStartMatch) continue;
      const streamStart = streamStartMatch.index + streamStartMatch[0].length;
      const streamEnd = body.indexOf('endstream', streamStart);
      if (streamEnd === -1) continue;
      const dict = body.slice(0, streamStartMatch.index);
      const wMatch = dict.match(/\/Width\s+(\d+)/);
      const hMatch = dict.match(/\/Height\s+(\d+)/);
      if (!wMatch || !hMatch) continue;
      const width = parseInt(wMatch[1], 10);
      const height = parseInt(hMatch[1], 10);
      const rawStream = Buffer.from(body.slice(streamStart, streamEnd), 'latin1');
      try {
        const decompressed = zlib.inflateSync(rawStream);
        const png = createPng(width, height, decompressed);
        imageBuffersByObjId.set(objNum, png);
      } catch { }
    }
  }

  // 2. Oldalak felderítése
  const pageObjs = [];
  const pRe = /\/Type\s*\/Page\b[\s\S]*?endobj/g;
  let pm;
  while ((pm = pRe.exec(str)) !== null) {
    const pBody = pm[0];
    const contentsMatch = pBody.match(/\/Contents\s+(\d+)\s+0\s+R/);
    if (!contentsMatch) continue;
    const contentsObj = parseInt(contentsMatch[1], 10);

    const fontDictMatch = pBody.match(/\/Font\s*<<([\s\S]*?)>>/);
    const fonts = {};
    if (fontDictMatch) {
      const fEntries = fontDictMatch[1].match(/\/([Ff]\d+)\s+(\d+)\s+0\s+R/g) || [];
      for (const fe of fEntries) {
        const parts = fe.match(/\/([Ff]\d+)\s+(\d+)/);
        fonts[parts[1]] = parseInt(parts[2], 10);
      }
    }

    const xDictMatch = pBody.match(/\/XObject\s*<<([\s\S]*?)>>/);
    const xobjects = {};
    if (xDictMatch) {
      const xEntries = xDictMatch[1].match(/\/([Xx]\d+)\s+(\d+)\s+0\s+R/g) || [];
      for (const xe of xEntries) {
        const parts = xe.match(/\/([Xx]\d+)\s+(\d+)/);
        xobjects[parts[1]] = parseInt(parts[2], 10);
      }
    }
    pageObjs.push({ contentsObj, fonts, xobjects });
  }

  const cmapCache = new Map();
  function getFontCMap(fontObjId) {
    if (cmapCache.has(fontObjId)) return cmapCache.get(fontObjId);
    const fBody = getObjectBody(fontObjId);
    if (!fBody) return new Map();
    const toUniMatch = fBody.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!toUniMatch) return new Map();
    const cmap = parseCMap(parseInt(toUniMatch[1], 10));
    cmapCache.set(fontObjId, cmap);
    return cmap;
  }

  // 3. Szövegelemek, zöld megoldókulcs-pipák és képek kinyerése valódi PDF CTM (X, Y) koordinátákkal
  function multiplyMatrix(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }

  function applyMatrix(m, x, y) {
    return {
      x: m[0] * x + m[2] * y + m[4],
      y: m[1] * x + m[3] * y + m[5]
    };
  }

  const pagesData = [];

  for (let pageIdx = 0; pageIdx < pageObjs.length; pageIdx++) {
    const page = pageObjs[pageIdx];
    const body = getObjectBody(page.contentsObj);
    if (!body) continue;
    const streamMatch = body.match(/stream[\r\n]+/);
    if (!streamMatch) continue;
    const start = streamMatch.index + streamMatch[0].length;
    const end = body.indexOf('endstream', start);
    if (end === -1) continue;
    const raw = Buffer.from(body.slice(start, end), 'latin1');
    let txt;
    try {
      txt = zlib.inflateSync(raw).toString('latin1');
    } catch {
      continue;
    }

    const lines = txt.split(/\r?\n/);
    const ctmStack = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    let curFont = null;
    let curColorGreen = false;
    let inText = false;
    let textX = 0;
    let textY = 0;
    let textAbsX = 0;
    let textAbsY = 0;
    let curText = '';
    let curTextStartX = 0;
    let curTextStartY = 0;
    let curTextHasContent = false;

    const textItems = [];
    const greenMarks = [];
    const pageImages = [];

    const flushText = () => {
      if (curTextHasContent && curText.trim()) {
        textItems.push({
          x: curTextStartX,
          y: curTextStartY,
          text: curText.replace(/\0/g, '').trim(),
          pageIdx
        });
      }
      curText = '';
      curTextHasContent = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line === 'q') {
        ctmStack.push([...ctm]);
        continue;
      }
      if (line === 'Q') {
        if (ctmStack.length > 0) ctm = ctmStack.pop();
        curColorGreen = false;
        continue;
      }

      const cmMatch = line.match(/^([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+cm$/);
      if (cmMatch) {
        const m = [
          parseFloat(cmMatch[1]), parseFloat(cmMatch[2]),
          parseFloat(cmMatch[3]), parseFloat(cmMatch[4]),
          parseFloat(cmMatch[5]), parseFloat(cmMatch[6])
        ];
        ctm = multiplyMatrix(ctm, m);
        continue;
      }

      // Socrative megoldókulcs zöld színének felismerése (pl. .365 .745 .431 rg / RG)
      const rgbMatch = line.match(/([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+(?:rg|RG)/);
      if (rgbMatch) {
        const r = parseFloat(rgbMatch[1]);
        const g = parseFloat(rgbMatch[2]);
        const b = parseFloat(rgbMatch[3]);
        curColorGreen = (g > 0.55 && g > r + 0.18 && g > b + 0.15);
      }

      // Zöld pipa (stroke/fill) középpontjának rögzítése (fentről lefelé növekvő oldalkoordinátában)
      if (curColorGreen && (line === 'S' || line === 'f' || line === 'f*' || line === 'B')) {
        const markPt = applyMatrix(ctm, 9, 9);
        greenMarks.push({ x: markPt.x, y: 793 - markPt.y, pageIdx });
        continue;
      }

      const doMatch = line.match(/^\/([Xx]\d+)\s+Do$/);
      if (doMatch) {
        const xAlias = doMatch[1];
        const objId = page.xobjects[xAlias];
        if (objId && imageBuffersByObjId.has(objId)) {
          pageImages.push({
            objId,
            x: ctm[4],
            y: 793 - ctm[5],
            pageIdx,
            pngBuffer: imageBuffersByObjId.get(objId)
          });
        }
        continue;
      }

      if (line === 'BT') {
        inText = true;
        flushText();
        continue;
      }
      if (line === 'ET') {
        flushText();
        inText = false;
        continue;
      }

      const fm = line.match(/\/([Ff]\d+)\s+[\d\.]+\s+Tf/);
      if (fm) {
        curFont = fm[1];
      }

      const tmMatch = line.match(/([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+Tm$/);
      if (tmMatch) {
        flushText();
        textX = parseFloat(tmMatch[5]);
        textY = parseFloat(tmMatch[6]);
        const abs = applyMatrix(ctm, textX, textY);
        textAbsX = abs.x;
        textAbsY = 793 - abs.y;
        curTextStartX = textAbsX;
        curTextStartY = textAbsY;
        continue;
      }

      const tdMatch = line.match(/^([\d\.\-]+)\s+([\d\.\-]+)\s+T[dD]\s*(.*)$/);
      if (tdMatch) {
        const dx = parseFloat(tdMatch[1]);
        const dy = parseFloat(tdMatch[2]);
        if (Math.abs(dy) > 2) {
          flushText();
          textX += dx;
          textY += dy;
          const abs = applyMatrix(ctm, textX, textY);
          textAbsX = abs.x;
          textAbsY = 793 - abs.y;
          curTextStartX = textAbsX;
          curTextStartY = textAbsY;
        } else {
          textX += dx;
        }
      }

      const tjMatch = line.match(/<([0-9a-fA-F]+)>\s*Tj/);
      if (tjMatch && curFont && page.fonts[curFont]) {
        const fontObjId = page.fonts[curFont];
        const cmap = getFontCMap(fontObjId);
        const hex = tjMatch[1];
        let decoded = '';
        for (let j = 0; j < hex.length; j += 4) {
          const code = parseInt(hex.slice(j, j + 4), 16);
          decoded += cmap.has(code) ? cmap.get(code) : '';
        }
        if (decoded) {
          if (!curTextHasContent) {
            curTextStartX = textAbsX;
            curTextStartY = textAbsY;
            curTextHasContent = true;
          }
          curText += decoded;
        }
      }
    }
    flushText();

    pagesData.push({ pageIdx, textItems, greenMarks, pageImages });
  }

  // 4. Vizuális sorok összeállítása oldalanként (X, Y alapján) és globális Y-tengely képzése
  const PAGE_STRIDE = 10000;
  const allRows = [];
  const allGreenMarks = [];
  const allImages = [];

  for (const pd of pagesData) {
    const baseOffset = pd.pageIdx * PAGE_STRIDE;

    // Zöld pipák és képek globális Y-koordinátával
    for (const gm of pd.greenMarks) {
      allGreenMarks.push({ x: gm.x, y: gm.y, globalY: baseOffset + gm.y, pageIdx: pd.pageIdx });
    }
    for (const img of pd.pageImages) {
      allImages.push({ ...img, globalY: baseOffset + img.y });
    }

    // Szövegelemek csoportosítása vizuális sorokba (|y1 - y2| <= 4.5pt)
    const sorted = [...pd.textItems].sort((a, b) => (Math.abs(a.y - b.y) > 4.5 ? a.y - b.y : a.x - b.x));
    const pageRows = [];
    for (const item of sorted) {
      let row = pageRows.find(r => Math.abs(r.y - item.y) <= 4.5);
      if (!row) {
        row = { y: item.y, globalY: baseOffset + item.y, pageIdx: pd.pageIdx, items: [] };
        pageRows.push(row);
      }
      row.items.push(item);
    }

    pageRows.sort((a, b) => a.y - b.y);
    for (const row of pageRows) {
      row.items.sort((a, b) => a.x - b.x);
      // Bal margó jelölő (x < 94) és tartalom (x >= 94) szétválasztása
      const leftItems = row.items.filter(it => it.x < 94);
      const rightItems = row.items.filter(it => it.x >= 94);
      const leftText = leftItems.map(it => it.text).join('').trim();
      const rightText = rightItems.map(it => it.text).join(' ').replace(/\s+/g, ' ').trim();
      const fullText = row.items.map(it => it.text).join(' ').replace(/\s+/g, ' ').trim();

      // Oldalszám / lábléc kiszűrése
      if (/^Page\s+\d+\s+of\s+\d+$/i.test(fullText) || /^\d+\s*\/\s*\d+$/.test(fullText)) {
        continue;
      }

      allRows.push({
        y: row.y,
        globalY: row.globalY,
        pageIdx: row.pageIdx,
        leftText,
        rightText,
        fullText,
        minX: row.items.length > 0 ? row.items[0].x : 0
      });
    }
  }

  // 5. Kvíz címének kiolvasása az első kérdés (1.) fölötti sorokból
  let quizTitle = 'Socrative Teszt';
  const firstQRowIdx = allRows.findIndex(r => /^1\.$/.test(r.leftText));
  const headerRows = firstQRowIdx > 0 ? allRows.slice(0, firstQRowIdx) : [];
  const titleCandidates = headerRows
    .map(r => r.fullText)
    .filter(t => t && !/^(Answer Key|Score|Name|Date|Quiz)$/i.test(t)
      && !/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+/i.test(t)
      && !/^\d{4}\./.test(t)
      && !/^Name:/i.test(t)
      && !/^Date:/i.test(t)
      && !/^Score:/i.test(t));
  if (titleCandidates.length > 0) {
    quizTitle = titleCandidates.join(' ').replace(/\s+/g, ' ').trim();
  }

  // 6. Kérdések felépítése a vizuális sorokból
  const rawQuestions = [];
  let currentQ = null;
  let currentSection = null; // 'question' | 'option' | 'explanation' | 'short_answer'
  let currentOption = null;
  let lastQNum = 0;

  const startIdx = firstQRowIdx >= 0 ? firstQRowIdx : 0;
  for (let i = startIdx; i < allRows.length; i++) {
    const row = allRows[i];
    const qNumMatch = row.leftText.match(/^(\d+)\.$/);

    // Új kérdés kezdete: bal margón szereplő sorszám (szigorúan nagyobb az előzőnél, vagy az első kérdés)
    if (qNumMatch) {
      const num = parseInt(qNumMatch[1], 10);
      if (num === lastQNum + 1 || (num > lastQNum && num <= lastQNum + 5)) {
        lastQNum = num;
        currentQ = {
          qNum: num,
          globalY: row.globalY,
          endGlobalY: Infinity,
          pageIdx: row.pageIdx,
          questionLines: row.rightText ? [row.rightText] : [],
          options: [],
          explanationLines: [],
          shortAnswerLines: []
        };
        if (rawQuestions.length > 0) {
          rawQuestions[rawQuestions.length - 1].endGlobalY = row.globalY;
        }
        rawQuestions.push(currentQ);
        currentSection = 'question';
        currentOption = null;
        continue;
      }
    }

    if (!currentQ) continue;

    // Magyarázat kezdete: bal margón 'i' jelölő
    if (row.leftText === 'i') {
      currentSection = 'explanation';
      currentOption = null;
      if (row.rightText) currentQ.explanationLines.push(row.rightText);
      continue;
    }

    // Feleletválasztós (A-F) vagy Igaz/Hamis (T/F) opció kezdete
    if (/^[A-F]$/.test(row.leftText) || /^[TF]$/.test(row.leftText)) {
      const letter = row.leftText;
      const isTfLetter = (letter === 'T' || letter === 'F')
        && (/^(True|Tue|False|Igaz|Hamis)$/i.test(row.rightText) || currentQ.options.some(o => o.isTfLetter));

      currentOption = {
        letter,
        isTfLetter,
        y: row.y,
        globalY: row.globalY,
        pageIdx: row.pageIdx,
        textLines: row.rightText ? [row.rightText] : [],
        isCorrectMarked: false
      };
      currentQ.options.push(currentOption);
      currentSection = 'option';
      continue;
    }

    // Folytatósorok kezelése (nincs bal margós jelölő)
    const contentText = row.rightText || row.fullText;
    if (!contentText) continue;

    if (currentSection === 'explanation') {
      currentQ.explanationLines.push(contentText);
    } else if (currentSection === 'option' && currentOption) {
      currentOption.textLines.push(contentText);
    } else if (currentSection === 'question') {
      // Ha még nem volt opció, nézzük meg: beírós (SHORT) válaszsor-e?
      // A Socrative SHORT Answer Key a kérdés után külön sorokban listázza az elfogadott válaszokat
      // (a kérdés szövege általában nagyobb Y-hézaggal válik el az elfogadott válaszoktól, >= 22pt)
      const prevRow = i > startIdx ? allRows[i - 1] : null;
      const yGap = (prevRow && prevRow.pageIdx === row.pageIdx) ? (row.y - prevRow.y) : 0;
      const qSoFar = currentQ.questionLines.join(' ').trim();
      const endsLikeQuestion = /[?:.…]$/.test(qSoFar);

      if (currentQ.questionLines.length > 0 && (yGap >= 20 || (endsLikeQuestion && yGap >= 15))) {
        currentSection = 'short_answer';
        currentQ.shortAnswerLines.push(contentText);
      } else {
        currentQ.questionLines.push(contentText);
      }
    } else if (currentSection === 'short_answer') {
      currentQ.shortAnswerLines.push(contentText);
    }
  }

  // 7. Zöld megoldókulcs-pipák és képek pontos Y-alapú hozzárendelése
  for (const gm of allGreenMarks) {
    let bestOpt = null;
    let bestDist = Infinity;
    for (const q of rawQuestions) {
      for (const opt of q.options) {
        if (opt.pageIdx !== gm.pageIdx) continue;
        // Az opció szövegének közepe kb. 3.5pt-tal a baseline fölött van
        const dist = Math.abs(gm.y - (opt.y - 3.5));
        if (dist < bestDist) {
          bestDist = dist;
          bestOpt = opt;
        }
      }
    }
    if (bestOpt && bestDist <= 10) {
      bestOpt.isCorrectMarked = true;
    }
  }

  const usedImages = new Set();
  for (const q of rawQuestions) {
    const matched = allImages.find((img, idx) =>
      !usedImages.has(idx) && img.globalY >= q.globalY - 10 && img.globalY < q.endGlobalY - 5
    );
    if (matched) {
      usedImages.add(allImages.indexOf(matched));
      q.imageBuffer = matched.pngBuffer;
    } else {
      q.imageBuffer = null;
    }
  }

  // 8. Végső kérdésobjektumok összeállítása (ABCD, TF, SHORT felismerés + egyedi question_order)
  const parsedQuestions = rawQuestions.map((q, idx) => {
    const qBody = q.questionLines.join(' ').replace(/\s+/g, ' ').trim();
    const explanationRaw = q.explanationLines.join(' ').replace(/\s+/g, ' ').trim();

    // Opcionális régi magyar megoldókulcs-szöveg a magyarázatban ("A helyes válasz: ...")
    let keyFromExplanation = '';
    const expKeyMatch = explanationRaw.match(/(?:A helyes válasz:|A helyes megoldás:)\s*([^\n\r]+)/i);
    if (expKeyMatch) {
      keyFromExplanation = expKeyMatch[1].trim().replace(/\.$/, '');
    }

    const optTexts = q.options.map(o => ({
      letter: o.letter,
      isTfLetter: o.isTfLetter,
      text: o.textLines.join(' ').replace(/\s+/g, ' ').trim(),
      isCorrectMarked: o.isCorrectMarked
    }));

    // Típus meghatározása: TF, ABCD vagy SHORT
    const isTF = optTexts.length === 2 && (
      (optTexts[0].letter === 'T' && optTexts[1].letter === 'F') ||
      (optTexts[0].isTfLetter && optTexts[1].isTfLetter) ||
      (/^(igaz|true|tue)$/i.test(optTexts[0].text) && /^(hamis|false)$/i.test(optTexts[1].text))
    );
    const isShort = optTexts.length === 0;

    if (isTF) {
      let correctText = '';
      const marked = optTexts.find(o => o.isCorrectMarked);
      if (marked) {
        correctText = (/^(hamis|false|f)$/i.test(marked.text) || marked.letter === 'F') ? 'Hamis' : 'Igaz';
      } else if (keyFromExplanation) {
        correctText = keyFromExplanation.toLowerCase().includes('hamis') ? 'Hamis' : 'Igaz';
      }

      return {
        question_order: idx + 1,
        question_text: qBody,
        instructions: 'Döntsd el, hogy az állítás igaz vagy hamis!',
        question_type: 'TF',
        points: 1,
        options: ['Igaz', 'Hamis'],
        correct_answer: correctText,
        explanation: explanationRaw,
        needs_review: !correctText,
        imageBuffer: q.imageBuffer
      };
    }

    if (isShort) {
      const cleanedShortAnswers = q.shortAnswerLines
        .map(s => s.trim())
        .filter(Boolean);
      let correctText = '';
      if (cleanedShortAnswers.length === 1) {
        correctText = cleanedShortAnswers[0];
      } else if (cleanedShortAnswers.length > 1) {
        correctText = JSON.stringify(cleanedShortAnswers);
      } else if (keyFromExplanation) {
        correctText = keyFromExplanation;
      }

      return {
        question_order: idx + 1,
        question_text: qBody,
        instructions: 'Írd be a helyes választ a szövegmezőbe!',
        question_type: 'SHORT',
        points: 1,
        options: [],
        correct_answer: correctText,
        explanation: explanationRaw,
        needs_review: !correctText,
        imageBuffer: q.imageBuffer
      };
    }

    // ABCD (feleletválasztós)
    let correctText = '';
    const markedOpt = optTexts.find(o => o.isCorrectMarked);
    if (markedOpt) {
      correctText = markedOpt.text;
    } else if (keyFromExplanation) {
      for (const o of optTexts) {
        if (o.text.toLowerCase() === keyFromExplanation.toLowerCase()
          || (o.text.length >= 6 && keyFromExplanation.toLowerCase().startsWith(o.text.toLowerCase().slice(0, 20)))) {
          correctText = o.text;
          break;
        }
      }
      if (!correctText) {
        const lm = keyFromExplanation.match(/^([A-F])\b/i);
        if (lm) {
          const found = optTexts.find(o => o.letter.toUpperCase() === lm[1].toUpperCase());
          if (found) correctText = found.text;
        }
      }
    }

    return {
      question_order: idx + 1,
      question_text: qBody,
      instructions: 'Válaszd ki az egyetlen helyes megoldást!',
      question_type: 'ABCD',
      points: 1,
      options: optTexts.map(o => o.text),
      correct_answer: correctText,
      explanation: explanationRaw,
      needs_review: !correctText,
      imageBuffer: q.imageBuffer
    };
  });

  return { quizTitle, questions: parsedQuestions };
}

module.exports = {
  createPng,
  parseSocrativePdf
};
