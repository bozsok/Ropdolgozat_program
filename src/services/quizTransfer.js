const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const archiver = require('archiver');
const db = require('../db/init');
const quizRepo = require('../db/quizRepo');
const config = require('../../config');

const PACKAGE_FORMAT = 'okoskodo-quiz-package';
const PACKAGE_VERSION = 1;

/**
 * Biztonságos, ékezetmentes fájlnév-slug képzése letöltéshez
 */
function slugifyFilename(text, fallback = 'csomag') {
  const cleaned = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}

/**
 * Helyi /uploads/... relatív URL feloldása biztonságos abszolút fájlrendszeri útvonalra
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

/**
 * Kép-URL-ek átírása a correct_answer mezőben (egyszeres string vagy többválasztós JSON tömb esetén)
 */
function remapAnswerPaths(rawCorrect, pathMap) {
  if (!rawCorrect || !pathMap || pathMap.size === 0) return rawCorrect;
  const str = String(rawCorrect).trim();
  if (!str) return rawCorrect;

  if (pathMap.has(str)) {
    return pathMap.get(str);
  }
  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        let changed = false;
        const mapped = parsed.map(item => {
          const s = String(item ?? '').trim();
          if (pathMap.has(s)) {
            changed = true;
            return pathMap.get(s);
          }
          return item;
        });
        return changed ? JSON.stringify(mapped) : rawCorrect;
      }
    } catch {}
  }
  return rawCorrect;
}

/**
 * ZIP-02: Helyi képfájl szigorú előellenőrzése export előtt (létezés, rendes fájl, olvashatóság)
 */
function assertExportableLocalImage(relUrl, context) {
  const trimmed = String(relUrl || '').trim();
  const fieldLabel = context.optionIndex
    ? `${context.optionIndex}. opcióképe`
    : 'főképe';

  const fullPath = resolveLocalUploadPath(trimmed);
  if (!fullPath) {
    throw Object.assign(
      new Error(`A „${context.quizTitle}” teszt ${context.questionOrder}. kérdésének ${fieldLabel} érvénytelen vagy nem támogatott képútvonalra mutat. Csatold újra a képet, majd ismételd meg az exportot.`),
      {
        status: 400,
        code: 'MISSING_EXPORT_ASSET',
        quizId: context.quizId,
        quizTitle: context.quizTitle,
        questionOrder: context.questionOrder,
        optionIndex: context.optionIndex || null
      }
    );
  }

  let stat = null;
  try {
    stat = fs.statSync(fullPath);
  } catch {
    throw Object.assign(
      new Error(`A „${context.quizTitle}” teszt ${context.questionOrder}. kérdésének ${fieldLabel} hiányzik a szerverről. Csatold újra a képet, majd ismételd meg az exportot.`),
      {
        status: 400,
        code: 'MISSING_EXPORT_ASSET',
        quizId: context.quizId,
        quizTitle: context.quizTitle,
        questionOrder: context.questionOrder,
        optionIndex: context.optionIndex || null
      }
    );
  }

  if (!stat.isFile()) {
    throw Object.assign(
      new Error(`A „${context.quizTitle}” teszt ${context.questionOrder}. kérdésének ${fieldLabel} nem érvényes fájl a szerveren. Csatold újra a képet, majd ismételd meg az exportot.`),
      {
        status: 400,
        code: 'MISSING_EXPORT_ASSET',
        quizId: context.quizId,
        quizTitle: context.quizTitle,
        questionOrder: context.questionOrder,
        optionIndex: context.optionIndex || null
      }
    );
  }

  try {
    fs.accessSync(fullPath, fs.constants.R_OK);
  } catch {
    throw Object.assign(
      new Error(`A „${context.quizTitle}” teszt ${context.questionOrder}. kérdésének ${fieldLabel} nem olvasható a szerveren.`),
      {
        status: 500,
        code: 'EXPORT_ASSET_READ_ERROR',
        quizId: context.quizId,
        quizTitle: context.quizTitle,
        questionOrder: context.questionOrder,
        optionIndex: context.optionIndex || null
      }
    );
  }

  return fullPath;
}

