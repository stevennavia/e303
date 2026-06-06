const timerEl = document.getElementById('timer');
const promptEl = document.getElementById('interaction-prompt');
const messageEl = document.getElementById('game-message');
const startOverlay = document.getElementById('start-overlay');
const endOverlay = document.getElementById('end-overlay');

let messageTimeout = null;

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
  }, 3000);
}
