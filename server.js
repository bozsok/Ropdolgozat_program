const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const config = require('./config');
const apiRoutes = require('./src/routes/api');
const viewRoutes = require('./src/routes/views');
const initLiveHandler = require('./src/sockets/liveHandler');
const diagnosticsService = require('./src/services/diagnostics');

// Express alkalmazás és HTTP szerver
const app = express();
const server = http.createServer(app);

// Leállási állapot, aktív kapcsolatok és aktív műveletek követése (DH 01 / 6. fejezet)
let isShuttingDown = false;
let shutdownPromise = null;
let activeRequestsCount = 0;
let activeOperationsCount = 0;
const activeSockets = new Set();
const activeWaiters = new Set();

function notifyActiveChanged() {
  if (activeRequestsCount <= 0 && activeOperationsCount <= 0) {
    for (const fn of Array.from(activeWaiters)) {
      fn();
    }
  }
}

server.on('connection', (socket) => {
  activeSockets.add(socket);
  socket.once('close', () => {
    activeSockets.delete(socket);
  });
});

// Socket.io inicializálása
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// io példány és aktív háttérművelet-követés elérhetővé tétele a routerekben
app.set('io', io);
app.set('trackAsyncOperation', (promise) => {
  activeOperationsCount++;
  return Promise.resolve(promise).finally(() => {
    activeOperationsCount = Math.max(0, activeOperationsCount - 1);
    notifyActiveChanged();
  });
});

// Socket.io órai eseménykezelő regisztrálása
initLiveHandler(io);

// 1. Kérésazonosító (X-Request-Id) és futásidőmérés middleware (minden kérés legelső lépéseként)
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    return res.status(503).json({ success: false, message: 'A kiszolgáló leállás alatt van!' });
  }

  activeRequestsCount++;

  const reqIdHeader = req.headers['x-request-id'];
  const validReqId = (typeof reqIdHeader === 'string' && /^[a-f0-9]{32}$/i.test(reqIdHeader))
    ? reqIdHeader.toLowerCase()
    : crypto.randomBytes(16).toString('hex');

  req.requestId = validReqId;
  res.setHeader('X-Request-Id', validReqId);
  const startTimeHr = process.hrtime.bigint();
  req.startTimeHr = startTimeHr;

  let requestEnded = false;
  const cleanupListeners = () => {
    res.removeListener('finish', onRequestFinished);
    res.removeListener('close', onRequestClosedEarly);
  };

  const onRequestFinished = () => {
    if (requestEnded) return;
    requestEnded = true;
    cleanupListeners();

    if (req.routeLogged) {
      const durationMs = Number((process.hrtime.bigint() - startTimeHr) / 1000000n);
      diagnosticsService.logEvent({
        source: 'server',
        event: 'http.finished',
        requestId: validReqId,
        route: req.routeLogged,
        httpStatus: res.statusCode,
        durationMs
      });
    }

    activeRequestsCount = Math.max(0, activeRequestsCount - 1);
    notifyActiveChanged();
  };

  const onRequestClosedEarly = () => {
    if (requestEnded) return;
    requestEnded = true;
    cleanupListeners();

    if (req.routeLogged) {
      const durationMs = Number((process.hrtime.bigint() - startTimeHr) / 1000000n);
      diagnosticsService.logEvent({
        source: 'server',
        event: 'http.closed_early',
        requestId: validReqId,
        route: req.routeLogged,
        httpStatus: res.headersSent ? res.statusCode : undefined,
        durationMs
      });
    }

    activeRequestsCount = Math.max(0, activeRequestsCount - 1);
    notifyActiveChanged();
  };

  res.once('finish', onRequestFinished);
  res.once('close', onRequestClosedEarly);

  next();
});

// 2. KORAI DIAGNOSZTIKAI BODY PARSER (Pontosítási terv 1. pont: szigorú 8 KiB korlát a globális parserek előtt)
app.post(
  '/api/student/diagnostics/events',
  express.json({ limit: '8192b' }),
  (req, res) => {
    const sessionRepo = require('./src/db/sessionRepo');
    const token = req.headers['x-session-token'] || (req.body && req.body.session_token);
    if (!token) {
      return res.status(401).json({ error: 'Munkamenet token hiányzik!' });
    }
    const participant = sessionRepo.getParticipantByToken(token);
    if (!participant) {
      return res.status(401).json({ error: 'Érvénytelen munkamenet!' });
    }

    const rawEvents = req.body && req.body.events ? req.body.events : req.body;
    const result = diagnosticsService.handleClientBatch(rawEvents, token);

    if (result.status === 204) {
      return res.status(204).end();
    }
    return res.status(result.status).json({ code: result.code });
  }
);

