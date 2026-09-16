
/* =========================================================
   FieldTest — index.js
   Login screen: tabs, 6-digit PIN mask/reveal, validation,
   mock auth flow with loading/error states.
   ========================================================= */

/* ---------- App state ---------- */
const FieldTestState = {
  currentOperator: null,
  setOperator(operatorId) {
    this.currentOperator = { operatorId };
  },
};

/* ---------- Mock AuthService (prototype only — no real backend yet) ----------
   Demo credentials:
     Operator ID: OP-1001
     PIN:         123456
*/
const AuthService = (() => {
  const DEMO_OPERATOR_ID = 'OP-1001';
  const DEMO_PIN = '123456';
  const PIN_LENGTH = 6;
  const SIMULATED_LATENCY_MS = 700;

  function validate(operatorId, pin) {
    const errors = {};

    if (!operatorId || !operatorId.trim()) {
      errors.operatorId = 'Operator ID is required.';
    }

    if (!pin || pin.length !== PIN_LENGTH) {
      errors.pin = `Enter your ${PIN_LENGTH}-digit PIN.`;
    } else if (!/^\d+$/.test(pin)) {
      errors.pin = 'PIN must be numeric.';
    }

    return { valid: Object.keys(errors).length === 0, errors };
  }

  function login(operatorId, credential) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const idMatches = operatorId.trim().toUpperCase() === DEMO_OPERATOR_ID;
        const pinMatches = credential === DEMO_PIN;

        if (idMatches && pinMatches) {
          resolve({
            success: true,
            operatorId: DEMO_OPERATOR_ID
          });
        } else {
          resolve({
            success: false,
            message: 'Invalid Operator ID or PIN. Please try again.'
          });
        }
      }, SIMULATED_LATENCY_MS);
    });
  }

  return { validate, login, PIN_LENGTH };
})();

/* ---------- UI helpers ---------- */
const UI = {
  setActiveTab(tabButtons, activeButton) {
    tabButtons.forEach((btn) =>
      btn.classList.toggle('is-active', btn === activeButton)
    );
  },

  setFieldError(controlEl, errorEl, message) {
    if (message) {
      controlEl.classList.add('has-error');
      if (errorEl) errorEl.textContent = message;
    } else {
      controlEl.classList.remove('has-error');
      if (errorEl) errorEl.textContent = '';
    }
  },

  showAlert(alertEl, message) {
    alertEl.querySelector('[data-alert-text]').textContent = message;
    alertEl.classList.add('is-visible');
  },

  hideAlert(alertEl) {
    alertEl.classList.remove('is-visible');
  },

  setButtonLoading(buttonEl, isLoading) {
    buttonEl.classList.toggle('is-loading', isLoading);
    buttonEl.disabled = isLoading;
  },

  /** Renders the PIN indicator (dots, or real digits when `visible` is true). */
  renderPinDisplay(containerEl, value, visible, length) {
    containerEl.innerHTML = '';

    for (let i = 0; i < length; i += 1) {
      const hasDigit = i < value.length;

      if (visible) {
        const span = document.createElement('span');
        span.className = 'pin-display__digit';
        span.textContent = hasDigit ? value[i] : '';
        containerEl.appendChild(span);
      } else {
        const dot = document.createElement('span');
        dot.className =
          'pin-display__dot' + (hasDigit ? ' is-filled' : '');
        containerEl.appendChild(dot);
      }
    }
  },
};

/* ---------- Login screen wiring ---------- */
(function initLoginScreen() {
  let pinValue = '';
  let pinVisible = false;
  const PIN_LENGTH = AuthService.PIN_LENGTH;

  function wireTabs(root) {
    const tabButtons = Array.from(
      root.querySelectorAll('.tabs__tab')
    );

    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;

        UI.setActiveTab(tabButtons, btn);
      });
    });
  }

  function wirePinField(root) {
    const hiddenInput = root.querySelector('#pin-hidden-input');
    const display = root.querySelector('#pin-display');
    const toggleBtn = root.querySelector('#pin-toggle');
    const control = root.querySelector('#pin-control');

    hiddenInput.maxLength = PIN_LENGTH;

    UI.renderPinDisplay(
      display,
      pinValue,
      pinVisible,
      PIN_LENGTH
    );

    control.addEventListener('click', () => {
      hiddenInput.focus();
    });

    hiddenInput.addEventListener('input', () => {
      pinValue = hiddenInput.value
        .replace(/\D/g, '')
        .slice(0, PIN_LENGTH);

      hiddenInput.value = pinValue;

      UI.renderPinDisplay(
        display,
        pinValue,
        pinVisible,
        PIN_LENGTH
      );

      UI.setFieldError(
        control,
        root.querySelector('#pin-error'),
        ''
      );
    });

    toggleBtn.addEventListener('click', () => {
      pinVisible = !pinVisible;

      toggleBtn.classList.toggle(
        'is-visible',
        pinVisible
      );

      toggleBtn.setAttribute(
        'aria-pressed',
        String(pinVisible)
      );

      UI.renderPinDisplay(
        display,
        pinValue,
        pinVisible,
        PIN_LENGTH
      );
    });
  }

  function wireForm(root) {
    const form = root.querySelector('#login-form');
    const operatorInput = root.querySelector(
      '#operator-id-input'
    );
    const operatorControl = root.querySelector(
      '#operator-id-control'
    );
    const pinControl = root.querySelector(
      '#pin-control'
    );
    const submitBtn = root.querySelector(
      '#login-submit'
    );
    const alertEl = root.querySelector(
      '#login-alert'
    );

    operatorInput.addEventListener('input', () => {
      UI.setFieldError(
        operatorControl,
        root.querySelector('#operator-id-error'),
        ''
      );
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      UI.hideAlert(alertEl);
      alertEl.classList.remove(
        'form-alert--success'
      );

      const operatorId = operatorInput.value.trim();

      const { valid, errors } =
        AuthService.validate(
          operatorId,
          pinValue
        );

      UI.setFieldError(
        operatorControl,
        root.querySelector('#operator-id-error'),
        errors.operatorId || ''
      );

      UI.setFieldError(
        pinControl,
        root.querySelector('#pin-error'),
        errors.pin || ''
      );

      if (!valid) return;

      UI.setButtonLoading(
        submitBtn,
        true
      );

      const result =
        await AuthService.login(
          operatorId,
          pinValue
        );

      UI.setButtonLoading(
        submitBtn,
        false
      );

      /* ---------- Successful Login ---------- */
      if (result.success) {
        // Save logged-in operator in the current app state
        FieldTestState.setOperator(
          result.operatorId
        );

        // Redirect to the completed Home page
        window.location.href = 'home.html';

        return;
      }

      /* ---------- Failed Login ---------- */
      UI.showAlert(
        alertEl,
        result.message
      );
    });
  }

  document.addEventListener(
    'DOMContentLoaded',
    () => {
      const root =
        document.getElementById(
          'screen-login'
        );

      if (!root) return;

      wireTabs(root);
      wirePinField(root);
      wireForm(root);
    }
  );
})();