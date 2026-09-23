require('dotenv').config();
try { require('../config/production')({ ...process.env, NODE_ENV: 'production' }); console.log('Required production settings: present and structurally valid'); } catch (error) { console.error(error.message); process.exitCode = 1; }
const groups = {"email": ["GMAIL_USER", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"]};
for (const [name, keys] of Object.entries(groups)) { const missing = keys.filter(key => !process.env[key]); if (missing.length && !name.startsWith('optional ')) process.exitCode = 1; console.log(name + ': ' + (missing.length ? 'missing ' + missing.join(', ') : 'credentials present; live verification required')); }
// This check never connects to a database or provider and never prints secret values.
