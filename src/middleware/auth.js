const crypto = require('crypto');
const config = require('../../config');

// Titkosított vagy aláírt token generálása a tanári munkamenethez
function generateToken() {
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac('sha256', config.cookieSecret);
  hmac.update(`admin:${config.adminPin}:${timestamp}`);
  return `${timestamp}.${hmac.digest('hex')}`;
}

// Token érvényességének ellenőrzése
function isValidToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestamp, signature] = parts;
  const hmac = crypto.createHmac('sha256', config.cookieSecret);
  hmac.update(`admin:${config.adminPin}:${timestamp}`);
  const expectedSignature = hmac.digest('hex');

  // Időzítéses támadások elleni biztonságos összehasonlítás
  try {
    const isSignatureValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
    if (!isSignatureValid) return false;

    // Token lejárata: 24 óra (tanítási nap kényelmesen)
    const tokenTime = parseInt(timestamp, 10);
    const now = Date.now();
    return (now - tokenTime) < (24 * 60 * 60 * 1000);
  } catch {
    return false;
  }
}

/**
 * Express middleware tanári jogosultság megköveteléséhez
 */
function requireAdminAuth(req, res, next) {
  const token = req.cookies ? req.cookies[config.cookieName] : null;

  if (isValidToken(token)) {
    req.isAdmin = true;
    return next();
  }

  // Ha API hívás
  if (req.path.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({
      success: false,
      message: 'A művelethez tanári bejelentkezés szükséges!'
    });
  }

  // Ha védett böngészős navigáció (pl. /print bejelentkezés nélkül), átirányítás a tanári vezérlőpultra
  return res.redirect('/admin');
}

/**
 * Tanári bejelentkezés végrehajtása
 */
function loginAdmin(res, pin) {
  if (pin !== config.adminPin) {
    return false;
  }

  const token = generateToken();
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 óra
  });
  return true;
}

/**
 * Tanári kijelentkezés
 */
function logoutAdmin(res) {
  res.clearCookie(config.cookieName);
}

module.exports = {
  requireAdminAuth,
  isValidToken,
  loginAdmin,
  logoutAdmin
};

