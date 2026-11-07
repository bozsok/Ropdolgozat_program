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

// Statikus fájlok kiszolgálása (Offline frontend és feltöltött képek)
app.use(express.static(config.publicDir));
app.use('/uploads', express.static(config.uploadsDir));

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

// Szerver indítása az alapértelmezett 3000-es porton (Rule 7)
server.listen(config.port, () => {
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

