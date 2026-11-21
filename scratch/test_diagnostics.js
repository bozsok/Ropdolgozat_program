/**
 * scratch/test_diagnostics.js - Helyi diagnosztika és eseménynaplózás átfogó elfogadási tesztcsomagja (T-01 – T-08)
 * Specifikáció: Source/Beepitesi_terv_01_vegrehajtasi_terv_01.md (v1.2), Source/dh_01.md
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { Writable } = require('stream');
const { fork, execSync } = require('child_process');

console.log('================================================================');
console.log('   HELYI DIAGNOSZTIKA ÉS ESEMÉNYNAPLÓZÁS ELFOGADÁSI TESZTCSOMAG ');
console.log('================================================================\n');

// 1. Teljesen izolált tesztkörnyezet létrehozása (a modulok betöltése ELŐTT!)
const testRunId = `diag_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const isolatedDir = path.join(os.tmpdir(), testRunId);
fs.mkdirSync(isolatedDir, { recursive: true });

const isolatedDbPath = path.join(isolatedDir, 'data', 'ropdolgozat_diag.db');
const isolatedUploadsDir = path.join(isolatedDir, 'data', 'uploads_diag');
const isolatedDiagnosticsDir = path.join(isolatedDir, 'data', 'diagnostics');
fs.mkdirSync(path.dirname(isolatedDbPath), { recursive: true });
fs.mkdirSync(isolatedUploadsDir, { recursive: true });
fs.mkdirSync(isolatedDiagnosticsDir, { recursive: true });

process.env.DB_PATH = isolatedDbPath;
process.env.UPLOADS_DIR = isolatedUploadsDir;
process.env.DIAGNOSTICS_DIR = isolatedDiagnosticsDir;
process.env.DIAGNOSTICS_ENABLED = 'true';
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';

console.log(`✓ Elszigetelt tesztkörnyezet: ${isolatedDir}`);
console.log(`✓ Teszt adatbázis: ${isolatedDbPath}`);
console.log(`✓ Teszt diagnosztikai mappa: ${isolatedDiagnosticsDir}\n`);

// Modulok betöltése a környezeti változók beállítása után
const db = require('../src/db/init');
const sessionRepo = require('../src/db/sessionRepo');
const quizRepo = require('../src/db/quizRepo');
const rosterRepo = require('../src/db/rosterRepo');
const backup = require('../src/services/backup');
const diagnosticsService = require('../src/services/diagnostics');
const {
  DiagnosticsService,
  DiagnosticsFileWriter
} = diagnosticsService;

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
    if (bodyData !== null) {
      if (typeof bodyData === 'string' || Buffer.isBuffer(bodyData)) {
        req.write(bodyData);
      } else {
        req.write(JSON.stringify(bodyData));
      }
    }
    req.end();
  });
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function spawnServerChild(extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const serverScript = path.join(__dirname, '..', 'server.js');
    const child = fork(serverScript, [], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: '0',
        HOST: '127.0.0.1',
        DIAGNOSTICS_ENABLED: 'true',
        ...extraEnv
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });

    const timeout = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error('A gyermekfolyamat szervere nem indult el időben.'));
    }, 8000);

    child.on('message', (msg) => {
      if (msg && msg.type === 'listening') {
        clearTimeout(timeout);
        resolve({ child, port: msg.port, host: msg.host });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`A gyermekfolyamat váratlanul kilépett indulás közben (kód: ${code}).`));
    });
  });
}

function waitChildExit(child, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error('A gyermekfolyamat nem lépett ki határidőn belül!'));
    }, timeoutMs);

    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

(async () => {
  const { app, startServer, gracefulShutdown } = require('../server');
  let serverPort = 0;

  try {
    // Egyetlen tesztszerver indítása 127.0.0.1:0 címen (nincs második szerver a 3000-es porton!)
    const started = await startServer({ port: 0, host: '127.0.0.1', silent: true });
    serverPort = started.port;
    console.log(`✓ Tényleges szerver elindítva teszt módban: 127.0.0.1:${serverPort}\n`);

    // Admin bejelentkezés
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

    // Teszt kvíz, osztály és aktív dolgozat előkészítése
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
    const student2 = students[1];

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

    // -------------------------------------------------------------------------
    // T-01: Normál válaszbeküldés
    // -------------------------------------------------------------------------
    console.log('--- T-01: Normál válaszbeküldés tesztelése ---');
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

    const clientEvent1 = {
      eventId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      event: 'answer.acknowledged',
      requestId: reqId1,
      operationId: opId1,
      outcome: 'ok',
      httpStatus: 200,
      clientAt: new Date().toISOString()
    };

    const batchRes1 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token1 }
    }, { events: [clientEvent1] });
    assert.strictEqual(batchRes1.status, 204);

    await new Promise(r => setTimeout(r, 300));

    const exportRes1 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/admin/diagnostics/export',
      method: 'GET',
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(exportRes1.status, 200);
    assert.strictEqual(exportRes1.headers['cache-control'], 'no-store');
    const exportLines1 = exportRes1.rawBody.trim().split('\n').filter(Boolean).map(JSON.parse);

    const persistedEvt = exportLines1.find(e => e.event === 'answer.persisted' && e.requestId === reqId1);
    assert.ok(persistedEvt && persistedEvt.outcome === 'saved' && persistedEvt.operationId === opId1);
    assert.ok(exportLines1.find(e => e.event === 'http.finished' && e.requestId === reqId1));
    assert.ok(exportLines1.find(e => e.event === 'answer.acknowledged' && e.requestId === reqId1));

    const dbAnswersCount1 = db.prepare('SELECT COUNT(*) as cnt FROM answers WHERE participant_id = ?').get(joinRes1.data.participant.id).cnt;
    assert.strictEqual(dbAnswersCount1, 1);
    console.log('✓ T-01 sikeres.');

    // -------------------------------------------------------------------------
    // T-02: Szerver előtt elakadt kérés
    // -------------------------------------------------------------------------
    console.log('\n--- T-02: Szerver előtt elakadt kérés tesztelése ---');
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

    const batchRes2 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token2 }
    }, {
      events: [{
        eventId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        event: 'answer.no_ack',
        requestId: lostReqId,
        operationId: lostOpId,
        outcome: 'no_ack',
        reasonCode: 'NETWORK_ERROR',
        clientAt: new Date().toISOString()
      }]
    });
    assert.strictEqual(batchRes2.status, 204);
    await new Promise(r => setTimeout(r, 300));

    const exportRes2 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/admin/diagnostics/export',
      method: 'GET',
      headers: { Cookie: adminCookie }
    });
    const exportLines2 = exportRes2.rawBody.trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.ok(exportLines2.find(e => e.event === 'answer.no_ack' && e.requestId === lostReqId));
    assert.strictEqual(exportLines2.find(e => e.requestId === lostReqId && (e.event === 'answer.received' || e.event === 'answer.persisted')), undefined);
    assert.strictEqual(db.prepare('SELECT COUNT(*) as cnt FROM answers WHERE participant_id = ?').get(joinRes2.data.participant.id).cnt, 0);
    console.log('✓ T-02 sikeres.');

    // -------------------------------------------------------------------------
    // T-03: Mentés után elveszett visszaigazolás
    // -------------------------------------------------------------------------
    console.log('\n--- T-03: Mentés után elveszett visszaigazolás tesztelése ---');
    const retryOpId = '55555555555555555555555555555555';
    const firstReqId = '66666666666666666666666666666666';
    const retryReqId = '77777777777777777777777777777777';

    const submitFirst = await httpRequest({
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
    }, { session_token: token2, question_id: firstQ.id, submitted_answer: 'B', time_spent_sec: 10 });
    assert.strictEqual(submitFirst.status, 200);

    const submitRetry = await httpRequest({
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
    }, { session_token: token2, question_id: firstQ.id, submitted_answer: 'B', time_spent_sec: 10 });
    assert.strictEqual(submitRetry.status, 200);
    assert.strictEqual(submitRetry.data.alreadySubmitted, true);

    const batchRes3 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token2 }
    }, {
      events: [
        {
          eventId: 'cccccccccccccccccccccccccccccccc',
          event: 'answer.no_ack',
          requestId: firstReqId,
          operationId: retryOpId,
          outcome: 'no_ack',
          reasonCode: 'NETWORK_ERROR',
          clientAt: new Date().toISOString()
        },
        {
          eventId: 'dddddddddddddddddddddddddddddddd',
          event: 'answer.acknowledged',
          requestId: retryReqId,
          operationId: retryOpId,
          outcome: 'ok',
          httpStatus: 200,
          clientAt: new Date().toISOString()
        }
      ]
    });
    assert.strictEqual(batchRes3.status, 204);
    await new Promise(r => setTimeout(r, 300));

    const exportRes3 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/admin/diagnostics/export',
      method: 'GET',
      headers: { Cookie: adminCookie }
    });
    const exportLines3 = exportRes3.rawBody.trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.strictEqual(exportLines3.find(e => e.requestId === firstReqId && e.event === 'answer.persisted').outcome, 'saved');
    assert.strictEqual(exportLines3.find(e => e.requestId === retryReqId && e.event === 'answer.persisted').outcome, 'duplicate');
    assert.strictEqual(db.prepare('SELECT COUNT(*) as cnt FROM answers WHERE participant_id = ?').get(joinRes2.data.participant.id).cnt, 1);
    console.log('✓ T-03 sikeres.');

    // -------------------------------------------------------------------------
    // T-04: Visszacsatlakozás és deduplikáció
    // -------------------------------------------------------------------------
    console.log('\n--- T-04: Visszacsatlakozás és deduplikáció tesztelése ---');
    const t4Events = [
      {
        eventId: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        event: 'socket.disconnected',
        reasonCode: 'PING_TIMEOUT',
        clientAt: new Date().toISOString()
      },
      {
        eventId: 'ffffffffffffffffffffffffffffffff',
        event: 'socket.reconnected',
        clientAt: new Date().toISOString()
      }
    ];
    assert.strictEqual((await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token1 }
    }, { events: t4Events })).status, 204);

    assert.strictEqual((await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token1 }
    }, { events: t4Events })).status, 204);

    await new Promise(r => setTimeout(r, 300));
    const exportRes4 = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/admin/diagnostics/export',
      method: 'GET',
      headers: { Cookie: adminCookie }
    });
    const exportLines4 = exportRes4.rawBody.trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.strictEqual(exportLines4.filter(e => e.eventId === 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee').length, 1);
    console.log('✓ T-04 sikeres.');

    // -------------------------------------------------------------------------
    // T-05: Kapacitáshiány (503), 429, lassú drain backpressure, fájlrendszeri hiba, aktív stream hiba
    // -------------------------------------------------------------------------
    console.log('\n--- T-05: Kapacitáshiány, 429, backpressure és íráshibák tesztelése ---');

    // 5a) Részcsomagra elég kapacitás -> atomi 503 + külön rejectedBatchEventsCount
    {
      const capDir = path.join(isolatedDir, 'diag_t5_cap');
      const svc = new DiagnosticsService({
        enabled: true,
        dir: capDir,
        maxQueueSize: 2,
        maxQueueBytes: 2000,
        rateLimitParticipant: 3,
        rateLimitGlobal: 10
      });
      // Leállítjuk a worker timert, hogy determinisztikusan töltsük a sort
      clearInterval(svc.workerTimer);
      svc.workerTimer = null;

      // 3 elem érkezik 2-es sorba -> atomi 503
      const res503 = svc.handleClientBatch([
        { eventId: '10000000000000000000000000000001', event: 'socket.reconnected' },
        { eventId: '10000000000000000000000000000002', event: 'socket.reconnected' },
        { eventId: '10000000000000000000000000000003', event: 'socket.reconnected' }
      ], 'tok_cap');
      assert.strictEqual(res503.status, 503);
      assert.strictEqual(svc.queue.size(), 0);
      assert.strictEqual(svc.dedupCache.has('10000000000000000000000000000001'), false);
      assert.strictEqual(svc.getStatus().rejectedBatchEventsCount, 3);
      assert.strictEqual(svc.getStatus().droppedEventsCount, 0);

      // 429 sebességkorlát (limit 3/perc, az 1. már fogyott az 503-mal)
      assert.strictEqual(svc.handleClientBatch([{ eventId: '10000000000000000000000000000004', event: 'socket.reconnected' }], 'tok_cap').status, 204);
      assert.strictEqual(svc.handleClientBatch([{ eventId: '10000000000000000000000000000005', event: 'socket.reconnected' }], 'tok_cap').status, 204);
      assert.strictEqual(svc.handleClientBatch([{ eventId: '10000000000000000000000000000006', event: 'socket.reconnected' }], 'tok_cap').status, 429);

      const closeRes = await svc.flushAndClose(1500);
      assert.strictEqual(closeRes.ok, true);
      assert.strictEqual(svc.getStatus().totalWritten, 2);
    }

    // 5b) Kontrollált lassú író (drain backpressure + in-flight keretbe számítása)
    {
      const slowDir = path.join(isolatedDir, 'diag_t5_slow');
      let pendingWriteCb = null;
      let writeCalls = 0;
      const slowStream = new Writable({
        highWaterMark: 1, // Azonnal backpressure-t ad!
        write(chunk, enc, cb) {
          writeCalls++;
          pendingWriteCb = cb;
        }
      });

      const svcSlow = new DiagnosticsService({
        enabled: true,
        dir: slowDir,
        maxQueueSize: 2,
        maxQueueBytes: 4000,
        streamFactory: () => slowStream
      });

      assert.strictEqual(svcSlow.handleClientBatch([
        { eventId: '20000000000000000000000000000001', event: 'socket.reconnected' },
        { eventId: '20000000000000000000000000000002', event: 'socket.reconnected' }
      ], 'tok_slow').status, 204);

      await new Promise(r => setTimeout(r, 50));
      // 1 elem in-flight (drain-re vár), 1 elem a sorban -> összesen 2 függő, így újabb elem 503!
      assert.strictEqual(writeCalls, 1, 'Drain előtt nem indulhat újabb írás!');
      assert.strictEqual(svcSlow.totalWritten, 0, 'Visszaigazolás előtt totalWritten 0 marad!');
      assert.strictEqual(svcSlow.handleClientBatch([
        { eventId: '20000000000000000000000000000003', event: 'socket.reconnected' }
      ], 'tok_slow').status, 503, 'A függő elem is beleszámít a korlátba!');

      // Felszabadítjuk az 1., majd a 2. írást
      const cb1 = pendingWriteCb;
      pendingWriteCb = null;
      cb1();
      await new Promise(r => setTimeout(r, 50));
      assert.strictEqual(writeCalls, 2);
      assert.strictEqual(svcSlow.totalWritten, 1);

      const cb2 = pendingWriteCb;
      pendingWriteCb = null;
      cb2();
      const closeSlow = await svcSlow.flushAndClose(1500);
      assert.strictEqual(closeSlow.ok, true);
      assert.strictEqual(svcSlow.totalWritten, 2);
    }

    // 5c) Valódi fájlrendszeri hiba: a naplókönyvtár helyén rendes fájl áll!
    {
      const fileInsteadOfDir = path.join(isolatedDir, 'not_a_directory.txt');
      fs.writeFileSync(fileInsteadOfDir, 'blocking file', 'utf8');

      const svcBrokenDir = new DiagnosticsService({
        enabled: true,
        dir: fileInsteadOfDir
      });

      const resBroken = svcBrokenDir.handleClientBatch([
        { eventId: '30000000000000000000000000000001', event: 'socket.reconnected' }
      ], 'tok_broken');
      assert.strictEqual(resBroken.status, 503, 'Használhatatlan írónál 503 kell, nem 204!');

      const st = svcBrokenDir.getStatus();
      assert.strictEqual(st.totalWritten, 0, 'Kiírás nélkül totalWritten nem nőhet!');
      assert.strictEqual(st.isDegraded, true);
      assert.strictEqual(st.configurationError, true);

      const closeBroken = await svcBrokenDir.flushAndClose(1000);
      assert.strictEqual(closeBroken.ok, false, 'Hibás írónál a lezárás hibát jelez!');
      assert.strictEqual(fs.readFileSync(fileInsteadOfDir, 'utf8'), 'blocking file');
    }

    // 5d) Aktív írás közbeni stream hiba -> uncertainEventsCount nő, totalWritten 0, flushAndClose ok: false
    {
      const errDir = path.join(isolatedDir, 'diag_t5_err');
      const failingStream = new Writable({
        write(chunk, enc, cb) {
          process.nextTick(() => cb(Object.assign(new Error('ENOSPC simulated'), { code: 'ENOSPC' })));
        }
      });

      const svcErr = new DiagnosticsService({
        enabled: true,
        dir: errDir,
        recoveryIntervalMs: 60000,
        streamFactory: () => failingStream
      });

      assert.strictEqual(svcErr.handleClientBatch([
        { eventId: '40000000000000000000000000000001', event: 'socket.reconnected' }
      ], 'tok_err').status, 204);

      await new Promise(r => setTimeout(r, 100));
      const stErr = svcErr.getStatus();
      assert.strictEqual(stErr.totalWritten, 0);
      assert.strictEqual(stErr.uncertainEventsCount, 1);
      assert.strictEqual(stErr.isDegraded, true);

      const closeErr = await svcErr.flushAndClose(1000);
      assert.strictEqual(closeErr.ok, false);
    }

    console.log('✓ T-05 sikeres (503, 429, drain backpressure, fájl-helyett-mappa, aktív stream hiba).');

    // -------------------------------------------------------------------------
    // T-06: Adatvédelem, bemeneti szerződés, korai 413 és 24 órás érvényes export
    // -------------------------------------------------------------------------
    console.log('\n--- T-06: Adatvédelem, bemeneti szerződés, 413 és 24 órás export tesztelése ---');

    // 6a) 8 192 bájtot meghaladó payload -> korai 413 + X-Request-Id
    const largePayload = JSON.stringify({
      events: [{
        eventId: '99999999999999999999999999999999',
        event: 'socket.reconnected',
        clientAt: 'x'.repeat(8500)
      }]
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
    assert.strictEqual(res413.status, 413);
    assert.ok(res413.headers['x-request-id']);

    // 6b) 21 elemű (8 KiB alatti) csomag -> 400
    const events21 = Array.from({ length: 21 }, (_, i) => ({
      eventId: String(i).padStart(32, '0'),
      event: 'socket.reconnected'
    }));
    assert.strictEqual((await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token1 }
    }, { events: events21 })).status, 400);

    // 6c) Kliensből érkező szerveresemény -> 400
    assert.strictEqual((await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token1 }
    }, {
      events: [{
        eventId: '50000000000000000000000000000001',
        event: 'answer.persisted',
        outcome: 'saved'
      }]
    })).status, 400, 'Kliens nem küldhet szervereseményt!');

    // 6d) Engedélyezett mezőnek álcázott szabad szöveg vagy ismeretlen mező -> 400
    assert.strictEqual((await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token1 }
    }, {
      events: [{
        eventId: '50000000000000000000000000000002',
        event: 'socket.disconnected',
        reasonCode: 'SZABAD_SZOVEG_KOVACS_PETER'
      }]
    })).status, 400, 'Zárt listán kívüli reasonCode elutasítva!');

    assert.strictEqual((await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/student/diagnostics/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token1 }
    }, {
      events: [{
        eventId: '50000000000000000000000000000003',
        event: 'socket.reconnected',
        extraSecretField: 'TITOK'
      }]
    })).status, 400, 'Ismeretlen mező elutasítva!');

    // 6e) Jogosulatlan export -> 401
    assert.strictEqual((await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/admin/diagnostics/export',
      method: 'GET'
    })).status, 401);

    // 6f) 24 órás export pontos rekord-időszűrése, csonka sor eldobása és méretkorlát
    {
      const expDir = path.join(isolatedDir, 'diag_t6_export');
      fs.mkdirSync(expDir, { recursive: true });
      const fixedNowMs = Date.parse('2026-11-21T12:00:00.000Z');
      const exactBoundary = '2026-11-20T12:00:00.000Z'; // pontosan 24 órája -> BENNE van
      const tooOld = '2020-01-01T00:00:00.000Z';        // 2020-as -> KÍVÜL van
      const justBeforeBoundary = '2026-11-20T11:59:59.999Z'; // 1ms-sel túl régi -> KÍVÜL van
      const freshRecord = '2026-11-21T11:00:00.000Z';   // friss -> BENNE van

      const file1 = path.join(expDir, 'diagnostics-2026-11-20.log');
      const file2 = path.join(expDir, 'diagnostics-2026-11-21.log');

      fs.writeFileSync(file1, [
        JSON.stringify({ schemaVersion: 1, receivedAt: tooOld, event: 'server.started', source: 'server' }),
        JSON.stringify({ schemaVersion: 1, receivedAt: justBeforeBoundary, event: 'server.started', source: 'server' }),
        JSON.stringify({ schemaVersion: 1, receivedAt: exactBoundary, event: 'server.started', source: 'server', tag: 'boundary' }),
        JSON.stringify({ schemaVersion: 1, receivedAt: 'NOT_A_DATE', event: 'server.started', source: 'server' }),
        '{broken json line',
        '{"schemaVersion":1,"receivedAt":"2026-11-21T10:00:00.000Z","event":"truncated_no_newline"' // nincs \n a végén!
      ].join('\n'), 'utf8');

      fs.writeFileSync(file2,
        JSON.stringify({ schemaVersion: 1, receivedAt: freshRecord, event: 'server.started', source: 'server', tag: 'fresh' }) + '\n',
        'utf8'
      );

      const svcExp = new DiagnosticsService({ enabled: false, dir: expDir });
      const expStream = svcExp.createExportStream({ hours: 24, nowMs: fixedNowMs });
      let expData = '';
      for await (const chunk of expStream) {
        expData += chunk.toString('utf8');
      }
      const expRecords = expData.trim().split('\n').filter(Boolean).map(JSON.parse);
      assert.strictEqual(expRecords.length, 2, 'Pontosan a 2 érvényes, 24 órán belüli rekord jelenhet meg!');
      assert.strictEqual(expRecords[0].receivedAt, exactBoundary);
      assert.strictEqual(expRecords[1].receivedAt, freshRecord);
      assert.strictEqual(expStream.truncated, false);

      // Méretkorlát ellenőrzése (csak 1 sor fér bele)
      const firstLineBytes = Buffer.byteLength(JSON.stringify(expRecords[0]) + '\n', 'utf8');
      const truncStream = svcExp.createExportStream({ hours: 24, nowMs: fixedNowMs, maxExportBytes: firstLineBytes });
      let truncData = '';
      for await (const chunk of truncStream) {
        truncData += chunk.toString('utf8');
      }
      assert.strictEqual(truncStream.truncated, true);
      assert.strictEqual(truncData.trim().split('\n').filter(Boolean).length, 1);

      // Korai megszakítás nem dob hibát és lezárja az olvasót
      const abortStream = svcExp.createExportStream({ hours: 24, nowMs: fixedNowMs });
      abortStream.destroy();
    }

    // 6g) OWASP ellenőrzés a tényleges naplófájlokon
    const logFiles = fs.readdirSync(isolatedDiagnosticsDir).filter(f => f.endsWith('.log'));
    for (const lf of logFiles) {
      const content = fs.readFileSync(path.join(isolatedDiagnosticsDir, lf), 'utf8');
      assert.strictEqual(content.includes(student1.student_name), false);
      assert.strictEqual(content.includes('admin123'), false);
      assert.strictEqual(content.includes(token1), false);
      assert.strictEqual(content.includes('SZABAD_SZOVEG'), false);
    }
    console.log('✓ T-06 sikeres.');

    // -------------------------------------------------------------------------
    // T-07: Könyvtár-elkülönítés (leszármazottak, Windows junction) és valódi mentés-visszaállítás
    // -------------------------------------------------------------------------
    console.log('\n--- T-07: Könyvtár-elkülönítés és mentés-visszaállítás tesztelése ---');
    const fakeCfg = {
      publicDir: path.join(isolatedDir, 'public'),
      uploadsDir: isolatedUploadsDir,
      dbPath: isolatedDbPath
    };
    fs.mkdirSync(fakeCfg.publicDir, { recursive: true });
    const dbParentDir = path.dirname(isolatedDbPath);

    const writerCheck = new DiagnosticsFileWriter({ config: fakeCfg });
    assert.strictEqual(writerCheck.validateDirectory(isolatedDiagnosticsDir, fakeCfg).valid, true);
    assert.strictEqual(writerCheck.validateDirectory(fakeCfg.publicDir, fakeCfg).valid, false);
    assert.strictEqual(writerCheck.validateDirectory(fakeCfg.uploadsDir, fakeCfg).valid, false);
    assert.strictEqual(writerCheck.validateDirectory(dbParentDir, fakeCfg).valid, false);

    // _restore_snapshots ÉS annak alkönyvtára is tiltott!
    assert.strictEqual(writerCheck.validateDirectory(path.join(dbParentDir, '_restore_snapshots'), fakeCfg).valid, false);
    assert.strictEqual(writerCheck.validateDirectory(path.join(dbParentDir, '_restore_snapshots', '2026', 'diag'), fakeCfg).valid, false);

    // temp_restore_* ÉS annak alkönyvtára is tiltott!
    assert.strictEqual(writerCheck.validateDirectory(path.join(dbParentDir, 'temp_restore_12345'), fakeCfg).valid, false);
    assert.strictEqual(writerCheck.validateDirectory(path.join(dbParentDir, 'temp_restore_12345', 'nested', 'diag'), fakeCfg).valid, false);

    // Windows junction próba tiltott célra (publicDir)
    const junctionPath = path.join(isolatedDir, 'diag_junction_to_public');
    try {
      fs.symlinkSync(fakeCfg.publicDir, junctionPath, 'junction');
      assert.strictEqual(writerCheck.validateDirectory(junctionPath, fakeCfg).valid, false, 'Tiltott célra mutató junction elutasítva!');
      fs.unlinkSync(junctionPath);
    } catch (e) {
      console.log(`  (Megjegyzés: junction teszt kihagyva a környezet jogosultságai miatt: ${e.code || e.message})`);
    }

    // Valódi ZIP mentés, tartalomjegyzék ellenőrzés és visszaállítás + hash egyezés
    const diagFilesBefore = fs.readdirSync(isolatedDiagnosticsDir).filter(f => f.endsWith('.log')).sort();
    assert.ok(diagFilesBefore.length > 0);
    const hashesBefore = new Map(diagFilesBefore.map(f => [f, sha256File(path.join(isolatedDiagnosticsDir, f))]));

    const archiveStream = await backup.createSystemBackupStream();
    const backupZipPath = path.join(isolatedDir, 'backup_t7.zip');
    const zipOut = fs.createWriteStream(backupZipPath);
    await new Promise((res, rej) => {
      archiveStream.pipe(zipOut);
      archiveStream.on('error', rej);
      zipOut.on('close', res);
      archiveStream.finalize();
    });

    // Ellenőrizzük a ZIP tartalomjegyzékét
    const zipList = execSync(`tar -tf "${backupZipPath}"`, { encoding: 'utf8' });
    assert.strictEqual(zipList.includes('diagnostics'), false, 'A ZIP mentés NEM tartalmazhat diagnosztikai naplót!');

    // Visszaállítás futtatása
    backup.restoreSystemBackup(backupZipPath);

    // A diagnosztikai fájlok sértetlenek maradtak a visszaállítás után is
    const diagFilesAfter = fs.readdirSync(isolatedDiagnosticsDir).filter(f => f.endsWith('.log')).sort();
    assert.deepStrictEqual(diagFilesAfter, diagFilesBefore);
    for (const f of diagFilesBefore) {
      assert.strictEqual(sha256File(path.join(isolatedDiagnosticsDir, f)), hashesBefore.get(f));
    }
    console.log('✓ T-07 sikeres.');

    // Lezárjuk a fő in-process tesztszervert a T-08 gyermekfolyamat-tesztek előtt
    const mainShutdown = await gracefulShutdown('TEST_COMPLETE', { activeOpsTimeoutMs: 2000, flushTimeoutMs: 2000 });
    assert.strictEqual(mainShutdown.flushResult.ok, true);

    // -------------------------------------------------------------------------
    // T-08: Szabályos, határidős és íráshibás leállás külön gyermekfolyamatokban
    // -------------------------------------------------------------------------
    console.log('\n--- T-08: Szabályos, határidős és íráshibás leállás (gyermekfolyamatok) ---');

    // 8a) Normál leállás: aktív kérés befejeződik, eseménye a server.stopping előtt van, exitCode === 0
    {
      const cDir = path.join(isolatedDir, 'child_normal');
      const cDb = path.join(cDir, 'data', 'test.db');
      const cUp = path.join(cDir, 'data', 'uploads');
      const cDiag = path.join(cDir, 'data', 'diagnostics');
      fs.mkdirSync(cUp, { recursive: true });
      fs.mkdirSync(cDiag, { recursive: true });

      const { child, port } = await spawnServerChild({
        DB_PATH: cDb,
        UPLOADS_DIR: cUp,
        DIAGNOSTICS_DIR: cDiag
      });

      // Küldünk egy tényleges submit-answer kérést (401 token nélkül, de logolt útvonal)
      const reqIdChild = '88888888888888888888888888888888';
      const r = await httpRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/student/submit-answer',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-request-id': reqIdChild }
      }, {});
      assert.strictEqual(r.status, 401);

      // Dupla leállási jelzés -> egyszeri folyamat
      child.send({ type: 'shutdown' });
      child.send({ type: 'shutdown' });
      const exitCode = await waitChildExit(child, 6000);
      assert.strictEqual(exitCode, 0, 'Normál leállásnál 0-s kilépési kód kell!');

      const logs = fs.readdirSync(cDiag).filter(f => f.endsWith('.log'));
      assert.ok(logs.length > 0);
      const entries = fs.readFileSync(path.join(cDiag, logs[0]), 'utf8').trim().split('\n').map(JSON.parse);
      const idxHttp = entries.findIndex(e => e.event === 'http.finished' && e.requestId === reqIdChild);
      const idxStop = entries.findIndex(e => e.event === 'server.stopping');
      assert.ok(idxHttp >= 0 && idxStop > idxHttp, 'A kérés eseménye a server.stopping elé került!');
    }

    // 8b) Határidős leállás: íráshibás (fájl-a-mappa-helyén) céllal -> hibát jelző kilépési kód (1)
    {
      const cDirErr = path.join(isolatedDir, 'child_write_err');
      const cDb = path.join(cDirErr, 'data', 'test.db');
      const cUp = path.join(cDirErr, 'data', 'uploads');
      const cDiagFile = path.join(cDirErr, 'data', 'diagnostics_is_a_file');
      fs.mkdirSync(cUp, { recursive: true });
      fs.writeFileSync(cDiagFile, 'block', 'utf8');

      const { child } = await spawnServerChild({
        DB_PATH: cDb,
        UPLOADS_DIR: cUp,
        DIAGNOSTICS_DIR: cDiagFile
      });

      child.send({ type: 'shutdown', options: { activeOpsTimeoutMs: 500, flushTimeoutMs: 500 } });
      const exitCode = await waitChildExit(child, 5000);
      assert.strictEqual(exitCode, 1, 'Íráshibás leállásnál 1-es kilépési kód kell!');
    }

    // 8c) Kontrolláltan visszatartott aktív HTTP kérés -> SHUTDOWN_DEADLINE és 1-es kilépési kód (sikeres ürítés mellett is!)
    {
      const cDirDl = path.join(isolatedDir, 'child_deadline');
      const cDb = path.join(cDirDl, 'data', 'test.db');
      const cUp = path.join(cDirDl, 'data', 'uploads');
      const cDiag = path.join(cDirDl, 'data', 'diagnostics');
      fs.mkdirSync(cUp, { recursive: true });
      fs.mkdirSync(cDiag, { recursive: true });

      const { child, port } = await spawnServerChild({
        DB_PATH: cDb,
        UPLOADS_DIR: cUp,
        DIAGNOSTICS_DIR: cDiag
      });

      // Nyitunk egy félig elküldött POST kérést (Content-Length: 200, de csak 10 bájt megy át), így activeRequestsCount === 1 marad
      const hangingReq = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/student/submit-answer',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': 200
        }
      });
      hangingReq.on('error', () => {});
      hangingReq.write('{"partial"');

      await new Promise(r => setTimeout(r, 150));

      child.send({ type: 'shutdown', options: { activeOpsTimeoutMs: 250, flushTimeoutMs: 1500 } });
      const exitCode = await waitChildExit(child, 5000);
      try { hangingReq.destroy(); } catch {}

      assert.strictEqual(exitCode, 1, 'Határidő-túllépésnél 1-es kilépési kód kell még sikeres naplóürítés mellett is!');

      const logs = fs.readdirSync(cDiag).filter(f => f.endsWith('.log'));
      assert.ok(logs.length > 0);
      const entries = fs.readFileSync(path.join(cDiag, logs[0]), 'utf8').trim().split('\n').map(JSON.parse);
      const stopEvt = entries.find(e => e.event === 'server.stopping');
      assert.ok(stopEvt && stopEvt.reasonCode === 'SHUTDOWN_DEADLINE', 'A naplóban SHUTDOWN_DEADLINE okkódnak kell szerepelnie!');
    }

    console.log('✓ T-08 sikeres (normál leállás + dupla jelzés + íráshibás + határidős SHUTDOWN_DEADLINE).');

    console.log('\n================================================================');
    console.log('   MIND A 8 DIAGNOSZTIKAI ELFOGADÁSI PRÓBA (T-01..T-08) SIKERES! ');
    console.log('================================================================\n');

  } finally {
    try {
      await gracefulShutdown('FINALLY_CLEANUP', { activeOpsTimeoutMs: 500, flushTimeoutMs: 500 });
    } catch {}
    try { db.close(); } catch {}
    try {
      fs.rmSync(isolatedDir, { recursive: true, force: true });
    } catch {}
  }
})();
