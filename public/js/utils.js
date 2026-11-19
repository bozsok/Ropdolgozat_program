/**
 * utils.js - Közös kliensoldali segédfüggvények (100% Offline)
 */

/**
 * XSS elleni szövegfertőtlenítés
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Kódrészletek formázása: a backtick ( `kód` ) közötti részek kiemelése
 * Először XSS-biztos tisztítás történik, majd <code class="inline-code"> generálása
 */
function formatCode(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  // Cseréljük a `kód` részeket inline code tagre
  return escaped.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
}

/**
 * Másodpercek formázása PP:MM (MM:SS) alakban
 */
function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(sec / 60);
  const remainingSeconds = sec % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * URL query paraméter lekérése (pl. ?gep=12)
 */
function getUrlParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

/**
 * Offline Toast értesítés megjelenítése a képernyőn
 */
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.innerHTML = escapeHtml(message);

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3500);
}

/**
 * Aktív modális ablakok ellenőrzése és a háttérgörgetés zárolása/feloldása
 */
function syncBodyScrollLock() {
  const hasActiveModal = document.querySelector('.modal-backdrop.active, .calm-modal-backdrop.active') !== null;
  if (hasActiveModal) {
    document.body.classList.add('modal-open');
  } else {
    document.body.classList.remove('modal-open');
  }
}

/**
 * Modal ablak megnyitása
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    syncBodyScrollLock();
  }
}

/**
 * Modal ablak bezárása
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    syncBodyScrollLock();
  }
}

// Ablakon kívüli kattintás a modal bezárásához
let modalMouseDownTarget = null;

window.addEventListener('mousedown', (e) => {
  modalMouseDownTarget = e.target;
});

window.addEventListener('click', (e) => {
  const isBackdrop = e.target.classList.contains('modal-backdrop') || e.target.classList.contains('calm-modal-backdrop');
  // Csak akkor zárjuk be a modalt, ha a kattintás közvetlenül a háttéren történt, ÉS az egérlenyomás (mousedown) is ott indult.
  // Ezzel megelőzzük, hogy belső szövegkijelölés (satírozás) során a modal véletlenül bezáródjon, ha a felengedés kívül történik.
  if (isBackdrop && modalMouseDownTarget === e.target) {
    // Az admin felületen (admin.html) a login-modal kötelező hitelesítési kapu, ott tilos bezárni mellékattintással
    if (e.target.id === 'login-modal' && e.target.classList.contains('modal-backdrop')) return;
    e.target.classList.remove('active');
    syncBodyScrollLock();
  }
});

