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

  // 3. Szövegek és képek kinyerése oldalanként
  const pagesData = [];
  let quizTitle = 'Socrative Teszt';

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
    let curFont = null;
    let curCm = [1, 0, 0, 1, 0, 0];

    let pageFullText = '';
    const pageImages = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const cmMatch = line.match(/^([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+cm$/);
      if (cmMatch) {
        curCm = [
          parseFloat(cmMatch[1]), parseFloat(cmMatch[2]),
          parseFloat(cmMatch[3]), parseFloat(cmMatch[4]),
          parseFloat(cmMatch[5]), parseFloat(cmMatch[6])
        ];
      }
      const fm = line.match(/\/([Ff]\d+)\s+[\d\.]+\s+Tf/);
      if (fm) curFont = fm[1];

      const doMatch = line.match(/^\/([Xx]\d+)\s+Do$/);
      if (doMatch) {
        const xAlias = doMatch[1];
        const objId = page.xobjects[xAlias];
        if (objId && imageBuffersByObjId.has(objId)) {
          pageImages.push({
            objId: objId,
            y: curCm[5],
            pngBuffer: imageBuffersByObjId.get(objId)
          });
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
        pageFullText += decoded;
      }
      if (line.includes('Tm') || line.includes('ET')) {
        pageFullText += '\n';
      }
    }

    pageFullText = pageFullText.replace(/\0/g, '');

    // Kvíz címének felismerése az 1. oldal fejlécéből
    if (pageIdx === 0) {
      const tMatch = pageFullText.match(/(?:Answer Key|Score)[\s\S]*?\d{4}\s*\n+([\s\S]*?)\n+1\./);
      if (tMatch) {
        quizTitle = tMatch[1].trim().replace(/\s+/g, ' ');
      } else {
        const altMatch = pageFullText.match(/\n([0-9]{1,3}\s*-\s*[^\n\r]+)\n/);
        if (altMatch) quizTitle = altMatch[1].trim().replace(/\s+/g, ' ');
      }
    }

    pagesData.push({ pageFullText, pageImages });
  }

  // 4. Kérdések összeállítása és feldolgozása
  const parsedQuestions = [];

  for (let pIdx = 0; pIdx < pagesData.length; pIdx++) {
    const { pageFullText, pageImages } = pagesData[pIdx];

    // Megoldókulcsos (Answer Key) formátum vizsgálata:
    const qKeyMatches = [...pageFullText.matchAll(/(\d+)\.\s*([\s\S]*?)i\s*(?:A helyes válasz:|A helyes megoldás:)\s*([^\n\r]+)/g)];

    if (qKeyMatches.length > 0) {
      // Megoldókulcsos feldolgozás
      const optionsSectionStart = qKeyMatches[qKeyMatches.length - 1].index + qKeyMatches[qKeyMatches.length - 1][0].length;
      const optionsText = pageFullText.slice(optionsSectionStart);
      const optionMatches = [...optionsText.matchAll(/([\s\S]*?)\n([A-D])(?:\n|$)/g)];

      const questionOptions = [];
      let currentQOptions = [];
      for (const om of optionMatches) {
        const optText = om[1].trim().replace(/\s+/g, ' ');
        const optLetter = om[2].trim();
        if (optLetter === 'A' && currentQOptions.length > 0) {
          questionOptions.push(currentQOptions);
          currentQOptions = [];
        }
        currentQOptions.push({ letter: optLetter, text: optText });
      }
      if (currentQOptions.length > 0) {
        questionOptions.push(currentQOptions);
      }

      for (let i = 0; i < qKeyMatches.length; i++) {
        const qm = qKeyMatches[i];
        const qNum = parseInt(qm[1], 10);
        let qBody = qm[2].trim().replace(/\s+/g, ' ');
        const correctAnswerRaw = qm[3].trim().replace(/\.$/, '');
        const opts = questionOptions[i] || [];
        const isTF = opts.length === 2 && opts[0].text === 'Igaz' && opts[1].text === 'Hamis';

        let correctText = '';
        if (isTF) {
          correctText = correctAnswerRaw.toLowerCase().includes('hamis') ? 'Hamis' : 'Igaz';
        } else {
          for (const o of opts) {
            if (o.text.toLowerCase().trim() === correctAnswerRaw.toLowerCase().trim() ||
              correctAnswerRaw.toLowerCase().trim().startsWith(o.text.toLowerCase().trim().slice(0, 20))) {
              correctText = o.text;
              break;
            }
          }
          if (!correctText && opts.length > 0) {
            // Ha a megoldókulcs betűjelként szerepel (pl. "A" vagy "B")
            const m = correctAnswerRaw.match(/^([A-D])/i);
            if (m) {
              const letterIndex = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 }[m[1].toUpperCase()];
              if (letterIndex !== undefined && opts[letterIndex]) {
                correctText = opts[letterIndex].text;
              }
            }
            if (!correctText) {
              // Bizonytalan vagy hiányzó kulcs: ne válasszon ki önkényesen opciót, tanári ellenőrzést igényel (Report 15 / 3. fejezet)
              correctText = '';
            }
          }
        }

        const needsReview = !correctText;

        let matchedImage = null;
        if (pageImages.length === qKeyMatches.length) {
          matchedImage = pageImages[i];
        } else if (pageImages.length > 0) {
          const imgIdx = i - (qKeyMatches.length - pageImages.length);
          if (imgIdx >= 0 && imgIdx < pageImages.length) {
            matchedImage = pageImages[imgIdx];
          }
        }

        parsedQuestions.push({
          question_order: qNum,
          question_text: qBody,
          instructions: isTF ? 'Döntsd el, hogy az állítás igaz vagy hamis!' : 'Válaszd ki az egyetlen helyes megoldást!',
          question_type: isTF ? 'TF' : 'ABCD',
          points: 1,
          options: isTF ? ['Igaz', 'Hamis'] : opts.map(o => o.text),
          correct_answer: correctText,
          needs_review: needsReview,
          imageBuffer: matchedImage ? matchedImage.pngBuffer : null
        });
      }
    } else {
      // Megoldókulcs nélküli diák PDF feldolgozása:
      // Kérdésszámok: (\d+)\.
      const qNums = [...pageFullText.matchAll(/(?:^|\n)(\d+)\.\s*/g)];
      // Opciók kinyerése
      const optionMatches = [...pageFullText.matchAll(/([\s\S]*?)\n([A-D])(?:\n|$)/g)];
      const questionOptions = [];
      let currentQOptions = [];
      for (const om of optionMatches) {
        const optText = om[1].trim().replace(/\s+/g, ' ');
        const optLetter = om[2].trim();
        if (optLetter === 'A' && currentQOptions.length > 0) {
          questionOptions.push(currentQOptions);
          currentQOptions = [];
        }
        currentQOptions.push({ letter: optLetter, text: optText });
      }
      if (currentQOptions.length > 0) {
        questionOptions.push(currentQOptions);
      }

      for (let i = 0; i < qNums.length; i++) {
        const qNum = parseInt(qNums[i][1], 10);
        const startPos = qNums[i].index + qNums[i][0].length;
        const endPos = (i + 1 < qNums.length) ? qNums[i + 1].index : pageFullText.indexOf(optionMatches[0] ? optionMatches[0][0] : pageFullText.length);
        const qBody = pageFullText.slice(startPos, endPos > startPos ? endPos : pageFullText.length).trim().replace(/\s+/g, ' ');
        const opts = questionOptions[i] || [];
        const isTF = opts.length === 2 && opts[0].text === 'Igaz' && opts[1].text === 'Hamis';

        let matchedImage = null;
        if (pageImages.length === qNums.length) {
          matchedImage = pageImages[i];
        } else if (pageImages.length > 0) {
          const imgIdx = i - (qNums.length - pageImages.length);
          if (imgIdx >= 0 && imgIdx < pageImages.length) {
            matchedImage = pageImages[imgIdx];
          }
        }

        parsedQuestions.push({
          question_order: qNum,
          question_text: qBody,
          instructions: isTF ? 'Döntsd el, hogy az állítás igaz vagy hamis!' : 'Válaszd ki az egyetlen helyes megoldást!',
          question_type: isTF ? 'TF' : 'ABCD',
          points: 1,
          options: isTF ? ['Igaz', 'Hamis'] : opts.map(o => o.text),
          correct_answer: isTF ? 'Igaz' : (opts[0] ? opts[0].text : 'A'), // Alapértelmezett, tanár egy kattintással ellenőrizheti
          imageBuffer: matchedImage ? matchedImage.pngBuffer : null
        });
      }
    }
  }

  return { quizTitle, questions: parsedQuestions };
}

module.exports = {
  createPng,
  parseSocrativePdf
};
