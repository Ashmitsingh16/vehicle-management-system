const BASE_URL = window.APP_CONFIG?.apiUrl || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000/api'
  : '/api');

// Token is kept in memory + localStorage so a refresh doesn't log the user out,
// but each browser/device still needs its own login — that's what fixes the
// "I see someone else's data on another device" problem.
let authToken = localStorage.getItem('vms_token') || null;
let authCompany = JSON.parse(localStorage.getItem('vms_company') || 'null');

function showAuthTab(tab) {
  ['loginTab', 'registerTab', 'forgotTab', 'resetTab'].forEach(id => {
    document.getElementById(id).classList.toggle('active', id === `${tab}Tab`);
  });
  const loginBtn = document.getElementById('loginTabBtn');
  const registerBtn = document.getElementById('registerTabBtn');
  loginBtn.classList.toggle('active', tab === 'login');
  registerBtn.classList.toggle('active', tab === 'register');
  // forgot/reset are reached via link, not the top tab buttons — show both tabs "unselected" in that case
  if (tab === 'forgot' || tab === 'reset') {
    loginBtn.classList.remove('active');
    registerBtn.classList.remove('active');
  }
  const copy = {
    login: ['Welcome back', 'Sign in to continue to your company dashboard.'],
    register: ['Create your workspace', 'Set up your company and administrator account.'],
    forgot: ['Reset your password', 'We will send a secure reset link to your login email.'],
    reset: ['Choose a new password', 'Use at least six characters for your new password.']
  };
  document.getElementById('authHeading').textContent = copy[tab][0];
  document.getElementById('authSubtitle').textContent = copy[tab][1];
  const error = document.getElementById('authError');
  error.textContent = '';
  error.classList.remove('success');
}

function setAuthBusy(buttonId, busy, busyText) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.label;
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('authError');
  errBox.classList.remove('success');
  if (!email || !password) { errBox.textContent = 'Enter email and password.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errBox.textContent = 'Enter a valid email address.'; return; }

  setAuthBusy('loginSubmit', true, 'Signing in…');
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { errBox.textContent = data.msg || 'Login failed.'; return; }
    setSession(data.token, data.company);
  } catch (err) {
    errBox.textContent = 'Could not reach the server. Try again shortly.';
  } finally {
    setAuthBusy('loginSubmit', false);
  }
}

async function handleRegister() {
  const companyName = document.getElementById('regCompanyName').value.trim();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const password = document.getElementById('regPassword').value;
  const errBox = document.getElementById('authError');
  errBox.classList.remove('success');
  if (!companyName || !name || !email || !phone || !password) { errBox.textContent = 'Fill all fields.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errBox.textContent = 'Enter a valid email address.'; return; }
  if (password.length < 6) { errBox.textContent = 'Password must be at least 6 characters.'; return; }

  setAuthBusy('registerSubmit', true, 'Creating account…');
  try {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, name, email, phone, password })
    });
    const data = await res.json();
    if (!res.ok) { errBox.textContent = data.msg || 'Registration failed.'; return; }
    setSession(data.token, data.company);
  } catch (err) {
    errBox.textContent = 'Could not reach the server. Try again shortly.';
  } finally {
    setAuthBusy('registerSubmit', false);
  }
}

async function handleForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();
  const errBox = document.getElementById('authError');
  if (!email) { errBox.textContent = 'Enter your email.'; return; }

  setAuthBusy('forgotSubmit', true, 'Sending link…');
  try {
    const res = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) { errBox.textContent = data.msg || 'Something went wrong.'; return; }
    errBox.classList.add('success');
    errBox.textContent = data.msg;
  } catch (err) {
    errBox.classList.remove('success');
    errBox.textContent = 'Could not reach the server. Try again shortly.';
  } finally {
    setAuthBusy('forgotSubmit', false);
  }
}

let pendingResetToken = null;

async function handleResetPassword() {
  const password = document.getElementById('resetPassword').value;
  const confirm = document.getElementById('resetPasswordConfirm').value;
  const errBox = document.getElementById('authError');
  errBox.classList.remove('success');
  if (!password || password.length < 6) { errBox.textContent = 'Password must be at least 6 characters.'; return; }
  if (password !== confirm) { errBox.textContent = 'Passwords do not match.'; return; }
  if (!pendingResetToken) { errBox.textContent = 'Missing or expired reset link.'; return; }

  setAuthBusy('resetSubmit', true, 'Updating password…');
  try {
    const res = await fetch(`${BASE_URL}/auth/reset-password/${pendingResetToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) { errBox.textContent = data.msg || 'Could not reset password.'; return; }
    pendingResetToken = null;
    // Clean the token out of the URL so it can't be reused/resubmitted accidentally
    window.history.replaceState({}, document.title, window.location.pathname);
    showAuthTab('login');
    errBox.classList.add('success');
    errBox.textContent = 'Password updated! You can now log in.';
  } catch (err) {
    errBox.textContent = 'Could not reach the server. Try again shortly.';
  } finally {
    setAuthBusy('resetSubmit', false);
  }
}

function setSession(token, company) {
  authToken = token;
  authCompany = company;
  localStorage.setItem('vms_token', token);
  localStorage.setItem('vms_company', JSON.stringify(company));
  enterApp();
}

function handleLogout() {
  if (typeof resetAppSession === 'function') resetAppSession();
  authToken = null;
  authCompany = null;
  localStorage.removeItem('vms_token');
  localStorage.removeItem('vms_company');
  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
}

function enterApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appRoot').style.display = 'block';
  document.getElementById('companyLabel').textContent = authCompany ? `🏢 ${authCompany.name}` : '';
  if (typeof initializeApp === 'function') initializeApp();
}

// Every authenticated fetch should go through this so the token is always attached
// and an expired/invalid token bounces the user back to the login screen.
async function authFetch(url, options = {}) {
  const headers = Object.assign({}, options.headers, {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  });
  const res = await fetch(url, Object.assign({}, options, { headers }));
  if (res.status === 401) {
    handleLogout();
    throw new Error('Session expired, please log in again.');
  }
  return res;
}

document.addEventListener('DOMContentLoaded', () => {
  const enterActions = {
    loginPassword: handleLogin,
    regPassword: handleRegister,
    forgotEmail: handleForgotPassword,
    resetPasswordConfirm: handleResetPassword
  };
  Object.entries(enterActions).forEach(([id, action]) => {
    document.getElementById(id)?.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); action(); }
    });
  });
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('resetToken');
  if (resetToken) {
    pendingResetToken = resetToken;
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appRoot').style.display = 'none';
    showAuthTab('reset');
    return;
  }
  if (authToken && authCompany) {
    enterApp();
  }
});
