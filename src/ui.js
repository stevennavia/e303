import { releaseLock, requestLock } from './controls.js';

const timerEl = document.getElementById('timer');
const promptEl = document.getElementById('interaction-prompt');
const messageEl = document.getElementById('game-message');
const timeNotifEl = document.getElementById('time-notification');
const startOverlay = document.getElementById('start-overlay');
const endOverlay = document.getElementById('end-overlay');
const retryBtn = document.getElementById('retry-btn');
const comboOverlay = document.getElementById('combo-overlay');
const comboCloseBtn = document.getElementById('combo-close');
const comboSubmitBtn = document.getElementById('combo-submit');
const comboDigitEls = {
  violet: document.getElementById('combo-violet'),
  red: document.getElementById('combo-red'),
  green: document.getElementById('combo-green'),
  blue: document.getElementById('combo-blue'),
};

let messageTimeout = null;
let comboState = null;
let comboCorrect = null;
let comboOnChange = null;
let comboOnCheck = null;
let _persistedCombo = { violet: 0, red: 0, green: 0, blue: 0 };

export function showComboUI(state, onChange, onCheck) {
  comboState = _persistedCombo;
  comboCorrect = state;
  comboOnChange = onChange || null;
  comboOnCheck = onCheck || null;
  updateComboDisplays();
  releaseLock();
  comboOverlay.classList.add('active');
}

export function showStartOverlay() {
  startOverlay.style.display = 'flex';
}

export function hideStartOverlay() {
  startOverlay.style.display = 'none';
}

export function showEndOverlay() {
  endOverlay.classList.add('active');
}

export function hideEndOverlay() {
  endOverlay.classList.remove('active');
}

retryBtn.addEventListener('click', () => {
  location.reload();
});

export function updateTimerDisplay(formatted) {
  timerEl.textContent = formatted;
}

export function showInteractionPrompt(text) {
  if (text) {
    promptEl.textContent = text;
    promptEl.classList.add('visible');
  } else {
    promptEl.classList.remove('visible');
  }
}

export function showMessage(text) {
  if (messageTimeout) clearTimeout(messageTimeout);

  messageEl.textContent = text;
  messageEl.classList.add('visible');

  messageTimeout = setTimeout(() => {
    messageEl.classList.remove('visible');
  }, 1500);
}

let timeNotifTimeout = null;
export function showTimeNotification(amount) {
  if (timeNotifTimeout) clearTimeout(timeNotifTimeout);

  timeNotifEl.textContent = amount > 0 ? `+${amount}s` : `${amount}s`;
  timeNotifEl.className = amount > 0 ? 'gain visible' : 'loss visible';

  timerEl.classList.remove('shake');
  void timerEl.offsetWidth;
  timerEl.classList.add('shake');

  timeNotifTimeout = setTimeout(() => {
    timeNotifEl.classList.remove('visible');
    timerEl.classList.remove('shake');
  }, 2000);
}

function updateComboDisplays() {
  for (const key of ['violet', 'red', 'green', 'blue']) {
    if (comboDigitEls[key] && comboState) {
      comboDigitEls[key].textContent = String(comboState[key]);
    }
  }
}

function setDigit(key, value) {
  if (!comboState) return;
  comboState[key] = ((value % 10) + 10) % 10;
  updateComboDisplays();
  if (comboOnChange) comboOnChange();
}

export function hideComboUI() {
  comboOverlay.classList.remove('active');
  requestLock();
}

export function initComboUI() {
  comboCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideComboUI();
  });
  comboOverlay.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === comboOverlay) hideComboUI();
  });
  comboSubmitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (comboOnCheck && comboState && comboCorrect) {
      comboOnCheck(comboState, comboCorrect);
    }
  });
  const cells = comboOverlay.querySelectorAll('.combo-cell');
  cells.forEach((cell) => {
    const key = cell.dataset.key;
    const up = cell.querySelector('.combo-up');
    const down = cell.querySelector('.combo-down');
    up.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!comboState) return;
      setDigit(key, comboState[key] + 1);
    });
    down.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!comboState) return;
      setDigit(key, comboState[key] - 1);
    });
  });
}
