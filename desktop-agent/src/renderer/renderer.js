const loginView = document.getElementById('login-view');
const signedInView = document.getElementById('signed-in-view');
const errorEl = document.getElementById('error');
const statusEl = document.getElementById('status');
const whoamiEl = document.getElementById('whoami');

document.getElementById('sign-in-btn').addEventListener('click', async () => {
  errorEl.textContent = '';
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const result = await window.agent.signIn(email, password);
  if (!result.ok) {
    errorEl.textContent = result.error;
    return;
  }
  showSignedIn(result.email);
});

document.getElementById('sign-out-btn').addEventListener('click', async () => {
  await window.agent.signOut();
  loginView.classList.remove('hidden');
  signedInView.classList.add('hidden');
});

function showSignedIn(email) {
  loginView.classList.add('hidden');
  signedInView.classList.remove('hidden');
  whoamiEl.textContent = `Signed in as ${email}`;
}

window.agent.onSignedIn((email) => showSignedIn(email));
window.agent.onStatus((status) => {
  statusEl.textContent = status.tracking ? 'Tracking active.' : 'Tracking is OFF (ask an admin to enable it for you).';
});
window.agent.onConfigError((message) => {
  loginView.classList.add('hidden');
  signedInView.classList.add('hidden');
  const configView = document.getElementById('config-error-view');
  configView.classList.remove('hidden');
  document.getElementById('config-error-text').textContent = message;
});
