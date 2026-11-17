const loginView = document.getElementById('login-view');
const signedInView = document.getElementById('signed-in-view');
const errorEl = document.getElementById('error');
const statusEl = document.getElementById('status');
const whoamiEl = document.getElementById('whoami');
const taglineEl = document.getElementById('tagline');
const signInBtn = document.getElementById('sign-in-btn');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');

function showError(message) {
  errorEl.textContent = message || '';
  errorEl.classList.toggle('show', !!message);
}

async function doSignIn() {
  if (signInBtn.disabled) return;
  showError('');
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  if (!email || !password) {
    showError('Enter your work email and password.');
    return;
  }
  signInBtn.disabled = true;
  signInBtn.innerHTML = '<span class="spinner"></span>Signing in…';
  try {
    const result = await window.agent.signIn(email, password);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    passwordEl.value = '';
    showSignedIn(result.email);
  } finally {
    signInBtn.disabled = false;
    signInBtn.textContent = 'Sign in';
  }
}

signInBtn.addEventListener('click', doSignIn);
for (const el of [emailEl, passwordEl]) {
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSignIn(); });
}

// show / hide the password
document.getElementById('toggle-pw').addEventListener('click', () => {
  const show = passwordEl.type === 'password';
  passwordEl.type = show ? 'text' : 'password';
  document.getElementById('toggle-pw').title = show ? 'Hide password' : 'Show password';
});

document.getElementById('sign-out-btn').addEventListener('click', async () => {
  await window.agent.signOut();
  showSignedOut();
});

function showSignedOut() {
  loginView.classList.remove('hidden');
  signedInView.classList.add('hidden');
  taglineEl.textContent = 'Sign in to start tracking your time';
  emailEl.focus();
}

function showSignedIn(email) {
  loginView.classList.add('hidden');
  signedInView.classList.remove('hidden');
  whoamiEl.textContent = email;
  document.getElementById('avatar').textContent = (email || '?').trim().charAt(0).toUpperCase();
  taglineEl.textContent = 'You are signed in';
}

window.agent.onSignedIn((email) => showSignedIn(email));
window.agent.onSignedOut(() => {
  showSignedOut();
  showError('Your login expired. Please sign in again.');
});
window.agent.onStatus((status) => {
  statusEl.textContent = status.tracking ? 'Tracker is ready' : 'Tracking is off (ask an admin to enable it for you)';
  statusEl.classList.toggle('on', !!status.tracking);
});
window.agent.onConfigError((message) => {
  loginView.classList.add('hidden');
  signedInView.classList.add('hidden');
  const configView = document.getElementById('config-error-view');
  configView.classList.remove('hidden');
  document.getElementById('config-error-text').textContent = message;
});

emailEl.focus();