// Diagnosztikai JSON body túlméret (413) és szintaktikai hiba (400) célzott elkapása
app.use('/api/student/diagnostics/events', (err, req, res, next) => {
  if (err.status === 413 || err.type === 'entity.too.large') {
    return res.status(413).json({ code: 'CLIENT_PAYLOAD_TOO_LARGE' });
  }
  if (err.status === 400 || err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'INVALID_JSON' });
  }
  next(err);
});

// 3. Globális middleware-ek a normál útvonalakhoz
app.use(cookieParser(config.cookieSecret));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Közvetlen print-report.html elérés átirányítása a védett /print végpontra (Report 14 / 13. pont)
app.get('/print-report.html', (req, res) => {
  const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  res.redirect('/print' + queryStr);
});

// Statikus fájlok kiszolgálása (Offline frontend és feltöltött képek, LAN cache beállításokkal)
app.use(express.static(config.publicDir, {
  setHeaders: (res, filePath) => {
    if (filePath.includes('fonts') || filePath.includes('img') || filePath.endsWith('.ico') || filePath.endsWith('.png')) {
      // Kizárólag a betűkészletek és statikus arculati képek kapnak hosszú távú gyorsítótárazást (30 nap)
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    } else {
      // HTML, JS és CSS fájlok mindig azonnal frissüljenek az új verziók érvényesüléséhez
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));
app.use('/uploads', express.static(config.uploadsDir, {
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (filePath.endsWith('.svg')) {
      // SVG esetén szigorú Content-Security-Policy, hogy beágyazott script ne futhasson az origin-en (Report 14 / 09. pont)
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    }
  }
}));

// Útvonalak (API és Oldalnézetek)
app.use('/api', apiRoutes);
app.use('/', viewRoutes);

// Globális hibakezelő middleware
app.use((err, req, res, next) => {
  console.error('Kiszolgálói hiba:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Belső szerverhiba történt!'
  });
});

// Helyi hálózati IP címek felderítése a kényelmes indításhoz
function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// Szerver indítása (alapértelmezetten a 3000-es porton minden IPv4 hálózati csatolón)
function startServer(options = {}) {
  const listenPort = options.port !== undefined ? options.port : config.port;
  const listenHost = options.host || process.env.HOST || '0.0.0.0';

  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      reject(err);
    };

    const onListening = () => {
      server.removeListener('error', onError);
      const addr = server.address();
      const actualPort = addr && typeof addr === 'object' ? addr.port : listenPort;

      // Elavult ideiglenes képfeltöltések takarítása induláskor (Report 14 / 39. pont)
      try {
        const quizRepo = require('./src/db/quizRepo');
        quizRepo.cleanExpiredTempImages();
      } catch (e) {
        console.warn('Elavult temp képek takarításakor figyelmeztetés:', e.message);
      }

      // Szerver indulási diagnosztikai esemény rögzítése
      diagnosticsService.logEvent({
        source: 'server',
        event: 'server.started',
        runId: diagnosticsService.runId
      });

      if (!options.silent) {
        const ips = getNetworkAddresses();
        console.log('================================================================');
        console.log(`  Röpdolgozat program szerver elindult a(z) ${actualPort}-es porton!`);
        console.log('----------------------------------------------------------------');
        console.log(`  Helyi elérés (Localhost):   http://localhost:${actualPort}`);
        if (ips.length > 0 && listenHost === '0.0.0.0') {
          ips.forEach(ip => {
            console.log(`  Hálózati elérés (LAN IP):   http://${ip}:${actualPort}`);
          });
        }
        console.log('----------------------------------------------------------------');
        console.log(`  Tanári vezérlőpult:         http://localhost:${actualPort}/admin`);
        console.log(`  Kivetítő monitor:           http://localhost:${actualPort}/projector`);
        console.log('================================================================');
      }

      if (typeof process.send === 'function') {
        try {
          process.send({ type: 'listening', port: actualPort, host: listenHost });
        } catch {}
      }

      resolve({ port: actualPort, host: listenHost });
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(listenPort, listenHost);
  });
}

