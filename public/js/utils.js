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
 * Szövegformázó (XSS-biztos, 0 külső függőség):
 * Támogatott jelölések: `kód`, **félkövér**, *dőlt*, __aláhúzott__, ^felső index^, ~alsó index~, sortörés (\n).
 * Először escapeHtml() fut, a `kód` blokkok pedig védett helyőrzőt kapnak, így a kódon belüli jelek nem formázódnak.
 */
function formatCode(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // 1. Inline kód blokkok kimentése, hogy a bennük lévő *, _, ^, ~ karakterek ne formázódjanak
  const codeBlocks = [];
  html = html.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<code class="inline-code">${code}</code>`);
    return `\u0000CODE${idx}\u0000`;
  });

  // 2. Félkövér (**...**), aláhúzott (__...__), dőlt (*...*), felső (^...^) és alsó (~...~) index
  html = html.replace(/\*\*([^\s*](?:[^*\n]*?[^\s*])?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^\s_](?:[^_\n]*?[^\s_])?)__/g, '<u>$1</u>');
  html = html.replace(/\*([^\s*](?:[^*\n]*?[^\s*])?)\*/g, '<em>$1</em>');
  html = html.replace(/\^([^\^\n]+?)\^/g, '<sup>$1</sup>');
  html = html.replace(/~([^~\n]+?)~/g, '<sub>$1</sub>');

  // 3. Sortörések megtartása
  html = html.replace(/\r?\n/g, '<br>');

  // 4. Inline kód blokkok visszahelyezése
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => codeBlocks[Number(idx)] || '');

  return html;
}

/**
 * Formázójelek eltávolítása egyszerű szöveges (tooltip, összefoglaló) megjelenítéshez
 */
function stripFormatting(text) {
  if (!text) return '';
  return String(text)
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^\s*](?:[^*\n]*?[^\s*])?)\*\*/g, '$1')
    .replace(/__([^\s_](?:[^_\n]*?[^\s_])?)__/g, '$1')
    .replace(/\*([^\s*](?:[^*\n]*?[^\s*])?)\*/g, '$1')
    .replace(/\^([^\^\n]+?)\^/g, '$1')
    .replace(/~([^~\n]+?)~/g, '$1')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Kontrollált WYSIWYG (contenteditable) DOM-fa szerializálása a rendszer
 * XSS-biztos, kompakt jelölésébe (**félkövér**, *dőlt*, __aláhúzott__, `kód`, ^felső^, ~alsó~, \n).
 */
function serializeRichEditorToMarkdown(rootEl) {
  if (!rootEl) return '';
  if (!rootEl.isContentEditable && typeof rootEl.value === 'string') {
    return rootEl.value.trim();
  }

  function wrapLines(text, prefix, suffix) {
    if (!text) return '';
    return text
      .split('\n')
      .map((line) => {
        const m = line.match(/^(\s*)(.*?)(\s*)$/);
        if (!m || !m[2]) return line;
        return `${m[1]}${prefix}${m[2]}${suffix}${m[3]}`;
      })
      .join('\n');
  }

  function walk(node, inCode = false) {
    if (node.nodeType === 3) {
      return (node.nodeValue || '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '');
    }
    if (node.nodeType !== 1) return '';

    const tag = node.tagName.toUpperCase();
    if (tag === 'BR') return '\n';

    const isBlock = tag === 'DIV' || tag === 'P';
    const nextInCode = inCode || tag === 'CODE';

    let inner = '';
    const children = Array.from(node.childNodes);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      // A böngészők gyakran tesznek egy záró <br>-t egy blokk/editor végére, ezt nem duplázzuk sortöréssé
      if (
        child.nodeType === 1 &&
        child.tagName.toUpperCase() === 'BR' &&
        i === children.length - 1 &&
        (isBlock || node === rootEl)
      ) {
        continue;
      }
      const childIsBlock = child.nodeType === 1 && (child.tagName.toUpperCase() === 'DIV' || child.tagName.toUpperCase() === 'P');
      if (childIsBlock && inner && !inner.endsWith('\n')) {
        inner += '\n';
      }
      inner += walk(child, nextInCode);
      if (childIsBlock && i < children.length - 1 && !inner.endsWith('\n')) {
        inner += '\n';
      }
    }

    if (tag === 'CODE') {
      const cleanCode = inner.replace(/`/g, '').replace(/\n/g, ' ');
      return cleanCode ? `\`${cleanCode}\`` : '';
    }
    if (inCode) return inner;

    let res = inner;
    const style = node.style || {};
    const isBold = tag === 'STRONG' || tag === 'B' || (style.fontWeight && (style.fontWeight === 'bold' || parseInt(style.fontWeight, 10) >= 600));
    const isItalic = tag === 'EM' || tag === 'I' || style.fontStyle === 'italic';
    const isUnderline = tag === 'U' || (style.textDecoration && style.textDecoration.includes('underline')) || (style.textDecorationLine && style.textDecorationLine.includes('underline'));
    const isSup = tag === 'SUP' || style.verticalAlign === 'super';
    const isSub = tag === 'SUB' || style.verticalAlign === 'sub';

    if (isSup) res = wrapLines(res, '^', '^');
    if (isSub) res = wrapLines(res, '~', '~');
    if (isUnderline) res = wrapLines(res, '__', '__');
    if (isItalic) res = wrapLines(res, '*', '*');
    if (isBold) res = wrapLines(res, '**', '**');

    return res;
  }

  return walk(rootEl)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

