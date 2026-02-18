// Password Policy Helper - Popup UI Logic

import { validate } from '../lib/validator.js';
import { generate } from '../lib/generator.js';
import { fix } from '../lib/fixer.js';

// --- DOM References ---
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const ruleEls = document.querySelectorAll('#validation-checklist .rule');
const statusEl = document.getElementById('status-msg');

// Fix tab
const fixInput = document.getElementById('fix-input');
const fixReadBtn = document.getElementById('fix-read-btn');
const fixBtn = document.getElementById('fix-btn');
const fixResult = document.getElementById('fix-result');
const fixDiff = document.getElementById('fix-diff');
const fixCopyBtn = document.getElementById('fix-copy-btn');
const fixFillBtn = document.getElementById('fix-fill-btn');

// Generate tab
const genLength = document.getElementById('gen-length');
const genLengthDisplay = document.getElementById('gen-length-display');
const genBtn = document.getElementById('gen-btn');
const genResult = document.getElementById('gen-result');
const genPassword = document.getElementById('gen-password');
const genCopyBtn = document.getElementById('gen-copy-btn');
const genFillBtn = document.getElementById('gen-fill-btn');

// Validate tab
const validateInput = document.getElementById('validate-input');

// State
let currentFixedPassword = '';
let currentGeneratedPassword = '';

// --- Tab Switching ---
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tabContents.forEach((tc) => {
      tc.hidden = true;
      tc.classList.remove('active');
    });
    tab.classList.add('active');
    const target = document.getElementById('tab-' + tab.dataset.tab);
    target.hidden = false;
    target.classList.add('active');
    clearStatus();
  });
});

// --- Validation Checklist ---
function updateChecklist(password) {
  const result = validate(password || '');
  for (const rule of result.rules) {
    const el = document.querySelector(`.rule[data-rule="${rule.id}"]`);
    if (!el) continue;
    el.classList.remove('pass', 'fail', 'neutral');
    if (!password) {
      el.classList.add('neutral');
    } else {
      el.classList.add(rule.pass ? 'pass' : 'fail');
    }
  }
}

// --- Status Messages ---
function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status-msg ' + type;
  statusEl.hidden = false;
  setTimeout(() => { statusEl.hidden = true; }, 3000);
}

function clearStatus() {
  statusEl.hidden = true;
}

// --- Content Script Messaging ---
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToContent(message) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    showStatus('No active tab found', 'error');
    return null;
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    showStatus('Cannot access this page. Try reloading.', 'error');
    return null;
  }
}

// --- Fix Tab ---
fixReadBtn.addEventListener('click', async () => {
  const response = await sendToContent({ type: 'read' });
  if (response && response.password) {
    fixInput.value = response.password;
    updateChecklist(response.password);
    showStatus('Password read from page', 'success');
  } else if (response) {
    showStatus('No password found on page', 'error');
  }
});

fixBtn.addEventListener('click', () => {
  const password = fixInput.value;
  if (!password) {
    showStatus('Enter a password to fix', 'error');
    return;
  }

  const result = fix(password);
  currentFixedPassword = result.fixed;

  // Build diff display
  const changedIndices = new Set(result.changes.map((c) => c.index));
  let html = '';
  for (let i = 0; i < result.fixed.length; i++) {
    const ch = escapeHtml(result.fixed[i]);
    if (changedIndices.has(i)) {
      html += `<span class="changed">${ch}</span>`;
    } else {
      html += ch;
    }
  }
  fixDiff.innerHTML = html;
  fixResult.hidden = false;

  updateChecklist(result.fixed);

  if (result.changes.length === 0) {
    showStatus('Password already compliant!', 'success');
  } else {
    showStatus(`Fixed: ${result.changes.length} character(s) changed`, 'success');
  }
});

fixInput.addEventListener('input', () => {
  updateChecklist(fixInput.value);
});

fixCopyBtn.addEventListener('click', async () => {
  await copyToClipboard(currentFixedPassword);
});

fixFillBtn.addEventListener('click', async () => {
  await fillOnPage(currentFixedPassword);
});

// --- Generate Tab ---
genLength.addEventListener('input', () => {
  genLengthDisplay.textContent = genLength.value;
});

genBtn.addEventListener('click', () => {
  const result = generate(parseInt(genLength.value, 10));
  currentGeneratedPassword = result.password;
  genPassword.textContent = result.password;
  genResult.hidden = false;
  updateChecklist(result.password);
});

genCopyBtn.addEventListener('click', async () => {
  await copyToClipboard(currentGeneratedPassword);
});

genFillBtn.addEventListener('click', async () => {
  await fillOnPage(currentGeneratedPassword);
});

// --- Validate Tab ---
validateInput.addEventListener('input', () => {
  updateChecklist(validateInput.value);
});

// --- Utilities ---
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showStatus('Copied to clipboard!', 'success');
  } catch {
    showStatus('Failed to copy', 'error');
  }
}

async function fillOnPage(password) {
  if (!password) {
    showStatus('No password to fill', 'error');
    return;
  }
  const response = await sendToContent({ type: 'fill', password });
  if (response?.success) {
    showStatus('Password filled on page', 'success');
  } else if (response) {
    showStatus('No password field found on page', 'error');
  }
}

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

// --- Init ---
updateChecklist('');
