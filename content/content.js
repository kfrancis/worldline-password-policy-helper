// Password Policy Helper - Content Script
// Detects password fields, adds indicators, handles read/write messaging with popup.

(function () {
  'use strict';

  let activePasswordField = null;

  function findPasswordFields() {
    return document.querySelectorAll('input[type="password"]');
  }

  function getTargetField() {
    if (activePasswordField && document.contains(activePasswordField)) {
      return activePasswordField;
    }
    const fields = findPasswordFields();
    return fields.length > 0 ? fields[0] : null;
  }

  // Track which password field the user last focused
  function setupFieldTracking() {
    document.addEventListener('focusin', (e) => {
      if (e.target.matches('input[type="password"]')) {
        activePasswordField = e.target;
      }
    });
  }

  // Add small visual indicator next to password fields
  function addIndicators() {
    const fields = findPasswordFields();
    fields.forEach((field) => {
      if (field.dataset.pphIndicator) return;
      field.dataset.pphIndicator = 'true';

      const indicator = document.createElement('div');
      indicator.className = 'pph-indicator';
      indicator.title = 'Password Policy Helper';
      indicator.textContent = 'PP';

      // Style the indicator
      Object.assign(indicator.style, {
        position: 'absolute',
        right: '4px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '20px',
        height: '20px',
        borderRadius: '3px',
        background: '#3b82f6',
        color: '#fff',
        fontSize: '9px',
        fontWeight: 'bold',
        fontFamily: 'sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: '10000',
        lineHeight: '1',
        userSelect: 'none',
      });

      // Position the parent relatively if needed
      const parent = field.parentElement;
      const parentPos = getComputedStyle(parent).position;
      if (parentPos === 'static') {
        parent.style.position = 'relative';
      }

      parent.appendChild(indicator);
    });
  }

  // Set value on an input field in a way that triggers framework change detection
  function setFieldValue(field, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    ).set;
    nativeInputValueSetter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Message listener for popup communication
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'read') {
      const field = getTargetField();
      sendResponse({ password: field ? field.value : '' });
    } else if (msg.type === 'fill') {
      const field = getTargetField();
      if (field) {
        setFieldValue(field, msg.password);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
    } else if (msg.type === 'detect') {
      const fields = findPasswordFields();
      sendResponse({ found: fields.length > 0, count: fields.length });
    }
    return true;
  });

  // Initialize
  setupFieldTracking();
  addIndicators();

  // Watch for dynamically added password fields
  const observer = new MutationObserver(() => addIndicators());
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