/**
 * Közös, ellenőrzött ideiglenes ZIP csomagépítő (ZIP-01 & ZIP-02):
 * Előbb minden helyi képet ellenőriz, elkészíti a teljes .zip fájlt egy külön ideiglenes mappában,
 * és csak 100%-ban sikeres véglegesítés után adja vissza letöltésre!
 */
async function buildExportZipFile({ kind, rootName, folders = [], quizRecords = [] }) {
  const assetByOrigUrl = new Map(); // origRelUrl -> { assetPath, fullPath }
  const usedAssetPaths = new Set();
  let assetSeq = 0;

  // Összes szöveges opció gyűjtése, hogy az asset név soha ne ütközzön szöveges opcióval
  const existingOptionTexts = new Set();
  for (const { quiz } of quizRecords) {
    for (const q of (quiz.questions || [])) {
      const rawOpts = Array.isArray(q.options) ? q.options : [];
      for (const opt of rawOpts) {
        if (typeof opt === 'string') existingOptionTexts.add(opt.trim());
        else if (opt && typeof opt === 'object' && opt.text) existingOptionTexts.add(String(opt.text).trim());
      }
    }
  }

  const registerImageAsset = (relUrl, context) => {
    if (!relUrl || typeof relUrl !== 'string') return null;
    const trimmed = relUrl.trim();
    if (!trimmed) return null;

    if (assetByOrigUrl.has(trimmed)) {
      return assetByOrigUrl.get(trimmed).assetPath;
    }

    // ZIP-02: minden megadott kép kötelező és ellenőrzött!
    const fullPath = assertExportableLocalImage(trimmed, context);

    const ext = path.extname(fullPath).toLowerCase() || '.bin';
    let assetPath = '';
    do {
      assetSeq += 1;
      assetPath = `assets/img_${String(assetSeq).padStart(4, '0')}${ext}`;
    } while (usedAssetPaths.has(assetPath) || existingOptionTexts.has(assetPath));

    usedAssetPaths.add(assetPath);
    assetByOrigUrl.set(trimmed, { assetPath, fullPath });
    return assetPath;
  };

  const exportedQuizzes = quizRecords.map(({ quiz, folderKey = null, siblingPosition = null }) => {
    const serializedQuestions = (quiz.questions || []).map((q, idx) => {
      const qOrder = Number(q.question_order) || (idx + 1);
      const qPathMap = new Map();
      let imageAsset = null;

      if (q.image_path && String(q.image_path).trim()) {
        const oldMain = String(q.image_path).trim();
        const mappedMain = registerImageAsset(oldMain, {
          quizId: quiz.id,
          quizTitle: quiz.title,
          questionOrder: qOrder,
          optionIndex: null
        });
        qPathMap.set(oldMain, mappedMain);
        imageAsset = mappedMain;
      }

      const rawOpts = Array.isArray(q.options) ? q.options : [];
      const exportedOptions = rawOpts.map((opt, optIdx) => {
        if (opt && typeof opt === 'object') {
          const text = opt.text !== undefined && opt.text !== null ? String(opt.text) : '';
          let optAsset = null;
          if (typeof opt.image_path === 'string' && opt.image_path.trim()) {
            const oldOptUrl = opt.image_path.trim();
            const mappedOpt = registerImageAsset(oldOptUrl, {
              quizId: quiz.id,
              quizTitle: quiz.title,
              questionOrder: qOrder,
              optionIndex: optIdx + 1
            });
            qPathMap.set(oldOptUrl, mappedOpt);
            optAsset = mappedOpt;
          }
          return optAsset ? { text, image_asset: optAsset } : text;
        }
        return opt;
      });

      const exportedCorrect = remapAnswerPaths(q.correct_answer, qPathMap);

      return {
        question_order: qOrder,
        question_type: q.question_type || 'ABCD',
        question_text: q.question_text || '',
        instructions: q.instructions || '',
        image_asset: imageAsset,
        options: exportedOptions,
        correct_answer: exportedCorrect || '',
        explanation: q.explanation || '',
        points: Number(q.points) || 1.0
      };
    });

    return {
      folderKey,
      siblingPosition,
      title: quiz.title,
      subject_id: Number(quiz.subject_id) || 1,
      subject_name: quiz.subject_name || '',
      subject_grade: quiz.subject_grade || '',
      default_time_limit_min: Number(quiz.default_time_limit_min) || 0,
      sort_order: Number(quiz.sort_order) || 0,
      questions: serializedQuestions
    };
  });

  const pkgJsonPath = path.join(__dirname, '..', '..', 'package.json');
  let appVersion = '1.0.0';
  try {
    appVersion = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).version || appVersion;
  } catch {}

  const manifest = {
    format: PACKAGE_FORMAT,
    formatVersion: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    kind,
    rootName,
    folders,
    quizzes: exportedQuizzes
  };

  const prefix = kind === 'folder' ? 'mappa' : 'teszt';
  const filename = `okoskodo_${prefix}_${slugifyFilename(rootName)}.zip`;

  // ZIP-02: elkülönített ideiglenes .zip fájlba írás és teljes véglegesítés megvárása letöltés ELŐTT
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okoskodo_qexp_'));
  const zipPath = path.join(tempDir, filename);
  const cleanup = () => {
    const attemptRemove = (triesLeft) => {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (rmErr) {
        if (triesLeft > 0) {
          setTimeout(() => attemptRemove(triesLeft - 1), 120);
        } else {
          console.warn('Figyelmeztetés: ideiglenes export könyvtár takarítása sikertelen:', rmErr.message);
        }
      }
    };
    attemptRemove(3);
  };

  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const out = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      out.on('error', fail);
      out.on('close', succeed);
      archive.on('error', fail);
      archive.on('warning', (warn) => {
        // Minden fájlhiány/I/O figyelmeztetés végzetes hiba!
        fail(Object.assign(new Error(`Exportálási csomagolási hiba: ${warn.message}`), { status: 500, code: 'EXPORT_ARCHIVE_ERROR' }));
      });

      archive.pipe(out);
      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
      for (const { assetPath, fullPath } of assetByOrigUrl.values()) {
        archive.file(fullPath, { name: assetPath });
      }
      archive.finalize();
    });

    return { zipPath, filename, cleanup };
  } catch (err) {
    cleanup();
    throw err;
  }
}