// Szabályos leállás folyamata (Graceful Shutdown - DH 01 / 6. fejezet)
function gracefulShutdown(signal, options = {}) {
  if (shutdownPromise) return shutdownPromise;
  isShuttingDown = true;

  const activeOpsTimeoutMs = options.activeOpsTimeoutMs !== undefined
    ? options.activeOpsTimeoutMs
    : parseInt(process.env.SHUTDOWN_ACTIVE_OPS_TIMEOUT_MS || '5000', 10);
  const flushTimeoutMs = options.flushTimeoutMs !== undefined
    ? options.flushTimeoutMs
    : parseInt(process.env.SHUTDOWN_FLUSH_TIMEOUT_MS || '2000', 10);

  shutdownPromise = (async () => {
    console.log(`\nSzerver leállási folyamat megkezdve (${signal})...`);

    let deadlineReached = false;
    let activeOpsTimer = null;

    // 1. Együttes feltétel: Socket.IO + HTTP szerver bezárása ÉS minden aktív művelet befejezése
    const ioClosePromise = new Promise((resolve) => {
      if (!server.listening) {
        try {
          io.close(() => resolve());
        } catch {
          resolve();
        }
        return;
      }
      try {
        io.close(() => resolve());
        if (typeof server.closeIdleConnections === 'function') {
          server.closeIdleConnections();
        }
      } catch {
        resolve();
      }
    });

    const activeDonePromise = new Promise((resolve) => {
      if (activeRequestsCount <= 0 && activeOperationsCount <= 0) {
        resolve();
        return;
      }
      const onDone = () => {
        activeWaiters.delete(onDone);
        resolve();
      };
      activeWaiters.add(onDone);
    });

    const normalClosePromise = Promise.all([ioClosePromise, activeDonePromise]);

    const deadlinePromise = new Promise((resolve) => {
      activeOpsTimer = setTimeout(() => {
        deadlineReached = true;
        resolve();
      }, activeOpsTimeoutMs);
    });

    await Promise.race([normalClosePromise, deadlinePromise]);
    if (activeOpsTimer) {
      clearTimeout(activeOpsTimer);
      activeOpsTimer = null;
    }
    activeWaiters.clear();

    // Ha lejárt a határidő, ténylegesen megszakítjuk a megmaradt kapcsolatokat
    if (deadlineReached) {
      try { io.disconnectSockets(true); } catch {}
      for (const socket of Array.from(activeSockets)) {
        try { socket.destroy(); } catch {}
      }
      if (typeof server.closeAllConnections === 'function') {
        try { server.closeAllConnections(); } catch {}
      }
      // Hagyunk egy eseményciklus-fordulót a megszakított kérések http.closed_early eseményeinek sorba állására
      await new Promise((r) => setImmediate(r));
    }

    // 2. Leállási diagnosztikai esemény rögzítése az aktív műveletek lezárása UTÁN
    diagnosticsService.logEvent({
      source: 'server',
      event: 'server.stopping',
      runId: diagnosticsService.runId,
      reasonCode: deadlineReached ? 'SHUTDOWN_DEADLINE' : undefined
    });

    // 3. Napló leürítése és fájlfolyam lezárása legfeljebb 2 másodperces határidővel
    let flushResult = { ok: true, reason: 'disabled' };
    try {
      flushResult = await diagnosticsService.flushAndClose(flushTimeoutMs);
    } catch (err) {
      console.error('Hiba a napló lezárásakor:', err.message);
      flushResult = { ok: false, reason: 'write_error' };
    }

    // 3b. SQLite WAL-napló kiírása a fő adatbázisfájlba és kapcsolat szabályos lezárása
    try {
      const db = require('./src/db/init');
      if (db && db.open) {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
      }
    } catch (dbCloseErr) {
      console.warn('Figyelmeztetés: SQLite WAL-checkpoint / lezárás sikertelen:', dbCloseErr.message);
    }

    // 4. Kilépési kód beállítása (a sikeres ürítés NEM írhatja felül a határidő-túllépés hibakódját!)
    if (deadlineReached || !flushResult.ok) {
      if (!flushResult.ok) {
        console.warn(`Figyelem: A diagnosztikai napló lezárása hibával fejeződött be (${flushResult.reason}).`);
      }
      process.exitCode = 1;
    } else if (!process.exitCode) {
      process.exitCode = 0;
    }

    // IPC csatorna lezárása, hogy gyermekfolyamat módban természetesen kiléphessen a folyamat
    if (typeof process.disconnect === 'function' && process.connected) {
      try { process.disconnect(); } catch {}
    }

    return {
      deadlineReached,
      flushResult,
      exitCode: process.exitCode
    };
  })();

  return shutdownPromise;
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Szerver indítási hiba:', err);
    process.exitCode = 1;
  });

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('message', (msg) => {
    if (msg && msg.type === 'shutdown') {
      gracefulShutdown('IPC_SHUTDOWN', msg.options || {});
    }
  });
}

module.exports = { app, server, io, startServer, gracefulShutdown };

