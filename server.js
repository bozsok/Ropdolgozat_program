const http = require('http');
const os = require('os');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const config = require('./config');
const apiRoutes = require('./src/routes/api');
const viewRoutes = require('./src/routes/views');
const initLiveHandler = require('./src/sockets/liveHandler');

// Express alkalmazás és HTTP szerver
const app = express();
const server = http.createServer(app);

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

// Middleware-ek
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

module.exports = { app, server };