/**
 * Egyetlen teszt exportálása ellenőrzött .zip fájlba (kérdések + főkép + ABCD opcióképek)
 */
async function createQuizExportZipFile(quizId) {
  const quiz = quizRepo.getQuizById(Number(quizId), false);
  if (!quiz) {
    throw Object.assign(new Error('Az exportálandó teszt nem található!'), { status: 404 });
  }
  return buildExportZipFile({
    kind: 'quiz',
    rootName: quiz.title,
    folders: [],
    quizRecords: [{ quiz, folderKey: null, siblingPosition: null }]
  });
}

/**
 * Egy mappa teljes rekurzív exportálása ellenőrzött .zip fájlba (almappák + tesztek + képek)
 * ZIP-01: A felületi rendezést használó quizRepo.getFolders() és quizRepo.getQuizzes() alapján járja be a fát!
 */
async function createFolderExportZipFile(folderId) {
  const rootFolder = db.prepare('SELECT id, parent_id, name, sort_order FROM quiz_folders WHERE id = ?').get(Number(folderId));
  if (!rootFolder) {
    throw Object.assign(new Error('Az exportálandó mappa nem található!'), { status: 404 });
  }

  const folders = [];
  const quizRecords = [];
  let folderSeq = 0;

  const collectFolder = (folderRow, parentKey, siblingPosition) => {
    const key = `f_${folderSeq++}`;
    folders.push({
      key,
      parentKey,
      siblingPosition,
      name: folderRow.name,
      sort_order: Number(folderRow.sort_order) || 0
    });

    // ZIP-01: Pontosan a tanári felületi rendezés szerint olvassuk ki a teszteket
    const folderQuizzes = quizRepo.getQuizzes(null, null, folderRow.id);
    folderQuizzes.forEach((qSummary, idx) => {
      const fullQuiz = quizRepo.getQuizById(qSummary.id, false);
      if (fullQuiz) {
        quizRecords.push({ quiz: fullQuiz, folderKey: key, siblingPosition: idx + 1 });
      }
    });

    // ZIP-01: Pontosan a tanári felületi rendezés szerint olvassuk ki az almappákat
    const childFolders = quizRepo.getFolders(folderRow.id);
    childFolders.forEach((child, idx) => {
      collectFolder(child, key, idx + 1);
    });
  };

  collectFolder(rootFolder, null, null);

  return buildExportZipFile({
    kind: 'folder',
    rootName: rootFolder.name,
    folders,
    quizRecords
  });
}

