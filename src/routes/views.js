const express = require('express');
const path = require('path');
const config = require('../../config');
const { requireAdminAuth } = require('../middleware/auth');

const router = express.Router();

// Diák belépő és tesztíró felület (publikus)
router.get('/', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'student.html'));
});

// Tanári fő vezérlőpult (PIN védelem)
router.get('/admin', requireAdminAuth, (req, res) => {
  res.sendFile(path.join(config.publicDir, 'admin.html'));
});

// Tanári másodlagos kivetítő monitor (PIN védelem)
router.get('/projector', requireAdminAuth, (req, res) => {
  res.sendFile(path.join(config.publicDir, 'projector.html'));
});

// Nyomtatható A4-es egyéni értékelőlapok sablonja (PIN védelem)
router.get('/print', requireAdminAuth, (req, res) => {
  res.sendFile(path.join(config.publicDir, 'print-report.html'));
});

module.exports = router;

