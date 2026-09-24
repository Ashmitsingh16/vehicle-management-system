const fs = require('node:fs');
const path = require('node:path');
const apiUrl = process.env.API_URL;
let url;
try { url = new URL(apiUrl); } catch { throw new Error('Set API_URL to the public HTTPS backend URL ending in /api'); }
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
    url.pathname !== '/api' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')) {
  throw new Error('API_URL must be a public HTTPS URL ending in /api');
}
const source = path.join(__dirname, '../Frontend');
const output = path.join(__dirname, '../dist');
fs.mkdirSync(output, { recursive: true });
// Explicit allowlist prevents copying backend files or secrets into the published site.
for (const file of ['index.html', 'app.js', 'auth.js']) fs.copyFileSync(path.join(source, file), path.join(output, file));
fs.writeFileSync(path.join(output, 'config.js'), `window.APP_CONFIG = Object.freeze(${JSON.stringify({ apiUrl })});\n`);
console.log('Frontend built in dist/');