/**
 * ZIP kicsomagolása Windows Server 2016 kompatibilis módon (bsdtar vagy .NET ZipFile)
 */
function extractZipSafe(zipFilePath, destDir) {
  try {
    execSync(`tar -xf "${zipFilePath}" -C "${destDir}"`, { stdio: 'pipe' });
  } catch {
    const safeZip = String(zipFilePath).replace(/'/g, "''");
    const safeDest = String(destDir).replace(/'/g, "''");
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; if (Test-Path -LiteralPath '${safeDest}') { Remove-Item -LiteralPath '${safeDest}' -Recurse -Force }; [System.IO.Compression.ZipFile]::ExtractToDirectory('${safeZip}', '${safeDest}')"`,
      { stdio: 'pipe' }
    );
  }
}

/**
 * Testvérelemek stabil rendezése manifestből (ZIP-01):
 * 1. Ha van pozitív egész siblingPosition, az alapján rendez.
 * 2. Régi csomagoknál tartalék: pozitív sort_order előre (sort_order ASC), majd a többi az eredeti manifest sorrendben.
 */
function sortSiblingGroup(items) {
  return items
    .map((item, origIdx) => ({ item, origIdx }))
    .sort((a, b) => {
      const aPos = Number(a.item.siblingPosition);
      const bPos = Number(b.item.siblingPosition);
      const aHasPos = Number.isInteger(aPos) && aPos > 0;
      const bHasPos = Number.isInteger(bPos) && bPos > 0;
      if (aHasPos && bHasPos) return aPos - bPos || (a.origIdx - b.origIdx);
      if (aHasPos !== bHasPos) return aHasPos ? -1 : 1;

      const aSort = Number(a.item.sort_order) || 0;
      const bSort = Number(b.item.sort_order) || 0;
      const aPosSort = aSort > 0;
      const bPosSort = bSort > 0;
      if (aPosSort && bPosSort) return aSort - bSort || (a.origIdx - b.origIdx);
      if (aPosSort !== bPosSort) return aPosSort ? -1 : 1;
      return a.origIdx - b.origIdx;
    })
    .map(entry => entry.item);
}

/**
 * Teszt- vagy mappacsomag (.zip) additív importálása a megadott célmappába.
 * A meglévő teszteket, diákokat és dolgozateredményeket EGYÁLTALÁN NEM módosítja!
 */
function importQuizPackage(zipFilePath, { targetFolderId = null } = {}) {
  if (!zipFilePath || !fs.existsSync(zipFilePath)) {
    throw Object.assign(new Error('A feltöltött csomagfájl nem található!'), { status: 400 });
  }

  const normalizedTargetFolderId = (targetFolderId !== null && targetFolderId !== undefined && targetFolderId !== '' && targetFolderId !== 'root')
    ? Number(targetFolderId)
    : null;

  if (normalizedTargetFolderId !== null) {
    const targetExists = db.prepare('SELECT id FROM quiz_folders WHERE id = ?').get(normalizedTargetFolderId);
    if (!targetExists) {
      throw Object.assign(new Error('A kiválasztott célmappa nem található!'), { status: 404 });
    }
  }

  const tempExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okoskodo_qpkg_'));
  const createdTempFiles = [];
  const createdQuizIds = [];
  const createdFolderIds = [];

  try {
    extractZipSafe(zipFilePath, tempExtractDir);

    const manifestPath = path.join(tempExtractDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw Object.assign(
        new Error('Érvénytelen tesztcsomag: hiányzik a manifest.json! (Teljes rendszermentést a Beállítások és mentés menüben állíthatsz vissza.)'),
        { status: 400, code: 'INVALID_PACKAGE_FORMAT' }
      );
    }

    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      throw Object.assign(new Error('Sérült manifest.json a tesztcsomagban!'), { status: 400, code: 'INVALID_PACKAGE_FORMAT' });
    }

    if (!manifest || manifest.format !== PACKAGE_FORMAT || manifest.formatVersion !== PACKAGE_VERSION || !Array.isArray(manifest.quizzes)) {
      throw Object.assign(new Error('Nem támogatott vagy sérült Okoskodó tesztcsomag formátum!'), { status: 400, code: 'INVALID_PACKAGE_FORMAT' });
    }

    // ZIP-01: Mappafa előzetes validációja (kulcs-egyediség, szülőhivatkozások, ciklusmentesség) MÉG az első írás előtt!
    const manifestFolders = Array.isArray(manifest.folders) ? manifest.folders : [];
    const folderByKey = new Map();
    for (const fItem of manifestFolders) {
      const key = fItem && typeof fItem.key === 'string' ? fItem.key.trim() : '';
      if (!key || folderByKey.has(key)) {
        throw Object.assign(new Error('Érvénytelen vagy duplikált mappakulcs a tesztcsomagban!'), { status: 400, code: 'INVALID_PACKAGE_FORMAT' });
      }
      folderByKey.set(key, fItem);
    }
    for (const [key, fItem] of folderByKey.entries()) {
      if (fItem.parentKey !== null && fItem.parentKey !== undefined && fItem.parentKey !== '') {
        if (!folderByKey.has(fItem.parentKey)) {
          throw Object.assign(new Error(`Hibás szülőmappa-hivatkozás a csomagban (${fItem.parentKey})!`), { status: 400, code: 'INVALID_PACKAGE_FORMAT' });
        }
        // Ciklusellenőrzés
        const visited = new Set([key]);
        let cur = fItem.parentKey;
        while (cur) {
          if (visited.has(cur)) {
            throw Object.assign(new Error('Körkörös mappahivatkozás található a tesztcsomagban!'), { status: 400, code: 'INVALID_PACKAGE_FORMAT' });
          }
          visited.add(cur);
          const p = folderByKey.get(cur);
          cur = p && p.parentKey ? p.parentKey : null;
        }
      }
    }
    for (const qPkg of manifest.quizzes) {
      if (qPkg.folderKey !== null && qPkg.folderKey !== undefined && qPkg.folderKey !== '') {
        if (!folderByKey.has(qPkg.folderKey)) {
          throw Object.assign(new Error(`Hibás mappahivatkozás a(z) „${qPkg.title || '?'}” tesztnél (${qPkg.folderKey})!`), { status: 400, code: 'INVALID_PACKAGE_FORMAT' });
        }
      }
    }

    // Tantárgyak betöltése név/ID szerinti párosításhoz
    const allSubjects = quizRepo.getSubjects();
    const subjectByName = new Map(allSubjects.map(s => [String(s.name || '').trim().toLowerCase(), Number(s.id)]));
    const subjectIds = new Set(allSubjects.map(s => Number(s.id)));
    const fallbackSubjectId = allSubjects.length > 0 ? Number(allSubjects[0].id) : 1;

    const resolveSubjectId = (qObj) => {
      if (qObj.subject_name) {
        const byName = subjectByName.get(String(qObj.subject_name).trim().toLowerCase());
        if (byName) return byName;
      }
      if (qObj.subject_id && subjectIds.has(Number(qObj.subject_id))) {
        return Number(qObj.subject_id);
      }
      return fallbackSubjectId;
    };

    // Asset fájlok előzetes ellenőrzése és biztonságos bemásolása quizzes/temp mappába
    const uploadsTempDir = path.join(config.uploadsDir, 'quizzes', 'temp');
    fs.mkdirSync(uploadsTempDir, { recursive: true });
    const extractBaseResolved = path.resolve(tempExtractDir);

    const assertAssetExistsInExtract = (assetRelPath) => {
      const trimmed = String(assetRelPath || '').trim().replace(/\\/g, '/');
      if (!trimmed.startsWith('assets/') || trimmed.includes('..')) {
        throw Object.assign(new Error(`Érvénytelen képhivatkozás a csomagban: ${trimmed}`), { status: 400, code: 'INVALID_ASSET_PATH' });
      }
      const srcFull = path.resolve(extractBaseResolved, trimmed);
      if (!srcFull.startsWith(extractBaseResolved + path.sep) || !fs.existsSync(srcFull) || !fs.statSync(srcFull).isFile()) {
        throw Object.assign(new Error(`Hiányzó képfájl a tesztcsomagban: ${trimmed}`), { status: 400, code: 'MISSING_PACKAGE_ASSET' });
      }
      return srcFull;
    };

    // Előellenőrzés minden hivatkozott assetre, MÉG mielőtt egyetlen mappát vagy tesztet létrehoznánk!
    for (const qPkg of manifest.quizzes) {
      for (const q of (Array.isArray(qPkg.questions) ? qPkg.questions : [])) {
        if (q.image_asset) assertAssetExistsInExtract(q.image_asset);
        for (const opt of (Array.isArray(q.options) ? q.options : [])) {
          if (opt && typeof opt === 'object' && opt.image_asset) {
            assertAssetExistsInExtract(opt.image_asset);
          }
        }
      }
    }

    const stageAssetForQuiz = (assetRelPath) => {
      if (!assetRelPath || typeof assetRelPath !== 'string') return null;
      const srcFull = assertAssetExistsInExtract(assetRelPath);
      const ext = path.extname(srcFull).toLowerCase() || '.png';
      const uniqueName = `imp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
      const dstFull = path.join(uploadsTempDir, uniqueName);
      fs.copyFileSync(srcFull, dstFull);
      createdTempFiles.push(dstFull);
      return `/uploads/quizzes/temp/${uniqueName}`;
    };

    // 1. Mappák létrehozása szülő -> gyermek sorrendben, belső almappák egyéni sorrendjének megőrzésével (ZIP-01)
    const folderKeyToNewId = new Map();
    const childrenByParentKey = new Map(); // parentKey || '__ROOT__' -> fItem[]
    for (const fItem of manifestFolders) {
      const pKey = (fItem.parentKey !== null && fItem.parentKey !== undefined && fItem.parentKey !== '') ? fItem.parentKey : '__ROOT__';
      if (!childrenByParentKey.has(pKey)) childrenByParentKey.set(pKey, []);
      childrenByParentKey.get(pKey).push(fItem);
    }

    const updateFolderSortStmt = db.prepare('UPDATE quiz_folders SET sort_order = ? WHERE id = ?');
    const createFolderSubtree = (parentKey, parentDbId, isInsideImportedTree) => {
      const rawChildren = childrenByParentKey.get(parentKey) || [];
      const sortedChildren = sortSiblingGroup(rawChildren);
      sortedChildren.forEach((fItem, idx) => {
        const createdFolder = quizRepo.createFolder({
          name: String(fItem.name || 'Importált mappa').trim(),
          parent_id: parentDbId
        });
        folderKeyToNewId.set(fItem.key, createdFolder.id);
        createdFolderIds.push(createdFolder.id);

        // Csak az importált mappafán BELÜLI almappákra állítjuk be a testvérpozíciót (a célmappa meglévő elemeit nem bántjuk)
        if (isInsideImportedTree) {
          updateFolderSortStmt.run(idx + 1, createdFolder.id);
        }

        createFolderSubtree(fItem.key, createdFolder.id, true);
      });
    };

    createFolderSubtree('__ROOT__', normalizedTargetFolderId, false);

    // 2. Tesztek csoportosítása célmappa-kulcs szerint és létrehozása pontos testvérsorrenddel (ZIP-01)
    const quizzesByFolderKey = new Map(); // folderKey || '__ROOT__' -> qPkg[]
    for (const qPkg of manifest.quizzes) {
      const fKey = (qPkg.folderKey !== null && qPkg.folderKey !== undefined && qPkg.folderKey !== '') ? qPkg.folderKey : '__ROOT__';
      if (!quizzesByFolderKey.has(fKey)) quizzesByFolderKey.set(fKey, []);
      quizzesByFolderKey.get(fKey).push(qPkg);
    }

    const updateQuizSortStmt = db.prepare('UPDATE quizzes SET sort_order = ? WHERE id = ?');
    const importedQuizzes = [];

    for (const [fKey, groupQuizzes] of quizzesByFolderKey.entries()) {
      const isInsideImportedFolder = fKey !== '__ROOT__' && folderKeyToNewId.has(fKey);
      const targetQuizFolderId = isInsideImportedFolder
        ? folderKeyToNewId.get(fKey)
        : normalizedTargetFolderId;

      const sortedGroup = sortSiblingGroup(groupQuizzes);

      sortedGroup.forEach((qPkg, idx) => {
        const preparedQuestions = (Array.isArray(qPkg.questions) ? qPkg.questions : []).map((q, qIdx) => {
          const assetToTempMap = new Map();
          let tempMainUrl = null;
          if (q.image_asset) {
            tempMainUrl = stageAssetForQuiz(q.image_asset);
            assetToTempMap.set(q.image_asset, tempMainUrl);
          }

          const mappedOptions = (Array.isArray(q.options) ? q.options : []).map(opt => {
            if (opt && typeof opt === 'object' && opt.image_asset) {
              let tempOptUrl = assetToTempMap.get(opt.image_asset);
              if (!tempOptUrl) {
                tempOptUrl = stageAssetForQuiz(opt.image_asset);
                assetToTempMap.set(opt.image_asset, tempOptUrl);
              }
              return { text: String(opt.text || ''), image_path: tempOptUrl };
            }
            return opt;
          });

          const mappedCorrect = remapAnswerPaths(q.correct_answer, assetToTempMap);

          return {
            question_order: Number(q.question_order) || (qIdx + 1),
            question_type: q.question_type || 'ABCD',
            question_text: q.question_text || '',
            instructions: q.instructions || '',
            image_path: tempMainUrl,
            options: mappedOptions,
            correct_answer: mappedCorrect || '',
            explanation: q.explanation || '',
            points: Number(q.points) || 1.0
          };
        });

        const createdQuiz = quizRepo.createQuiz({
          subject_id: resolveSubjectId(qPkg),
          folder_id: targetQuizFolderId,
          title: String(qPkg.title || 'Importált teszt').trim(),
          subject_grade: String(qPkg.subject_grade || '').trim(),
          default_time_limit_min: Number(qPkg.default_time_limit_min) || 0,
          questions: preparedQuestions
        });
        createdQuizIds.push(createdQuiz.id);

        // Csak az importált mappafán BELÜLI tesztekre állítjuk be az 1..M sorrendet
        if (isInsideImportedFolder) {
          updateQuizSortStmt.run(idx + 1, createdQuiz.id);
        }

        importedQuizzes.push({ id: createdQuiz.id, title: createdQuiz.title });
      });
    }

    return {
      importedQuizzesCount: importedQuizzes.length,
      importedFoldersCount: createdFolderIds.length,
      quizzes: importedQuizzes
    };
  } catch (err) {
    // Hiba esetén az ebben a kérésben újonnan létrehozott teszteket és mappákat visszatöröljük
    for (const qId of [...createdQuizIds].reverse()) {
      try { quizRepo.deleteQuiz(qId); } catch {}
    }
    for (const fId of [...createdFolderIds].reverse()) {
      try { quizRepo.deleteFolder(fId); } catch {}
    }
    throw err;
  } finally {
    // Maradék ideiglenes temp fájlok és kicsomagolt könyvtár takarítása
    for (const tf of createdTempFiles) {
      try { if (fs.existsSync(tf)) fs.unlinkSync(tf); } catch {}
    }
    try {
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

module.exports = {
  createQuizExportZipFile,
  createFolderExportZipFile,
  importQuizPackage
};
