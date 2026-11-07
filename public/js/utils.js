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
 * Modal ablak megnyitása
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

/**
 * Modal ablak bezárása
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

// Ablakon kívüli kattintás a modal bezárásához
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('active');
  }
});

