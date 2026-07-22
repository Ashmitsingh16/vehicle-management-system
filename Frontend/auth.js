const BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000/api'
  : 'https://vehicle-management-system-5sy7.onrender.com/api';

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
  document.getElementById('authError').textContent = '';
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('authError');
  if (!email || !password) { errBox.textContent = 'Enter email and password.'; return; }

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
  }
}

async function handleRegister() {
  const companyName = document.getElementById('regCompanyName').value.trim();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const password = document.getElementById('regPassword').value;
  const errBox = document.getElementById('authError');
  if (!companyName || !name || !email || !password) { errBox.textContent = 'Fill all fields.'; return; }
  if (password.length < 6) { errBox.textContent = 'Password must be at least 6 characters.'; return; }

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
  }
}

async function handleForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();
  const errBox = document.getElementById('authError');
  if (!email) { errBox.textContent = 'Enter your email.'; return; }

  try {
    const res = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) { errBox.textContent = data.msg || 'Something went wrong.'; return; }
    errBox.style.color = '#4ade80';
    errBox.textContent = data.msg;
  } catch (err) {
    errBox.style.color = '';
    errBox.textContent = 'Could not reach the server. Try again shortly.';
  }
}

let pendingResetToken = null;

async function handleResetPassword() {
  const password = document.getElementById('resetPassword').value;
  const confirm = document.getElementById('resetPasswordConfirm').value;
  const errBox = document.getElementById('authError');
  errBox.style.color = '';
  if (!password || password.length < 6) { errBox.textContent = 'Password must be at least 6 characters.'; return; }
  if (password !== confirm) { errBox.textContent = 'Passwords do not match.'; return; }
  if (!pendingResetToken) { errBox.textContent = 'Missing or expired reset link.'; return; }

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
    errBox.style.color = '#4ade80';
    errBox.textContent = 'Password updated! You can now log in.';
  } catch (err) {
    errBox.textContent = 'Could not reach the server. Try again shortly.';
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
