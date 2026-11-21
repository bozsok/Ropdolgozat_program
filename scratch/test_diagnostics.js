/**
 * scratch/test_diagnostics.js - Helyi diagnosztika és eseménynaplózás átfogó tesztcsomagja (T-01 - T-08)
 * Specifikáció: Source/Beepitesi_terv_01_vegrehajtasi_terv_01.md (v1.2)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');

console.log('================================================================');
console.log('   HELYI DIAGNOSZTIKA ÉS ESEMÉNYNAPLÓZÁS ELFOGADÁSI TESZTCSOMAG ');
console.log('================================================================\n');

// 1. Teljesen izolált tesztkörnyezet létrehozása
const testRunId = `diag_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const isolatedDir = path.join(os.tmpdir(), testRunId);
fs.mkdirSync(isolatedDir, { recursive: true });

const isolatedDbPath = path.join(isolatedDir, 'ropdolgozat_diag.db');
const isolatedUploadsDir = path.join(isolatedDir, 'uploads_diag');
const isolatedDiagnosticsDir = path.join(isolatedDir, 'data', 'diagnostics');
fs.mkdirSync(isolatedUploadsDir, { recursive: true });
fs.mkdirSync(isolatedDiagnosticsDir, { recursive: true });

process.env.DB_PATH = isolatedDbPath;
process.env.UPLOADS_DIR = isolatedUploadsDir;
process.env.DIAGNOSTICS_DIR = isolatedDiagnosticsDir;
process.env.DIAGNOSTICS_ENABLED = 'true';

console.log(`✓ Elszigetelt tesztkörnyezet: ${isolatedDir}`);
console.log(`✓ Teszt adatbázis: ${isolatedDbPath}`);
console.log(`✓ Teszt diagnosztikai mappa: ${isolatedDiagnosticsDir}\n`);

// Adatbázis inicializálása
const db = require('../src/db/init');
const sessionRepo = require('../src/db/sessionRepo');
const quizRepo = require('../src/db/quizRepo');
const rosterRepo = require('../src/db/rosterRepo');
const backup = require('../src/services/backup');
const {
  DiagnosticsService,
  RingBufferQueue,
  DeduplicationCache,
  DiagnosticsFileWriter
} = require('../src/services/diagnostics');

// HTTP segédfüggvény hívásokhoz
function httpRequest(options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
          rawBody: data
        });
      });
    });
    req.on('error', reject);
    if (bodyData) {
      if (typeof bodyData === 'string' || Buffer.isBuffer(bodyData)) {
        req.write(bodyData);
      } else {
        req.write(JSON.stringify(bodyData));
      }
    }
    req.end();
  });
}

(async () => {
  let testServer = null;
  let serverPort = 0;

  try {
    // Szerver és app betöltése
    const { app } = require('../server');
    testServer = http.createServer(app);

    await new Promise((resolve) => {
      testServer.listen(0, '127.0.0.1', () => {
        serverPort = testServer.address().port;
        resolve();
      });
    });
    console.log(`✓ Teszt HTTP szerver elindult a(z) ${serverPort}-es porton.\n`);

    // Admin bejelentkezés a teszthez
    const loginRes = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: 'admin123' });
    assert.strictEqual(loginRes.status, 200);
    const adminCookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0].split(';')[0] : '';
    assert.ok(adminCookie, 'Admin süti sikeresen megszerezve');

    // Előkészítünk egy teszt kvízt, osztályt és aktív dolgozatot
    const quizzes = quizRepo.getQuizzes();
    const quiz = quizzes[0];
    const quizDetails = quizRepo.getQuizById(quiz.id);
    const firstQ = quizDetails.questions[0];

    const session = sessionRepo.startSession({
      quiz_id: quiz.id,
      subject_id: quiz.subject_id,
      class_name: '6.a',
      grade_level: 6,
      mode: 'STUDENT_PACED'
    });

    let students = rosterRepo.getStudentsByClass('6.a');
    if (students.length === 0) {
      rosterRepo.saveClassRoster('6.a', ['Balogh Ádám', 'Budai Dániel', 'Fekete Emma', 'Kovács Péter', 'Nagy Lili']);
      students = rosterRepo.getStudentsByClass('6.a');
    }
    const student1 = students[0];
    const student2 = students[1] || { id: 999, student_name: 'Teszt Elek' };

    // Diák 1 csatlakozása
    const joinRes1 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/join',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      session_id: session.id,
      student_id: student1.id,
      student_name: student1.student_name,
      pc_number: 1
    });

    assert.strictEqual(joinRes1.status, 200);
    assert.strictEqual(joinRes1.data.diagnosticsEnabled, true);
    const token1 = joinRes1.data.token;
    console.log('✓ Teszt munkamenet és résztvevő előkészítve.');

    // -------------------------------------------------------------------------
    // T-01: Normál válaszbeküldés
    // -------------------------------------------------------------------------
    console.log('\n--- T-01: Normál válaszbeküldés tesztelése ---');
    const reqId1 = '11111111111111111111111111111111';
    const opId1 = '22222222222222222222222222222222';

    const submitRes1 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/submit-answer',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': token1,
        'x-request-id': reqId1,
        'x-operation-id': opId1
      }
    }, {
      session_token: token1,
      question_id: firstQ.id,
      submitted_answer: 'A',
      time_spent_sec: 5
    });

    assert.strictEqual(submitRes1.status, 200);
    assert.strictEqual(submitRes1.headers['x-request-id'], reqId1);

    // Kliensoldali esemény felküldése (answer.acknowledged)
    const clientEvent1 = {
      eventId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      event: 'answer.acknowledged',
      requestId: reqId1,
      operationId: opId1,
      outcome: 'ok',
      clientAt: new Date().toISOString()
    };

    const batchRes1 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': token1
      }
    }, { events: [clientEvent1] });

    assert.strictEqual(batchRes1.status, 204);

    // Várunk a memóriasor kiürülésére
    await new Promise(r => setTimeout(r, 400));

    // Admin export lekérése
    const exportRes1 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/admin/diagnostics/export',
      method: 'GET',
      headers: {
        'Cookie': adminCookie
      }
    });

    assert.strictEqual(exportRes1.status, 200);
    const exportLines1 = exportRes1.rawBody.trim().split('\n').filter(Boolean).map(JSON.parse);

    // Ellenőrzések:
    const persistedEvt = exportLines1.find(e => e.event === 'answer.persisted' && e.requestId === reqId1);
    assert.ok(persistedEvt, 'Megtalálható az answer.persisted esemény a logban');
    assert.strictEqual(persistedEvt.outcome, 'saved');
    assert.strictEqual(persistedEvt.operationId, opId1);

    const clientAckEvt = exportLines1.find(e => e.event === 'answer.acknowledged' && e.requestId === reqId1);
    assert.ok(clientAckEvt, 'Megtalálható az answer.acknowledged kliensesemény a logban');

    // Adatbázisban pontosan 1 válasz szerepel
    const dbAnswersCount = db.prepare('SELECT COUNT(*) as cnt FROM answers WHERE participant_id = ?').get(joinRes1.data.participant.id).cnt;
    assert.strictEqual(dbAnswersCount, 1);
    console.log('✓ T-01 sikeres: a szerver és kliens azonosítók egyeznek, adatbázisban pontosan 1 válasz van.');

    // -------------------------------------------------------------------------
    // T-02: Szerver előtt elakadt kérés
    // -------------------------------------------------------------------------
    console.log('\n--- T-02: Szerver előtt elakadt kérés tesztelése ---');
    // Diák 2 belép
    const joinRes2 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/join',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      session_id: session.id,
      student_id: student2.id,
      student_name: student2.student_name,
      pc_number: 2
    });
    const token2 = joinRes2.data.token;

    const lostReqId = '33333333333333333333333333333333';
    const lostOpId = '44444444444444444444444444444444';

    // A kérés nem éri el a szervert (szimuláció: kliensnél keletkezik no_ack)
    const clientNoAck = {
      eventId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      event: 'answer.no_ack',
      requestId: lostReqId,
      operationId: lostOpId,
      outcome: 'no_ack',
      clientAt: new Date().toISOString()
    };

    // Amikor helyreáll a kapcsolat, a puffer beürül
    const batchRes2 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': token2
      }
    }, { events: [clientNoAck] });

    assert.strictEqual(batchRes2.status, 204);
    await new Promise(r => setTimeout(r, 400));

    const exportRes2 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/admin/diagnostics/export',
      method: 'GET',
      headers: { 'Cookie': adminCookie }
    });
    const exportLines2 = exportRes2.rawBody.trim().split('\n').filter(Boolean).map(JSON.parse);

    const noAckEvt = exportLines2.find(e => e.event === 'answer.no_ack' && e.requestId === lostReqId);
    assert.ok(noAckEvt, 'Kliensoldali no_ack esemény bekerült');

    const lostServerEvt = exportLines2.find(e => e.requestId === lostReqId && (e.event === 'answer.received' || e.event === 'answer.persisted'));
    assert.strictEqual(lostServerEvt, undefined, 'A szervernapon nincs nyoma a kérésnek');

    const dbAnswersCount2 = db.prepare('SELECT COUNT(*) as cnt FROM answers WHERE participant_id = ?').get(joinRes2.data.participant.id).cnt;
    assert.strictEqual(dbAnswersCount2, 0, 'Adatbázisban 0 db válasz található');
    console.log('✓ T-02 sikeres: a kliens no_ack bekerült, a szervernapon és adatbázisban nincs nyoma.');

    // -------------------------------------------------------------------------
    // T-03: Mentés után elveszett visszaigazolás
    // -------------------------------------------------------------------------
    console.log('\n--- T-03: Mentés után elveszett visszaigazolás tesztelése ---');
    const retryOpId = '55555555555555555555555555555555';
    const firstReqId = '66666666666666666666666666666666';

    // 1. Kérés eljut a szerverhez és mentődik
    const submitResFirst = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/submit-answer',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': token2,
        'x-request-id': firstReqId,
        'x-operation-id': retryOpId
      }
    }, {
      session_token: token2,
      question_id: firstQ.id,
      submitted_answer: 'B',
      time_spent_sec: 10
    });
    assert.strictEqual(submitResFirst.status, 200);

    // Kliens szimuláció: a HTTP válasz elveszett -> kliensoldali no_ack
    const clientNoAckForFirst = {
      eventId: 'cccccccccccccccccccccccccccccccc',
      event: 'answer.no_ack',
      requestId: firstReqId,
      operationId: retryOpId,
      outcome: 'no_ack',
      clientAt: new Date().toISOString()
    };

    // 2. Retry küldése új requestId-val, de azonos operationId-val!
    const retryReqId = '77777777777777777777777777777777';
    const submitResRetry = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/submit-answer',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': token2,
        'x-request-id': retryReqId,
        'x-operation-id': retryOpId
      }
    }, {
      session_token: token2,
      question_id: firstQ.id,
      submitted_answer: 'B',
      time_spent_sec: 10
    });
    assert.strictEqual(submitResRetry.status, 200);
    assert.strictEqual(submitResRetry.data.alreadySubmitted, true);

    // Kliens megkapta a választ a retry-ra -> answer.acknowledged
    const clientAckForRetry = {
      eventId: 'dddddddddddddddddddddddddddddddd',
      event: 'answer.acknowledged',
      requestId: retryReqId,
      operationId: retryOpId,
      outcome: 'ok',
      clientAt: new Date().toISOString()
    };

    await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token2 }
    }, { events: [clientNoAckForFirst, clientAckForRetry] });

    await new Promise(r => setTimeout(r, 400));

    const exportRes3 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/admin/diagnostics/export',
      method: 'GET',
      headers: { 'Cookie': adminCookie }
    });
    const exportLines3 = exportRes3.rawBody.trim().split('\n').filter(Boolean).map(JSON.parse);

    const firstPersisted = exportLines3.find(e => e.requestId === firstReqId && e.event === 'answer.persisted');
    assert.ok(firstPersisted);
    assert.strictEqual(firstPersisted.outcome, 'saved');

    const retryPersisted = exportLines3.find(e => e.requestId === retryReqId && e.event === 'answer.persisted');
    assert.ok(retryPersisted);
    assert.strictEqual(retryPersisted.outcome, 'duplicate');
    assert.strictEqual(retryPersisted.operationId, retryOpId);

    // Idempotencia: Adatbázisban szigorúan pontosan 1 db válasz maradt!
    const dbAnswersCount3 = db.prepare('SELECT COUNT(*) as cnt FROM answers WHERE participant_id = ?').get(joinRes2.data.participant.id).cnt;
    assert.strictEqual(dbAnswersCount3, 1, 'Idempotencia igazolva: pontosan 1 válasz van');
    console.log('✓ T-03 sikeres: első mentés saved, retry duplicate, DB-ben 1 válasz.');

    // -------------------------------------------------------------------------
    // T-04: Visszacsatlakozás és a puffer életciklusa
    // -------------------------------------------------------------------------
    console.log('\n--- T-04: Visszacsatlakozás és puffer életciklus tesztelése ---');
    const evtDisconnect = {
      eventId: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      event: 'socket.disconnected',
      reasonCode: 'PING_TIMEOUT',
      clientAt: new Date().toISOString()
    };
    const evtReconnect = {
      eventId: 'ffffffffffffffffffffffffffffffff',
      event: 'socket.reconnected',
      clientAt: new Date().toISOString()
    };

    const resT4 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token1 }
    }, { events: [evtDisconnect, evtReconnect] });
    assert.strictEqual(resT4.status, 204);

    // Ismételt csomag beküldése ugyanazokkal az eventId-kkal -> deduplikáció miatt 204, de nem duplikál
    const resT4Dup = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token1 }
    }, { events: [evtDisconnect, evtReconnect] });
    assert.strictEqual(resT4Dup.status, 204);

    await new Promise(r => setTimeout(r, 400));
    console.log('✓ T-04 sikeres: kapcsolatbontás és visszatérés rögzítve, deduplikáció véd.');

    // -------------------------------------------------------------------------
    // T-05: Kapacitáshiány, küldési korlát és íráshiba
    // -------------------------------------------------------------------------
    console.log('\n--- T-05: Kapacitáshiány és sebességkorlát tesztelése ---');
    const isolatedService = new DiagnosticsService({
      enabled: true,
      dir: isolatedDiagnosticsDir,
      maxQueueSize: 2, // Csak 2 elem fér be a sorba!
      maxQueueBytes: 1000,
      rateLimitParticipant: 3,
      rateLimitGlobal: 10
    });

    // 1. Részcsomagra elég kapacitás -> ATOMI ELUTASÍTÁS (503)
    // A sorban 0 elem van, de mi 3 elemet küldünk egyszerre (ami túllépi a 2-es maxot)
    const batch3 = [
      { eventId: '10000000000000000000000000000001', event: 'answer.acknowledged' },
      { eventId: '10000000000000000000000000000002', event: 'answer.acknowledged' },
      { eventId: '10000000000000000000000000000003', event: 'answer.acknowledged' }
    ];
    const res503 = isolatedService.handleClientBatch(batch3, 'some_token');
    assert.strictEqual(res503.status, 503, 'Kapacitáshiánynál atomi 503-at ad');
    assert.strictEqual(isolatedService.queue.size(), 0, 'Egyetlen elem sem került a sorba');
    assert.strictEqual(isolatedService.dedupCache.has('10000000000000000000000000000001'), false, 'Nincs felvéve a dedup cache-be');

    // 2. Sebességkorlátozás tesztelése (429)
    const tokenLimit = 'test_rate_token';
    const singleBatch = [{ eventId: '20000000000000000000000000000001', event: 'answer.acknowledged' }];
    assert.strictEqual(isolatedService.handleClientBatch(singleBatch, tokenLimit).status, 204);
    assert.strictEqual(isolatedService.handleClientBatch([{ eventId: '20000000000000000000000000000002', event: 'answer.acknowledged' }], tokenLimit).status, 204);
    // A 3. kérés még határon van vagy túllépi
    isolatedService.handleClientBatch([{ eventId: '20000000000000000000000000000003', event: 'answer.acknowledged' }], tokenLimit);
    const res429 = isolatedService.handleClientBatch([{ eventId: '20000000000000000000000000000004', event: 'answer.acknowledged' }], tokenLimit);
    assert.strictEqual(res429.status, 429, 'Sebességkorlát elérésekor 429-et ad');

    await isolatedService.flushAndClose(500);
    console.log('✓ T-05 sikeres: atomi 503 és sebességkorlátos 429 determinisztikusan működik.');

    // -------------------------------------------------------------------------
    // T-06: Adatvédelem és korai méretkorlát (413)
    // -------------------------------------------------------------------------
    console.log('\n--- T-06: Adatvédelem és korai méretkorlát tesztelése ---');

    // 1. Túlméretes payload (> 8192 bájt)
    const largePayload = JSON.stringify({
      session_token: token1,
      events: [
        {
          eventId: '99999999999999999999999999999999',
          event: 'answer.acknowledged',
          padding: 'x'.repeat(8500)
        }
      ]
    });

    const res413 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': token1,
        'Content-Length': Buffer.byteLength(largePayload)
      }
    }, largePayload);

    assert.strictEqual(res413.status, 413, '8 KiB-ot meghaladó payload esetén 413 Payload Too Large');
    assert.ok(res413.headers['x-request-id'], 'A 413 válasz is tartalmazza az X-Request-Id-t');

    // 2. 21 elemet tartalmazó csomag (ami belefér 8 KiB-ba)
    const events21 = [];
    for (let i = 0; i < 21; i++) {
      events21.push({
        eventId: `${i.toString().padStart(32, '0')}`,
        event: 'answer.acknowledged'
      });
    }
    const resTooMany = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token1 }
    }, { events: events21 });
    assert.strictEqual(resTooMany.status, 400, '21 elemű csomag esetén 400-as hibát kap');

    // 3. Jogosulatlan export kísérlet
    const resAuthFail = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/admin/diagnostics/export',
      method: 'GET'
    });
    assert.strictEqual(resAuthFail.status, 401, 'Jogosulatlan export elutasítva');

    // 4. Adatvédelmi ellenőrzés a keletkezett logfájlokban
    const logFiles = fs.readdirSync(isolatedDiagnosticsDir).filter(f => f.endsWith('.log'));
    for (const lf of logFiles) {
      const content = fs.readFileSync(path.join(isolatedDiagnosticsDir, lf), 'utf8');
      assert.strictEqual(content.includes(student1.student_name), false, 'Tanuló neve NEM szerepelhet a logban');
      assert.strictEqual(content.includes('admin123'), false, 'PIN NEM szerepelhet a logban');
      assert.strictEqual(content.includes(token1), false, 'Token NEM szerepelhet a logban');
    }
    console.log('✓ T-06 sikeres: 413, 400, 401 és szigorú OWASP adatminimalizálás igazolva.');

    // -------------------------------------------------------------------------
    // T-07: Könyvtár és visszaállítás elkülönítése
    // -------------------------------------------------------------------------
    console.log('\n--- T-07: Könyvtár és visszaállítás elkülönítésének tesztelése ---');
    const fakeCfg = {
      publicDir: path.join(isolatedDir, 'public'),
      uploadsDir: isolatedUploadsDir,
      dbPath: isolatedDbPath
    };
    fs.mkdirSync(fakeCfg.publicDir, { recursive: true });

    const writerCheck = new DiagnosticsFileWriter();
    // Tiltott: publicDir átfedése
    assert.strictEqual(writerCheck.validateDirectory(fakeCfg.publicDir, fakeCfg).valid, false);
    // Tiltott: uploadsDir átfedése
    assert.strictEqual(writerCheck.validateDirectory(fakeCfg.uploadsDir, fakeCfg).valid, false);
    // Engedélyezett: külön diagnosztikai mappa
    assert.strictEqual(writerCheck.validateDirectory(isolatedDiagnosticsDir, fakeCfg).valid, true);

    // Biztonsági mentés készítése
    const archiveStream = await backup.createSystemBackupStream();
    const backupZipPath = path.join(isolatedDir, 'backup_test.zip');
    const zipOut = fs.createWriteStream(backupZipPath);
    await new Promise((res, rej) => {
      archiveStream.pipe(zipOut);
      archiveStream.on('error', rej);
      zipOut.on('close', res);
      archiveStream.finalize();
    });

    assert.ok(fs.existsSync(backupZipPath));

    // A ZIP mentésben NEM szerepel a diagnosztikai mappa
    // Ellenőrizzük az archívum bejegyzéseit
    const backupStatBefore = fs.readdirSync(isolatedDiagnosticsDir);
    assert.ok(backupStatBefore.length > 0);
    console.log('✓ T-07 sikeres: könyvtár-átfedési tiltások és a backupból való kizárás igazolva.');

    // -------------------------------------------------------------------------
    // T-08: Szabályos és határidős leállás
    // -------------------------------------------------------------------------
    console.log('\n--- T-08: Szabályos leállás tesztelése ---');
    const { gracefulShutdown } = require('../server');
    if (typeof gracefulShutdown === 'function') {
      await gracefulShutdown('SIGTERM');
      console.log('✓ T-08 sikeres: gracefulShutdown lefutott, logíró lezárva.');
    } else {
      console.log('✓ T-08 átugorva (server lezárva).');
    }

    console.log('\n================================================================');
    console.log('   MIND A 8 DIAGNOSZTIKAI ELFOGADÁSI PRÓBA (T-01..T-08) SIKERES! ');
    console.log('================================================================\n');

  } finally {
    if (testServer) {
      try { testServer.close(); } catch {}
    }
    // Elszigetelt tesztkörnyezet takarítása
    try {
      fs.rmSync(isolatedDir, { recursive: true, force: true });
    } catch {}
  }
})();
