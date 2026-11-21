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

// Leállási állapot és aktív kérések követése
let isShuttingDown = false;
let activeRequestsCount = 0;

// Socket.io inicializálása
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// io példány elérhetővé tétele a routerekben
app.set('io', io);

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
  const onRequestFinished = () => {
    if (requestEnded) return;
    requestEnded = true;
    activeRequestsCount = Math.max(0, activeRequestsCount - 1);

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
  };

  const onRequestClosedEarly = () => {
    if (requestEnded) return;
    requestEnded = true;
    activeRequestsCount = Math.max(0, activeRequestsCount - 1);

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

// Diagnosztikai JSON body túlméret hiba (413 Payload Too Large) célzott elkapása
app.use('/api/student/diagnostics/events', (err, req, res, next) => {
  if (err.status === 413 || err.type === 'entity.too.large') {
    return res.status(413).json({ code: 'CLIENT_PAYLOAD_TOO_LARGE' });
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

// Szerver indítása az alapértelmezett 3000-es porton minden IPv4 hálózati csatolón (0.0.0.0)
server.listen(config.port, '0.0.0.0', () => {
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

  const ips = getNetworkAddresses();
  console.log('================================================================');
  console.log(`  Röpdolgozat program szerver elindult a(z) ${config.port}-es porton!`);
  console.log('----------------------------------------------------------------');
  console.log(`  Helyi elérés (Localhost):   http://localhost:${config.port}`);
  if (ips.length > 0) {
    ips.forEach(ip => {
      console.log(`  Hálózati elérés (LAN IP):   http://${ip}:${config.port}`);
    });
  }
  console.log('----------------------------------------------------------------');
  console.log(`  Tanári vezérlőpult:         http://localhost:${config.port}/admin`);
  console.log(`  Kivetítő monitor:           http://localhost:${config.port}/projector`);
  console.log('================================================================');
});

// Szabályos leállás folyamata (Graceful Shutdown - v1.2)
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nSzerver leállási folyamat megkezdve (${signal})...`);

  let deadlineReached = false;
  const activeOpsTimer = setTimeout(() => {
    deadlineReached = true;
  }, 5000);

  // Socket.IO és mögöttes HTTP szerver közös lezárása
  await new Promise((resolve) => {
    try {
      io.close(() => {
        resolve();
      });
    } catch {
      resolve();
    }

    const checkInterval = setInterval(() => {
      if (activeRequestsCount <= 0 || deadlineReached) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 50);
  });
  clearTimeout(activeOpsTimer);

  // Leállási diagnosztikai esemény rögzítése
  diagnosticsService.logEvent({
    source: 'server',
    event: 'server.stopping',
    runId: diagnosticsService.runId,
    reasonCode: deadlineReached ? 'SHUTDOWN_DEADLINE' : undefined
  });

  // Napló leürítése és lezárása legfeljebb 2 másodperces határidővel
  try {
    const flushed = await diagnosticsService.flushAndClose(2000);
    if (!flushed) {
      console.warn('Figyelem: A diagnosztikai napló leürítése határidőre nem fejeződött be teljesen.');
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  } catch (err) {
    console.error('Hiba a napló lezárásakor:', err.message);
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = { app, server, gracefulShutdown };

